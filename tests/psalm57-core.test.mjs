import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/psalm57-core.js';
import { PSALM57, SCENE1_SEGMENTS, PSALM57_SUPERSCRIPTION } from '../src/psalm57-text.js';

// Text the user supplied on 2026-10-09 (개역개정), kept here independently of the module.
const SUPPLIED_V1 = '하나님이여 내게 은혜를 베푸소서 내게 은혜를 베푸소서 내 영혼이 주께로 피하되 주의 날개 그늘 아래에서 이 재앙들이 지나기까지 피하리이다';
const SUPPLIED_V7 = '하나님이여 내 마음이 확정되었고 내 마음이 확정되었사오니 내가 노래하고 내가 찬송하리이다';
const SUPPLIED_V8 = '내 영광아 깰지어다 비파야, 수금아, 깰지어다 내가 새벽을 깨우리로다';

test('Psalm 57 text is verbatim and the scene segments rebuild verse 1 exactly', () => {
  assert.equal(PSALM57.length, 11);
  assert.equal(PSALM57[0], SUPPLIED_V1);
  assert.equal(PSALM57[6], SUPPLIED_V7);
  assert.equal(PSALM57[7], SUPPLIED_V8);
  assert.equal(SCENE1_SEGMENTS.join(' '), PSALM57[0]);
  assert.equal(SCENE1_SEGMENTS[1], '주의 날개 그늘 아래에서');
  assert.match(PSALM57_SUPERSCRIPTION, /다윗이 사울을 피하여 굴에 있던 때에$/);
});

test('torch patrols back and forth across the whole wall', () => {
  const a = core.torchAt(0, 0);
  assert.equal(a.u, core.TORCH.min); assert.equal(a.dir, 1);
  const half = core.torchAt(core.TORCH_PERIOD / 2, 0);
  assert.ok(Math.abs(half.u - core.TORCH.max) < 1e-9);
  const d = core.torchAt(0, core.DEFAULT_PHASE);
  assert.ok(Math.abs(d.u - 20) < 1e-9); assert.equal(d.dir, -1);
});

test('shelters hide the player; open wall inside the disc exposes', () => {
  assert.equal(core.isExposed(core.START_U, core.START_U), false);
  assert.equal(core.isExposed(29, 29), false);
  assert.equal(core.isExposed(15, 15), true);
  assert.equal(core.isExposed(15, 15 + core.LIGHT_RADIUS + 0.01), false);
});

test('exposure sends the player back to the crevice and counts a catch', () => {
  const s = core.createState({ phase: 0 });
  s.u = 10; // torch starts at -4 heading right: it will reach u = 10
  let caught = false;
  for (let i = 0; i < 600 && !caught; i++) caught = core.step(s, 0, core.TICK).some((e) => e.type === 'caught');
  assert.ok(caught);
  assert.equal(s.u, core.START_U);
  assert.equal(s.caught, 1);
  assert.equal(s.mode, 'play');
});

const phases = Array.from({ length: 48 }, (_, i) => (i / 48) * core.TORCH_PERIOD);
const forward = () => 1;
// Wait in a shelter until a full-speed dash to the next shelter (or exit) is safe; never stop in the open.
const careful = (s) => {
  const here = core.shelterAt(s.u);
  if (!here) return 1;
  const target = here.id === 'crevice' ? core.SHELTERS[1].u0 + 0.5 : core.EXIT_U;
  return core.safeToAdvance(s, target) ? 1 : 0;
};
// Leaves the crevice carefully but then runs straight past the wings.
const skipWings = (s) => {
  if (core.shelterAt(s.u)?.id === 'crevice') return core.safeToAdvance(s, core.EXIT_U) ? 1 : 0;
  return 1;
};

test('holding forward the whole way is caught for nearly every torch phase', () => {
  const results = phases.map((phase) => core.simulate(forward, { phase }));
  const wins = results.filter((r) => r.result === 'won').length;
  assert.ok(wins / phases.length <= 0.2, `always-forward won ${wins}/${phases.length}`);
});

test('no strategy wins without the wings sheltering the player from the light', () => {
  // Fine phase sweep, three movement strategies. A win is allowed only if the light passed over
  // the player while they were under the wings at least once.
  const fine = Array.from({ length: 240 }, (_, i) => (i / 240) * core.TORCH_PERIOD);
  let wins = 0;
  for (const policy of [forward, skipWings, careful]) {
    for (const phase of fine) {
      const r = core.simulate(policy, { phase, maxSeconds: 90 });
      if (r.result === 'won') { wins++; assert.ok(r.wingHides >= 1, `won without wings at phase ${phase}`); }
    }
  }
  assert.ok(wins > 0);
});

test('waiting in the crevice and under the wings wins from every torch phase', () => {
  for (const phase of phases) {
    const r = core.simulate(careful, { phase, maxSeconds: 90 });
    assert.equal(r.result, 'won', `careful policy ${r.result} at phase ${phase}`);
    assert.ok(r.t < 60, `took ${r.t.toFixed(1)}s at phase ${phase}`);
  }
});

test('default entry: the first light pass sweeps over the crevice before the player must move', () => {
  const s = core.createState();
  let firstHide = null;
  for (let i = 0; i < 60 * 10 && !firstHide; i++) firstHide = core.step(s, 0, core.TICK).find((e) => e.type === 'hidden');
  assert.equal(firstHide?.shelter, 'crevice');
  assert.ok(s.t < 6, `first sweep at ${s.t.toFixed(2)}s`);
});

test('the page takes its superscription and strip zones from the modules, not hardcoded copies', async () => {
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(new URL('../psalm57.html', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../src/psalm57.css', import.meta.url), 'utf8');
  assert.ok(!html.includes('굴에 있던 때에'), 'superscription must come from psalm57-text.js');
  assert.ok(!/\/48\*100%/.test(css), 'strip zones must come from psalm57-core.js');
  assert.equal(PSALM57_SUPERSCRIPTION.split(', ').at(-1), '다윗이 사울을 피하여 굴에 있던 때에');
});
