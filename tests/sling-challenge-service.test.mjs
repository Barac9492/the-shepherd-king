import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED, createChallengeState, challengeTarget, fireChallengeShot } from '../src/sling-challenge-core.js';
import { createChallengeService, InMemoryChallengeStore, validateInitials } from '../server/challenge-service.mjs';
import { createChallengeHttpHandler } from '../server/challenge-http.mjs';

function fixture(options = {}) {
  let time = 1700000000000, random = 0;
  const store = new InMemoryChallengeStore();
  const service = createChallengeService({ store, clock: () => time,
    randomBytes: n => Buffer.alloc(n, ++random), ...options });
  return { service, store, move: ms => { time += ms; }, now: () => time };
}
function play(seed, hits = 1) {
  const state = createChallengeState({ seed }), shots = [];
  for (let i = 0; i < hits + 3; i++) {
    const atMs = 200 + i * 300;
    let direction = [0, 1, 0];
    if (i < hits) {
      const v = challengeTarget(state, atMs).position.map((n, j) => n - CHALLENGE_RULES.cameraOrigin[j]);
      direction = v.map(n => n / Math.hypot(...v));
    }
    const shot = { atMs, direction, heldMs: 200 };
    shots.push(shot); fireChallengeShot(state, shot);
  }
  return { shots, endedAtMs: state.activeMs };
}
async function qualified(f, hits = 1) {
  const { attempt } = await f.service.createAttempt();
  const transcript = play(attempt.seed, hits); f.move(transcript.endedAtMs);
  const finish = await f.service.finishAttempt(attempt.id, transcript);
  return { attempt, transcript, finish };
}
const code = expected => error => error.code === expected;

test('empty local record, unpredictable-shaped server identity and expiry metadata, no online eligibility', async () => {
  const f = fixture(); const empty = await f.service.getRecord();
  assert.equal(empty.record, null); assert.equal(empty.mode, 'local-mock'); assert.equal(empty.onlineEligible, false);
  const { attempt } = await f.service.createAttempt();
  assert.match(attempt.id, /^[a-f0-9]{48}$/); assert.match(attempt.seed, /^[a-f0-9]{32}$/);
  assert.equal(Date.parse(attempt.expiresAt), attempt.expiresAtMs); assert.equal(attempt.expiresAtMs - f.now(), 1800000);
  const other = await f.service.createAttempt(); assert.notEqual(other.attempt.id, attempt.id); assert.equal(other.attempt.seed, attempt.seed); assert.equal(attempt.seed, CHALLENGE_COURSE_SEED); assert.equal(attempt.version,'sling-challenge-v2');
});
test('replays scores, requires consent, only one global record, idempotent identical finalization and submission', async () => {
  const f = fixture(); const { attempt, transcript, finish } = await qualified(f, 2);
  assert.equal(finish.qualifies, true); assert.equal(finish.result.hits, 2);
  assert.deepEqual(await f.service.finishAttempt(attempt.id, transcript), finish);
  await assert.rejects(f.service.submitRecord(attempt.id, { initials: 'ABC', publicConsent: false }), code('public_consent_required'));
  const payload = { initials: 'ABC', publicConsent: true };
  const submitted = await f.service.submitRecord(attempt.id, payload);
  assert.equal(submitted.accepted, true); assert.equal(submitted.record.score, finish.result.score);
  assert.deepEqual(await f.service.submitRecord(attempt.id, payload), submitted);
  assert.equal((await f.service.getRecord()).record.initials, 'ABC');
  assert.equal(f.store.attempts.get(attempt.id).finish.shots, undefined, 'does not persist raw input transcript');
  await assert.rejects(f.service.submitRecord(attempt.id, { initials: 'XYZ', publicConsent: true }), code('attempt_conflict'));
  const changed = structuredClone(transcript); changed.shots[0].heldMs = 199;
  await assert.rejects(f.service.finishAttempt(attempt.id, changed), code('attempt_conflict'));
});
test('rejects claimed totals, client seed, nonterminal, malformed and oversized transcripts', async () => {
  const f = fixture(); const { attempt } = await f.service.createAttempt(); f.move(600000);
  const transcript = play(attempt.seed);
  for (const key of ['score', 'hits', 'seed', 'onlineEligible'])
    await assert.rejects(f.service.finishAttempt(attempt.id, { ...transcript, [key]: 99999 }), code('invalid_transcript'));
  await assert.rejects(f.service.finishAttempt(attempt.id, { shots: [], endedAtMs: 100 }), code('attempt_incomplete'));
  await assert.rejects(f.service.finishAttempt(attempt.id, { ...transcript, shots: Array(63).fill(transcript.shots[0]) }), code('invalid_transcript'));
  for (const bad of [NaN, Infinity, -1, 600001, '1000'])
    await assert.rejects(f.service.finishAttempt(attempt.id, { ...transcript, endedAtMs: bad }), code('invalid_transcript'));
  const malformed = structuredClone(transcript); malformed.shots[0].direction = [0, 0, 10000];
  await assert.rejects(f.service.finishAttempt(attempt.id, malformed), code('invalid_direction'));
  await assert.rejects(f.service.finishAttempt(attempt.id, { shots: [null], endedAtMs: 1000 }), code('invalid_transcript'));
  await assert.rejects(f.service.submitRecord(attempt.id, { initials: 'ABC', publicConsent: true }), code('attempt_unverified'));
});
test('server wall time rejects immediate fabricated terminal replay; pause accepted without active-time penalty', async () => {
  const f = fixture(); const { attempt } = await f.service.createAttempt(); const transcript = play(attempt.seed);
  await assert.rejects(f.service.finishAttempt(attempt.id, transcript), code('future_timing'));
  f.move(transcript.endedAtMs + 5 * 60000);
  const finish = await f.service.finishAttempt(attempt.id, transcript);
  assert.equal(finish.qualifies, true); assert.equal(finish.result.activeMs, transcript.endedAtMs);
});
test('zero-score attempts never qualify; ties lose, including a racing pair of former qualifiers', async () => {
  const f = fixture(); const zero = await qualified(f, 0); assert.equal(zero.finish.qualifies, false);
  await assert.rejects(f.service.submitRecord(zero.attempt.id, { initials: 'ABC', publicConsent: true }), code('not_qualified'));
  const a = await qualified(f, 1), b = await qualified(f, 1);
  assert.equal(a.finish.result.score, b.finish.result.score); assert.equal(b.finish.qualifies, true);
  const outcomes = await Promise.all([
    f.service.submitRecord(a.attempt.id, { initials: 'AAA', publicConsent: true }),
    f.service.submitRecord(b.attempt.id, { initials: 'BBB', publicConsent: true }),
  ]);
  assert.deepEqual(outcomes.map(item => item.accepted), [true, false]);
  assert.equal(outcomes[1].reason, 'record_changed'); assert.equal(outcomes[1].record.initials, 'AAA');
  const c = await qualified(f, 1); assert.equal(c.finish.qualifies, false);
});
test('atomic compare-and-set preserves highest score across concurrent winner submissions', async () => {
  const f = fixture(); const low = await qualified(f, 1), high = await qualified(f, 4), middle = await qualified(f, 2);
  const results = await Promise.all([
    f.service.submitRecord(high.attempt.id, { initials: 'TOP', publicConsent: true }),
    f.service.submitRecord(low.attempt.id, { initials: 'LOW', publicConsent: true }),
    f.service.submitRecord(middle.attempt.id, { initials: 'MID', publicConsent: true }),
  ]);
  assert.deepEqual(results.map(r => r.accepted), [true, false, false]);
  assert.equal((await f.service.getRecord()).record.score, high.finish.result.score);
  assert.equal((await f.service.getRecord()).record.initials, 'TOP');
});
test('initials are strictly three uppercase ASCII, offensive abbreviations rejected, no markup accepted', () => {
  assert.equal(validateInitials('ABC'), 'ABC');
  for (const value of ['', 'AB', 'ABCD', 'abc', 'A B', '<b>', '한글명', 'ＡＢＣ', 'A1B', 'ABC\n', null])
    assert.throws(() => validateInitials(value), code('invalid_initials'));
  for (const value of ['ASS', 'FUK', 'KKK', 'NIG', 'WTF']) assert.throws(() => validateInitials(value), code('blocked_initials'));
});
test('expires unfinished/verified attempts, bounds memory, throttles issuance and resets rate windows', async () => {
  const f = fixture({ limits: { maxAttempts: 1 }, rateLimits: { create: { count: 2, windowMs: 1000 } } });
  const { attempt } = await f.service.createAttempt();
  await assert.rejects(f.service.createAttempt(), code('server_busy'));
  await assert.rejects(f.service.createAttempt(), code('rate_limited'));
  f.move(1800000);
  await assert.rejects(f.service.finishAttempt(attempt.id, play(attempt.seed)), code('attempt_expired'));
  const fresh = await f.service.createAttempt(); assert.notEqual(fresh.attempt.id, attempt.id);
  assert.equal(f.store.attempts.size, 1);
  const qualifiedFixture = fixture(); const verified = await qualified(qualifiedFixture); qualifiedFixture.move(1800000);
  await assert.rejects(qualifiedFixture.service.submitRecord(verified.attempt.id, { initials: 'ABC', publicConsent: true }), code('attempt_expired'));
});
test('bounds client buckets and all endpoint rates; does not let rejected mutations poison the lock', async () => {
  const f = fixture({ limits: { maxClients: 1 }, rateLimits: { read: { count: 1, windowMs: 1000 } } });
  await f.service.getRecord({ clientKey: 'a' });
  await assert.rejects(f.service.getRecord({ clientKey: 'a' }), code('rate_limited'));
  await assert.rejects(f.service.getRecord({ clientKey: 'b' }), code('server_busy'));
  f.move(600001); assert.equal((await f.service.getRecord({ clientKey: 'b' })).record, null);
});
test('unknown attempt IDs and tampered cadence are rejected', async () => {
  const f = fixture(); await assert.rejects(f.service.finishAttempt('x', {}), code('attempt_not_found'));
  const { attempt } = await f.service.createAttempt(); f.move(3000);
  const transcript = play(attempt.seed); transcript.shots[1].atMs = 499;
  await assert.rejects(f.service.finishAttempt(attempt.id, transcript), code('shot_cadence'));
});

test('local HTTP adapter covers empty/success/errors, same-origin, JSON and request size with no cookies', async t => {
  const f = fixture(); const handler = createChallengeHttpHandler({ service: f.service, enabled: true, maxBodyBytes: 1024 });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, payload, headers = {}) => fetch(base + '/api/sling-challenge' + route,
    payload === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const empty = await request('/record'); assert.equal(empty.status, 200); assert.equal((await empty.json()).record, null);
  assert.equal(empty.headers.get('cache-control'), 'no-store'); assert.equal(empty.headers.get('set-cookie'), null);
  const made = await request('/attempts', {}); assert.equal(made.status, 201); const { attempt } = await made.json();
  const transcript = play(attempt.seed); f.move(transcript.endedAtMs);
  const finish = await request(`/attempts/${attempt.id}/finish`, transcript); assert.equal(finish.status, 200);
  assert.equal((await finish.json()).qualifies, true);
  const posted = await request(`/attempts/${attempt.id}/record`, { initials: 'ABC', publicConsent: true });
  assert.equal(posted.status, 200); assert.equal((await posted.json()).accepted, true);
  assert.equal((await request('/attempts', {}, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await request('/attempts', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('/attempts', { seed: 'untrusted' })).status, 400);
  assert.equal((await request('/attempts', { padding: 'x'.repeat(1100) })).status, 413);
  assert.equal((await request('/attempts')).status, 405);
  assert.equal((await request('/unknown')).status, 404);
  assert.equal((await fetch(base + '/api/sling-challenge/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.ok([...f.store.rates.keys()].every(key => !key.includes('127.0.0.1')));
});
test('HTTP adapter stays inactive without explicit enable and rejects non-loopback peers', async () => {
  const disabled = createChallengeHttpHandler({ enabled: false });
  assert.equal(await disabled({ url: '/api/sling-challenge/record' }, {}), false);
  let status, body;
  const enabled = createChallengeHttpHandler({ enabled: true });
  assert.equal(await enabled({ url: '/api/sling-challenge/record', socket: { remoteAddress: '192.0.2.1' }, headers: {} }, {
    writeHead: value => { status = value; }, end: value => { body = JSON.parse(value); },
  }), true);
  assert.equal(status, 403); assert.equal(body.error.code, 'local_only');
});

test('local verifier refuses attempts retained from older rules',async()=>{
  const f=fixture();const {attempt}=await f.service.createAttempt();const transcript=play(attempt.seed);f.move(transcript.endedAtMs);
  f.store.attempts.get(attempt.id).version='sling-challenge-v1';
  await assert.rejects(f.service.finishAttempt(attempt.id,transcript),code('unsupported_version'));
});
