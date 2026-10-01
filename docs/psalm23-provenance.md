# Psalm 23 ending: text and rights provenance

Checked 2026-10-01. This is exact Scripture text, not the game's explanatory paraphrase.

## Korean
- Edition: 성경전서 개역한글판 (1961), 대한성서공회. Not 개역개정.
- Psalm23:1–6 verified against the publisher: https://www.bskorea.or.kr/bible/korbibReadpage.php?linkBible=BHANpsa023003
- Publisher rights notice: https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1 explicitly lists the 1961 KRV economic-rights protection period as expired 2011-12-31. This does not claim permission for modern translations.
- Visible attribution: “성경전서 개역한글의 저작권은 대한성서공회에 있습니다.”
- Original orthography is retained, including “내가”, “쉴만한 물 가으로”, “다닐찌라도”, “정녕”. Do not silently replace these with wording from 개역개정.

## English
- World English Bible Updated, Psalm23:1–6: https://ebible.org/engwebu/PSA023.htm
- Public-domain statement: https://worldenglish.bible/ and the source page's Public Domain notice.
- Browser snapshot verified verse6 in full because initial text extraction omitted its first line.
- Capitalization LORD, punctuation, and words preserved. Poetic line breaks are joined within verses; six numbered paragraphs remain.

## Rendering
src/psalm23.js stores six verses in each language and provenance URLs. The final chapter's ending card presents the identity reveal first, followed by the whole Psalm and translation attribution. It removes the game's generic “쉬운 말 풀이” label only on this exact quotation and does not change the citation treatment of Chapters1–10. Final reflective questions are omitted so the Psalm closes the story. No remote text or service is needed at runtime.
