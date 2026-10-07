// Deterministic, vendor-free stealth core for "베들레헴의 물" (2 Samuel 23:13-17).
// Gameplay geometry and stealth systems are fictional adaptations, not historical claims.
// No RNG, clock, DOM, network, or combat. Functions mutate only the supplied state.

export const CONFIG = Object.freeze({
  walkSpeed: 4.2,
  crouchSpeed: 2.25,
  sprintSpeed: 6.4,
  carrySpeedMultiplier: 0.78,
  collideRadius: 0.4,
  sightRange: 19,
  // Crouching changes silhouette, not eyesight: open ground remains dangerous.
  crouchSightMultiplier: 0.92,
  // Only real shelter records get this strong distance reduction.
  foliageCrouchRangeMultiplier: 0.28,
  foliageStandRangeMultiplier: 0.35,
  foliagePointBlankRange: 1.55,
  fovHalf: Math.PI / 3,
  fillRadius: 2.5,
  fillDuration: 2.5,
  returnRadius: 3.5,
  endingDuration: 7,
  gracePeriod: 2.2,
  captureRange: 1.2,
  distractionRange: 6,
  distractionNoiseRadius: 8.5,
  distractionCooldown: 4,
  stones: 3,
  patrolPause: 0.55,
  searchDuration: 6,
  investigateDuration: 5,
  navCell: 1,
  noise: Object.freeze({ crouch: 1.15, walk: 3.4, sprint: 8.4, carryMultiplier: 1.45 }),
});

const freezePoints = points => Object.freeze(points.map(p => Object.freeze({ ...p })));
const freezeRecords = records => Object.freeze(records.map(r => Object.freeze({ ...r, ...(r.patrol ? { patrol: freezePoints(r.patrol) } : {}) })));

export const LAYOUT = Object.freeze({
  start: Object.freeze({ x: 0, z: 23 }),
  well: Object.freeze({ x: 0, z: -23, radius: 1.7 }),
  // A real safe checkpoint west of the curb, not a progress-line teleport.
  wellApproach: Object.freeze({ x: -2.2, z: -23 }),
  bounds: Object.freeze({ minX: -21, maxX: 21, minZ: -32, maxZ: 27 }),
  // The gate has a broad central breach and a narrow west gap. Low cover is physical
  // for everyone, but only blocks a crouched sight line. The camp screen is a real
  // tall wall: the idle spawn is protected, but leaving through either end exposes
  // the player to the north patrol unless the western cover chain is used.
  obstacles: freezeRecords([
    { id: 'camp-spawn-screen', x: 0, z: 18.6, w: 10, d: 1.2, h: 4.8, kind: 'wall' },
    { id: 'camp-west-breastwork', x: -8, z: 14.8, w: 4, d: 1.1, h: 1.1, kind: 'cover' },
    { id: 'west-shepherd-screen', x: -12, z: 12, w: 1.2, d: 5.6, h: 4.2, kind: 'wall' },
    { id: 'west-road-cover', x: -17, z: -2, w: 1.1, d: 12, h: 1.1, kind: 'cover' },
    { id: 'gate-far-west', x: -19.25, z: -15, w: 3.5, d: 2, h: 5, kind: 'wall' },
    { id: 'gate-mid-west', x: -9, z: -15, w: 11, d: 2, h: 5, kind: 'wall' },
    { id: 'gate-east', x: 12.25, z: -15, w: 17.5, d: 2, h: 5, kind: 'wall' },
    { id: 'house-west', x: -12, z: -24, w: 7, d: 7, h: 5, kind: 'house' },
    { id: 'house-east', x: 12, z: -24, w: 7, d: 7, h: 5, kind: 'house' },
    { id: 'north-broken-wall', x: 1.5, z: 10, w: 5, d: 1.15, h: 1.05, kind: 'cover' },
    { id: 'north-crates', x: -5.5, z: 4, w: 3.4, d: 1.2, h: 1.15, kind: 'cover' },
    { id: 'middle-rubble', x: 4.5, z: -3, w: 4.2, d: 1.1, h: 1, kind: 'cover' },
    { id: 'gate-rubble', x: -0.2, z: -11.3, w: 3.2, d: 1.1, h: 1.1, kind: 'cover' },
    { id: 'west-approach-cover', x: -13.2, z: -7, w: 1.2, d: 4.4, h: 1.05, kind: 'cover' },
    { id: 'village-cart', x: -5.1, z: -19.2, w: 3.1, d: 1.25, h: 1.15, kind: 'cover' },
  ]),
  // Foliage is concealment, not invisibility: it shortens effective visual range but
  // a guard at point blank still sees a crouched player.
  shelters: freezeRecords([
    { id: 'olive-start-west', x: -9.5, z: 16.8, radius: 2.7 },
    { id: 'olive-west-road', x: -15.5, z: 7, radius: 2.8 },
    { id: 'olive-west-middle', x: -15.7, z: -1.5, radius: 2.8 },
    { id: 'olive-side-gap', x: -16, z: -11, radius: 2.7 },
    { id: 'olive-village-west', x: -16, z: -18, radius: 2.5 },
    { id: 'olive-cart-west', x: -8.2, z: -18.2, radius: 2.45 },
    { id: 'olive-center', x: 7, z: 1, radius: 2.6 },
    { id: 'olive-gate', x: -7, z: -8, radius: 2.6 },
    { id: 'olive-well-west', x: -2.5, z: -23, radius: 2.7 },
  ]),
  guards: freezeRecords([
    { id: 'north-watch', z: 11, xMin: -8, xMax: 8, speed: 2.45, patrol: [{ x: -8, z: 11 }, { x: 8, z: 11 }, { x: 8, z: 6.5 }, { x: -8, z: 6.5 }] },
    { id: 'middle-watch', z: -3, xMin: -7, xMax: 9, speed: 2.55, patrol: [{ x: -7, z: -3 }, { x: 9, z: -3 }, { x: 9, z: -8 }, { x: -7, z: -8 }] },
    { id: 'well-watch', z: -18, xMin: 4, xMax: 18, speed: 2.4, patrol: [{ x: 4, z: -18 }, { x: 18, z: -18 }, { x: 18, z: -29 }, { x: 4, z: -29 }] },
    // A visible, stationary western sentry makes blind boundary sprints observable for
    // several seconds. The adjacent real foliage and low wall still provide a fair
    // crouched crossing; this is surveillance, not an invisible punishment volume.
    { id: 'west-overwatch', z: -3, xMin: -19, xMax: -19, speed: 1.8, watchHeading: 0, patrol: [{ x: -19, z: -3 }, { x: -19, z: -3 }] },
    // The well itself is the crouched LOS blocker for this posted objective guard.
    // Standing or sprinting on the west approach is exposed; no invisible safe zone.
    { id: 'well-sentry', z: -23, xMin: 4, xMax: 4, speed: 1.8, watchHeading: -Math.PI / 2, patrol: [{ x: 4, z: -23 }, { x: 4, z: -23 }] },
  ]),
});

const EPS = 1e-6;
const SEARCH_OFFSETS = Object.freeze([
  Object.freeze({ x: 2.2, z: 0 }), Object.freeze({ x: 0, z: 2.2 }),
  Object.freeze({ x: -2.2, z: 0 }), Object.freeze({ x: 0, z: -2.2 }),
  Object.freeze({ x: 1.5, z: 1.5 }), Object.freeze({ x: -1.5, z: -1.5 }),
]);
const COMPANION_OFFSETS = Object.freeze([{ back: 1.6, side: -1.3 }, { back: 1.9, side: 1.3 }]);
const MODE_RANK = Object.freeze({ patrol: 0, suspicious: 1, investigate: 2, search: 3, alert: 4 });

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function normInput(input) {
  let x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  let z = Number.isFinite(input.z) ? clamp(input.z, -1, 1) : 0;
  const n = Math.hypot(x, z);
  if (n > 1) { x /= n; z /= n; }
  return { x, z };
}

function pointInInflatedRect(x, z, o, inflate = CONFIG.collideRadius) {
  return Math.abs(x - o.x) <= o.w / 2 + inflate && Math.abs(z - o.z) <= o.d / 2 + inflate;
}

export function isBlocked(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
  const b = LAYOUT.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  if (LAYOUT.obstacles.some(o => pointInInflatedRect(x, z, o))) return true;
  return dist(x, z, LAYOUT.well.x, LAYOUT.well.z) <= LAYOUT.well.radius + CONFIG.collideRadius;
}

function inFoliage(x, z) {
  return LAYOUT.shelters.some(s => dist(x, z, s.x, s.z) <= s.radius);
}

function segmentRectHitT(ax, az, bx, bz, o, inflate = 0) {
  const dx = bx - ax, dz = bz - az;
  const minX = o.x - o.w / 2 - inflate, maxX = o.x + o.w / 2 + inflate;
  const minZ = o.z - o.d / 2 - inflate, maxZ = o.z + o.d / 2 + inflate;
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(delta) < EPS) {
      if (start < min || start > max) return null;
    } else {
      let a = (min - start) / delta, b = (max - start) / delta;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
      if (lo > hi) return null;
    }
  }
  return hi >= 0 && lo <= 1 ? clamp(lo, 0, 1) : null;
}

function segmentCircleHitT(ax, az, bx, bz, cx, cz, radius) {
  const dx = bx - ax, dz = bz - az, fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < EPS) return null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

function firstVisionBlock(ax, az, bx, bz, crouching) {
  let best = null;
  for (const o of LAYOUT.obstacles) {
    if (o.kind === 'cover' && !crouching) continue;
    const t = segmentRectHitT(ax, az, bx, bz, o, 0);
    if (t !== null && t > EPS && t < 1 - EPS && (!best || t < best.t)) best = { t, kind: o.kind === 'cover' ? 'cover' : 'tall', obstacle: o };
  }
  if (crouching) {
    const t = segmentCircleHitT(ax, az, bx, bz, LAYOUT.well.x, LAYOUT.well.z, LAYOUT.well.radius);
    if (t !== null && t > EPS && t < 1 - EPS && (!best || t < best.t)) best = { t, kind: 'cover', obstacle: LAYOUT.well };
  }
  return best;
}

export function lineBlocked(ax, az, bx, bz, options = {}) {
  const crouching = !!options.crouching;
  if (![ax, az, bx, bz].every(Number.isFinite)) return true;
  return !!firstVisionBlock(ax, az, bx, bz, crouching);
}

function movementLineBlocked(ax, az, bx, bz) {
  for (const o of LAYOUT.obstacles) {
    const t = segmentRectHitT(ax, az, bx, bz, o, CONFIG.collideRadius);
    if (t !== null && t > EPS && t < 1 - EPS) return true;
  }
  const t = segmentCircleHitT(ax, az, bx, bz, LAYOUT.well.x, LAYOUT.well.z, LAYOUT.well.radius + CONFIG.collideRadius);
  return t !== null && t > EPS && t < 1 - EPS;
}

function rayDistance(guard, angle, range, crouching) {
  const bx = guard.x + Math.sin(angle) * range;
  const bz = guard.z + Math.cos(angle) * range;
  const block = firstVisionBlock(guard.x, guard.z, bx, bz, crouching);
  return block ? Math.max(0, range * block.t - 0.015) : range;
}

export function sightPolygon(guard, crouching = false) {
  if (!guard || !Number.isFinite(guard.x) || !Number.isFinite(guard.z)) return [];
  const range = (Number.isFinite(guard.sightRange) ? guard.sightRange : CONFIG.sightRange) * (crouching ? CONFIG.crouchSightMultiplier : 1);
  const half = Number.isFinite(guard.fovHalf) ? guard.fovHalf : CONFIG.fovHalf;
  const points = [{ x: guard.x, z: guard.z }];
  const rays = 20;
  for (let i = 0; i <= rays; i++) {
    const angle = (guard.heading || 0) - half + (i / rays) * half * 2;
    const d = rayDistance(guard, angle, range, crouching);
    points.push({ x: guard.x + Math.sin(angle) * d, z: guard.z + Math.cos(angle) * d });
  }
  return points;
}

export function guardSees(guard, player, crouching = false) {
  if (!guard || !finitePoint(player) || !finitePoint(guard)) return false;
  const dx = player.x - guard.x, dz = player.z - guard.z;
  const d = Math.hypot(dx, dz);
  let range = Number.isFinite(guard.sightRange) ? guard.sightRange : CONFIG.sightRange;
  if (crouching) range *= CONFIG.crouchSightMultiplier;
  if (inFoliage(player.x, player.z) && d > CONFIG.foliagePointBlankRange) {
    range *= crouching ? CONFIG.foliageCrouchRangeMultiplier : CONFIG.foliageStandRangeMultiplier;
  }
  if (d > range) return false;
  if (d > EPS) {
    const angleTo = Math.atan2(dx, dz);
    const half = Number.isFinite(guard.fovHalf) ? guard.fovHalf : CONFIG.fovHalf;
    if (Math.abs(wrapAngle(angleTo - (guard.heading || 0))) > half) return false;
  }
  return !lineBlocked(guard.x, guard.z, player.x, player.z, { crouching });
}

function soundOcclusionMultiplier(ax, az, bx, bz) {
  let multiplier = 1;
  for (const o of LAYOUT.obstacles) {
    const t = segmentRectHitT(ax, az, bx, bz, o, 0);
    if (t === null || t <= EPS || t >= 1 - EPS) continue;
    multiplier *= o.kind === 'cover' ? 0.82 : 0.46;
  }
  return Math.max(0.16, multiplier);
}

export function hearingStrength(guard, noise) {
  if (!guard || !noise || !finitePoint(guard) || !finitePoint(noise) || !(noise.radius > 0)) return 0;
  const effective = noise.radius * soundOcclusionMultiplier(guard.x, guard.z, noise.x, noise.z);
  return clamp(1 - dist(guard.x, guard.z, noise.x, noise.z) / Math.max(EPS, effective), 0, 1);
}

function tryMovePoint(x, z, dx, dz) {
  if (Math.abs(dx) < EPS && Math.abs(dz) < EPS) return { x, z };
  const nx = x + dx, nz = z + dz;
  if (!isBlocked(nx, nz) && !movementLineBlocked(x, z, nx, nz)) return { x: nx, z: nz };
  if (Math.abs(dx) >= EPS && !isBlocked(nx, z) && !movementLineBlocked(x, z, nx, z)) return { x: nx, z };
  if (Math.abs(dz) >= EPS && !isBlocked(x, nz) && !movementLineBlocked(x, z, x, nz)) return { x, z: nz };
  return { x, z };
}

function nearestOpenGrid(point) {
  const b = LAYOUT.bounds, cell = CONFIG.navCell;
  const baseX = clamp(Math.round(point.x / cell) * cell, Math.ceil(b.minX), Math.floor(b.maxX));
  const baseZ = clamp(Math.round(point.z / cell) * cell, Math.ceil(b.minZ), Math.floor(b.maxZ));
  if (!isBlocked(baseX, baseZ)) return { x: baseX, z: baseZ };
  for (let ring = 1; ring <= 5; ring++) {
    for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const x = baseX + dx * cell, z = baseZ + dz * cell;
      if (!isBlocked(x, z)) return { x, z };
    }
  }
  return null;
}

const gridKey = p => p.x + ',' + p.z;

export function findPath(start, target) {
  if (!finitePoint(start) || !finitePoint(target)) return [];
  if (!isBlocked(target.x, target.z) && !movementLineBlocked(start.x, start.z, target.x, target.z)) return [{ x: target.x, z: target.z }];
  const from = nearestOpenGrid(start), to = nearestOpenGrid(target);
  if (!from || !to) return [];
  const startKey = gridKey(from), goalKey = gridKey(to);
  const queue = [from], parents = new Map([[startKey, null]]), byKey = new Map([[startKey, from]]);
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (let qi = 0; qi < queue.length && queue.length < 5000; qi++) {
    const current = queue[qi], currentKey = gridKey(current);
    if (currentKey === goalKey) break;
    for (const [dx, dz] of directions) {
      const next = { x: current.x + dx * CONFIG.navCell, z: current.z + dz * CONFIG.navCell };
      const key = gridKey(next);
      if (parents.has(key) || isBlocked(next.x, next.z)) continue;
      if (dx && dz && (isBlocked(current.x + dx * CONFIG.navCell, current.z) || isBlocked(current.x, current.z + dz * CONFIG.navCell))) continue;
      if (movementLineBlocked(current.x, current.z, next.x, next.z)) continue;
      parents.set(key, currentKey); byKey.set(key, next); queue.push(next);
    }
  }
  if (!parents.has(goalKey)) return [];
  const path = [];
  for (let key = goalKey; key && key !== startKey; key = parents.get(key)) path.push(byKey.get(key));
  path.reverse();
  if (!isBlocked(target.x, target.z) && path.length && !movementLineBlocked(path[path.length - 1].x, path[path.length - 1].z, target.x, target.z)) path.push({ x: target.x, z: target.z });
  return path;
}

function pathTargetKey(target) {
  return Math.round(target.x * 2) / 2 + ':' + Math.round(target.z * 2) / 2;
}

function moveGuardToward(g, target, speed, dt) {
  if (!finitePoint(target) || dt <= 0) return;
  let waypoint = target;
  if (movementLineBlocked(g.x, g.z, target.x, target.z)) {
    const key = pathTargetKey(target);
    if (g._pathKey !== key || !Array.isArray(g._path) || g._pathIndex >= g._path.length) {
      g._path = findPath(g, target); g._pathIndex = 0; g._pathKey = key;
    }
    while (g._pathIndex < g._path.length && dist(g.x, g.z, g._path[g._pathIndex].x, g._path[g._pathIndex].z) < 0.35) g._pathIndex++;
    if (g._pathIndex < g._path.length) waypoint = g._path[g._pathIndex];
    else return;
  } else {
    g._path = []; g._pathIndex = 0; g._pathKey = '';
  }
  const dx = waypoint.x - g.x, dz = waypoint.z - g.z, d = Math.hypot(dx, dz);
  if (d < EPS) return;
  const amount = Math.min(d, speed * dt);
  const mx = dx / d * amount, mz = dz / d * amount;
  const moved = tryMovePoint(g.x, g.z, mx, mz);
  const adx = moved.x - g.x, adz = moved.z - g.z;
  g.x = moved.x; g.z = moved.z;
  if (Math.hypot(adx, adz) > EPS) g.heading = Math.atan2(adx, adz);
}

function companionTarget(playerX, playerZ, heading, offset) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const rx = Math.cos(heading), rz = -Math.sin(heading);
  const point = { x: playerX - fx * offset.back + rx * offset.side, z: playerZ - fz * offset.back + rz * offset.side };
  return isBlocked(point.x, point.z) ? { x: playerX, z: playerZ } : point;
}

function makeGuard(spec, difficulty) {
  const hard = difficulty === 'hard';
  const first = spec.patrol[0], second = spec.patrol[1];
  return {
    id: spec.id, x: first.x, z: first.z,
    heading: Number.isFinite(spec.watchHeading) ? spec.watchHeading : Math.atan2(second.x - first.x, second.z - first.z),
    watchHeading: Number.isFinite(spec.watchHeading) ? spec.watchHeading : null,
    speed: spec.speed * (hard ? 1.12 : 1), baseSpeed: spec.speed * (hard ? 1.12 : 1),
    sightRange: CONFIG.sightRange * (hard ? 1.12 : 1), fovHalf: CONFIG.fovHalf,
    xMin: spec.xMin, xMax: spec.xMax, patrol: spec.patrol.map(p => ({ ...p })),
    mode: 'patrol', suspicion: 0, lastSeen: null, searchTimer: 0, seeing: false, hearing: false,
    _patrolIndex: 1, _pause: 0, _dir: 1, _pendingDir: 0,
    _path: [], _pathIndex: 0, _pathKey: '', _searchIndex: 0, _searchTarget: null,
    _returnBoosted: false,
  };
}

function makeCompanions(heading) {
  return COMPANION_OFFSETS.map((o, i) => {
    const p = companionTarget(LAYOUT.start.x, LAYOUT.start.z, heading, o);
    return { id: 'companion-' + i, x: p.x, z: p.z, heading, _path: [], _pathIndex: 0, _pathKey: '' };
  });
}

export function createState(options = {}) {
  const difficulty = options && options.difficulty === 'hard' ? 'hard' : 'normal';
  const heading = Math.atan2(LAYOUT.well.x - LAYOUT.start.x, LAYOUT.well.z - LAYOUT.start.z);
  return {
    phase: 'intro', difficulty,
    player: { x: LAYOUT.start.x, z: LAYOUT.start.z, heading, moving: false, crouching: false, sprinting: false },
    guards: LAYOUT.guards.map(g => makeGuard(g, difficulty)),
    companions: makeCompanions(heading),
    time: 0, alarm: 0, fill: 0, carrying: false, alerted: false,
    noise: null, movementNoise: null, stones: CONFIG.stones, distractionCooldown: 0,
    stats: { detections: 0, distractions: 0, catches: 0, distance: 0, hiddenTime: 0 },
    retries: 0, endingTime: 0, message: null,
    checkpoint: { x: LAYOUT.start.x, z: LAYOUT.start.z },
    graceTimer: 0, resumePhase: null, _distractHeld: false,
  };
}

export function startGame(state) {
  if (state && state.phase === 'intro') { state.phase = 'outbound'; state.message = null; }
  return state;
}

export function resetGame(state) {
  if (!state || typeof state !== 'object') throw new TypeError('state is required');
  const difficulty = state.difficulty === 'hard' ? 'hard' : 'normal';
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, createState({ difficulty }));
  return state;
}

export function targetFor(state) {
  if (!state || ['intro', 'ending', 'complete'].includes(state.phase)) return null;
  return state.carrying ? { x: LAYOUT.start.x, z: LAYOUT.start.z, label: 'camp' } : { x: LAYOUT.well.x, z: LAYOUT.well.z, label: 'well' };
}

function movePlayer(state, input, dt) {
  const inp = normInput(input);
  const crouching = !!input.crouch;
  const sprinting = !!input.sprint && !crouching;
  let speed = crouching ? CONFIG.crouchSpeed : sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
  if (state.carrying) speed *= CONFIG.carrySpeedMultiplier;
  const moved = tryMovePoint(state.player.x, state.player.z, inp.x * speed * dt, inp.z * speed * dt);
  const dx = moved.x - state.player.x, dz = moved.z - state.player.z;
  state.player.x = moved.x; state.player.z = moved.z;
  const amount = Math.hypot(dx, dz);
  state.player.moving = amount > EPS;
  state.player.crouching = crouching;
  state.player.sprinting = sprinting && state.player.moving;
  if (state.player.moving) state.player.heading = Math.atan2(dx, dz);
  state.stats.distance += amount;
  if (crouching && inFoliage(state.player.x, state.player.z)) state.stats.hiddenTime += dt;
}

function movementNoiseRadius(state) {
  if (!state.player.moving) return 0;
  let radius = state.player.crouching ? CONFIG.noise.crouch : state.player.sprinting ? CONFIG.noise.sprint : CONFIG.noise.walk;
  if (state.carrying) radius *= CONFIG.noise.carryMultiplier;
  return radius;
}

function findThrowLanding(player) {
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  let last = { x: player.x, z: player.z };
  for (let d = 0.5; d <= CONFIG.distractionRange + EPS; d += 0.25) {
    const point = { x: player.x + fx * d, z: player.z + fz * d };
    if (isBlocked(point.x, point.z) || movementLineBlocked(player.x, player.z, point.x, point.z)) break;
    last = point;
  }
  return dist(last.x, last.z, player.x, player.z) >= 0.5 ? last : null;
}

function updateNoiseAndDistraction(state, input, dt) {
  state.distractionCooldown = Math.max(0, state.distractionCooldown - dt);
  const held = !!input.distract;
  if (held && !state._distractHeld && state.stones > 0 && state.distractionCooldown <= EPS) {
    const landing = findThrowLanding(state.player);
    if (landing) {
      state.stones--; state.distractionCooldown = CONFIG.distractionCooldown;
      state.noise = { x: landing.x, z: landing.z, radius: CONFIG.distractionNoiseRadius, ttl: 0.9, kind: 'stone' };
      state.stats.distractions++; state.message = 'stone-thrown';
    }
  }
  state._distractHeld = held;
  const radius = movementNoiseRadius(state);
  state.movementNoise = radius > 0
    ? { x: state.player.x, z: state.player.z, radius, ttl: 0.12, kind: state.player.sprinting ? 'sprint' : state.player.crouching ? 'crouch' : 'walk' }
    : null;
  // Keep the frozen primary API: a live stone remains state.noise for UI/radar,
  // otherwise footsteps are primary. Guards independently consider both events.
  if (!state.noise || state.noise.kind !== 'stone') state.noise = state.movementNoise;
}

function visualGain(state, g, dt) {
  const d = dist(g.x, g.z, state.player.x, state.player.z);
  const range = Math.max(EPS, g.sightRange);
  let rate = state.difficulty === 'hard' ? 0.88 : 0.68;
  rate *= clamp(1.2 - d / range * 0.55, 0.62, 1.15);
  if (state.player.crouching) rate *= 0.9;
  if (state.player.sprinting) rate *= 1.3; // speed saves time but exposed movement is easier to confirm
  if (inFoliage(state.player.x, state.player.z) && d > CONFIG.foliagePointBlankRange) rate *= 0.62;
  if (state.carrying) rate *= 1.2;
  return rate * dt;
}

function setGuardModeFromSuspicion(g) {
  if (g.mode === 'alert' || g.mode === 'investigate' || g.mode === 'search') return;
  g.mode = g.suspicion >= 0.5 ? 'investigate' : g.suspicion >= 0.16 ? 'suspicious' : 'patrol';
}

function updateGuardAwareness(state, g, dt) {
  if (state.graceTimer > 0) {
    g.seeing = false; g.hearing = false; g.suspicion = Math.max(0, g.suspicion - dt * 1.2);
    if (g.mode !== 'patrol') g.mode = 'patrol';
    return;
  }
  g.seeing = guardSees(g, state.player, state.player.crouching);
  const audible = [];
  if (state.noise) audible.push(state.noise);
  if (state.movementNoise && state.movementNoise !== state.noise) audible.push(state.movementNoise);
  let heard = 0, heardEvent = null;
  for (const event of audible) {
    const strength = hearingStrength(g, event);
    if (strength > heard) { heard = strength; heardEvent = event; }
  }
  g.hearing = heard > 0;
  if (g.seeing) {
    const previous = g.mode;
    g.lastSeen = { x: state.player.x, z: state.player.z };
    g.suspicion = clamp(g.suspicion + visualGain(state, g, dt), 0, 1);
    g.searchTimer = (state.difficulty === 'hard' ? 1.35 : 1) * CONFIG.searchDuration;
    if (g.suspicion >= 1) {
      g.mode = 'alert'; state.alerted = true;
      if (previous !== 'alert') state.stats.detections++;
    } else setGuardModeFromSuspicion(g);
  } else if (g.hearing) {
    g.lastSeen = { x: heardEvent.x, z: heardEvent.z };
    g.suspicion = Math.max(g.suspicion, 0.22 + heard * 0.24);
    g.searchTimer = (state.difficulty === 'hard' ? 1.25 : 1) * CONFIG.investigateDuration;
    if (g.mode !== 'alert') g.mode = 'investigate';
  } else {
    const decay = g.mode === 'alert' ? 0.035 : g.mode === 'search' ? 0.07 : 0.12;
    g.suspicion = Math.max(0, g.suspicion - decay * dt);
    if (g.mode === 'suspicious') {
      g.searchTimer = Math.max(0, g.searchTimer - dt);
      if (g.suspicion < 0.08 || g.searchTimer <= 0) { g.mode = 'patrol'; g.lastSeen = null; }
    }
  }
}

function patrolGuard(g, dt, speed) {
  // Posted sentries reacquire their authored watch direction only after awareness has
  // genuinely returned to patrol; investigation/search can still turn them normally.
  if (Number.isFinite(g.watchHeading)) g.heading = g.watchHeading;
  if (g._pause > 0) { g._pause = Math.max(0, g._pause - dt); return; }
  const target = g.patrol[g._patrolIndex];
  moveGuardToward(g, target, speed, dt);
  if (dist(g.x, g.z, target.x, target.z) < 0.4) {
    g._patrolIndex = (g._patrolIndex + 1) % g.patrol.length;
    g._pause = CONFIG.patrolPause;
  }
}

function searchTargetFor(g) {
  if (!g.lastSeen) return null;
  const offset = SEARCH_OFFSETS[(g._searchIndex + g.id.length) % SEARCH_OFFSETS.length];
  const candidate = { x: g.lastSeen.x + offset.x, z: g.lastSeen.z + offset.z };
  return isBlocked(candidate.x, candidate.z) ? { ...g.lastSeen } : candidate;
}

function moveGuardByMode(state, g, dt) {
  const returnPressure = state.carrying ? 1.12 : 1;
  const hardPressure = state.difficulty === 'hard' ? 1.06 : 1;
  const base = g.speed * returnPressure * hardPressure;
  if (g.mode === 'patrol') { patrolGuard(g, dt, base); return; }
  if (g.mode === 'suspicious') {
    if (g.lastSeen) g.heading = Math.atan2(g.lastSeen.x - g.x, g.lastSeen.z - g.z);
    g.searchTimer = Math.max(g.searchTimer, 0.8);
    return;
  }
  if (g.mode === 'investigate') {
    if (!g.lastSeen) { g.mode = 'search'; return; }
    moveGuardToward(g, g.lastSeen, base * 1.02, dt);
    g.searchTimer = Math.max(0, g.searchTimer - dt);
    if (dist(g.x, g.z, g.lastSeen.x, g.lastSeen.z) < 0.65 || g.searchTimer <= 0) {
      g.mode = 'search'; g.searchTimer = (state.difficulty === 'hard' ? 1.35 : 1) * CONFIG.searchDuration; g._searchIndex = 0;
    }
    return;
  }
  if (g.mode === 'alert') {
    if (g.lastSeen) moveGuardToward(g, g.lastSeen, base * 1.28, dt);
    if (!g.seeing) {
      g.searchTimer = Math.max(0, g.searchTimer - dt);
      if ((g.lastSeen && dist(g.x, g.z, g.lastSeen.x, g.lastSeen.z) < 0.6) || g.searchTimer <= 0) {
        g.mode = 'search'; g.searchTimer = (state.difficulty === 'hard' ? 1.45 : 1.1) * CONFIG.searchDuration; g._searchIndex = 0;
      }
    }
    return;
  }
  if (g.mode === 'search') {
    g.searchTimer = Math.max(0, g.searchTimer - dt);
    if (g.searchTimer <= 0) {
      g.mode = 'patrol'; g.suspicion = 0; g.lastSeen = null; g._searchTarget = null; return;
    }
    if (!g._searchTarget) g._searchTarget = searchTargetFor(g);
    if (g._searchTarget) {
      moveGuardToward(g, g._searchTarget, base * 0.86, dt);
      if (dist(g.x, g.z, g._searchTarget.x, g._searchTarget.z) < 0.55) {
        g._searchIndex++; g._searchTarget = searchTargetFor(g);
      }
    } else {
      g.heading = wrapAngle(g.heading + dt * 0.9);
    }
  }
}

function resetGuardRuntime(state) {
  state.guards.forEach((g, i) => {
    const spec = LAYOUT.guards[i], start = spec.patrol[0], next = spec.patrol[1];
    g.x = start.x; g.z = start.z;
    g.heading = Number.isFinite(spec.watchHeading) ? spec.watchHeading : Math.atan2(next.x - start.x, next.z - start.z);
    g.mode = 'patrol'; g.suspicion = 0; g.lastSeen = null; g.searchTimer = 0; g.seeing = false; g.hearing = false;
    g._patrolIndex = 1; g._pause = i * 0.18; g._path = []; g._pathIndex = 0; g._pathKey = ''; g._searchTarget = null; g._searchIndex = 0;
  });
}

function enterCaught(state) {
  state.resumePhase = state.carrying ? 'return' : 'outbound';
  state.phase = 'caught'; state.player.moving = false; state.player.sprinting = false;
  state.retries++; state.stats.catches++; state.message = 'spotted'; state.noise = null; state.movementNoise = null;
}

function updateGuards(state, dt) {
  for (const g of state.guards) {
    updateGuardAwareness(state, g, dt);
    moveGuardByMode(state, g, dt);
  }
  state.alarm = state.guards.reduce((max, g) => Math.max(max, g.suspicion), 0);
  const capture = state.guards.some(g => g.mode === 'alert' && dist(g.x, g.z, state.player.x, state.player.z) <= CONFIG.captureRange * (state.difficulty === 'hard' ? 1.08 : 1) && !lineBlocked(g.x, g.z, state.player.x, state.player.z, { crouching: state.player.crouching }));
  if (capture) enterCaught(state);
}

function updateCompanions(state, dt) {
  const heading = state.player.heading;
  state.companions.forEach((c, i) => {
    const target = companionTarget(state.player.x, state.player.z, heading, COMPANION_OFFSETS[i]);
    // Same cached grid navigation as guards, but with a bounded catch-up speed and no
    // awareness role. This prevents wall-corner sticking without portals or detection.
    moveGuardToward(c, target, 5.8, dt);
    c.heading = heading;
  });
}

function snapCompanions(state) {
  state.companions.forEach((c, i) => {
    const target = companionTarget(state.player.x, state.player.z, state.player.heading, COMPANION_OFFSETS[i]);
    c.x = target.x; c.z = target.z; c.heading = state.player.heading;
    c._path = []; c._pathIndex = 0; c._pathKey = '';
  });
}

function activateReturnPressure(state) {
  state.alerted = true;
  state.guards.forEach(g => {
    if (g._returnBoosted) return;
    g.speed *= 1.08; g.sightRange *= 1.08; g._returnBoosted = true;
    if (g.mode === 'patrol') g._pause = 0;
  });
}

function handleWell(state, action, dt) {
  if (state.carrying) return;
  const near = dist(state.player.x, state.player.z, LAYOUT.well.x, LAYOUT.well.z) <= CONFIG.fillRadius;
  if (near && action && !state.player.moving) {
    state.phase = 'filling'; state.fill = Math.min(1, state.fill + dt / CONFIG.fillDuration);
    if (state.fill >= 1) {
      state.carrying = true; state.phase = 'return'; state.checkpoint = { ...LAYOUT.wellApproach };
      state.message = 'well-filled'; activateReturnPressure(state);
    }
  } else if (state.phase === 'filling') state.phase = 'outbound';
}

function handleReturn(state, action) {
  if (!state.carrying) return;
  if (dist(state.player.x, state.player.z, LAYOUT.start.x, LAYOUT.start.z) <= CONFIG.returnRadius && action) {
    state.phase = 'ending'; state.endingTime = 0; state.message = 'poured-out-to-the-lord'; state.noise = null; state.movementNoise = null;
  }
}

function clearCaught(state) {
  const cp = state.checkpoint;
  const lookAt = state.resumePhase === 'return' ? LAYOUT.start : LAYOUT.well;
  state.player.x = cp.x; state.player.z = cp.z;
  state.player.heading = Math.atan2(lookAt.x - cp.x, lookAt.z - cp.z);
  state.player.moving = false; state.player.crouching = false; state.player.sprinting = false;
  state.alarm = 0; state.graceTimer = CONFIG.gracePeriod; state.phase = state.resumePhase || 'outbound';
  state.resumePhase = null; state.message = null; state.noise = null; state.movementNoise = null; state._distractHeld = false;
  resetGuardRuntime(state); snapCompanions(state);
}

export function coverAt(state) {
  if (!state || !state.player) return 'exposed';
  const p = state.player;
  if (p.crouching && inFoliage(p.x, p.z)) return 'concealed';
  const nearby = state.guards.filter(g => dist(g.x, g.z, p.x, p.z) <= g.sightRange * 1.25);
  if (!nearby.length) return 'exposed';
  let low = false, tall = 0;
  for (const g of nearby) {
    const block = firstVisionBlock(g.x, g.z, p.x, p.z, p.crouching);
    if (block?.kind === 'cover') low = true;
    if (block?.kind === 'tall') tall++;
  }
  if (p.crouching && low) return 'low-cover';
  if (tall === nearby.length) return 'occluded';
  return 'exposed';
}

export function stealthInfo(state) {
  const guards = state?.guards || [];
  let mode = 'patrol';
  for (const g of guards) if ((MODE_RANK[g.mode] ?? 0) > (MODE_RANK[mode] ?? 0)) mode = g.mode;
  return {
    cover: coverAt(state), mode,
    noiseRadius: Math.max(state?.noise?.radius || 0, state?.movementNoise?.radius || 0),
    threats: guards.filter(g => g.seeing || g.mode === 'alert').length,
  };
}

export function step(state, input = {}, dt = 0) {
  if (!state || typeof state !== 'object') throw new TypeError('state is required');
  dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
  if (state.phase === 'intro' || state.phase === 'complete') return state;
  if (state.phase === 'caught') {
    state._distractHeld = !!input.distract;
    if (input.action) clearCaught(state);
    return state;
  }
  state.time += dt;
  if (state.phase === 'ending') {
    state.endingTime = Math.min(CONFIG.endingDuration, state.endingTime + dt);
    if (state.endingTime >= CONFIG.endingDuration) { state.phase = 'complete'; state.message = 'complete'; }
    return state;
  }

  state.graceTimer = Math.max(0, state.graceTimer - dt);
  movePlayer(state, input, dt);
  updateNoiseAndDistraction(state, input, dt);
  updateGuards(state, dt);
  if (state.phase === 'caught') return state;
  updateCompanions(state, dt);
  handleWell(state, !!input.action, dt);
  if (state.phase === 'return') handleReturn(state, !!input.action);
  if (state.movementNoise) {
    state.movementNoise.ttl = Math.max(0, state.movementNoise.ttl - dt);
    if (state.movementNoise.ttl <= 0) state.movementNoise = null;
  }
  if (state.noise?.kind === 'stone') {
    state.noise.ttl = Math.max(0, state.noise.ttl - dt);
    if (state.noise.ttl <= 0) state.noise = state.movementNoise;
  } else {
    state.noise = state.movementNoise;
  }
  return state;
}
