import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Bethlehem is a separate seventh challenge link, not a story replacement',()=>{
 const html=read('index.html');
 const menu=html.match(/<section id="menuChallenge"[\s\S]*?<\/section>/)?.[0];
 assert.match(menu,/<a class="btn" id="bBethlehem" href="\.\/bethlehem-water\.html">베들레헴의 물 · 잠입<\/a>/);
 assert.equal((html.match(/id="bBethlehem"/g)||[]).length,1);
 assert.ok(menu.indexOf('bBethlehem')>menu.indexOf('bKeilah'));
 for(const id of ['bChallenge','bDownfall','bDance','bPsalmTrail','bKeilah'])assert.ok(menu.includes('id="'+id+'"'));
});
test('challenge entry is translated and both episode exits return to challenges',()=>{
 assert.match(read('src/title-menu.js'),/bBethlehem/);
 assert.match(read('src/title-menu.js'),/Water from Bethlehem · Stealth/);
 assert.match(read('bethlehem-water.html'),/<a href="\.\/\?menu=challenge" aria-label="다윗 게임 홈">/);
 assert.match(read('src/bethlehem-water.js'),/location\.href='\.\/\?menu=challenge'/);
});
