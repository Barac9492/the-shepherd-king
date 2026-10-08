import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateWilderness } from '../land-of-david/src/herut-world.js';
import { reachable } from '../land-of-david/src/world.js';
import * as A from '../land-of-david/src/adullam-logic.js';
import * as H from '../land-of-david/src/herut-logic.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = generateWilderness();
const STOPS = world.layout.stops;
const tile = (p) => [Math.round(p.x + world.W / 2), Math.round(p.z + world.H / 2)];
const nearSeen = (seen, p, r = 1.6) => { const ci = p.x + world.W / 2, cj = p.z + world.H / 2; for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (world.inb(i, j) && Math.hypot(i - ci, j - cj) <= r && seen[world.idx(i, j)]) return true; return false; };

test('three stops in order: 헤렛 수풀 → 그일라 → 엔게디', () => {
  assert.deepEqual(STOPS.map((s) => s.name), ['헤렛 수풀', '그일라', '엔게디']);
  assert.ok(STOPS[0].entry.x < STOPS[1].entry.x && STOPS[1].entry.x < STOPS[2].entry.x, 'west to east');
});

test('every place David or his people must reach at each stop is walkable from that stop\'s entry', () => {
  for (const st of STOPS) {
    const seen = reachable(world, tile(st.entry));
    for (const k of ['spring', 'basket', 'lookout', 'rampBase', 'fire', 'roadStart', ...(st.exit ? ['exit'] : []), ...(st.cave ? ['cave', 'caveMouth', 'saulStart', 'saulSpot'] : [])]) assert.ok(nearSeen(seen, st[k]), `${st.id}.${k}`);
    for (const k of ['waitSlots', 'restSlots', 'caveSlots']) for (const p of st[k] || []) assert.ok(nearSeen(seen, p, 1.2), `${st.id}.${k}`);
    assert.ok(st.restSlots.length >= 20, `${st.id} has room to rest`);
  }
  assert.ok(STOPS[2].caveSlots.length >= 8, 'room to hide deep in the cave (24:3)');
});

// a simple player: staff each role again at every stop, serve newcomers, leave when told, hide, cut the robe
function play(seed, carried = 240) {
  const s = H.createHerut(STOPS, seed, carried), dt = 1 / 30;
  const D = { x: STOPS[0].entry.x, z: STOPS[0].entry.z };
  const seen = { stops: [0], restaffed: [], events: [] };
  for (let t = 0; t < 600 && s.act !== 'done'; t += dt) {
    const L = H.stopOf(s);
    if (s.teleport) { D.x = s.teleport.x; D.z = s.teleport.z; s.teleport = null; }
    let target = null;
    const wait = s.people.filter((p) => p.status === 'waiting'), fireP = wait.find((p) => p.need === 'fire');
    if (s.act === 'play' && s.phase === 'play') {
      const following = s.people.some((p) => p.status === 'following');
      const need = ['water', 'bread', 'watch'].find((r) => A.workers(s, r).length < 1);
      if (s.people.some((p) => p.status === 'escort')) target = L.fire;
      else if (following && need) target = need === 'water' ? L.spring : need === 'bread' ? L.basket : L.lookout;
      else if (s.carry) target = wait.find((p) => p.need === s.carry) || fireP || L.fire;
      else if (fireP) target = fireP;
      else { const n = wait.find((p) => !p.claimedBy); target = n ? (n.need === 'water' ? L.spring : L.basket) : L.fire; }
    } else if (s.phase === 'gad') { target = s.gad; if (s.gad.arrived) H.leaveStop(s); }
    else if (s.phase === 'leaving') target = L.exit;
    else if (s.act === 'hide') target = L.cave;
    else if (s.act === 'saul') target = L.cave;
    else if (s.act === 'robe') { target = s.saul; H.cutRobe(s, D); }
    else if (s.act === 'ending') H.finish(s);
    if (target) { const dx = target.x - D.x, dz = target.z - D.z, d = Math.hypot(dx, dz); if (d > 0.3) { const st = Math.min(d, 4.4 * dt); D.x += (dx / d) * st; D.z += (dz / d) * st; } }
    H.step(s, dt, { david: D });
    for (const ev of A.drainEvents(s)) { seen.events.push(ev.type); if (ev.type === 'stop') seen.stops.push(ev.stop); if (ev.type === 'restaffed') seen.restaffed.push(ev.stop); }
  }
  return { s, seen };
}

test('a full act moves the camp twice, hides at En-gedi, spares Saul, in a few minutes', () => {
  for (const seed of [3, 7, 11, 19]) {
    const { s, seen } = play(seed);
    assert.equal(s.act, 'done', `seed ${seed} ended in ${s.act}/${s.phase}`);
    assert.deepEqual(seen.stops, [0, 1, 2], 'visits each stop once, in order');
    assert.deepEqual(seen.restaffed, [0, 1, 2], 'roles are set up again at every stop');
    assert.ok(s.robe, 'the robe was cut');
    assert.ok(s.total > 120 && s.total < 330, `seed ${seed} took ${s.total}s`);
    for (const t of ['hide', 'saul', 'saul-in-cave', 'robe', 'act-done']) assert.ok(seen.events.includes(t), t);
    assert.ok(!seen.events.includes('done'), 'Act 1\'s single-stop ending never fires mid-journey');
    assert.ok(s.joined >= 240, 'nobody is lost on the way');
  }
});

test('the people from Adullam come along, and newcomers are few', () => {
  const s = H.createHerut(STOPS, 5, 377);
  assert.equal(s.joined, 377);
  assert.equal(s.people.reduce((n, p) => n + p.count, 0), 377);
  assert.ok(s.people.every((p) => p.status === 'following'));
  assert.equal(H.createHerut(STOPS, 5, 0).carried, H.DEFAULT_CARRIED, 'no Act 1 result: a default company');
  assert.ok(STOPS.every((st) => st.arrivals <= 3));
});

test('arriving at a new stop drops every role: the camp is set up again', () => {
  const r = H.createHerut(STOPS, 7, 240);
  // two people already hold roles at 헤렛 when the news comes
  r.people[0].status = 'working'; r.people[0].role = 'water'; r.people[1].status = 'working'; r.people[1].role = 'watch';
  r.phase = 'gad'; r.gad = { x: 0, z: 0, arrived: true }; H.leaveStop(r);
  assert.equal(r.phase, 'leaving');
  H.step(r, 1 / 30, { david: { x: STOPS[0].exit.x, z: STOPS[0].exit.z } });
  assert.equal(r.stop, 1);
  assert.equal(A.workers(r).length, 0, 'no one keeps a role from the last stop');
  assert.ok(r.people.every((p) => p.status === 'following'));
  assert.ok(r.teleport && Math.hypot(r.teleport.x - STOPS[1].entry.x, r.teleport.z - STOPS[1].entry.z) < 0.01);
});

test('near Saul the only action is cutting the robe; it needs David to be close', () => {
  const r = H.createHerut(STOPS, 9, 240), L = STOPS[2];
  r.stop = 2; r.layout = L; r.act = 'robe'; r.saul = { x: L.saulSpot.x, z: L.saulSpot.z };
  assert.equal(H.cutRobe(r, { x: L.saulSpot.x + 4, z: L.saulSpot.z }), false, 'too far');
  assert.equal(H.cutRobe(r, { x: L.saulSpot.x + 1, z: L.saulSpot.z }), true);
  const ui = read('land-of-david/src/herut.js') + read('land-of-david/src/herut-logic.js');
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/attack|kill|죽이기|치기\b/.test(code), 'no attack action exists');
});

test('scripture on Act 2 cards matches 개역한글 wording (bskorea, 2026-10-08)', () => {
  const js = read('land-of-david/src/herut.js') + read('land-of-david/herut.html');
  for (const verse of [
    '혹이 다윗에게 고하여 가로되 보소서 블레셋 사람이 그일라를 쳐서 그 타작마당을 탈취하더이다',
    '이에 다윗이 여호와께 묻자와 가로되 내가 가서 이 블레셋 사람을 치리이까 여호와께서 다윗에게 이르시되 가서 블레셋 사람을 치고 그일라를 구원하라 하시니',
    '다윗이 이와 같이 그일라 거민을 구원하니라',
    '다윗이 그일라에 온것을 혹이 사울에게 고하매 사울이 가로되 하나님이 그를 내 손에 붙이셨도다 그가 문과 문빗장이 있는 성에 들어갔으니 갇혔도다',
    '다윗이 가로되 그일라 사람들이 나와 내 사람들을 사울의 손에 붙이겠나이까 여호와께서 가라사대 그들이 너를 붙이리라',
    '다윗과 그의 사람 육백명 가량이 일어나 그일라를 떠나서 갈 수 있는 곳으로 갔더니',
    '다윗이 거기서 올라가서 엔게디 요새에 거하니라',
    '사울이 온 이스라엘에서 택한 사람 삼천을 거느리고 다윗과 그의 사람들을 찾으러 들염소 바위로 갈쌔',
    '다윗의 사람들이 가로되 보소서 여호와께서 당신에게 이르시기를 내가 원수를 네 손에 붙이리니 네 소견에 선한대로 그에게 행하라 하시더니 이것이 그 날이니이다 다윗이 일어나서 사울의 겉옷자락을 가만히 베니라',
    '그리한 후에 사울의 옷자락 벰을 인하여 다윗의 마음이 찔려',
    '자기 사람들에게 이르되 내가 손을 들어 여호와의 기름 부음을 받은 내 주를 치는 것은 여호와의 금하시는 것이니 그는 여호와의 기름 부음을 받은 자가 됨이니라 하고',
    '다윗에게 이르되 나는 너를 학대하되 너는 나를 선대하니 너는 나보다 의롭도다',
    '다윗이 사울에게 맹세하매 사울은 집으로 돌아가고 다윗과 그의 사람들은 요새로 올라가니라',
  ]) assert.ok(js.includes(verse), verse);
});

test('the renderer never hides the Act 2 rules behind a local name, and arrows point at this stop only', () => {
  const js = read('land-of-david/src/herut.js');
  // a local `H = innerHeight` once shadowed the logic module and froze the game at the cave
  assert.ok(!/(?:const|let|var)\s+[^;=]*\bH\s*=/.test(js) && !/,\s*H\s*=/.test(js), 'no local H');
  assert.match(js, /STATIONS\.find\(\(q\) => q\.kind === need && q\.stop === S\.stop\)/);
});

test('place names take the right particle: 언덕으로, 망대로, 바위로', () => {
  const js = read('land-of-david/src/herut.js');
  assert.ok(!js.includes('(으)로'), 'no fallback (으)로 in player text');
  const src = js.match(/const withTo = [^\n]+/)[0];
  const withTo = new Function(`${src}; return withTo;`)();
  assert.deepEqual(STOPS.map((s) => withTo(s.lookoutName)), ['북동쪽 언덕으로', '북동쪽 성벽 망대로', '동쪽 들염소 바위로']);
  assert.equal(withTo('길'), '길로');
});

test('watcher hints disappear once roles can no longer be set, and the roles chip cannot run under the rumour panel (PR #35 review)', () => {
  const a1 = read('land-of-david/src/adullam.js'), a2 = read('land-of-david/src/herut.js');
  assert.match(a1, /\$\('rumorHint'\)\.textContent = S\.phase !== 'play' \? ''/);
  assert.match(a2, /\$\('rumorHint'\)\.textContent = S\.act !== 'play' \|\| S\.phase !== 'play' \? ''/);
  assert.match(a1, /watchN, S\.phase\]\.join/, 'HUD refreshes when the phase changes');
  assert.match(a2, /S\.act, S\.phase\]\.join/);
  for (const f of ['land-of-david/adullam.html', 'land-of-david/herut.html']) assert.match(read(f), /#roles \{ top: calc\(98px \+ env\(safe-area-inset-top\)\); max-width: calc\(100vw - 186px\); \}/, f);
});

test('Act 2 keeps its own save and links back to the hub and to Act 1', () => {
  const html = read('land-of-david/herut.html'), js = read('land-of-david/src/herut.js');
  assert.match(html, /"three": "\.\.\/vendor\/three\.module\.js"/);
  assert.match(html, /<script type="module" src="\.\/src\/herut\.js">/);
  assert.equal(H.ACT2_KEY, 'david-herut-v1');
  assert.ok(!js.includes("'david-progress'") && !/localStorage\.setItem\('david-adullam-v1'/.test(js), 'never writes story or Act 1 saves');
  assert.match(js, /href="\.\/"/);
  assert.match(read('land-of-david/src/adullam.js'), /herut\.html/, 'Act 1 ending leads into Act 2');
});
