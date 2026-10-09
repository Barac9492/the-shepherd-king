// Authoritative replay of renderer inputs, never of submitted scores or storage.
import * as A from './adullam-logic.js';
import * as H from './herut-logic.js';
import * as Z from './ziklag-logic.js';
import * as B from './hebron-logic.js';
import * as T from './temple-logic.js';
import { generateAdullam } from './adullam-world.js';
import { generateWilderness } from './herut-world.js';
import { generateZiklag } from './ziklag-world.js';
import { generateHebron } from './hebron-world.js';
import { generateTemple } from './temple-world.js';
import { canStep } from './world.js';
import { createLandCollisions } from './ranking-collisions.js';

export const LAND_VERSION = 'land-top10-v1';
export const LAND_ACTS = Object.freeze(['adullam', 'herut', 'ziklag', 'hebron', 'temple']);
export const ACTION_NAMES = Object.freeze({
  adullam: Object.freeze(['startLeaving']),
  herut: Object.freeze(['leaveStop', 'cutRobe', 'finish']),
  ziklag: Object.freeze(['answerCall', 'returnToZiklag', 'startPursuit', 'startGuide', 'returnToBesor', 'giveShare', 'finish']),
  hebron: Object.freeze(['startTribes', 'goToZion', 'startBuild', 'finish']),
  temple: Object.freeze(['night', 'toSit', 'startPrepare', 'callGivers', 'callSolomon', 'finish']),
});
export const LAND_MAX_EVENTS = 108000;
export const LAND_MAX_ACTIVE_MS = 1800000;
export const LAND_MAX_BYTES = 4 * 1024 * 1024; // Also enforce on the raw HTTP body before parsing.
const fail = (reason) => { throw new Error(`Invalid land replay: ${reason}`); };
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const EPS = 1e-9;

function setup(act) {
  switch (act) {
    case 'adullam': { const w = generateAdullam(), L = w.layout; return [w, A, A.createAdullam(L, 7), { x: L.fire.x - 1.2, z: L.fire.z + 1.4 }]; }
    case 'herut': { const w = generateWilderness(), L = w.layout.stops; return [w, H, H.createHerut(L, 7, H.DEFAULT_CARRIED), L[0].entry]; }
    case 'ziklag': { const w = generateZiklag(), L = w.layout.stop; return [w, Z, Z.createZiklag(L, 7, Z.DEFAULT_CARRIED), L.entry]; }
    case 'hebron': { const w = generateHebron(), L = w.layout.stop; return [w, B, B.createHebron(L, 7, B.DEFAULT_CARRIED), L.entry]; }
    case 'temple': { const w = generateTemple(), L = w.layout; return [w, T, T.createTemple(L, 7), L.start]; }
  }
}

// Match tryMove's x-then-z, radius-0.3 probes against current frame topology.
function legalMove(w, from, to) {
  const ti = (x) => Math.round(x + w.W / 2), tj = (z) => Math.round(z + w.H / 2);
  if (!w.inb(ti(to.x), tj(to.z))) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  let i = ti(from.x), j = tj(from.z);
  if (dx) { const p = ti(to.x + Math.sign(dx) * 0.3); if (p !== i && !canStep(w, i, j, p, j)) return false; }
  i = ti(to.x);
  if (dz) { const p = tj(to.z + Math.sign(dz) * 0.3); if (p !== j && !canStep(w, i, j, i, p)) return false; }
  return true;
}

function actionAllowed(act, name, s) {
  if (!ACTION_NAMES[act].includes(name)) return false;
  if (['startLeaving', 'leaveStop', 'answerCall'].includes(name))
    return s.phase === 'gad' && s.gad?.arrived === true && (act !== 'ziklag' || s.act === 'build');
  if (name === 'finish') return s.act === (act === 'temple' ? 'handed' : 'ending');
  if (name === 'callGivers') return s.act === 'prepare' && s.treasureGiven && s.givers.length === 0;
  const stages = { cutRobe: 'robe', returnToZiklag: 'away', startPursuit: 'ephod', startGuide: 'egypt-up', returnToBesor: 'recovered', giveShare: 'share', startTribes: 'judah', goToZion: 'covenant', startBuild: 'zion', night: 'nathan', toSit: 'word', startPrepare: 'sat', callSolomon: 'refused' };
  return s.act === stages[name];
}
const actionState = (s) => JSON.stringify([s.phase, s.act, s.robe, s.shares, s.givers?.length]);

export function replayLandRanking(act, input) {
  if (!LAND_ACTS.includes(act)) fail('act');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 ||
      !Object.hasOwn(input, 'version') || !Object.hasOwn(input, 'events') || input.version !== LAND_VERSION ||
      !Array.isArray(input.events) || !input.events.length || input.events.length > LAND_MAX_EVENTS) fail('payload');
  const [world, logic, s, initial] = setup(act);
  const collisions = createLandCollisions(act, world);
  let position = { ...initial }, seconds = 0;
  const done = () => act === 'adullam' ? s.phase === 'done' : s.act === 'done';
  for (const e of input.events) {
    if (done()) fail('event after completion');
    if (!Array.isArray(e) || e.length !== 5 || !finite(e[2]) || !finite(e[3]) || typeof e[4] !== 'boolean') fail('event');
    const D = { x: e[2], z: e[3], moving: e[4] };
    if (e[0] === 'step') {
      const dt = e[1];
      if (!finite(dt) || dt < 0 || dt > 0.05) fail('dt');
      seconds += dt;
      if (seconds > LAND_MAX_ACTIVE_MS / 1000 + EPS) fail('duration');
      const distance = Math.hypot(D.x - position.x, D.z - position.z);
      const speed = 6.2 * (act === 'temple' ? T.davidSpeed(s) : 1);
      if (distance > speed * dt + EPS || (!D.moving && distance !== 0) || (dt === 0 && distance !== 0)) fail('movement');
      if (!legalMove(world, position, D)) fail('collision');
      logic.step(s, dt, { david: D });
      position = { x: D.x, z: D.z };
      // A transition action may have queued this before this step. The renderer
      // still moves/steps at the old position once, THEN applies the teleport.
      if (s.teleport) { position = { x: s.teleport.x, z: s.teleport.z }; s.teleport = null; }
      const events = (act === 'temple' ? T : A).drainEvents(s);
      collisions.update(s, position, events);
    } else if (e[0] === 'action') {
      if (typeof e[1] !== 'string' || D.x !== position.x || D.z !== position.z || !actionAllowed(act, e[1], s)) fail('action');
      const before = actionState(s);
      const result = logic[e[1]](s, D);
      if (result === false || actionState(s) === before) fail('no-op action');
      // Do not drain here: renderer handlers process these on the next step.
    } else fail('event type');
  }
  if (!done()) fail('incomplete');
  const score = act === 'hebron' ? Math.round(s.buildT * 10) : act === 'temple' ? T.percent(s) : s.joined;
  if (!Number.isSafeInteger(score) || score < (act === 'hebron' ? 1 : 0) || score > (act === 'temple' ? 100 : act === 'hebron' ? 18000 : 10000)) fail('score');
  return { score, activeMs: Math.round(seconds * 1000) };
}
