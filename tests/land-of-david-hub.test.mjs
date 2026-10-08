import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACT1_KEY, act1Best, regionProgress, journeyComplete } from '../land-of-david/src/progress.js';
import { POIS, REGIONS, JOURNEY_END } from '../land-of-david/src/data.js';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const store = (v) => ({ getItem: (k) => (k === ACT1_KEY ? v : null) });

test('Act 1 result is read safely from its own save key', () => {
  assert.equal(ACT1_KEY, 'david-adullam-v1');
  assert.match(read('land-of-david/src/adullam.js'), /const SAVE_KEY = 'david-adullam-v1';/);
  assert.equal(act1Best(store(null)), 0);
  assert.equal(act1Best(store('137')), 137);
  assert.equal(act1Best(store('nope')), 0);
  assert.equal(act1Best({ getItem() { throw new Error('denied'); } }), 0);
});

test('region progress covers every card, and the journey completes only with all of them', () => {
  const none = regionProgress(new Set(), POIS);
  assert.deepEqual(Object.keys(none).sort(), REGIONS.map((r) => r.id).sort());
  assert.equal(Object.values(none).reduce((n, r) => n + r.total, 0), POIS.length);
  assert.ok(Object.values(none).every((r) => r.found === 0 && r.total > 0));
  const fields = POIS.filter((p) => p.region === 'fields').map((p) => p.id);
  assert.equal(regionProgress(new Set(fields.slice(0, 1)), POIS).fields.found, 1);
  assert.equal(journeyComplete(new Set(POIS.slice(1).map((p) => p.id)), POIS), false);
  assert.equal(journeyComplete(new Set(POIS.map((p) => p.id)), POIS), true);
});

test('journey ending quotes 삼하 7:8–9 in 개역한글 and separates recorded from imagined', () => {
  const [[r1, t1], [r2, t2]] = JOURNEY_END.verses;
  assert.equal(r1, '삼하 7:8');
  assert.equal(t1, '그러므로 이제 내 종 다윗에게 이처럼 말하라 만군의 여호와께서 이처럼 말씀하시기를 내가 너를 목장 곧 양을 따르는데서 취하여 내 백성 이스라엘의 주권자를 삼고');
  assert.equal(r2, '삼하 7:9');
  assert.match(t2, /^네가 어디를 가든지 내가 너와 함께 있어 …$/);
  assert.ok(JOURNEY_END.recorded.length && JOURNEY_END.imagined.length);
});

test('main menu sends first-time players to Act 1 and returning players to the map hub', () => {
  const menu = read('src/title-menu.js');
  assert.match(menu, /'david-adullam-v1'/);
  assert.match(menu, /\.\/land-of-david\/adullam\.html/);
  assert.match(read('index.html'), /id="bLandOfDavid" href="\.\/land-of-david\/"/, 'static fallback stays the hub');
});

test('hub title shows act status and map progress; the map ends with the journey card, not a toast', () => {
  const html = read('land-of-david/index.html'), js = read('land-of-david/src/main.js');
  for (const id of ['journey', 'act1Link', 'act1Status', 'act2', 'mapProgress', 'cardLinks']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /id="startBtn"/);
  assert.match(js, /from '\.\/progress\.js'/);
  assert.match(js, /JOURNEY_END/);
  assert.ok(!js.includes('다윗의 땅을 모두 둘러보았습니다'), 'completion is a real ending card now');
});
