import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Land of David is the first, NEW-badged main-menu entry and no longer inside Walk',()=>{
 const html=read('index.html');
 const main=html.match(/<nav id="mainMenu"[\s\S]*?<\/nav>/)?.[0];
 const walk=html.match(/<section id="menuWalk"[\s\S]*?<\/section>/)?.[0];
 const challenge=html.match(/<section id="menuChallenge"[\s\S]*?<\/section>/)?.[0];
 assert.match(main,/<a class="btn featured" id="bLandOfDavid" href="\.\/land-of-david\/"><span class="new-badge">NEW<\/span> <span id="landOfDavidLabel">다윗의 땅 · 성경 지도 월드<\/span><\/a>/);
 assert.ok(main.indexOf('bLandOfDavid')<main.indexOf('bStoryMenu'),'world sits above Story');
 assert.ok(!walk.includes('bLandOfDavid'));assert.ok(!challenge.includes('bLandOfDavid'));
 assert.equal((html.match(/id="bLandOfDavid"/g)||[]).length,1);
 for(const id of ['bExplore','bGardenMenu'])assert.ok(walk.includes('id="'+id+'"'));
 const menu=read('src/title-menu.js');
 assert.match(menu,/landOfDavidLabel/);assert.match(menu,/Land of David · Bible Map World/);
 assert.ok(!menu.includes("$('bLandOfDavid').textContent"),'label update must keep the NEW badge');
});
test('world reuses the shared three.js build and returns to the main menu',()=>{
 const page=read('land-of-david/index.html');
 assert.match(page,/"three": "\.\.\/vendor\/three\.module\.js"/);
 assert.equal((page.match(/href="\.\.\/"/g)||[]).length,2);
 assert.ok(!page.includes('menu=walk'));
 assert.match(read('land-of-david/src/scene.js'),/'\.\.\/\.\.\/vendor\/BufferGeometryUtils\.js'/);
 assert.ok(!fs.existsSync(new URL('../land-of-david/vendor',import.meta.url)));
});
test('world keeps its own save key so story progress is untouched',()=>{
 const main=read('land-of-david/src/main.js');
 assert.match(main,/'david-hd2d-v1'/);
 assert.ok(!main.includes("'david-progress'"));
});
