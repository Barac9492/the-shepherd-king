/** Deterministic, dependency-free challenge rules shared by the browser and verifier.
 * Browser state is presentation only: the service always replays from its own seed.
 */
// Public course identifier, not a secret: every practice and ranked attempt uses it.
export const CHALLENGE_COURSE_SEED = '6f89c2a37d014bca9089e441bdd55276';
export const CHALLENGE_RULES = Object.freeze({
  version: 'sling-challenge-v2', lives: 3, maxRounds: 60, maxActiveMs: 600000,
  maxShots: 62, maxScore: 78300, maxTotalTimeBonus: 600, readyAfterMs: 1000 / 6, minShotIntervalMs: 300,
  cameraOrigin: Object.freeze([0, 2.8, 10]),
});

export class ChallengeInputError extends Error {
  constructor(code, message = code) { super(message); this.name = 'ChallengeInputError'; this.code = code; }
}
const fail = (code, message) => { throw new ChallengeInputError(code, message); };
const timeIsValid = n => Number.isSafeInteger(n) && n >= 0 && n <= CHALLENGE_RULES.maxActiveMs;
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return h >>> 0;
}

export function challengeDifficulty(round) {
  if (!Number.isSafeInteger(round) || round < 1 || round > CHALLENGE_RULES.maxRounds) fail('invalid_round');
  if (round <= 3) return { radius: 1.5, speed: 0, verticalAmplitude: 0, budgetMs: 12000, phase: 'stationary' };
  if (round <= 12) {
    const p = (round - 4) / 8;
    return { radius: 1.4 - 0.25 * p, speed: 0.25 + 0.45 * p, verticalAmplitude: 0,
      budgetMs: Math.round(11000 - 2000 * p), phase: 'horizontal' };
  }
  const p = (round - 13) / 47;
  return { radius: 1.12 - 0.87 * p, speed: 0.75 + 1.55 * p, verticalAmplitude: 0.15 + 1.05 * p,
    budgetMs: Math.round(8500 - 6000 * p), phase: 'advanced' };
}
export function createChallengeState({ seed = CHALLENGE_COURSE_SEED, attemptId = null, onlineEligible = false } = {}) {
  if (seed !== CHALLENGE_COURSE_SEED) fail('invalid_seed', 'Every attempt must use the shared v2 course');
  return {
    version: CHALLENGE_RULES.version, seed, attemptId, onlineEligible: onlineEligible === true,
    activeMs: 0, round: 1, roundStartedAtMs: 0, roundDeadlineMs: challengeDifficulty(1).budgetMs,
    score: 0, hits: 0, lives: CHALLENGE_RULES.lives, shots: 0,
    lastShotAtMs: null, status: 'playing', endReason: null,
  };
}

export function challengeTarget(state, atMs = state.activeMs) {
  if (!timeIsValid(atMs) || atMs < state.roundStartedAtMs) fail('invalid_time');
  if (state.status !== 'playing') return null;
  const difficulty = challengeDifficulty(state.round);
  const phase = hash(`${state.seed}:${state.round}`) / 0x100000000 * Math.PI * 2;
  const t = (atMs - state.roundStartedAtMs) / 1000;
  const stationary = [[0, 2.8, -10], [-3, 3.2, -11], [3, 3.2, -11]];
  return {
    position: state.round <= 3 ? [...stationary[state.round - 1]] : [
      Math.sin(phase + t * difficulty.speed) * 5,
      3.2 + Math.sin(phase * 0.7 + t * difficulty.speed * 0.69) * difficulty.verticalAmplitude,
      -11 - Math.cos(phase * 1.3) * 3],
    ...difficulty, round: state.round,
    timeLeftMs: Math.max(0, Math.min(state.roundDeadlineMs, CHALLENGE_RULES.maxActiveMs) - atMs),
  };
}
function end(state, reason, events) {
  state.status = 'ended'; state.endReason = reason;
  events.push({ type: 'ended', reason, atMs: state.activeMs, score: state.score });
}
/** Advance only active play time. A pause must not call this with wall-clock time. */
export function advanceChallenge(state, atMs) {
  if (!timeIsValid(atMs) || atMs < state.activeMs) fail('invalid_time', 'Active time must be a bounded, monotonic integer');
  const events = [];
  if (state.status !== 'playing') return events;
  while (state.status === 'playing' && state.roundDeadlineMs <= atMs && state.roundDeadlineMs <= CHALLENGE_RULES.maxActiveMs) {
    state.activeMs = state.roundDeadlineMs;
    state.lives--;
    events.push({ type: 'timeout', atMs: state.activeMs, round: state.round, lives: state.lives });
    if (state.lives === 0) { end(state, 'lives', events); break; }
    state.roundStartedAtMs = state.activeMs;
    state.roundDeadlineMs = state.activeMs + challengeDifficulty(state.round).budgetMs;
  }
  if (state.status === 'playing') {
    state.activeMs = atMs;
    if (atMs === CHALLENGE_RULES.maxActiveMs) end(state, 'time-limit', events);
  }
  return events;
}
export function validateChallengeShot(shot) {
  if (!shot || typeof shot !== 'object' || Array.isArray(shot) ||
      Object.keys(shot).some(key => !['atMs', 'direction', 'heldMs'].includes(key))) fail('invalid_shot');
  if (!timeIsValid(shot.atMs) || !Number.isFinite(shot.heldMs) ||
      shot.heldMs <= CHALLENGE_RULES.readyAfterMs || shot.heldMs > shot.atMs + 1) fail('invalid_charge');
  if (!Array.isArray(shot.direction) || shot.direction.length !== 3 ||
      !shot.direction.every(Number.isFinite)) fail('invalid_direction');
  if (!Number.isFinite(Math.hypot(...shot.direction)) || Math.abs(Math.hypot(...shot.direction) - 1) > 1e-6) fail('invalid_direction', 'Direction must be normalized');
}
function rayHits(position, radius, direction) {
  const origin = CHALLENGE_RULES.cameraOrigin;
  const v = position.map((n, i) => n - origin[i]);
  const length = Math.hypot(...direction);
  const along = v.reduce((sum, n, i) => sum + n * direction[i] / length, 0);
  if (along <= 0) return false;
  return v.reduce((sum, n) => sum + n * n, 0) - along * along <= radius * radius + 1e-8;
}
/** Too-fast or overlapping-charge releases return accepted:false. Never record them. */
export function fireChallengeShot(state, shot) {
  validateChallengeShot(shot);
  if (shot.atMs < state.activeMs) fail('invalid_time');
  if (state.lastShotAtMs !== null && shot.atMs - state.lastShotAtMs < CHALLENGE_RULES.minShotIntervalMs)
    return { accepted: false, hit: false, events: [], reason: 'shot_cadence' };
  if (state.lastShotAtMs !== null && shot.atMs - shot.heldMs < state.lastShotAtMs - 1)
    return { accepted: false, hit: false, events: [], reason: 'overlapping_charge' };
  const events = advanceChallenge(state, shot.atMs);
  if (state.status !== 'playing') return { accepted: false, hit: false, events, reason: 'attempt_ended' };
  if (state.shots >= CHALLENGE_RULES.maxShots) fail('too_many_shots');
  const target = challengeTarget(state);
  const hit = rayHits(target.position, target.radius, shot.direction);
  state.lastShotAtMs = shot.atMs; state.shots++;
  if (hit) {
    const points = 1000 + (state.round - 1) * 10 + Math.floor(10 * target.timeLeftMs / target.budgetMs);
    state.score += points; state.hits++;
    events.push({ type: 'hit', atMs: shot.atMs, round: state.round, points, score: state.score, position: target.position });
    if (state.round === CHALLENGE_RULES.maxRounds) end(state, 'completed', events);
    else {
      state.round++; state.roundStartedAtMs = shot.atMs;
      state.roundDeadlineMs = shot.atMs + challengeDifficulty(state.round).budgetMs;
      events.push({ type: 'round', atMs: shot.atMs, round: state.round });
    }
  } else {
    state.lives--;
    events.push({ type: 'miss', atMs: shot.atMs, lives: state.lives });
    if (state.lives === 0) end(state, 'lives', events);
  }
  return { accepted: true, hit, events };
}
export function challengeResult(state) {
  return { version: state.version, status: state.status, endReason: state.endReason,
    score: state.score, round: state.round, hits: state.hits, lives: state.lives,
    shots: state.shots, activeMs: state.activeMs };
}
/** No claimed score, hit count, seed or eligibility is accepted from the transcript. */
export function replayChallenge({ seed, shots, endedAtMs }) {
  if (!Array.isArray(shots) || shots.length > CHALLENGE_RULES.maxShots || !timeIsValid(endedAtMs)) fail('invalid_transcript');
  const state = createChallengeState({ seed });
  for (const shot of shots) {
    if (!shot || shot.atMs > endedAtMs) fail('invalid_transcript');
    const result = fireChallengeShot(state, shot);
    if (!result.accepted) fail(result.reason);
  }
  advanceChallenge(state, endedAtMs);
  if (state.status !== 'ended') fail('attempt_incomplete', 'The attempt must have ended under the challenge rules');
  if (state.activeMs !== endedAtMs) fail('invalid_end_time', 'Use the terminal active time returned by the core');
  return challengeResult(state);
}
