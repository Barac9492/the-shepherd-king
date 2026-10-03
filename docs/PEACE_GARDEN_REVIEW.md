# 평화의 동산 — local implementation review

## Scope and provenance

- Repository: `Barac9492/the-shepherd-king`.
- Fresh remote main verified before clone: `a3e86707981a0249a2e9bf4654e877fb03c47ef4` (PR #11 walking mode).
- Isolated branch: `feat/peace-garden`. No old checkout was modified.
- Production HTML, `src/david-exploration.js`, and `src/david-exploration.css` were fetched read-only and matched the fresh main bytes before editing.
- No production deployment, push, PR publication, merge, remote database changes, or online score/attempt submission.

## What is implemented

Open **다윗과 산책하기 → 평화의 동산으로**. The optional introduction can be cancelled without rebuilding the walk. Entering creates a separate small world, with the existing David and lion/lamb art plus a local low-poly wolf. No dependency or external asset was added.

Select a lion, lamb, or wolf. Walk toward the marker, pet with E or touch, play together, invite one companion to follow, or sit and rest. Choosing another animal lets the previous companion rest. All friendships are session-local. The garden has no combat, damage, failure, score, countdown objective, or chapter completion. The normal walking position and camera are restored on return. Story and challenge entry remain in the original flows.

The introduction and in-mode **말씀 읽기** show the exact approved Isaiah 11:9 quote and Korean attribution. The explanation explicitly distinguishes the imaginative activity from David’s historical life. Direct references are Isaiah 11:6–9 and 65:25, not Revelation. No claim about universal salvation is made.

Sources checked:

- https://www.bible.com/ko/bible/88/ISA.11.KRV
- https://www.bible.com/ko/bible/88/ISA.65.25.KRV

## Design and lifecycle

- Existing movement, run, camera, sound, pause and touch controls.
- Native modal with a focus loop, Escape/back, cleared held inputs and paused world; repeat access from the garden.
- Mobile details collapse to keep the animals visible. Panels scroll above the joystick in landscape. Buttons are at least 44 CSS pixels high.
- Companion movement uses a bounded precomputed grid, inflated obstacle clearance and safe segment smoothing. One companion repaths at most twice per second; ambient play uses bounded hops. Reduced motion disables hops.
- Three actors, instanced plants, shared existing assets, 90-segment terrain. The garden owns its update callback, material and instance cleanup. It does not register story scripts or save progress.
- No changes to church files, backend/API, database code, or challenge implementation.

## Verification

Independent browser: Playwright-controlled **Google Chrome 154.0.8037.93**, headless, ANGLE Metal, on the connected Mac. Mobile means browser emulation, not a physical phone. Approach/pathing checks include scripted positioning and deterministic update stepping; keyboard walking and touch pointer handling are exercised separately.

`BASE_URL=http://127.0.0.1:44018 npm run test:garden` (screenshots were also captured with `SHOTS=../evidence` during browser QA and visually inspected):

- 14 scenario groups passed; no browser JavaScript errors.
- Intro/cancel/re-entry; exact verse/reference and source links; Tab/Shift-Tab and Escape; modal pause and focus restoration.
- Desktop keyboard, run, camera drag; touch interaction, joystick/look pointer ownership, cancellation and orientation reset.
- All three animals: pet, play, follow, rest; selection switching; bounded player movement; collision detour and entry recovery.
- Direct pause-menu→title exits also verify cleanup after the fade and successful re-entry.
- Four repeated garden→walk→garden cycles: 1 updater, 1 disposer, 89 geometries and 10 textures, stable on every cycle. Desktop garden: 49 draw calls / 33,728 triangles in this view.
- Companion detour: minimum obstacle surface distance 1.035 units (required body clearance .85); ends 2.614 units from David; world radius stays at 24.
- Existing story starts with sheep tutorial restored. Challenge lesson keeps its fixed arena. Saved chapter `6` survives entry/exit and story handoff.
- Garden makes zero API requests. Subsequent challenge verification makes only one GET to the local fixture record endpoint; no score writes.
- 390×844 portrait, 844×390 landscape, 1280×800 desktop, legacy graphics, reduced motion. A separate hybrid-input check verifies that a touch-capable desktop with a fine primary pointer can expand and collapse the animal controls.

`node --test tests/peace-garden-navigation.test.mjs`: 2 tests passed, including safe paths between 24 pairs around the garden and rejected unreachable/outside targets.

The first full `npm test` run passed all 264 tests. A concurrent rerun stalled in browser checks and was stopped; the subsequent complete serial run passed 264/264. The final post-fix full-suite result and screenshot Library IDs are recorded in the delivery evidence outside the checkout and in the final handoff. No failing assertion was suppressed or test skipped to obtain a passing result.

## Remaining validation / release gate

Physical iPhone/Android multitouch, thermal load, battery use, long-session frame pacing and Safari are not tested. Browser emulation and the desktop GPU render budget do not establish physical-device performance. Production publication remains subject to deployment approval.
