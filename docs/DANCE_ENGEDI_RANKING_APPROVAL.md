# Dance + En-Gedi TOP 10 — local implementation awaiting approval

This branch combines dance RC `4c5232e` and En-Gedi RC `0f66d27` on current main `99a053d`. Integration merge: `003be7d`. No push, PR, merge to main, deployment, environment change, or remote DB write has been performed for this work. All ranking test submissions are synthetic and remain in an ephemeral local PGlite database.

## Exact proposed change

Migration: `supabase/migrations/20261005031738_dance_engedi_top10.sql` (created by `supabase migration new dance_engedi_top10`; not applied remotely).

- Add private schemas **dance_challenge** and **engedi_challenge**. Each has separate `attempts`, `rate_buckets`, `ranking_entries` tables, indexes, its own error helper and advisory transaction lock.
- Add `public.dance_challenge_rpc(text,jsonb,text)` and `public.engedi_challenge_rpc(text,jsonb,text)`. Security invoker, fixed search path, 2-second lock timeout, execute only for existing `service_role`. No public/anon/authenticated access. RLS on all six tables; no browser RLS policy.
- Grant the existing server role only usage on these new schemas, SELECT/INSERT/UPDATE/DELETE on their attempts and rate buckets, SELECT/INSERT/DELETE on their ranking entries, usage on their identity sequences, execute on their new functions. No credential, role, extension, auth change, default privilege change, or grant on unrelated objects.
- Add five routes per mode: `/api/{dance,engedi}-challenge/{record,attempts,finish,submit,invalidate}`. `record` is GET; all other actions are POST. Attempt tokens are request-body capabilities, never URLs.
- Reuse the dedicated game Supabase project `jdsjvrynmnzoztfinlzi`, existing server-only key and allowed-origin configuration. Add only `DANCE_ONLINE_ENABLED` and `ENGEDI_ONLINE_ENABLED`, default false. No secret is embedded in browser assets or this report.
- Existing `sling_challenge` schema, function, ranking entries, API modules, environment switch and ranking UI are untouched. No data migration or backfill occurs.

## Publication and preservation

A player explicitly starts a **new ranking challenge** before play; ordinary practice and old browser records never qualify. Only after completion do they enter three English initials and check a fresh, unchecked publication-consent box. Confirming sends that attempt's transcript for verification and then publishes its verified result. Consent strings are fixed independently: `dance-side-top10-v1` and `engedi-side-top10-v1`. There is no automatic upload of local scores. Camera and microphone are not used.

Public rows contain only three-letter initials, integer score or 10ms tick count, consent version, and monotonically increasing submission order. Public API returns only initials, metric and rank. No raw IP, account, timestamp, answer, input transcript, attempt token or stable player identifier appears in the leaderboard.

Dance sorts score descending (300–1110), En-Gedi sorts successful time ascending (ticks × 10ms). Equal metrics receive competition ranks (1, 1, 3). Within ties, earlier accepted publication wins display order and the tenth-row cutoff. Exactly ten rows at most per mode; excess rows are deleted transactionally. Each newly completed attempt can publish once; the same player may hold multiple rows. No claim of unique players.

A server attempt lasts 30 minutes. Temporary attempt records keep timestamps, invalidation flag, verified metric, transcript hash, submission hash and duplicate-response receipt, but never the raw transcript. Expired attempts are rejected immediately and physically removed by bounded lazy cleanup (64 per subsequent request). If traffic stops, physical cleanup waits; storage remains capped at 2048 attempts per mode. Public top-ten entries stay until displaced or an authorized operator deletes them; there is no automated age expiry or player self-deletion identity in this scope.

Rate buckets contain daily rotating, mode-separated HMACs of Vercel-verified routing IPs, never raw addresses; max 4096 buckets per mode, up to 24-hour windows, 128 expired buckets removed per request. Quotas: 20,000 RPC operations/day/mode, reads 120/min/network, new attempts 8/10min/network, submits 20/min/network, other actions 30/min/network. Shared-network users share quotas. Replay consumes inspection quota even when invalid. Body cap 64KiB, upstream response cap 16KiB, bounded replay and network timeouts. HTTP/SQL error responses contain no private upstream diagnostic data.

## What verification means

Dance server replays all submitted answer, hint and next-verse events against the pinned canonical Psalm 23, recalculating first-answer accuracy, correction, hint deductions, streak bonuses and six-verse completion. Spacing/punctuation and NFC normalization match the browser. No client-supplied score is accepted. This verifies consistency of the reported transcript, **not actual memorization, honest hint reporting, human typing, or prevention of copy/paste**. The text and rules are public; automation or altered browser code can fabricate a valid transcript. No faith assessment is made.

En-Gedi server replays actual captured speed transitions through the fixed integer 10ms simulation, requires successful terminal state at the exact reported tick, rejects malformed timing/events, future elapsed time, declared interruption and frame gaps over 250ms. The browser invalidates on blur, hiding, pause, navigation, context loss and gaps, and sends best-effort server invalidation. Server invalidation permanently prevents later verification/submission. A malicious client could omit interruption telemetry or fabricate valid inputs; neither fixed replay nor a failed/beacon invalidation request proves uninterrupted human play. Three decimal places do not mean 1ms fairness between devices.

Korean scripture remains the exact existing 1961 개역한글 Psalm 23:1–6, checked against [대한성서공회 본문](https://www.bskorea.or.kr/bible/korbibReadpage.php?linkBible=BHANpsa023003); economic copyright expiration 2011-12-31 is documented in the [publisher rights notice](https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1). Attribution remains visible. No modern translation or AI paraphrase is substituted. Dance is inspired by 2 Samuel 6:14 and Psalm 23's David heading; memorization causing a festival is clearly fictional gameplay.

## Proposed approved rollout (not executed)

1. Review the exact final local commit and approve these additive DB objects, existing service-role grants, consent/retention policy, and the two production flags.
2. Recheck current main and production SHA; integrate any new main changes without overwriting existing sling ranking work. Run exact-head regression/CI.
3. With both new flags false, apply only the new migration to the dedicated game project after checking schema names do not already exist. Verify grants/RLS, empty new boards and unchanged existing sling records with read-only checks. No synthetic score publication on production.
4. Push the approved branch, open/review/merge PR and deploy the exact approved SHA using the established Git/Vercel path. Existing sling flag/secret/origin remain unchanged.
5. Enable the two approved flags for the ready deployment. Smoke-test read endpoints and normal practice without publishing any real or synthetic score. A live publication test would require separate explicit authorization.
6. Rollback: disable the new flags and redeploy prior code if necessary. Preserve the private schemas/data pending explicit deletion approval; never roll back or delete sling data. Reads should report unavailable while disabled.

## Validation

Results and final SHA are recorded after the local test run in `docs/DANCE_ENGEDI_VALIDATION.md`. Browser checks use Chrome desktop and 320/390px emulated touch viewports. They do not establish behavior on physical iOS/Android hardware or real OS Korean IME; synthetic composition events and keyboard/touch handlers are tested. Live PostgREST configuration/advisors and production transport cannot be verified while remote changes are on hold; local SQL tests verify permissions and functions under PostgreSQL via PGlite.
