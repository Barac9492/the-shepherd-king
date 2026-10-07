import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { keyName } from '../land-of-david/src/keys.js';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('physical key position wins over the typed character (Korean 2-set layout)', () => {
  const cases = [
    [{ key: 'ㅈ', code: 'KeyW' }, 'w'], [{ key: 'ㅁ', code: 'KeyA' }, 'a'],
    [{ key: 'ㄴ', code: 'KeyS' }, 's'], [{ key: 'ㅇ', code: 'KeyD' }, 'd'],
    [{ key: 'ㄷ', code: 'KeyE' }, 'e'], [{ key: 'ㅜ', code: 'KeyN' }, 'n'],
    [{ key: 'Process', code: 'KeyD' }, 'd'], [{ key: 'W', code: 'KeyW' }, 'w'],
  ];
  for (const [e, want] of cases) assert.equal(keyName(e), want, JSON.stringify(e));
});

test('arrows, space, enter, shift and escape keep their names', () => {
  assert.equal(keyName({ key: 'ArrowUp', code: 'ArrowUp' }), 'arrowup');
  assert.equal(keyName({ key: 'ArrowLeft', code: 'ArrowLeft' }), 'arrowleft');
  assert.equal(keyName({ key: ' ', code: 'Space' }), ' ');
  assert.equal(keyName({ key: 'Enter', code: 'NumpadEnter' }), 'enter');
  assert.equal(keyName({ key: 'Shift', code: 'ShiftRight' }), 'shift');
  assert.equal(keyName({ key: 'Escape', code: 'Escape' }), 'escape');
  assert.equal(keyName({ key: 'x' }), 'x', 'falls back to key when code is missing');
});

test('both Land of David pages read keys through the shared helper', () => {
  for (const file of ['land-of-david/src/main.js', 'land-of-david/src/adullam.js']) {
    const js = read(file);
    assert.match(js, /import \{ keyName \} from '\.\/keys\.js';/, file);
    assert.ok(!/e\.key\.toLowerCase\(\)/.test(js), file + ' must not key movement off the typed character');
  }
});
