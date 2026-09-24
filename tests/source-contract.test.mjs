import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const src = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const contracts=JSON.parse(fs.readFileSync(new URL('./gameplay-contracts.json',import.meta.url),'utf8'));
for (const c of contracts) test(`${c.name} matches latest main apart from reviewed cleanup hooks`,()=>{
  const start=src.indexOf(c.start),end=src.indexOf(c.end,start);
  assert.ok(start>=0&&end>start,`${c.name} boundaries exist`);
  assert.equal(crypto.createHash('sha256').update(src.slice(start,end).replace(/\n    \/\* graphics-lifecycle:start \*\/[\s\S]*?\/\* graphics-lifecycle:end \*\//g,'')).digest('hex'),c.sha256);
});
test('Three.js and GLTFLoader are pinned locally, not dependent on CDN availability',()=>{
  assert.match(src,/import \* as THREE from '\.\/vendor\/three\.module\.js'/);
  assert.ok(!src.includes('cdn.jsdelivr.net'));
  assert.match(fs.readFileSync(new URL('../vendor/GLTFLoader.js',import.meta.url),'utf8'),/from '\.\/three\.module\.js'/);
});
test('Review harness does not save progress or invoke story',()=>{
  const review=fs.readFileSync(new URL('../src/review.js',import.meta.url),'utf8');
  assert.ok(!review.includes('saveProgress('));assert.ok(!review.includes('ch.run('));
  assert.match(review,/game\.paused\s*=\s*true/);
});

test('Only the two reviewed chapter cleanup hooks may differ from chapter baseline',()=>{
  const hooks=[...src.matchAll(/\/\* graphics-lifecycle:start \*\/([\s\S]*?)\/\* graphics-lifecycle:end \*\//g)].map(m=>m[1].trim());
  assert.deepEqual(hooks,[
    "g.onChapterCleanup?.(() => { done = true; removeEventListener('keydown', onKey); el.remove(); });",
    "g.onChapterCleanup?.(() => { over = true; removeEventListener('keydown', onKey); el.remove(); });"
  ]);
});
