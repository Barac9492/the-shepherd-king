# Local release validation — 2026-10-05

> Historical local-candidate report. The subsequent authorized DB application and release gate are recorded in [DANCE_ENGEDI_RELEASE.md](DANCE_ENGEDI_RELEASE.md).
Branch: `codex/dance-engedi-release`. Base main: `99a053de10a378c54f9aa333e4905d95491a7ccb`. Dance RC `4c5232e22a895093ba10fb562c44d48e65ce6d41` and En-Gedi RC `0f66d27f97e4d0112ecc82aa0a7b89dd6a0f66ab` are integrated by local merge `003be7d`. Original source branches/checkouts are preserved. Any main changes after this base must be reconciled before a later approved release.

## Results

- Server/SQL unit and integration: **9/9 pass**, using pinned PGlite 0.3.14, synthetic identities and inert credentials; no remote transport. Includes canonical dance scoring/hints/corrections, deterministic En-Gedi replay, consent, duplicates/conflicts, server wall clock, interruption invalidation, separate mode storage, sort/tie/cutoff, initial empty boards/no backfill, expiry cleanup, rate/capacity bounds, malformed results, permission/RLS checks and upstream-error filtering.
- Existing dance browser: **15/15 pass**, including 320/390px touch, long verse/viewport shrink, synthetic Korean composition, wrong words and corrections, hints, duplicate clicks, mode/restart/exit cancellation, six stages/festival, reduced motion, generated audio cleanup, unavailable storage and integrated main TOP 10 return with saves preserved.
- Existing En-Gedi browser: **12/12 pass**, including live keyboard completion, all-fast failure, cancellation/rest, pause/blur/hidden/frame-gap invalidation, repeated scene/input disposal, story/sling return, visit-only practice record reset and 320/390px touch handling.
- Existing sling TOP 10 browser: **10/10 read scenarios + 5/5 publication/retry scenarios pass**, entirely mocked locally; no real scores sent.
- New ranking browser: **10/10 pass** through real local HTTP handlers, replay service and ephemeral PostgreSQL. New consent only, no old-score upload, practice exclusion, server-matching reduced score, corrected blocked initials, duplicate clicks, unavailable API, stale request cancellation, independent boards, live En-Gedi finish, interruption invalidation and 320/390px accessibility. Raw report and screenshots are in `docs/side-ranking-review/`.
- Full suite: **313/314 pass in one parallel run**. The remaining existing sling runtime wrapper printed all **14/14 gameplay assertions passing, errors []**, then timed out while Chrome was exiting. Its isolated rerun **passed and exited 0** (14/14 gameplay assertions, wrapper 1/1, 101.2s). All 314 test cases are therefore verified across the full run and this targeted rerun; the parallel full-run exit remains honestly recorded as 1. Story ten-chapter, walk, garden, source contracts, initial loading and all new server tests passed in the full run.
- Independent walk rerun: **15/15 pass, process exit 0**, including keyboard/touch, chapter-one handoff, companion, boundary recovery and scene/input cleanup.
- Initial-loading regression found during implementation was fixed by registering the new ranking stylesheet with the existing nonblocking `data-game-style` loader. Targeted loading rerun: **10/10 pass**; the final full run also passes this suite.

## Commands and evidence

```sh
node --test tests/side-challenge.test.mjs
npm run test:side-ranking
BASE_URL=http://127.0.0.1:44929 npm run test:dance
BASE_URL=http://127.0.0.1:44929 npm run test:engedi
BASE_URL=http://127.0.0.1:44929 npm run test:ranking
BASE_URL=http://127.0.0.1:44929 npm run test:ranking:submit
NODE_OPTIONS='--import=./docs/david-dance/qa-close-contexts.mjs' npm test
SOFTWARE=1 NODE_OPTIONS='--import=./docs/david-dance/qa-close-contexts.mjs' node --test tests/sling-challenge-runtime.test.mjs
```

The optional test-only adapter closes browser contexts before Chrome and changes no game code, assertions or error results. GPU Chrome is used for the live ranked En-Gedi run. A SwiftShader attempt encountered a 364ms frame gap and was correctly invalidated; no timing rule was relaxed to obtain a pass. Successful ranked completion was 21.710 seconds in the final integration run; this is a test result, not a device fairness guarantee.

Full raw logs are retained locally in `/tmp/joint-final-tests.log`, `/tmp/joint-sling-runtime-retest.log`, `/tmp/joint-dance-browser.log`, `/tmp/joint-engedi-browser.log`, `/tmp/joint-sling-ranking.log`, `/tmp/joint-sling-submit.log`, `/tmp/side-unit-tests.log` and `/tmp/side-rankings-browser.log`. Concise copies/results accompany the checked-in report.

## Limits and pending approval

Chrome 154 on macOS; mobile/touch and composition events are emulated. Physical iOS/Android, actual Korean OS IME, device thermal performance, deployed Vercel/PostgREST transport and live DB advisors were not tested. Browser telemetry does not prove genuine memorization, honest hint use or uninterrupted human play against a modified client. Existing sling implementation and migration have an empty diff against main `99a053d`.

No push, PR, remote merge, deployment, environment/secret change or remote database mutation occurred. Both new production switches remain disabled by default. Exact DB objects, grants, retention/publication policy and proposed rollout/rollback are in [DANCE_ENGEDI_RANKING_APPROVAL.md](DANCE_ENGEDI_RANKING_APPROVAL.md). Approval covering that DB scope is required before remote execution; there is no local implementation blocker.
