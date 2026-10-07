// Procedural pixel art: every texture and sprite in the game is painted here in code.
import * as THREE from 'three';
import { rand } from './world.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.d = this.img.data;
  }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const rgb = typeof c === 'string' ? hex(c) : c;
    const o = (y * this.w + x) * 4;
    this.d[o] = rgb[0]; this.d[o + 1] = rgb[1]; this.d[o + 2] = rgb[2]; this.d[o + 3] = a;
  }
  get(x, y) { const o = (y * this.w + x) * 4; return [this.d[o], this.d[o + 1], this.d[o + 2], this.d[o + 3]]; }
  alpha(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  flush() { this.ctx.putImageData(this.img, 0, 0); return this.canvas; }
}

function tex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function noiseFill(p, ox, oy, w, h, pal, r) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(ox + x, oy + y, pick(r, pal)); }

// ---------------- Terrain atlas ----------------
export const ATLAS_COLS = 8, ATLAS_ROWS = 4, TILE = 16;
export const SIDE = { LIME: 11, ROCK: 12, GRASS: 13, DRY: 14, LUSH: 15, SAND: 16, SOIL: 17, PAVE: 18 };

const PAL = {
  grass: ['#6f8a44', '#7a944a', '#647e3c', '#859e54', '#6c8640'],
  dry: ['#a3a066', '#b0aa70', '#96945e', '#bab37a', '#a6a26a'],
  lush: ['#58843c', '#628e42', '#4e7735', '#6d984a', '#5a873e'],
  soil: ['#8a6a48', '#7d5f40', '#977653', '#82664a'],
  path: ['#cfb68d', '#c5aa80', '#d9c39c', '#c9b087'],
  lime: ['#d8cfba', '#cbc1aa', '#e3dbc8', '#d1c7b0'],
  rock: ['#c6a67e', '#b99a72', '#d2b28a', '#bfa078'],
  sand: ['#e0cda2', '#d6c296', '#e8d8b0', '#dac69c'],
  gravel: ['#8f8b7f', '#a29e90', '#7a776c', '#b0ab9b'],
  pave: ['#d2c7ae', '#c6ba9f', '#dbd1ba'],
};

function paintTop(p, ox, oy, t, r) {
  const S = TILE;
  switch (t) {
    case 0: case 1: case 9: {
      const pal = t === 0 ? PAL.grass : t === 1 ? PAL.dry : PAL.lush;
      noiseFill(p, ox, oy, S, S, pal, r);
      for (let n = 0; n < 10; n++) { const x = Math.floor(r() * S), y = Math.floor(r() * (S - 2)); p.set(ox + x, oy + y, pal[2]); p.set(ox + x, oy + y + 1, pal[3]); }
      if (t === 1) for (let n = 0; n < 6; n++) p.set(ox + r() * S, oy + r() * S, PAL.grass[1]);
      if (t !== 1 && r() < 0.8) { const fx = Math.floor(r() * S), fy = Math.floor(r() * S); p.set(ox + fx, oy + fy, r() < 0.6 ? '#d8423a' : '#f2ecd8'); }
      break;
    }
    case 2: noiseFill(p, ox, oy, S, S, PAL.soil, r); break;
    case 3: {
      noiseFill(p, ox, oy, S, S, PAL.path, r);
      for (let n = 0; n < 7; n++) { const x = ox + Math.floor(r() * S), y = oy + Math.floor(r() * S); p.set(x, y, '#a88f6a'); p.set(x + 1, y, '#e8d8b6'); }
      break;
    }
    case 4: {
      noiseFill(p, ox, oy, S, S, PAL.lime, r);
      for (let n = 0; n < 3; n++) { let x = Math.floor(r() * S), y = Math.floor(r() * S); for (let k = 0; k < 5; k++) { p.set(ox + x, oy + y, '#a99d84'); x += r() < 0.5 ? 1 : 0; y += 1; if (y >= S || x >= S) break; } }
      for (let n = 0; n < 5; n++) p.set(ox + r() * S, oy + r() * S, '#f2ecdc');
      break;
    }
    case 5: {
      noiseFill(p, ox, oy, S, S, PAL.rock, r);
      for (let n = 0; n < 6; n++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); p.set(ox + x, oy + y, '#946c45'); p.set(ox + x + 1, oy + y, '#d8ae7c'); }
      break;
    }
    case 6: {
      noiseFill(p, ox, oy, S, S, PAL.sand, r);
      for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) if (r() < 0.35) p.set(ox + x, oy + ((y + Math.round(Math.sin(x * 0.7) * 1)) & 15), '#cfae78');
      break;
    }
    case 7: {
      noiseFill(p, ox, oy, S, S, ['#6f6b60', '#7a766a'], r);
      for (let n = 0; n < 14; n++) { const x = Math.floor(r() * 14), y = Math.floor(r() * 14); const c = pick(r, PAL.gravel); p.rect(ox + x, oy + y, 2, 2, c); p.set(ox + x, oy + y, '#c9c4b2'); }
      break;
    }
    case 8: {
      noiseFill(p, ox, oy, S, S, PAL.pave, r);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 5), off = row % 2 ? 4 : 0;
        if (y % 5 === 4 || (x + off) % 8 === 7) p.set(ox + x, oy + y, '#9b8f76');
      }
      break;
    }
    case 10: {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const row = y % 4;
        p.set(ox + x, oy + y, row === 3 ? pick(r, PAL.soil) : pick(r, ['#8db04a', '#9cbc56', '#7ea242', '#a9c463']));
      }
      break;
    }
  }
}

function paintStrata(p, ox, oy, pal, line, r, crack) {
  const S = TILE;
  noiseFill(p, ox, oy, S, S, pal, r);
  for (let y = 0; y < S; y++) {
    if (y % 8 === 7 || y % 8 === 3) for (let x = 0; x < S; x++) if (r() < 0.85) p.set(ox + x, oy + y, line);
  }
  for (let n = 0; n < 4; n++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); p.set(ox + x, oy + y, crack); p.set(ox + x, oy + y + 1, crack); }
  for (let x = 0; x < S; x++) if (r() < 0.3) p.set(ox + x, oy + (Math.floor(r() * 2) * 8), pal[2]);
}

function paintSide(p, ox, oy, s, r) {
  const S = TILE;
  const strata = () => paintStrata(p, ox, oy, ['#c9bda3', '#bcaf94', '#d4c9b1', '#c2b59b'], '#9e9078', r, '#857861');
  switch (s) {
    case SIDE.LIME: strata(); break;
    case SIDE.ROCK: paintStrata(p, ox, oy, ['#bd9e78', '#ae9070', '#c9ab84', '#b49674'], '#927656', r, '#7a6046'); break;
    case SIDE.SOIL: noiseFill(p, ox, oy, S, S, ['#7d5f40', '#715537', '#8a6a48'], r); for (let n = 0; n < 6; n++) p.set(ox + r() * S, oy + r() * S, '#a8957a'); break;
    case SIDE.PAVE: {
      noiseFill(p, ox, oy, S, S, ['#cbbfa4', '#c0b398', '#d4c9af'], r);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const row = Math.floor(y / 4), off = row % 2 ? 3 : 0; if (y % 4 === 3 || (x + off) % 6 === 5) p.set(ox + x, oy + y, '#91856c'); }
      break;
    }
    default: {
      // grass/sand lip over strata. Lip lives in the upper half (rows 0..7).
      if (s === SIDE.SAND) paintStrata(p, ox, oy, ['#bd9e78', '#ae9070', '#c9ab84'], '#927656', r, '#7a6046'); else strata();
      const pal = s === SIDE.GRASS ? PAL.grass : s === SIDE.DRY ? PAL.dry : s === SIDE.LUSH ? PAL.lush : PAL.sand;
      for (let x = 0; x < S; x++) {
        const depth = 3 + Math.floor(r() * 3) + (x % 5 === 0 ? 1 : 0);
        for (let y = 0; y < depth; y++) p.set(ox + x, oy + y, pick(r, pal));
        p.set(ox + x, oy + depth, s === SIDE.SAND ? '#a88e6a' : '#4f6634');
      }
    }
  }
}

export function makeTerrainAtlas() {
  const p = new Painter(ATLAS_COLS * TILE, ATLAS_ROWS * TILE);
  const r = rand(7);
  for (let t = 0; t <= 10; t++) paintTop(p, (t % ATLAS_COLS) * TILE, Math.floor(t / ATLAS_COLS) * TILE, t, r);
  for (const s of Object.values(SIDE)) paintSide(p, (s % ATLAS_COLS) * TILE, Math.floor(s / ATLAS_COLS) * TILE, s, r);
  const t = tex(p.flush());
  t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; // atlas: avoid mip bleeding
  return t;
}
export function atlasUV(index) {
  const c = index % ATLAS_COLS, row = Math.floor(index / ATLAS_COLS);
  const e = 0.02 / ATLAS_COLS;
  const u0 = c / ATLAS_COLS + e, u1 = (c + 1) / ATLAS_COLS - e;
  const v1 = 1 - row / ATLAS_ROWS - e, v0 = 1 - (row + 1) / ATLAS_ROWS + e;
  return [u0, v0, u1, v1];
}

// ---------------- Prop textures ----------------
export function makePropTextures() {
  const r = rand(99);
  const mk = (w, h, fn) => { const p = new Painter(w, h); fn(p); return tex(p.flush(), true); };
  const T = {};
  T.ashlar = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#d9cfb8', '#cfc4ab', '#e2d9c4', '#d4c9b1'], r);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = Math.floor(y / 4), off = row % 2 ? 4 : 0; if (y % 4 === 3 || (x + off) % 8 === 7) p.set(x, y, '#9f9279'); }
    for (let n = 0; n < 6; n++) p.set(r() * 16, r() * 16, '#f1ead8');
  });
  T.plaster = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#e6dcc6', '#ddd2ba', '#ebe3cf', '#e1d6bf'], r);
    for (let n = 0; n < 5; n++) p.set(r() * 16, r() * 16, '#c9bb9d');
  });
  T.mudbrick = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#c49a6c', '#b98f62', '#cca476'], r);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = Math.floor(y / 3), off = row % 2 ? 3 : 0; if (y % 3 === 2 || (x + off) % 6 === 5) p.set(x, y, '#9a7550'); }
  });
  T.roof = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#a89474', '#9c8869', '#b39f7e', '#958262'], r);
    for (let n = 0; n < 14; n++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); p.set(x, y, '#cdb98c'); p.set(x + 1, y, '#cdb98c'); }
  });
  T.wood = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 4 === 3 ? '#4f3420' : pick(r, ['#7a5434', '#83603c', '#70492c']));
  });
  T.door = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 5 === 4 ? '#2c1d12' : pick(r, ['#4a3220', '#55392a', '#3f2a1a']));
  });
  T.dark = mk(8, 8, (p) => noiseFill(p, 0, 0, 8, 8, ['#2a211b', '#231b16', '#30261f'], r));
  T.tentBlack = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y % 8 === 0 ? '#c9b48e' : Math.floor(y / 2) % 4 === 0 ? pick(r, ['#5a4636', '#634e3c']) : pick(r, ['#7d6650', '#86705a', '#755f4a']));
  });
  T.tentStripe = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, Math.floor(x / 4) % 2 ? pick(r, ['#b1483a', '#a43f33']) : pick(r, ['#e6dcc2', '#ddd1b4']));
  });
  T.linen = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#f0eadb', '#e7e0cf', '#f6f1e4'], r);
    for (let x = 0; x < 16; x += 8) for (let y = 0; y < 16; y++) p.set(x, y, '#cfc5ae');
  });
  const stripe = (a, b) => mk(16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, Math.floor(x / 3) % 2 ? pick(r, a) : pick(r, b)); });
  T.clothRed = stripe(['#b8473a', '#a83d31'], ['#efe4c8', '#e6d9ba']);
  T.clothBlue = stripe(['#3f5d8c', '#38527d'], ['#efe4c8', '#e6d9ba']);
  T.clothGreen = stripe(['#5c7d3a', '#527234'], ['#e8d58a', '#ddc97c']);
  T.bark = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + Math.floor(y / 3)) % 4 === 0 ? '#4a3f33' : pick(r, ['#6e6150', '#7b6d5a', '#635746']));
  });
  T.palmTrunk = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y % 4 === 0 ? '#6b4f30' : pick(r, ['#9a7a4e', '#8c6c44', '#a6865a']));
  });
  const leaves = (pal, hi, lo) => mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, pal, r);
    for (let n = 0; n < 18; n++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); p.set(x, y, hi); p.set(x + 1, y + 1, lo); }
  });
  T.leafOlive = leaves(['#7d9466', '#8aa070', '#6f875a', '#97ab7c'], '#c3cfa6', '#4f6640');
  T.leafDark = leaves(['#4f7a32', '#5a8838', '#456d2c', '#62913e'], '#93bb5e', '#2f5020');
  T.leafPalm = mk(16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x === 7 || x === 8 ? '#9a8a4a' : (x + y) % 3 === 0 ? '#3f6a28' : pick(r, ['#5d8c34', '#6a9a3c', '#527d2e']));
  });
  T.terracotta = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#b8693e', '#ad6037', '#c27548'], r);
    for (let x = 0; x < 16; x++) { p.set(x, 4, '#7a3d20'); p.set(x, 5, '#e09a6a'); }
  });
  T.fieldstone = mk(16, 16, (p) => {
    noiseFill(p, 0, 0, 16, 16, ['#8a8170', '#9a9180', '#7a7262'], r);
    for (let n = 0; n < 6; n++) { const x = Math.floor(r() * 12), y = Math.floor(r() * 12); p.rect(x, y, 4, 3, pick(r, ['#c2b8a2', '#b1a690', '#d0c7b2'])); p.set(x, y + 2, '#6a6252'); p.set(x + 3, y + 2, '#6a6252'); }
  });
  T.hay = mk(16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, ['#d8bd6a', '#c9ac58', '#e6cc7c', '#b99a4a'])); });
  T.rockFace = mk(16, 16, (p) => paintStrata(p, 0, 0, ['#bd9e78', '#ae9070', '#c9ab84', '#b49674'], '#927656', r, '#7a6046'));
  T.waterfall = mk(16, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const streak = Math.sin(x * 1.7 + Math.floor(y / 6) * 2.1) > 0.6;
      p.set(x, y, streak ? '#f4fbff' : pick(r, ['#9fd3e0', '#b5e0ea', '#86c4d6', '#cdebf2']), 225);
    }
  });
  return T;
}

// ---------------- Grass tufts / flowers ----------------
export function makeTuftTextures() {
  const r = rand(5);
  const out = [];
  const variants = [
    { blades: ['#5f8c36', '#7aa646', '#8fbf54'], flower: null },
    { blades: ['#9c9a54', '#b8b26c', '#cfc684'], flower: null },
    { blades: ['#4e8a34', '#68a845'], flower: '#d8423a' }, // red anemones (early spring)
    { blades: ['#5f8c36', '#7aa646'], flower: '#f3eedc' },
    { blades: ['#7ea242', '#a9c463', '#c9cf74'], flower: null, tall: true }, // barley
    { blades: ['#8a8a50', '#a79c62', '#6e7046'], flower: null, shrub: true }, // desert broom
  ];
  for (const v of variants) {
    const p = new Painter(16, 16);
    const n = v.shrub ? 14 : v.tall ? 9 : 7;
    for (let b = 0; b < n; b++) {
      let x = 2 + r() * 12; const hgt = (v.tall ? 10 : v.shrub ? 6 : 5) + Math.floor(r() * 5);
      const lean = (r() - 0.5) * 0.5;
      for (let y = 0; y < hgt; y++) { p.set(x, 15 - y, v.blades[Math.min(v.blades.length - 1, Math.floor((y / hgt) * v.blades.length))]); x += lean; }
      if (v.tall) { p.set(x, 15 - hgt, '#e1d48a'); p.set(x, 14 - hgt, '#e1d48a'); }
    }
    if (v.flower) for (let f = 0; f < 3; f++) { const x = 3 + Math.floor(r() * 10), y = 4 + Math.floor(r() * 5); p.set(x, y, v.flower); p.set(x + 1, y, v.flower); p.set(x, y - 1, v.flower); p.set(x + 1, y - 1, v.flower); p.set(x, y + 1, '#3d6a26'); p.set(x, y + 2, '#3d6a26'); if (v.flower === '#d8423a') p.set(x, y, '#2a1a24'); }
    const t = tex(p.flush());
    t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    out.push(t);
  }
  return out;
}

// ---------------- Character sprites ----------------
const OUT = '#2a1c16';
export const LOOKS = {
  david: { skin: '#e3a47c', skinDark: '#c47f5c', hair: '#8f4122', hairHi: '#b45a30', tunic: '#dccaa0', tunicDark: '#b9a57b', belt: '#7a4a2a', sandal: '#5a3a22', staff: true, sling: true, curly: true },
  soldier: { skin: '#c98f68', skinDark: '#a87050', hair: '#3a2a20', hairHi: '#4a3628', tunic: '#8a6a4a', tunicDark: '#6e5238', belt: '#4a3020', sandal: '#4a3020', spear: true, beard: true, headcloth: '#7a6a52' },
  philistine: { skin: '#d49a72', skinDark: '#b07a58', hair: '#4a3020', hairHi: '#5a3a28', tunic: '#e3d6b8', tunicDark: '#bcae8e', kilt: '#b5523b', belt: '#8a3a2a', sandal: '#4a3020', spear: true, feathers: true },
  goliath: { skin: '#c88c62', skinDark: '#a26c48', hair: '#2a1e18', hairHi: '#3a2a20', tunic: '#a8843e', tunicDark: '#7a5e28', belt: '#5a4020', sandal: '#3a2a1a', spear: true, beard: true, helmet: '#c49a46', armor: true, greaves: true },
  shieldbearer: { skin: '#d49a72', skinDark: '#b07a58', hair: '#4a3020', hairHi: '#5a3a28', tunic: '#e3d6b8', tunicDark: '#bcae8e', kilt: '#b5523b', belt: '#8a3a2a', sandal: '#4a3020', shield: true, feathers: true },
  villagers: [
    { tunic: '#a8473a', tunicDark: '#84362c', headcloth: '#e6dcc2', beard: true },
    { tunic: '#4a5d8c', tunicDark: '#384770', headcloth: '#d8c9a8', veil: true },
    { tunic: '#c19a4a', tunicDark: '#9a7a38', headcloth: '#7a5a3a' },
    { tunic: '#cdbf9e', tunicDark: '#a99b7c', headcloth: '#a8473a', veil: true },
    { tunic: '#7a7a4a', tunicDark: '#5e5e38', beard: true, hair: '#cfc8b8', hairHi: '#e6e0d2' },
    { tunic: '#6a4a6e', tunicDark: '#523856', headcloth: '#e6dcc2', veil: true },
    { tunic: '#b8a07a', tunicDark: '#94805e', headcloth: '#4a5d8c', beard: true },
    { tunic: '#9a5a3a', tunicDark: '#7a442a' },
    { tunic: '#dfd4bc', tunicDark: '#bdb194', headcloth: '#3f5d8c', veil: true },
  ],
};

function drawHuman(p, ox, oy, dir, f, o) {
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const bob = step !== 0 ? -1 : 0;
  const mirror = dir === 3;
  const S = (x, y, c) => p.set(ox + (mirror ? 15 - x : x), oy + y, c);
  const B = (x, y, c) => S(x, y + bob, c); // body parts bob
  const side = dir >= 2;
  const skin = o.skin || '#d9a07a', skinD = o.skinDark || '#b8805c';
  const hair = o.hair || '#3a2a20', hairHi = o.hairHi || '#4e3a2c';
  // legs
  const legC = o.greaves ? '#b08a3a' : skin;
  if (!side) {
    const lUp = step === 1 ? 1 : 0, rUp = step === -1 ? 1 : 0;
    for (let y = 19; y <= 22 - lUp; y++) { S(6, y, legC); S(7, y, legC); }
    for (let y = 19; y <= 22 - rUp; y++) { S(8, y, legC); S(9, y, o.greaves ? '#8a6a2a' : skinD); }
    S(6, 23 - lUp, o.sandal); S(7, 23 - lUp, o.sandal); S(8, 23 - rUp, o.sandal); S(9, 23 - rUp, o.sandal);
  } else {
    const a = step === 0 ? [7, 7] : [5 + (step > 0 ? 0 : 4), 9 - (step > 0 ? 0 : 4)];
    for (const [k, lx] of a.entries()) { for (let y = 19; y <= 22; y++) { S(lx, y, k ? skinD : legC); S(lx + 1, y, k ? skinD : legC); } S(lx - 1, 23, o.sandal); S(lx, 23, o.sandal); S(lx + 1, 23, o.sandal); }
  }
  // tunic
  const x0 = side ? 5 : 4, x1 = side ? 10 : 11;
  for (let y = 10; y <= 18; y++) for (let x = x0; x <= x1; x++) B(x, y, (x === x1 || (side && x === x0)) ? o.tunicDark : o.tunic);
  for (let x = x0 - 1; x <= x1 + 1; x++) B(x, 18, o.tunicDark);
  if (o.kilt) for (let y = 15; y <= 18; y++) for (let x = x0; x <= x1; x++) B(x, y, (x + y) % 3 ? o.kilt : '#e8c070');
  if (o.armor) for (let y = 10; y <= 15; y++) for (let x = x0; x <= x1; x++) B(x, y, (x + (y % 2)) % 2 ? '#c49a46' : '#8a6a2a');
  for (let x = x0; x <= x1; x++) B(x, 14, o.belt);
  if (o.sling && !side) { B(9, 15, '#8a6a3a'); B(10, 15, '#8a6a3a'); B(10, 16, '#6a4a2a'); }
  if (o.sling && side) { B(9, 15, '#8a6a3a'); B(9, 16, '#6a4a2a'); }
  // arms
  if (!side) {
    for (let y = 11; y <= 15; y++) { const yl = y + (step === 1 ? 1 : step === -1 ? -1 : 0), yr = y - (step === 1 ? 1 : step === -1 ? -1 : 0); B(3, yl, y < 13 ? o.tunicDark : skin); B(12, yr, y < 13 ? o.tunicDark : skinD); }
  } else {
    const sx = step * 1;
    for (let y = 11; y <= 15; y++) { const dx = y >= 14 ? sx : 0; B(7 + dx, y, y < 13 ? o.tunicDark : skin); B(8 + dx, y, y < 13 ? o.tunicDark : skinD); }
  }
  // neck + head
  B(7, 10, skinD); B(8, 10, skinD);
  if (dir === 0) {
    for (let y = 3; y <= 9; y++) for (let x = 5; x <= 10; x++) B(x, y, skin);
    B(10, 8, skinD); B(10, 9, skinD);
    B(6, 6, OUT); B(9, 6, OUT); B(6, 5, '#ffffff'); B(9, 5, '#ffffff');
    B(7, 8, skinD); B(8, 8, skinD);
    if (o.beard) for (let x = 5; x <= 10; x++) { B(x, 9, hair); if (x > 5 && x < 10) B(x, 10, hair); }
  } else if (dir === 1) {
    for (let y = 3; y <= 9; y++) for (let x = 5; x <= 10; x++) B(x, y, hair);
  } else {
    for (let y = 3; y <= 9; y++) for (let x = 5; x <= 10; x++) B(x, y, skin);
    B(4, 7, skin); B(6, 6, OUT); B(6, 5, '#ffffff'); B(5, 8, skinD);
    for (let y = 3; y <= 8; y++) { B(9, y, hair); B(10, y, hair); }
    if (o.beard) { for (let x = 5; x <= 9; x++) B(x, 9, hair); B(6, 10, hair); }
  }
  // hair / headwear
  if (o.helmet) {
    for (let x = 4; x <= 11; x++) for (let y = 1; y <= 4; y++) B(x, y, (x + y) % 5 === 0 ? '#f0d080' : o.helmet);
    for (let x = 6; x <= 9; x++) B(x, 0, o.helmet);
    if (dir !== 1) { B(side ? 5 : 7, 5, o.helmet); B(side ? 5 : 8, 5, o.helmet); B(side ? 5 : 7, 6, o.helmet); }
  } else if (o.headcloth) {
    for (let x = 4; x <= 11; x++) for (let y = 2; y <= 4; y++) B(x, y, y === 4 ? '#00000000' && o.headcloth : o.headcloth);
    for (let x = 5; x <= 10; x++) B(x, 1, o.headcloth);
    const tail = o.veil ? 12 : 8;
    if (dir !== 0) for (let y = 4; y <= tail; y++) { B(side ? 10 : 5, y, o.headcloth); B(side ? 11 : 10, y, o.headcloth); if (dir === 1) for (let x = 5; x <= 10; x++) B(x, y, o.headcloth); }
    else for (let y = 4; y <= tail; y++) { B(4, y, o.headcloth); B(11, y, o.headcloth); }
    if (o.feathers) for (let x = 4; x <= 11; x++) for (let y = -1; y <= 1; y++) if (x % 2 === 0) B(x, y + 1, '#efe6cf');
  } else {
    for (let x = 5; x <= 10; x++) { B(x, 2, hair); B(x, 3, hair); }
    for (let x = 6; x <= 9; x++) B(x, 1, hair);
    if (o.curly) { B(4, 3, hair); B(11, 3, hair); B(6, 1, hairHi); B(9, 2, hairHi); B(4, 5, hair); if (!side) { B(11, 5, hair); B(4, 4, hair); B(11, 4, hair); B(5, 4, hair); B(10, 4, hair); } else { B(9, 2, hairHi); B(11, 5, hair); B(11, 6, hair); } }
    if (dir === 0) { B(5, 4, hair); B(10, 4, hair); B(7, 3, hairHi); }
    if (o.feathers) for (let x = 4; x <= 11; x++) { B(x, 1, '#c9a24a'); if (x % 2 === 0) { B(x, 0, '#efe6cf'); B(x, -1, '#efe6cf'); } }
  }
  // held items
  if (o.staff) { const sx = dir === 0 ? 13 : dir === 1 ? 2 : 3; for (let y = 4; y <= 23; y++) B(sx, y, y < 6 ? '#8a6238' : '#6e4a2a'); if (dir === 0) B(12, 3, '#6e4a2a'); }
  if (o.spear) { const sx = dir === 0 ? 13 : dir === 1 ? 2 : 3; for (let y = 0; y <= 23; y++) B(sx, y, y < 3 ? '#c9c9c0' : '#6e4a2a'); B(sx, -1, '#e8e8e0'); }
  if (o.shield && dir !== 1) { const sx0 = side ? 2 : 3; for (let y = 8; y <= 20; y++) for (let x = sx0; x <= sx0 + 6; x++) B(x, y, (x === sx0 || x === sx0 + 6 || y === 8 || y === 20) ? '#5a4020' : (x + y) % 4 ? '#9a6e3a' : '#b0844a'); }
}

function drawSheep(p, ox, oy, f, kind) {
  const r = rand(kind === 'sheep' ? 11 + f : 21 + f);
  const S = (x, y, c) => p.set(ox + x, oy + y, c);
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  if (kind === 'sheep') {
    for (let y = 5; y <= 11; y++) for (let x = 3; x <= 13; x++) {
      const dx = (x - 8.2) / 5.6, dy = (y - 8) / 3.6;
      if (dx * dx + dy * dy <= 1) S(x, y + (step ? -0 : 0), pick(r, ['#ece4d2', '#e2d8c2', '#f6f0e2', '#d8cdb5']));
    }
    for (let y = 8; y <= 11; y++) { S(14, y, '#e2d8c2'); S(13, y + 1, '#d8cdb5'); }
    for (let y = 5; y <= 9; y++) for (let x = 0; x <= 3; x++) if (!(x === 0 && (y === 5 || y === 9))) S(x, y, '#4a3a30');
    S(1, 6, '#1a1210'); S(3, 5, '#3a2e28'); S(4, 6, '#3a2e28');
    const legs = step === 0 ? [4, 6, 10, 12] : step > 0 ? [3, 7, 9, 13] : [5, 5, 11, 11];
    for (const lx of legs) for (let y = 12; y <= 14; y++) S(lx, y, '#4a3a30');
  } else {
    const body = kind === 'ibex' ? ['#b8925e', '#ad8754', '#c29c68'] : ['#2f2723', '#3a302a'];
    for (let y = 6; y <= 10; y++) for (let x = 4; x <= 12; x++) S(x, y, pick(r, body));
    for (let x = 5; x <= 11; x++) S(x, 10, kind === 'ibex' ? '#e8dcc0' : '#4a3e36');
    for (let y = 4; y <= 8; y++) for (let x = 1; x <= 4; x++) S(x, y, body[0]);
    S(1, 8, '#2a1e18'); S(2, 5, '#1a1210'); S(1, 9, '#5a4632');
    const horn = '#5a4632';
    [[4, 3], [5, 2], [6, 1], [7, 1], [8, 2], [9, 3], [5, 3], [6, 2]].forEach(([x, y]) => S(x, y, horn));
    if (kind === 'ibex') { S(10, 4, horn); S(9, 4, horn); }
    S(13, 7, body[1]);
    const legs = step === 0 ? [5, 7, 10, 12] : step > 0 ? [4, 8, 9, 13] : [6, 6, 11, 11];
    for (const lx of legs) for (let y = 11; y <= 14; y++) S(lx, y, y === 12 ? '#f0e8d8' : kind === 'ibex' ? '#6a4e30' : '#2a2220');
  }
}

function outline(p, color = OUT) {
  const add = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (p.alpha(x, y)) continue;
    if (p.alpha(x - 1, y) > 128 || p.alpha(x + 1, y) > 128 || p.alpha(x, y - 1) > 128 || p.alpha(x, y + 1) > 128) add.push([x, y]);
  }
  for (const [x, y] of add) p.set(x, y, color);
}

// Sheet: 4 frames across, 4 directions down (0 front,1 back,2 left,3 right). Frame = fw x fh.
export function makeCharacterSheet(kind, look) {
  const animal = kind === 'sheep' || kind === 'ibex' || kind === 'goat';
  const fw = 16, fh = animal ? 16 : 24;
  const p = new Painter(fw * 4, fh * 4);
  for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) {
    // draw each frame into its own small painter so outlines don't merge
    const q = new Painter(fw + 2, fh + 2);
    if (animal) {
      drawSheep(q, 1, 1, f, kind);
    } else drawHuman(q, 1, 1, d, f, look);
    if (animal && (d === 3 || d === 1)) {
      // mirror for facing right
      const m = new Painter(fw + 2, fh + 2);
      for (let y = 0; y < fh + 2; y++) for (let x = 0; x < fw + 2; x++) { const c = q.get(x, y); if (c[3]) m.set(fw + 1 - x, y, [c[0], c[1], c[2]], c[3]); }
      outline(m);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const c = m.get(x + 1, y + 1); if (c[3]) p.set(f * fw + x, d * fh + y, [c[0], c[1], c[2]], c[3]); }
      continue;
    }
    outline(q);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const c = q.get(x + 1, y + 1); if (c[3]) p.set(f * fw + x, d * fh + y, [c[0], c[1], c[2]], c[3]); }
  }
  const t = tex(p.flush());
  t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return { texture: t, fw, fh, cols: 4, rows: 4 };
}

export function makeFlameSheet() {
  const p = new Painter(8 * 4, 12);
  for (let f = 0; f < 4; f++) {
    const r = rand(300 + f);
    for (let y = 0; y < 12; y++) {
      const wdt = Math.max(0, Math.round((y / 11) * 3.2 + (r() - 0.5) * 1.4));
      const cx = 4 + Math.round(Math.sin(f * 1.7 + y * 0.6) * (y < 6 ? 1 : 0));
      for (let x = cx - wdt; x <= cx + wdt - 1; x++) {
        const edge = Math.abs(x - cx + 0.5) / (wdt + 0.01);
        const c = y < 3 ? '#ff7a2a' : edge > 0.6 ? '#ff8a30' : y > 8 && edge < 0.4 ? '#fff6c8' : '#ffc24a';
        p.set(f * 8 + x, y, c);
      }
    }
  }
  const t = tex(p.flush());
  t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export function makeIconTexture(kind) {
  const p = new Painter(9, 9);
  if (kind === 'diamond') {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const d = Math.abs(x - 4) + Math.abs(y - 4); if (d <= 4) p.set(x, y, d <= 1 ? '#ffffff' : d <= 2 ? '#ffe9a0' : d === 4 ? '#8a5a1a' : '#f2b640'); }
  } else if (kind === 'stone') {
    for (let y = 2; y < 8; y++) for (let x = 1; x < 8; x++) { const dx = (x - 4) / 3.4, dy = (y - 5) / 2.6; if (dx * dx + dy * dy <= 1) p.set(x, y, y < 4 ? '#f2eee4' : y < 6 ? '#cfcabc' : '#9e9a8c'); }
    p.set(3, 3, '#ffffff');
  } else if (kind === 'glow') {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const d = Math.hypot(x - 4, y - 4) / 4.5; if (d < 1) p.set(x, y, '#ffffff', Math.round((1 - d) * (1 - d) * 255)); }
  }
  const t = tex(p.flush());
  t.minFilter = THREE.LinearFilter; t.magFilter = kind === 'glow' ? THREE.LinearFilter : THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export function makeSoftTexture(size = 64, kind = 'radial') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (kind === 'radial') {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  } else if (kind === 'shaft') {
    const gr = g.createLinearGradient(0, 0, size, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const gv = g.createLinearGradient(0, 0, 0, size);
    gv.addColorStop(0, 'rgba(0,0,0,1)'); gv.addColorStop(0.15, 'rgba(0,0,0,0)'); gv.addColorStop(0.8, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gv; g.fillRect(0, 0, size, size);
  } else if (kind === 'blob') {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
