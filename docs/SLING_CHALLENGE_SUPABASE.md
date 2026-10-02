# Sling Challenge: Supabase integration and release gate

## Current state

The Supabase adapter and schema below have been exercised **locally with PostgreSQL in PGlite**. The SQL has not been applied to the remote project, no secret has been retrieved or configured, and this document does not authorize publishing, provisioning, changing database permissions or deploying code. The local mock remains separate and unchanged.

The intended isolated game project, verified during setup planning, is:

- Project: `the-shepherd-king-leaderboard`
- Reference: `jdsjvrynmnzoztfinlzi`
- API origin: `https://jdsjvrynmnzoztfinlzi.supabase.co`
- Intended production game origin: `https://the-shepherd-king.vercel.app`

The adapter explicitly pins this project reference. A different Supabase project is rejected before a request is sent, including an otherwise-valid Supabase origin. Reusing an unrelated project's database or credentials is not supported. If a future project changes, review the pin and migration together.

## Files

- `server/challenge-supabase.mjs`: server-only fetch adapter, replay validation and public-response projection
- `docs/sling-challenge-supabase-setup.draft.sql`: reviewed executable SQL draft; not an applied migration
- `tests/sling-challenge-supabase.test.mjs`: fake-transport tests and actual local SQL/grant/race tests
- `server/challenge-online-http.mjs` and the API routes: HTTP integration maintained separately; see their tests and review notes

The draft deliberately has a descriptive `.draft.sql` name. The Supabase CLI was not installed when preparing it, so no migration timestamp/name has been invented. After authorization and local setup, generate the migration using the CLI's documented migration workflow, then put the reviewed SQL into the generated migration. Do not treat the draft file itself as migration history.

## Trust boundary and API

Browsers call the game's same-origin endpoints. They never call Supabase directly and receive no Supabase key. The public HTTP layer calls:

```js
createSupabaseChallengeService({ url, secretKey })
// getRecord({ clientKey })
// createAttempt({ clientKey })
// finishAttempt(attemptId, { shots, endedAtMs }, { clientKey })
// submitRecord(attemptId, { initials, publicConsent }, { clientKey })
```

Success responses preserve the mock's shapes but identify `mode: 'online'`, `onlineEligible: true` and `recordScope: 'global'`. Failure never substitutes the mock or practice record as the global winner.

`clientKey` must be a 64-character lowercase hexadecimal HMAC supplied by the trusted HTTP layer. It is derived from the server secret with domain separation, a daily rotation input and the hosting platform's trusted client-address source. Do not accept a browser-supplied client key or trust arbitrary `X-Forwarded-For` values. The all-zero key is reserved internally for the global quota.

The server calls one service-role-only RPC:

```text
POST /rest/v1/rpc/sling_challenge_rpc
{ p_action, p_input, p_client_key }
```

- `read`: reads the one public record
- `issue`: receives newly generated random ID/seed; the database owns issue/expiry timestamps
- `inspect`: retrieves the seed/rule version privately before server replay; this response is never forwarded to a browser as a record
- `finalize`: stores only the server-replayed result and canonical transcript hash
- `submit`: validates consent/initials, compares the verified score against the current record and saves an immutable submission response

The client-facing finish path accepts only a bounded raw shot transcript and terminal active time. Client-supplied score, hit totals, seed, result or qualification flags are rejected. Replay uses `src/sling-challenge-core.js`; no submitted totals are trusted. A finish requires two database calls, inspect followed by finalize, with a six-second timeout on each. The HTTP/UI timeout must allow for both, or retain the same transcript for a safe retry. Neither operation is automatically retried after an uncertain network result.

The adapter sends a modern `sb_secret_…` value only in the `apikey` header, over the exact pinned HTTPS project origin. It does not send it as a bearer token. Redirects are rejected. Response bodies are bounded to 16KiB before parsing, including streaming responses without a content-length header. Server request logs must not record the apikey header, request body, capability IDs, raw client address or raw shot transcript. Attempt IDs belong in POST bodies on the public HTTP layer, not URL paths.

Upstream errors and thrown network messages are not passed through. Only the adapter's fixed error-code/message set and bounded `retryAfterMs` can reach the client. Malformed/unexpected/error HTTP responses, oversized data, timeout and unavailable database configuration become a generic retryable service-unavailable error. A valid empty database record is distinct from such a failure.

## Database objects and exact draft actions

The draft is one transaction. It is intentionally not rerunnable: an existing schema is a review stop, preventing an accidental replacement of an existing installation.

It creates exactly:

1. Private `sling_challenge` schema
2. `sling_challenge.attempts`: ID/seed/version, DB-owned issue/expiry timestamps, immutable finish hash/result/response, immutable submission hash/initials/response
3. `sling_challenge.highest_records`: exactly one row for rules version `sling-challenge-v1`, initially an empty score-zero record
4. `sling_challenge.rate_buckets`: bounded short-lived operation counters keyed by action and opaque client HMAC
5. Expiry indexes for attempts and rate buckets; the other lookup keys are primary keys
6. Private `sling_challenge.error(text,integer,integer)` helper and public `sling_challenge_rpc(text,jsonb,text)` wrapper, both SECURITY INVOKER with fixed search paths
7. Explicit object grants and revokes described below

It enables RLS on all three tables. There are **no anon/authenticated policies**. It revokes schema/table/function access from PUBLIC, anon and authenticated, independently of project autoexposure defaults. It grants service_role:

- USAGE on `public` and `sling_challenge`
- SELECT/INSERT/UPDATE/DELETE on attempts and rate buckets, for issuance/finalization/cleanup
- SELECT/UPDATE on the existing highest-record row; no record INSERT or DELETE
- EXECUTE on the private error helper and public RPC

`service_role` bypasses RLS by design, so grants still matter. The SECURITY INVOKER function receives no owner-privilege escalation. The private schema must remain outside the Data API's exposed-schema list. The `public` RPC is exposed only as an endpoint requiring service-role execution, not anonymous execution.

There are no extensions, triggers, Auth accounts, Realtime publications, Storage buckets, cron jobs, top-ten lists, schema-wide default-privilege changes or project settings changes in the draft. Autoexposure-off is sensible defense in depth, but the code does not rely on it. No global role attributes or unrelated tables are changed.

## Atomicity, timing and quotas

Every RPC obtains one short transaction-scoped advisory lock before cleanup, quota checks and database operations. All wrapper operations share this gate, so record checks, capacity checks and counter updates remain consistent across multiple server instances. Attempt/record rows also use row locks. No network I/O or replay occurs while holding the database gate. The lock timeout is two seconds; a lock/SQL failure becomes a safe unavailable error in the adapter.

This intentionally serializes a small game's board transactions and bounds implementation complexity. It is not a claim of high-throughput scalability. Revisit the quota/cap gate and load-test with real multiple connections before increasing traffic targets; preserve atomic CAS semantics if redesigning it.

- Attempts expire after 30 minutes of database wall time
- Active play remains bounded to ten minutes and 62 shots
- Finalization checks terminal active time against database elapsed time plus 150ms grace
- Pauses may consume wall time without increasing active time; expiry still advances
- Exactly repeated finalization returns the original qualification/result snapshot; a changed hash or result conflicts
- Score must beat the current record strictly; ties lose, and zero scores do not qualify
- Submission rechecks the current record in the same transaction that stores its response
- Exact submission retries return the committed response; changed initials or hash conflict
- A formerly qualified attempt can lose to a newer winner without overwriting that winner

An accepted idempotent submission response describes that original submission. Someone else may since have won; GET the record for its present value.

Persistent per-client fixed-window quotas:

| Operation | Quota |
| --- | --- |
| Read | 120/minute |
| Issue | 8/10 minutes |
| Inspect before replay | 30/minute |
| Finalize | 30/minute |
| Submit initials | 20/minute |

There is also a global ceiling of 20,000 RPC operations per rolling-from-first-request 24-hour window. These are accepted application-operation counters, so finishing normally consumes inspect plus finalize. The ceiling is not a provider spending guarantee: denied requests still reach the hosting platform/database and incur resource use. Keep provider billing controls and monitoring separate. When a domain check fails, the RPC returns a structured error rather than raising an exception, ensuring consumed rate counters commit. Malformed transport and initial invalid RPC envelopes are rejected before database accounting; the public HTTP layer still needs request-size/origin controls and platform abuse protections.

Database caps are 2,048 retained attempts and 4,096 rate buckets, including the global bucket. Each operation lazily removes at most 64 expired attempts and 128 expired rate buckets. Expiry also fails closed on individual operations; a cleaned-up expired attempt may return not-found rather than expired. The highest record survives attempt cleanup and contains no attempt ID or seed. There is no unbounded history and no raw transcript storage. Rows expire logically immediately, but idle databases retain expired rows until later bounded cleanup requests. No recurring job is installed.

App storage contains only pseudonymous initials, the current score summary, short-lived attempt verification metadata, and rotated rate HMACs. Hosting/Supabase infrastructure may have its own operational logs; review those separately instead of claiming that no provider ever processes an address.

## Security limits

Replay verification prevents trusting a supplied score and rejects impossible cadence/timing or modified rule data. It does not prove a human played. A bot can compute targets, fabricate plausible actions and wait out the wall-clock check. The client knows its seed. This implementation must not be presented as cheat-proof.

The three-letter ASCII filter and abbreviation denylist are modest safeguards, not complete moderation. Initials should be a chosen alias, with explicit public-display consent. No real name, email or account is needed. The frontend must render returned aliases using textContent.

The server secret is privileged for the whole isolated project. Do not reuse it in other products, add it to frontend code, copy it into chat, put it in an example file or commit it. This isolation limits damage; it does not turn the secret into a row-scoped credential.

## Secure configuration handoff, after approval

The following values are names and nonsecret destinations, not configured credentials:

- `CHALLENGE_ONLINE_ENABLED=true`
- `CHALLENGE_ALLOWED_ORIGIN=https://the-shepherd-king.vercel.app` for the confirmed production alias; an approved preview needs its own exact HTTPS origin
- `CHALLENGE_SUPABASE_URL=https://jdsjvrynmnzoztfinlzi.supabase.co`
- `CHALLENGE_SUPABASE_SECRET_KEY`: the project's modern server-only secret, entered by the user through the deployment provider's secure environment-variable UI

Do not request or paste the key into chat. The user should enter/confirm/submit the credential through the secure handoff. Creating a new secret, configuring it for ongoing access, expanding grants or applying schema changes needs the applicable explicit approval. Do not enable online mode before schema, secret storage, same-origin deployment and checks are ready. Recommended first release: configure the user-entered secret for Production only. Leave previews without a key in practice mode. A future online preview requires its own explicitly approved isolated test project and reviewed project pin; it must not share production records as test data.

Before executing the draft, show the exact project and list of database objects/grants above and obtain approval for those changes. Before deployment, obtain the separately required publication approval. This implementation work and an existing project alone do not authorize either step.

## Verification

The pinned test-only dependency is `@electric-sql/pglite@0.3.14`. After normal dependency installation:

```sh
node --test tests/sling-challenge-supabase.test.mjs
```

For an already-installed copy, `PGLITE_MODULE_PATH` can point to that package's `dist/index.js`; only package code is read. The tests create a new in-memory database and dummy roles. They do not connect to Supabase or inspect any other project's data. No environment key is read by these tests: the transport is fake and the key-shaped fixture is explicitly fake.

Locally verified:

- Executable schema and service-role-only grants, including simulated permissive public-function defaults
- RLS enabled on every table, fixed function search paths, no SECURITY DEFINER
- Adapter → actual SQL → adapter flow for issue/replay/submit/public read
- DB timing, premature/future/tampered replay rejection and consent/initials validation
- Immutable duplicate finalization/submission, changed duplicates, winning and tied races
- Persistent quotas across service instances, quota commit on invalid operations
- Bounded cleanup, attempt/rate-table caps and global operation ceiling
- Strict project pin, safe API-key header, redirect rejection, abort and response-size bounds
- Fixed public errors with no raw upstream detail or private record fields

PGlite runs a single PostgreSQL backend. Promise.all cases establish logical interleaving/idempotent outcomes; they do not replace a real multi-connection contention/load test. Live Supabase gateway behavior, actual service-role mapping/grants, regional latency, secret configuration, live project advisors and deployment smoke tests remain pending authorized setup. No claim of a live global leaderboard is made by local tests.

After approved setup, verify the exact project reference again, inspect all created objects/grants, run the Supabase security advisors, test denied anonymous/table/RPC access and service-only access, then perform an approved isolated test attempt. Do not overwrite a production winner merely to smoke-test a deployment; use an authorized disposable test environment or a read-only production check once a real record exists.

## Primary documentation checked 2026-10-02

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): modern secret key handling, role mapping and apikey transport
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api): explicit grants and RLS are separate layers
- [Database functions](https://supabase.com/docs/guides/database/functions): invoker execution and function privileges
- [Supabase changelog](https://supabase.com/changelog): current breaking-change review
- [PostgreSQL 15.19 / 17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): reviewed; this draft does not rely on the listed extensions or custom operators
