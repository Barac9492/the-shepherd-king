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
- [x] Independent representative-frame stylized-quality review. Human approval remains separate.
- [ ] Physical phone: named device/browser, sustained play, thermal behavior and frame-time capture.
- [ ] Human complete playthrough across all story branches and touch interactions.

## Known limits

- Existing procedural pose animation plus knee articulation, not authored skeletal clips or foot IK. Small foot/cloth intersections may remain.
- Lazy promotion gives seated/kneeling crowd actors articulated limbs; distant standing crowds keep the cheaper four-mesh LOD.
- Donkey, ibex and lion remain original models.
- Automated narrative checks may set up checkpoints, teleport or step simulation. They must not be presented as an unassisted full playthrough.
- Review URLs are deliberately staged stills. They neither run narrative nor write save progress.
