// Act 5 map: 다윗성 (south) and the place on Mount Moriah where the temple will stand (north).
// 삼하 7, 대상 22:1–5, 28:11–20, 29:1–15, 대하 3:1. The text names the City of David, the ark's curtain (7:2),
// the stonecutters, iron, bronze, cedar from Sidon and Tyre, and David's own gold and silver.
// Every shape, distance and position here is imagined. Same world shape as generateHebron().
import { T, fbm, rand } from './world.js';

export const TW = 110, TH = 100;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export const CITY = { ci: 55, cj: 72, r: 11, gateA: -Math.PI / 2, gateHalf: 0.22 }; // the gate faces north, toward Moriah
export const MORIAH = { ci: 55, cj: 22, r: 14 };
// the outline of the house that will be built (대하 3:3 "장이 육십 규빗이요 광이 이십 규빗"; drawn at 3:1, the scale is imagined); porch to the east
export const OUTLINE = { i0: 48, i1: 62, j0: 17, j1: 21 };
export const PILE_KEYS = ['cedar', 'stone', 'gold', 'silver', 'iron', 'bronze'];

function rawHeight(i, j) {
  const n = fbm(i * 0.05, j * 0.05, 307);
  let h = 1.6 + (n - 0.5) * 1.3;
  h = lerp(h, 3.0, smooth(CITY.r + 7, CITY.r - 1, Math.hypot(i - CITY.ci, j - CITY.cj)));
  h = lerp(h, 3.5, smooth(MORIAH.r + 7, MORIAH.r - 1, Math.hypot(i - MORIAH.ci, j - MORIAH.cj)));
  // the ridge between them (the Ophel)
  h = lerp(h, 3.0, smooth(7, 2, Math.abs(i - 55)) * smooth(30, 36, j) * smooth(64, 58, j));
  // the Kidron side falls away to the east
  h -= smooth(70, 84, i) * smooth(60, 46, j) * smooth(30, 40, j) * 0.8;
  return h;
}

export function generateTemple() {
  const W = TW, H = TH, N = W * H;
  const height = new Float32Array(N), type = new Uint8Array(N), water = new Float32Array(N).fill(-1);
  const blocked = new Uint8Array(N), path = new Uint8Array(N), tag = new Uint8Array(N), road = new Uint8Array(N), city = new Uint8Array(N), yard = new Uint8Array(N);
  const idx = (i, j) => j * W + i, inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const q = (h) => Math.round(h * 2) / 2;
  const r = rand(7207);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) height[idx(i, j)] = rawHeight(i, j);

  // ---- the city's summit, Moriah's yard ----
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dc = Math.hypot(i - CITY.ci, j - CITY.cj), dm = Math.hypot((i - MORIAH.ci) * 0.8, j - MORIAH.cj);
    if (dc <= CITY.r + 1.4) { height[idx(i, j)] = 3.0; if (dc < CITY.r - 0.6) city[idx(i, j)] = 1; }
    if (dm <= 12) { height[idx(i, j)] = 3.5; if (dm < 11) yard[idx(i, j)] = 1; }
  }

  // ---- roads ----
  const ROADS = {
    ophel: [[55, 62], [55, 54], [55, 46], [55, 38], [55, 31]],             // the city gate up to Moriah
    quarry: [[21, 42], [28, 40], [35, 36], [41, 31], [46, 28]],           // the stonecutters (대상 22:2)
    cedar: [[5, 6], [14, 9], [24, 12], [33, 15], [40, 18], [44, 22]],    // cedar from Sidon and Tyre (22:4); the route is imagined
    forge: [[89, 40], [82, 38], [75, 34], [69, 30], [64, 28]],            // iron and bronze (22:3)
  };
  const lines = {};
  for (const [name, pts] of Object.entries(ROADS)) {
    lines[name] = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const [a, b] = [pts[s], pts[s + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
      for (let k = 0; k <= n; k++) {
        const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); lines[name].push([x, z]);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = Math.round(x + di), j = Math.round(z + dj); if (inb(i, j) && Math.hypot(i - x, j - z) < 1.2) { path[idx(i, j)] = 1; road[idx(i, j)] = 1; } }
      }
    }
  }
  for (let k = 0; k < N; k++) height[k] = Math.max(0, q(height[k]));
  // roads climb in steps of at most half a block
  for (let pass = 0; pass < 24; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = idx(i, j); if (!path[k]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = idx(i + di, j + dj); if (path[kk] && Math.abs(height[kk] - height[k]) > 0.5) height[kk] = height[k] + Math.sign(height[kk] - height[k]) * 0.5; }
  }

  // ---- tile types ----
  const QUARRY = [22, 42], FORGE = [88, 39], LANDING = [34, 15];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j);
    const n = fbm(i * 0.07, j * 0.07, 23), n3 = fbm(i * 0.21, j * 0.21, 41);
    let slope = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(i + di, j + dj)) slope = Math.max(slope, Math.abs(height[k] - height[idx(i + di, j + dj)]));
    let t;
    if (yard[k]) t = i >= OUTLINE.i0 - 2 && i <= OUTLINE.i1 + 2 && j >= OUTLINE.j0 - 2 && j <= OUTLINE.j1 + 2 ? T.LIME : n3 > 0.6 ? T.SOIL : T.PATH; // the threshing floor
    else if (city[k]) t = road[k] || Math.abs(i - 55) <= 1 ? T.PAVE : n3 > 0.6 ? T.SOIL : T.PATH;
    else if (Math.hypot(i - QUARRY[0], j - QUARRY[1]) < 7) t = n3 > 0.45 ? T.LIME : T.ROCK; // the quarry face
    else if (road[k]) t = T.GRAVEL;
    else if (Math.hypot(i - FORGE[0], j - FORGE[1]) < 4) t = T.SOIL;
    else if (slope >= 1) t = n3 > 0.55 ? T.ROCK : T.LIME;
    else t = n3 > 0.7 ? T.LIME : n > 0.55 ? T.GRASS : T.DRY;
    type[k] = t;
  }

  // ---- features ----
  const F = { houses: [], walls: [], towers: [], tents: [], fires: [], torches: [], trees: [], shrubs: [], folds: [], stalls: [], props: [], fields: [], npcs: [], stones: [], well: null, millo: null, stronghold: null, arkTent: null, cave: null, waterfall: null, altar: null, forge: null, quarry: null };
  const block = (i0, j0, w, d) => { for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) blocked[idx(i, j)] = 1; };
  const gateGap = (a) => Math.abs(Math.atan2(Math.sin(a - CITY.gateA), Math.cos(a - CITY.gateA))) < CITY.gateHalf;
  // the City of David's wall, finished in Act 4
  const seen = new Set();
  for (let t = 0; t < 400; t++) {
    const a = (t / 400) * Math.PI * 2; if (gateGap(a)) continue;
    const i = Math.round(CITY.ci + Math.cos(a) * CITY.r), j = Math.round(CITY.cj + Math.sin(a) * CITY.r), key = i * 1000 + j;
    if (seen.has(key)) continue; seen.add(key);
    F.walls.push({ i, j, h: 2.2, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1;
  }
  for (const s of [-1, 1]) { const a = CITY.gateA + s * (CITY.gateHalf + 0.06), i = Math.round(CITY.ci + Math.cos(a) * CITY.r), j = Math.round(CITY.cj + Math.sin(a) * CITY.r); F.towers.push({ i, j, h: 3.4, y: height[idx(i, j)] }); blocked[idx(i, j)] = 1; }
  F.torches.push({ i: 53.2, j: 60.2 }, { i: 56.8, j: 60.2 });
  const house = (i0, j0, w, d, h, style) => { F.houses.push({ i0, j0, w, d, h, y: height[idx(i0, j0)], style }); block(i0, j0, w, d); };
  // David's cedar house (7:2), its door on the south side, and the ark's tent beside it (삼하 6:17)
  house(49, 66, 5, 3, 2.4, 2);
  F.arkTent = { i0: 58, j0: 66, w: 4, d: 3, y: height[idx(58, 66)] }; block(58, 66, 4, 3);
  for (const [i0, j0, w, d, s] of [[46, 74, 2, 2, 1], [61, 75, 3, 2, 0], [49, 77, 3, 2, 0], [57, 78, 2, 2, 1]]) house(i0, j0, w, d, 2.0, s);
  F.props.push({ kind: 'jar', i: 48.4, j: 70 }, { kind: 'jar', i: 54.6, j: 70.2 }, { kind: 'basket', i: 47.6, j: 70.4 });
  // Moriah: the altar David built on the threshing floor (대상 21:26, 22:1); placement imagined
  F.altar = { i: 66, j: 19, y: height[idx(66, 19)] }; block(66, 19, 1, 1);
  // the quarry: cut blocks lying about; the forge: a hut and a furnace (both imagined)
  F.quarry = { i: QUARRY[0], j: QUARRY[1] };
  for (let n = 0; n < 9; n++) { const a = n * 2.1, rr = 2.5 + (n % 3) * 1.4, i = QUARRY[0] - 1 + Math.cos(a) * rr, j = QUARRY[1] - 2 + Math.sin(a) * rr * 0.7; if (!path[idx(Math.round(i), Math.round(j))]) F.props.push({ kind: 'edgestone', i, j }); }
  house(89, 35, 3, 2, 1.9, 1);
  F.forge = { i: 86.5, j: 37.5, y: height[idx(86, 37)] }; block(86, 37, 1, 1);
  // cedar logs stacked at the landing where the Sidonians and Tyrians unload (22:4)
  F.props.push({ kind: 'hay', i: 31.5, j: 13.6 });

  // trees: olive and terebinth, clear of the summits, roads and work places
  const near = (name, i, j, d) => lines[name].some(([x, z]) => Math.hypot(x - i, z - j) < d);
  const clearOf = (i, j) => Math.hypot(i - CITY.ci, j - CITY.cj) < CITY.r + 4 || Math.hypot((i - MORIAH.ci) * 0.8, j - MORIAH.cj) < 15 || Math.hypot(i - QUARRY[0], j - QUARRY[1]) < 9 || Math.hypot(i - FORGE[0], j - FORGE[1]) < 6 || Math.hypot(i - LANDING[0], j - LANDING[1]) < 5 || Object.keys(lines).some((nm) => near(nm, i, j, 3));
  for (let n = 0; n < 3000 && F.trees.length < 40; n++) {
    const i = 4 + Math.floor(r() * (W - 8)), j = 6 + Math.floor(r() * (H - 12)), k = idx(i, j);
    if (blocked[k] || path[k] || clearOf(i, j) || F.trees.some((t) => Math.hypot(t.i - i, t.j - j) < 3)) continue;
    F.trees.push({ i, j, y: height[k], kind: n % 3 ? 'olive' : 'terebinth', s: 0.8 + r() * 0.35, seed: Math.floor(r() * 1e6) }); blocked[k] = 1;
  }
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j); if (path[k] || blocked[k] || city[k] || yard[k] || clearOf(i, j)) continue;
    if ((type[k] === T.DRY || type[k] === T.LIME) && r() < 0.02) F.shrubs.push({ x: i + r() - 0.5, z: j + r() - 0.5, y: height[k], s: 0.55 + r() * 0.5 });
  }
  // play bounds
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < 3 || i > W - 3 || j < 4 || j > H - 5) blocked[idx(i, j)] = 1;

  // ---- layout (world units) ----
  const P = (i, j) => ({ x: i - W / 2, z: j - H / 2 });
  const route = (name, rev) => { const l = lines[name].filter((_, n) => n % 3 === 0).map(([i, j]) => P(i, j)); return rev ? l.reverse() : l; };
  const pileAt = { cedar: [44, 26.5], stone: [48.4, 26.5], gold: [52.8, 27], silver: [57.2, 27], iron: [61.6, 26.5], bronze: [66, 26.5] };
  const restSpots = []; for (let n = 0; n < 60 && restSpots.length < 18; n++) { const a = n * 2.399, rr = 1.6 + Math.sqrt(n) * 0.9, i = 55 + Math.cos(a) * rr * 2.2, j = 30.5 + Math.sin(a) * rr * 0.5; if (!blocked[idx(Math.round(i), Math.round(j))] && j > 28.5) restSpots.push(P(i, j)); }
  const layout = {
    start: P(55, 74), nathan: P(63, 71.6), tentSpot: P(60, 70.8), treasury: P(51.5, 70.4), gate: P(55, 61), cityIn: P(55, 66.5),
    yard: P(55, 24), yardR: 11, buildRing: P(55, 19), solomonFrom: P(55, 42), solomonSpot: P(55, 30),
    piles: Object.fromEntries(PILE_KEYS.map((k) => [k, P(...pileAt[k])])),
    sources: {
      quarry: { item: 'stone', spot: P(24, 41.2), route: route('quarry') },
      cedar: { item: 'cedar', spot: P(33.6, 16.4), route: route('cedar').filter((p) => p.x >= 33.6 - W / 2 - 0.5) },
      forge: { item: 'metal', spot: P(84.6, 38.6), route: route('forge') },
    },
    giverRoute: [P(55, 66.5), P(55, 61), P(55, 52), P(55, 42), P(55, 32)],
    restSpots,
  };
  return { W, H, height, type, water, blocked, path, tag, features: F, spawn: [55, 74], idx, inb, layout };
}
