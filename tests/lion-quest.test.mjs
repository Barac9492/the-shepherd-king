import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Chapter 1 lion guidance leads through the fold exit and reports lion distance', () => {
  assert.match(source, /const foldExit = new V3\(FOLD\[0\], 0, FOLD\[1\] \+ 6\.4\); S\.lionGuideExit = true;/);
  assert.match(source, /Math\.hypot\(P\.x - foldExit\.x, P\.z - foldExit\.z\) < 3\.2/);
  assert.match(source, /label: \{ en: 'Lion', ko: '사자까지' \}/);
  assert.match(source, /남쪽 출입구로 나가 동쪽 언덕의 사자를 찾아보세요/);
  assert.match(source, /MAT\.lionMarker/);
});

test('Chapter 1 lion is easier to track and hit without changing other target definitions', () => {
  assert.match(source, /if \(flinch > 0\) lion\.stop\(\)/);
  assert.match(source, /else if \(d < 14\)/);
  assert.match(source, /lion\.walkSpeed = d < 8 \? 3 : 1\.8/);
  assert.match(source, /r: 1\.7, aimR: 2\.8, aimRange: 65, ignoreAimGround: true/);
  assert.match(source, /flinch = 1/);
  assert.match(source, /g\.aimSideOffset = -1\.15/);
});

test('aim assist is range-limited and keeps the lion lock across slope reticle mismatch', () => {
  assert.match(source, /t\.aimRange != null && targetDistance > t\.aimRange \? t\.r : \(t\.aimR \?\? t\.r\)/);
  assert.match(source, /if \(!hit\?\.ignoreAimGround\) hit = null/);
});
