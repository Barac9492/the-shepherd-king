// Act 4 · 헤브론 → 다윗성 — building, not fleeing, for the first time (삼하 2:1–4, 5:1–12).
// Pure state, no DOM or three.js, so it runs in node. Hebron reuses the Act 1 rules (adullam-logic.js)
// with no pursuer; the tribes, the covenant and the timed building of the City of David are sequenced here.
// There is no attack anywhere: 5:6–8 (the Jebusites) is named on the ending card, not played.
import * as G from './adullam-logic.js';

export const ACT4_KEY = 'david-hebron-v1';
export const DEFAULT_CARRIED = 470;
export const TRIBES = ['르우벤', '시므온', '잇사갈', '스불론', '베냐민', '단', '납달리', '갓', '아셀', '에브라임', '므낫세']; // with 유다 already in Hebron (2:4), the twelve
export const SEG_WORK = 14;   // crew-seconds per wall segment
export const CEDAR_LOADS = 3; // cedar David carries from Hiram's caravan to the house
export const CARPENTRY = 5;   // seconds of carpentry each load allows
export const MAX_FOLLOW = 3;
export const SERVE_RANGE = 1.9;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const emit = (s, type, data = {}) => s.events.push({ type, ...data });

function moveTo(p, tx, tz, speed, dt, stop = 0.08) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { p.moving = false; return true; }
  const st = Math.min(d - stop * 0.5, speed * dt);
  p.x += (dx / d) * st; p.z += (dz / d) * st; p.moving = st > 0.001; p.dx = dx; p.dz = dz;
  return d - st <= stop;
}

/** carried: how many were with David at Ziklag (Act 3 result). */
export function createHebron(L, seed = 7, carried = DEFAULT_CARRIED) {
  const s = G.createAdullam(L, seed);
  carried = Math.max(60, Math.round(carried) || DEFAULT_CARRIED);
  Object.assign(s, {
    act: 'settle', total: 0, carried, arrivalsLeft: L.arrivals, restaffed: false, teleport: null,
    tribes: [], tribeIn: 0, crews: [], seg: 0, segProg: 0, segments: 0, buildT: 0, hiram: null, cedar: 0, houseProg: 0, house: false,
  });
  const groups = Math.max(5, Math.min(9, Math.round(carried / 55))), r = s.rng;
  let left = carried;
  for (let g = 0; g < groups; g++) {
    const count = g === groups - 1 ? left : Math.round(carried / groups); left -= count;
    s.people.push({
      id: s.nextId++, kind: ['distress', 'debt', 'bitter', 'family'][g % 4], need: null, count, story: '', status: 'following', role: null, slot: null,
      x: L.entry.x + (r() - 0.5) * 2, z: L.entry.z - 1 - g * 0.6, tx: 0, tz: 0, waited: 0, claimedBy: null, followT: ++s.followSeq, rest: null, task: null, carry: null, look: Math.floor(r() * 9), moving: false,
    });
  }
  s.joined = carried; s.groups = groups;
  return s;
}

/** 2:4 card closed: the elders of the other tribes start coming down the north road (5:1). */
export function startTribes(s) {
  if (s.act !== 'judah') return false;
  const L = s.layout;
  s.act = 'tribes'; s.phase = 'tribes'; s.carry = null;
  s.tribes = TRIBES.map((name, k) => ({ id: k, name, x: L.tribeRoad.x, z: L.tribeRoad.z - 2, spot: L.tribeSpots[k], status: 'hidden', count: 0, moving: false, look: (k * 5) % 9 }));
  s.tribeIn = 0.5;
  emit(s, 'tribes');
  return true;
}

/** 5:1–5 card closed: to Jerusalem. Everyone camps below the stronghold's gate. */
export function goToZion(s) {
  if (s.act !== 'covenant') return false;
  const L = s.layout;
  s.act = 'zion'; s.phase = 'zion'; s.carry = null;
  // twelve crews, one for each tribe; Judah's is made of the people from Hebron
  const names = ['유다', ...TRIBES];
  s.crews = names.map((tribe, k) => {
    const c = L.campSlots[k % L.campSlots.length];
    return { id: k, tribe, x: c.x + (s.rng() - 0.5) * 0.6, z: c.z + (s.rng() - 0.5) * 0.4, home: c, status: 'camp', seg: -1, need: null, needIn: 9 + s.rng() * 8, followT: 0, moving: false, look: (k * 5) % 9 };
  });
  s.teleport = { x: L.zionEntry.x, z: L.zionEntry.z };
  emit(s, 'zion');
  return true;
}

/** 5:7, 5:9 card closed: the clock starts. */
export function startBuild(s) {
  if (s.act !== 'zion') return false;
  s.act = 'build'; s.phase = 'build'; s.buildT = 0;
  emit(s, 'build');
  return true;
}

export function finish(s) {
  if (s.act !== 'ending') return;
  s.act = 'done'; s.phase = 'done';
  emit(s, 'act-done');
}

export const crewRate = (s) => (s.hiram && s.hiram.arrived ? 1.5 : 1); // Hiram's masons (5:11)
export const following = (s) => s.crews.filter((c) => c.status === 'following').sort((a, b) => a.followT - b.followT);
export const builders = (s) => s.crews.filter((c) => c.status === 'building');

function follow(p, D, dt, rank, speed = 4.4) {
  const row = Math.floor(rank / 3), col = (rank % 3) - 1;
  moveTo(p, D.x + col * 1.1, D.z + 1.5 + row * 1.0, speed, dt, 0.5);
}

export function step(s, dt, input) {
  if (s.act === 'done' || s.act === 'ending') return '';
  const L = s.layout, D = input.david;
  s.total += dt;

  // ---- Hebron: the Act 1 rules, with no one hunting David ----
  if (s.act === 'settle') {
    if (s.phase === 'play' && s.arrivalsLeft <= 0) s.spawnIn = Math.max(s.spawnIn, 99);
    const before = s.people.length;
    let hint = G.step(s, dt, input);
    if (s.people.length > before) s.arrivalsLeft -= s.people.length - before;
    s.events = s.events.filter((e) => e.type !== 'gad' && e.type !== 'gad-speaks' && e.type !== 'done');
    if (s.phase === 'play') {
      // the bar is the days in Hebron, "일곱해 여섯달" (2:11); there is no pursuer, so watchers only keep the gate
      s.attention = Math.min(99.9, (s.t / L.maxTime) * 100);
      if (!s.restaffed && ['water', 'bread', 'watch'].every((r) => G.workers(s, r).length > 0)) { s.restaffed = true; emit(s, 'restaffed'); }
      if (hint) hint = hint.replace(G.WHERE.water, L.where.water).replace(G.WHERE.bread, L.where.bread);
    }
    if (s.phase === 'gad' || (s.phase === 'play' && s.t >= L.maxTime)) {
      {
        // 2:4 — the men of Judah come and anoint David. Anyone still waiting is welcomed in.
        for (const p of s.people) {
          if (p.status === 'waiting' || p.status === 'arriving') { s.joined += p.count; s.groups++; p.need = null; }
          const k = s.layout.restSlots.length ? (p.id * 7) % s.layout.restSlots.length : 0;
          if (p.status !== 'working') Object.assign(p, { status: 'resting', rest: k, task: null, carry: null, claimedBy: null });
        }
        s.attention = 100; s.carry = null; s.act = 'judah'; s.phase = 'judah'; s.gad = null; hint = '';
        emit(s, 'judah', { joined: s.joined });
      }
    }
    s.hint = hint;
    return hint;
  }
  if (s.act === 'judah' || s.act === 'covenant' || s.act === 'zion') { s.hint = ''; return ''; }

  // ---- the tribes come (5:1) ----
  if (s.act === 'tribes') {
    s.tribeIn -= dt;
    const next = s.tribes.find((t) => t.status === 'hidden');
    if (next && s.tribeIn <= 0) { next.status = 'coming'; s.tribeIn = 2.2; emit(s, 'tribe-coming', { name: next.name }); }
    let gathered = 0;
    for (const t of s.tribes) {
      if (t.status === 'coming' && moveTo(t, t.spot.x, t.spot.z, 3.4, dt, 0.15)) t.status = 'waiting';
      if ((t.status === 'waiting' || t.status === 'coming') && dist(D, t) < SERVE_RANGE) { t.status = 'greeted'; t.slot = L.covenantSlots[t.id % L.covenantSlots.length]; emit(s, 'greeted', { name: t.name, left: s.tribes.filter((q) => q.status !== 'greeted' && q.status !== 'gathered').length }); }
      if (t.status === 'greeted' && moveTo(t, t.slot.x, t.slot.z, 4.2, dt, 0.2)) t.status = 'gathered';
      if (t.status === 'gathered') gathered++;
    }
    const left = s.tribes.filter((t) => t.status === 'hidden' || t.status === 'coming' || t.status === 'waiting').length;
    if (gathered === s.tribes.length) { s.act = 'covenant'; s.phase = 'covenant'; s.hint = ''; emit(s, 'covenant'); return ''; }
    s.hint = left ? `성문 밖에 온 지파의 장로들을 맞으세요 (남은 지파 ${left})` : '장로들이 언약의 돌 곁으로 모입니다';
    return s.hint;
  }

  // ---- building the City of David (5:9–11) ----
  if (s.act === 'build') {
    s.buildT += dt;
    const nSeg = L.segSpots.length;
    // crews in the camp follow David when he comes by
    for (const c of s.crews) if (c.status === 'camp') {
      if (dist(D, c) < SERVE_RANGE && following(s).length < MAX_FOLLOW) { c.status = 'following'; c.followT = ++s.followSeq; emit(s, 'crew-follows', { tribe: c.tribe }); }
      else moveTo(c, c.home.x, c.home.z, 2, dt, 0.2);
    }
    following(s).forEach((c, k) => follow(c, D, dt, k));
    // walking into the current segment's ring sets the followers to work there
    if (s.seg < nSeg && dist(D, L.segSpots[s.seg]) < 2.4) for (const c of following(s)) { c.status = 'building'; c.seg = s.seg; c.needIn = Math.max(c.needIn, 8); emit(s, 'crew-builds', { tribe: c.tribe, seg: s.seg }); }
    // David's hands: water from the spring, bread from the storehouse, cedar from Hiram's caravan
    // one thing at a time; coming to a different source swaps what David holds, so he can never get stuck with it
    const take = (item) => { if (s.carry !== item) { s.carry = item; emit(s, 'pickup', { item }); } };
    if (dist(D, L.zionSpring) < 2.4) take('water');
    else if (dist(D, L.zionBasket) < 2.4) take('bread');
    else if (s.hiram && s.hiram.arrived && s.cedar < CEDAR_LOADS && dist(D, L.caravan) < 2.6) take('cedar');
    if (s.carry === 'cedar' && dist(D, L.houseDrop) < 2.2) { s.cedar++; s.carry = null; emit(s, 'cedar', { loads: s.cedar }); }
    if (s.carry === 'water' || s.carry === 'bread') {
      const c = s.crews.find((q) => q.status === 'building' && q.need === s.carry && dist(D, q) < SERVE_RANGE);
      if (c) { c.need = null; c.needIn = 14 + s.rng() * 8; emit(s, 'crew-served', { tribe: c.tribe, item: s.carry }); s.carry = null; }
    }
    // builders work at the current segment; when it is done they move on to the next, from Millo around (대상 11:8)
    let working = 0;
    for (const c of builders(s)) {
      if (s.seg >= nSeg) { const h = L.zionRest[c.id % L.zionRest.length]; moveTo(c, h.x, h.z, 2.6, dt, 0.2); continue; }
      c.seg = s.seg;
      if (c.need) { c.moving = false; continue; }
      const spot = L.segSpots[s.seg], ox = ((c.id % 4) - 1.5) * 0.7, oz = (Math.floor(c.id / 4) % 3 - 1) * 0.6;
      if (moveTo(c, spot.x + ox, spot.z + oz, 3.4, dt, 0.25)) {
        working++;
        c.needIn -= dt;
        if (c.needIn <= 0) { c.need = s.rng() < 0.5 ? 'water' : 'bread'; emit(s, 'crew-need', { tribe: c.tribe, need: c.need }); }
      }
    }
    if (s.seg < nSeg) {
      s.segProg += working * crewRate(s) * dt;
      if (s.segProg >= SEG_WORK) {
        s.segProg = 0; emit(s, 'segment', { order: s.seg, millo: s.seg === 0 }); s.seg++; s.segments = s.seg;
        if (s.seg >= nSeg) { for (const c of s.crews) { c.need = null; if (c.status === 'following') c.status = 'building'; } emit(s, 'walls-done'); }
      }
    }
    // Hiram's messengers with cedar, carpenters and masons (5:11), once the wall is well begun
    if (!s.hiram && s.seg >= 5) { s.hiram = { x: L.caravanFrom.x, z: L.caravanFrom.z, wp: 0, arrived: false, moving: true }; emit(s, 'hiram-coming'); }
    if (s.hiram && !s.hiram.arrived) {
      const road = L.caravanRoad, t = s.hiram.wp < road.length ? road[s.hiram.wp] : L.caravan;
      if (moveTo(s.hiram, t.x, t.z, 5.5, dt, 0.3)) { if (s.hiram.wp < road.length) s.hiram.wp++; else { s.hiram.arrived = true; s.hiram.moving = false; emit(s, 'hiram'); } }
    }
    // carpenters build the house as cedar arrives
    if (s.cedar > 0 && !s.house) {
      s.houseProg = Math.min(s.cedar * CARPENTRY, s.houseProg + dt);
      if (s.cedar >= CEDAR_LOADS && s.houseProg >= CEDAR_LOADS * CARPENTRY) { s.house = true; emit(s, 'house'); }
    }
    if (s.seg >= nSeg && s.house) { s.act = 'ending'; s.phase = 'ending'; s.carry = null; s.hint = ''; emit(s, 'built', { seconds: s.buildT }); return ''; }
    s.hint = buildHint(s, D);
    return s.hint;
  }
  return '';
}

function buildHint(s, D) {
  const L = s.layout, nSeg = L.segSpots.length;
  const needy = s.crews.filter((c) => c.status === 'building' && c.need);
  if (s.carry === 'cedar') return '백향목을 산성 한가운데 왕의 집 터로 가져가세요';
  if (s.carry) { const n = needy.filter((c) => c.need === s.carry).length; return n ? `${s.carry === 'water' ? '물' : '떡'}이 필요한 일꾼에게 가져다주세요` : '이 짐이 필요한 일꾼이 아직 없습니다'; }
  if (needy.length) { const w = needy.find((c) => c.need === 'water'); return w ? '일꾼이 목말라 쉬고 있습니다. 성문 밖 남동쪽 샘에서 물을' : '일꾼이 배고파 쉬고 있습니다. 산성 서쪽 곳간에서 떡을'; }
  if (following(s).length && s.seg < nSeg) return s.seg === 0 ? '따라오는 지파를 북동쪽 밀로로 데려가세요' : '따라오는 지파를 빛나는 성벽 자리로 데려가세요';
  if (s.hiram && s.hiram.arrived && s.cedar < CEDAR_LOADS && (s.seg >= nSeg || builders(s).length >= 4)) return `성문 밖 서쪽, 히람의 사자들에게서 백향목을 (${s.cedar}/${CEDAR_LOADS})`;
  if (s.crews.some((c) => c.status === 'camp') && s.seg < nSeg) return '성문 아래 진영에서 지파들을 데려오세요 (한 번에 셋)';
  if (s.seg >= nSeg && !s.house) return s.cedar >= CEDAR_LOADS ? '목수들이 집을 짓고 있습니다' : `히람의 사자들에게서 백향목을 (${s.cedar}/${CEDAR_LOADS})`;
  return '';
}

/** Personal best: lower is better. Returns the new record object to save. */
export function record(prev, joined, seconds) {
  const best = prev && Number.isFinite(prev.best) && prev.best > 0 ? Math.min(prev.best, seconds) : seconds;
  return { joined: Math.max(joined, (prev && prev.joined) || 0), best: Math.round(best * 10) / 10, last: Math.round(seconds * 10) / 10 };
}
export function parseRecord(raw) {
  try { const v = JSON.parse(raw); if (v && typeof v === 'object' && Number.isFinite(v.best) && v.best > 0) return { joined: Math.max(0, Math.round(v.joined) || 0), best: v.best, last: Number.isFinite(v.last) ? v.last : v.best }; } catch { /* ignore */ }
  return null;
}

export function summary(s) {
  return { joined: s.joined, carried: s.carried, tribes: s.tribes.length + 1, segments: s.segments, cedar: s.cedar, house: s.house, buildSeconds: Math.round(s.buildT * 10) / 10, seconds: Math.round(s.total) };
}
