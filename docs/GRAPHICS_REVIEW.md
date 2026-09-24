# Ten-chapter graphics review

## Baseline and release boundary

- Gameplay baseline: `origin/main` at `9c607ebc597a3594546d647b3688401c3f0ef0b4`.
- Integration commit: `2b257e3`. The old four-chapter graphics branch is no longer the gameplay baseline.
- This is a review branch and draft PR. Production/main must remain unchanged.
- Rendering, characters, props, presentation cameras, and cleanup are changed. Dialogue, questions, story branches, collision geometry, movement, sling/bow rules, and progression are protected by source contracts.
- Two explicitly allowlisted lifecycle calls clean up rhythm/dodge DOM and keyboard listeners on chapter switch.

## Implemented coverage

| Chapter | Presentation changes |
|---|---|
| 1 Bethlehem | Detailed young David and sheep, grass/olive variants, sheepfold composition, terrain shading, exploration-camera terrain clearance |
| 2 Elah | Character/armor tiers, giant silhouette retained, terrain and rock/olive framing; sling aim unchanged |
| 3 Harp | Palace materials, light hierarchy and tighter cinematic framing; seven-string handheld lyre; seated knees |
| 4 Jonathan | Jonathan identity and original covenant costume colors, indoor/outdoor profiles; bow and hand attachments retained |
| 5 Engedi | Adult fugitive, outdoor terrain/stone treatment and readable fog; original cave/detection/cover preserved |
| 6 Abigail | Distinct Abigail/adult David, supporting actors, landscape material/framing treatment |
| 7 Ziklag | Charred roof beams, bounded smoke/embers on existing town homes; original night pursuit/fire state retained |
| 8 Ark | Shared adult/crowd treatment, terrain and olive framing; procession path/spacing unchanged |
| 9 Table | Royal David, palace/table value separation, seated crowd promotion without replacing actor/controller identity |
| 10 Nathan | Nathan, king and separate poor-man model, palace/outdoor/night profiles; extra lights disabled during lamp-lighting prayer |

## Verified locally

- Fast unit checks: 7 source contracts plus 1 knee-triangle clipping test passed. The complete `npm test` also runs the 12-checkpoint narrative wrapper.
- `npm run test:browser`: 8 checks passed, including all 10 chapter builds, sheep follow/fold counting, all 19 poses, actual UI start and keyboard movement, actual sling key input, reload stability and emulated touch rendering.
- `npm run test:graphics`: all 10 chapter identities and finite transforms; night supplemental lights off; cinematic input-vector immutability; four reload cycles stable at 330 GPU geometries / 5 textures in the tested view.
- Independent construction/update audit: covenant blue cloak/gold sash preserved; ineligible GLB options stay procedural; tinted GLB materials are reused; chapter-nine seated prince keeps the same model/root/actor and no longer sinks deeply below ground.
- All 10 paused review views captured without page errors.
- Independent AI visual review: improvement PASS; coherent playable preview PASS; final representative-frame reference-style gate PASS. A misleading detached-cloth artifact and diagonal knee strips were isolated and fixed. This is visual review of the captured scenes, not a claim of human art approval or every narrative camera state.
- Final upgraded-renderer run: `npm test` **9/9 passed**, including all **12 assisted narrative checkpoints**, in **60.8 seconds**. This is not an unassisted full playthrough.

## Performance method

`npm run bench:graphics` uses Chrome's Apple Metal backend at 1440×900, pixel ratio 1. Each staged scene is animated without running its narrative: 180 warmup frames followed by 360 measured frames. This is desktop render evidence, not an uninterrupted playthrough or physical-phone result. Cold setup time is reported separately; long frame gaps are not silently discarded.

Final local result: all ten median frame times **16.7 ms** (about 60 fps). P95 ranged **17.3–18.2 ms**; the largest observed frame was **33.2 ms**. No page errors. Renderer: **ANGLE Metal Renderer: Apple M4**.

| Scene | Median ms | P95 ms | Draw calls |
|---|---:|---:|---:|
| bethlehem | 16.7 | 17.3 | 162 |
| elah | 16.7 | 18.2 | 169 |
| harp | 16.7 | 17.3 | 89 |
| jonathan | 16.7 | 18.1 | 47 |
| engedi | 16.7 | 17.5 | 16 |
| abigail | 16.7 | 17.9 | 258 |
| ziklag | 16.7 | 17.4 | 75 |
| ark | 16.7 | 17.8 | 319 |
| mephibosheth | 16.7 | 17.6 | 229 |
| nathan | 16.7 | 18.0 | 87 |

## Release gates

- [x] Latest ten-chapter baseline integrated locally.
- [x] Ten-chapter rendering and source contracts.
- [x] Desktop controls and emulated touch smoke checks.
- [x] Independent role/costume/seated-pose fixes rechecked.
- [x] Final narrative checkpoint report. Preview deployment verification is tracked by the latest PR Vercel check, separately from production approval.
- [ ] Human visual acceptance: the initial AI review missed comical faces; revised faces require user review.
- [ ] Physical phone: named device/browser, sustained play, thermal behavior and frame-time capture.
- [ ] Human complete playthrough across all story branches and touch interactions.

## Known limits

- Existing procedural pose animation plus knee articulation, not authored skeletal clips or foot IK. Small foot/cloth intersections may remain.
- Lazy promotion gives seated/kneeling crowd actors articulated limbs; distant standing crowds keep the cheaper four-mesh LOD.
- Donkey, ibex and lion remain original models.
- Automated narrative checks may set up checkpoints, teleport or step simulation. They must not be presented as an unassisted full playthrough.
- Review URLs are deliberately staged stills. They neither run narrative nor write save progress.

## Face correction after user review

The user rejected the expressions as too comical. The earlier AI visual PASS was therefore insufficient. Removed protruding white eyeballs, reduced and flattened eyes, leveled brows/mouths, shortened the young David nose, reduced moustache exaggeration, and raised hair/headcover edges so the eyes remain visible. No story, pose, role or controller behavior changed. `/?review=face` provides a face-focused still. Human acceptance remains pending; do not infer approval from automated tests.

## Second refinement pass after checkpoint

Checkpoint `graphics-neutral-faces-2026-09-24` preserves `a32f998` on GitHub. This pass deliberately keeps the face/head/hair source byte-identical to that checkpoint.

- Continuous fitted tunics, connected neck/shoulder transitions, elliptical sashes and draped cloaks replace primitive cylinders/floating strips.
- Outward-facing cloth caps are tested for both tunics and reversed sleeve profiles. A manual screenshot check caught and fixed an initial open-neck/inverted-cap defect.
- Mirrored palm/thumb silhouettes preserve original hand pivots; the lyre support point now coincides with the palm rather than an approximate visual offset.
- Seated cloth morphs raise/fold the garment over the lap; the underlying knees/controller remain unchanged. Playing-hand offsets distinguish supporting and plucking hands.
- Quiet, antialiased stone/plaster/linen detail uses world-space material shaders, not downloaded textures or extra lights.
- The graphics regression now points the camera at each chapter before drawing and collects shader console errors, rather than merely loading a scene.

Validation: 16-test full suite including all 12 assisted narrative checkpoints passed; subsequent grip geometry test also passed. All 10 chapter graphics checks passed; reload resources plateaued at 534 geometries / 44 textures after full cache warmup (morph targets use internal GPU textures). Three palace benchmarks on M4/Metal/1440×900 retained 16.7 ms median, 17.3–17.4 ms P95, with no added draw calls in the measured views. These are desktop staged-view measurements, not phone evidence.

Independent before/after review saw gains but flagged seated readability and hand overlap. Follow-up lap deformation and exact grip anchoring address those observations; this does not establish user art approval. Human review, complete playthrough and physical-phone gates remain open. Production stays unchanged.

## Executable ten-style lab

`style-lab.html` compares 20 screenshots rendered from the actual game (two scenes × ten styles), not generated concept art. `?review=nathan&style=01` through `10` run the implementations. The module is only imported inside the review branch; no gameplay implementation is replaced. Existing character/face geometry is unchanged. 09 uses a separate orthographic review camera and an indoor upper-wall/ceiling cutaway.

Styles: original baseline, toon, ink outline, clay material, procedural wood, quarter-resolution pixel 3D, paper material, flat face normals, orthographic cutaway, crosshatched ink. Material treatments do not imply new sculpted assets. Pixel 3D does not imply hand-drawn sprites. Flat shading does not reduce geometry counts.

All 20 captures passed page/shader-console checks on Chrome/M4 Metal. Independent source review found a wood-shader variable collision; capture validation also exposed legacy grass's smooth-normal injection under flat shading. Both were fixed and the full capture matrix passed again. Initial orthographic framing hid the actors behind the ceiling; the final indoor cutaway was visually rechecked. These are review prototypes, not ten approved full-game themes. Sustained physical-phone performance, moving-scene shimmer, and gameplay camera integration remain untested.
