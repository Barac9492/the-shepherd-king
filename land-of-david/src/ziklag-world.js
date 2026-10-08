// Act 3 map: 시글락 and the way south to 브솔 시내 (삼상 27:5–7, 30). North → south.
// The text names the town and the brook; their shape, distances and the field beyond are imagined.
// Produces the same world shape as generateWorld()/generateWilderness().
import { T, fbm, rand } from './world.js';

export const ZW = 120, ZH = 100;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// zone anchors (tile coordinates)
export const TOWN = { i0: 44, i1: 76, j0: 16, j1: 40, gateI: 60 };
export const BESOR = { j: 63, fordI0: 57, fordI1: 63 };
export const CAMP = { ci: 60, cj: 95 }; // the Amalekite camp, seen from the overlook only (30:16)

function rawHeight(i, j) {
  const n = fbm(i * 0.045, j * 0.045, 83);
  let h = 1.7 + (n - 0.5) * 1.3;
  // the brook runs in a shallow wadi
  h -= smooth(6, 0, Math.abs(j - BESOR.j)) * 0.8;
  // a low ridge before the overlook, the camp below it
  h += smooth(5, 0, Math.abs(j - 86)) * 1.6 * smooth(30, 18, Math.abs(i - 60));
  if (j > 89) h = lerp(h, 1.0, smooth(89, 93, j));
  return h;
}

export function generateZiklag() {
  const W = ZW, H = ZH, N = W * H;
  const height = new Float32Array(N), type = new Uint8Array(N), water = new Float32Array(N).fill(-1);
  const blocked = new Uint8Array(N), path = new Uint8Array(N), tag = new Uint8Array(N), road = new Uint8Array(N), town = new Uint8Array(N);
  const idx = (i, j) => j * W + i, inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const q = (h) => Math.round(h * 2) / 2;
  const r = rand(3027);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);

  // ---- the town floor ----
  for (let j = TOWN.j0 - 2; j <= TOWN.j1 + 2; j++) for (let i = TOWN.i0 - 2; i <= TOWN.i1 + 2; i++) { height[idx(i, j)] = 1.5; if (i > TOWN.i0 && i < TOWN.i1 && j > TOWN.j0 && j < TOWN.j1) town[idx(i, j)] = 1; }
  // flat banks at the ford and a flat field where the Egyptian lies
  const flatten = (ci, cj, rx, rz, level, feather = 4) => {
    for (let j = Math.floor(cj - rz - feather); j <= cj + rz + feather; j++) for (let i = Math.floor(ci - rx - feather); i <= ci + rx + feather; i++) {
      if (!inb(i, j)) continue;
      const d = Math.hypot((i - ci) / rx, (j - cj) / rz) - 1, w = smooth(feather / Math.max(rx, rz), 0, d);
      const k = idx(i, j); height[k] = lerp(height[k], level, w);
    }
  };
  flatten(56, 58, 12, 3.5, 1.0);
  flatten(62, 67.5, 10, 2.5, 1.0);
  flatten(68, 73, 7, 4, 1.5);

  // ---- roads ----
  const ROADS = [
    [[60, 4], [60, 10], [60, 16]],                                   // from Gath / to Aphek, into the north gate
    [[60, 40], [60, 46], [59, 52], [60, 58], [60, 63], [60, 66]],   // south gate → 브솔 ford
    [[60, 66], [64, 69], [68, 72], [67, 77], [63, 81], [60, 85], [60, 88]], // the Egyptian's way to the overlook (30:16)
  ];
  const roadLines = ROADS.map(() => []);
  ROADS.forEach((pts, ri) => { for (let s = 0; s < pts.length - 1; s++) {
    const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) {
      const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); roadLines[ri].push([x, z]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.2) { path[idx(i, j)] = 1; road[idx(i, j)] = 1; height[idx(i, j)] = Math.min(height[idx(i, j)], 2); } }
    }
  } });
  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  for (let pass = 0; pass < 4; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = idx(i, j); if (!path[k]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = idx(i + di, j + dj); if (path[kk] && height[kk] - height[k] > 0.5) height[kk] = height[k] + 0.5; }
  }

  // ---- 브솔 시내: a brook across the whole valley, shallow ford on the road ----
  for (let i = 0; i < W; i++) {
    const cj = BESOR.j + Math.round(Math.sin(i * 0.13) * 1.2 + Math.sin(i * 0.37 + 1) * 0.6);
    for (const j of [cj, cj + 1]) {
      if (!inb(i, j)) continue;
      const k = idx(i, j);
      if (i >= BESOR.fordI0 && i <= BESOR.fordI1) { height[k] = 0.5; type[k] = T.GRAVEL; path[k] = 1; tag[k] = 3; continue; } // the ford: walkable
      height[k] = 0.0; water[k] = 0.5; type[k] = T.GRAVEL; blocked[k] = 1;
    }
  }
  // the town well (water during the building phase)
  const WELL = { i: 52, j: 31 };

  // ---- tile types ----
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j); if (water[k] >= 0 || tag[k] === 3) continue;
    const n = fbm(i * 0.07, j * 0.07, 13), n3 = fbm(i * 0.21, j * 0.21, 31);
    let slope = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (town[k]) t = road[k] || Math.abs(i - TOWN.gateI) <= 1 ? T.PAVE : n3 > 0.6 ? T.SOIL : T.PATH;
    else if (road[k]) t = T.GRAVEL;
    else if (path[k]) t = T.PATH;
    else if (slope >= 1) t = n3 > 0.55 ? T.ROCK : T.LIME;
    else if (Math.abs(j - BESOR.j) < 4) t = n > 0.45 ? T.LUSH : T.GRASS;
    else if (j < 50) t = n > 0.6 ? T.GRASS : n3 > 0.66 ? T.SOIL : T.DRY;
    else t = n3 > 0.7 ? T.LIME : n > 0.5 ? T.SAND : T.DRY;
    type[k] = t;
  }

  // ---- features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields: [], npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: null, waterfall: null };
  const block = (i0, j0, w, d) => { for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) blocked[idx(i, j)] = 1; };

  // 시글락: walls with a north gate (Gath, Aphek) and a south gate (the Negev), corner and gate towers
  const gate = (i) => Math.abs(i - TOWN.gateI) <= 1;
  for (let i = TOWN.i0; i <= TOWN.i1; i++) for (const j of [TOWN.j0, TOWN.j1]) if (!gate(i)) { F.walls.push({ i, j, h: 2.0, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  for (let j = TOWN.j0 + 1; j < TOWN.j1; j++) for (const i of [TOWN.i0, TOWN.i1]) { F.walls.push({ i, j, h: 2.0, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  for (const [i, j] of [[TOWN.i0, TOWN.j0], [TOWN.i1, TOWN.j0], [TOWN.i0, TOWN.j1], [TOWN.i1, TOWN.j1], [TOWN.gateI - 2, TOWN.j0], [TOWN.gateI + 2, TOWN.j0], [TOWN.gateI - 2, TOWN.j1], [TOWN.gateI + 2, TOWN.j1]]) { F.towers.push({ i, j, h: 3.2, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  const house = (i0, j0, w, d, h, style) => { F.houses.push({ i0, j0, w, d, h, y: height[idx(i0, j0)], style }); block(i0, j0, w, d); };
  for (const [i0, j0, w, d, s] of [
    [46, 18, 3, 2, 1], [50, 18, 2, 2, 0], [46, 22, 2, 3, 0], [46, 34, 3, 3, 1], [50, 37, 3, 2, 0], [54, 37, 2, 2, 1],
    [66, 18, 2, 2, 0], [63, 37, 3, 2, 1], [67, 36, 2, 3, 0], [71, 35, 3, 3, 1], [72, 29, 3, 2, 0], [46, 27, 2, 2, 1],
    [66, 22, 4, 3, 2], // the storehouse (곳간)
  ]) house(i0, j0, w, d, 1.9 + (s ? 0.3 : 0), s);
  F.well = { i: WELL.i, j: WELL.j, y: height[idx(WELL.i, WELL.j)] }; blocked[idx(WELL.i, WELL.j)] = 1;
  F.torches.push({ i: 58.6, j: 14.6 }, { i: 61.4, j: 14.6 }, { i: 58.6, j: 41.4 }, { i: 61.4, j: 41.4 });
  F.props.push({ kind: 'hay', i: 69.4, j: 26.2 }, { kind: 'basket', i: 67.6, j: 26.4 }, { kind: 'hay', i: 70.6, j: 25.6 }, { kind: 'jar', i: 51, j: 30 }, { kind: 'jar', i: 53.2, j: 30.2 }, { kind: 'jar', i: 65.6, j: 25.4 });
  F.stalls.push({ i: 56, j: 23, color: 2 });
  // a fold for the flocks outside the east wall (27:9 is not turned into play; flocks come with the households)
  F.folds.push({ ci: 82, cj: 28, r: 2.6 });
  for (let a = 0; a < Math.PI * 2; a += 0.3) { if (Math.abs(a - Math.PI) < 0.4) continue; const x = 82 + Math.cos(a) * 2.6, z = 28 + Math.sin(a) * 2.6; F.walls.push({ x, z, h: 0.7, y: height[idx(Math.round(x), Math.round(z))], fold: true }); blocked[idx(Math.round(x), Math.round(z))] = 1; }
  // the Amalekite camp in the low ground beyond the ridge (seen, not entered)
  for (const [i0, j0, s] of [[50, 92, 0], [55, 94, 1], [61, 93, 0], [66, 92, 1], [70, 95, 0], [46, 95, 1], [58, 97, 0]]) F.tents.push({ i0, j0, w: 3, d: 2, style: s, y: height[idx(i0, j0)] });
  F.fires.push({ i: 59, j: 96 }, { i: 52, j: 96 }, { i: 67, j: 97 });

  // scattered tamarisks and olives; keep roads, banks and the town clear
  const nearRoad = (i, j, d) => roadLines.some((l) => l.some(([x, z]) => Math.hypot(x - i, z - j) < d));
  const clear = (i, j) => (i >= TOWN.i0 - 3 && i <= TOWN.i1 + 3 && j >= TOWN.j0 - 3 && j <= TOWN.j1 + 3) || Math.hypot((i - 82) / 4, (j - 28) / 4) < 1 || Math.hypot((i - 56) / 13, (j - 58) / 4) < 1 || Math.hypot((i - 64) / 11, (j - 68) / 4) < 1 || Math.hypot((i - 68) / 8, (j - 73) / 5) < 1 || j > 88;
  const tryTree = (i, j, kind, s) => {
    const k = idx(i, j);
    if (!inb(i, j) || water[k] >= 0 || path[k] || tag[k] || blocked[k] || clear(i, j) || nearRoad(i, j, 2.4)) return false;
    if (F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < 2.8)) return false;
    F.trees.push({ i, j, y: height[k], kind, s, seed: Math.floor(r() * 1e6) }); blocked[k] = 1; return true;
  };
  for (let n = 0; n < 2000 && F.trees.length < 26; n++) { const i = 2 + Math.floor(r() * (W - 4)), j = Math.abs(n % 2) ? BESOR.j - 5 + Math.floor(r() * 10) : 6 + Math.floor(r() * 82); tryTree(i, j, n % 3 ? 'olive' : 'terebinth', 0.8 + r() * 0.35); }
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j); if (water[k] >= 0 || path[k] || tag[k] || blocked[k] || town[k]) continue;
    if ((type[k] === T.DRY || type[k] === T.SAND || type[k] === T.LIME) && r() < 0.025) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.55 + r() * 0.5 });
  }
  roadLines.forEach((line) => { for (let n = 4; n < line.length - 1; n += 4) {
    const [x, z] = line[n], [x2, z2] = line[n + 1], dl = Math.hypot(x2 - x, z2 - z) || 1, nx = -(z2 - z) / dl, nz = (x2 - x) / dl;
    for (const side of [-1, 1]) { const i = x + nx * side * 1.75, j = z + nz * side * 1.75, ii = Math.round(i), jj = Math.round(j); if (inb(ii, jj) && !path[idx(ii, jj)] && !blocked[idx(ii, jj)] && water[idx(ii, jj)] < 0 && !town[idx(ii, jj)]) F.props.push({ kind: 'edgestone', i, j, seed: n * 2 + side }); }
  } });

  // play bounds; the camp beyond the ridge is out of reach (you watch it from the overlook)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < 3 || i > W - 3 || j < 8 || j > 89) blocked[idx(i, j)] = 1;

  // ---- layout (world units) ----
  const P = (i, j) => ({ x: i - W / 2, z: j - H / 2 });
  const ring = (ci, cj, n0, rad0, rx, rz, ok) => { const out = []; for (let n = 0; n < 80 && out.length < n0; n++) { const a = n * 2.399, rr = rad0 + Math.sqrt(n) * 1.1; const i = ci + Math.cos(a) * rr * rx, j = cj + Math.sin(a) * rr * rz; const k = idx(Math.round(i), Math.round(j)); if (inb(Math.round(i), Math.round(j)) && !blocked[k] && water[k] < 0 && ok(i, j)) out.push(P(i, j)); } return out; };
  const line = (ri, pred = () => true) => roadLines[ri].filter((_, n) => n % 2 === 0).filter(([i, j]) => pred(i, j)).map(([i, j]) => P(i, j));
  const workOffsets = { water: [[0.8, 1.2], [1.8, 0.2], [1.4, 2.0]], bread: [[-1, 1.4], [0.8, 1.6], [-0.2, 2.2]], watch: [[-0.8, 0.8], [0.8, 0.8], [-1.6, 1.4], [1.6, 1.4]] };
  const inTown = (i, j) => i > TOWN.i0 + 1.5 && i < TOWN.i1 - 1.5 && j > TOWN.j0 + 1.5 && j < TOWN.j1 - 1.5;
  const stop = {
    id: 'ziklag', name: '시글락', ref: '삼상 27:5–7',
    entry: P(60, 19), spring: P(52, 32.4), basket: P(68, 26.2), lookout: P(73.4, 19.4), rampBase: P(71.6, 21), fire: P(60, 29),
    roadStart: P(60, 9), exit: P(60, 11), exitRoad: [[60, 26], [60, 22.5], [60, 19], [60, 16], [60, 13.5], [60, 11]].map(([i, j]) => P(i, j)),
    waitSlots: [[57, 21], [63, 21], [55.4, 23.6], [64.6, 23.4], [58.4, 24.4], [61.6, 24.6]].map(([i, j]) => P(i, j)),
    restSlots: ring(60, 30, 40, 2.2, 1.35, 0.85, inTown),
    tentSpots: [[49.6, 25], [56, 34], [64, 33.6], [70.4, 32]].map(([i, j]) => ({ i, j })),
    fireSpots: [],
    where: { water: '서쪽 우물에서 떠 오세요', bread: '동쪽 곳간에서 가져오세요' },
    lookoutName: "북동쪽 성벽 망대", arrivals: 4, maxTime: 62, workOffsets,
    // after the call: David comes back to the north gate and finds the town burned (30:1–3)
    returnSpot: P(60, 12.6), griefSlots: ring(60, 13, 14, 1.4, 1.2, 0.6, (i, j) => j < 15.4 && j > 9),
    abiathar: P(57.6, 27.4), southGate: P(60, 41.5),
    // 브솔 시내 (30:9–10, 21–25)
    ford: P(60, 61.5), baggage: P(52, 58.6), staySlots: ring(52.5, 57.5, 12, 1.4, 1.5, 0.6, (i, j) => j < BESOR.j - 2 && j > 54), brookWater: P(66.5, 61),
    spoil: P(64, 57.6), returnFrom: P(61, 66.5), returnSlots: ring(66, 68, 18, 1.6, 1.4, 0.6, (i, j) => j > BESOR.j + 2 && j < 71),
    // the Egyptian in the field (30:11) and his way to the camp (30:16)
    egyptian: P(69.5, 73), guideRoad: line(2, (i, j) => j >= 73), overlook: P(60, 87.4), camp: P(CAMP.ci, CAMP.cj),
  };
  return { W, H, height, type, water, blocked, path, tag, features: F, spawn: [60, 19], idx, inb, layout: { stop } };
}
