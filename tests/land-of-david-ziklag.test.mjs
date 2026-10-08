import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateZiklag } from '../land-of-david/src/ziklag-world.js';
import { reachable } from '../land-of-david/src/world.js';
import * as A from '../land-of-david/src/adullam-logic.js';
import * as Z from '../land-of-david/src/ziklag-logic.js';
import { act3Best, ACT3_KEY } from '../land-of-david/src/progress.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = generateZiklag();
const L = world.layout.stop;
const tile = (p) => [Math.round(p.x + world.W / 2), Math.round(p.z + world.H / 2)];
const nearSeen = (w, seen, p, r = 1.6) => { const ci = p.x + w.W / 2, cj = p.z + w.H / 2; for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (w.inb(i, j) && Math.hypot(i - ci, j - cj) <= r && seen[w.idx(i, j)]) return true; return false; };
const KEY_POINTS = ['spring', 'basket', 'lookout', 'rampBase', 'fire', 'roadStart', 'exit', 'returnSpot', 'abiathar', 'southGate', 'ford', 'baggage', 'brookWater', 'spoil', 'returnFrom', 'egyptian', 'overlook'];

test('every place in the act is walkable from the gate, with every tent up', () => {
  const w = generateZiklag(), Lw = w.layout.stop;
  for (const t of Lw.tentSpots) { const ti = Math.round(t.i), tj = Math.round(t.j); for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 1; di++) w.blocked[w.idx(ti + di, tj + dj)] = 1; }
  const seen = reachable(w, tile(Lw.entry));
  for (const k of KEY_POINTS) assert.ok(nearSeen(w, seen, Lw[k]), k);
  for (const k of ['waitSlots', 'restSlots', 'griefSlots', 'staySlots', 'returnSlots', 'guideRoad']) Lw[k].forEach((p, n) => assert.ok(nearSeen(w, seen, p, 1.2), `${k}[${n}]`));
  assert.ok(Lw.restSlots.length >= 24 && Lw.staySlots.length >= 4 && Lw.griefSlots.length >= 8);
});

test('브솔 시내 is crossed only at the ford, and the camp beyond the ridge cannot be entered', () => {
  const seen = reachable(world, tile(L.entry));
  let crossings = 0;
  for (let i = 0; i < world.W; i++) for (let j = 58; j < 70; j++) if (world.water[world.idx(i, j)] >= 0) { assert.ok(world.blocked[world.idx(i, j)]); crossings++; }
  assert.ok(crossings > 100, 'the brook spans the valley');
  assert.ok(!nearSeen(world, seen, L.camp, 2), 'the Amalekite camp is seen, not entered');
});

function play(seed, carried = 420) {
  const s = Z.createZiklag(L, seed, carried), dt = 1 / 30, D = { x: L.entry.x, z: L.entry.z }, events = [];
  for (let t = 0; t < 600 && s.act !== 'done'; t += dt) {
    if (s.teleport) { D.x = s.teleport.x; D.z = s.teleport.z; s.teleport = null; }
    let target = null;
    const wait = s.people.filter((p) => p.status === 'waiting'), fireP = wait.find((p) => p.need === 'fire');
    if (s.act === 'build' && s.phase === 'play') {
      const need = ['water', 'bread', 'watch'].find((r) => A.workers(s, r).length < 1), f = s.people.some((p) => p.status === 'following');
      if (s.people.some((p) => p.status === 'escort')) target = L.fire;
      else if (f && need) target = need === 'water' ? L.spring : need === 'bread' ? L.basket : L.lookout;
      else if (s.carry) target = wait.find((p) => p.need === s.carry) || fireP || L.fire;
      else if (fireP) target = fireP;
      else { const n = wait.find((p) => !p.claimedBy); target = n ? (n.need === 'water' ? L.spring : L.basket) : L.fire; }
    } else if (s.phase === 'gad') { target = s.gad; if (s.gad.arrived) Z.answerCall(s); }
    else if (s.act === 'leaving') target = L.exit;
    else if (s.act === 'away') Z.returnToZiklag(s);
    else if (s.act === 'burned') target = s.abiathar;
    else if (s.act === 'ephod') Z.startPursuit(s);
    else if (s.act === 'pursue') target = D.z < L.southGate.z - 0.6 ? L.southGate : L.ford;
    else if (s.act === 'egypt') target = s.carry ? s.egyptian : !s.fed.water ? L.brookWater : L.baggage;
    else if (s.act === 'egypt-up') Z.startGuide(s);
    else if (s.act === 'guide') target = s.guide.there ? L.overlook : s.egyptian;
    else if (s.act === 'recovered') Z.returnToBesor(s);
    else if (s.act === 'share') { if (s.carry) { target = s.people.find((p) => p.status === 'staying' && !p.shared); Z.giveShare(s, D); } else target = L.spoil; }
    else if (s.act === 'ending') Z.finish(s);
    if (target) { const dx = target.x - D.x, dz = target.z - D.z, d = Math.hypot(dx, dz); if (d > 0.3) { const st = Math.min(d, 4.4 * dt); D.x += (dx / d) * st; D.z += (dz / d) * st; } }
    Z.step(s, dt, { david: D });
    for (const ev of A.drainEvents(s)) events.push(ev.type);
  }
  return { s, events };
}

test('a full act: build, the call, the burned town, the ephod, 브솔, the Egyptian, recovery, equal shares', () => {
  const ORDER = ['restaffed', 'gad', 'leaving', 'away', 'burned', 'ephod', 'pursue', 'besor', 'egypt-up', 'guide', 'recovered', 'back-at-besor', 'shared', 'act-done'];
  for (const seed of [3, 7, 11, 19]) {
    const { s, events } = play(seed);
    assert.equal(s.act, 'done', `seed ${seed} ended in ${s.act}`);
    let at = -1; for (const e of ORDER) { const k = events.indexOf(e, at + 1); assert.ok(k > at, `${e} after the previous step (seed ${seed})`); at = k; }
    assert.ok(s.total > 80 && s.total < 300, `seed ${seed} took ${s.total}s`);
    assert.equal(s.shares, s.stayers.length, 'every group that stayed received a share');
    assert.ok(s.people.filter((p) => p.status === 'staying').every((p) => p.shared));
  }
});

test('reaching the north gate turns Act 1\'s ending into the march to Achish', () => {
  const s = Z.createZiklag(L, 6, 300);
  s.phase = 'leaving'; s.act = 'leaving';
  for (const p of s.people) { p.status = 'exodus'; p.x = L.exit.x; p.z = L.exit.z; }
  Z.step(s, 1 / 30, { david: { x: L.exit.x, z: L.exit.z } });
  const evs = A.drainEvents(s).map((e) => e.type);
  assert.equal(s.act, 'away'); assert.equal(s.phase, 'away');
  assert.ok(evs.includes('away') && !evs.includes('done'), evs.join(','));
});

test('the flock on screen follows the households who settle (S.flocks)', () => {
  const { s } = play(3);
  assert.ok(s.flocks > 3 && s.flocks <= 14, `flocks ${s.flocks}`);
  const js = read('land-of-david/src/ziklag.js');
  assert.match(js, /addSheep\(S\.flocks, FOLD\.x, FOLD\.z\)/);
  assert.match(js, /if \(!S\.burned && sheep\.length < S\.flocks\) addSheep\(S\.flocks - sheep\.length, FOLD\.x, FOLD\.z\);/);
});

test('households stay in the town when the men go, are taken (not killed), and come back', () => {
  const s = Z.createZiklag(L, 5, 400);
  assert.ok(s.people.every((p) => p.men && p.status === 'following'));
  assert.equal(s.people.reduce((n, p) => n + p.count, 0), 400);
  // two households arrive and are served
  for (let k = 0; k < 2; k++) s.people.push({ id: s.nextId++, kind: 'family', need: null, count: 10, status: 'resting', men: false, x: 0, z: 0, followT: 0 });
  s.phase = 'gad'; s.gad = { x: 0, z: 0, arrived: true };
  assert.ok(Z.answerCall(s));
  assert.ok(Z.households(s).every((p) => p.status === 'resting'), 'households stay');
  assert.ok(s.people.filter((p) => p.men).every((p) => p.status === 'exodus'), 'the men, watchers included, go');
  s.act = 'away';
  assert.ok(Z.returnToZiklag(s));
  assert.ok(Z.households(s).every((p) => p.status === 'taken'));
  assert.equal(s.taken, 20);
  assert.ok(s.burned && s.teleport);
  s.act = 'recovered';
  assert.ok(Z.returnToBesor(s));
  assert.ok(Z.households(s).every((p) => p.status === 'returning'), 'all recovered (30:19)');
});

test('about a third stay at 브솔 (200 of 600); the Egyptian needs both water and bread', () => {
  for (const carried of [240, 420, 600]) {
    const { s } = play(13, carried);
    const men = s.people.filter((p) => p.men).reduce((n, p) => n + p.count, 0);
    assert.ok(s.stayed / men > 0.2 && s.stayed / men < 0.45, `${s.stayed}/${men}`);
    assert.ok(s.stayers.length >= 2);
  }
  const s = Z.createZiklag(L, 9, 400); s.act = 'egypt'; s.phase = 'egypt'; s.egyptian = { x: L.egyptian.x, z: L.egyptian.z, up: false };
  const at = (p) => ({ x: p.x, z: p.z });
  Z.step(s, 0.1, { david: at(L.brookWater) }); assert.equal(s.carry, 'water');
  Z.step(s, 0.1, { david: at(L.egyptian) }); assert.ok(s.fed.water && !s.egyptian.up);
  Z.step(s, 0.1, { david: at(L.baggage) }); assert.equal(s.carry, 'bread');
  Z.step(s, 0.1, { david: at(L.egyptian) }); assert.ok(s.fed.bread && s.egyptian.up && s.act === 'egypt-up');
});

test('a share needs one in hand and a group that has not been given one; no attack action exists', () => {
  const { s } = play(7);
  assert.equal(Z.giveShare(s, { x: 0, z: 0 }), false, 'nothing to give after the act');
  const r = Z.createZiklag(L, 4, 300);
  r.act = 'share'; r.people[0].status = 'staying'; r.people[0].shared = false; r.stayers = [r.people[0].id];
  const by = { x: r.people[0].x + 1, z: r.people[0].z };
  assert.equal(Z.giveShare(r, by), false, 'empty hands');
  r.carry = 'share';
  assert.equal(Z.giveShare(r, { x: by.x + 5, z: by.z }), false, 'too far');
  assert.equal(Z.giveShare(r, by), true);
  assert.equal(r.act, 'ending');
  const code = (read('land-of-david/src/ziklag.js') + read('land-of-david/src/ziklag-logic.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/attack|kill|죽이기|치기\b|공격/.test(code), 'no attack action');
});

test('scripture on Act 3 cards matches 개역한글 wording (bskorea, 2026-10-08)', () => {
  const js = read('land-of-david/src/ziklag.js') + read('land-of-david/ziklag.html');
  for (const verse of [
    '아기스가 그 날에 시글락을 그에게 주었으므로 시글락이 오늘까지 유다 왕에게 속하니라',
    '그 때에 블레셋 사람이 이스라엘을 쳐서 싸우려고 군대를 모집한지라 아기스가 다윗에게 이르되 너는 밝히 알라 너와 네 사람들이 나와 한가지로 나가서 군대에 참가할 것이니라',
    '이에 다윗이 자기 사람들로 더불어 일찌기 아침에 일어나서 떠나 블레셋 사람의 땅으로 돌아가고 블레셋 사람은 이스르엘로 올라가니라',
    '다윗과 그의 사람들이 제 삼일에 시글락에 이를 때에 아말렉 사람들이 이미 남방과 시글락을 침로하였는데 그들이 시글락을 쳐서 불사르고',
    '거기 있는 대소 여인들을 하나도 죽이지 아니하고 다 사로잡아 끌고 자기 길을 갔더라',
    '다윗과 그의 사람들이 성에 이르러 본즉 성이 불탔고 자기들의 아내와 자녀들이 사로잡혔는지라',
    '백성이 각기 자녀들을 위하여 마음이 슬퍼서 다윗을 돌로 치자 하니 다윗이 크게 군급하였으나 그 하나님 여호와를 힘입고 용기를 얻었더라',
    '다윗이 아히멜렉의 아들 제사장 아비아달에게 이르되 청컨대 에봇을 내게로 가져오라 아비아달이 에봇을 다윗에게로 가져오매',
    '다윗이 여호와께 묻자와 가로되 내가 이 군대를 쫓아 가면 미치겠나이까 여호와께서 대답하시되 쫓아가라 네가 반드시 미치고 정녕 도로 찾으리라',
    '곧 피곤하여 브솔 시내를 건너지 못하는 이백인을 머물렀고 다윗은 사백인을 거느리고 쫓아가니라',
    '무리가 들에서 애굽 사람 하나를 만나 다윗에게로 데려다가 떡을 주어 먹게 하며 물을 마시우고',
    '무화과 뭉치에서 뗀 덩이 하나와 건포도 두 송이를 주었으니 그가 낮 사흘, 밤 사흘을 떡도 먹지 못하였고 물도 마시지 못하였음이라 그가 먹고 정신을 차리매',
    '다윗이 그에게 이르되 너는 뉘게 속하였으며 어디로서냐 가로되 나는 애굽 소년이요 아말렉 사람의 종이더니 사흘 전에 병이 들매 주인이 나를 버렸나이다',
    '그가 인도하여 내려가니 그들이 온 땅에 편만하여 블레셋 사람의 땅과 유다 땅에서 크게 탈취하였음을 인하여 먹고 마시며 춤추는지라',
    '다윗이 아말렉 사람의 취하였던 모든 것을 도로 찾고 그 두 아내를 구원하였고',
    '그들의 탈취하였던것 곧 무리의 자녀들이나 빼앗겼던 것의 대소를 물론하고 아무 것도 잃은 것이 없이 다윗이 도로 찾아왔고',
    '다윗이 가로되 나의 형제들아 여호와께서 우리를 보호하시고 우리를 치러 온 그 군대를 우리 손에 붙이셨은즉 그가 우리에게 주신 것을 너희가 이같이 못하리라',
    '이 일에 누가 너희를 듣겠느냐 전장에 내려갔던 자의 분깃이나 소유물 곁에 머물렀던 자의 분깃이 일반일찌니 같이 분배할것이니라 하고',
    '그 날부터 다윗이 이것으로 이스라엘의 율례와 규례를 삼았더니 오늘까지 이르니라',
  ]) assert.ok(js.includes(verse), verse);
  for (const name of ['다윗', '시글락', '아기스', '아비아달', '이스라엘', '이스르엘', '아히멜렉', '에봇']) assert.ok(!new RegExp(`${name} (이|가|을|를|에|에게|에게로|의|과|와|로|은|는) `).test(js), `no markup gap after ${name}`);
});

test('Act 3 keeps its own save, carries Act 2, and is linked from Act 2 and the hub', () => {
  const html = read('land-of-david/ziklag.html'), js = read('land-of-david/src/ziklag.js');
  assert.match(html, /"three": "\.\.\/vendor\/three\.module\.js"/);
  assert.match(html, /<script type="module" src="\.\/src\/ziklag\.js">/);
  assert.equal(Z.ACT3_KEY, 'david-ziklag-v1'); assert.equal(ACT3_KEY, Z.ACT3_KEY);
  assert.match(js, /localStorage\.getItem\('david-herut-v1'\)/);
  assert.ok(!/localStorage\.setItem\('david-(progress|adullam-v1|herut-v1)'/.test(js) && !js.includes("'david-progress'"), 'never writes other saves');
  assert.match(read('land-of-david/src/herut.js'), /button: '3막 · 시글락으로', onClose: \(\) => \{ location\.href = '\.\/ziklag\.html'; \}/);
  const hub = read('land-of-david/index.html');
  assert.match(hub, /<a id="act3" class="act serif" href="\.\/ziklag\.html">/);
  assert.match(read('land-of-david/src/main.js'), /act3Best\(localStorage\)/);
  const mem = new Map(), storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null) };
  assert.equal(act3Best(storage), 0); mem.set('david-ziklag-v1', '512'); assert.equal(act3Best(storage), 512);
  const withTo = new Function(`${js.match(/const withTo = [^\n]+/)[0]}; return withTo;`)();
  assert.equal(withTo(L.lookoutName), '북동쪽 성벽 망대로');
  assert.ok(!js.includes('(으)로'));
});

test('short landscape screens can scroll the title; the recovered flock forgets its old pasture', () => {
  const html = read('land-of-david/ziklag.html'), js = read('land-of-david/src/ziklag.js');
  assert.match(html, /#title \{[^}]*overflow-y: auto;[^}]*justify-content: safe center;[^}]*touch-action: pan-y;/);
  const back = js.slice(js.indexOf("case 'back-at-besor':"), js.indexOf("case 'back-at-besor':") + 400);
  assert.match(back, /a\.target = null; a\.wait = Math\.random\(\) \* 2;/);
});
