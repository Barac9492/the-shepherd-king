// Act 4 map: 헤브론 (south) and the stronghold of Zion, 다윗성 (north). 삼하 2:1–4, 5:1–12.
// The text names Hebron, the stronghold, Millo, Hiram's cedar and craftsmen; every shape, distance and
// position here is imagined. Produces the same world shape as generateWorld()/generateZiklag().
import { T, fbm, rand } from './world.js';

export const HW = 120, HH = 110;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// zone anchors (tile coordinates)
export const HEB = { i0: 46, i1: 74, j0: 66, j1: 90, gateI: 60 }; // 헤브론, one gate on the north wall
export const ZION = { ci: 60, cj: 26, r: 10, gateA: Math.PI / 2, gateHalf: 0.2 }; // the stronghold; the gate faces south (+j)
export const SEGMENTS = 12;
export const MILLO_A = -Math.PI / 3; // Millo on the north-east shoulder (imagined placement)

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** The ring's segments in building order: Millo first, then alternating outward on both sides until the gate (대상 11:8 "밀로에서부터 두루"). */
export function segmentAngles() {
  const span = (Math.PI * 2 - ZION.gateHalf * 2) / SEGMENTS; // equal arcs, gate gap excluded
  // arcs counted clockwise from the east side of the gate
  const arcs = []; for (let k = 0; k < SEGMENTS; k++) { const a0 = ZION.gateA + ZION.gateHalf + k * span; arcs.push({ a0, a1: a0 + span, mid: a0 + span / 2 }); }
  const start = arcs.reduce((b, a, k) => (Math.abs(angDiff(a.mid, MILLO_A)) < Math.abs(angDiff(arcs[b].mid, MILLO_A)) ? k : b), 0);
  const order = [start];
  for (let d = 1; order.length < SEGMENTS; d++) { for (const k of [start - d, start + d]) if (k >= 0 && k < SEGMENTS && !order.includes(k)) order.push(k); }
  return order.map((k) => arcs[k]);
}

function rawHeight(i, j) {
  const n = fbm(i * 0.05, j * 0.05, 211);
  let h = 1.6 + (n - 0.5) * 1.4;
  // the hill of Zion
  const dz = Math.hypot(i - ZION.ci, (j - ZION.cj) * 1.05);
  h = lerp(h, 3.0, smooth(ZION.r + 6, ZION.r - 1, dz));
  // the Kidron side falls away to the east
  h -= smooth(ZION.ci + 8, ZION.ci + 22, i) * smooth(46, 30, j) * 1.2;
  // a low saddle between the two zones
  h += smooth(10, 0, Math.abs(j - 54)) * 0.6;
  return h;
}

export function generateHebron() {
  const W = HW, H = HH, N = W * H;
  const height = new Float32Array(N), type = new Uint8Array(N), water = new Float32Array(N).fill(-1);
  const blocked = new Uint8Array(N), path = new Uint8Array(N), tag = new Uint8Array(N), road = new Uint8Array(N), town = new Uint8Array(N), zion = new Uint8Array(N);
  const idx = (i, j) => j * W + i, inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const q = (h) => Math.round(h * 2) / 2;
  const r = rand(5011);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);

  // ---- Hebron's floor, Zion's summit ----
  for (let j = HEB.j0 - 2; j <= HEB.j1 + 2; j++) for (let i = HEB.i0 - 2; i <= HEB.i1 + 2; i++) { height[idx(i, j)] = 1.5; if (i > HEB.i0 && i < HEB.i1 && j > HEB.j0 && j < HEB.j1) town[idx(i, j)] = 1; }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = Math.hypot(i - ZION.ci, j - ZION.cj); if (d <= ZION.r + 1.4) { height[idx(i, j)] = 3.0; if (d < ZION.r - 0.6) zion[idx(i, j)] = 1; } }

  // ---- roads ----
  const ROADS = [
    [[60, 50], [60, 56], [60, 61], [60, 66]],                          // the north road into Hebron (the tribes come this way, 5:1)
    [[60, 37], [60, 40], [60, 44], [61, 50]],                          // Zion's gate → the camp → the saddle
    [[10, 46], [24, 45], [38, 44], [48, 43], [54, 42]],               // the west road: Hiram's caravan (5:11)
  ];
  const roadLines = ROADS.map(() => []);
  ROADS.forEach((pts, ri) => { for (let s = 0; s < pts.length - 1; s++) {
    const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) {
      const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); roadLines[ri].push([x, z]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.2) { path[idx(i, j)] = 1; road[idx(i, j)] = 1; } }
    }
  } });
  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  // smooth roads into steps of at most half a block
  for (let pass = 0; pass < 6; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = idx(i, j); if (!path[k]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = idx(i + di, j + dj); if (path[kk] && Math.abs(height[kk] - height[k]) > 0.5) height[kk] = height[k] + Math.sign(height[kk] - height[k]) * 0.5; }
  }
  // a ramp up to Zion's gate
  for (let j = 36; j <= 44; j++) for (let i = 58; i <= 62; i++) { const k = idx(i, j); height[k] = q(lerp(3.0, height[idx(60, 45)], smooth(36, 44, j))); path[k] = 1; }

  // ---- tile types ----
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j);
    const n = fbm(i * 0.07, j * 0.07, 17), n3 = fbm(i * 0.21, j * 0.21, 37);
    let slope = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (town[k]) t = road[k] || Math.abs(i - HEB.gateI) <= 1 ? T.PAVE : n3 > 0.6 ? T.SOIL : T.PATH;
    else if (zion[k]) t = n3 > 0.62 ? T.SOIL : T.PATH;
    else if (road[k]) t = T.GRAVEL;
    else if (path[k]) t = T.PATH;
    else if (slope >= 1) t = n3 > 0.55 ? T.ROCK : T.LIME;
    else if (j > 60) t = n > 0.55 ? T.LUSH : n > 0.4 ? T.GRASS : T.DRY; // Hebron's vineyards and fields
    else t = n3 > 0.68 ? T.LIME : n > 0.55 ? T.GRASS : T.DRY;
    type[k] = t;
  }

  // ---- features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields: [], npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: null, waterfall: null, segments: [], houseSite: null, covenant: null, spring: null };
  const block = (i0, j0, w, d) => { for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) blocked[idx(i, j)] = 1; };

  // 헤브론: a walled town, north gate only
  const gate = (i) => Math.abs(i - HEB.gateI) <= 1;
  for (let i = HEB.i0; i <= HEB.i1; i++) { if (!gate(i)) { F.walls.push({ i, j: HEB.j0, h: 2.0, y: height[idx(i, HEB.j0)] }); blocked[idx(i, HEB.j0)] = 1; } F.walls.push({ i, j: HEB.j1, h: 2.0, y: height[idx(i, HEB.j1)] }); blocked[idx(i, HEB.j1)] = 1; }
  for (let j = HEB.j0 + 1; j < HEB.j1; j++) for (const i of [HEB.i0, HEB.i1]) { F.walls.push({ i, j, h: 2.0, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  for (const [i, j] of [[HEB.i0, HEB.j0], [HEB.i1, HEB.j0], [HEB.i0, HEB.j1], [HEB.i1, HEB.j1], [HEB.gateI - 2, HEB.j0], [HEB.gateI + 2, HEB.j0]]) { F.towers.push({ i, j, h: 3.2, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  const house = (i0, j0, w, d, h, style) => { F.houses.push({ i0, j0, w, d, h, y: height[idx(i0, j0)], style }); block(i0, j0, w, d); };
  for (const [i0, j0, w, d, s] of [
    [48, 68, 3, 2, 1], [52, 68, 2, 2, 0], [48, 72, 2, 3, 0], [48, 84, 3, 3, 1], [52, 87, 3, 2, 0], [56, 87, 2, 2, 1],
    [66, 68, 2, 2, 0], [65, 87, 3, 2, 1], [69, 86, 2, 3, 0], [70, 82, 3, 2, 1], [48, 78, 2, 2, 1],
    [67, 72, 4, 3, 2], // the storehouse
  ]) house(i0, j0, w, d, 1.9 + (s ? 0.3 : 0), s);
  F.well = { i: 53, j: 80, y: height[idx(53, 80)] }; blocked[idx(53, 80)] = 1;
  // the covenant stone in Hebron's square (5:3 "여호와 앞에서 … 언약을 세우매"; the stone itself is imagined)
  F.covenant = { i: 60, j: 79, y: height[idx(60, 79)] }; blocked[idx(60, 79)] = 1;
  F.torches.push({ i: 58.6, j: 64.6 }, { i: 61.4, j: 64.6 });
  F.props.push({ kind: 'hay', i: 70.4, j: 76.2 }, { kind: 'basket', i: 68.6, j: 76.4 }, { kind: 'jar', i: 52, j: 79 }, { kind: 'jar', i: 54.2, j: 79.2 });
  F.stalls.push({ i: 56, j: 72, color: 1 });
  // vineyards around Hebron (imagined)
  for (const [ci, cj] of [[36, 74], [84, 76], [38, 92], [84, 94]]) F.fields.push({ i0: ci - 5, j0: cj - 3, w: 10, d: 6, kind: 'vine' });

  // Zion: the wall ring is built during play; tiles are known up front
  const segs = segmentAngles();
  segs.forEach((a, order) => {
    const tiles = [], seen = new Set();
    for (let t = 0; t <= 40; t++) {
      const ang = lerp(a.a0, a.a1, t / 40), i = Math.round(ZION.ci + Math.cos(ang) * ZION.r), j = Math.round(ZION.cj + Math.sin(ang) * ZION.r), key = i * 1000 + j;
      if (!seen.has(key)) { seen.add(key); tiles.push({ i, j, y: height[idx(i, j)] }); }
    }
    const sx = ZION.ci + Math.cos(a.mid) * (ZION.r - 2.2), sz = ZION.cj + Math.sin(a.mid) * (ZION.r - 2.2);
    F.segments.push({ order, mid: a.mid, tiles, spot: { i: sx, j: sz }, millo: order === 0 });
  });
  { const m = segs[0]; F.millo = { i: ZION.ci + Math.cos(m.mid) * (ZION.r + 1.6), j: ZION.cj + Math.sin(m.mid) * (ZION.r + 1.6) }; }
  // gate towers at both sides of the gap
  for (const s of [-1, 1]) { const a = ZION.gateA + s * (ZION.gateHalf + 0.05), i = Math.round(ZION.ci + Math.cos(a) * ZION.r), j = Math.round(ZION.cj + Math.sin(a) * ZION.r); F.towers.push({ i, j, h: 3.4, y: height[idx(i, j)], zion: true }); blocked[idx(i, j)] = 1; }
  // David's house: a stone foundation now, a cedar house later (5:11)
  F.houseSite = { i0: 58, j0: 21, w: 5, d: 3, y: height[idx(58, 21)] }; block(58, 21, 5, 3);
  // the storehouse on the summit, the spring below the hill to the south-east (Gihon; placement imagined)
  house(51, 25, 3, 3, 2.1, 2);
  F.spring = { i: 70, j: 41, y: height[idx(70, 41)] }; water[idx(70, 41)] = height[idx(70, 41)] + 0.3; blocked[idx(70, 41)] = 1;
  // the camp below the gate
  for (const [i0, j0, s] of [[50, 46, 0], [54, 48, 1], [64, 47, 0], [67, 49, 1], [48, 50, 1], [70, 45, 0]]) { F.tents.push({ i0, j0, w: 3, d: 2, style: s, y: height[idx(i0, j0)] }); block(i0, j0, 3, 2); }
  F.fires.push({ i: 60, j: 48 });
  // olive and terebinth trees, keeping the zones and roads clear
  const nearRoad = (i, j, d) => roadLines.some((l) => l.some(([x, z]) => Math.hypot(x - i, z - j) < d));
  const clear = (i, j) => (i >= HEB.i0 - 3 && i <= HEB.i1 + 3 && j >= HEB.j0 - 6 && j <= HEB.j1 + 3) || Math.hypot(i - ZION.ci, j - ZION.cj) < ZION.r + 4 || (j > 38 && j < 54 && i > 44 && i < 76) || Math.hypot(i - 70, j - 41) < 3;
  const tryTree = (i, j, kind, s) => {
    const k = idx(i, j);
    if (!inb(i, j) || water[k] >= 0 || path[k] || blocked[k] || clear(i, j) || nearRoad(i, j, 2.4)) return false;
    if (F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < 2.8)) return false;
    F.trees.push({ i, j, y: height[k], kind, s, seed: Math.floor(r() * 1e6) }); blocked[k] = 1; return true;
  };
  for (let n = 0; n < 2500 && F.trees.length < 34; n++) tryTree(4 + Math.floor(r() * (W - 8)), 8 + Math.floor(r() * (H - 14)), n % 3 ? 'olive' : 'terebinth', 0.8 + r() * 0.35);
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j); if (water[k] >= 0 || path[k] || blocked[k] || town[k] || zion[k]) continue;
    if ((type[k] === T.DRY || type[k] === T.LIME) && r() < 0.02) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.55 + r() * 0.5 });
  }

  // play bounds
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < 3 || i > W - 3 || j < 6 || j > H - 6) blocked[idx(i, j)] = 1;

  // ---- layout (world units) ----
  const P = (i, j) => ({ x: i - W / 2, z: j - H / 2 });
  const ring = (ci, cj, n0, rad0, rx, rz, ok) => { const out = []; for (let n = 0; n < 90 && out.length < n0; n++) { const a = n * 2.399, rr = rad0 + Math.sqrt(n) * 1.1; const i = ci + Math.cos(a) * rr * rx, j = cj + Math.sin(a) * rr * rz; const k = idx(Math.round(i), Math.round(j)); if (inb(Math.round(i), Math.round(j)) && !blocked[k] && water[k] < 0 && ok(i, j)) out.push(P(i, j)); } return out; };
  const workOffsets = { water: [[0.8, 1.2], [1.8, 0.2], [1.4, 2.0]], bread: [[-1, 1.4], [0.8, 1.6], [-0.2, 2.2]], watch: [[-0.8, 0.8], [0.8, 0.8], [-1.6, 1.4], [1.6, 1.4]] };
  const TENTS = [[50, 76], [57, 84], [64, 84], [70, 80]];
  const inTown = (i, j) => i > HEB.i0 + 1.5 && i < HEB.i1 - 1.5 && j > HEB.j0 + 1.5 && j < HEB.j1 - 1.5 && TENTS.every(([ti, tj]) => Math.abs(i - ti) > 2.2 || Math.abs(j - tj + 0.5) > 1.8);
  const inZion = (i, j) => Math.hypot(i - ZION.ci, j - ZION.cj) < ZION.r - 2;
  const stop = {
    id: 'hebron', name: '헤브론', ref: '삼하 2:1–4',
    // Hebron (Act 1 rules): the spring is the town well, bread from the storehouse, a watcher on the gate tower
    entry: P(60, 69), spring: P(53, 81.4), basket: P(69, 76.2), lookout: P(72.4, 67.6), rampBase: P(71, 69.4), fire: P(60, 75),
    roadStart: P(60, 52), exit: P(60, 60), exitRoad: [],
    waitSlots: [[57, 71], [63, 71], [55.4, 73.6], [64.6, 73.4], [58.4, 74.4], [61.6, 74.6]].map(([i, j]) => P(i, j)),
    restSlots: ring(60, 82, 40, 2.2, 1.35, 0.7, inTown),
    tentSpots: TENTS.map(([i, j]) => ({ i, j })),
    fireSpots: [],
    where: { water: '서쪽 우물에서 떠 오세요', bread: '동쪽 곳간에서 가져오세요' },
    lookoutName: '북동쪽 망대', arrivals: 4, maxTime: 55, workOffsets,
    // the tribes (5:1): they come down the north road and wait outside the gate
    tribeRoad: P(60, 50), tribeSpots: [[52, 56], [56, 57.6], [64, 57.6], [68, 56], [50, 60], [55, 61.4], [65, 61.4], [70, 60], [53, 63.4], [67, 63.4], [60, 57]].map(([i, j]) => P(i, j)),
    covenant: P(60, 79), covenantSlots: ring(60, 79, 16, 1.6, 1.3, 1.0, inTown),
    // Zion (5:7–11)
    zionEntry: P(60, 44.5), gate: P(60, 36.5), camp: P(60, 46.5), campSlots: ring(60, 48, 12, 2.0, 1.6, 0.6, (i, j) => j > 44 && j < 52),
    segSpots: F.segments.map((s) => P(s.spot.i, s.spot.j)), houseDrop: P(60, 25.6), zionBasket: P(53.6, 28.6), zionSpring: P(70, 39.4),
    caravanFrom: P(12, 46), caravanRoad: roadLines[2].filter((_, n) => n % 3 === 0).map(([i, j]) => P(i, j)), caravan: P(54, 42.2),
    zionRest: ring(60, 30, 20, 2.0, 1.2, 0.8, inZion),
  };
  return { W, H, height, type, water, blocked, path, tag, features: F, spawn: [60, 69], idx, inb, layout: { stop } };
}
