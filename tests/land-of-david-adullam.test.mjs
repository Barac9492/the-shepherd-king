import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateAdullam } from '../land-of-david/src/adullam-world.js';
import { reachable } from '../land-of-david/src/world.js';
import * as A from '../land-of-david/src/adullam-logic.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = generateAdullam();
const L = world.layout;
const tile = (p) => [Math.round(p.x + world.W / 2), Math.round(p.z + world.H / 2)];

test('every place David must reach in Adullam is walkable from the start', () => {
  const seen = reachable(world, world.spawn);
  const near = ([i, j]) => [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => seen[world.idx(i + di, j + dj)]));
  for (const key of ['spring', 'basket', 'fire', 'lookout', 'rampBase', 'cave', 'exit']) assert.ok(near(tile(L[key])), key);
  L.waitSlots.forEach((p, n) => assert.ok(near(tile(p)), 'wait slot ' + n));
});

// a simple player: serve whoever is waiting, escort fire-needs, take followers to stations, leave when told
function play(seed, { assignRoles = true } = {}) {
  const s = A.createAdullam(L, seed), D = { x: L.fire.x, z: L.fire.z }, dt = 1 / 30;
  let up = false;
  for (let t = 0; t < 400 && s.phase !== 'done'; t += dt) {
    let target = null;
    const wait = s.people.filter((p) => p.status === 'waiting'), fireP = wait.find((p) => p.need === 'fire');
    if (s.phase === 'play') {
      if (s.people.some((p) => p.status === 'escort')) target = L.fire;
      else if (assignRoles && s.people.some((p) => p.status === 'following') && A.workers(s).length < 8) {
        const wc = A.workers(s, 'water').length, bc = A.workers(s, 'bread').length;
        target = wc < 2 ? L.spring : bc < 2 ? L.basket : up ? L.lookout : L.rampBase;
        if (target === L.rampBase && Math.hypot(D.x - L.rampBase.x, D.z - L.rampBase.z) < 0.6) up = true;
      } else { up = false; if (s.carry) target = wait.find((p) => p.need === s.carry) || fireP || L.fire; else if (fireP) target = fireP; else { const n = wait.find((p) => !p.claimedBy); target = n ? (n.need === 'water' ? L.spring : L.basket) : L.fire; } }
    } else if (s.phase === 'gad') { target = s.gad; if (s.gad.arrived) A.startLeaving(s); } else target = L.exit;
    const dx = target.x - D.x, dz = target.z - D.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { const st = Math.min(d, 4.4 * dt); D.x += (dx / d) * st; D.z += (dz / d) * st; }
    A.step(s, dt, { david: D }); A.drainEvents(s);
  }
  return s;
}

test('the first arrivals follow 삼상 22:1-2: the family first, then the distressed', () => {
  const s = A.createAdullam(L, 1);
  for (let k = 0; k < 30 * 15; k++) A.step(s, 1 / 30, { david: { x: L.cave.x, z: L.cave.z } });
  const first = s.people.slice(0, 3).map((p) => [p.kind, p.need]);
  assert.deepEqual(first, [['family', 'water'], ['distress', 'bread'], ['bitter', 'fire']]);
  assert.equal(s.people[0].count, 12);
  assert.equal(A.START_BREAD, 5);
});

test('a full act runs from play to 갓 to leaving to done in about three minutes', () => {
  for (const seed of [3, 7, 11, 19]) {
    const s = play(seed);
    assert.equal(s.phase, 'done', 'seed ' + seed);
    assert.ok(s.t > 120 && s.t < 230, `seed ${seed} took ${s.t}s`);
    assert.ok(s.joined >= 300 && s.joined <= 500, `seed ${seed} joined ${s.joined}`);
    assert.ok(s.servedByPeople > 0, 'people the player served go on to serve others');
    assert.ok(s.people.every((p) => p.status === 'exodus'), 'everyone leaves together');
  }
});

test('role caps hold and watchers slow the rumour', () => {
  const s = play(7);
  assert.ok(s.servedByDavid > 0);
  const roles = A.createAdullam(L, 2);
  for (const [role, cap] of Object.entries(A.ROLE_CAP)) assert.ok(cap >= 3 && cap <= 4, role);
  // watchers: same state, with and without 4 watchers
  const base = A.createAdullam(L, 5), guarded = A.createAdullam(L, 5);
  for (let k = 0; k < 4; k++) guarded.people.push({ id: 1000 + k, status: 'working', role: 'watch', x: L.lookout.x, z: L.lookout.z, home: L.lookout, upRamp: true, count: 0 });
  for (let k = 0; k < 30 * 20; k++) { A.step(base, 1 / 30, { david: { x: L.cave.x, z: L.cave.z } }); A.step(guarded, 1 / 30, { david: { x: L.cave.x, z: L.cave.z } }); }
  assert.ok(guarded.attention < base.attention * 0.5, `${guarded.attention} vs ${base.attention}`);
  void roles;
});

test('Act 1 page reuses the shared engine, keeps its own save, and links back', () => {
  const html = read('land-of-david/adullam.html'), js = read('land-of-david/src/adullam.js');
  assert.match(html, /"three": "\.\.\/vendor\/three\.module\.js"/);
  assert.match(html, /<script type="module" src="\.\/src\/adullam\.js">/);
  assert.match(js, /'david-adullam-v1'/);
  assert.ok(!js.includes("'david-progress'") && !js.includes("'david-hd2d-v1'"));
  assert.match(js, /href="\.\.\/\?menu=walk"/);
  assert.match(read('land-of-david/index.html'), /href="\.\/adullam\.html"/);
});

test('scripture on the Act 1 cards matches 개역한글 wording', () => {
  const js = read('land-of-david/src/adullam.js');
  for (const verse of [
    '선지자 갓이 다윗에게 이르되 이 요새에 있지 말고 떠나 유다 땅으로 들어가라 다윗이 떠나 헤렛 수풀에 이르니라',
    '환난 당한 모든 자와 빚진 자와 마음이 원통한 자가 다 그에게로 모였고 그는 그 장관이 되었는데 그와 함께한 자가 사백명 가량이었더라',
    '내 영혼을 옥에서 이끌어 내사 주의 이름을 감사케 하소서 주께서 나를 후대하시리니 의인이 나를 두르리이다',
    '어찌하여 네가 홀로 있고 함께하는 자가 아무도 없느냐',
  ]) assert.ok(js.includes(verse), verse);
  assert.match(js, /제사장이 준 떡의 수는 기록되지 않았다/);
});

test('the way out is a visible, walkable road that ends at the exit', () => {
  const road = L.exitRoad;
  assert.ok(road.length >= 10, 'road has a lit trail');
  assert.ok(road[0].z < road[road.length - 1].z, 'road runs south (down the screen)');
  assert.ok(Math.hypot(road.at(-1).x - L.exit.x, road.at(-1).z - L.exit.z) < 3, 'trail ends at the exit');
  const seen = reachable(world, world.spawn);
  for (const p of road) { const [i, j] = tile(p); assert.ok(seen[world.idx(i, j)], `road tile ${i},${j} walkable`); assert.equal(world.type[world.idx(i, j)], 7, 'road is gravel, distinct from the plaza'); }
  assert.ok(world.features.props.filter((p) => p.kind === 'edgestone').length >= 12, 'road edges are lined with stones');
});

test('players are told where bread and water come from', () => {
  assert.match(A.WHERE.bread, /화덕/);
  assert.match(A.WHERE.water, /샘/);
  const js = read('land-of-david/src/adullam.js');
  assert.match(js, /떡은 굴 입구 옆 화덕에 있습니다/);
  assert.match(js, /kind: 'bread', at: L\.basket/);
});
