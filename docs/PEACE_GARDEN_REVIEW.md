# 평화의 동산 — encounter activities review

## Scope and provenance

- Repository: `Barac9492/the-shepherd-king`; isolated branch `feat/peace-garden`.
- Original base: freshly verified main `a3e86707981a0249a2e9bf4654e877fb03c47ef4` (PR #11 walking mode). Production HTML and walking module/CSS matched its bytes before work began.
- This user-requested revision supersedes `80e5072eba6743597576d2c1047efb4731924a74` as the deployment candidate. The branch includes that initial implementation plus this revision; deploy only the tested final branch tip after approval.
- No other checkout or church app was modified. No push, PR publication, merge, deployment, remote database change or online score submission.

## Experience

Open **다윗과 산책하기 → 평화의 동산으로**. There is no initial pet selector, friendship unlock or animal-location beacon. Wander through the garden and approach an animal; a nearby E/touch prompt offers a small optional activity. Merely meeting, petting or invoking follow cannot grant friendship.

| Encounter | Small activity | Friendship earned |
|---|---|---|
| 어린 양 | Walk together to the two grazing sheep in the meadow, then greet the flock | At the reunion |
| 사자 | Stroll to two visible flower beds and enjoy each view together | After the second stop |
| 이리 | Find the wolf in two hiding places around the olive tree and rocks | After the second greeting |

An accepted activity shows a gentle objective and completed-step count. Wolf clues are textual, with an optional trail hint. Activities have no time limit, combat, damage, death, failure or scores. **나중에 이어하기** is always available; the menu, verse card, home and exit routes also remain available. After becoming friends, pet/play/follow/rest controls unlock. Existing friends do not block encounters with other animals. Only one animal follows at a time.

Activity checkpoints and friendship are stored under the separate local key `david-peace-garden-v1`; historical chapter progress is never read or changed by the journal. Cancel, exit, home and reload preserve completed steps. Resuming is optional when the animal is met again. Invalid journal data is rejected. If browser storage is denied, play continues with page-session memory and the guide explains the limitation. There is no server persistence or personal data.

## Scripture

The approved short Isaiah 11:9 quote and Korean attribution remain unchanged. Entry and in-mode **말씀 읽기** expose the sources. The text explicitly says these encounters and activities are creative expressions, not events from David’s historical life. The direct basis is Isaiah 11:6–9 and 65:25, not a literal Revelation scene; the mechanics make no claim about universal salvation.

- https://www.bible.com/ko/bible/88/ISA.11.KRV
- https://www.bible.com/ko/bible/88/ISA.65.25.KRV

## Implementation and lifecycle

The garden owns a separate small world, five actors (three encounter animals and two flock sheep), instanced scenery/flowers and one update callback. It reuses the existing David, lion/sheep art, controls, pause, sound and camera. The low-poly wolf and flowers are local procedural geometry. No dependency or downloaded asset was added.

Navigation uses a bounded grid with body clearance and safe segment smoothing. Follow targets update at most twice per second; the wolf uses the same safe paths. Mobile task content scrolls independently above the verse/back controls and stays clear of the joystick. Walking and garden guidance share an accessible disclosure: collapsing leaves one 44px touch target while independent interaction prompts and activities keep running. Automatic route, objective and language updates preserve the collapsed choice; a new mode starts expanded. Reopening restores scripture and navigation controls. Completed friendship controls can also collapse on touch devices. The native verse modal contains keyboard focus, pauses the activity and clears held inputs.

Session callbacks are guarded by their token and disposed on departure. Activity and companion movement stop on cancel/exit. Materials and instance resources are disposed at actual world removal after title/story fades, preventing premature disposal/recreation. Local memories outlive these disposable scene resources.

## Verification

Independent browser: Playwright-controlled **Google Chrome 154.0.8037.93**, headless, ANGLE Metal, on the connected Mac. Views: desktop 1280×800, mobile emulation 390×844 and 844×390. Screenshots were inspected visually, including discovery, activities, completion and mobile controls. Scripted approach and deterministic route stepping are used for coverage; keyboard movement, real browser taps and synthetic simultaneous joystick/look pointers are tested separately.

`BASE_URL=http://127.0.0.1:44018 npm run test:garden` covers 19 scenario groups:

- Exact verse, creative-activity explanation, focus loop, Escape/back and cancellation.
- No initial selector, beacon, friendship or forced activity; no shortcut to friendship via pet/follow.
- Lamb reunion, both lion stops, both wolf rounds and optional hint; no premature completion.
- Cancel/resume, mid-activity departure, page reload, completed encounters and earned follow/rest/play.
- Collision-safe activity routes, player bounds, companion detours, menu/help/language and home.
- Repeated entry/exit, direct menu-to-title fade cleanup, progress isolation, unchanged story tutorial and fixed challenge lesson.
- Touch task acceptance/completion, joystick/look cancellation, portrait/landscape layout, leaving mid-task.
- Guidance disclosure in both desktop and touch layouts: repeated toggles, keyboard focus, no leaked input, route/language update persistence, rotation and activity completion while collapsed.
- Legacy graphics, reduced motion and denied journal storage.

Four garden re-entry cycles remain at 1 updater, 1 disposer, 89 geometries and 10 textures. This desktop garden view uses 68 draw calls and 43,476 triangles. Garden API requests are zero; challenge handoff makes only a GET to the local fixture's record endpoint.

The activity journal and navigation unit tests cover earned friendship, independent storage, checkpoint restoration, corrupted/invalid data, denied storage and safe paths around all garden obstacles. Full-suite results and exact screenshot Library IDs are in the final delivery evidence outside the checkout. No failing assertion is removed and no test is skipped for acceptance.

## Remaining validation

Actual iPhone/Android multitouch, Safari, long-session thermal/battery/frame pacing and a human full-story playthrough are not tested. Emulation and the desktop render budget are not physical-device performance evidence. Publication awaits approval of the revised tested commit.
