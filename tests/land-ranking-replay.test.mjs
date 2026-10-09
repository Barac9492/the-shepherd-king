import test from 'node:test';
import assert from 'node:assert/strict';
import { replayLandRanking, LAND_VERSION, LAND_ACTS, LAND_MAX_EVENTS } from '../land-of-david/src/ranking-replay.js';
import * as A from '../land-of-david/src/adullam-logic.js';
import * as H from '../land-of-david/src/herut-logic.js';
import * as Z from '../land-of-david/src/ziklag-logic.js';
import * as B from '../land-of-david/src/hebron-logic.js';
import * as T from '../land-of-david/src/temple-logic.js';
import { generateAdullam } from '../land-of-david/src/adullam-world.js';
import { generateWilderness } from '../land-of-david/src/herut-world.js';
import { generateZiklag } from '../land-of-david/src/ziklag-world.js';
import { generateHebron } from '../land-of-david/src/hebron-world.js';
import { generateTemple } from '../land-of-david/src/temple-world.js';
import { createLandCollisions } from '../land-of-david/src/ranking-collisions.js';
import { canStep } from '../land-of-david/src/world.js';

const modules = [A, H, Z, B, T];
const generators = [generateAdullam, generateWilderness, generateZiklag, generateHebron, generateTemple];
const creators = ['createAdullam', 'createHerut', 'createZiklag', 'createHebron', 'createTemple'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const payload = (events) => ({ version: LAND_VERSION, events });

// Route on the actual generated terrain rather than the existing logic tests'
// straight-line bots (which can cross walls). No arbitrary teleports/state edits.
function navigator(w, D) {
  let key = '', route = [];
  const tile = (p) => [Math.round(p.x + w.W / 2), Math.round(p.z + w.H / 2)];
  return (target, speed, dt, revision = 0) => {
    D.moving = false;
    if (!target) return;
    const [ti, tj] = tile(target), nextKey = `${ti},${tj},${revision}`;
    if (key !== nextKey || !route.length) {
      key = nextKey;
      const [si, sj] = tile(D), start = w.idx(si, sj);
      const parents = new Int32Array(w.W * w.H).fill(-1), queue = [start]; parents[start] = start;
      let best = start, bestD = Infinity;
      for (let n = 0; n < queue.length; n++) {
        const k = queue[n], i = k % w.W, j = Math.floor(k / w.W), d = Math.hypot(i - (target.x + w.W / 2), j - (target.z + w.H / 2));
        if (d < bestD) { best = k; bestD = d; }
        if (d < 0.45) break;
        for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const ni = i + di, nj = j + dj;
          if (!w.inb(ni, nj)) continue;
          const nk = w.idx(ni, nj);
          if (parents[nk] !== -1 || !canStep(w, i, j, ni, nj)) continue;
          parents[nk] = k; queue.push(nk);
        }
      }
      route = [];
      for (let k = best; k !== start; k = parents[k]) route.push({ x: k % w.W - w.W / 2, z: Math.floor(k / w.W) - w.H / 2 });
      route.push({ x: si - w.W / 2, z: sj - w.H / 2 }); route.reverse();
    }
    while (route.length && dist(D, route[0]) < 1e-10) route.shift();
    const goal = route[0];
    if (!goal) return;
    const d = dist(D, goal), step = Math.min(d, speed * dt);
    D.x += (goal.x - D.x) / d * step; D.z += (goal.z - D.z) / d * step; D.moving = true;
  };
}

export function fullRun(act, wrap = (logic) => logic, observe = () => {}) {
  const n = LAND_ACTS.indexOf(act), G = wrap(modules[n]), w = generators[n]();
  const L0 = act === 'herut' ? w.layout.stops : w.layout.stop || w.layout;
  const s = G[creators[n]](L0, 7, G.DEFAULT_CARRIED);
  const collisions = createLandCollisions(act, w);
  const initial = act === 'adullam' ? { x: L0.fire.x - 1.2, z: L0.fire.z + 1.4 } : act === 'herut' ? L0[0].entry : act === 'temple' ? L0.start : L0.entry;
  const D = { ...initial, moving: false }, events = []; let nav = navigator(w, D), seconds = 0;
  const done = () => act === 'adullam' ? s.phase === 'done' : s.act === 'done';
  const action = (name) => {
    const event = ['action', name, D.x, D.z, D.moving];
    const before = JSON.stringify([s.act, s.phase, s.robe, s.shares, s.givers?.length]);
    const result = G[name](s, D);
    if (result !== false && before !== JSON.stringify([s.act, s.phase, s.robe, s.shares, s.givers?.length])) events.push(event);
  };
  for (let tick = 0; tick < 50000 && !done(); tick++) {
    const dt = [0.05, 0.031, 0.047, 0.029][tick % 4];
    const L = s.layout; let target = null;
    if (act === 'adullam' || act === 'herut' || act === 'ziklag' || (act === 'hebron' && s.act === 'settle')) {
      if (s.phase === 'play') target = L.fire; // Legitimate low-score passive camp.
      else if (s.phase === 'gad') { if (s.gad.arrived) action(act === 'adullam' ? 'startLeaving' : act === 'herut' ? 'leaveStop' : 'answerCall'); }
      else if (s.phase === 'leaving') target = L.exit;
    }
    if (act === 'herut') {
      if (s.act === 'hide' || s.act === 'saul') target = L.cave;
      else if (s.act === 'robe') { target = s.saul; action('cutRobe'); }
      else if (s.act === 'ending') action('finish');
    }
    if (act === 'ziklag') {
      if (s.act === 'away') action('returnToZiklag');
      else if (s.act === 'burned') target = s.abiathar;
      else if (s.act === 'ephod') action('startPursuit');
      else if (s.act === 'pursue') target = L.ford;
      else if (s.act === 'egypt') target = s.carry ? s.egyptian : !s.fed.water ? L.brookWater : L.baggage;
      else if (s.act === 'egypt-up') action('startGuide');
      else if (s.act === 'guide') target = s.guide.there ? L.overlook : s.egyptian;
      else if (s.act === 'recovered') action('returnToBesor');
      else if (s.act === 'share') { if (s.carry) { target = s.people.find(p => p.status === 'staying' && !p.shared); action('giveShare'); } else target = L.spoil; }
      else if (s.act === 'ending') action('finish');
    }
    if (act === 'hebron') {
      if (s.act === 'judah') action('startTribes');
      else if (s.act === 'tribes') target = s.tribes.filter(q => q.status === 'waiting' || q.status === 'coming').sort((a,b) => dist(a,D)-dist(b,D))[0] || L.covenant;
      else if (s.act === 'covenant') action('goToZion');
      else if (s.act === 'zion') action('startBuild');
      else if (s.act === 'build') {
        const needy = s.crews.filter(c => c.status === 'building' && c.need), fol = B.following(s);
        if (s.carry === 'cedar') target = L.houseDrop;
        else if (s.carry && needy.some(c => c.need === s.carry)) target = needy.find(c => c.need === s.carry);
        else if (needy.length) target = needy[0].need === 'water' ? L.zionSpring : L.zionBasket;
        else if (fol.length && (fol.length >= 3 || !s.crews.some(c => c.status === 'camp')) && s.seg < 12) target = L.segSpots[s.seg];
        else if (s.hiram?.arrived && s.cedar < 3 && (s.seg >= 12 || B.builders(s).length >= 6)) target = L.caravan;
        else if (s.crews.some(c => c.status === 'camp') && s.seg < 12) target = s.crews.find(c => c.status === 'camp');
        else target = L.segSpots[Math.min(s.seg,11)];
      } else if (s.act === 'ending') action('finish');
    }
    if (act === 'temple') {
      if (s.act === 'palace') target = L.nathan;
      else if (s.act === 'nathan') action('night');
      else if (s.act === 'word') action('toSit');
      else if (s.act === 'sit') target = L.tentSpot;
      else if (s.act === 'sat') action('startPrepare');
      else if (s.act === 'prepare') {
        if (s.treasureGiven && !s.givers.length) action('callGivers');
        if (s.carry) target = L.yard;
        else if (!s.treasureGiven) target = L.treasury;
        else { const idle = s.crews.find(c => c.status === 'idle'); const lo = T.lowest(s); target = idle?.spot || (lo?.src ? s.crews.find(c => c.key === lo.src).spot : L.yard); }
      } else if (s.act === 'ready') target = L.buildRing;
      else if (s.act === 'refused') action('callSolomon');
      else if (s.act === 'solomon') target = s.solomon;
      else if (s.act === 'handed') action('finish');
    }
    if (done()) break;
    nav(target, 6.2 * (act === 'temple' ? T.davidSpeed(s) : 1), dt, collisions.revision);
    events.push(['step', dt, D.x, D.z, D.moving]); seconds += dt;
    G.step(s, dt, { david: D });
    if (s.teleport) { Object.assign(D, s.teleport); s.teleport = null; nav = navigator(w, D); }
    const drained = (act === 'temple' ? T : A).drainEvents(s);
    collisions.update(s, D, drained);
    observe({ s, D, w, events, drained });
  }
  assert.ok(done(), `${act}: bot incomplete ${s.act}/${s.phase} seg ${s.seg} at ${D.x},${D.z}`);
  return { input: payload(events), expected: { score: act === 'hebron' ? Math.round(s.buildT * 10) : act === 'temple' ? T.percent(s) : s.joined, activeMs: Math.round(seconds * 1000) } };
}

const runs = new Map();
for (const act of LAND_ACTS) test(`${act}: completed collision-aware variable-dt transcript replays exactly`, () => {
  const run = fullRun(act); runs.set(act, run);
  assert.deepEqual(replayLandRanking(act, run.input), run.expected);
  assert.deepEqual(replayLandRanking(act, JSON.parse(JSON.stringify(run.input))), run.expected);
});

test('strict schema, nonfinite values, invalid actions and movement rejected', () => {
  const L = generateAdullam().layout, x = L.fire.x - 1.2, z = L.fire.z + 1.4;
  const good = ['step', 0.01, x, z, false];
  for (const input of [null, {}, payload([]), { ...payload([good]), score: 999 }, { version: 'bad', events: [good] }, payload([['step', NaN, x, z, false]]), payload([['step', Infinity, x, z, false]]), payload([['step', 0.051, x, z, false]]), payload([['step', -1, x, z, false]]), payload([['step', 0.01, NaN, z, false]]), payload([['step', 0.01, x, z, 1]]), payload([['step', 0.01, x, z, false, 1]]), payload([['action', 'finish', x, z, false]]), payload([['action', 'startLeaving', x, z, false]]), payload([['action', 'constructor', x, z, false]]), payload([['action', 'startLeaving', x+1, z, false]]), payload([['step', 0.01, x+10, z, true]]), payload([['step', 0, x+0.01, z, true]]), payload([['step', 0.05, x+0.1, z, false]]), payload(Array(LAND_MAX_EVENTS+1).fill(good))]) assert.throws(() => replayLandRanking('adullam', input), Error);
  assert.throws(() => replayLandRanking('__proto__', payload([good])), Error);
  assert.throws(() => replayLandRanking('adullam', payload([good])), /incomplete/);
});

test('completed transcripts reject truncation, trailing events and coordinate forgery', () => {
  for (const [act, {input}] of runs) {
    assert.throws(() => replayLandRanking(act, payload(input.events.slice(0,-1))), /incomplete/);
    assert.throws(() => replayLandRanking(act, payload([...input.events, input.events.at(-1)])), /after completion/);
    const copied = structuredClone(input), step = copied.events.find(e => e[0] === 'step'); step[2] += 10;
    assert.throws(() => replayLandRanking(act, copied), /movement/);
  }
});

test('zero dt and blocked moving=true are valid, and replay ignores no supplied score', () => {
  const { input, expected } = runs.get('adullam'), first = input.events[0];
  const L = generateAdullam().layout;
  const zero = ['step', 0, L.fire.x - 1.2, L.fire.z + 1.4, true];
  assert.deepEqual(replayLandRanking('adullam', payload([zero, ...input.events])), expected);
  assert.throws(() => replayLandRanking('adullam', { ...input, score: expected.score + 1 }), /payload/);
});

test('scripted teleport is not allowed before the next step, and repeat transitions fail', () => {
  for (const [act, name] of [['ziklag', 'returnToZiklag'], ['hebron', 'goToZion']]) {
    const { input } = runs.get(act), at = input.events.findIndex(e => e[0] === 'action' && e[1] === name);
    assert.ok(at > 0);
    const repeat = structuredClone(input); repeat.events.splice(at + 1, 0, [...repeat.events[at]]);
    assert.throws(() => replayLandRanking(act, repeat), /action/);
    const early = structuredClone(input), nextStep = early.events.findIndex((e,i) => i > at && e[0] === 'step');
    const world = act === 'ziklag' ? generateZiklag() : generateHebron();
    const destination = world.layout.stop[act === 'ziklag' ? 'returnSpot' : 'zionEntry'];
    early.events[nextStep][2] = destination.x; early.events[nextStep][3] = destination.z;
    assert.throws(() => replayLandRanking(act, early), /movement/);
  }
});

test('static collision, temple speed and active-duration ceilings are enforced', () => {
  // Find a valid position beside a solid probe tile, then forge a small legal-speed step into it.
  let forged = null, forgedAct = null;
  for (const act of LAND_ACTS) {
  const w = generators[LAND_ACTS.indexOf(act)](), {input} = runs.get(act);
  for (let n = 0; n < input.events.length && !forged; n++) {
    const e = input.events[n]; if (e[0] !== 'step') continue;
    for (const [dx,dz] of [[0.3,0],[-0.3,0],[0,0.3],[0,-0.3]]) {
      const i = Math.round(e[2]+w.W/2), j = Math.round(e[3]+w.H/2);
      const pi = Math.round(e[2]+dx+Math.sign(dx)*0.3+w.W/2), pj = Math.round(e[3]+dz+Math.sign(dz)*0.3+w.H/2);
      if ((pi !== i || pj !== j) && !canStep(w,i,j,pi,pj)) { forgedAct = act; forged = payload([...input.events.slice(0,n+1), ['step',0.05,e[2]+dx,e[3]+dz,true]]); break; }
    }
  }
  if (forged) break;
  }
  assert.ok(forged); assert.throws(() => replayLandRanking(forgedAct, forged), /collision/);
  const temple = runs.get('temple').input, at = temple.events.findIndex(e => e[0] === 'action' && e[1] === 'startPrepare');
  const prefix = temple.events.slice(0, at+1), last = prefix.at(-1);
  // Remain stationary while David ages, then demand young-David running speed.
  const age = Array.from({length:1000}, () => ['step',0.05,last[2],last[3],false]);
  assert.throws(() => replayLandRanking('temple', payload([...prefix,...age,['step',0.05,last[2]+0.31,last[3],true]])), /movement/);
  const L = generateAdullam().layout;
  assert.throws(() => replayLandRanking('adullam', payload(Array.from({length:36001}, () => ['step',0.05,L.fire.x-1.2,L.fire.z+1.4,false]))), /duration/);
});

test('actual renderer recorder produces replayable complete transcripts for all five acts', async () => {
  const { createLandRecorder } = await import('../land-of-david/src/ranking-session.js');
  for (const act of LAND_ACTS) {
    let submitted = null;
    const recorder = createLandRecorder({ act, attemptId: 'a'.repeat(48), onComplete: p => { submitted = p; }, onFail: message => assert.fail(message) });
    const { input, expected } = fullRun(act, recorder.wrap);
    await Promise.resolve();
    assert.ok(submitted, `${act}: recorder completed`);
    assert.equal(submitted.attemptId, 'a'.repeat(48));
    assert.deepEqual(submitted.events, input.events, `${act}: capture order and full precision`);
    assert.deepEqual(replayLandRanking(act, { version: submitted.version, events: submitted.events }), expected);
  }
});

test('newly built Hebron walls reject a speed-legal shortcut that static terrain permits', () => {
  const base = generateHebron(); let attack = null, wallIndex = null;
  const wallTiles = new Set(base.features.segments.flatMap(sg => sg.tiles.map(t => base.idx(t.i,t.j))));
  fullRun('hebron', undefined, ({s,D,w,events}) => {
    if (attack || s.act !== 'build' || s.seg === 0) return;
    for (const [dx,dz] of [[0.3,0],[-0.3,0],[0,0.3],[0,-0.3]]) {
      const i=Math.round(D.x+w.W/2),j=Math.round(D.z+w.H/2);
      const pi=Math.round(D.x+dx+Math.sign(dx)*0.3+w.W/2),pj=Math.round(D.z+dz+Math.sign(dz)*0.3+w.H/2),k=w.idx(pi,pj);
      if ((pi!==i||pj!==j) && wallTiles.has(k) && !base.blocked[k] && w.blocked[k] && canStep(base,i,j,pi,pj)) {
        attack = payload([...events,['step',0.05,D.x+dx,D.z+dz,true]]); wallIndex=k; break;
      }
    }
  });
  assert.ok(attack, 'fixture reaches a newly built wall');
  assert.equal(base.blocked[wallIndex],0,'generator alone allows this shortcut');
  assert.throws(() => replayLandRanking('hebron',attack), /collision/);
});

test('tent creation uses exact renderer indices, guards, ownership and pack/burn timing', () => {
  for (const act of ['adullam','herut','ziklag','hebron']) {
    const n=LAND_ACTS.indexOf(act),w=generators[n](),L0=act==='herut'?w.layout.stops:w.layout.stop||w.layout;
    const s=modules[n][creators[n]](L0,7,modules[n].DEFAULT_CARRIED),L=s.layout,c=createLandCollisions(act,w);
    const baseline=w.blocked.slice(); const first=L.tentSpots[0];
    s.joined=400;s.t=100;s.stopT=100;
    const near={x:first.i-w.W/2,z:first.j-w.H/2};
    if(act!=='adullam') {c.update(s,near);assert.deepEqual(w.blocked,baseline,'never pitch on David');}
    const far={x:1000,z:1000};c.update(s,far);
    const independentlyExpected=baseline.slice();
    for(const spot of L.tentSpots){const i=act==='adullam'?spot.i:Math.round(spot.i),j=act==='adullam'?spot.j:Math.round(spot.j);for(let dj=-1;dj<=0;dj++)for(let di=-1;di<=1;di++)independentlyExpected[w.idx(i+di,j+dj)]=1;}
    assert.deepEqual(w.blocked,independentlyExpected,`${act}: renderer-identical cells`);
    const revision=c.revision;c.update(s,far);assert.equal(c.revision,revision,'paused frame is idempotent');
    if(act==='herut'){s.phase='leaving';assert.deepEqual(w.blocked,independentlyExpected,'action alone does not pack');c.update(s,far);assert.deepEqual(w.blocked,baseline,'packing preserves pre-existing solid cells');}
    if(act==='ziklag'){s.act='burned';c.update(s,far);assert.deepEqual(w.blocked,independentlyExpected,'burn waits for event handler');c.update(s,far,[{type:'burned'}]);assert.deepEqual(w.blocked,baseline,'burn clears only tent-owned cells');}
  }
});

test('Hebron newly built wall tiles defer independently for David and crews then settle', () => {
  const w=generateHebron(),s=B.createHebron(w.layout.stop,7,B.DEFAULT_CARRIED),c=createLandCollisions('hebron',w);
  const tiles=w.features.segments[0].tiles.filter(t=>!w.blocked[w.idx(t.i,t.j)]);
  assert.ok(tiles.length>=2);const [a,b]=tiles;
  const D={x:a.i-w.W/2,z:a.j-w.H/2};s.crews=[{x:b.i-w.W/2,z:b.j-w.H/2}];s.act='build';
  c.update(s,D,[{type:'segment',order:0}]);
  assert.equal(w.blocked[w.idx(a.i,a.j)],0);assert.equal(w.blocked[w.idx(b.i,b.j)],0);
  const far={x:1000,z:1000};c.update(s,far);assert.equal(w.blocked[w.idx(a.i,a.j)],1);assert.equal(w.blocked[w.idx(b.i,b.j)],0);
  s.crews=[];c.update(s,far);assert.equal(w.blocked[w.idx(b.i,b.j)],1);
});
