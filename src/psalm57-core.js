// Pure rules for Psalm 57 scene 1 ("날개 그늘"), v2: a 2D platformer on the cave wall.
// No DOM, no randomness. Wall units: u runs left->right (0..48), y runs up (0..14).
// Feet position (u, y). Two torches patrol the cave mouth; each casts a disc of light on the wall.
// Exposed = inside a light disc and not sheltered from that torch -> back to the crack.

export const WALL = Object.freeze({ length: 48, height: 14 });
export const TICK = 1 / 60;

export const PHYS = Object.freeze({ run: 5, airAccel: 32, gravity: 40, jump: 13.5, coyote: 0.1, buffer: 0.12, halfW: 0.3, bodyH: 1.8 });

// One-way platforms (land from above). The verse is carved along them.
export const PLATFORMS = Object.freeze([
  { id: 'ground', u0: 0, u1: 10.5, y: 1.5 },     // floor band, broken in the middle
  { id: 'ground2', u0: 30.5, u1: 48, y: 1.5 },
  { id: 'p1', u0: 3.0, u1: 9.0, y: 3.5 },
  { id: 'p2', u0: 10.0, u1: 15.0, y: 5.5 },
  { id: 'p3', u0: 15.8, u1: 22.5, y: 7.5 },
  { id: 'wings', u0: 23.5, u1: 29.5, y: 5.0 },
  { id: 'p5', u0: 44.5, u1: 46.2, y: 3.4 },
  { id: 'p6', u0: 46.2, u1: 48, y: 5.2 },
]);

const LANDING_ORDER = [...PLATFORMS].sort((a, b) => b.y - a.y);
export const START = Object.freeze({ u: 1.2, y: 1.5 });
// Between the two floor pieces the plaster has fallen away; dropping below FALL_Y returns you to the crack.
export const GAP = Object.freeze({ u0: 10.5, u1: 30.5 });
export const FALL_Y = -1;
export const EXIT = Object.freeze({ u: 47, platform: 'p6' });

export const LIGHT = Object.freeze({ y: 3.0, radius: 3.6 });
export const TORCHES = Object.freeze([
  { id: 'A', min: -4, max: 52, speed: 6 },   // walks the whole cave mouth
  { id: 'B', min: 28, max: 48, speed: 5 },   // keeps watch over the right side
]);

export const CRACK = Object.freeze({ u0: 0, u1: 2.2, yMax: 6 });
export const WINGS = Object.freeze({ u0: 24.0, u1: 29.2, yMin: 4.9, yMax: 8.5 });
// The clay jar stands on the cave floor in front of the wall. Its shadow is a shelter on the ground band.
export const JAR_SLOTS = Object.freeze([6, 20, 37]);
export const JAR = Object.freeze({ shift: 0.25, half: 1.1, yMax: 1.6 });

const period = (T) => 2 * (T.max - T.min) / T.speed;
export const TORCH_PERIODS = Object.freeze(TORCHES.map(period));

export function torchAt(T, t, phase = 0) {
  const P = period(T), span = T.max - T.min;
  const p = (((t + phase) % P) + P) % P;
  const d = p * T.speed;
  return d <= span ? { u: T.min + d, dir: 1 } : { u: T.max - (d - span), dir: -1 };
}

/** Centre of the jar's shadow on the wall for a torch at torchU (the shadow slides opposite the torch). */
export const jarShadowU = (jarU, torchU) => jarU + (jarU - torchU) * JAR.shift;

/** Which shelter (if any) protects the player at (u, y) from a torch at torchU. */
export function shelterFrom(u, y, torchU, jarU) {
  if (u >= CRACK.u0 && u <= CRACK.u1 && y <= CRACK.yMax) return 'crack';
  if (u >= WINGS.u0 && u <= WINGS.u1 && y >= WINGS.yMin && y <= WINGS.yMax) return 'wings';
  if (jarU != null && y <= JAR.yMax && Math.abs(u - jarShadowU(jarU, torchU)) <= JAR.half) return 'jar';
  return null;
}

export const inLight = (u, y, torchU) => Math.hypot(u - torchU, y + PHYS.bodyH / 2 - LIGHT.y) < LIGHT.radius;

export const DEFAULT_PHASES = Object.freeze([
  // A starts at u = 20 heading left (sweeps over the crack first); B starts at its left end.
  period(TORCHES[0]) - (20 - TORCHES[0].min) / TORCHES[0].speed,
  0,
]);

export function createState({ phases = DEFAULT_PHASES, jarSlot = 0 } = {}) {
  return {
    t: 0, phases: [...phases], jarSlot, mode: 'play',
    u: START.u, y: START.y, vx: 0, vy: 0, ground: 'ground', coyote: 0, buffer: 0, cut: false, facing: 1,
    caught: 0, hides: { crack: 0, wings: 0, jar: 0 }, _lit: [null, null], acc: 0, jumpHeldPrev: false,
  };
}

export const cloneState = (s) => ({ ...s, phases: [...s.phases], hides: { ...s.hides }, _lit: [...s._lit] });
export const jarU = (s) => JAR_SLOTS[s.jarSlot];
export const torchesAt = (s) => TORCHES.map((T, i) => torchAt(T, s.t, s.phases[i]));

function resetToCrack(s) {
  s.u = START.u; s.y = START.y; s.vx = 0; s.vy = 0; s.ground = 'ground'; s.coyote = 0; s.buffer = 0; s.cut = false;
}

/** input: { dir: -1|0|1, jump: boolean (held) }. Returns events. */
export function step(s, input, dt) {
  const events = [];
  if (s.mode !== 'play') return events;
  s.acc += Math.min(dt, 0.25);
  while (s.acc >= TICK && s.mode === 'play') {
    s.acc -= TICK;
    tick(s, input || {}, events);
  }
  return events;
}

function tick(s, input, events) {
  s.t += TICK;
  const dir = Math.sign(input.dir || 0);
  const held = !!input.jump;
  if (held && !s.jumpHeldPrev) s.buffer = PHYS.buffer;
  s.jumpHeldPrev = held;
  if (dir) s.facing = dir;

  if (s.ground) s.vx = dir * PHYS.run;
  else {
    const dv = dir * PHYS.run - s.vx, maxDv = PHYS.airAccel * TICK;
    s.vx += Math.max(-maxDv, Math.min(maxDv, dv));
  }
  if (s.buffer > 0 && (s.ground || s.coyote > 0)) {
    s.vy = PHYS.jump; s.ground = null; s.coyote = 0; s.buffer = 0; s.cut = false;
    events.push({ type: 'jump' });
  }
  s.buffer = Math.max(0, s.buffer - TICK);
  if (!held && s.vy > 0 && !s.cut) { s.vy *= 0.5; s.cut = true; }

  s.u = Math.min(WALL.length - PHYS.halfW, Math.max(PHYS.halfW, s.u + s.vx * TICK));
  if (s.ground) {
    const P = PLATFORMS.find((p) => p.id === s.ground);
    if (s.u + PHYS.halfW < P.u0 || s.u - PHYS.halfW > P.u1) { s.ground = null; s.coyote = PHYS.coyote; s.vy = 0; }
  } else {
    s.coyote = Math.max(0, s.coyote - TICK);
    const prevY = s.y;
    s.vy -= PHYS.gravity * TICK;
    s.y += s.vy * TICK;
    if (s.vy <= 0) {
      for (const P of LANDING_ORDER) { // highest first, so overlapping ledges always resolve to the upper one
        if (prevY >= P.y - 1e-6 && s.y <= P.y && s.u + PHYS.halfW >= P.u0 && s.u - PHYS.halfW <= P.u1) {
          s.y = P.y; s.vy = 0; s.ground = P.id; s.cut = false;
          events.push({ type: 'land', platform: P.id });
          break;
        }
      }
    }
  }

  const ju = jarU(s);
  let exposed = false;
  TORCHES.forEach((T, i) => {
    const tu = torchAt(T, s.t, s.phases[i]).u;
    if (!inLight(s.u, s.y, tu)) { s._lit[i] = null; return; }
    const sh = shelterFrom(s.u, s.y, tu, ju);
    if (!sh) { exposed = true; return; }
    if (s._lit[i] !== sh) { s._lit[i] = sh; s.hides[sh]++; events.push({ type: 'hidden', shelter: sh, torch: T.id }); }
  });
  if (exposed) {
    s.caught++; resetToCrack(s); s._lit = [null, null];
    events.push({ type: 'caught' });
    return;
  }
  if (s.y < FALL_Y) {
    s.fell = (s.fell || 0) + 1; resetToCrack(s); s._lit = [null, null];
    events.push({ type: 'fell' });
    return;
  }
  if (s.ground === EXIT.platform && s.u >= EXIT.u) { s.mode = 'won'; events.push({ type: 'won' }); }
}

/** Run a policy (state -> input) until win, first catch or timeout. */
export function simulate(policy, { phases = DEFAULT_PHASES, jarSlot = 0, maxSeconds = 120, state = null } = {}) {
  const s = state ? cloneState(state) : createState({ phases, jarSlot });
  const t0 = s.t;
  while (s.t - t0 < maxSeconds) {
    const ev = step(s, policy(s), TICK);
    if (ev.some((e) => e.type === 'caught' || e.type === 'fell')) return { result: ev.find((e) => e.type === 'caught' || e.type === 'fell').type, t: s.t, state: s };
    if (s.mode === 'won') return { result: 'won', t: s.t, state: s };
  }
  return { result: 'timeout', t: s.t, state: s };
}
