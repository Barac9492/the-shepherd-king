# Sling challenge prototype: local rules and backend boundary

## Status and safe preview

This is a **local-only reference implementation**, not a deployed global leaderboard. It creates no account, database, credentials, remote resources or network integration. The service accepts only its in-memory store. Restarting the preview clears every mock attempt and record. The mock must never be described as an online or global record.

- Normal static hosting has no challenge API. Offline practice remains playable and never acquires record eligibility.
- `CHALLENGE_MOCK=1 npm run dev` opts into the loopback mock for review. The HTTP adapter additionally rejects non-loopback peers. The environment flag is not a production-backend implementation.
- The preview server must call `createChallengeHttpHandler()` before its static file handler, returning when it returns `true`.
- No account, real name, email, cookie, analytics ID or login is needed. Initials should be a three-letter alias, not a request to disclose a real name.
- A future real global record needs an authorized deployment and persistent transactional storage. The SQL file next to this document is a **not-executed design reference**, not a migration or provisioned service.

## Current rules

The executable core now uses **sling-challenge-v2** and one shared course. See [the v2 rules and upgrade](SLING_CHALLENGE_V2_UPGRADE.md) for the normative difficulty/score/version contract. The v1 numeric examples below are retained as the original prototype design history; do not use them to submit v2 scores. The first-time three-target tutorial is separate from scored practice: no timer, life loss, API attempt or record submission.

## Shared deterministic core (original v1 design)

`src/sling-challenge-core.js` is browser-safe, dependency-free, and does not call the network or wall clock.

```js
const state = createChallengeState({ seed, attemptId, onlineEligible: false });
const events = advanceChallenge(state, Math.floor(activeMs));
const target = challengeTarget(state); // null when ended
const shot = { atMs: Math.floor(activeMs), direction: [dx, dy, dz], heldMs };
const outcome = fireChallengeShot(state, shot);
if (outcome.accepted) transcript.push(shot);
const result = challengeResult(state);
```

The state is mutable. Do not read future target geometry and assume that advances time: advance before rendering. `advanceChallenge` returns timeout/end events. `fireChallengeShot` returns `{ accepted, hit, events, reason? }`; accepted misses are part of the transcript. Invalid data throws `ChallengeInputError` with `code`. The UI must filter unready releases before calling fire. Local cadence/overlapping-charge rejections consume no shot or life. They must not enter the transcript.

Fields: `activeMs`, `round`, `roundStartedAtMs`, `roundDeadlineMs`, `score`, `hits`, `lives`, `shots`, `lastShotAtMs`, `status: 'playing' | 'ended'`, and `endReason: null | 'lives' | 'completed' | 'time-limit'`.

`challengeTarget` returns `{ position: [x,y,z], radius, speed, budgetMs, round, timeLeftMs }`. Its single moving sphere stays within x = ±5, y = 2..4.4, z = -14..-8. Targets are deterministic by seed, round and active elapsed time. Hit testing is ray/sphere intersection at release, from `[0, 2.8, 10]`. Cosmetic stone animation must not award a second hit or determine the result. Players aim by yaw/pitch, with movement locked in this mode.

Rules v1:

- Three lives. A miss loses a life without resetting the round timer
- A timeout loses a life and resets the same round's timer and target motion
- A hit advances the round and resets its timer
- 60 successful rounds or 600,000 active milliseconds ends play, with at most 62 accepted shots
- Every round linearly reduces radius from 1.12 to 0.25 and time budget from 11,000ms to 2,500ms, and increases angular motion speed from 0.38 to 2.30
- Every accepted shot is fixed strength; holding longer grants no power bonus
- Readiness requires `heldMs > 1000/6`, matching charge 0.3 at 1.8 charge units/second in the existing sling
- Accepted shots must be at least 300ms apart; their charge periods cannot overlap
- `atMs` is an integer; `heldMs` may be finite fractional milliseconds, with 1ms rounding grace on its start bounds
- A hit earns `100 + 25 * (round - 1) + floor(500 * timeLeftMs / budgetMs)` points
- At an exact deadline, timeout processing precedes shot processing
- Pausing freezes the active clock. Resuming clears stale pointer/charge state in the UI. Server issue time and expiry continue during a pause

Submit the exact terminal `state.activeMs`, not a later frame timestamp. Timeout catch-up can end the attempt before the frame timestamp supplied to `advanceChallenge`.

## HTTP contract

All responses include `mode: 'local-mock'` and `onlineEligible: false`. Successes also include `recordScope: 'local-mock'`. API responses use `Cache-Control: no-store` and contain no cookies. All POSTs require `Content-Type: application/json`, a bounded JSON body and a same-origin request. No CORS permission is granted.

### GET /api/sling-challenge/record

```json
{"mode":"local-mock","onlineEligible":false,"recordScope":"local-mock","record":null}
```

Nonempty record: `{ initials, score, hits, round, activeMs, recordedAt }`. The timestamp is ISO 8601. The public projection deliberately excludes attempt identifiers, seeds, IP data and transcripts. There is exactly one current highest record, no list of players.

The client needs distinct loading, loaded-empty, loaded-record and unavailable states. A 404 on a static deployment means records are unavailable; it does not mean the global record is empty. A fetch failure must not silently substitute a local record as a global one.

### POST /api/sling-challenge/attempts

Request `{}`. The service rejects client-specified seeds or scores. Response (201):

```js
{ mode, onlineEligible, recordScope,
  attempt: { id, seed, version, issuedAt, expiresAt, issuedAtMs, expiresAtMs } }
```

The service uses cryptographically random 192-bit attempt IDs and 128-bit seeds. The attempt is valid for 30 minutes of server wall time. The ID acts as an unguessable single-attempt capability; it must not appear in public records or analytics. If attempt issuance fails, offer explicit offline practice using its own generated seed. Never promote a practice transcript into a server-issued attempt.

### POST /api/sling-challenge/attempts/:id/finish

Request `{ shots: [{ atMs, direction: [dx,dy,dz], heldMs }], endedAtMs }`. No totals or additional fields are accepted. Response:

```js
{ mode, onlineEligible, recordScope, qualifies,
  result: { version, status, endReason, score, round, hits, lives, shots, activeMs }, record }
```

The server loads its own seed and replays every action. It rejects invalid/future/non-monotonic times, non-normalized or nonfinite direction, insufficient charge, overlapping charge, excessive cadence, transcript after terminal state, nonterminal results, altered schemas and active time beyond the wall-clock elapsed time plus 150ms grace. A pause is allowed because active time may be less than wall time. TTL bounds pause/submit delays.

Qualification is `score > 0 && score > currentRecord.score`. Ties lose. A qualified finish does not reserve the record. Exact repeated finalization is idempotent; changed finalization returns a conflict. The response to an identical repeated request preserves its original qualification snapshot. Current record state is available separately through GET.

### POST /api/sling-challenge/attempts/:id/record

Request `{ initials: 'ABC', publicConsent: true }`. Both fields are required. The server requires exactly three uppercase ASCII letters. It does not trim, coerce or silently change initials. A small explicit list of offensive abbreviations is rejected; it is a limited guardrail, not comprehensive moderation. The UI must use text-only rendering (`textContent`), a clear public-display consent checkbox, and server error feedback.

Response:

```js
{ mode, onlineEligible, recordScope, accepted,
  reason: 'recorded' | 'record_changed', record }
```

The service checks the finished score against the **current** highest record inside one atomic store transaction. If another attempt already won, it returns `accepted: false`, `reason: 'record_changed'` and the new record. It never overwrites a higher score or wins a tie. Identical submission retries return the same result; changed initials/consent for an already-used attempt are rejected. Expired attempts cannot finalize or submit even if an earlier step succeeded.

An idempotent accepted response confirms the original submission; another player may since have beaten it. Refresh GET when displaying the current record.

### Errors

```js
{ mode: 'local-mock', onlineEligible: false,
  error: { code, message, retryAfterMs? } }
```

- 400: malformed input, invalid initials/charge/direction/timing, unready/nonterminal transcript, missing consent
- 403: non-loopback peer or mismatched browser origin
- 404: absent endpoint or unknown attempt
- 405: wrong HTTP method; 408: incomplete request timeout
- 409: changed duplicate, unverified attempt or nonqualifier submission
- 410: expired known attempt (already-cleaned attempts may be 404)
- 413: body larger than 24,576 bytes; 415: non-JSON POST
- 429: rate limit, with `Retry-After` header and `retryAfterMs`
- 503: local capacity/clock problem; 500: generic unexpected service failure

Show recoverable errors without discarding the completed local result. A failed finalization may be retried with exactly the same transcript while the attempt remains unexpired. Expiry requires a new attempt; never rewrite an old attempt's seed or result.

## Rate limits, storage and privacy

Mock defaults per ephemeral client key:

- Issue: eight attempts per ten minutes
- Finish: 30 requests per minute
- Submit initials: 20 requests per minute
- Read record: 120 requests per minute

The HTTP adapter uses the socket address, not spoofable forwarded headers, as input to an HMAC with a fresh process secret. Only the digest is retained in rate buckets. There is no raw IP, user agent, fingerprint, cookie or account storage. The HMAC salt is never exposed. IPv4/IPv6 loopback connections may receive separate buckets; this is a local demonstration, not an abuse defense for an internet deployment.

Memory is bounded to 2,048 attempts and 4,096 rate buckets. Expiry is enforced on every attempt operation; expired entries are removed lazily on access or new attempt creation. Inactive rate buckets are lazily removed on requests. No background jobs are installed. A finish persists its canonical transcript hash and computed result, not the raw aiming transcript. The mock record lasts only until server restart.

## What validation does and does not establish

Validation proves that a bounded transcript is consistent with the issued seed, timing limits and deterministic rules. It prevents trusting a supplied score, a forged target size, speed or hit count, impossible cadence, immediate future-time submissions, repeated reuse with altered data, and simple winner races.

It **cannot prove a human played**. A client sees the seed and rules and can compute perfect directions, use automation, fabricate a plausible input stream and wait out the wall-clock check. It also cannot prove focus/pause honesty, stop distributed abuse or detect all offensive aliases. Do not market this as cheat-proof. A production threat model may require live server-timestamped input, replay/audit policy, graduated abuse controls and accessible human review; such changes still do not guarantee bot prevention.

A real backend must also pin rule versions for issued attempts, protect anonymous bearer attempt IDs, use bounded bodies before JSON parsing, configure trusted proxy identity correctly, enforce TLS/same-origin policy, protect secrets server-side and exclude private request data from logs. No browser database write credentials or direct client score-write path is appropriate.

## Persistent store contract for a future authorized backend

`InMemoryChallengeStore.transaction` serializes operations only within one Node process. Its prototype service deliberately refuses an alternate store so nobody can assume an unreviewed adapter is production-ready.

A real adapter must implement these **database-atomic** operations, not independent reads and writes:

1. Issue: insert collision-resistant ID, seed, rule version, issue and expiry timestamps
2. Finalize: lock the attempt, enforce expiry, replay with the server seed/rule version, verify elapsed wall time, store one fingerprint/result/qualification snapshot, or return the same result for an identical hash. Concurrent distinct transcripts must never both finalize
3. Submit: lock attempt then singleton record, validate consent and initials, recheck expiry/result, compare strictly-greater score, update record and save the attempt's immutable submission response in the **same transaction**
4. Identical submission retries after network uncertainty return the committed response; different submissions conflict. Response and write must commit or roll back together
5. Reads return only the public current-record projection. Public clients cannot insert/update attempts, validation outcomes, record scores or qualification flags directly
6. TTL and abuse control must be shared across processes and regions. Use a trustworthy server clock and a cleanup/retention policy

See `sling-challenge-persistence.sql` for the non-executed singleton schema and record compare-and-set reference. The SQL assumes trusted server finalization; it does not replace the replay verifier or configure roles, routes, hosting or rate limiting.

## Checks

```sh
node --test tests/sling-challenge-core.test.mjs tests/sling-challenge-service.test.mjs
npm test
```

Focused tests cover deterministic progression, hits/misses/timeouts, complete 60-round replay, pause semantics, malformed/future/premature/tampered transcripts, cadence, strict initials, public consent, expiry, bounded storage/rates, duplicate idempotence/conflicts, tie/score races, HTTP size/origin/content-type errors and explicit local-only activation. UI/browser and full story regression checks are separate responsibilities; these focused tests alone do not establish a complete product pass.

## Optional Supabase integration candidate

A disabled-by-default persistent adapter is now prepared separately from this unchanged loopback mock. See [Supabase setup draft and approval gates](SLING_CHALLENGE_SUPABASE.md). Its production HTTP paths use `/finish` and `/submit` with an `attemptId` in the JSON body, so capabilities do not appear in URLs. No live database or deployment is connected merely by including these files.
