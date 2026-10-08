import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateTemple, CITY, OUTLINE } from '../land-of-david/src/temple-world.js';
import { reachable } from '../land-of-david/src/world.js';
import * as T from '../land-of-david/src/temple-logic.js';
import { act5Record, ACT5_KEY } from '../land-of-david/src/progress.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = generateTemple();
const L = world.layout;
const cityC = { x: CITY.ci - world.W / 2, z: CITY.cj - world.H / 2 };
const inCity = (p) => Math.hypot(p.x - cityC.x, p.z - cityC.z) < CITY.r - 0.5;

/** A headless player. good: treasure first, command all three, then carry what is shortest. naive: command, then wait in the yard. idle: does nothing in the prepare phase but command once. */
function play(seed, mode = 'good') {
  const s = T.createTemple(L, seed), D = { x: L.start.x, z: L.start.z, moving: false }, dt = 1 / 30, events = [];
  for (let t = 0; t < 600 && s.act !== 'done'; t += dt) {
    let target = null;
    switch (s.act) {
      case 'palace': target = L.nathan; break;
      case 'nathan': T.night(s); break;
      case 'word': T.toSit(s); break;
      case 'sit': target = L.tentSpot; break;
      case 'sat': T.startPrepare(s); break;
      case 'prepare': {
        if (s.treasureGiven && !s.givers.length) T.callGivers(s);
        const idle = s.crews.filter((c) => c.status === 'idle');
        if (s.carry) target = mode === 'idle' ? null : L.yard;
        else if (mode === 'good') {
          if (!s.treasureGiven) target = L.treasury;
          else if (idle.length) target = idle.sort((a, b) => Math.hypot(a.spot.x - D.x, a.spot.z - D.z) - Math.hypot(b.spot.x - D.x, b.spot.z - D.z))[0].spot;
          else { const lo = T.lowest(s); target = lo && lo.src ? s.crews.find((c) => c.key === lo.src).spot : L.yard; }
        } else if (mode === 'naive') {
          if (idle.length) target = idle[0].spot; else if (!s.treasureGiven && s.prepT > 80) target = L.treasury; else target = L.yard;
        } else if (idle.length === 3) target = s.crews[0].spot;
        break;
      }
      case 'ready': target = L.buildRing; break;
      case 'refused': T.callSolomon(s); break;
      case 'solomon': target = s.solomon; break;
      case 'handed': T.finish(s); break;
    }
    D.moving = false;
    if (target) {
      let goal = target;
      if (inCity(D) !== inCity(target)) goal = Math.hypot(D.x - L.gate.x, D.z - L.gate.z) > 0.6 ? L.gate : target;
      const dx = goal.x - D.x, dz = goal.z - D.z, d = Math.hypot(dx, dz);
      if (d > (s.act === 'sit' ? 0.3 : 0.6)) { const st = Math.min(d, 4.4 * T.davidSpeed(s) * dt); D.x += (dx / d) * st; D.z += (dz / d) * st; D.moving = true; }
    }
    T.step(s, dt, { david: D });
    for (const ev of T.drainEvents(s)) events.push(ev);
  }
  return { s, events, types: events.map((e) => e.type) };
}

test('every place in Act 5 is walkable from the palace: Nathan, the ark, the treasury, the gate, Moriah, the three work places and their roads', () => {
  const seen = reachable(world, world.spawn);
  const near = (p, r = 1.6) => { const ci = p.x + world.W / 2, cj = p.z + world.H / 2; for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (world.inb(i, j) && Math.hypot(i - ci, j - cj) <= r && seen[world.idx(i, j)]) return true; return false; };
  for (const k of ['start', 'nathan', 'tentSpot', 'treasury', 'gate', 'cityIn', 'yard', 'buildRing', 'solomonFrom', 'solomonSpot']) assert.ok(near(L[k]), k);
  for (const [k, p] of Object.entries(L.piles)) assert.ok(near(p), 'pile ' + k);
  for (const [k, src] of Object.entries(L.sources)) { assert.ok(near(src.spot), 'source ' + k); src.route.forEach((p, n) => assert.ok(near(p, 1.2), `route ${k}[${n}]`)); }
  L.giverRoute.forEach((p, n) => assert.ok(near(p, 1.2), `giver route ${n}`));
  L.restSpots.forEach((p, n) => assert.ok(near(p, 1.2), `rest ${n}`));
  assert.deepEqual(Object.keys(L.piles).sort(), Object.keys(T.NEED).sort());
  assert.ok(inCity(L.nathan) && inCity(L.treasury) && !inCity(L.yard), 'the ark and the treasury are in the city; the yard is on Moriah');
  assert.ok(L.buildRing.z > OUTLINE.j0 - world.H / 2 && L.buildRing.z < OUTLINE.j1 - world.H / 2 + 1, 'the build ring is inside the outline');
});

test('a full act in the order of the text: Nathan, the night, the word, sitting, preparing, the refusal, Solomon, the plans', () => {
  const ORDER = ['nathan', 'night', 'word', 'sat', 'prepare', 'treasure', 'gift', 'refused', 'solomon-coming', 'handed', 'act-done'];
  for (const seed of [3, 7, 11, 19]) {
    const { s, types } = play(seed);
    assert.equal(s.act, 'done', `seed ${seed} ended in ${s.act}`);
    let at = -1; for (const e of ORDER) { const k = types.indexOf(e, at + 1); assert.ok(k > at, `${e} in order (seed ${seed})`); at = k; }
    assert.equal(types.filter((e) => e === 'commanded').length, 3, 'three work places');
    assert.equal(types.filter((e) => e === 'gift').length, T.GIVERS.length, 'every group of givers arrives (29:6)');
    assert.ok(types.indexOf('treasure') < types.indexOf('gift'), 'the king gives first, then the people (29:3–6)');
    assert.ok(!types.includes('built') && !types.includes('house'), 'David never builds the house');
  }
});

test('a careful player prepares everything before David\'s days run out; a passive one still reaches the end with less', () => {
  const good = [], naive = [], idle = [];
  for (let seed = 1; seed <= 12; seed++) { good.push(T.summary(play(seed, 'good').s)); naive.push(T.summary(play(seed, 'naive').s)); idle.push(T.summary(play(seed, 'idle').s)); }
  for (const r of good) { assert.equal(r.percent, 100); assert.equal(r.lateEnd, false); assert.ok(r.days < T.LIFE, `prepared in ${r.days}s`); assert.ok(r.byDavid > 0); }
  for (const r of [...naive, ...idle]) assert.ok(r.lateEnd && r.percent < 100 && r.percent > 0, `passive run ${r.percent}%`);
  const mean = (a) => a.reduce((x, r) => x + r.percent, 0) / a.length;
  assert.ok(mean(naive) < 95 && mean(naive) > 60, `naive mean ${mean(naive)}`);
  assert.ok(mean(idle) < mean(naive), 'doing less prepares less');
  for (const r of [...good, ...naive, ...idle]) assert.ok(r.seconds > 60 && r.seconds < 260, `full act ${r.seconds}s`);
});

test('no stuck runs across many seeds', () => {
  for (let seed = 20; seed < 60; seed++) for (const mode of ['good', 'naive']) assert.equal(play(seed, mode).s.act, 'done', `seed ${seed} ${mode}`);
});

test('crews grow only when the king carries a load himself, up to four per work place', () => {
  const s = T.createTemple(L, 5); s.act = 'sat'; T.startPrepare(s);
  const q = s.crews.find((c) => c.key === 'quarry'), D = { x: q.spot.x, z: q.spot.z, moving: false };
  T.step(s, 1 / 30, { david: D });
  assert.equal(q.status, 'working'); assert.equal(q.carriers.length, 1, 'the command sends one'); assert.equal(s.carry, 'stone');
  for (let k = 0; k < 300; k++) T.step(s, 1 / 30, { david: { x: q.spot.x + 3, z: q.spot.z + 3, moving: false } });
  assert.equal(q.carriers.length, 1, 'waiting does not add workers');
  for (let n = 2; n <= T.CREW_MAX + 1; n++) {
    T.step(s, 1 / 30, { david: { ...L.yard, moving: false } });
    assert.equal(q.carriers.length, Math.min(n, T.CREW_MAX));
    T.step(s, 1 / 30, { david: D });
  }
  assert.equal(s.byDavid, T.CREW_MAX);
});

test('the king\'s own gold and silver are given once and call the willing givers', () => {
  const s = T.createTemple(L, 6); s.act = 'sat'; T.startPrepare(s);
  T.step(s, 1 / 30, { david: { ...L.treasury, moving: false } }); assert.equal(s.carry, 'treasure');
  T.step(s, 1 / 30, { david: { ...L.yard, moving: false } });
  assert.equal(s.treasureGiven, true); assert.equal(s.piles.gold, 1); assert.equal(s.piles.silver, 1);
  T.step(s, 1 / 30, { david: { ...L.treasury, moving: false } }); assert.equal(s.carry, null, 'only once');
  assert.equal(s.givers.length, 0, 'the people come when called'); T.callGivers(s); assert.equal(s.givers.length, T.GIVERS.length);
});

test('sitting before the LORD needs stillness at the ark', () => {
  const s = T.createTemple(L, 2); s.act = 'word'; T.toSit(s);
  for (let k = 0; k < 200; k++) T.step(s, 1 / 30, { david: { ...L.tentSpot, moving: true } });
  assert.equal(s.act, 'sit', 'walking about is not sitting');
  for (let k = 0; k < 200; k++) T.step(s, 1 / 30, { david: { x: L.tentSpot.x + 5, z: L.tentSpot.z, moving: false } });
  assert.equal(s.act, 'sit', 'not away from the ark');
  for (let k = 0; k < Math.ceil(T.SIT_TIME * 30) + 2; k++) T.step(s, 1 / 30, { david: { ...L.tentSpot, moving: false } });
  assert.equal(s.act, 'sat');
});

test('best preparation only improves; bad saves are ignored; the hub reads the same key', () => {
  assert.equal(ACT5_KEY, T.ACT5_KEY);
  assert.match(read('land-of-david/src/temple.js'), /const SAVE_KEY = T\.ACT5_KEY;/);
  assert.deepEqual(T.record(null, { percent: 70, gifts: 8 }), { best: 70, last: 70, gifts: 8 });
  assert.equal(T.record({ best: 90 }, { percent: 70, gifts: 8 }).best, 90);
  assert.equal(T.parseRecord('nope'), null); assert.equal(T.parseRecord(null), null); assert.equal(T.parseRecord('{"best":-1}'), null);
  const mem = new Map(), storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null) };
  assert.equal(act5Record(storage), null);
  mem.set(ACT5_KEY, '{"best":70,"last":70,"gifts":8}'); assert.deepEqual(act5Record(storage), { best: 70 });
  mem.set(ACT5_KEY, '70'); assert.equal(act5Record(storage), null);
  assert.equal(act5Record({ getItem() { throw new Error('denied'); } }), null);
});

test('the hub lists Act 5, and Act 4 leads into it', () => {
  const html = read('land-of-david/index.html'), js = read('land-of-david/src/main.js');
  assert.match(html, /id="act5" class="act serif" href="\.\/temple\.html"/);
  assert.match(html, /id="act5Status"/);
  assert.match(js, /act5Record\(localStorage\)/);
  assert.match(read('land-of-david/src/hebron.js'), /href="\.\/temple\.html">5막/);
  const page = read('land-of-david/temple.html');
  assert.match(page, /src="\.\/src\/temple\.js"/);
  assert.match(page, /href="\.\/"/, 'back to the hub');
});

test('no attack or building action: David prepares and hands over, he does not build', () => {
  const code = (read('land-of-david/src/temple.js') + read('land-of-david/src/temple-logic.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/attack|kill|죽이기|공격/.test(code));
  const js = read('land-of-david/src/temple.js');
  assert.match(js, /그 위에 집은 서지 않았습니다/);
  assert.match(js, /recorded: \[/); assert.match(js, /imagined: \[/);
});

test('scripture on Act 5 cards matches 개역한글 wording (bskorea, 2026-10-08)', () => {
  const js = read('land-of-david/src/temple.js');
  for (const verse of [
    '왕이 선지자 나단에게 이르되 볼찌어다 나는 백향목 궁에 거하거늘 하나님의 궤는 휘장 가운데 있도다',
    '나단이 왕께 고하되 여호와께서 왕과 함께 계시니 무릇 마음에 있는 바를 행하소서',
    '저는 내 이름을 위하여 집을 건축할 것이요 나는 그 나라 위를 영원히 견고케 하리라',
    '다윗 왕이 여호와 앞에 들어가 앉아서 가로되 주 여호와여 나는 누구오며 내 집은 무엇이관대 나로 이에 이르게 하셨나이까',
    '다윗이 가로되 내 아들 솔로몬이 어리고 연약하고 여호와를 위하여 건축할 전은 극히 장려하여 만국에 명성과 영광이 있게 하여야 할찌라 그러므로 내가 이제 위하여 준비하리라 하고 죽기 전에 많이 준비하였더라',
    '여호와의 말씀이 내게 임하여 이르시되 너는 피를 심히 많이 흘렸고 크게 전쟁하였느니라 네가 내 앞에서 땅에 피를 많이 흘렸은즉 내 이름을 위하여 전을 건축하지 못하리라',
    '또 그 아들 솔로몬에게 이르되 너는 강하고 담대하게 이 일을 행하고 두려워 말며 놀라지 말라 네가 여호와의 전 역사의 모든 일을 마칠 동안에 여호와 하나님 나의 하나님이 너와 함께하사 네게서 떠나지 아니하시고 너를 버리지 아니하시리라',
    '성전을 위하여 예비한 이 모든 것 외에도 내 마음에 내 하나님의 전을 사모하므로 나의 사유의 금, 은으로 내 하나님의 전을 위하여 드렸노니',
    '나와 나의 백성이 무엇이관대 이처럼 즐거운 마음으로 드릴 힘이 있었나이까 모든 것이 주께로 말미암았사오니 우리가 주의 손에서 받은 것으로 주께 드렸을 뿐이니이다',
    '주 앞에서는 우리가 우리 열조와 다름이 없이 나그네와 우거한 자라 세상에 있는 날이 그림자 같아서 머무름이 없나이다',
  ]) assert.ok(js.includes(verse), verse.slice(0, 24));
});
