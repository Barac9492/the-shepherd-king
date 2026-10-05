# Three-entry title menu — local review

Fresh main base: `fd6dc5a5eeb284f2608156b24f7f65978b5e6b41`.
Branch: `codex/three-entry-menu`. This change is local only: no push, PR, merge, deployment or production database write.

The first screen has exactly three main entries: 스토리, 챌린지, 산책. Language controls remain available.

- Story contains the existing start/continue action and all eleven chapter selections.
- Challenges contains 물맷돌 챌린지, 다윗 댄스 챌린지, 엔게디 잠입 챌린지, in that order. The standalone title ranking button is removed. Sling ranking opens from its own lobby and returns there with keyboard focus restored. Dance and En-Gedi retain their own ranking controls, available before playing or submitting.
- Walk contains the existing walk plus a Garden of Peace shortcut through its existing introduction/entry flow. Garden → walk → title and the original in-walk garden entry remain available.
- Submenu back/Escape restores the category button; returning from games restores the category and relevant entry. Dance exit, including its in-progress confirmation, returns to challenge selection.

Only navigation/UI and the tests that follow these paths changed. API, server, database migrations and all three score/simulation core modules have no diff from the base.

## Reference image

User image `libfile_574e2cb438008191b954449e835a4580`, version 0, was downloaded using the current Library materialization helper to the Mac workspace at `../menu-reference/1000019333.jpg`, with Library identity metadata applied. Its actual pixels were inspected before implementation. It showed the long vertical title list and standalone ranking button.

## Validation

All commands completed with exit 0 on the local checkout:

- Core/story suite, same complete CI scope: **311/311**, zero skipped/failed.
- Existing runtime wrappers: **3/3**, covering **15 exploration**, **19 garden**, **14 sling challenge** scenarios.
- New title menu suite: **15/15** at desktop 1280px, 390px and 320px. Includes exactly three entry labels, hidden lower-level controls, chapter access, Escape/focus, real touch events, browser back, ranking GETs without scores, game exit/re-entry, garden return, saved progress, language and overflow.
- Dance **15/15**; En-Gedi **13/13**; separate ranking replay/ephemeral PostgreSQL **10/10**.
- Existing sling ranking **10/10**; consent/submission fixture UI **5/5**.
- `git diff --check`: clean.

The initial full run found an old test clicking the story start button directly from the title; its navigation path now goes through Story and the full 311-test suite passed again. Dance verification also found that the in-progress leave confirmation used the old root URL; it now follows the same challenge-selection destination as the ordinary leave link. Tests were rerun after the fix.

The API fixtures and ephemeral local database received test requests only. No real production attempt/score was created. Physical mobile hardware and native OS Korean IME were not tested; existing composition/touch emulation checks remain intact. Remote CI was not run because this request does not authorize a push.

## Actual local screenshots

- [Desktop first screen](../test-results/title-menu/main-1280.png)
- [390px first screen](../test-results/title-menu/main-390.png)
- [320px first screen](../test-results/title-menu/main-320.png)
- [320px challenge selection](../test-results/title-menu/challenges-320.png)
- [390px walk selection](../test-results/title-menu/walk-390.png)
- [Menu verification JSON](../test-results/title-menu/report.json)

Local preview: http://127.0.0.1:44935 . The production deployment remains the previously released main commit. This local branch requires a separately authorized future integration/release.
