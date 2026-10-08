// Act 2 map: three stops in the wilderness of Judah, west → east.
// 헤렛 수풀 (삼상 22:5), 그일라 (23:1–13), 엔게디 (23:29, 24). Positions and shapes are imagined;
// the text records the places, not their layout. Produces the same world shape as generateWorld().
import { T, fbm, rand } from './world.js';

export const HW = 150, HH = 80;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// zone anchors (tile coordinates)
export const FOREST = { ci: 26, cj: 44, rx: 13, rz: 10 };
export const TOWN = { i0: 64, i1: 86, j0: 30, j1: 50, gateJ: 40 };
export const ENGEDI = { cliffJ: 33, cave: { i0: 114, i1: 121, j0: 26, j1: 33 } };
const inCaveCols = (i) => i >= ENGEDI.cave.i0 - 2 && i <= ENGEDI.cave.i1 + 2;

function rawHeight(i, j) {
  const n = fbm(i * 0.04, j * 0.04, 61);
  let h = 1.6 + (n - 0.5) * 1.2;
  // low ridges between the stops so each feels like its own place
  h += smooth(4, 0, Math.abs(i - 52)) * (j < 38 || j > 52 ? 2.2 : 0);
  h += smooth(4, 0, Math.abs(i - 96)) * (j < 38 || j > 54 ? 2.4 : 0);
  // En-gedi cliffs on the north, sheer above the cave
  if (i > 98) {
    const cj = inCaveCols(i) ? ENGEDI.cliffJ + 0.5 : ENGEDI.cliffJ + 1.6 * Math.sin(i * 0.17) + 1.2 * Math.sin(i * 0.41 + 2);
    const w = inCaveCols(i) ? (j <= cj ? 1 : 0) : smooth(cj + 2, cj - 4, j);
    h = lerp(h, 8 + (fbm(i * 0.1, j * 0.1, 67) - 0.5) * 2, w * smooth(98, 104, i));
  }
  return h;
}

export function generateWilderness() {
  const W = HW, H = HH, N = W * H;
  const height = new Float32Array(N), type = new Uint8Array(N), water = new Float32Array(N).fill(-1);
  const blocked = new Uint8Array(N), path = new Uint8Array(N), tag = new Uint8Array(N), road = new Uint8Array(N), town = new Uint8Array(N);
  const idx = (i, j) => j * W + i, inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const q = (h) => Math.round(h * 2) / 2;
  const r = rand(4423);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);

  // ---- flatten the three camps ----
  const flatten = (ci, cj, rx, rz, level, feather = 5) => {
    for (let j = Math.floor(cj - rz - feather); j <= cj + rz + feather; j++) for (let i = Math.floor(ci - rx - feather); i <= ci + rx + feather; i++) {
      if (!inb(i, j)) continue;
      const d = Math.hypot((i - ci) / rx, (j - cj) / rz) - 1, w = smooth(feather / Math.max(rx, rz), 0, d);
      const k = idx(i, j); if (height[k] < 4.5) height[k] = lerp(height[k], level, w);
    }
  };
  flatten(FOREST.ci, FOREST.cj, FOREST.rx, FOREST.rz, 1.5);
  for (let j = TOWN.j0 - 2; j <= TOWN.j1 + 2; j++) for (let i = TOWN.i0 - 2; i <= TOWN.i1 + 2; i++) { height[idx(i, j)] = 1.5; if (i > TOWN.i0 && i < TOWN.i1 && j > TOWN.j0 && j < TOWN.j1) town[idx(i, j)] = 1; }
  flatten(119, 44, 16, 8, 1.5);

  // ---- En-gedi cave cut into the cliff ----
  const CV = ENGEDI.cave;
  for (let j = CV.j0; j <= CV.j1 + 1; j++) for (let i = CV.i0; i <= CV.i1; i++) {
    const ci = (CV.i0 + CV.i1) / 2, inner = Math.abs(i - ci) / ((CV.i1 - CV.i0) / 2) + Math.max(0, (CV.j1 - j) - 5) * 0.25;
    if (inner > 1.05 && j < CV.j1 - 1) continue;
    height[idx(i, j)] = 1.5; tag[idx(i, j)] = 2;
  }

  // ---- lookout knolls with ramps (헤렛, 엔게디) ----
  const knoll = (ci, cj, rad, top, from) => {
    for (let j = cj - rad - 1; j <= cj + rad + 1; j++) for (let i = ci - rad - 1; i <= ci + rad + 1; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) <= rad + 0.3) height[idx(i, j)] = top;
    for (let s = 0; s <= 16; s++) {
      const t = s / 16, x = lerp(from[0], ci, t), z = lerp(from[1], cj, t), hh = lerp(1.5, top, t);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.3) { height[idx(i, j)] = hh; path[idx(i, j)] = 1; } }
    }
  };
  knoll(38, 31, 3, 3.5, [33, 37]);
  knoll(134, 36, 3, 3.5, [128, 42]);

  // ---- roads ----
  const ROADS = [
    [[22, 70], [22, 62], [23, 55]],                       // arrival into 헤렛 from the south (from 아둘람)
    [[30, 46], [37, 47], [44, 48], [52, 46], [58, 42], [63, 40]], // 헤렛 → 그일라 west gate
    [[26, 18], [26, 26], [26, 31]],                       // newcomers into the forest from the north
    [[87, 40], [93, 43], [99, 47], [104, 48]],            // 그일라 east gate → 엔게디
    [[147, 48], [138, 47], [128, 46], [121, 41], [118, 36], [117.5, 34]], // road to the cave by the sheepfold (Saul's way)
  ];
  const roadLines = ROADS.map(() => []);
  ROADS.forEach((pts, ri) => { for (let s = 0; s < pts.length - 1; s++) {
    const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) {
      const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); roadLines[ri].push([x, z]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.2 && !tag[idx(i, j)]) { path[idx(i, j)] = 1; road[idx(i, j)] = 1; height[idx(i, j)] = Math.min(height[idx(i, j)], 2); } }
    }
  } });
  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  for (let k = 0; k < N; k++) if (tag[k] === 2) height[k] = 1.5;
  for (let pass = 0; pass < 4; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = idx(i, j); if (!path[k]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = idx(i + di, j + dj); if (path[kk] && height[kk] - height[k] > 0.5) height[kk] = height[k] + 0.5; }
  }

  // ---- water: forest spring, En-gedi spring under a waterfall ----
  const pool = (ci, cj, rad, level, bed) => { for (let j = Math.floor(cj - rad); j <= cj + rad; j++) for (let i = Math.floor(ci - rad); i <= ci + rad; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) <= rad) { const k = idx(i, j); height[k] = bed; water[k] = level; type[k] = T.GRAVEL; blocked[k] = 1; } };
  const brook = (pts) => { for (let s = 0; s < pts.length - 1; s++) { const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let k = 0; k <= n; k++) { const i = Math.round(lerp(a[0], b[0], k / n)), j = Math.round(lerp(a[1], b[1], k / n)); if (!inb(i, j) || road[idx(i, j)]) continue; const kk = idx(i, j); height[kk] = 0.5; water[kk] = 1.0; type[kk] = T.GRAVEL; blocked[kk] = 1; } } };
  pool(14, 46, 2.4, 1.2, 0.5); brook([[13, 48], [11, 55], [9, 63], [8, 72]]);
  pool(106, 36.5, 2.3, 1.2, 0.5); brook([[105, 39], [103, 45], [101, 52], [100, 60], [99, 70]]);

  // ---- tile types ----
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j); if (water[k] >= 0) continue;
    const n = fbm(i * 0.07, j * 0.07, 11), n3 = fbm(i * 0.21, j * 0.21, 29);
    let slope = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (tag[k] === 2) t = T.SOIL;
    else if (town[k]) t = road[k] || Math.abs(j - TOWN.gateJ) <= 1 ? T.PAVE : n3 > 0.62 ? T.SOIL : T.PATH;
    else if (road[k]) t = T.GRAVEL;
    else if (path[k]) t = T.PATH;
    else if (height[k] >= 5 || slope >= 1) t = n3 > 0.55 ? T.ROCK : T.LIME;
    else if (i < 50) t = Math.hypot((i - FOREST.ci) / FOREST.rx, (j - FOREST.cj) / FOREST.rz) < 0.35 ? (n3 > 0.5 ? T.SOIL : T.PATH) : n > 0.45 ? T.LUSH : T.GRASS;
    else if (i < 98) t = n > 0.55 ? T.GRASS : T.DRY;
    else t = Math.hypot(i - 106, j - 38) < 7 ? T.LUSH : n3 > 0.66 ? T.LIME : n > 0.5 ? T.SAND : T.DRY;
    type[k] = t;
  }
  // threshing floors outside the town
  const fields = [{ i0: 66, j0: 52, w: 6, d: 4 }, { i0: 76, j0: 53, w: 6, d: 4 }];

  // ---- features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields, npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: { ...CV }, waterfall: null };
  const block = (i0, j0, w, d) => { for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) blocked[idx(i, j)] = 1; };

  // 그일라: walls with west/east gates, corner towers, houses around a square
  const gate = (i, j) => Math.abs(j - TOWN.gateJ) <= 1 && (i === TOWN.i0 || i === TOWN.i1);
  for (let i = TOWN.i0; i <= TOWN.i1; i++) for (const j of [TOWN.j0, TOWN.j1]) { F.walls.push({ i, j, h: 2.2, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  for (let j = TOWN.j0 + 1; j < TOWN.j1; j++) for (const i of [TOWN.i0, TOWN.i1]) if (!gate(i, j)) { F.walls.push({ i, j, h: 2.2, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  for (const [i, j] of [[TOWN.i0, TOWN.j0], [TOWN.i1, TOWN.j0], [TOWN.i0, TOWN.j1], [TOWN.i1, TOWN.j1], [TOWN.i0, TOWN.gateJ - 2], [TOWN.i0, TOWN.gateJ + 2], [TOWN.i1, TOWN.gateJ - 2], [TOWN.i1, TOWN.gateJ + 2]]) { F.towers.push({ i, j, h: 3.4, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  const house = (i0, j0, w, d, h, style) => { F.houses.push({ i0, j0, w, d, h, y: height[idx(i0, j0)], style }); block(i0, j0, w, d); };
  for (const [i0, j0, w, d, s] of [[66, 32, 3, 2, 1], [70, 32, 2, 2, 0], [66, 45, 3, 3, 1], [70, 47, 3, 2, 0], [80, 46, 3, 3, 1], [83, 43, 2, 3, 0], [66, 35, 2, 2, 0], [84, 32, 1, 2, 0], [74, 47, 2, 2, 1]]) house(i0, j0, w, d, 1.9 + (s ? 0.3 : 0), s);
  F.well = { i: 72, j: 44, y: height[idx(72, 44)] }; blocked[idx(72, 44)] = 1;
  F.torches.push({ i: 62.6, j: 38.6 }, { i: 62.6, j: 41.4 }, { i: 87.4, j: 38.6 }, { i: 87.4, j: 41.4 });
  F.props.push({ kind: 'hay', i: 80.5, j: 35.2 }, { kind: 'hay', i: 81.6, j: 36.4 }, { kind: 'basket', i: 79, j: 34.6 }, { kind: 'jar', i: 71, j: 43.2 }, { kind: 'jar', i: 73.2, j: 43 });
  F.stalls.push({ i: 77, j: 38, color: 1 });

  // 엔게디: waterfall from the cliff, palms by the spring, a sheepfold by the road below the cave
  F.waterfall = { x: 106, zTop: 34, top: 7.6, bottom: 1.3 };
  F.folds.push({ ci: 110, cj: 38, r: 2.2 });
  for (let a = 0; a < Math.PI * 2; a += 0.32) { if (Math.abs(a - 0.2) < 0.45) continue; const x = 110 + Math.cos(a) * 2.2, z = 38 + Math.sin(a) * 2.2; F.walls.push({ x, z, h: 0.7, y: height[idx(Math.round(x), Math.round(z))], fold: true }); blocked[idx(Math.round(x), Math.round(z))] = 1; }
  F.torches.push({ i: 113.4, j: 34.6 }, { i: 121.6, j: 34.6 });

  // trees: thick forest around 헤렛, palms at 엔게디, scattered terebinths elsewhere
  const clear = (i, j) => {
    if (Math.hypot((i - FOREST.ci) / FOREST.rx, (j - FOREST.cj) / FOREST.rz) < 1) return true;
    if (i >= TOWN.i0 - 2 && i <= TOWN.i1 + 2 && j >= TOWN.j0 - 2 && j <= TOWN.j1 + 2) return true;
    if (Math.hypot((i - 119) / 16, (j - 44) / 8) < 1) return true;
    return false;
  };
  const nearRoad = (i, j, d) => roadLines.some((l) => l.some(([x, z]) => Math.hypot(x - i, z - j) < d));
  const tryTree = (i, j, kind, s) => {
    const k = idx(i, j);
    if (!inb(i, j) || water[k] >= 0 || path[k] || tag[k] || blocked[k] || clear(i, j) || nearRoad(i, j, 2.4)) return false;
    if (F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < (kind === 'palm' ? 2.2 : 2.6))) return false;
    F.trees.push({ i, j, y: height[k], kind, s, seed: Math.floor(r() * 1e6) }); blocked[k] = 1; return true;
  };
  for (let n = 0; n < 4000 && F.trees.length < 120; n++) { const i = 2 + Math.floor(r() * 50), j = 18 + Math.floor(r() * 56); tryTree(i, j, r() < 0.7 ? 'terebinth' : 'olive', 0.95 + r() * 0.35); }
  const forestCount = F.trees.length;
  for (let n = 0; n < 900 && F.trees.length < forestCount + 26; n++) { const i = 54 + Math.floor(r() * 44), j = 20 + Math.floor(r() * 56); if (height[idx(i, j)] < 4) tryTree(i, j, 'olive', 0.8 + r() * 0.3); }
  const palmBase = F.trees.length;
  for (let n = 0; n < 900 && F.trees.length < palmBase + 22; n++) { const a = r() * Math.PI * 2, rr = 3 + r() * 9; const i = Math.round(106 + Math.cos(a) * rr * 1.2), j = Math.round(42 + Math.sin(a) * rr * 0.7); if (j > 35 && height[idx(i, j)] < 3) tryTree(i, j, 'palm', 0.9 + r() * 0.3); }
  for (let n = 0; n < 600 && F.trees.length < palmBase + 34; n++) { const i = 126 + Math.floor(r() * 20), j = 50 + Math.floor(r() * 22); tryTree(i, j, 'palm', 0.85 + r() * 0.3); }
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j); if (water[k] >= 0 || path[k] || tag[k] || blocked[k]) continue;
    if ((type[k] === T.ROCK || type[k] === T.LIME) && r() < 0.06) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.6 + r() * 0.5 });
  }
  // edge stones along the roads
  roadLines.forEach((line) => { for (let n = 4; n < line.length - 1; n += 4) {
    const [x, z] = line[n], [x2, z2] = line[n + 1], dl = Math.hypot(x2 - x, z2 - z) || 1, nx = -(z2 - z) / dl, nz = (x2 - x) / dl;
    for (const side of [-1, 1]) { const i = x + nx * side * 1.75, j = z + nz * side * 1.75, ii = Math.round(i), jj = Math.round(j); if (inb(ii, jj) && !path[idx(ii, jj)] && !blocked[idx(ii, jj)] && water[idx(ii, jj)] < 0 && !town[idx(ii, jj)]) F.props.push({ kind: 'edgestone', i, j, seed: n * 2 + side }); }
  } });
  F.props.push({ kind: 'basket', i: 33.4, j: 37.6 }, { kind: 'hay', i: 34.8, j: 37 }, { kind: 'jar', i: 15.8, j: 43.6 }, { kind: 'basket', i: 126.6, j: 40.4 }, { kind: 'jar', i: 108.4, j: 39.4 });

  // play bounds: the whole valley, minus a margin
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < 3 || i > W - 3 || j < 14 || j > H - 6) blocked[idx(i, j)] = 1;

  // ---- per-stop layouts (world units) ----
  const P = (i, j) => ({ x: i - W / 2, z: j - H / 2 });
  const ring = (ci, cj, n0, rad0, rx, rz, ok) => { const out = []; for (let n = 0; n < 60 && out.length < n0; n++) { const a = n * 2.399, rr = rad0 + Math.sqrt(n) * 1.1; const i = ci + Math.cos(a) * rr * rx, j = cj + Math.sin(a) * rr * rz; const k = idx(Math.round(i), Math.round(j)); if (inb(Math.round(i), Math.round(j)) && !blocked[k] && water[k] < 0 && ok(i, j)) out.push(P(i, j)); } return out; };
  const line = (ri, pred = () => true) => roadLines[ri].filter((_, n) => n % 2 === 0).filter(([i, j]) => pred(i, j)).map(([i, j]) => P(i, j));
  const workOffsets = { water: [[0.6, 1.4], [1.8, 0.4], [1.4, 2.2]], bread: [[-1, 0.6], [0.8, 1.2], [-0.2, 1.8]], watch: [[-0.8, -0.6], [0.8, -0.8], [-1.2, 0.8], [1.2, 0.6]] };
  const stops = [
    {
      id: 'herut', name: '헤렛 수풀', ref: '삼상 22:5',
      entry: P(23, 56), spring: P(16.6, 46), basket: P(33, 38.6), lookout: P(38, 31), rampBase: P(33, 37), fire: P(26, 44),
      roadStart: P(26, 20), exit: P(46, 48), exitRoad: line(1, (i) => i <= 46.5),
      waitSlots: [[22, 34], [25, 33.4], [28.4, 33.6], [20, 35.6], [31, 34.6], [23.4, 36]].map(([i, j]) => P(i, j)),
      restSlots: ring(26, 45, 36, 2.4, 1.3, 0.8, (i, j) => Math.hypot((i - 26) / 12, (j - 44) / 9) < 1),
      tentSpots: [[20, 41], [31, 42], [21, 49], [30, 49.6], [25.6, 51.4], [17.6, 45]].map(([i, j]) => ({ i, j })),
      fireSpots: [[21.6, 45.4], [30.4, 45.6]].map(([i, j]) => ({ i, j })),
      where: { water: '서쪽 샘에서 떠 오세요', bread: '북동쪽 떡 바구니에서 가져오세요' },
      lookoutName: '북동쪽 언덕', arrivals: 3, rate: 2.6, maxTime: 55, workOffsets,
    },
    {
      id: 'keilah', name: '그일라', ref: '삼상 23:1–13',
      entry: P(60.5, 40), spring: P(72, 45.4), basket: P(79.4, 36), lookout: P(84.4, 34), rampBase: P(83, 35.4), fire: P(75, 40.5),
      roadStart: P(77, 49), exit: P(90, 40.6), exitRoad: [P(78, 40), P(81, 40), P(84, 40), P(87, 40), P(90, 40.6)],
      waitSlots: [[72.6, 38.4], [77.6, 42.6], [70.6, 41], [79.6, 40], [74, 36.6], [76, 44]].map(([i, j]) => P(i, j)),
      restSlots: ring(75, 40.5, 30, 2, 1.25, 0.85, (i, j) => i > 66.5 && i < 84 && j > 33 && j < 46),
      tentSpots: [[68.6, 39.6], [81.6, 38.6], [68.6, 42.6]].map(([i, j]) => ({ i, j })),
      fireSpots: [[80.6, 43.4]].map(([i, j]) => ({ i, j })),
      where: { water: '광장 남쪽 우물에서 떠 오세요', bread: '북동쪽 타작마당에서 가져오세요' },
      lookoutName: '북동쪽 성벽 망대', arrivals: 3, rate: 2.2, maxTime: 55, workOffsets,
    },
    {
      id: 'engedi', name: '엔게디', ref: '삼상 23:29, 24:1–22',
      entry: P(103, 48), spring: P(107.4, 39.4), basket: P(126, 41.6), lookout: P(134, 36), rampBase: P(128, 42), fire: P(119, 43),
      roadStart: P(146, 48), exit: null, exitRoad: [],
      waitSlots: [[129.6, 47.4], [132.6, 46], [127, 48.6], [135, 47.6]].map(([i, j]) => P(i, j)),
      restSlots: ring(118, 44.5, 30, 2.2, 1.4, 0.7, (i, j) => Math.hypot((i - 119) / 14, (j - 44) / 7) < 1),
      caveSlots: [], caveMouth: P(117.5, 34.6), cave: P(117.5, 30), saulStart: P(134, 46.6), saulSpot: P(117.5, 35.2),
      saulRoad: line(4, (i) => i <= 134),
      tentSpots: [[112, 45], [124, 45.6], [115.6, 48], [121.6, 48.4]].map(([i, j]) => ({ i, j })),
      fireSpots: [[113.6, 42.4]].map(([i, j]) => ({ i, j })),
      where: { water: '서쪽 폭포 아래 샘에서 떠 오세요', bread: '동쪽 떡 바구니에서 가져오세요' },
      lookoutName: '동쪽 들염소 바위', arrivals: 2, rate: 3, maxTime: 48, workOffsets,
    },
  ];
  // hiding places deep in the cave (24:3 "그 굴 깊은 곳")
  for (let j = CV.j0 + 1.4; j <= CV.j1 - 2.4; j += 1.2) for (let i = CV.i0 + 1.2; i <= CV.i1 - 1.2; i += 1.2) if (tag[idx(Math.round(i), Math.round(j))] === 2) stops[2].caveSlots.push(P(i, j));

  return { W, H, height, type, water, blocked, path, tag, features: F, spawn: [23, 56], idx, inb, layout: { stops } };
}
