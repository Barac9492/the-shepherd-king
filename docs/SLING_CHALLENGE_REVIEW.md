# Sling Challenge prototype review

Base: approved production `b5f69af6ee594caf6e654090ada2720e428bfc20`, tree `8428dd66e159f9214ce3fbb3b7e90605ffb4540e`.

## Scope

- A separate title-menu challenge, not a story chapter
- The original Three.js renderer, David model, sling animation, audio, touch/mouse/F controls and interruption clearing are reused
- A fixed throwing line and moving target: smaller/faster targets, decreasing time allowance, three lives, bounded 60-round/10-minute run
- Deterministic documented scoring; no story progress reads/writes during challenge play
- Practice, explicit local-server test, result, retry, back, pause/help, error/loading/empty states
- Only a server-qualified higher record can add three ASCII initials with public-score consent
- A local-only attempt/replay/CAS API and a nonexecuted persistent transaction design

## Verified in this cloud workspace

- 209 nonbrowser repository tests pass, including 39 challenge core, local HTTP, service and UI lifecycle checks
- Tests cover tamper rejection, live timing bounds, pause, charge/cadence, duplicate requests, changed duplicates, expired attempts, rate limits, profanity/HTML input, score ties and concurrent winners
- UI fixtures cover stale requests, double start, pause/help/retry/back, story-save independence, per-attempt consent, current-record refresh after an uncertain submission, and failed refreshes
- Independent review found and prompted fixes for coarse-frame charge timing, false legacy miss feedback, navigation races, consent reset, and stale-record retry presentation
- `git diff --check` and syntax checks pass

## Not verified yet

- Chromium execution in this cloud sandbox fails before the page opens: socket creation is denied (`Operation not permitted`). No launch restriction was bypassed
- The existing desktop/touch/all-chapter runtime aggregates and new `sling-challenge-runtime.test.mjs` require an approved browser-capable execution/preview environment
- `scripts/check-sling-challenge.mjs` contains eight desktop/mobile/runtime scenarios, but they have not run successfully here
- Actual phone layout, touch feel, aim visibility, frame rate and visual quality are not established by DOM fixtures
- No global online record, hosted preview, production adapter, live database or live rate-limit verification exists

## Publication and setup gates

Do not call this complete online competition or release it as production-ready. Review the visible arena on desktop and a phone, run the entire runtime suite, and connect a separately authorized persistent game-only service before enabling a global board. The in-memory mock is loopback-only and must not be deployed as an internet leaderboard.

No push, pull request, merge or deployment was performed as part of this prototype implementation. The church database and credentials were not used. New database creation and production schema/configuration are separate steps with their own approvals.

## Supabase integration preparation

An additional local-only integration pass prepares the existing game deployment for the dedicated Supabase project `jdsjvrynmnzoztfinlzi`. The original prototype staged tree remains preserved separately. This pass adds a disabled-by-default HTTP boundary, server-only native-fetch adapter, explicit service-role grants/RLS SQL draft, body-only attempt capabilities, online-mode validation, and database permission/transaction tests.

239 nonbrowser tests pass at this checkpoint, including local PGlite SQL execution and a complete HTTP → adapter → SQL → record round trip. PGlite validates SQL and logical winner races in a single backend; it is not a live multi-connection contention or hosted Supabase integration test. Browser/runtime gates still have not run in this sandbox. No remote migration, credential retrieval, environment configuration, push, or deployment was performed.

See `SLING_CHALLENGE_SUPABASE.md` for the exact pending setup and permission boundary. `.env.example` contains only public configuration and an empty secret field; do not add real credentials to repository files.
