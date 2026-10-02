# Shared-course challenge v2: rules and applied upgrade

## Status

The reviewed v2 SQL was applied to the authorized game-only project on 2026-10-02 as `20261002113712_sling_challenge_shared_course_v2`. All 21 read-only postflight checks passed, including the unchanged preflight v1 record fingerprint, fixed-course/score constraints, exact RPC body, service-only privileges and RLS. Attempts and rate buckets remained empty; there are now two version-specific record rows. Advisors returned only expected INFO notices. No keys, hosting configuration, production deployment or existing record values were changed.

The approved/applied v1 setup draft stays byte-identical:

`docs/sling-challenge-supabase-setup.draft.sql`

SHA256: `b981f2cd7aa05b16439b74a14c0ea6b6d70f5311fe8b39e952c7b668b4493a22`

The separate proposal is `docs/sling-challenge-supabase-v2-upgrade.draft.sql`. It is a descriptive SQL draft, not an invented migration-history filename. Its exact SHA256 `3fbe1678e010a3d334b339c51914251316833c6250f03e6de14c45231ac5f365` was approved and applied only to `jdsjvrynmnzoztfinlzi`. Do not reapply it.

## Same course for every player

Rules version: `sling-challenge-v2`

Public fixed course identifier: `6f89c2a37d014bca9089e441bdd55276`, exported as `CHALLENGE_COURSE_SEED`. This value is not a secret. Practice and server-issued attempts use the same target positions, timing and progression. Attempts retain fresh, cryptographically random 192-bit capability IDs. Client-supplied seeds are never accepted; a different core seed is rejected, and the v2 database constraint also enforces the fixed course.

- Rounds 1–3: large stationary targets, radius 1.5, 12 seconds each
- Rounds 4–12: horizontal movement, radius 1.4→1.15, speed 0.25→0.70, budget 11→9 seconds
- Rounds 13–60: radius 1.12→0.25, speed 0.75→2.30, budget 8.5→2.5 seconds, gradually increasing vertical movement

The three lives, strict readiness threshold, 300ms cadence, maximum 62 accepted shots, 60 completed rounds and ten-minute active-time ceiling remain. A pause freezes active time but not the 30-minute server expiry. A miss costs a life without resetting the timer; a timeout costs a life and restarts the current round.

## Score prioritizes successful stages

Each hit scores:

`1000 + (round - 1) × 10 + floor(10 × remaining time / round budget)`

For N hits, the base score is `1000N + 5N(N−1)`. Total speed bonuses cannot exceed `10N`, at most 600 across all 60 rounds. The conservative whole-run bound is 78,300.

For every N from 0 to 59, the minimum score for N+1 hits exceeds the theoretical maximum score for N hits by exactly 1,000. One more successful stage therefore always outranks speed on fewer stages. Fast and last-millisecond complete replays, plus this inequality for every stage, are unit-tested. The 78,300 cap is conservative; readiness/cadence can make the theoretical maximum bonus unattainable.

## Exact database delta requiring approval

The upgrade is one transaction:

1. Replace the two rule-version CHECK constraints on attempts and highest_records so they permit v1 and v2
2. Add a v2-only fixed-course seed CHECK on attempts
3. Add a v2-only score ≤78,300 CHECK on highest_records
4. Insert one empty highest-record row for v2
5. Replace the existing public SECURITY INVOKER RPC, preserving its signature, fixed search path, lock timeout, quotas, TTL and atomicity
6. Reassert its existing PUBLIC/anon/authenticated EXECUTE revokes and service_role EXECUTE grant

No tables, roles, policies, extensions, indexes, secrets, Realtime objects, cron jobs, unrelated data or global defaults are added or changed. The original v1 highest record is retained unchanged and is never compared with a v2 score. Existing v1 attempts are not converted. The ordinary preexisting TTL cleanup still removes expired attempts.

The v2 RPC requires `version: 'sling-challenge-v2'` on every private input and includes the version on successful outputs. The server adapter verifies both. Old-version or missing-version requests fail closed after upgrade. The v2 adapter also fails closed against the unchanged v1 RPC before upgrade. This deliberately avoids exposing a misleading mixed-version board during rollout; practice can continue while online verification is unavailable.

## Rollout boundary

Approve the exact SQL delta separately before applying it to the verified game project. Apply and verify the schema before enabling a matching v2 online deployment. Old v1 server code cannot use the upgraded RPC. Publication/production activation and secure credential configuration retain their separate approval requirements. No additional credential is needed for this version change.

The upgrade is intentionally not blindly rerunnable. Existing v2 constraints/record rows or a divergent function are a review stop. Do not drop or reset the retained v1 record to retry. A rollback of the application without a coordinated database version plan leaves online requests unavailable rather than mixing scores.

## Verification performed locally

Tests apply the unchanged v1 schema and then the proposed v2 delta in a fresh PGlite database. They cover the full HTTP→adapter→SQL flow, permissions/RLS, score bounds, shared seeds/fresh IDs, tamper rejection, identical versus changed retries, record races and persistent limits.

Dedicated cases verify that:

- v2 cannot read/issue against the old v1 RPC
- The upgraded RPC rejects v1 or missing protocol versions and old v1 attempts
- A preserved v1 record of 80,000 remains untouched while the v2 board starts empty
- A valid lower v2 score can become the v2 record without competing with v1
- The DB independently rejects alternate v2 seeds and a v2 record above 78,300

PGlite uses one backend, so logical Promise.all races are not a live multi-connection load test. Remote read-only catalog/preservation checks passed; no live score attempt or gateway test was run. Fixed-course replay remains vulnerable to bots/fabricated plausible actions; it verifies rule consistency, not human play. The existing logical request cap is not a provider spending guarantee.

```sh
PGLITE_MODULE_PATH=/path/to/pglite/dist/index.js node --test \
  tests/sling-challenge-core.test.mjs \
  tests/sling-challenge-service.test.mjs \
  tests/sling-challenge-supabase.test.mjs \
  tests/sling-challenge-online-http.test.mjs \
  tests/sling-challenge-online-integration.test.mjs
```

With the pinned dev dependency installed normally, omit PGLITE_MODULE_PATH. The tests use dummy credentials and local databases only.
