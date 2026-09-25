# Chapter 1 production candidate

## Status

**Production release remains BLOCKED on remaining acceptance checks. Focused source and native automated suites are verified locally.** This candidate has not changed main or the live game. A separately approved non-production preview can be used for remaining device validation; it is not production acceptance.

- Base: `e49dac864e665e7155b1b798910437cdcf20264d` (fresh origin/main when this worktree was created).
- Isolated branch: `aside/ch1-release-20260925`.
- Runtime content SHA-256: `71a1247068e01dd4147e6ad001a5fe216a2472de522e19c3c42ecb26ec856994`.
- Hash input: sorted paths for index.html, both new src modules and all four vendor/gameplay files; for each, UTF-8 path + NUL + file bytes + NUL.
- User choice: retain original A David. This is not the A/B sandbox and does not publish its controls or imported character.

## Production scope

Normal storybook mode attaches adapters only to Chapter 1. `?upgrades=off`, staged `?review=...`, legacy graphics and all other chapters retain the native path. Review/rollback routes make no requests for these upgrade modules.

- Yuka Arrive/Separation affects ordinary following sheep only. Native follow activation, destination, arrival and fold-count rules remain authoritative. Lamb, noFollow, carried, airborne, callback-scripted and stopped actors retain native movement and clear steering momentum.
- Simulation deltas up to one second are substepped; ordinary assisted .2-second deltas are not accidentally truncated to one small step. Pathological catch-up is bounded.
- camera-controls runs on a listener-free proxy, only while an existing Chapter 1 cinematic is active. Native cinematic targets, rate and blend weight remain authoritative. Normal movement, aiming, input and sling remain native.
- Explicit rebases clear prior damping velocity before a new transition. cineOff retains the last smoothed contribution and uses the original fade weighting.
- World cleanup restores exact actor/camera methods and disposes the adapter. No saving, storyline, chapter rules, model, hands, wardrobe, animations, collision or sling code was changed.
- Local Yuka and camera-controls bundles and their licenses were copied from the already-reviewed pilot. No native package installation was performed.

## Actual checks and limitations

| Check | Result | Evidence scope |
|---|---|---|
| Nonbrowser unit/source suites | 51/51 PASS | All `.test.mjs` except native ten-chapter runtime wrapper |
| Camera velocity bug | Reproduced before repair, passes after | Target switch, explicit rebase and aiming resume match a fresh controller; exact cineOff blend continuity |
| Actual-browser production integration | 5/5 PASS | Original David/root/hands identities, native sheep state/count, wrapper restoration, other chapters unchanged |
| Chapter 1 reload x5 | Stable | Each cycle 82 geometries, 11 textures, 1 cleanup callback |
| Original narrative assertions | 12/12 PASS via local browser adapter | Assisted logical checks across ten chapters, not a human full playthrough |
| Post-camera-repair affected narrative rerun | 1/1 PASS | Real Chapter 1 native follow/fold advances into lion gate |
| General browser assertions | 8/8 PASS via local adapter | Normal UI, sling, rendering, reload, touch-capability fixture |
| Graphics regression assertions | PASS via local adapter | Ten chapter roles/transforms, night lighting, unchanged cine inputs, stable repeated world loads |
| Actual browser keyboard movement | PASS | Normal UI entry followed by browser-keyboard W moved David 2.406 units; original visual version 3 remained visible |
| Review and rollback guards | PASS in actual browser | No upgrade bundle or upgrade module requests |
| Independent read-only re-review | No remaining concrete source blocker in reviewed scope | Camera, character/hand identity, cleanup and source scope |
| Required native CLI suites | **PASS from user's Terminal** | Full suite 52/52 including all 12 narrative checkpoints; core browser 8/8; graphics pass; production integration 5/5. Candidate checksums match before and after |
| Full Chapter 1 lion/anoint playthrough, physical touch/device performance | **NOT CERTIFIED** | Logical adapter and assisted setups do not prove these gates |
| Human visual/fun acceptance | **NOT APPROVED** | Original A selection is not acceptance of the new sheep/camera feel |

The test-only local adapter preserves original assertions and test bodies. It replaces native launch with same-origin test documents, memory-only Web Storage, synthetic input and a documented mobile-capability fixture. A srcdoc history-rewrite issue was corrected with a localhost-only disposable document server. Locator waiting was restored after the initial general suite correctly failed at an asynchronously appearing Begin button. Those failures were not hidden or converted into passes.

Inherited log summary strings such as "Apple Metal" and "Headless" are **not proof** of native-driver execution or hardware coverage. The post-fix narrative run explicitly labels its renderer unverified. A separate top-level runtime query returned ANGLE Metal Renderer: Apple M3; that says nothing about a phone or controlled performance comparison.

Logs and screenshot are in this session's temporary directory: release-units.log, release-camera-before.log, release-camera-after.log, release-live-integration.json, release-narrative-adapter.log, release-narrative-postfix-ch1.log, release-browser-adapter.log, release-graphics-adapter.log and ch1-production-original-a.png. The camera repair happened after the full narrative run; the affected Chapter 1 test was then rerun on final code. Unchanged other-chapter rules are separately covered by source contracts.

## Native follow-up evidence

The user executed the existing Chrome drivers from Terminal because Chrome subprocesses abort in Aside's execution environment. The first native run passed 51 unit/source checks and 11/12 narrative checkpoints, but timed out before Chapter 3 rhythm appeared. That failed log remains preserved as `native-release-verification-first-failure.log`.

Without changing production code, original timeouts or assertions, the affected check passed twice with upgrades enabled and twice with upgrades disabled. Then all three previously unrun native browser suites passed, followed by the full unchanged 52-test suite (including the 12-checkpoint narrative wrapper). Total full rerun duration was 82.844 seconds. `native-release-followup.json` records passed; the accompanying log and both checksum passes bind it to the same runtime hash. The initial timing failure's root cause is not established, and successful reruns are not a claim that intermittent stalls cannot occur.

## Remaining gate and reproduction

Run with the existing dependencies and installed Chrome in an environment that can launch it, against this exact candidate:

```sh
BASE_URL=http://127.0.0.1:43935 node --test tests/*.test.mjs
BASE_URL=http://127.0.0.1:43935 node scripts/browser-check.mjs
BASE_URL=http://127.0.0.1:43935 node scripts/check-graphics.mjs
BASE_URL=http://127.0.0.1:43935 node scripts/check-chapter-one-upgrades.mjs
```

The session also provides a one-command verification launcher with candidate checksums and captured status. It installs nothing and does not publish. Even native suite success does not constitute physical-device or subjective acceptance.

Complete the remaining Chapter 1 narrative-camera playthrough and genuine touch/device checks, retain their evidence, and obtain version-specific final confirmation before any commit/push/merge/deployment. Recheck target-main freshness and integration before release. Keep the former production SHA for rollback; `?upgrades=off` is a local diagnostic escape hatch, not a global rollback.

Do not include `_local-*` adapter files, the node_modules symlink, comparison UI or KayKit/Rogue material in the production patch.
