# 굴 속의 시편 (Psalm 57) · scene 1 greybox

Standalone local page `/psalm57.html`. Not linked from the title menu. Greybox art (primitive figures, canvas-painted wall).

## What it is

David hides in the En-gedi cave and steps into Psalm 57 carved on the wall. On the wall he is a flat figure walking on the letters of verse 1. A soldier's torch patrols the cave mouth; its light sweeps the wall. Anywhere the light reaches is exposed, except the crack at the left end and the shadow under the painted wings over "주의 날개 그늘 아래에서". Exposed means back to the crack. Reach the opening at the right end to finish. No score, timer, ranking, save or network call.

Only scene 1 (57:1) exists. Planned scenes 2 (57:6, net and pit) and 3 (57:7, holding still) and the dawn exit (57:8) are not built.

## Scripture

- 성경전서 개역개정판, Psalm 57:1-11 and superscription, supplied by the user on 2026-10-09 and matched word for word against the Korean Bible Society reader (version=GAE). Stored in `src/psalm57-text.js`; the test keeps an independent copy of verses 1, 7 and 8.
- The wall splits verse 1 into three segments; joined with spaces they equal the verse exactly (tested). Wording is never changed for layout.
- Attribution shown on the ending card: "성경전서 개역개정판의 저작권은 대한성서공회에 있습니다." Public use of 개역개정 is a separate rights gate, as with Psalm Trail.
- Recorded vs imagined lists on the ending card: the superscription records only "a cave"; En-gedi, the wall art, the torch and the light rule are imagined.

## Rules (src/psalm57-core.js)

Pure, deterministic, 60 Hz fixed tick. Wall length 48 units; player 4 u/s; torch patrols -4..52 at 5 u/s (period 22.4 s); exposure radius 3.2. Shelters: crack 0-2.2, wings 26.4-33.0. Exit 46.5. The same torch function drives the shader light. The bright core of the light is the exposure radius; outside it there is only a faint warning halo. Shelter shadows soften inward only, so exposed ground never looks shaded. HUD strip zones and the intro superscription are generated from the core and text modules.

Tested properties (`node --test tests/psalm57-core.test.mjs`):
- holding forward the whole way is caught for at least 80% of 48 torch phases (measured: 36/480 wins = 7.5% on a fine sweep, each of them sheltered by the wings);
- across 240 phases and three strategies, no win happens without the light passing over the player while under the wings;
- waiting in the crack and under the wings wins from every phase in under 60 s (default entry about 16 s);
- the default entry sweeps the light over the crack within 6 s so the first lesson is "the crack hides you".

## Controls

Cave: tap the floor or WASD/arrows (`e.code`). Near the crack: "벽에 새겨진 시편 속으로" or E/Enter (repeat-guarded). Wall: hold ◀ ▶ or A/D, ←/→. Portrait phones get a wider cave lens; in the wall view the cave-mouth geometry and fog are hidden so the pulled-back camera can frame the wall.

## Verification status

Local only. Live browser checks used the real page on a local server (desktop 1440 wide and a 390×844 same-origin frame with tap and on-screen pad). Not established: physical phone touch/performance, fun, visual quality, menu integration, publication.
