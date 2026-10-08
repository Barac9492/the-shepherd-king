import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateHebron, segmentAngles, ZION, MILLO_A } from '../land-of-david/src/hebron-world.js';
import { reachable } from '../land-of-david/src/world.js';
import * as A from '../land-of-david/src/adullam-logic.js';
import * as H from '../land-of-david/src/hebron-logic.js';
import { act4Record, ACT4_KEY } from '../land-of-david/src/progress.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = generateHebron();
const L = world.layout.stop;
const tile = (p) => [Math.round(p.x + world.W / 2), Math.round(p.z + world.H / 2)];
const nearSeen = (w, seen, p, r = 1.6) => { const ci = p.x + w.W / 2, cj = p.z + w.H / 2; for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (w.inb(i, j) && Math.hypot(i - ci, j - cj) <= r && seen[w.idx(i, j)]) return true; return false; };

test('every place is walkable from Hebron, with all tents up and the whole wall ring built', () => {
  const w = generateHebron(), Lw = w.layout.stop;
  for (const t of Lw.tentSpots) { const ti = Math.round(t.i), tj = Math.round(t.j); for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 1; di++) w.blocked[w.idx(ti + di, tj + dj)] = 1; }
  for (const s of w.features.segments) for (const t of s.tiles) w.blocked[w.idx(t.i, t.j)] = 1;
  const seen = reachable(w, tile(Lw.entry));
  for (const k of ['spring', 'basket', 'lookout', 'rampBase', 'fire', 'roadStart', 'tribeRoad', 'covenant', 'zionEntry', 'gate', 'camp', 'houseDrop', 'zionBasket', 'zionSpring', 'caravan', 'caravanFrom']) assert.ok(nearSeen(w, seen, Lw[k]), k);
  for (const k of ['waitSlots', 'restSlots', 'tribeSpots', 'covenantSlots', 'campSlots', 'segSpots', 'zionRest', 'caravanRoad']) Lw[k].forEach((p, n) => assert.ok(nearSeen(w, seen, p, 1.2), `${k}[${n}]`));
  assert.equal(Lw.tribeSpots.length, H.TRIBES.length);
  assert.ok(Lw.campSlots.length >= 12 && Lw.zionRest.length >= 12);
});

test('the wall is built from Millo around both sides to the gate (대상 11:8)', () => {
  const segs = segmentAngles(), d = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  assert.equal(segs.length, 12);
  assert.ok(d(segs[0].mid, MILLO_A) < 0.3, 'Millo first');
  const tiles = world.features.segments.map((s) => s.tiles);
  const touch = (a, b) => a.some((p) => b.some((q) => Math.max(Math.abs(p.i - q.i), Math.abs(p.j - q.j)) <= 1));
  for (let k = 1; k < tiles.length; k++) assert.ok(tiles.slice(0, k).some((b) => touch(tiles[k], b)), `segment ${k} shares a wall tile edge with what is already built`);
  assert.ok(d(segs[segs.length - 1].mid, ZION.gateA) < 0.6, 'the last segment closes the ring at the gate');
  const gateSides = segs.map((s, k) => [k, d(s.mid, ZION.gateA)]).filter(([, a]) => a < 0.6).map(([k]) => k);
  assert.equal(gateSides.length, 2, 'one segment on each side of the gate');
  assert.ok(world.features.segments.every((s) => s.tiles.length >= 5));
});

function play(seed, carried = 470) {
  const s = H.createHebron(L, seed, carried), dt = 1 / 30, D = { x: L.entry.x, z: L.entry.z }, events = [], order = [];
  for (let t = 0; t < 900 && s.act !== 'done'; t += dt) {
    if (s.teleport) { D.x = s.teleport.x; D.z = s.teleport.z; s.teleport = null; }
    let target = null;
    if (s.act === 'settle' && s.phase === 'play') {
      const wait = s.people.filter((p) => p.status === 'waiting'), fireP = wait.find((p) => p.need === 'fire');
      const need = ['water', 'bread', 'watch'].find((r) => A.workers(s, r).length < 1), f = s.people.some((p) => p.status === 'following');
      if (s.people.some((p) => p.status === 'escort')) target = L.fire;
      else if (f && need) target = need === 'water' ? L.spring : need === 'bread' ? L.basket : L.lookout;
      else if (s.carry) target = wait.find((p) => p.need === s.carry) || fireP || L.fire;
      else if (fireP) target = fireP;
      else { const n = wait.find((p) => !p.claimedBy); target = n ? (n.need === 'water' ? L.spring : L.basket) : L.fire; }
    } else if (s.act === 'judah') H.startTribes(s);
    else if (s.act === 'tribes') target = s.tribes.filter((q) => q.status === 'waiting' || q.status === 'coming').sort((a, b) => Math.hypot(a.x - D.x, a.z - D.z) - Math.hypot(b.x - D.x, b.z - D.z))[0] || L.covenant;
    else if (s.act === 'covenant') H.goToZion(s);
    else if (s.act === 'zion') H.startBuild(s);
    else if (s.act === 'build') {
      const needy = s.crews.filter((c) => c.status === 'building' && c.need), fol = H.following(s);
      if (s.carry === 'cedar') target = L.houseDrop;
      else if (s.carry && needy.some((c) => c.need === s.carry)) target = needy.find((c) => c.need === s.carry);
      else if (needy.length) target = needy[0].need === 'water' ? L.zionSpring : L.zionBasket;
      else if (fol.length && (fol.length >= 3 || !s.crews.some((c) => c.status === 'camp')) && s.seg < 12) target = L.segSpots[s.seg];
      else if (s.hiram?.arrived && s.cedar < 3 && (s.seg >= 12 || H.builders(s).length >= 6)) target = L.caravan;
      else if (s.crews.some((c) => c.status === 'camp') && s.seg < 12) target = s.crews.find((c) => c.status === 'camp');
      else target = L.segSpots[Math.min(s.seg, 11)];
    } else if (s.act === 'ending') H.finish(s);
    if (target) { const dx = target.x - D.x, dz = target.z - D.z, d = Math.hypot(dx, dz); if (d > 0.3) { const st = Math.min(d, 4.4 * dt); D.x += (dx / d) * st; D.z += (dz / d) * st; } }
    H.step(s, dt, { david: D });
    for (const ev of A.drainEvents(s)) { events.push(ev.type); if (ev.type === 'segment') order.push(ev.order); if (ev.type === 'covenant') assert.ok(s.tribes.every((q) => q.status === 'gathered'), 'all tribes gathered before the covenant'); }
  }
  return { s, events, order };
}

test('a full act: Hebron, Judah, the tribes, the covenant, Zion, the wall from Millo, Hiram, the house', () => {
  const ORDER = ['restaffed', 'judah', 'tribes', 'greeted', 'covenant', 'zion', 'build', 'crew-builds', 'segment', 'hiram-coming', 'hiram', 'cedar', 'house', 'built', 'act-done'];
  for (const seed of [3, 7, 11, 19]) {
    const { s, events, order } = play(seed);
    assert.equal(s.act, 'done', `seed ${seed} ended in ${s.act}`);
    let at = -1; for (const e of ORDER) { const k = events.indexOf(e, at + 1); assert.ok(k > at, `${e} in order (seed ${seed})`); at = k; }
    assert.ok(!events.includes('gad') && !events.includes('done'), 'no Act 1 messenger or ending');
    assert.deepEqual(order, [...Array(12).keys()], 'segments complete strictly in order');
    assert.ok(events.indexOf('walls-done') > events.lastIndexOf('segment') - 1);
    assert.ok(events.indexOf('hiram') < events.indexOf('cedar'), 'no cedar before Hiram');
    assert.equal(events.filter((e) => e === 'greeted').length, 11);
    assert.ok(s.total > 100 && s.total < 300, `seed ${seed} took ${s.total}s`);
    assert.ok(s.buildT > 45 && s.buildT < 200, `build ${s.buildT}s`);
  }
});

test('no stuck runs across seeds and crowd sizes', () => {
  for (let seed = 1; seed <= 12; seed++) for (const c of [60, 470, 900]) assert.equal(play(seed, c).s.act, 'done', `seed ${seed} carried ${c}`);
});

test('a builder who needs water or bread stops working until David brings it', () => {
  const s = H.createHebron(L, 4, 300);
  s.act = 'covenant'; H.goToZion(s); H.startBuild(s); s.teleport = null;
  const c = s.crews[0]; Object.assign(c, { status: 'building', seg: 0, need: 'water', x: L.segSpots[0].x, z: L.segSpots[0].z });
  const D = { x: L.segSpots[0].x + 0.5, z: L.segSpots[0].z };
  for (let k = 0; k < 60; k++) H.step(s, 1 / 30, { david: D });
  assert.equal(s.segProg, 0, 'no progress while the only builder waits');
  s.carry = 'bread'; H.step(s, 1 / 30, { david: D }); assert.equal(c.need, 'water', 'bread does not satisfy thirst');
  s.carry = 'water'; H.step(s, 1 / 30, { david: D }); assert.equal(c.need, null); assert.equal(s.carry, null);
  for (let k = 0; k < 60; k++) H.step(s, 1 / 30, { david: D });
  assert.ok(s.segProg > 0, 'work resumes');
  // a different source swaps what David holds; cedar only after Hiram
  H.step(s, 1 / 30, { david: { x: L.caravan.x, z: L.caravan.z } }); assert.notEqual(s.carry, 'cedar');
  H.step(s, 1 / 30, { david: { x: L.zionBasket.x, z: L.zionBasket.z } }); assert.equal(s.carry, 'bread');
  H.step(s, 1 / 30, { david: { x: L.zionSpring.x, z: L.zionSpring.z } }); assert.equal(s.carry, 'water');
  assert.ok(H.following(s).length <= H.MAX_FOLLOW);
});

test('personal best only improves; bad saves are ignored', () => {
  assert.deepEqual(H.record(null, 400, 91.23), { joined: 400, best: 91.2, last: 91.2 });
  assert.equal(H.record({ joined: 400, best: 80 }, 380, 95).best, 80);
  assert.equal(H.record({ joined: 400, best: 80 }, 380, 75).best, 75);
  assert.equal(H.record({ joined: 400, best: 80 }, 380, 75).joined, 400);
  assert.equal(H.parseRecord('not json'), null); assert.equal(H.parseRecord('{"best":-3}'), null); assert.equal(H.parseRecord(null), null);
  assert.equal(H.parseRecord('{"joined":500,"best":88.5}').best, 88.5);
  const mem = new Map(), storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null) };
  assert.equal(act4Record(storage), null); mem.set(ACT4_KEY, '{"joined":512,"best":77.7}'); assert.deepEqual(act4Record(storage), { joined: 512, best: 77.7 });
  mem.set(ACT4_KEY, '512'); assert.equal(act4Record(storage), null);
});

test('no attack action; the Jebusites and the war with Saul\'s house are not played', () => {
  const code = (read('land-of-david/src/hebron.js') + read('land-of-david/src/hebron-logic.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/attack|kill|죽이기|치기\b|공격/.test(code));
  const js = read('land-of-david/src/hebron.js');
  assert.ok(!js.includes("'5:6'") && !js.includes("'5:8'"), '5:6–8 is named, not quoted as play');
  assert.match(js, /산성을 얻는 장면\(5:6–8\)은 그리지 않/);
  assert.match(js, /2:8–4:12/);
});

test('scripture on Act 4 cards matches 개역한글 wording (bskorea, 2026-10-08)', () => {
  const js = read('land-of-david/src/hebron.js') + read('land-of-david/hebron.html');
  for (const verse of [
    '그 후에 다윗이 여호와께 물어 가로되 내가 유다 한 성으로 올라가리이까 여호와께서 가라사대 올라가라 다윗이 가로되 어디로 가리이까 가라사대 헤브론으로 갈찌니라',
    '또 자기와 함께한 종자들과 그들의 권속들을 다 데리고 올라가서 헤브론 각 성에 거하게 하니라',
    '유다 사람들이 와서 거기서 다윗에게 기름을 부어 유다 족속의 왕을 삼았더라',
    '다윗이 헤브론에서 유다 족속의 왕이 된 날 수는 일곱해 여섯달이더라',
    '이스라엘 모든 지파가 헤브론에 이르러 다윗에게 나아와 말하여 가로되 보소서 우리는 왕의 골육이니이다',
    '전일 곧 사울이 우리의 왕이 되었을 때에도 이스라엘을 거느려 출입하게 한 자는 왕이시었고 여호와께서도 왕에게 말씀하시기를 네가 내 백성 이스라엘의 목자가 되며 이스라엘의 주권자가 되리라 하셨나이다 하니라',
    '이에 이스라엘 모든 장로가 헤브론에 이르러 왕에게 나아오매 다윗왕이 헤브론에서 여호와 앞에서 저희와 언약을 세우매 저희가 다윗에게 기름을 부어 이스라엘 왕을 삼으니라',
    '다윗이 삼십세에 위에 나아가서 사십년을 다스렸으되',
    '다윗이 시온 산성을 빼앗았으니 이는 다윗성이더라',
    '다윗이 그 산성에 거하여 다윗성이라 이름하고 밀로에서부터 안으로 성을 둘러 쌓으니라',
    '만군의 하나님 여호와께서 함께 계시니 다윗이 점점 강성하여 가니라',
    '두로 왕 히람이 다윗에게 사자들과 백향목과 목수와 석수를 보내매 저희가 다윗을 위하여 집을 지으니',
    '다윗이 여호와께서 자기를 세우사 이스라엘 왕을 삼으신 것과 그 백성 이스라엘을 위하여 그 나라를 높이신 것을 아니라',
  ]) assert.ok(js.includes(verse), verse);
  assert.match(js, /const v = \(ref\) => \[`삼하 \$\{ref\}`, V\[ref\]\];/);
  for (const name of ['다윗', '헤브론', '이스라엘', '히람', '시온']) assert.ok(!new RegExp(`${name} (이|가|을|를|에|에게|의|과|와|로|은|는) `).test(js), `no markup gap after ${name}`);
});

test('Act 4 keeps its own save, carries Act 3, and is linked from Act 3 and the hub', () => {
  const html = read('land-of-david/hebron.html'), js = read('land-of-david/src/hebron.js');
  assert.match(html, /"three": "\.\.\/vendor\/three\.module\.js"/);
  assert.match(html, /<script type="module" src="\.\/src\/hebron\.js">/);
  assert.match(html, /#title \{[^}]*overflow-y: auto;[^}]*justify-content: safe center;[^}]*touch-action: pan-y;/);
  assert.match(html, /@media \(max-height: 440px\)/);
  assert.equal(H.ACT4_KEY, 'david-hebron-v1'); assert.equal(ACT4_KEY, H.ACT4_KEY);
  assert.match(js, /localStorage\.getItem\('david-ziklag-v1'\)/);
  assert.ok(!/localStorage\.setItem\('david-(progress|adullam-v1|herut-v1|ziklag-v1)'/.test(js), 'never writes other saves');
  assert.match(js, /localStorage\.setItem\(SAVE_KEY, JSON\.stringify\(rec\)\)/);
  assert.match(read('land-of-david/src/ziklag.js'), /button: '4막 · 헤브론으로', onClose: \(\) => \{ location\.href = '\.\/hebron\.html'; \}/);
  assert.match(read('land-of-david/index.html'), /<a id="act4" class="act serif" href="\.\/hebron\.html">/);
  assert.match(read('land-of-david/src/main.js'), /act4Record\(localStorage\)/);
  const withTo = new Function(`${js.match(/const withTo = [^\n]+/)[0]}; return withTo;`)();
  assert.equal(withTo(L.lookoutName), '북동쪽 망대로');
  assert.ok(!js.includes('(으)로'));
});

test('every wall segment needs a tribe that has not yet had its own; one crew alone cannot raise the ring', () => {
  const s = H.createHebron(L, 6, 300);
  s.act = 'covenant'; H.goToZion(s); H.startBuild(s); s.teleport = null;
  const c = s.crews[0]; Object.assign(c, { status: 'building', seg: 0, x: L.segSpots[0].x, z: L.segSpots[0].z, needIn: 1e9 });
  const D = { x: L.segSpots[0].x + 6, z: L.segSpots[0].z + 6 }, segEvents = [];
  for (let k = 0; k < 30 * 200; k++) { H.step(s, 1 / 30, { david: D }); for (const ev of A.drainEvents(s)) if (ev.type === 'segment') segEvents.push(ev); c.needIn = 1e9; }
  assert.equal(s.seg, 1, 'the lone crew builds only its own segment');
  assert.equal(segEvents[0].tribe, c.tribe);
  assert.match(s.hint, /새 지파/);
  // a fresh tribe arriving lets the next segment rise, helped by the first crew
  const c2 = s.crews[1]; Object.assign(c2, { status: 'building', seg: 1, x: L.segSpots[1].x, z: L.segSpots[1].z, needIn: 1e9 });
  for (let k = 0; k < 30 * 30 && s.seg < 2; k++) { H.step(s, 1 / 30, { david: D }); for (const ev of A.drainEvents(s)) if (ev.type === 'segment') segEvents.push(ev); c.needIn = c2.needIn = 1e9; }
  assert.equal(s.seg, 2); assert.equal(segEvents[1].tribe, c2.tribe);
});

test('in a full run all twelve tribes each own one segment', () => {
  for (const seed of [5, 9]) {
    const { s } = play(seed);
    const owners = s.crews.map((c) => c.owned).sort((a, b) => a - b);
    assert.deepEqual(owners, [...Array(12).keys()], `seed ${seed}`);
  }
});

test('bringing water to a thirsty crew beside the storehouse serves them instead of swapping for bread', () => {
  const s = H.createHebron(L, 8, 300);
  s.act = 'covenant'; H.goToZion(s); H.startBuild(s); s.teleport = null;
  const spot = L.segSpots.reduce((b, p) => (Math.hypot(p.x - L.zionBasket.x, p.z - L.zionBasket.z) < Math.hypot(b.x - L.zionBasket.x, b.z - L.zionBasket.z) ? p : b));
  assert.ok(Math.hypot(spot.x - L.zionBasket.x, spot.z - L.zionBasket.z) < 2.4, 'a wall spot really is within the storehouse range');
  const c = s.crews[0]; Object.assign(c, { status: 'building', need: 'water', x: spot.x, z: spot.z });
  s.carry = 'water';
  H.step(s, 1 / 30, { david: { x: spot.x, z: spot.z } });
  assert.equal(c.need, null, 'served');
  // walking past the storehouse with water someone still needs keeps the water
  const c2 = s.crews[1]; Object.assign(c2, { status: 'building', need: 'water', x: L.zionSpring.x, z: L.zionSpring.z });
  s.carry = 'water'; H.step(s, 1 / 30, { david: { x: L.zionBasket.x, z: L.zionBasket.z } });
  assert.equal(s.carry, 'water');
  c2.need = null; H.step(s, 1 / 30, { david: { x: L.zionBasket.x, z: L.zionBasket.z } });
  assert.equal(s.carry, 'bread', 'once nobody needs it, the storehouse swaps it');
});
