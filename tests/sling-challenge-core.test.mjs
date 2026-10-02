import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_RULES, createChallengeState, challengeDifficulty, challengeTarget,
  advanceChallenge, fireChallengeShot, challengeResult, replayChallenge } from '../src/sling-challenge-core.js';
const create = () => createChallengeState({ seed: 'test-seed' });
function aim(state, atMs) {
  const vector = challengeTarget(state, atMs).position.map((n, i) => n - CHALLENGE_RULES.cameraOrigin[i]);
  const length = Math.hypot(...vector);
  return { atMs, heldMs: 200, direction: vector.map(n => n / length) };
}
const miss = atMs => ({ atMs, heldMs: 200, direction: [0, 1, 0] });

test('same seed/timeline deterministically reproduces moving target and stricter progression', () => {
  const a = create(), b = create();
  assert.deepEqual(challengeTarget(a, 400), challengeTarget(b, 400));
  assert.notDeepEqual(challengeTarget(a, 400).position, challengeTarget(a, 900).position);
  assert.notDeepEqual(challengeTarget(a, 400), challengeTarget(createChallengeState({ seed: 'other' }), 400));
  for (let round = 2; round <= 60; round++) {
    const prev = challengeDifficulty(round - 1), next = challengeDifficulty(round);
    assert.ok(next.radius < prev.radius); assert.ok(next.speed > prev.speed); assert.ok(next.budgetMs < prev.budgetMs);
  }
});
test('fixed-power ready shot hits from fixed origin, scores and advances one round', () => {
  const state = create(); const shot = aim(state, 200);
  const outcome = fireChallengeShot(state, shot);
  assert.equal(outcome.accepted, true); assert.equal(outcome.hit, true);
  assert.equal(state.round, 2); assert.equal(state.hits, 1); assert.equal(state.lives, 3); assert.ok(state.score > 100);
  const longer = create(); fireChallengeShot(longer, { ...shot, heldMs: 200.25 });
  assert.equal(longer.score, state.score);
});
test('three misses end attempt and canonical replay matches; no extra shots accepted', () => {
  const state = create(), shots = [miss(200), miss(500), miss(800)];
  for (const shot of shots) fireChallengeShot(state, shot);
  assert.equal(state.status, 'ended'); assert.equal(state.endReason, 'lives');
  assert.deepEqual(replayChallenge({ seed: state.seed, shots, endedAtMs: 800 }), challengeResult(state));
  assert.throws(() => replayChallenge({ seed: state.seed, shots: [...shots, miss(1100)], endedAtMs: 1100 }), /attempt_ended/);
});
test('timeouts catch up consistently, exact deadline precedes a shot, pause consumes no active time', () => {
  const state = create();
  assert.equal(advanceChallenge(state, 0).length, 0); assert.equal(state.lives, 3);
  assert.equal(advanceChallenge(state, 11000)[0].type, 'timeout'); assert.equal(state.lives, 2);
  assert.equal(state.round, 1); assert.equal(state.roundStartedAtMs, 11000);
  advanceChallenge(state, 11000); assert.equal(state.lives, 2);
  const events = advanceChallenge(state, 50000);
  assert.equal(state.activeMs, 33000); assert.equal(state.lives, 0); assert.equal(events.at(-1).type, 'ended');
  assert.equal(replayChallenge({ seed: state.seed, shots: [], endedAtMs: 33000 }).score, 0);
  assert.throws(() => replayChallenge({ seed: state.seed, shots: [], endedAtMs: 33001 }), /terminal active time/);
  const edge = create(); assert.equal(fireChallengeShot(edge, miss(11000)).accepted, true); assert.equal(edge.lives, 1);
});
test('successful replay stops at 60 rounds with bounded transcript', () => {
  const state = create(), shots = [];
  for (let i = 0; i < 60; i++) { const shot = aim(state, 200 + i * 300); shots.push(shot); fireChallengeShot(state, shot); }
  assert.equal(state.status, 'ended'); assert.equal(state.endReason, 'completed'); assert.equal(state.hits, 60);
  assert.deepEqual(replayChallenge({ seed: state.seed, shots, endedAtMs: state.activeMs }), challengeResult(state));
  assert.throws(() => replayChallenge({ seed: state.seed, shots: Array(63).fill(miss(200)), endedAtMs: 800 }));
});
test('rejects numbers, charge, direction, timestamps, claimed results and premature endings', () => {
  for (const bad of [NaN, Infinity, -1, 1.2, 600001]) assert.throws(() => advanceChallenge(create(), bad));
  for (const direction of [[NaN, 0, 1], [Infinity, 0, 1], [0, 0, 0], [1, 1, 1], [0, 0], Array(3), 'x'])
    assert.throws(() => fireChallengeShot(create(), { ...miss(200), direction }));
  for (const heldMs of [0, 1000 / 6, -1, NaN, Infinity, 202])
    assert.throws(() => fireChallengeShot(create(), { ...miss(200), heldMs }));
  assert.throws(() => fireChallengeShot(create(), { ...miss(200), score: 9999 }));
  assert.throws(() => replayChallenge({ seed: 's', shots: [], endedAtMs: 1000 }), /must have ended/);
  assert.throws(() => replayChallenge({ seed: 's', shots: [miss(500)], endedAtMs: 200 }));
  const state = create(); advanceChallenge(state, 300); assert.throws(() => fireChallengeShot(state, miss(200)));
});
test('enforces 300ms cadence and non-overlapping charge without recording rejected releases', () => {
  const state = create(); fireChallengeShot(state, miss(200));
  assert.equal(fireChallengeShot(state, miss(499)).reason, 'shot_cadence'); assert.equal(state.shots, 1);
  assert.equal(fireChallengeShot(state, { ...miss(600), heldMs: 500 }).reason, 'overlapping_charge');
  assert.equal(fireChallengeShot(state, miss(500)).accepted, true);
});
