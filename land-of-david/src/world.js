// Pure world generation (no three.js) so it can be tested in node.
// Tile coordinates: i = west->east, j = north->south. One tile = one world unit.

export const W = 140;
export const H = 100;
export const T = { GRASS: 0, DRY: 1, SOIL: 2, PATH: 3, LIME: 4, ROCK: 5, SAND: 6, GRAVEL: 7, PAVE: 8, LUSH: 9, FIELD: 10 };
export const STEP = 0.55; // max walkable height change between tiles

function hash(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 1) {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < 4; o++) { t += vnoise(x * f, y * f, s + o * 17) * a; n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
export function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const brookX = (j) => 22 + 2.5 * Math.sin(j * 0.07);
const cliffJ = (i) => 50 + 2 * Math.sin(i * 0.3);

function rawHeight(i, j) {
  const n1 = fbm(i * 0.045, j * 0.045, 1);
  let h = 3.6 + (n1 - 0.5) * 3.4;
  // Jerusalem ridge
  const dJ = Math.hypot(i - 70, (j - 18) * 1.1);
  h = Math.max(h, 6.5 - Math.max(0, dJ - 12) * 0.3);
  // Bethlehem hill
  const dB = Math.hypot(i - 70, j - 60);
  h = lerp(h, 4.5, smooth(17, 9, dB));
  // Fields, gently falling to the south
  if (j > 66) {
    const w = smooth(28, 16, Math.abs(i - 72)) * smooth(66, 74, j);
    h = lerp(h, 4.2 - (j - 70) * 0.05 + (fbm(i * 0.09, j * 0.09, 7) - 0.5) * 1.4, w * 0.9);
  }
  // Valley of Elah (runs north-south between two hills)
  const v = Math.abs(i - brookX(j));
  const valley = 0.5 + smooth(3.5, 15, v) * 4.8 + (fbm(i * 0.1, j * 0.1, 3) - 0.5) * 0.9 * smooth(4, 9, v);
  const wE = smooth(48, 38, i) * smooth(28, 40, j) * smooth(98, 88, j);
  h = lerp(h, valley, wE);
  // Wilderness of En Gedi descending to the Dead Sea
  const wD = smooth(90, 100, i);
  if (wD > 0) {
    const nd = fbm(i * 0.08, j * 0.08, 5);
    let d = 4.6 + (nd - 0.5) * 1.4;
    d = lerp(d, 1.5 + (nd - 0.5) * 0.4, smooth(104, 113, i));
    d = lerp(d, 0.6, smooth(124, 130, i));
    if (i > 106 && j < cliffJ(i)) d = 7.5 + nd * 1.2; // the cliffs
    h = lerp(h, d, wD);
  }
  return h;
}

export function generateWorld() {
  const N = W * H;
  const height = new Float32Array(N);
  const type = new Uint8Array(N);
  const water = new Float32Array(N).fill(-1); // water surface level, -1 = none
  const blocked = new Uint8Array(N);
  const path = new Uint8Array(N);
  const tag = new Uint8Array(N); // 1 = town paving, 2 = cave
  const idx = (i, j) => j * W + i;
  const inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);

  const fillRect = (i0, j0, i1, j1, h, t) => { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inb(i, j)) { height[idx(i, j)] = h; if (t) tag[idx(i, j)] = t; } };
  const fillDisk = (ci, cj, r, h) => { for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) <= r) height[idx(i, j)] = h; };
  const q = (h) => Math.round(h * 2) / 2;

  // Flattened sites
  fillRect(58, 7, 82, 29, 6.5, 1); // Jerusalem
  fillRect(61, 52, 79, 68, 4.5, 1); // Bethlehem
  fillDisk(37, 58, 6, q(height[idx(37, 58)]));
  fillDisk(7, 58, 6, q(height[idx(7, 58)]));
  fillDisk(80, 86, 4, q(height[idx(80, 86)]));
  fillDisk(62, 90, 4, q(height[idx(62, 90)]));
  // En Gedi oasis floor
  for (let j = 50; j < 72; j++) for (let i = 110; i < 126; i++) { const k = idx(i, j); if (j >= cliffJ(i)) height[k] = Math.min(height[k], 1.5); }
  // Cave cut into the cliff
  fillRect(123, 44, 125, 49, 1.5, 2);
  fillRect(122, 44, 126, 46, 1.5, 2);

  // Paths with slope-limited profiles
  const PATHS = [
    [[70, 52], [70, 46], [67, 40], [69, 34], [70, 29]],
    [[61, 60], [54, 61], [47, 59], [41, 58], [37, 58]],
    [[34, 61], [28, 64], [22, 64], [16, 62], [10, 59], [7, 58]],
    [[79, 60], [86, 62], [94, 64], [102, 64], [108, 63], [113, 60], [118, 58], [122, 56], [124, 53]],
    [[70, 68], [71, 74], [74, 80], [78, 85]],
    [[74, 80], [68, 86], [63, 88]],
  ];
  for (const pts of PATHS) {
    const samples = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const [a, b] = [pts[s], pts[s + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(len * 2);
      for (let k = 0; k < n; k++) { const t = k / n; samples.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); }
    }
    samples.push(pts[pts.length - 1]);
    let hs = samples.map(([x, z]) => height[idx(Math.round(x), Math.round(z))]);
    // smooth
    for (let pass = 0; pass < 3; pass++) hs = hs.map((_, k) => { let s = 0, c = 0; for (let d = -4; d <= 4; d++) { const m = hs[k + d]; if (m !== undefined) { s += m; c++; } } return s / c; });
    hs[0] = height[idx(Math.round(samples[0][0]), Math.round(samples[0][1]))];
    hs[hs.length - 1] = height[idx(Math.round(samples.at(-1)[0]), Math.round(samples.at(-1)[1]))];
    const lim = 0.17; // per half-tile sample
    for (let pass = 0; pass < 4; pass++) {
      for (let k = 1; k < hs.length; k++) hs[k] = Math.min(Math.max(hs[k], hs[k - 1] - lim), hs[k - 1] + lim);
      for (let k = hs.length - 2; k >= 0; k--) hs[k] = Math.min(Math.max(hs[k], hs[k + 1] - lim), hs[k + 1] + lim);
    }
    samples.forEach(([x, z], k) => {
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = Math.round(x + di), j = Math.round(z + dj);
        if (!inb(i, j) || tag[idx(i, j)]) continue;
        if (Math.hypot(i - x, j - z) > 1.25) continue;
        const kk = idx(i, j);
        if (!path[kk] || Math.hypot(i - x, j - z) < 0.8) { height[kk] = hs[k]; path[kk] = 1; }
      }
    });
  }

  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  // re-pin flattened sites after quantisation
  for (let k = 0; k < N; k++) if (tag[k] === 2) height[k] = 1.5;

  // Water
  for (let j = 36; j < 92; j++) {
    const cx = brookX(j);
    for (let i = Math.floor(cx - 2); i <= Math.ceil(cx + 2); i++) {
      if (Math.abs(i - cx) < 1.05) { const k = idx(i, j); height[k] = 0; water[k] = 0.3; type[k] = T.GRAVEL; }
    }
  }
  const pool = (ci, cj, r, level, bed) => { for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) <= r) { const k = idx(i, j); height[k] = bed; water[k] = level; blocked[k] = 1; } };
  pool(116, 53, 2.6, 1.3, 0.5);
  pool(62, 91, 2.2, height[idx(62, 90)] - 0.2, height[idx(62, 90)] - 0.8);
  // stream from the En Gedi pool to the sea
  const stream = [[116, 55], [119, 59], [123, 63], [128, 66], [133, 67]];
  for (let s = 0; s < stream.length - 1; s++) {
    const [a, b] = [stream[s], stream[s + 1]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let t = 0; t <= n; t++) { const i = Math.round(lerp(a[0], b[0], t / n)), j = Math.round(lerp(a[1], b[1], t / n)); const k = idx(i, j); if (path[k]) continue; height[k] = Math.max(0, Math.min(height[k], 1.5) - 0.5); water[k] = height[k] + 0.3; }
  }
  // Dead Sea
  for (let j = 0; j < H; j++) for (let i = 131; i < W; i++) { const k = idx(i, j); if (i >= 131 + Math.sin(j * 0.2) * 1.5) { height[k] = 0; water[k] = 0.4; blocked[k] = 1; } }

  // Tile types
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j);
    if (water[k] >= 0) { if (type[k] !== T.GRAVEL) type[k] = i > 128 ? T.SAND : T.GRAVEL; continue; }
    const n = fbm(i * 0.07, j * 0.07, 11), n2 = hash(i, j, 3);
    let slope = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (tag[k] === 1) t = T.PAVE;
    else if (tag[k] === 2) t = T.SOIL;
    else if (path[k]) t = i > 96 ? T.SAND : T.PATH;
    else if (i > 97) {
      const dOasis = Math.min(Math.hypot(i - 116, j - 56), Math.hypot(i - 121, j - 62) + 1, Math.hypot(i - 126, j - 66) + 2);
      if (j < cliffJ(i) && i > 106) t = n > 0.55 ? T.ROCK : T.SAND;
      else if (dOasis < 6 + n * 3) t = n2 > 0.85 ? T.GRASS : T.LUSH;
      else if (i > 126) t = T.SAND;
      else t = n > 0.5 ? T.ROCK : T.SAND;
    } else if (i < 47 && j > 34 && j < 92) {
      const v = Math.abs(i - brookX(j));
      if (v < 5) t = n2 > 0.9 ? T.GRASS : T.LUSH;
      else if (slope >= 1 || n > 0.7) t = T.LIME;
      else t = n > 0.45 ? T.GRASS : T.DRY;
    } else {
      const n3 = fbm(i * 0.21, j * 0.21, 29);
      if (slope >= 1 || n > 0.7 || n3 > 0.74) t = T.LIME;
      else if (n < 0.44) t = n3 < 0.3 ? T.SOIL : T.GRASS;
      else t = n2 > 0.72 ? T.GRASS : T.DRY;
    }
    type[k] = t;
  }

  // ---- Features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields: [], npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: null, waterfall: null };
  const block = (i0, j0, w, d) => { for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) if (inb(i, j)) blocked[idx(i, j)] = 1; };
  const house = (i0, j0, w, d, h = 2, style = 0) => { F.houses.push({ i0, j0, w, d, h, y: height[idx(i0, j0)], style }); block(i0, j0, w, d); };
  const wallRect = (i0, j0, i1, j1, h, gaps) => {
    for (let i = i0; i <= i1; i++) for (const j of [j0, j1]) if (!gaps.some((g) => g(i, j))) { F.walls.push({ i, j, h, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
    for (let j = j0 + 1; j < j1; j++) for (const i of [i0, i1]) if (!gaps.some((g) => g(i, j))) { F.walls.push({ i, j, h, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  };
  const tower = (i, j, h) => { F.towers.push({ i, j, h, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; };

  // Bethlehem
  wallRect(61, 52, 79, 68, 1.1, [
    (i, j) => j === 52 && i >= 69 && i <= 71, (i, j) => j === 68 && i >= 69 && i <= 71,
    (i, j) => i === 61 && j >= 59 && j <= 61, (i, j) => i === 79 && j >= 59 && j <= 61,
  ]);
  tower(68, 68, 2.6); tower(72, 68, 2.6); tower(68, 52, 2.2); tower(72, 52, 2.2);
  [[62, 53, 3, 3, 2.2], [65, 53, 3, 2, 1.8], [62, 57, 2, 2, 1.6], [72, 53, 3, 2, 1.9], [75, 53, 3, 3, 2.3], [76, 57, 2, 2, 1.7],
   [62, 63, 3, 3, 2.0], [65, 65, 3, 2, 1.7], [72, 65, 3, 2, 1.8], [75, 62, 3, 3, 2.2], [76, 66, 2, 1, 1.4], [62, 66, 2, 1, 1.4]]
    .forEach(([a, b, c, d, e], n) => house(a, b, c, d, e, n % 3));
  F.stalls.push({ i: 67, j: 62, color: 0 }, { i: 73, j: 62, color: 1 }, { i: 66, j: 56, color: 2 });
  for (const s of F.stalls) blocked[idx(s.i, s.j)] = 1;
  F.well = { i: 74, j: 70, y: height[idx(74, 70)] }; blocked[idx(74, 70)] = 1;
  F.torches.push({ i: 68, j: 69.3 }, { i: 72, j: 69.3 }, { i: 68, j: 51.2 }, { i: 72, j: 51.2 }, { i: 70, j: 61.5, brazier: true });
  F.props.push(...[[63, 59, 'jar'], [64, 59.5, 'jar'], [77, 61, 'basket'], [77.5, 62, 'jar'], [73.6, 69.4, 'jar'], [66, 61.2, 'basket'], [74, 56, 'jar'], [69, 66, 'hay']].map(([i, j, k]) => ({ i, j, kind: k })));

  // Jerusalem
  wallRect(58, 7, 82, 29, 1.6, [(i, j) => j === 29 && i >= 69 && i <= 71]);
  tower(68, 29, 3.2); tower(72, 29, 3.2); tower(58, 7, 2.6); tower(82, 7, 2.6); tower(58, 29, 2.6); tower(82, 29, 2.6); tower(58, 18, 2.4); tower(82, 18, 2.4);
  F.stronghold = { i0: 66, j0: 9, w: 9, d: 5, h: 3.4, y: 6.5 }; block(66, 9, 9, 5);
  F.millo = { i0: 76, j0: 9, steps: 5 }; block(75, 9, 6, 7);
  F.arkTent = { i0: 61, j0: 17, w: 4, d: 3, y: 6.5 }; block(61, 17, 4, 3);
  [[59, 24, 3, 3, 2.0], [63, 25, 3, 2, 1.8], [74, 24, 3, 3, 2.1], [77, 20, 3, 3, 2.3], [59, 9, 3, 3, 2.2], [59, 13, 2, 2, 1.7], [62, 9, 2, 2, 1.6]]
    .forEach(([a, b, c, d, e], n) => house(a, b, c, d, e, (n + 1) % 3));
  F.torches.push({ i: 68, j: 30.3 }, { i: 72, j: 30.3 }, { i: 68.5, j: 14.4 }, { i: 72.5, j: 14.4 }, { i: 66, j: 20.6, brazier: true });
  F.props.push(...[[60, 21, 'jar'], [60.6, 21.5, 'jar'], [75, 18, 'basket'], [66, 23, 'hay'], [73, 21, 'jar']].map(([i, j, k]) => ({ i, j, kind: k })));

  // Camps at Elah
  const camp = (ci, cj, style) => {
    const offs = [[-4, -2], [-1, -4], [3, -3], [-4, 2], [4, 1], [1, 4]];
    for (const [di, dj] of offs) { const i0 = ci + di - 1, j0 = cj + dj - 1; F.tents.push({ i0, j0, w: 2, d: 2, y: height[idx(ci, cj)], style }); block(i0, j0, 2, 2); }
    F.fires.push({ i: ci, j: cj, y: height[idx(ci, cj)] }); blocked[idx(ci, cj)] = 1;
  };
  camp(37, 58, 0); camp(7, 58, 1);

  // Fields: sheepfold, barley, spring
  const fold = (ci, cj, r, gapAngle) => {
    F.folds.push({ ci, cj, r });
    const segs = Math.round(r * 9);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      let da = Math.abs(((a - gapAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.45) continue;
      const x = ci + Math.cos(a) * r, z = cj + Math.sin(a) * r;
      F.walls.push({ x, z, h: 0.7, y: height[idx(Math.round(x), Math.round(z))], fold: true });
      blocked[idx(Math.round(x), Math.round(z))] = 1;
    }
  };
  fold(81, 86, 2.6, Math.PI); // opening to the west
  fold(124, 55.5, 1.8, Math.PI * 0.75);
  F.fields.push({ i0: 59, j0: 73, w: 7, d: 4 }, { i0: 81, j0: 74, w: 6, d: 5 }, { i0: 63, j0: 79, w: 5, d: 4 }, { i0: 85, j0: 82, w: 5, d: 4 });
  for (const f of F.fields) for (let j = f.j0; j < f.j0 + f.d; j++) for (let i = f.i0; i < f.i0 + f.w; i++) { const k = idx(i, j); if (!path[k] && water[k] < 0) type[k] = T.FIELD; }
  F.fires.push({ i: 77, j: 88, y: height[idx(77, 88)], small: true });

  // En Gedi
  F.cave = { i0: 122, j0: 44, i1: 126, j1: 49 };
  F.waterfall = { x: 116, zTop: cliffJ(116), top: 8.2, bottom: 1.3 };
  for (let j = 40; j < Math.floor(cliffJ(116)); j++) { const k = idx(116, j); height[k] -= 0.5; water[k] = height[k] + 0.35; blocked[k] = 1; }
  F.torches.push({ i: 124, j: 45.2 }, { i: 122.6, j: 49.6 });
  F.fires.push({ i: 119, j: 66, y: height[idx(119, 66)], small: true });

  // Smooth stones in the brook
  for (const j of [47, 55, 63, 72, 81]) { const i = Math.round(brookX(j)); F.stones.push({ x: brookX(j), z: j + 0.2, i, j }); }

  // Trees
  const r = rand(42);
  const free = (i, j, rad = 1) => {
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      if (!inb(i + di, j + dj)) return false;
      const k = idx(i + di, j + dj);
      if (blocked[k] || path[k] || tag[k] || water[k] >= 0 || type[k] === T.FIELD) return false;
    }
    return true;
  };
  const nearPoi = (i, j, list) => list.some(([a, b]) => Math.hypot(a - i, b - j) < 3.5);
  const keep = [[80, 86], [62, 90], [70, 58], [74, 70], [35, 63], [16, 61], [113, 57], [101, 56], [124, 55], [70, 16], [63, 21], [70, 50], [70, 70]];
  const tryTree = (kind, area, count, attempts = 4000) => {
    let n = 0;
    for (let a = 0; a < attempts && n < count; a++) {
      const i = Math.floor(lerp(area[0], area[2], r())), j = Math.floor(lerp(area[1], area[3], r()));
      if (!free(i, j, 1) || nearPoi(i, j, keep)) continue;
      if (F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < (kind === 'palm' ? 2.2 : 3))) continue;
      const k = idx(i, j);
      if (kind === 'olive' && !(type[k] === T.GRASS || type[k] === T.DRY)) continue;
      if (kind === 'terebinth' && !(type[k] === T.GRASS || type[k] === T.DRY || type[k] === T.LUSH)) continue;
      if (kind === 'palm' && !(type[k] === T.LUSH || type[k] === T.GRASS || type[k] === T.SAND)) continue;
      F.trees.push({ i, j, kind, y: height[k], s: 0.8 + r() * 0.5, seed: Math.floor(r() * 1e6) });
      blocked[k] = 1; n++;
    }
  };
  tryTree('olive', [52, 66, 94, 98], 34);
  tryTree('olive', [50, 30, 92, 52], 16);
  tryTree('olive', [44, 2, 96, 34], 10);
  tryTree('terebinth', [2, 38, 46, 96], 26);
  tryTree('palm', [108, 50, 130, 72], 26);
  // desert shrubs (non-blocking)
  for (let a = 0; a < 900 && F.shrubs.length < 90; a++) {
    const i = Math.floor(lerp(88, 132, r())), j = Math.floor(lerp(2, 98, r()));
    const k = idx(i, j);
    if (water[k] >= 0 || path[k] || tag[k] || blocked[k]) continue;
    if (type[k] === T.SAND || type[k] === T.ROCK) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.6 + r() * 0.5 });
  }

  // NPCs
  const npc = (kind, x, z, extra = {}) => F.npcs.push({ kind, x, z, home: [x, z], ...extra });
  for (let s = 0; s < 11; s++) npc('sheep', 76 + r() * 9, 82 + r() * 8, { roam: 5 });
  for (let s = 0; s < 5; s++) npc('sheep', 121 + r() * 5, 54 + r() * 4, { roam: 2.5 });
  [[100, 54], [102, 52.6], [104, 55], [99, 57], [118, 45], [128, 46], [110, 47]].forEach(([x, z]) => npc('ibex', x, z, { roam: 2 }));
  [[66, 59], [74, 60], [72, 56], [64, 61], [70, 65]].forEach(([x, z], n) => npc('villager', x, z, { roam: 3, look: n }));
  [[66, 22], [74, 19], [69, 25], [62, 15]].forEach(([x, z], n) => npc('villager', x, z, { roam: 3, look: n + 5 }));
  [[34, 56], [39, 61], [36, 61], [40, 55]].forEach(([x, z]) => npc('soldier', x, z, { roam: 1.5 }));
  [[5, 61], [10, 55], [4, 56]].forEach(([x, z]) => npc('philistine', x, z, { roam: 1.5 }));
  npc('goliath', 12, 60, { roam: 0, face: 3 });
  npc('shieldbearer', 13.3, 60.6, { roam: 0, face: 3 });
  blocked[idx(12, 60)] = 1; blocked[idx(13, 60)] = 1; blocked[idx(13, 61)] = 1;

  // map edge
  for (let i = 0; i < W; i++) { blocked[idx(i, 0)] = blocked[idx(i, 1)] = blocked[idx(i, H - 1)] = blocked[idx(i, H - 2)] = 1; }
  for (let j = 0; j < H; j++) { blocked[idx(0, j)] = blocked[idx(1, j)] = blocked[idx(W - 1, j)] = blocked[idx(W - 2, j)] = 1; }

  const spawn = [74, 82];
  return { W, H, height, type, water, blocked, path, tag, features: F, spawn, idx, inb };
}

export function canStep(world, fromI, fromJ, toI, toJ) {
  const { idx, inb, height, blocked } = world;
  if (!inb(toI, toJ)) return false;
  const k = idx(toI, toJ);
  if (blocked[k]) return false;
  return Math.abs(height[k] - height[idx(fromI, fromJ)]) <= STEP;
}

export function reachable(world, from) {
  const { W, H, idx } = world;
  const seen = new Uint8Array(W * H);
  const qi = [from];
  seen[idx(from[0], from[1])] = 1;
  while (qi.length) {
    const [i, j] = qi.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!canStep(world, i, j, ni, nj)) continue;
      const k = idx(ni, nj);
      if (seen[k]) continue;
      seen[k] = 1; qi.push([ni, nj]);
    }
  }
  return seen;
}
