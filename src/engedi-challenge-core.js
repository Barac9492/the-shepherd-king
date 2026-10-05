/** Local prototype v1: integer arithmetic, fixed 10 ms ticks, no DOM or RNG.
 * Three-decimal display is formatting, not a claim of 1 ms input precision.
 * Input changes apply at the next tick; a replay can use {tick, speed} events.
 */
export const ENGEDI_RULES = Object.freeze({ version: 'engedi-v1', tickMs: 10, length: 1000000, alertLimit: 100000, maxTicks: 12000, maxGapMs: 250 });
export const ENGEDI_KNOTS = Object.freeze([[180000, 270000], [490000, 580000], [760000, 850000]].map(Object.freeze));
export const isTightThread = progress => ENGEDI_KNOTS.some(([a, b]) => progress >= a && progress < b);
export function createEngediState() { return { version: ENGEDI_RULES.version, status: 'playing', tick: 0, progress: 0, alert: 0, speed: 0, reason: null }; }
export function stepEngedi(state, speed) {
  if (!Number.isInteger(speed) || speed < 0 || speed > 100) throw new RangeError('speed must be an integer from 0 to 100');
  if (state.status !== 'playing') return state;
  state.tick++; state.speed = speed;
  const tight = isTightThread(state.progress);
  // Slow cutting recovers alert even in knots; stopping recovers much faster.
  const alertDelta = speed === 0 ? -240 : speed <= 40 ? -60 : (speed - 40) * (tight ? 5 : 2);
  state.alert = Math.max(0, Math.min(ENGEDI_RULES.alertLimit, state.alert + alertDelta));
  if (speed) state.progress = Math.min(ENGEDI_RULES.length, state.progress + 140 + speed * 5);
  // Alert wins a simultaneous finish. Rest still consumes every elapsed tick.
  if (state.alert >= ENGEDI_RULES.alertLimit) { state.status = 'failed'; state.reason = 'noticed'; }
  else if (state.progress >= ENGEDI_RULES.length) state.status = 'success';
  else if (state.tick >= ENGEDI_RULES.maxTicks) { state.status = 'failed'; state.reason = 'timeout'; }
  return state;
}
export function invalidateEngedi(state, reason = 'interrupted') {
  if (state?.status === 'playing') { state.status = 'invalid'; state.reason = reason; state.speed = 0; }
}
export const formatEngediTime = tick => (tick * ENGEDI_RULES.tickMs / 1000).toFixed(3);
/** Advances only complete ticks. Never drops elapsed time to improve a record. */
export function createEngediClock(state, now, onStep = () => {}) {
  let last = now, remainder = 0;
  return { maxGapMs:0, advance(at, speed) {
    const delta = at - last; last = at; this.maxGapMs=Math.max(this.maxGapMs,delta);
    if (!Number.isFinite(delta) || delta < 0 || delta > ENGEDI_RULES.maxGapMs) { invalidateEngedi(state, 'frame-gap'); return; }
    remainder += delta;
    while (remainder >= ENGEDI_RULES.tickMs && state.status === 'playing') { onStep(state.tick+1,speed); stepEngedi(state, speed); remainder -= ENGEDI_RULES.tickMs; }
  } };
}
