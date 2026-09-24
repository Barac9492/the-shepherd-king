# Ten-chapter runtime regression notes

## Scope

`node scripts/check-ten-chapters.mjs` runs headless Chrome on the upgraded storybook graphics by default. It uses Apple Metal on macOS; `SOFTWARE=1` selects SwiftShader and `GRAPHICS=legacy` selects the original rendering for baseline comparison.

The suite starts an isolated no-store static server on `127.0.0.1:43971` unless `BASE_URL` is supplied. This avoids confusing a concurrent preview-server restart with a gameplay failure.

## What is exercised

1. Chapter 1: sheep enter the real `graze -> follow -> fold` updater path; `inFold` reaches 3 and opens the lion gate.
2. Chapter 2: the normal F-key charge/release path creates a stone projectile; the real target collision handler wins the Goliath weak-point gate.
3. Chapter 3: a real A/S/D rhythm key raises the calm meter; Space resolves a real dodge prompt. Restart during both rhythm and dodge verifies overlay/listener cleanup.
4. Chapter 4: the normal F-key bow release creates an arrow and the real gold-circle target handler disables the bow after the hit.
5. Chapter 5: the real stealth visibility function/updater raises detection at an exposed point and lowers it at a safe point; the real choice UI and robe-cut interaction resolve.
6. Chapter 6: the convoy phase reaches Abigail through the real midpoint condition; a real dialogue choice button is consumed.
7. Chapter 7: one rescue-camp target is hit by a real F-key projectile. The remaining target handlers are invoked directly to reach the existing nine-hit gate, then the real captive-release interaction and dawn return transition are checked.
8. Chapter 8: a real dance interaction increments `danced`; procession distance `sArk` advances.
9. Chapter 9: the real follower updater reaches the cart condition, and the real seat interaction leaves Mephibosheth seated.
10. Chapter 10: the poor-man avatar is active, the real water/pick-up interactions enter `carryarms`, the home condition returns the story to the king, both real choice UIs resolve, and all five real candle interactions render `5 / 5`.

Additional coverage:

- All 10 Korean end-card question sets render with two Korean questions each.
- Mobile viewport is 390x844 with no horizontal card overflow.
- The chapter menu contains 10 entries and selecting entry 10 opens the Korean Chapter 10 intro card.

## Assisted setup and limitations

This is an assisted runtime regression, not proof of 10 complete normal playthroughs.

- Chapters are loaded through the exposed `GAME` object and their existing `ch.run(GAME)` functions.
- Intro/title overlays and fades are suppressed in test context only.
- The test derives a deterministic step from the production game loop and calls the existing timers, waiters, actor updates, interaction handler, projectile updater, and chapter updaters. In assisted chapter runs, RAF renders only; simulation advances solely through explicit steps. This avoids racing two simulation clocks on fast hardware. Normal UI/control smoke tests separately use the untouched RAF loop. Production source is not modified.
- Teleports are used to reach existing distance/interact gates. A passed checkpoint proves that the inspected handler/condition accepted the resulting runtime state, not that a player traversed the intervening terrain normally.
- Chapter 2 sets Goliath to the existing vulnerable roar state before firing.
- Chapter 7 uses one normal projectile hit and directly calls the remaining existing target `onHit` handlers. It does not claim nine manually aimed shots.
- Chapter 3 uses the existing `_rhythm.hitAll` debug hook only to reach spear events after first proving a normal rhythm-key hit.
- Restart cleanup uses the real `GAME.startChapter(2)` path with test-only zero-duration fades.
- This suite is functional evidence only, not a performance benchmark. `scripts/benchmark-graphics.mjs` separately records desktop frame times.

## Baseline comparison

The first pre-edit baseline run of `node scripts/browser-check.mjs` failed with `AssertionError: 5 !== 3` at its old four-chapter ID assertion. During concurrent graphics work, upstream `scripts/browser-check.mjs` was updated. A final rerun against an isolated server passed all 8 current baseline checks with 0 console/page errors.

Port 43871 stopped responding during multiple early runs. This was reproduced as `net::ERR_CONNECTION_REFUSED`, not as a chapter assertion. The final suite therefore uses its isolated server so infrastructure churn stays separate from runtime failures.

The existing source-contract suite also passes: 7 tests, 0 failures.

## Initial legacy-renderer result

- Exact repository pipeline `npm test`: PASS, 9 tests, 0 failures, 142.2 seconds.
- The ten-chapter wrapper passed inside that pipeline and requires all 12 runtime checkpoints to pass: 10 chapter checkpoints, separate rhythm/dodge replay-abort checks, and the Korean/mobile/menu check.
- Current isolated `scripts/browser-check.mjs`: PASS, 8 checks, 0 errors.

## Run commands

```bash
node scripts/check-ten-chapters.mjs
node --test tests/ten-chapter-runtime.test.mjs
```

The regression driver changes test-page runtime setup only; story source remains governed by source contracts.

## Final upgraded-renderer result

Final `BASE_URL=http://127.0.0.1:43872 npm test`: **9 passed, 0 failed**, **60.8 seconds**. The wrapper required all **12** upgraded-renderer checkpoints to pass. Tests assert the actual `poor-man` and restored `david-king` role metadata. Separate final browser smoke: **8 passed, 0 errors**.

The initial fast-GPU run exposed test-clock races, not an exception in game code: RAF and manual steps both advanced story time. A subsequent manual-clock run exposed three remaining bare waits in sheep/convoy setup. All were converted to explicit stepping before the final full pass.
