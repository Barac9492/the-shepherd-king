// Act 1 map: the cave of Adullam in the Shephelah hills. Layout is imagined; the text records only "아둘람 굴" (삼상 22:1).
// Produces the same world shape as generateWorld() so scene.js can build it unchanged.
import { T, fbm, rand } from './world.js';

export const AW = 100, AH = 84;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const ridgeJ = (i) => 37 + 3.2 * Math.sin(i * 0.085) + 1.6 * Math.sin(i * 0.23 + 1);
export const CAVE = { i0: 45, i1: 54, j0: 30, j1: 37 };
const PLAZA = { i0: 38, i1: 64, j0: 38, j1: 51 };
const inCaveCols = (i) => i >= CAVE.i0 - 3 && i <= CAVE.i1 + 3;

function rawHeight(i, j) {
  const n = fbm(i * 0.035, j * 0.035, 41);
  let h = 1.7 + (n - 0.5) * 1.1;
  // southern valley falls gently toward the brook
  h -= smooth(55, 80, j) * 0.4;
  // the ridge with the cave: a sheer face right above the camp, a slope elsewhere
  const rj = inCaveCols(i) ? 37.5 : ridgeJ(i);
  const hill = 8 + (fbm(i * 0.09, j * 0.09, 43) - 0.5) * 2.2 + smooth(20, 4, j) * 2.5;
  const w = inCaveCols(i) ? (j <= rj ? 1 : 0) : smooth(rj + 2.5, rj - 4.5, j);
  h = lerp(h, hill, w);
  return h;
}

export function generateAdullam() {
  const W = AW, H = AH, N = W * H;
  const height = new Float32Array(N), type = new Uint8Array(N), water = new Float32Array(N).fill(-1);
  const blocked = new Uint8Array(N), path = new Uint8Array(N), tag = new Uint8Array(N);
  const idx = (i, j) => j * W + i, inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const q = (h) => Math.round(h * 2) / 2;
  const r = rand(2201);

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);
  // camp plaza in front of the cave mouth, feathered into the valley
  for (let j = 34; j < 58; j++) for (let i = 30; i < 74; i++) {
    const k = idx(i, j);
    if (j <= 37 && inCaveCols(i)) continue;
    const dx = Math.max(PLAZA.i0 - i, 0, i - PLAZA.i1), dz = Math.max(PLAZA.j0 - j, 0, j - PLAZA.j1);
    const w = smooth(5, 0, Math.hypot(dx, dz));
    if (height[k] < 4) height[k] = lerp(height[k], 1.5, w);
  }
  // cave floor
  for (let j = CAVE.j0; j <= CAVE.j1; j++) for (let i = CAVE.i0; i <= CAVE.i1; i++) {
    const ci = (CAVE.i0 + CAVE.i1) / 2, inner = Math.abs(i - ci) / ((CAVE.i1 - CAVE.i0) / 2) + Math.max(0, (CAVE.j1 - j) - 5) * 0.25;
    if (inner > 1.05 && j < CAVE.j1 - 1) continue; // rounded back corners
    height[idx(i, j)] = 1.5; tag[idx(i, j)] = 2;
  }
  // lookout spur east of the cave, reached by a ramp from the plaza
  const LOOK = [73, 41];
  for (let j = LOOK[1] - 4; j <= LOOK[1] + 4; j++) for (let i = LOOK[0] - 4; i <= LOOK[0] + 4; i++) if (Math.hypot(i - LOOK[0], j - LOOK[1]) <= 3.3) height[idx(i, j)] = 4;
  const ramp = [[64, 48], [71, 43]];
  for (let s = 0; s <= 16; s++) {
    const t = s / 16, x = lerp(ramp[0][0], ramp[1][0], t), z = lerp(ramp[0][1], ramp[1][1], t), hh = lerp(1.5, 4, t);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (Math.hypot(i - x, j - z) < 1.3) { height[idx(i, j)] = Math.max(hh, Math.min(height[idx(i, j)], hh)); path[idx(i, j)] = 1; } }
  }
  // roads: arrivals from the east, the way out to the south (toward 헤렛)
  const PATHS = [
    [[97, 55], [88, 54], [80, 52], [72, 50], [65, 49]],
    [[48, 51], [47, 58], [44, 65], [42, 72], [41, 82]],
  ];
  const road = new Uint8Array(N), roadLine = [];
  PATHS.forEach((pts, pi) => { for (let s = 0; s < pts.length - 1; s++) {
    const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) {
      const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n);
      if (pi === 1) roadLine.push([x, z]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.2 && !tag[idx(i, j)]) { path[idx(i, j)] = 1; if (pi === 1) road[idx(i, j)] = 1; height[idx(i, j)] = Math.min(height[idx(i, j)], 2); } }
    }
  } });
  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  for (let k = 0; k < N; k++) if (tag[k] === 2) height[k] = 1.5;
  // smooth any road/plaza step that the quantiser made too steep
  for (let pass = 0; pass < 3; pass++) for (let j = 30; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = idx(i, j);
    if (!path[k]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = idx(i + di, j + dj); if (path[kk] && height[kk] - height[k] > 0.5) height[kk] = height[k] + 0.5; }
  }

  // spring pool west of the camp, with a brook running south-west
  const pool = (ci, cj, rad, level, bed) => { for (let j = Math.floor(cj - rad); j <= cj + rad; j++) for (let i = Math.floor(ci - rad); i <= ci + rad; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) <= rad) { const k = idx(i, j); height[k] = bed; water[k] = level; type[k] = T.GRAVEL; blocked[k] = 1; } };
  const SPRING = [33, 45];
  pool(SPRING[0], SPRING[1], 2.6, 1.2, 0.5);
  const brook = [[32, 47], [29, 53], [26, 60], [24, 68], [21, 76], [19, 84]];
  for (let s = 0; s < brook.length - 1; s++) {
    const [a, b] = [brook[s], brook[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) { const i = Math.round(lerp(a[0], b[0], k / n)), j = Math.round(lerp(a[1], b[1], k / n)); if (!inb(i, j)) continue; const kk = idx(i, j); height[kk] = 0.5; water[kk] = 1.0; type[kk] = T.GRAVEL; blocked[kk] = 1; }
  }

  // tile types
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j);
    if (water[k] >= 0) continue;
    const n = fbm(i * 0.07, j * 0.07, 11), n3 = fbm(i * 0.21, j * 0.21, 29);
    let slope = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (tag[k] === 2) t = T.SOIL;
    else if (road[k]) t = T.GRAVEL;
    else if (path[k]) t = T.PATH;
    else if (height[k] >= 5 || slope >= 1) t = n3 > 0.55 ? T.ROCK : T.LIME;
    else if (i >= PLAZA.i0 && i <= PLAZA.i1 && j >= PLAZA.j0 && j <= PLAZA.j1) { const dF = Math.hypot((i - 50) * 0.8, j - 43); t = dF < 3.2 + n3 * 2 ? (n3 > 0.5 ? T.SOIL : T.PATH) : n > 0.58 ? T.GRASS : T.DRY; }
    else if (Math.hypot(i - SPRING[0], j - SPRING[1]) < 6) t = T.LUSH;
    else if (n3 > 0.74) t = T.LIME;
    else t = n > 0.5 ? T.DRY : T.GRASS;
    type[k] = t;
  }

  // ---- features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields: [], npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: { ...CAVE }, waterfall: null };
  const nearCamp = (i, j) => i > 26 && i < 86 && j > 32 && j < 66;
  for (let n = 0; n < 900 && F.trees.length < 70; n++) {
    const i = 4 + Math.floor(r() * (W - 8)), j = 4 + Math.floor(r() * (H - 8)), k = idx(i, j);
    if (water[k] >= 0 || path[k] || tag[k] || blocked[k] || nearCamp(i, j)) continue;
    if (roadLine.some(([x, z]) => Math.hypot(x - i, z - j) < 4.5)) continue;
    if (height[k] >= 6 && r() < 0.7) continue;
    if (F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < 3.2)) continue;
    F.trees.push({ i, j, y: height[k], kind: r() < 0.55 ? 'terebinth' : 'olive', s: 0.8 + r() * 0.4, seed: Math.floor(r() * 1e6) });
    blocked[k] = 1;
  }
  // a few trees that frame the camp
  for (const [i, j] of [[36, 40], [30, 50], [70, 37], [80, 47], [27, 42]]) { const k = idx(i, j); if (water[k] < 0 && !path[k]) { F.trees.push({ i, j, y: height[k], kind: 'terebinth', s: 1.05, seed: i * 97 + j }); blocked[k] = 1; } }
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j);
    if (water[k] >= 0 || path[k] || tag[k] || blocked[k]) continue;
    if ((type[k] === T.ROCK || type[k] === T.LIME) && r() < 0.06) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.6 + r() * 0.5 });
  }
  for (let n = 4; n < roadLine.length - 1; n += 3) {
    const [x, z] = roadLine[n], [x2, z2] = roadLine[n + 1], dl = Math.hypot(x2 - x, z2 - z) || 1, nx = -(z2 - z) / dl, nz = (x2 - x) / dl;
    for (const side of [-1, 1]) { const i = x + nx * side * 1.75, j = z + nz * side * 1.75, k = idx(Math.round(i), Math.round(j)); if (inb(Math.round(i), Math.round(j)) && !path[k] && water[k] < 0) F.props.push({ kind: 'edgestone', i, j, seed: n * 2 + side }); }
  }
  F.torches.push({ i: 39.4, j: 73.6 }, { i: 44.6, j: 73.2 });
  F.props.push({ kind: 'jar', i: 35.6, j: 43.4 }, { kind: 'jar', i: 36.1, j: 44.1 }, { kind: 'basket', i: 59.4, j: 40.6 }, { kind: 'hay', i: 61, j: 40 });

  // play bounds: keep David inside the camp valley
  const B = { i0: 24, i1: 84, j0: 30, j1: 80 };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < B.i0 || i > B.i1 || j < B.j0 || j > B.j1) blocked[idx(i, j)] = 1;

  const x = (i) => i - W / 2, z = (j) => j - H / 2, P = (i, j) => ({ x: x(i), z: z(j) });
  const layout = {
    spring: P(36, 45), rampBase: P(64, 48), basket: P(59, 41.5), fire: P(50, 43), lookout: P(73, 41), cave: P(50, 33),
    roadStart: P(95, 55), exit: P(42, 74), gadStart: P(95, 55),
    exitRoad: roadLine.filter((_, n) => n % 2 === 0).map(([i, j]) => P(i, j)).filter((p) => p.z <= 74 - H / 2 + 0.5),
    waitSlots: [[70, 53], [72.5, 55], [75, 53.5], [69.5, 56], [73, 57.5], [76.5, 56.5], [67.5, 54.5], [78, 54]].map(([i, j]) => P(i, j)),
    restSlots: [],
    workOffsets: { water: [[0.6, 1.4], [1.8, 0.4], [1.4, 2.2]], bread: [[-1, 0.6], [0.8, 1.2], [-0.2, 1.8]], watch: [[-0.8, -0.6], [0.8, -0.8], [-1.2, 0.8], [1.2, 0.6]] },
  };
  // rest slots: in the cave first, then around the fires in the plaza
  for (let j = CAVE.j0 + 2; j <= CAVE.j1; j += 1.4) for (let i = CAVE.i0 + 1.5; i <= CAVE.i1 - 1.5; i += 1.5) if (tag[idx(Math.round(i), Math.round(j))] === 2) layout.restSlots.push(P(i, j));
  for (let n = 0; n < 40; n++) { const a = n * 2.399, rr = 2.2 + Math.sqrt(n) * 1.15; const i = 50 + Math.cos(a) * rr * 1.35, j = 45 + Math.sin(a) * rr * 0.75; if (i > 39 && i < 62 && j > 38.5 && j < 51) layout.restSlots.push(P(i, j)); }
  // growth: tent and fire spots that appear as the camp fills
  layout.tentSpots = [[41, 41], [44, 47.5], [56, 47.5], [41, 49], [61, 44.5], [53, 50], [46, 51], [39, 45]].map(([i, j]) => ({ i, j }));
  layout.fireSpots = [[44, 44], [56, 44], [50, 49]].map(([i, j]) => ({ i, j }));

  return { W, H, height, type, water, blocked, path, tag, features: F, spawn: [50, 42], idx, inb, layout };
}
