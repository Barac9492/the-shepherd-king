import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Land of David is a separate Walk-menu world, not a story chapter or challenge',()=>{
 const html=read('index.html');
 const walk=html.match(/<section id="menuWalk"[\s\S]*?<\/section>/)?.[0];
 const challenge=html.match(/<section id="menuChallenge"[\s\S]*?<\/section>/)?.[0];
 assert.match(walk,/<a class="btn" id="bLandOfDavid" href="\.\/land-of-david\/">다윗의 땅 · 성경 지도 월드<\/a>/);
 assert.ok(!challenge.includes('bLandOfDavid'));
 assert.equal((html.match(/id="bLandOfDavid"/g)||[]).length,1);
 for(const id of ['bExplore','bGardenMenu'])assert.ok(walk.includes('id="'+id+'"'));
 assert.match(read('src/title-menu.js'),/Land of David · Bible Map World/);
});
test('world reuses the shared three.js build and returns to the Walk menu',()=>{
 const page=read('land-of-david/index.html');
 assert.match(page,/"three": "\.\.\/vendor\/three\.module\.js"/);
 assert.equal((page.match(/href="\.\.\/\?menu=walk"/g)||[]).length,2);
 assert.match(read('land-of-david/src/scene.js'),/'\.\.\/\.\.\/vendor\/BufferGeometryUtils\.js'/);
 assert.ok(!fs.existsSync(new URL('../land-of-david/vendor',import.meta.url)));
});
test('world keeps its own save key so story progress is untouched',()=>{
 const main=read('land-of-david/src/main.js');
 assert.match(main,/'david-hd2d-v1'/);
 assert.ok(!main.includes("'david-progress'"));
});
