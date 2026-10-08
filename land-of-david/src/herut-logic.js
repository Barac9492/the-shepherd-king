// Act 2 · 헤렛 수풀 — the camp that keeps moving. Pure state, no DOM or three.js, so it runs in node.
// Built on the Act 1 rules (adullam-logic.js): serving, roles, Saul's rumour, leaving. This file only
// sequences the three stops (헤렛 수풀 → 그일라 → 엔게디) and adds the En-gedi cave scene (삼상 24).
import * as G from './adullam-logic.js';

export const ACT2_KEY = 'david-herut-v1';
export const DEFAULT_CARRIED = 240;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const emit = (s, type, data = {}) => s.events.push({ type, ...data });

function moveTo(p, tx, tz, speed, dt, stop = 0.08) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { p.moving = false; return true; }
  const st = Math.min(d - stop * 0.5, speed * dt);
  p.x += (dx / d) * st; p.z += (dz / d) * st; p.moving = st > 0.001; p.dx = dx; p.dz = dz;
  return d - st <= stop;
}

/** carried: how many people came out of Adullam with David (Act 1 result). */
export function createHerut(stops, seed = 7, carried = DEFAULT_CARRIED) {
  const s = G.createAdullam(stops[0], seed);
  carried = Math.max(60, Math.round(carried) || DEFAULT_CARRIED);
  Object.assign(s, { stops, stop: 0, act: 'play', scripted: 99, stopT: 0, total: 0, arrivalsLeft: stops[0].arrivals, carried, saul: null, robe: false, teleport: null, restaffed: [false, false, false] });
  const L = stops[0], groups = Math.max(4, Math.min(9, Math.round(carried / 32))), r = s.rng;
  let left = carried;
  for (let g = 0; g < groups; g++) {
    const count = g === groups - 1 ? left : Math.round(carried / groups); left -= count;
    s.people.push({
      id: s.nextId++, kind: ['family', 'distress', 'debt', 'bitter'][g % 4], need: null, count, story: '', status: 'following', role: null, slot: null,
      x: L.entry.x + (r() - 0.5) * 2, z: L.entry.z + 1 + g * 0.7, tx: 0, tz: 0, waited: 0, claimedBy: null, followT: ++s.followSeq, rest: null, task: null, carry: null, look: Math.floor(r() * 9), moving: false,
    });
  }
  s.joined = carried; s.groups = groups;
  return s;
}

export const stopOf = (s) => s.stops[s.stop];

function arriveNext(s) {
  s.events = s.events.filter((e) => e.type !== 'done');
  s.stop++;
  const L = s.stops[s.stop], r = s.rng;
  s.layout = L; s.phase = 'play'; s.attention = 0; s.t = 0; s.stopT = 0; s.gad = null; s.carry = null; s.waitingLeft = 0;
  s.arrivalsLeft = L.arrivals; s.spawnIn = 5;
  for (const p of s.people) {
    if (p.need) { s.joined += p.count; s.groups++; p.need = null; } // unserved people who came along are now part of the camp
    Object.assign(p, { status: 'following', role: null, task: null, carry: null, home: null, rest: null, slot: null, claimedBy: null, followAge: 0, upRamp: false, followT: ++s.followSeq });
    p.x = L.entry.x + (r() - 0.5) * 2.4; p.z = L.entry.z + 0.8 + r() * 2.2;
  }
  s.teleport = { x: L.entry.x, z: L.entry.z };
  emit(s, 'stop', { stop: s.stop });
}

/** Leave the current stop (after its event card). At En-gedi the people hide in the cave instead. */
export function leaveStop(s) {
  if (s.phase !== 'gad') return;
  if (s.stop < s.stops.length - 1) { G.startLeaving(s); return; }
  // 삼상 24:3 — everyone goes deep into the cave
  const L = s.layout; let n = 0;
  s.act = 'hide'; s.phase = 'hide'; s.carry = null;
  for (const p of s.people) {
    if (p.need) { s.joined += p.count; s.groups++; p.need = null; }
    Object.assign(p, { status: 'hiding', role: null, task: null, carry: null, claimedBy: null, hideSlot: n++ % L.caveSlots.length });
  }
  emit(s, 'hide');
}

export function davidInCave(s, D) {
  const L = stopOf(s);
  return !!L.cave && dist(D, L.cave) < 3.6 && D.z < L.caveMouth.z - 0.4;
}

/** Cut the corner of Saul's robe (24:4). The only thing David can do near Saul; there is no attack. */
export function cutRobe(s, D) {
  if (s.act !== 'robe' || !s.saul || dist(D, s.saul) > 1.9) return false;
  s.robe = true; s.act = 'ending'; s.hint = '';
  emit(s, 'robe');
  return true;
}

export function finish(s) {
  if (s.act !== 'ending') return;
  s.act = 'done'; s.phase = 'done';
  emit(s, 'act-done');
}

export function step(s, dt, input) {
  if (s.act === 'done' || s.act === 'ending') return '';
  const L = stopOf(s), D = input.david;
  s.total += dt;
  if (s.act === 'play') {
    if (s.phase === 'play' && s.arrivalsLeft <= 0) s.spawnIn = Math.max(s.spawnIn, 99);
    const before = s.people.length, att0 = s.attention;
    let hint = G.step(s, dt, input);
    if (s.people.length > before) s.arrivalsLeft -= s.people.length - before;
    if (s.phase === 'play') {
      s.stopT += dt;
      s.attention = Math.min(100, att0 + (s.attention - att0) * L.rate);
      if (s.stopT >= L.maxTime) s.attention = 100;
      if (!s.restaffed[s.stop] && ['water', 'bread', 'watch'].every((r) => G.workers(s, r).length > 0)) { s.restaffed[s.stop] = true; emit(s, 'restaffed', { stop: s.stop }); }
      if (hint) hint = hint.replace(G.WHERE.water, L.where.water).replace(G.WHERE.bread, L.where.bread);
    }
    if (s.phase === 'leaving') hint = s.stop === 0 ? '불빛을 따라 동쪽 길로 떠나세요 (그일라로)' : '불빛을 따라 동쪽 성문으로 나가세요 (광야로)';
    if (s.phase === 'done' && s.stop < s.stops.length - 1) { arriveNext(s); hint = ''; }
    s.hint = hint;
    return hint;
  }
  // ---- En-gedi: hide, Saul comes, the robe ----
  let hidden = 0;
  for (const p of s.people) {
    if (p.status !== 'hiding') continue;
    const slot = L.caveSlots[p.hideSlot];
    if (moveTo(p, slot.x + ((p.id * 37) % 7 - 3) * 0.08, slot.z + ((p.id * 53) % 7 - 3) * 0.06, 3.6, dt, 0.15)) hidden++;
  }
  const allHidden = hidden === s.people.filter((p) => p.status === 'hiding').length;
  const inCave = davidInCave(s, D);
  if (s.act === 'hide') {
    s.hint = allHidden ? (inCave ? '' : '모두 굴 깊은 곳에 숨었습니다. 다윗도 굴 안으로 들어가세요') : '사람들이 굴 깊은 곳으로 들어가고 있습니다. 다윗도 굴 안으로';
    if (allHidden && inCave) {
      s.act = 'saul'; s.saul = { x: L.saulStart.x, z: L.saulStart.z, wp: 0, moving: true, arrived: false };
      emit(s, 'saul');
    }
    return s.hint;
  }
  if (s.act === 'saul') {
    const road = L.saulRoad, target = s.saul.wp < road.length ? road[s.saul.wp] : L.saulSpot;
    if (moveTo(s.saul, target.x, target.z, 4.6, dt, 0.3)) { if (s.saul.wp < road.length) s.saul.wp++; else { s.saul.arrived = true; s.saul.moving = false; s.act = 'robe'; emit(s, 'saul-in-cave'); } }
    s.hint = '누군가 길을 따라 굴로 올라오고 있습니다…';
    return s.hint;
  }
  if (s.act === 'robe') {
    s.hint = dist(D, s.saul) <= 1.9 ? '옷자락을 가만히 베기 (E / 버튼)' : '사울이 굴 어귀에 들어왔습니다. 조용히 가까이 가 보세요';
    return s.hint;
  }
  return '';
}

export function summary(s) {
  return { joined: s.joined, carried: s.carried, stops: s.stop + 1, servedByDavid: s.servedByDavid, servedByPeople: s.servedByPeople, restaffed: s.restaffed.filter(Boolean).length, seconds: Math.round(s.total), robe: s.robe };
}
