// Act 1 · 아둘람 — pure, deterministic game state. No DOM, no three.js, so it can be simulated in node.
// Scripture anchor: 삼상 21:1–3, 22:1–2, 22:5–6, 시 142. Individual stories below are imagined (labelled in the UI).
import { rand } from './world.js';

export const ROLE_CAP = { water: 3, bread: 3, watch: 4 };
export const ROLE_NAME = { water: '물 긷는 자', bread: '떡 굽는 자', watch: '파수꾼' };
export const NEED_NAME = { water: '물', bread: '떡', fire: '불 곁 자리' };
export const KIND_NAME = { family: '이새의 집', distress: '환난 당한 자', debt: '빚진 자', bitter: '마음이 원통한 자' };
export const END_TIME = 200; // 갓 comes at the latest by this time (seconds of play)
export const TARGET = 400; // 삼상 22:2 "사백명 가량"
export const START_BREAD = 5; // 삼상 21:3 "떡 다섯 덩이"
const BREAD_MAX = 12;

const STORIES = {
  family: ['다윗아, 네 형제들과 아버지의 온 집이 왔다.'],
  distress: ['집을 잃었습니다. 갈 곳이 없어요.', '아이를 업고 사흘을 걸었습니다.', '병든 어머니를 모시고 왔습니다.', '숨을 곳이 필요합니다.'],
  debt: ['빚 때문에 밭을 빼앗겼습니다.', '빚쟁이가 아들을 데려가려 합니다.', '갚을 길이 없어 떠나왔습니다.', '품삯을 한 번도 받지 못했습니다.'],
  bitter: ['억울한 일을 당했는데 아무도 들어 주지 않았습니다.', '마음이 원통해서 잠을 못 잡니다.', '재판에서 졌습니다. 뇌물 때문이었어요.', '믿던 사람에게 배신당했습니다.'],
};
const SCRIPTED = [
  { kind: 'family', need: 'water', count: 12 },
  { kind: 'distress', need: 'bread' },
  { kind: 'bitter', need: 'fire' },
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const JOINED = new Set(['following', 'resting', 'working']);

export function createAdullam(layout, seed = 7) {
  return {
    t: 0, phase: 'play', layout, rng: rand(seed), people: [], nextId: 1, spawnIn: 2.5, scripted: 0,
    carry: null, bread: START_BREAD, bakeT: 0, davidBake: 0, attention: 0,
    joined: 0, groups: 0, servedByDavid: 0, servedByPeople: 0, waitingLeft: 0,
    gad: null, events: [], followSeq: 0, hint: '',
  };
}

const emit = (s, type, data = {}) => s.events.push({ type, ...data });
export const drainEvents = (s) => s.events.splice(0, s.events.length);
export const waitingPeople = (s) => s.people.filter((p) => p.status === 'waiting' || p.status === 'arriving');
export const workers = (s, role) => s.people.filter((p) => p.status === 'working' && (!role || p.role === role));
export const followers = (s) => s.people.filter((p) => p.status === 'following' || p.status === 'escort' || p.status === 'exodus').sort((a, b) => a.followT - b.followT);

function freeSlot(slots, people, key) {
  const used = new Set(people.map((p) => p[key]).filter((v) => v !== null && v !== undefined));
  for (let k = 0; k < slots.length; k++) if (!used.has(k)) return k;
  return -1;
}

function spawn(s) {
  const L = s.layout;
  const slot = freeSlot(L.waitSlots, s.people.filter((p) => p.status === 'waiting' || p.status === 'arriving'), 'slot');
  if (slot < 0) return false;
  const r = s.rng;
  let spec = SCRIPTED[s.scripted];
  if (spec) s.scripted++;
  else {
    const roll = r();
    const need = roll < 0.38 ? 'water' : roll < 0.76 ? 'bread' : 'fire';
    spec = { kind: ['distress', 'debt', 'bitter'][Math.floor(r() * 3)], need };
  }
  const stories = STORIES[spec.kind];
  const p = {
    id: s.nextId++, kind: spec.kind, need: spec.need, count: spec.count ?? 7 + Math.floor(r() * 11),
    story: stories[Math.floor(r() * stories.length)], status: 'arriving', role: null, slot,
    x: L.roadStart.x + (r() - 0.5), z: L.roadStart.z + (r() - 0.5), tx: L.waitSlots[slot].x, tz: L.waitSlots[slot].z,
    waited: 0, claimedBy: null, followT: 0, rest: null, task: null, carry: null, look: Math.floor(r() * 9), moving: false,
  };
  s.people.push(p);
  emit(s, 'arrive', { id: p.id });
  return true;
}

function moveTo(p, tx, tz, speed, dt, stop = 0.08) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { p.moving = false; return true; }
  const st = Math.min(d - stop * 0.5, speed * dt);
  p.x += (dx / d) * st; p.z += (dz / d) * st; p.moving = st > 0.001;
  p.dx = dx; p.dz = dz;
  return d - st <= stop;
}

function join(s, p, by) {
  p.claimedBy = null; p.slot = null; p.need = null;
  s.joined += p.count; s.groups++;
  if (by === 'david') { s.servedByDavid++; p.status = 'following'; p.followT = ++s.followSeq; }
  else { s.servedByPeople++; toRest(s, p); }
  emit(s, 'join', { id: p.id, by, count: p.count, kind: p.kind });
}

function toRest(s, p) {
  const k = freeSlot(s.layout.restSlots, s.people, 'rest');
  p.status = 'resting'; p.rest = k < 0 ? Math.floor(s.rng() * s.layout.restSlots.length) : k;
}

function assign(s, p, role) {
  p.status = 'working'; p.role = role; p.task = null;
  const n = workers(s, role).length - 1;
  const base = role === 'water' ? s.layout.spring : role === 'bread' ? s.layout.basket : s.layout.lookout;
  const off = s.layout.workOffsets[role][n % s.layout.workOffsets[role].length];
  p.home = { x: base.x + off[0], z: base.z + off[1] };
  emit(s, 'assign', { id: p.id, role });
}

export function startLeaving(s) {
  if (s.phase !== 'gad') return;
  s.phase = 'leaving';
  s.waitingLeft = 0;
  for (const p of s.people) {
    if (p.status === 'waiting' || p.status === 'arriving') s.waitingLeft += p.count;
    p.status = 'exodus'; p.followT = ++s.followSeq; p.task = null; p.carry = null; p.claimedBy = null;
  }
  emit(s, 'leaving');
}

/** Advance the simulation. input = { david: {x, z} }. Returns the current hint for the prompt line. */
export function step(s, dt, input) {
  const L = s.layout, D = input.david, r = s.rng;
  if (s.phase === 'done') return '';
  s.t += dt;

  // ---- arrivals ----
  if (s.phase === 'play') {
    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      if (spawn(s)) s.spawnIn = s.scripted < SCRIPTED.length ? 4.5 : Math.max(3.2, 8.5 - s.groups * 0.3) * (0.8 + r() * 0.4);
      else s.spawnIn = 1;
    }
  }

  // ---- David: sources (automatic on proximity) ----
  let hint = '';
  if (s.phase === 'play') {
    const atSpring = dist(D, L.spring) < 2.4, atBasket = dist(D, L.basket) < 2.2;
    if (atSpring && s.carry !== 'water') {
      if (s.carry === 'bread') s.bread = Math.min(BREAD_MAX, s.bread + 1);
      s.carry = 'water'; emit(s, 'pickup', { item: 'water' });
    }
    if (atBasket && s.carry !== 'bread') {
      if (s.bread > 0) { s.bread--; s.carry = 'bread'; s.davidBake = 0; emit(s, 'pickup', { item: 'bread' }); }
      else if (!s.carry) { s.davidBake += dt; hint = `떡을 굽는 중… ${Math.min(100, Math.round((s.davidBake / 2.5) * 100))}%`; if (s.davidBake >= 2.5) { s.davidBake = 0; s.carry = 'bread'; emit(s, 'pickup', { item: 'bread', baked: true }); } }
      else hint = '떡이 다 떨어졌습니다. 빈손으로 오면 직접 구울 수 있어요.';
    } else if (!atBasket) s.davidBake = 0;

    // ---- David: serve people in reach ----
    for (const p of s.people) {
      if (p.status !== 'waiting' || dist(D, p) > 1.7) continue;
      if (p.need === 'fire') { p.status = 'escort'; p.followT = ++s.followSeq; p.claimedBy = 'david'; emit(s, 'escort', { id: p.id }); continue; }
      if (p.need === s.carry) { s.carry = null; join(s, p, 'david'); }
      else if (!hint) hint = `${KIND_NAME[p.kind]} · "${p.story}" — ${NEED_NAME[p.need]}이(가) 필요합니다`;
    }
    // escorts reach the fire
    for (const p of s.people) if (p.status === 'escort' && dist(p, L.fire) < 2.6) join(s, p, 'david');

    // ---- followers -> stations ----
    for (const role of ['water', 'bread', 'watch']) {
      const st = role === 'water' ? L.spring : role === 'bread' ? L.basket : L.lookout;
      if (dist(D, st) > 2.6) continue;
      for (const p of followers(s)) {
        if (p.status !== 'following' || workers(s, role).length >= ROLE_CAP[role]) continue;
        assign(s, p, role);
      }
    }
  }

  // ---- followers move in a chain behind David ----
  let lead = D, k = 0;
  for (const p of followers(s)) {
    const gap = p.status === 'exodus' ? 0.8 : 1.0;
    const d = dist(p, lead);
    if (d > gap) moveTo(p, lead.x, lead.z, Math.min(7, 3 + d * 1.2), dt, gap); else p.moving = false;
    if (p.status === 'following' && s.phase === 'play') { p.followAge = (p.followAge || 0) + dt; if (p.followAge > 30) { toRest(s, p); emit(s, 'rest', { id: p.id }); } }
    lead = p; k++;
  }

  // ---- everyone else ----
  for (const p of s.people) {
    if (p.status === 'arriving') { if (moveTo(p, p.tx, p.tz, 2.6, dt)) { p.status = 'waiting'; emit(s, 'waiting', { id: p.id }); } }
    else if (p.status === 'waiting') { p.waited += dt; p.moving = false; }
    else if (p.status === 'resting') { const rs = L.restSlots[p.rest]; moveTo(p, rs.x, rs.z, 2.4, dt); }
    else if (p.status === 'working') work(s, p, dt);
  }

  // ---- bakers fill the basket when idle ----
  const idleBakers = workers(s, 'bread').filter((w) => !w.task && dist(w, w.home) < 0.5).length;
  if (idleBakers) { s.bakeT += dt * idleBakers; if (s.bakeT >= 6) { s.bakeT -= 6; if (s.bread < BREAD_MAX) { s.bread++; emit(s, 'baked'); } } }

  // ---- Saul hears (삼상 22:6) ----
  if (s.phase === 'play') {
    const waitingN = s.people.filter((p) => p.status === 'waiting').length;
    const shield = 1 - Math.min(0.6, workers(s, 'watch').length * 0.15);
    s.attention = Math.min(100, s.attention + (0.22 + s.joined * 0.0017 + waitingN * 0.09) * shield * dt);
    if (s.attention >= 100 || s.t >= END_TIME) {
      s.phase = 'gad';
      s.gad = { x: L.roadStart.x, z: L.roadStart.z, arrived: false, moving: true };
      emit(s, 'gad');
    }
  }
  if (s.phase === 'gad' && s.gad && !s.gad.arrived) {
    if (moveTo(s.gad, D.x, D.z, 4.2, dt, 1.6)) { s.gad.arrived = true; s.gad.moving = false; emit(s, 'gad-speaks'); }
  }
  if (s.phase === 'leaving') {
    if (s.gad) { const d = dist(s.gad, D); if (d > 1.4) moveTo(s.gad, D.x + 0.8, D.z - 0.6, 5, dt, 0.4); else s.gad.moving = false; }
    hint = '모두를 이끌고 남쪽 길로 떠나세요 (헤렛 수풀)';
    if (dist(D, L.exit) < 3) { s.phase = 'done'; emit(s, 'done'); }
  }
  s.hint = hint;
  return hint;
}

function work(s, w, dt) {
  const L = s.layout;
  if (s.phase !== 'play') { moveTo(w, w.home.x, w.home.z, 2.6, dt); return; }
  if (w.role === 'watch') { if (!w.upRamp) { if (moveTo(w, L.rampBase.x, L.rampBase.z, 3, dt, 0.4)) w.upRamp = true; } else moveTo(w, w.home.x, w.home.z, 3, dt); return; }
  const src = w.role === 'water' ? L.spring : L.basket;
  if (!w.task) {
    const target = s.people.find((p) => p.status === 'waiting' && p.need === w.role && !p.claimedBy);
    if (target && (w.role === 'water' || s.bread > 0 || w.carry)) { target.claimedBy = w.id; w.task = { id: target.id }; }
    else { moveTo(w, w.home.x, w.home.z, 2.6, dt); return; }
  }
  const target = s.people.find((p) => p.id === w.task.id);
  if (!target || target.status !== 'waiting') { if (target && target.claimedBy === w.id) target.claimedBy = null; w.task = null; return; }
  if (!w.carry) {
    if (moveTo(w, src.x, src.z, 3.2, dt, 0.9)) {
      if (w.role === 'water') w.carry = 'water';
      else if (s.bread > 0) { s.bread--; w.carry = 'bread'; }
    }
    return;
  }
  if (moveTo(w, target.x, target.z, 3.2, dt, 0.9)) { w.carry = null; w.task = null; join(s, target, 'people'); emit(s, 'served-by-people', { by: w.id, id: target.id, role: w.role }); }
}

export function summary(s) {
  return { joined: s.joined, groups: s.groups, servedByDavid: s.servedByDavid, servedByPeople: s.servedByPeople, waitingLeft: s.waitingLeft, seconds: Math.round(s.t) };
}
