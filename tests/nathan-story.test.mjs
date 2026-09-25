import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const chapter = source.slice(source.indexOf('const CH_NATHAN'), source.indexOf('const CHAPTERS ='));
test('Nathan preserves both judgments, confession, forgiveness and consequences without invented choices', () => {
  assert.ok(!chapter.includes('g.choose('));
  for (const text of ['shall surely die', 'restore the lamb fourfold', 'sword shall never depart', 'I have sinned against the LORD', 'The LORD also hath put away thy sin', 'forgiveness did not undo the harm', '피해까지 사라진 것은 아니었어요']) assert.ok(chapter.includes(text), text);
  assert.ok(chapter.indexOf('I have sinned') < chapter.indexOf('forgiveness did not undo'));
});
test('Three sequential lamp interactions preserve all five Psalm excerpts and the lamb sequence', () => {
  assert.match(chapter, /const prayers = \[lines.slice\(0, 2\), lines.slice\(2, 4\), lines.slice\(4\)\]/);
  assert.match(chapter, /const flames = \[S.P.flames\[0\], S.P.flames\[2\], S.P.flames\[4\]\]/);
  assert.match(chapter, /for \(const \[i, f\] of flames.entries\(\)\)/);
  assert.match(chapter, /Give the lamb water/);
  assert.match(chapter, /Pick up the lamb and carry it home/);
});
