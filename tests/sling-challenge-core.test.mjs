import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED, createChallengeState, challengeDifficulty, challengeTarget,
  advanceChallenge, fireChallengeShot, challengeResult, replayChallenge } from '../src/sling-challenge-core.js';
const create = () => createChallengeState();
function aim(state, atMs) {
  const vector = challengeTarget(state, atMs).position.map((n, i) => n - CHALLENGE_RULES.cameraOrigin[i]);
  const length = Math.hypot(...vector);
  return { atMs, heldMs: 200, direction: vector.map(n => n / length) };
}
const miss = atMs => ({ atMs, heldMs: 200, direction: [0, 1, 0] });

test('all attempts share one course and three stationary introductory targets', () => {
  const a = create(), b = createChallengeState({seed:CHALLENGE_COURSE_SEED,attemptId:'another'});
  assert.equal(a.version,'sling-challenge-v2');
  assert.deepEqual(challengeTarget(a,400),challengeTarget(b,400));
  assert.throws(()=>createChallengeState({seed:'other'}),/shared v2 course/);
  for(let round=1;round<=3;round++) {
    a.round=round;
    assert.deepEqual(challengeTarget(a,400).position,challengeTarget(a,900).position);
    assert.equal(challengeDifficulty(round).phase,'stationary');assert.equal(challengeDifficulty(round).speed,0);
    assert.equal(challengeDifficulty(round).radius,1.5);
  }
});
test('horizontal targets precede progressively smaller faster targets with vertical movement', () => {
  const a=create();
  for(let round=4;round<=60;round++) {
    a.round=round;const first=challengeTarget(a,400),later=challengeTarget(a,900),next=challengeDifficulty(round),prev=challengeDifficulty(round-1);
    assert.notEqual(first.position[0],later.position[0]);
    if(round<=12){assert.equal(first.position[1],later.position[1]);assert.equal(next.phase,'horizontal');}
    else {assert.notEqual(first.position[1],later.position[1]);assert.equal(next.phase,'advanced');}
    assert.ok(next.radius<prev.radius);assert.ok(next.speed>prev.speed);assert.ok(next.budgetMs<prev.budgetMs);
  }
});
test('hit-count ranking dominates speed at every stage and total score is bounded',()=>{
  const base=hits=>1000*hits+10*hits*(hits-1)/2;
  for(let hits=0;hits<60;hits++) assert.equal(base(hits+1)-(base(hits)+10*hits),1000);
  assert.equal(base(60)+10*60,CHALLENGE_RULES.maxScore);
  assert.equal(CHALLENGE_RULES.maxScore,78300);assert.equal(CHALLENGE_RULES.maxTotalTimeBonus,600);
  const fast=create(),slow=create();let fastBonus=0,slowBonus=0;
  for(let i=0;i<60;i++) {
    const fastAt=fast.activeMs+(i===0?200:300),slowAt=slow.roundDeadlineMs-1;
    const f=fireChallengeShot(fast,aim(fast,fastAt)),s=fireChallengeShot(slow,aim(slow,slowAt));
    fastBonus+=f.events[0].points-(1000+i*10);slowBonus+=s.events[0].points-(1000+i*10);
    assert.ok(fast.score<=base(i+1)+10*(i+1));
    if(i>0)assert.ok(slow.score>base(i)+10*i,'one additional slow hit beats every possible prior-stage score');
  }
  assert.equal(slowBonus,0);assert.ok(fastBonus<=600);assert.ok(fast.score<=78300);
});
test('fixed-power ready shot hits from fixed origin, scores and advances one round', () => {
  const state = create(); const shot = aim(state, 200);
  const outcome = fireChallengeShot(state, shot);
  assert.equal(outcome.accepted, true); assert.equal(outcome.hit, true);
  assert.equal(state.round, 2); assert.equal(state.hits, 1); assert.equal(state.lives, 3); assert.ok(state.score > 1000);
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
  assert.equal(advanceChallenge(state, 12000)[0].type, 'timeout'); assert.equal(state.lives, 2);
  assert.equal(state.round, 1); assert.equal(state.roundStartedAtMs, 12000);
  advanceChallenge(state, 12000); assert.equal(state.lives, 2);
  const events = advanceChallenge(state, 50000);
  assert.equal(state.activeMs, 36000); assert.equal(state.lives, 0); assert.equal(events.at(-1).type, 'ended');
  assert.equal(replayChallenge({ seed: state.seed, shots: [], endedAtMs: 36000 }).score, 0);
  assert.throws(() => replayChallenge({ seed: state.seed, shots: [], endedAtMs: 36001 }), /terminal active time/);
  const edge = create(); assert.equal(fireChallengeShot(edge, miss(12000)).accepted, true); assert.equal(edge.lives, 1);
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
  assert.throws(() => replayChallenge({ seed: CHALLENGE_COURSE_SEED, shots: [], endedAtMs: 1000 }), /must have ended/);
  assert.throws(() => replayChallenge({ seed: CHALLENGE_COURSE_SEED, shots: [miss(500)], endedAtMs: 200 }));
  const state = create(); advanceChallenge(state, 300); assert.throws(() => fireChallengeShot(state, miss(200)));
});
test('enforces 300ms cadence and non-overlapping charge without recording rejected releases', () => {
  const state = create(); fireChallengeShot(state, miss(200));
  assert.equal(fireChallengeShot(state, miss(499)).reason, 'shot_cadence'); assert.equal(state.shots, 1);
  assert.equal(fireChallengeShot(state, { ...miss(600), heldMs: 500 }).reason, 'overlapping_charge');
  assert.equal(fireChallengeShot(state, miss(500)).accepted, true);
});
