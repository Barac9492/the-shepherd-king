// Act 3 · 시글락 — a real town, burned while you were away (삼상 27:5–7, 28:1–2, 29, 30).
// Pure state, no DOM or three.js, so it runs in node. The building phase reuses the Act 1 rules
// (adullam-logic.js: serving, roles, pressure, leaving). Everything after the call is sequenced here.
// There is no attack anywhere: the battle of 30:17 is told on a card, not played.
import * as G from './adullam-logic.js';

export const ACT3_KEY = 'david-ziklag-v1';
export const DEFAULT_CARRIED = 400;
export const SHARE_RANGE = 1.9;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const emit = (s, type, data = {}) => s.events.push({ type, ...data });

function moveTo(p, tx, tz, speed, dt, stop = 0.08) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { p.moving = false; return true; }
  const st = Math.min(d - stop * 0.5, speed * dt);
  p.x += (dx / d) * st; p.z += (dz / d) * st; p.moving = st > 0.001; p.dx = dx; p.dz = dz;
  return d - st <= stop;
}

/** carried: how many came with David from En-gedi (Act 2 result). They are the men; newcomers are households. */
export function createZiklag(L, seed = 7, carried = DEFAULT_CARRIED) {
  const s = G.createAdullam(L, seed);
  carried = Math.max(60, Math.round(carried) || DEFAULT_CARRIED);
  Object.assign(s, {
    act: 'build', scripted: 99, total: 0, carried, arrivalsLeft: L.arrivals, restaffed: false, teleport: null,
    abiathar: { ...L.abiathar }, egyptian: null, fed: { water: false, bread: false }, guide: null,
    stayers: [], shares: 0, flocks: 3, burned: false, pursuers: 0, stayed: 0,
  });
  const groups = Math.max(5, Math.min(9, Math.round(carried / 45))), r = s.rng;
  let left = carried;
  for (let g = 0; g < groups; g++) {
    const count = g === groups - 1 ? left : Math.round(carried / groups); left -= count;
    s.people.push({
      id: s.nextId++, kind: ['distress', 'debt', 'bitter', 'family'][g % 4], need: null, count, story: '', status: 'following', role: null, slot: null, men: true,
      x: L.entry.x + (r() - 0.5) * 2, z: L.entry.z - 1 - g * 0.6, tx: 0, tz: 0, waited: 0, claimedBy: null, followT: ++s.followSeq, rest: null, task: null, carry: null, look: Math.floor(r() * 9), moving: false,
    });
  }
  s.joined = carried; s.groups = groups;
  return s;
}

const men = (s) => s.people.filter((p) => p.men);
export const households = (s) => s.people.filter((p) => !p.men);

/** After Achish's messenger (28:1–2): the men go with David by the north gate; households stay in the town (27:3). */
export function answerCall(s) {
  if (s.act !== 'build' || s.phase !== 'gad') return false;
  G.startLeaving(s);
  for (const p of households(s)) {
    if (p.need) { s.joined += p.count; s.groups++; p.need = null; }
    const k = s.layout.restSlots.length ? (p.id * 7) % s.layout.restSlots.length : 0;
    Object.assign(p, { status: 'resting', rest: k, task: null, carry: null, role: null, claimedBy: null, slot: null });
  }
  s.act = 'leaving';
  return true;
}

/** 29:11 → 30:1–3: three days later David is back at the north gate. The town is burned; households and flocks are gone. */
export function returnToZiklag(s) {
  if (s.act !== 'away') return false;
  const L = s.layout;
  s.burned = true; s.act = 'burned'; s.phase = 'burned'; s.carry = null; s.flocksTaken = s.flocks;
  s.taken = households(s).reduce((n, p) => n + p.count, 0);
  let n = 0;
  for (const p of s.people) {
    if (!p.men) { Object.assign(p, { status: 'taken', role: null, task: null, carry: null }); continue; }
    const g = L.griefSlots[n++ % L.griefSlots.length];
    Object.assign(p, { status: 'grieving', role: null, task: null, carry: null, home: null, rest: null, slot: null, claimedBy: null, x: g.x + (s.rng() - 0.5), z: g.z + (s.rng() - 0.5) });
  }
  s.teleport = { x: L.returnSpot.x, z: L.returnSpot.z };
  emit(s, 'burned', { taken: s.taken });
  return true;
}

/** 30:7–8 card closed: everyone follows David south toward the brook. */
export function startPursuit(s) {
  if (s.act !== 'ephod') return false;
  s.act = 'pursue'; s.phase = 'pursue';
  for (const p of men(s)) { p.status = 'pursuing'; p.followT = ++s.followSeq; }
  emit(s, 'pursue');
  return true;
}

/** 30:9–10 — about a third (200 of 600) are too tired to cross and stay with the baggage. */
function splitAtBesor(s) {
  const L = s.layout, ms = men(s).sort((a, b) => a.followT - b.followT);
  const total = ms.reduce((n, p) => n + p.count, 0);
  let stay = 0, n = 0;
  // the last groups in the line stay: a third of the groups (200 of 600), never fewer than two
  const nStay = Math.max(2, Math.round(ms.length / 3));
  for (let k = ms.length - 1; k >= ms.length - nStay; k--) {
    const p = ms[k]; p.status = 'staying'; p.stay = L.staySlots[n % L.staySlots.length]; p.shared = false; stay += p.count; n++;
  }
  s.stayers = ms.filter((p) => p.status === 'staying').map((p) => p.id);
  s.stayed = stay; s.pursuers = total - stay;
  s.act = 'egypt'; s.phase = 'egypt';
  s.egyptian = { x: L.egyptian.x, z: L.egyptian.z, up: false, moving: false };
  emit(s, 'besor', { stayed: stay, went: total - stay });
}

/** 30:16–19 card closed: back to the brook with everyone and everything recovered. */
export function returnToBesor(s) {
  if (s.act !== 'recovered') return false;
  const L = s.layout; let n = 0;
  s.act = 'share'; s.phase = 'share'; s.carry = null; s.guide = null; s.egyptian = null;
  for (const p of s.people) {
    if (p.status === 'staying') continue;
    const g = L.returnSlots[n++ % L.returnSlots.length];
    Object.assign(p, { status: p.men ? 'pursuing' : 'returning', x: g.x + (s.rng() - 0.5), z: g.z + (s.rng() - 0.5), followT: ++s.followSeq });
  }
  s.flocks = s.flocksTaken || s.flocks;
  s.teleport = { x: L.returnFrom.x, z: L.returnFrom.z };
  emit(s, 'back-at-besor');
  return true;
}

/** Give one share to the stayer group David is standing by (30:24). Needs a share in hand. */
export function giveShare(s, D) {
  if (s.act !== 'share' || s.carry !== 'share') return false;
  const p = s.people.find((q) => q.status === 'staying' && !q.shared && dist(D, q) <= SHARE_RANGE);
  if (!p) return false;
  p.shared = true; s.carry = null; s.shares++;
  emit(s, 'share', { id: p.id, count: p.count, left: s.stayers.length - s.shares });
  if (s.shares >= s.stayers.length) { s.act = 'ending'; s.hint = ''; emit(s, 'shared'); }
  return true;
}

export function finish(s) {
  if (s.act !== 'ending') return;
  s.act = 'done'; s.phase = 'done';
  emit(s, 'act-done');
}

function follow(s, p, D, dt, rank, speed = 4.3) {
  const row = Math.floor(rank / 3), col = (rank % 3) - 1;
  const tx = D.x + col * 1.1 + ((p.id * 13) % 5 - 2) * 0.08, tz = D.z - 1.6 - row * 1.0;
  moveTo(p, tx, tz, speed, dt, 0.5);
}

export function step(s, dt, input) {
  if (s.act === 'done' || s.act === 'ending') return '';
  const L = s.layout, D = input.david;
  s.total += dt;

  // ---- building the town: the Act 1 rules at one stop ----
  if (s.act === 'build' || s.act === 'leaving') {
    if (s.phase === 'play' && s.arrivalsLeft <= 0) s.spawnIn = Math.max(s.spawnIn, 99);
    const before = s.people.length;
    let hint = G.step(s, dt, input);
    if (s.people.length > before) { s.arrivalsLeft -= s.people.length - before; for (const p of s.people.slice(before)) p.men = false; }
    s.events = s.events.filter((e) => e.type !== 'done'); // Act 1's own ending never fires here
    if (s.phase === 'play') {
      // the bar is the days in Ziklag, "일년 넉달" (27:7); Saul has stopped searching (27:4), so watchers guard the walls, not the clock
      s.attention = Math.min(100, (s.t / L.maxTime) * 100);
      if (!s.restaffed && ['water', 'bread', 'watch'].every((r) => G.workers(s, r).length > 0)) { s.restaffed = true; emit(s, 'restaffed'); }
      s.flocks = Math.min(14, 3 + Math.floor(households(s).filter((p) => !p.need && p.status !== 'arriving' && p.status !== 'waiting').length * 2));
      if (hint) hint = hint.replace(G.WHERE.water, L.where.water).replace(G.WHERE.bread, L.where.bread);
    }
    if (s.phase === 'leaving') hint = '사람들을 데리고 북쪽 성문으로 나가세요 (아기스에게로). 가족들은 성에 남습니다';
    if (s.phase === 'done') { s.act = 'away'; s.phase = 'away'; hint = ''; emit(s, 'away'); }
    s.hint = hint;
    return hint;
  }

  // ---- after the call ----
  const ms = men(s).filter((p) => p.status === 'pursuing').sort((a, b) => a.followT - b.followT);
  if (s.act === 'burned' || s.act === 'ephod') {
    for (const p of s.people) if (p.status === 'grieving') moveTo(p, p.x, p.z, 0, dt);
    if (s.act === 'burned' && dist(D, s.abiathar) < 1.8) { s.act = 'ephod'; s.phase = 'ephod'; emit(s, 'ephod'); }
    s.hint = s.act === 'burned' ? '성이 불탔습니다. 광장의 제사장 아비아달에게 가세요' : '';
    return s.hint;
  }
  ms.forEach((p, k) => follow(s, p, D, dt, k));
  for (const p of s.people) if (p.status === 'staying') moveTo(p, p.stay.x, p.stay.z, 3.2, dt, 0.2);
  for (const p of s.people) if (p.status === 'returning') moveTo(p, p.x, p.z, 0, dt);

  if (s.act === 'pursue') {
    if (dist(D, L.ford) < 2.6) splitAtBesor(s);
    s.hint = D.z < L.southGate.z ? '남쪽 성문으로 나가 브솔 시내로 가세요' : '브솔 시내까지 남쪽으로';
    return s.hint;
  }
  if (s.act === 'egypt') {
    const E = s.egyptian;
    if (dist(D, L.brookWater) < 2.4 && s.carry !== 'water' && !s.fed.water) { s.carry = 'water'; emit(s, 'pickup', { item: 'water' }); }
    if (dist(D, L.baggage) < 2.4 && s.carry !== 'bread' && !s.fed.bread) { s.carry = 'bread'; emit(s, 'pickup', { item: 'bread' }); }
    if (s.carry && dist(D, E) < 1.9 && !s.fed[s.carry]) { s.fed[s.carry] = true; emit(s, 'fed', { item: s.carry }); s.carry = null; }
    if (s.fed.water && s.fed.bread && !E.up) { E.up = true; s.act = 'egypt-up'; s.phase = 'egypt-up'; emit(s, 'egypt-up'); }
    const near = dist(D, E) < 6;
    s.hint = !near && !s.carry && !s.fed.water && !s.fed.bread ? '들에 누군가 쓰러져 있습니다. 시내를 건너 남동쪽으로'
      : s.carry ? '쓰러진 사람에게 가져다주세요'
      : !s.fed.water && !s.fed.bread ? '물(시내 동쪽 물가)과 떡(북쪽 둑의 짐 곁)을 가져다주세요'
      : !s.fed.water ? '이제 물을 가져다주세요 (시내 동쪽 물가)' : '이제 떡을 가져다주세요 (북쪽 둑의 짐 곁)';
    return s.hint;
  }
  if (s.act === 'egypt-up') { s.hint = ''; return ''; }
  if (s.act === 'guide') {
    const E = s.egyptian, road = L.guideRoad, target = s.guide.wp < road.length ? road[s.guide.wp] : L.overlook;
    const lead = dist(D, E) < 5; // he waits for David
    if (lead && moveTo(E, target.x, target.z, 3.6, dt, 0.3)) { if (s.guide.wp < road.length) s.guide.wp++; else s.guide.there = true; }
    else E.moving = lead && !s.guide.there;
    if (s.guide.there && dist(D, L.overlook) < 3) { s.act = 'recovered'; s.phase = 'recovered'; emit(s, 'recovered'); }
    s.hint = s.guide.there ? '언덕 위에서 내려다보세요' : '애굽 소년을 따라가세요';
    return s.hint;
  }
  if (s.act === 'share') {
    if (dist(D, L.spoil) < 2.2 && !s.carry) { s.carry = 'share'; emit(s, 'pickup', { item: 'share' }); }
    const left = s.stayers.length - s.shares;
    s.hint = s.carry === 'share' ? `브솔 시내에 머문 사람들에게 몫을 주세요 (남은 무리 ${left})` : `되찾은 물건 더미에서 몫을 들고 오세요 (남은 무리 ${left})`;
    return s.hint;
  }
  return '';
}

/** 30:13–15 card closed: the Egyptian gets up and leads the way. */
export function startGuide(s) {
  if (s.act !== 'egypt-up') return false;
  s.act = 'guide'; s.phase = 'guide'; s.guide = { wp: 0, there: false };
  emit(s, 'guide');
  return true;
}

export function summary(s) {
  return { joined: s.joined, carried: s.carried, households: households(s).reduce((n, p) => n + p.count, 0), taken: s.taken || 0, stayed: s.stayed, went: s.pursuers, shares: s.shares, seconds: Math.round(s.total) };
}
