import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const src = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const contracts=JSON.parse(fs.readFileSync(new URL('./gameplay-contracts.json',import.meta.url),'utf8'));
for (const c of contracts) test(`${c.name} remains byte-identical to original`,()=>{
  const start=src.indexOf(c.start),end=src.indexOf(c.end,start);
  assert.ok(start>=0&&end>start,`${c.name} boundaries exist`);
  assert.equal(crypto.createHash('sha256').update(src.slice(start,end)).digest('hex'),c.sha256);
});
test('Three.js and GLTFLoader are pinned locally, not dependent on CDN availability',()=>{
  assert.match(src,/import \* as THREE from '\.\/vendor\/three\.module\.js'/);
  assert.ok(!src.includes('cdn.jsdelivr.net'));
  assert.match(fs.readFileSync(new URL('../vendor/GLTFLoader.js',import.meta.url),'utf8'),/from '\.\/three\.module\.js'/);
});
test('Review harness does not save progress or invoke story',()=>{
  const review=fs.readFileSync(new URL('../src/review.js',import.meta.url),'utf8');
  assert.ok(!review.includes('saveProgress('));assert.ok(!review.includes('ch.run('));
  assert.match(review,/game.paused = true/);
});
