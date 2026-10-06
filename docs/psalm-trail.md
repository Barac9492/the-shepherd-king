# 시편의 길

Standalone local-first Psalm 23 typing and recall game at `psalm-trail.html`.

## Content

Six verses, `PSALM23.ko` from `src/psalm23.js`, unmodified. Edition: 성경전서 개역한글판 (1961), not 개역개정 or 새번역. Keep historical spelling (쉴만한 물 가으로 / 다닐찌라도 / 정녕). See [existing provenance](psalm23-provenance.md). Landscape waypoint labels are navigational artwork, not quotations or an assertion of literal geography.

## Learning loop

- 따라쓰기: full verse remains visible.
- 초성 힌트: Hangul syllables become their initial consonants.
- 가리고 암송: reference only unless the player reveals the verse.
- Submit through explicit check or non-composing Enter. Correct completion creates a checkpoint; explicit next advances.
- Hints and corrections are remembered for this run. Results are typing/recall-session observations, not a claim of memorization, faith or spiritual maturity.
- No time limit, leaderboard, account, remote request, audio, persistent score or submitted student data.

This feature does not alter the existing `dance.html` prescription, story, or co-op games.

## Validation

Run `node --test tests/psalm-trail-core.test.mjs` and, against a local server, `BASE_URL=http://127.0.0.1:44961 node scripts/check-psalm-trail.mjs`. The existing title-menu regression includes the new route. Browser synthetic composition/touch checks do not establish physical IME or phone acceptance. Product/fun/visual approval remains distinct from test success.

## Release

This implementation is local-only until explicit publication approval. Keep all logs/screenshots outside the repository. Public release requires revalidation with current main and source/attribution retention.
