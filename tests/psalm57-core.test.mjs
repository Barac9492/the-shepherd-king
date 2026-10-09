import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/psalm57-core.js';
import { PSALM57, SCENE1_SEGMENTS, PSALM57_SUPERSCRIPTION } from '../src/psalm57-text.js';

// Text the user supplied on 2026-10-09 (개역개정), kept here independently of the module.
const SUPPLIED_V1 = '하나님이여 내게 은혜를 베푸소서 내게 은혜를 베푸소서 내 영혼이 주께로 피하되 주의 날개 그늘 아래에서 이 재앙들이 지나기까지 피하리이다';
const SUPPLIED_V7 = '하나님이여 내 마음이 확정되었고 내 마음이 확정되었사오니 내가 노래하고 내가 찬송하리이다';
const SUPPLIED_V8 = '내 영광아 깰지어다 비파야, 수금아, 깰지어다 내가 새벽을 깨우리로다';

test('Psalm 57 text is verbatim and the carved segments rebuild verse 1 exactly', () => {
  assert.equal(PSALM57.length, 11);
  assert.equal(PSALM57[0], SUPPLIED_V1);
  assert.equal(PSALM57[6], SUPPLIED_V7);
  assert.equal(PSALM57[7], SUPPLIED_V8);
  assert.equal(SCENE1_SEGMENTS.join(' '), PSALM57[0]);
  assert.equal(SCENE1_SEGMENTS[3], '주의 날개 그늘 아래에서');
  assert.match(PSALM57_SUPERSCRIPTION, /다윗이 사울을 피하여 굴에 있던 때에$/);
});

test('the page takes its superscription and HUD zones from the modules, not hardcoded copies', async () => {
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(new URL('../psalm57.html', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../src/psalm57.css', import.meta.url), 'utf8');
  assert.ok(!html.includes('굴에 있던 때에'), 'superscription must come from psalm57-text.js');
  assert.ok(!/\/48\*100%/.test(css), 'HUD zones must come from psalm57-core.js');
});

test('jump physics: a full jump clears every ledge step on the route, the gap is not jumpable', () => {
  const apex = c.PHYS.jump ** 2 / (2 * c.PHYS.gravity);
  const steps = [['ground', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['ground2', 'p5'], ['p5', 'p6']];
  const y = (id) => c.PLATFORMS.find((p) => p.id === id).y;
  for (const [a, b] of steps) assert.ok(y(b) - y(a) < apex - 0.15, `${a}->${b}`);
  const airtime = 2 * c.PHYS.jump / c.PHYS.gravity;
  assert.ok(c.GAP.u1 - c.GAP.u0 > airtime * c.PHYS.run * 3, 'the broken floor cannot be jumped');
});

test('falling into the broken floor returns the player to the crack', () => {
  const s = c.createState({ phases: [c.TORCH_PERIODS[0] / 2, c.TORCH_PERIODS[1] / 2] });
  s.u = 12; s.y = 3; s.ground = null; s.vy = 0;
  let fell = false;
  for (let i = 0; i < 120 && !fell; i++) fell = c.step(s, { dir: 0 }, c.TICK).some((e) => e.type === 'fell');
  assert.ok(fell);
  assert.equal(s.u, c.START.u); assert.equal(s.y, c.START.y);
});

test('shelters: crack, wings and the jar shadow; the jar shadow slides opposite the torch', () => {
  assert.equal(c.shelterFrom(1, 1.5, 1, null), 'crack');
  assert.equal(c.shelterFrom(26, 5, 26, null), 'wings');
  assert.equal(c.shelterFrom(26, 1.5, 26, null), null, 'wings do not cover the floor below');
  assert.equal(c.jarShadowU(37, 33), 38);
  assert.equal(c.shelterFrom(37, 1.5, 34, 37), 'jar');
  assert.equal(c.shelterFrom(37, 3.4, 34, 37), null, 'jar shadow only covers the floor band');
  // standing right at the jar is always sheltered whenever a torch is close enough to light you
  for (let tu = 37 - c.LIGHT.radius; tu <= 37 + c.LIGHT.radius; tu += 0.05) assert.equal(c.shelterFrom(37, 1.5, tu, 37), 'jar');
});

// --- route player: waits in a shelter until a lookahead says the next leg is safe -------------
const exitInput = (s) => ({ dir: 1, jump: (s.ground === 'ground2' && s.u >= 43.6) || (s.ground === 'p5' && s.u >= 45.5) || (!s.ground && s.vy > 0) });
const SEGS = [
  { done: (s) => s.ground === 'p3' && s.u >= 17,
    input: (s) => ({ dir: 1, jump: (s.ground === 'ground' && s.u >= 2.3 && s.u < 3.4) || (s.ground === 'p1' && s.u >= 8.3) || (s.ground === 'p2' && s.u >= 14.3) || (!s.ground && s.vy > 0) }) },
  { done: (s) => s.ground === 'wings' && s.u >= 26.5, input: () => ({ dir: 1, jump: false }) },
  { done: (s) => s.ground === 'ground2' && Math.abs(s.u - c.jarU(s)) < 0.12, input: (s) => ({ dir: Math.sign(c.jarU(s) - s.u) || 1, jump: false }) },
  { done: (s) => s.mode === 'won', input: exitInput },
];
function routePolicy(segs, lookahead = 15) {
  let i = 0, go = false, last = -1;
  return (s) => {
    while (i < segs.length && segs[i].done(s)) { i++; go = false; }
    if (i >= segs.length) return { dir: 0 };
    const seg = segs[i];
    if (!go && s.t - last >= 0.1) {
      last = s.t;
      const p = c.cloneState(s);
      for (let k = 0; k < lookahead * 60; k++) {
        const ev = c.step(p, seg.input(p), c.TICK);
        if (ev.some((e) => e.type === 'caught' || e.type === 'fell')) break;
        if (seg.done(p)) { go = true; break; }
      }
    }
    return go ? seg.input(s) : { dir: 0 };
  };
}
const grid = [];
for (let i = 0; i < 16; i++) for (let j = 0; j < 6; j++) grid.push([i / 16 * c.TORCH_PERIODS[0], j / 6 * c.TORCH_PERIODS[1]]);
const shortcuts = {
  holdForward: () => exitInput,
  routeWithoutWaiting: () => { let i = 0; return (s) => { while (i < SEGS.length && SEGS[i].done(s)) i++; return i < SEGS.length ? SEGS[i].input(s) : { dir: 0 }; }; },
  skipTheJar: () => routePolicy([SEGS[0], SEGS[1], { done: (s) => s.mode === 'won', input: exitInput }]),
  floorOnly: () => routePolicy([{ done: (s) => s.mode === 'won', input: exitInput }], 25),
};

test('no shortcut wins, with the jar in any slot', () => {
  for (const slot of [0, 1, 2]) for (const [name, mk] of Object.entries(shortcuts)) {
    for (const phases of grid) {
      const r = c.simulate(mk(), { phases, jarSlot: slot, maxSeconds: 60 });
      assert.notEqual(r.result, 'won', `${name} won with jar slot ${slot} at phases ${phases}`);
    }
  }
});

test('the intended route cannot finish unless the jar was moved to the third slot', () => {
  for (const slot of [0, 1]) for (const phases of grid) {
    const r = c.simulate(routePolicy(SEGS), { phases, jarSlot: slot, maxSeconds: 60 });
    assert.notEqual(r.result, 'won', `slot ${slot}`);
  }
});

test('with the jar in place, waiting in the crack, on the high ledge, under the wings and by the jar wins from every timing', () => {
  for (const phases of grid) {
    const r = c.simulate(routePolicy(SEGS), { phases, jarSlot: 2, maxSeconds: 60 });
    assert.equal(r.result, 'won', `phases ${phases}: ${r.result}`);
    assert.ok(r.t < 40, `took ${r.t.toFixed(1)}s`);
    assert.ok(r.state.hides.jar >= 1, 'the jar shadow is actually used');
  }
});

test('default entry: the first torch sweeps over the crack within a few seconds', () => {
  const s = c.createState();
  let ev = null;
  for (let i = 0; i < 60 * 8 && !ev; i++) ev = c.step(s, { dir: 0 }, c.TICK).find((e) => e.type === 'hidden');
  assert.equal(ev?.shelter, 'crack');
  assert.ok(s.t < 6);
});
