# 굴 속의 시편 (Psalm 57) · scene 1 "날개 그늘", v2

Standalone review page `/psalm57.html`, not linked from the title menu. v2 replaces the v1 "walk along one line" greybox after Ethan found it flat and asked for benchmark-level (Fresco) gameplay and graphics.

## What it is

A 3D En-gedi cave and a 2D fresco on its back wall. David slips into the painting through a crack and becomes a painted figure who runs and jumps along the verse of Psalm 57:1, carved as ledges on three heights. Two of Saul's soldiers patrol the cave mouth with torches; their light sweeps the wall. Light = caught = back to the crack. The middle of the painted floor has fallen away (falling = back to the crack), so the only way across is up the ledges.

Shelters: the crack, the shadow under the painted wings over "주의 날개 그늘 아래에서", and the shadow of a clay jar standing on the cave floor. The last stretch ("이 재앙들이 지나기까지") has no shelter of its own: the player must step out of the wall, push the jar along the cave floor in 3D, and come back, so the jar's shadow falls on that stretch. This is the Fresco-style 3D↔2D interdependence. The jar's shadow slides opposite the torch, like a real shadow.

Only scene 1 exists. Scenes for 57:6 (net and pit) and 57:7 (holding still) and the 57:8 dawn exit are not built.

## Rules and evidence (src/psalm57-core.js, tests/psalm57-core.test.mjs)

Deterministic 60 Hz platformer physics (run, variable jump, coyote time, jump buffer, one-way ledges). Tested on a 16x6 grid of torch timings:
- no shortcut wins with the jar in any of its three positions (hold forward, run the route without waiting, skip the jar, floor only);
- the careful route cannot finish unless the jar was moved to the third position;
- with the jar in place, waiting in the crack, on the high ledge, under the wings and by the jar wins from every timing in under 40 s, and the jar shadow is actually used.
Measured safe windows for a human (per 56 s joint torch cycle): the dash from the wings to the jar has windows of 2.4-3.6 s, the final dash 1-2.8 s.

## Art

All procedural, no external or paid art: fresco wall drawn in code (night sky with gold-leaf stars, En-gedi cliffs, ibex, palms, the spring, painted wings with gold feathers, carved verse ledges, broken plaster), a relief normal map so torchlight rakes across carvings, gold specular, painted profile David sprite (idle, 6-frame run, jump) lit by the same light as the wall. 3D: the existing storybook `david.glb` (procedurally swung limbs), the existing rigged `warrior-refined.glb` with its Walk clip for the soldiers, a lathe clay jar, torch flames, embers, dust, and the Land of David post stack (bloom, grade, vignette; depth of field off).

## Scripture

개역개정 Psalm 57 (supplied by the user, matched word for word against the Korean Bible Society reader). The verse is split across six carved segments that rebuild verse 1 exactly (tested). Attribution on the ending card: "성경전서 개역개정판의 저작권은 대한성서공회에 있습니다." Public use of 개역개정 is a separate rights gate. Ending card separates what the text records from what the game imagined.

## Controls

Cave: tap the floor or WASD/arrows. E/Enter or the on-screen button for "벽 속으로", "항아리 밀기", "벽에서 나오기". Wall: ◀ ▶ and 점프 (hold for higher), or A/D, ←/→ and Space/W/↑. Keys use `e.code`.

## Verification status

Local only. Real-input browser runs on desktop (keyboard; an in-page frame-synced driver dispatching real keyboard events for the full route) and a 390×844 same-origin frame (tap-to-move, pad, jump, leave-wall). Not established: physical-phone performance and touch feel, fun, final art quality, menu integration, publication.
