# Mobile input reliability pilot

## Status and identity

**Pre-release automated verification passed. Physical-device acceptance remains unverified.** This document records the validation before release; deployment history is tracked separately.

- Base: `ecca6646c1f1a2aa3ba3e0258f1d0883492ba600`, the currently released original-A/Chapter1 upgrade.
- Isolated branch: `aside/mobile-input-20260925`.
- Candidate `index.html` SHA-256: `0051212b620a43f74c089bfeeb827022290d33ce8f0f696131ec2e81fab49561`.
- Only the `Input` class changes. All bytes outside that class match the base, and existing gameplay source contracts pass unchanged.
- No native tools installed. Runtime code was unchanged during native verification; this report was then updated with the results. Publication requires separate final confirmation.

## Reproduced and repaired

1. A blur/interruption left the movement stick held and could release a charged stone unintentionally.
2. Sling pointer cancellation was treated like an intentional release and fired a projectile.
3. Unexpected pointer-capture loss left controls held.
4. A second finger could steal an existing joystick or sling owner.

Each joystick, sling, mouse-drag and camera-look gesture now retains its owner. Abnormal cancellation aborts aim without throwing. Blur, hidden visibility, pagehide and orientation changes neutralize held input; ownership is cleared before captures are released, so synchronous lost-capture callbacks are harmless.

Normal pointer-up still throws exactly once, including the subsequent automatic lost-capture event. Independent joystick movement remains active during a deliberate sling release. Mouse and keyboard F retain normal behavior and recover after interruption. The running button remains a selected toggle, not a held input, so its selection deliberately survives interruptions.

Aim cancellation clears crosshair/charge/canvas aiming state and visible sling objects. This does not change the native `updateAim` or projectile implementation, character/animation, collision, story, save logic, Chapter1 steering/camera or rendering budgets.

## Evidence

- Final focused suite: **22 tests**. Against immutable base HTML: **18 fail, 4 pass**. Against candidate: all pass as part of the full nonbrowser run.
- All nonbrowser tests: **73/73 pass**, exit 0, including prior gameplay/source contracts.
- Final native run from the user's Terminal: **74/74 pass** (including the 12-checkpoint narrative wrapper), core browser **8/8**, graphics regression across 10 chapters **PASS**, production identity/cleanup **5/5**. Candidate source/test/document checksums matched before and after the run. Evidence: `native-mobile-verification.json` and `native-mobile-verification.log`. Only this report changed afterward; Input and test files retain their verified hashes.
- Matched browser fixture, 390x844, coarse-pointer/touch-capability setup: base **1/6**, candidate **6/6**, no page errors.
- Actual in-browser Input/updateAim/throwStone results include:
  - Blur: base retains movement 0.9 and spends a stone; candidate movement 0, stones remain 5.
  - Sling cancellation: base creates one projectile; candidate creates none.
  - Secondary joystick pointer: base reverses direction from +0.9 to -0.9; candidate preserves +0.9 until the owner releases.
  - Intentional release: one projectile, four stones remaining, independent movement preserved.
- Independent read-only review: no source blocker for this local pilot. Requested coverage for keyboard/mouse, capture release, independent cancellation, touch-look recovery and visuals was added.
- A baseline test initially reached an incomplete fixture stub on mouse capture loss. An explicit cancellation-state assertion replaced that ambiguous failure; final baseline has no TypeError/ReferenceError and still produces 18 genuine assertion failures. Earlier evidence is preserved separately.

Evidence files in this session temporary directory: `mobile-input-before.log`, `mobile-before-harness-correction.log`, `mobile-final-before.log`, `mobile-all-units.log`, `mobile-browser-fixture.log`, `mobile-input-contract.md`.

## Reproduction and limits

```sh
node --test tests/mobile-input.test.mjs
node --test $(find tests -name '*.test.mjs' ! -name 'ten-chapter-runtime.test.mjs')
```

The VM tests run the exact Input/updateAim source with controlled fixtures. Browser tests use synthetic pointer events and explicit gameplay input setup. They are not trusted physical input, native phone Safari/Chrome, a complete chapter playthrough, or performance measurements.

Full native browser regression on this new candidate **passed**. Earlier ecca664 results were not reused to certify the changed Input class. Version-specific final approval is still required for publication. Actual-device behavior and user acceptance remain separate and unverified; the user requested post-deployment manual checking.

This is the first reliability fix, not completion of mobile-first work. Portrait/landscape layout, simultaneous real multitouch aiming, interruption recovery on actual phones, thermal behavior and sustained frame times still need device validation. Do not claim mobile optimization, auto-aim improvements, reduced heat or performance gains from these results.

Local `_local-*` browser adapter/baseline files are test-only and excluded from the proposed patch.
