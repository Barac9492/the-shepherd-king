// Pure rules for Psalm 57 scene 1 ("날개 그늘"). No DOM, no randomness.
// Wall coordinates: u runs along the wall (0 = left crevice, 48 = right end), in wall units.
// The torch light is a disc on the wall centred on torchU; a player who is inside it and not
// in a shadow zone is exposed and goes back to the crevice.

export const WALL = Object.freeze({ length: 48, height: 9, pathV: 6.25 });
export const SHELTERS = Object.freeze([
  { id: 'crevice', u0: 0, u1: 2.2 },   // start: the crack in the cave wall
  { id: 'wings', u0: 26.4, u1: 33.0 }, // painted wings over "주의 날개 그늘 아래에서"
]);
export const START_U = 1.0;
export const EXIT_U = 46.5;
export const PLAYER_SPEED = 4;      // wall units per second
export const LIGHT_RADIUS = 3.2;    // exposure radius in wall units
export const TORCH = Object.freeze({ min: -4, max: 52, speed: 5 });
export const TICK = 1 / 60;

const span = TORCH.max - TORCH.min;
const period = 2 * span / TORCH.speed;

/** Torch centre at time t. phase is seconds into the patrol cycle at t = 0.
 *  Cycle starts at TORCH.min heading right. */
export function torchAt(t, phase = 0) {
  const p = (((t + phase) % period) + period) % period;
  const d = p * TORCH.speed;
  return d <= span
    ? { u: TORCH.min + d, dir: 1 }
    : { u: TORCH.max - (d - span), dir: -1 };
}
export const TORCH_PERIOD = period;

/** Scene default: torch at u = 20 heading left, so on entry the light first sweeps over the
 *  crevice and the player sees that the crevice hides them. */
export const DEFAULT_PHASE = period - (20 - TORCH.min) / TORCH.speed;

export const shelterAt = (u) => SHELTERS.find((s) => u >= s.u0 && u <= s.u1) || null;

export function isExposed(u, torchU) {
  if (shelterAt(u)) return false;
  return Math.abs(u - torchU) < LIGHT_RADIUS;
}

export function createState({ phase = DEFAULT_PHASE } = {}) {
  return { t: 0, phase, u: START_U, mode: 'play', caught: 0, wingHides: 0, crevHides: 0, acc: 0, lit: false, _litShelter: null };
}

/** Advance by dt seconds with input dir in {-1, 0, 1}. Returns events for this call. */
export function step(state, dir, dt) {
  const events = [];
  if (state.mode !== 'play') return events;
  state.acc += Math.min(dt, 0.25);
  while (state.acc >= TICK && state.mode === 'play') {
    state.acc -= TICK;
    state.t += TICK;
    const d = Math.sign(dir || 0);
    state.u = Math.min(WALL.length, Math.max(0, state.u + d * PLAYER_SPEED * TICK));
    const torch = torchAt(state.t, state.phase);
    const shelter = shelterAt(state.u);
    // Count a hide when the light disc covers a sheltered player (once per pass).
    const covered = Math.abs(state.u - torch.u) < LIGHT_RADIUS;
    if (covered && shelter && state._litShelter !== shelter.id) {
      state._litShelter = shelter.id;
      if (shelter.id === 'wings') state.wingHides++; else state.crevHides++;
      events.push({ type: 'hidden', shelter: shelter.id });
    }
    if (!covered) state._litShelter = null;
    state.lit = isExposed(state.u, torch.u);
    if (state.lit) {
      state.caught++;
      state.u = START_U;
      state.lit = false;
      events.push({ type: 'caught' });
      continue;
    }
    if (state.u >= EXIT_U) {
      state.mode = 'won';
      events.push({ type: 'won' });
    }
  }
  return events;
}

/** Simulate a policy (state -> dir) until win, first catch, or timeout. Used by tests. */
export function simulate(policy, { phase = DEFAULT_PHASE, maxSeconds = 120 } = {}) {
  const s = createState({ phase });
  while (s.t < maxSeconds) {
    const ev = step(s, policy(s), TICK);
    if (ev.some((e) => e.type === 'caught')) return { result: 'caught', t: s.t, wingHides: s.wingHides };
    if (s.mode === 'won') return { result: 'won', t: s.t, wingHides: s.wingHides };
  }
  return { result: 'timeout', t: s.t, wingHides: s.wingHides };
}

/** True when moving right at full speed from u can reach the next shelter (or exit) before the
 *  light reaches the player. Simple lookahead used for the reference "careful" policy. */
export function safeToAdvance(state, targetU) {
  let u = state.u;
  let t = state.t;
  while (u < targetU) {
    t += TICK;
    u += PLAYER_SPEED * TICK;
    if (isExposed(Math.min(u, targetU), torchAt(t, state.phase).u)) return false;
  }
  return true;
}
