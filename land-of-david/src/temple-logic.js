// Act 5 · 성전 준비 — the house you want to build and are told you will not (삼하 7, 대상 22, 28, 29).
// Pure state, no DOM or three.js, so it runs in node. There is no enemy and no failure: the pressure is David's days
// (대상 29:15 "세상에 있는 날이 그림자 같아서"), and the tension is the refusal (대상 22:7–10). You prepare; Solomon builds.
export const ACT5_KEY = 'david-temple-v1';
export const NEED = { cedar: 8, stone: 11, gold: 4, silver: 4, iron: 5, bronze: 5 }; // what counts as "많이 준비하였더라" (22:5); the amounts are imagined
export const TOTAL = Object.values(NEED).reduce((a, b) => a + b, 0);
export const ITEM_NAME = { cedar: '백향목', stone: '다듬은 돌', gold: '금', silver: '은', iron: '철', bronze: '놋', treasure: '왕의 금과 은' };
export const SOURCE_NAME = { quarry: '서쪽 채석장', cedar: '북서쪽 백향목 길', forge: '동쪽 대장간' };
export const CREW_NAME = { quarry: '이방 석수', cedar: '시돈·두로 사람', forge: '대장장이' }; // 22:2, 22:4; who worked the iron and bronze is not recorded
export const LIFE = 135;        // seconds of preparing before David's days run out
export const CREW_MAX = 4;      // carriers per work place
export const CARRY_SPEED = 2.0;
export const SIT_TIME = 3;      // 7:18 "여호와 앞에 들어가 앉아서"
export const GIVERS = [         // 29:6 "모든 족장과 이스라엘 모든 지파 어른과 천부장과 백부장과 왕의 사무감독이 다 즐거이 드리되"
  { who: '족장들', gift: 'gold' }, { who: '지파 어른들', gift: 'silver' }, { who: '천부장들', gift: 'bronze' }, { who: '백부장들', gift: 'gold', gems: true },
  { who: '왕의 사무감독들', gift: 'iron' }, { who: '족장들', gift: 'silver' }, { who: '지파 어른들', gift: 'gold' }, { who: '천부장들', gift: 'silver', gems: true },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const emit = (s, type, data = {}) => s.events.push({ type, ...data });

function moveTo(p, tx, tz, speed, dt, stop = 0.1) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { p.moving = false; return true; }
  const st = Math.min(d - stop * 0.5, speed * dt);
  p.x += (dx / d) * st; p.z += (dz / d) * st; p.moving = st > 0.001; p.dx = dx; p.dz = dz;
  return d - st <= stop;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createTemple(L, seed = 7) {
  const crews = Object.entries(L.sources).map(([key, src], n) => ({ id: n, key, item: src.item, spot: src.spot, route: src.route, status: 'idle', carriers: [] }));
  return {
    layout: L, rng: rng(seed), events: [], hint: '', act: 'palace', t: 0, prepT: 0, nightT: 0, sitT: 0,
    carry: null, carryFrom: null, piles: Object.fromEntries(Object.keys(NEED).map((k) => [k, 0])), crews, byDavid: 0, byCrews: 0,
    treasureGiven: false, givers: [], giverIn: 0, gifts: 0, lateEnd: false, solomon: null, nextId: 1,
  };
}

export const prepared = (s) => Object.entries(NEED).reduce((a, [k, n]) => a + Math.min(n, s.piles[k]), 0);
export const percent = (s) => Math.round((prepared(s) / TOTAL) * 100);
export const daysLeft = (s) => Math.max(0, 1 - s.prepT / LIFE);
/** David slows as he grows old (대상 23:1 "다윗이 나이 많아 늙으매"); the renderer and the test bot both use this. */
export const davidSpeed = (s) => (s.act === 'prepare' ? 1 - 0.3 * Math.min(1, s.prepT / LIFE) : s.act === 'ready' || s.act === 'solomon' ? 0.7 : 1);
const forgeItem = (s) => (s.piles.iron / NEED.iron <= s.piles.bronze / NEED.bronze ? 'iron' : 'bronze');
const itemFor = (s, crew) => (crew.item === 'metal' ? forgeItem(s) : crew.item);
const inYard = (s, p) => dist(p, s.layout.yard) < s.layout.yardR;

// ---- card transitions (the renderer calls these when a card closes) ----
export function night(s) { if (s.act !== 'nathan') return false; s.act = 'night'; s.nightT = 0; emit(s, 'night'); return true; }
export function toSit(s) { if (s.act !== 'word') return false; s.act = 'sit'; s.sitT = 0; return true; }
export function startPrepare(s) { if (s.act !== 'sat') return false; s.act = 'prepare'; emit(s, 'prepare'); return true; }
/** 29:5 card closed: the leaders start bringing their gifts (29:6–8). */
export function callGivers(s) {
  if (s.act !== 'prepare' || s.givers.length) return false;
  const R = s.layout.giverRoute;
  s.givers = GIVERS.map((g, k) => ({ id: k, ...g, x: R[0].x, z: R[0].z, wp: 0, status: 'hidden', moving: false, look: (k * 5 + 2) % 9 }));
  s.giverIn = 0.5;
  emit(s, 'givers');
  return true;
}
export function callSolomon(s) {
  if (s.act !== 'refused') return false;
  const L = s.layout;
  s.act = 'solomon'; s.solomon = { x: L.solomonFrom.x, z: L.solomonFrom.z, arrived: false, moving: true };
  emit(s, 'solomon-coming');
  return true;
}
export function finish(s) { if (s.act !== 'handed') return; s.act = 'done'; emit(s, 'act-done'); }

function endPreparing(s, late) {
  s.act = 'ready'; s.lateEnd = late; s.carry = null; s.carryFrom = null;
  for (const c of s.crews) { c.status = c.status === 'idle' ? 'idle' : 'rest'; c.carriers.forEach((q, n) => { q.rest = s.layout.restSpots[(c.id * 4 + n) % s.layout.restSpots.length]; }); }
  emit(s, late ? 'evening' : 'ready', { percent: percent(s) });
}

export function step(s, dt, input) {
  if (s.act === 'done') return '';
  const L = s.layout, D = input.david;
  s.t += dt;
  let hint = '';
  switch (s.act) {
    case 'palace':
      if (dist(D, L.nathan) < 1.9) { s.act = 'nathan'; emit(s, 'nathan'); break; }
      hint = '휘장 친 궤 곁에 선 선지자 나단에게 가세요';
      break;
    case 'night':
      s.nightT += dt;
      if (s.nightT >= 2.4) { s.act = 'word'; emit(s, 'word'); }
      break;
    case 'sit': {
      const here = dist(D, L.tentSpot) < 1.4;
      if (here && !D.moving) s.sitT += dt; else s.sitT = Math.max(0, s.sitT - dt * 2);
      if (s.sitT >= SIT_TIME) { s.act = 'sat'; emit(s, 'sat'); break; }
      hint = here ? (D.moving ? '멈추고 가만히 앉아 있으세요' : `여호와 앞에 앉아 있습니다 ${Math.min(100, Math.round((s.sitT / SIT_TIME) * 100))}%`) : '궤가 있는 휘장 앞으로 들어가 가만히 앉으세요';
      break;
    }
    case 'prepare': hint = prepare(s, dt, D); break;
    case 'ready':
      for (const c of s.crews) for (const q of c.carriers) if (q.rest) moveTo(q, q.rest.x, q.rest.z, CARRY_SPEED, dt, 0.15);
      stepGivers(s, dt);
      if (dist(D, L.buildRing) < 1.8) { s.act = 'refused'; emit(s, 'refused'); break; }
      hint = '준비한 것이 쌓였습니다. 성전 터 한가운데로 들어가 보세요';
      break;
    case 'solomon': {
      const so = s.solomon;
      if (!so.arrived && moveTo(so, L.solomonSpot.x, L.solomonSpot.z, 3.2, dt, 0.1)) { so.arrived = true; so.moving = false; emit(s, 'solomon'); }
      if (dist(D, so) < 1.9) { s.act = 'handed'; so.moving = false; emit(s, 'handed'); break; }
      hint = '솔로몬에게 가서 성전의 식양을 건네주세요';
      break;
    }
    default: break;
  }
  s.hint = hint;
  return hint;
}

function prepare(s, dt, D) {
  const L = s.layout;
  s.prepT += dt;
  // ---- David at a work place: the first visit gives the command (22:2 "다윗이 명하여"); empty hands take a load ----
  for (const c of s.crews) {
    if (dist(D, c.spot) > 2.4) continue;
    if (c.status === 'idle') { c.status = 'working'; addCarrier(s, c); emit(s, 'commanded', { key: c.key }); }
    if (!s.carry) { s.carry = itemFor(s, c); s.carryFrom = c.key; emit(s, 'pickup', { item: s.carry }); }
  }
  // ---- David's own gold and silver from the palace (29:3), once ----
  if (!s.treasureGiven && !s.carry && dist(D, L.treasury) < 2.2) { s.carry = 'treasure'; s.carryFrom = null; emit(s, 'pickup', { item: 'treasure' }); }
  // ---- delivering on Moriah ----
  if (s.carry && inYard(s, D)) {
    if (s.carry === 'treasure') { s.piles.gold++; s.piles.silver++; s.treasureGiven = true; emit(s, 'treasure'); }
    else {
      s.piles[s.carry]++; s.byDavid++;
      const c = s.crews.find((q) => q.key === s.carryFrom);
      // the king carries too, and more hands join that work (the example is imagined; 22:2 says only that he commanded)
      if (c && c.carriers.length < CREW_MAX) { addCarrier(s, c); emit(s, 'example', { key: c.key, n: c.carriers.length }); }
      emit(s, 'delivered', { item: s.carry, by: 'david' });
    }
    s.carry = null; s.carryFrom = null;
  }
  // ---- carriers walk their route, load, unload ----
  for (const c of s.crews) for (const q of c.carriers) stepCarrier(s, c, q, dt);
  stepGivers(s, dt);
  // ---- the end of preparing ----
  if (Object.entries(NEED).every(([k, n]) => s.piles[k] >= n)) { endPreparing(s, false); return ''; }
  if (s.prepT >= LIFE) { endPreparing(s, true); return ''; }
  return prepareHint(s, D);
}

function addCarrier(s, c) { c.carriers.push({ id: s.nextId++, x: c.spot.x + (s.rng() - 0.5) * 0.8, z: c.spot.z + (s.rng() - 0.5) * 0.6, leg: 'load', wp: 0, wait: 0.6 + c.carriers.length * 0.9, load: null, moving: false, rest: null }); }

function stepCarrier(s, c, q, dt) {
  const L = s.layout, R = c.route, pile = () => L.piles[q.load];
  if (q.leg === 'load') { q.moving = false; q.wait -= dt; if (q.wait <= 0) { q.load = itemFor(s, c); q.leg = 'out'; q.wp = 0; } return; }
  if (q.leg === 'out') {
    const t = q.wp < R.length ? R[q.wp] : pile();
    if (moveTo(q, t.x, t.z, CARRY_SPEED, dt, q.wp < R.length ? 0.5 : 0.25)) { if (q.wp < R.length) q.wp++; else { s.piles[q.load]++; s.byCrews++; emit(s, 'delivered', { item: q.load, by: 'crew', key: c.key }); q.load = null; q.leg = 'back'; q.wp = R.length - 1; } }
    return;
  }
  if (q.leg === 'back') {
    const t = q.wp >= 0 ? R[q.wp] : c.spot;
    if (moveTo(q, t.x, t.z, CARRY_SPEED, dt, q.wp >= 0 ? 0.5 : 0.3)) { if (q.wp >= 0) q.wp--; else { q.leg = 'load'; q.wait = 0.8; } }
  }
}

function stepGivers(s, dt) {
  if (!s.givers.length) return;
  const L = s.layout, R = L.giverRoute;
  s.giverIn -= dt;
  const next = s.givers.find((g) => g.status === 'hidden');
  if (next && s.giverIn <= 0) { next.status = 'coming'; s.giverIn = 3.2; emit(s, 'giver-coming', { who: next.who }); }
  for (const g of s.givers) {
    if (g.status === 'coming') {
      const t = g.wp < R.length ? R[g.wp] : L.piles[g.gift];
      if (moveTo(g, t.x, t.z, 3.4, dt, g.wp < R.length ? 0.5 : 0.25)) { if (g.wp < R.length) g.wp++; else { g.status = 'given'; s.piles[g.gift]++; s.gifts++; g.rest = L.restSpots[(12 + g.id) % L.restSpots.length]; emit(s, 'gift', { who: g.who, item: g.gift, gems: !!g.gems, n: s.gifts }); } }
    } else if (g.status === 'given') moveTo(g, g.rest.x, g.rest.z, 2.4, dt, 0.15);
  }
}

function prepareHint(s, D) {
  if (s.carry === 'treasure') return '당신의 금과 은을 북쪽 모리아 성전 터로 가져가세요 (대상 29:3)';
  if (s.carry) return `${ITEM_NAME[s.carry]}을 모리아 성전 터로 가져가세요`;
  const idle = s.crews.filter((c) => c.status === 'idle');
  if (idle.length === 3) return '세 일터에 가서 명하세요: 서쪽 채석장 · 북서쪽 백향목 길 · 동쪽 대장간';
  if (idle.length) return `아직 명하지 않은 일터: ${idle.map((c) => SOURCE_NAME[c.key]).join(' · ')}`;
  if (!s.treasureGiven) return '왕궁 곳간에서 당신의 금과 은을 가져오세요 (대상 29:3)';
  const short = lowest(s);
  if (short && short.src) return `가장 모자란 것: ${ITEM_NAME[short.key]} → ${SOURCE_NAME[short.src]}. 직접 나르면 그 일터에 일꾼이 늘어납니다`;
  if (short) return `${ITEM_NAME[short.key]}은 백성이 즐거이 드리는 예물로 찹니다`;
  return '';
}
const SRC_OF = { stone: 'quarry', cedar: 'cedar', iron: 'forge', bronze: 'forge', gold: null, silver: null };
/** The pile furthest from its need, and where it comes from (null source: only gifts fill it). */
export function lowest(s) {
  let best = null;
  for (const [k, n] of Object.entries(NEED)) { const f = s.piles[k] / n; if (f < 1 && (!best || f < best.f)) best = { key: k, f, src: SRC_OF[k] }; }
  if (best && !best.src) { const alt = Object.entries(NEED).filter(([k, n]) => SRC_OF[k] && s.piles[k] < n).sort((a, b) => s.piles[a[0]] / a[1] - s.piles[b[0]] / b[1])[0]; if (alt) return { key: alt[0], f: s.piles[alt[0]] / alt[1], src: SRC_OF[alt[0]] }; }
  return best;
}

export function drainEvents(s) { const e = s.events; s.events = []; return e; }

export function summary(s) {
  return { percent: percent(s), prepared: prepared(s), total: TOTAL, piles: { ...s.piles }, byDavid: s.byDavid, byCrews: s.byCrews, gifts: s.gifts, givers: GIVERS.length, crews: s.crews.map((c) => c.carriers.length), days: Math.round(s.prepT), lateEnd: s.lateEnd, seconds: Math.round(s.t) };
}
/** Best preparation, higher is better. */
export function record(prev, sum) {
  const best = Math.max(sum.percent, prev && Number.isFinite(prev.best) ? prev.best : 0);
  return { best, last: sum.percent, gifts: sum.gifts };
}
export function parseRecord(raw) {
  try { const v = JSON.parse(raw); if (v && typeof v === 'object' && Number.isFinite(v.best) && v.best >= 0) return { best: Math.min(100, Math.round(v.best)), last: Number.isFinite(v.last) ? v.last : v.best, gifts: Math.max(0, Math.round(v.gifts) || 0) }; } catch { /* ignore */ }
  return null;
}
