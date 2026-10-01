import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('epilogue appends after ten existing chapters, before Game construction, in both graphics modes',()=>{
 const factory=src.indexOf('const myShepherdChapter = createMyShepherdChapter(');
 const push=src.indexOf('CHAPTERS.push(myShepherdChapter)');
 const game=src.indexOf('game = new Game(); window.GAME = game;');
 assert.ok(factory>src.indexOf('installChapterOneUpgrades({ THREE, Game, CH1 })'));
 assert.ok(push>factory&&game>push);
 assert.match(src,/const CHAPTERS = \[CH1, CH2, CH_HARP, CH_JON, CH3, CH_ABI, CH_ZIK, CH4, CH_MEPH, CH_NATHAN\]/);
 assert.match(src,/STR\.chapterN\.push\(\{ en: 'Chapter Eleven', ko: '제11장' \}\)/);
 assert.match(src,/chapterKeys\.push\('my-shepherd'\)/);
 const camera=src.indexOf('installMyShepherdCamera({ THREE, Game, chapter: myShepherdChapter })');
 assert.ok(camera>push&&camera<game);
 const lifecycle=src.indexOf('installChapterLifecycle(Game)');
 assert.ok(lifecycle>=0&&lifecycle<factory,'real Game cleanup hook must be installed before finale factory and Game construction');
});
test('tutorial is post-build assistance, never replaces original sling or first-chapter story',()=>{
 assert.match(src,/installSheepTutorial\(\{ THREE, CH1, FOLD \}\)/);
 assert.match(src,/await g\.waitFor\(\(\) => S\.lionHits >= 3\)/);
 assert.match(src,/g\.enableSling\(true, 5, 5\)/);
 assert.match(src,/await g\.waitFor\(\(\) => S\.inFold >= 7\)/);
});
test('last chapter relies on existing progression/card logic, does not reset saves or add external services',()=>{
 const additions=src.slice(src.indexOf('// Tutorial assistance and the epilogue'),src.indexOf('game = new Game(); window.GAME = game;'));
 assert.ok(!additions.includes('localStorage'));
 assert.ok(!additions.includes('https:'));
 assert.match(src,/else if \(idx < CHAPTERS.length - 1\)/);
 assert.match(src,/this\.saveProgress\(i \+ 1\)/);
});
