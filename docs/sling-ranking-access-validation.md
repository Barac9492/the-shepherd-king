# Sling Challenge top 10: implementation and release validation

Base: fresh `origin/main` at `e22a3ba673fc277968cbb9dbd1b0e85f4c8be824`.
Local branch: `codex/challenge-ranking-access`. Release scope: the dedicated game database and existing game Vercel project only.

## Behavior

The title has a direct **물맷돌 챌린지 랭킹 보기 / View Sling Challenge ranking** entry. No game, tutorial, account or submission is required to view it. It shows the existing global best separately from the new top 10 records, with explicit loading, empty, error/retry and back/Escape behavior. Keyboard focus stays in the dialog and returns to the entry when closed. The 10-row board scrolls on small phones and landscape displays.

The new board starts empty. Only new submissions with explicit top-10 publication consent enter it. No old attempt, previous winner, or existing highest record is backfilled. Three uppercase English initials are retained; the same initials may appear on multiple separate records. No player/account/device/tracking identity is introduced. Positive, server-verified results may be submitted even when they do not beat the global best. Zero scores retain the existing positive-score restriction.

The UI explains that scores sort descending and tied scores prefer earlier submission. The database's existing transaction gate serializes acceptance and assigns a private monotonically increasing submission order. This order identifies a record, never a player; it is not returned publicly. Repeating the same attempt does not produce another record or change its tie position.

## Storage and public contract

`supabase/migrations/20261005022356_sling_challenge_top10.sql` was created with `supabase migration new`. It requires the existing v1 setup and v2 upgrade. Those prior SQL files are unchanged.

The delta adds `sling_challenge.ranking_entries` and replaces the existing RPC while preserving the old actions, origin checks, shared rate quotas, replay validation, expiry and idempotency rules. The new table holds only submission order, rule version, initials, score and consent version. It has no attempt capability, transcript, IP or player identifier. Inserts and pruning happen in the same transaction, leaving at most 10 rows. Non-ranking submissions continue to affect only the legacy highest-record store.

Records displaced from the top 10 are removed from the ranking table immediately. The existing bounded attempt cache remains for retry correctness; attempts expire 30 minutes after issuance. As before, physical cleanup is lazy on subsequent RPC requests, in batches of 64, rather than a scheduled deletion exactly at expiry. No new long-term archive or background job is introduced.

- `GET /api/sling-challenge/record` keeps its existing `record` field and optionally adds `rankingVersion: "top10-v1"` and ordered `entries: [{initials, score}]`.
- `POST /finish` keeps legacy `qualifies` and adds `rankingEligible` plus `rankingVersion` when the database supports it.
- `POST /submit` accepts the existing body unchanged for legacy publication. The new UI additionally sends `rankingConsent: "top10-v1"` with `publicConsent: true`; both are included in the immutable retry payload/hash. New submissions return `accepted` and `reason: "ranked" | "outside_top10"` with `rankingVersion`. Old submissions retain their original result semantics.

A missing/older ranking contract falls back to the explicitly labeled single highest record; it never fabricates a populated or empty top-10 list. New ranked submissions fail closed against an older database. The result screen retains the player's own score above the separate global record.

## Security and verification

New table and sequence permissions explicitly exclude PUBLIC, anon and authenticated; RLS is enabled. The RPC remains SECURITY INVOKER with a fixed search path and service-only execution. No new browser access to the database, exposed schema, extension, credential, or broad grants is added. This follows the documented [Supabase grants and RLS boundaries](https://supabase.com/docs/guides/api/securing-your-api). The [current changelog](https://supabase.com/changelog) was reviewed; this delta uses the existing standard PostgreSQL/RPC mechanisms.

Local tests use pinned PGlite with synthetic fixtures, never the remote database. Coverage includes no backfill, unchanged legacy highest record, lower-than-highest ranked acceptance, equal initials, deterministic ties, pruning to 10, duplicate/concurrent submission, changed retry rejection, consent validation, expiry/cleanup, zero and unverified scores, public field allowlisting, permissions/RLS, replay tampering, same-origin checks and inherited quotas.

Final validation: **292 full-suite tests passed, 0 failed, 0 skipped** using `node --test --test-concurrency=1 tests/*.test.mjs`; **64 targeted SQL/API/controller tests passed**; **10 ranking-view and 5 mobile-submission browser scenarios passed with no page errors**. `git diff --check` is clean. The initial parallel full-suite run stalled in browser workers and was stopped; the complete sequential rerun passed on the final production code.

Validation results are recorded in `test-results/sling-ranking/` (ignored by Git):

- `all-tests.log`: full repository suite, including existing story/challenge/browser/security regressions.
- `targeted-tests.log`: SQL, HTTP-to-SQL, adapter and controller checks.
- `report.json`: 10 ranking-view browser scenarios, with every challenge request limited to public GET fixtures.
- `submission-report.json`: 5 mobile form scenarios: explicit unchecked consent, duplicate click suppression, immutable retry, read-only refresh after a confirmed submission, fresh consent on a new attempt, outside-top-ten handling, and cancellation of a pending response.
- `desktop.png`, `mobile-320.png`, `mobile-390.png`, `mobile-844.png`, `mobile-consent.png`: synthetic browser fixtures, not production ranking data.

Reproduce browser checks with `PORT=43983 npm run dev`, then `npm run test:ranking` and `npm run test:ranking:submit`. Both scripts reject non-local base URLs and intercept challenge API calls, so they do not submit real scores. `npm test` runs the full local suite. Chrome is selected using the existing repository convention and supports `CHROME_PATH`; both scripts support `SOFTWARE=1`. The ranking-runtime CI job runs all 15 fixture scenarios.

## Release validation

The user authorized the game database change and deployment. No real test scores, historical backfill, or automatic deletion of published records is authorized or needed.

Read-only preflight confirmed the dedicated game project `jdsjvrynmnzoztfinlzi` has only the expected initial and shared-course-v2 migrations. The live RPC body matches the repository v2 baseline exactly (MD5 `2766dcff2450ea5fbbf55cfb445472eb`). The new ranking table is absent before release. Existing highest records are compared using row counts and an aggregate fingerprint; no contents are exposed.

Database application completed as migration `20261005022356_sling_challenge_top10`. The migration file's version matches the remote migration history. The new table has 0 rows, RLS enabled, and no anon/authenticated SELECT privilege. Both legacy highest-record rows have the same aggregate fingerprint before and after (`f81ff0517eb7c07a9ba26ff289e31f93`). Temporary attempts and rate buckets changed during live traffic, so no equality claim is made for those operational caches; the applied migration contains no DML against existing rows and no RPC invocation. Both fixture browser scripts also passed with CI's software renderer.

Release order: apply only this reviewed database delta, verify preservation and permissions, create a draft PR, require every CI job on the final head, merge, verify the exact merge SHA reaches Vercel production READY, and run read-only production checks. No new routes, secrets or environment variables are needed. Do not use blanket `db push`: earlier baseline SQL is stored as drafts rather than a complete tracked migration history.

Applying the database delta first is compatible with old clients: they continue using legacy highest-record publication and do not silently enter the top 10. Rolling the application back also leaves the new data private and compatible; do not drop the ranking table or erase new consented records as an automatic rollback.
