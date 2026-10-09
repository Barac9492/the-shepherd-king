// Procedural art for the Psalm 57 cave: the fresco wall (colour, relief, gold mask) and the painted
// David sprite sheet. Everything is drawn in code; no external or paid art.
import * as core from './psalm57-core.js';
import { SCENE1_SEGMENTS } from './psalm57-text.js';

const W_UNITS = core.WALL.length, H_UNITS = core.WALL.height;
const FONT = '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';

// Which verse segment is carved on which ledge (segment 6 sits above the exit doorway).
export const PLATFORM_TEXT = Object.freeze({ p1: 0, p2: 1, p3: 2, wings: 3, ground2: 4 });
const GROUND2_TEXT_RANGE = [30.9, 43.7];

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Draw the wall at `ppu` pixels per wall unit into three canvases: colour, height, gold mask. */
export function drawFresco(ppu) {
  const w = Math.round(W_UNITS * ppu), h = Math.round(H_UNITS * ppu);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [colC, g] = mk(), [hC, hg] = mk(), [gC, gg] = mk();
  const P = (u) => u * ppu, Q = (y) => (H_UNITS - y) * ppu;
  const R = rng(57);

  // ---------- base plaster ----------
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#2c3f5e'); base.addColorStop(0.32, '#3b5172'); base.addColorStop(0.36, '#b98c58');
  base.addColorStop(0.7, '#a77445'); base.addColorStop(1, '#8a5a34');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, w, h);
  gg.fillStyle = '#000'; gg.fillRect(0, 0, w, h);

  // night sky: stars in gold leaf
  for (let i = 0; i < 140; i++) {
    const x = R() * w, y = Q(13.0 - R() * 3.6), r = (0.03 + R() * 0.05) * ppu;
    g.fillStyle = '#f1cf72'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    gg.fillStyle = '#fff'; gg.beginPath(); gg.arc(x, y, r, 0, 7); gg.fill();
  }
  // crescent moon
  g.fillStyle = '#f6dfa0'; g.beginPath(); g.arc(P(8), Q(11.6), 0.55 * ppu, 0, 7); g.fill();
  g.fillStyle = '#34496a'; g.beginPath(); g.arc(P(8.25), Q(11.75), 0.5 * ppu, 0, 7); g.fill();
  gg.fillStyle = '#fff'; gg.beginPath(); gg.arc(P(8), Q(11.6), 0.55 * ppu, 0, 7); gg.fill();

  // En-gedi cliffs, layered
  const cliff = (color, top, amp, seed, alpha) => {
    const r2 = rng(seed); g.globalAlpha = alpha; g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
    for (let u = 0; u <= W_UNITS + 1; u += 0.8) g.lineTo(P(u), Q(top + Math.sin(u * 0.35 + seed) * amp + (r2() - 0.5) * amp * 0.6));
    g.lineTo(w, h); g.closePath(); g.fill(); g.globalAlpha = 1;
  };
  cliff('#9b6a3e', 9.2, 0.9, 3, 0.75);
  cliff('#86562f', 7.4, 1.1, 7, 0.65);
  cliff('#6f4526', 5.2, 0.7, 11, 0.45);

  // spring falling down the cliff (En-gedi's waters)
  g.strokeStyle = 'rgba(126,178,214,.75)'; g.lineWidth = 0.09 * ppu; g.lineCap = 'round';
  for (let k = 0; k < 5; k++) { const x0 = P(34.2 + k * 0.18); g.beginPath(); g.moveTo(x0, Q(8.8)); for (let y = 8.8; y > 2.2; y -= 0.4) g.lineTo(x0 + Math.sin(y * 2 + k) * 0.06 * ppu, Q(y)); g.stroke(); }
  g.fillStyle = 'rgba(126,178,214,.5)'; g.beginPath(); g.ellipse(P(34.6), Q(2.15), 1.1 * ppu, 0.18 * ppu, 0, 0, 7); g.fill();

  // ibex on the cliffs (painted silhouettes)
  const ibex = (u, y, s, flip) => {
    g.save(); g.translate(P(u), Q(y)); g.scale(flip ? -s * ppu : s * ppu, s * ppu);
    g.fillStyle = '#4a2b17'; g.strokeStyle = '#4a2b17'; g.lineWidth = 0.08;
    g.beginPath(); g.ellipse(0, 0, 0.55, 0.25, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(0.55, -0.28, 0.18, 0.13, -0.4, 0, 7); g.fill();
    for (const lx of [-0.38, -0.2, 0.25, 0.4]) { g.beginPath(); g.moveTo(lx, 0.15); g.lineTo(lx + 0.02, 0.62); g.stroke(); }
    g.lineWidth = 0.07; g.beginPath(); g.moveTo(0.58, -0.38); g.quadraticCurveTo(0.2, -1.1, -0.15, -0.75); g.stroke();
    g.restore();
  };
  ibex(13.2, 9.4, 1.0, false); ibex(19.4, 10.1, 0.8, true); ibex(40.5, 8.9, 0.95, true);

  // palms near the spring
  const palm = (u, y0, ht) => {
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 0.16 * ppu; g.beginPath(); g.moveTo(P(u), Q(y0)); g.quadraticCurveTo(P(u + 0.3), Q(y0 + ht * 0.6), P(u + 0.1), Q(y0 + ht)); g.stroke();
    g.fillStyle = '#4f6b34';
    for (let a = 0; a < 7; a++) { const ang = -Math.PI / 2 + (a - 3) * 0.42; g.save(); g.translate(P(u + 0.1), Q(y0 + ht)); g.rotate(ang + Math.PI / 2); g.beginPath(); g.ellipse(0.7 * ppu, 0, 0.75 * ppu, 0.13 * ppu, 0.25, 0, 7); g.fill(); g.restore(); }
  };
  palm(32.2, 2.0, 4.6); palm(37.6, 2.0, 3.8); palm(42.0, 2.0, 5.0);

  // weathering: speckle, plaster losses, fine cracks
  for (let i = 0; i < 9000; i++) { const x = R() * w, y = R() * h; const l = R() > 0.5; g.fillStyle = l ? 'rgba(255,240,210,.06)' : 'rgba(30,18,8,.07)'; g.fillRect(x, y, 1 + R() * 4, 1 + R() * 3); }
  for (let i = 0; i < 26; i++) {
    const x = R() * w, y = R() * h * 0.95, r = (0.25 + R() * 0.7) * ppu;
    g.fillStyle = 'rgba(226,196,150,.16)'; hg.fillStyle = '#8c8c8c';
    for (const c of [g, hg]) { c.beginPath(); for (let a = 0; a < 7; a += 0.6) c.lineTo(x + Math.cos(a) * r * (0.6 + R() * 0.5), y + Math.sin(a) * r * (0.5 + R() * 0.5)); c.closePath(); c.fill(); }
  }
  g.strokeStyle = 'rgba(25,14,6,.55)'; hg.strokeStyle = '#3a3a3a';
  for (let i = 0; i < 40; i++) {
    let x = R() * w, y = R() * h; const pts = [[x, y]];
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * ppu * 1.4; y += R() * ppu * 0.9; pts.push([x, y]); }
    for (const [c, lw] of [[g, 2], [hg, 3]]) { c.lineWidth = lw; c.beginPath(); pts.forEach(([a, b], k) => (k ? c.lineTo(a, b) : c.moveTo(a, b))); c.stroke(); }
  }

  // ---------- painted borders (top and bottom registers) ----------
  const band = (y0, y1, color) => { g.fillStyle = color; g.fillRect(0, Q(y1), w, Q(y0) - Q(y1)); hg.fillStyle = '#a8a8a8'; hg.fillRect(0, Q(y1), w, Q(y0) - Q(y1)); };
  band(13.25, 14, '#6c2818');
  band(0, 0.45, '#5b2416');
  g.strokeStyle = '#d6aa4c'; g.lineWidth = 0.06 * ppu; gg.strokeStyle = '#fff'; gg.lineWidth = 0.06 * ppu;
  for (const c of [g, gg]) { c.beginPath(); for (let u = 0; u <= W_UNITS; u += 0.1) c.lineTo(P(u), Q(13.62 + Math.sin(u * 2.2) * 0.17)); c.stroke(); }
  g.fillStyle = '#6f8a3c';
  for (let u = 0.3; u < W_UNITS; u += 0.72) { const y = 13.62 + Math.sin(u * 2.2) * 0.17; g.beginPath(); g.ellipse(P(u), Q(y + 0.17), 0.16 * ppu, 0.07 * ppu, 0.6, 0, 7); g.fill(); }

  // ---------- broken floor: the plaster has fallen away ----------
  const gap = core.GAP;
  for (const c of [g, hg]) {
    c.fillStyle = c === g ? '#24180f' : '#2a2a2a';
    c.beginPath(); c.moveTo(P(gap.u0), Q(0)); c.lineTo(P(gap.u0), Q(1.7));
    for (let u = gap.u0; u <= gap.u1; u += 0.35) c.lineTo(P(u), Q(1.65 + (R() - 0.5) * 0.5 + (u - gap.u0 < 1 || gap.u1 - u < 1 ? 0.2 : 0)));
    c.lineTo(P(gap.u1), Q(1.7)); c.lineTo(P(gap.u1), Q(0)); c.closePath(); c.fill();
  }
  for (let i = 0; i < 260; i++) { const u = gap.u0 + R() * (gap.u1 - gap.u0), y = R() * 1.4; const s = (0.05 + R() * 0.16) * ppu; g.fillStyle = `rgba(${90 + R() * 40},${70 + R() * 30},${50 + R() * 20},.7)`; g.fillRect(P(u), Q(y), s, s * 0.7); hg.fillStyle = `rgb(${60 + R() * 80},${60 + R() * 80},${60 + R() * 80})`; hg.fillRect(P(u), Q(y), s, s * 0.7); }

  // ---------- the crack (start shelter) ----------
  const crack = [[0, 0], [2.0, 0], [1.6, 1.4], [2.15, 2.6], [1.5, 4.0], [1.95, 5.4], [1.2, 6.6], [0.6, 7.2], [0, 7.0]];
  for (const c of [g, hg]) { c.fillStyle = c === g ? '#0b0705' : '#000'; c.beginPath(); crack.forEach(([u, y], k) => (k ? c.lineTo(P(u), Q(y)) : c.moveTo(P(u), Q(y)))); c.closePath(); c.fill(); }

  // ---------- the wings over "주의 날개 그늘 아래에서" ----------
  const wg = core.WINGS, cx = (wg.u0 + wg.u1) / 2;
  { const sg = g.createLinearGradient(0, Q(9.6), 0, Q(5.0)); sg.addColorStop(0, 'rgba(20,10,4,.32)'); sg.addColorStop(1, 'rgba(20,10,4,.08)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(P(wg.u0 - 0.6), Q(9.6)); g.quadraticCurveTo(P(cx), Q(10.6), P(wg.u1 + 0.6), Q(9.6)); g.lineTo(P(wg.u1), Q(5.0)); g.lineTo(P(wg.u0), Q(5.0)); g.closePath(); g.fill(); }
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      for (let f = 0; f < 7; f++) {
        const t = f / 6, len = (1.1 + row * 0.55) * (1 - t * 0.25);
        const bx = cx + side * (0.25 + t * 3.2), by = 11.6 - row * 0.62 - t * 0.9;
        const ang = side * (0.35 + t * 0.55) + (row * 0.05 * side);
        for (const c of [g, hg, gg]) {
          c.save(); c.translate(P(bx), Q(by)); c.rotate(Math.PI / 2 + ang);
          c.beginPath(); c.ellipse(len * 0.5 * ppu, 0, len * 0.5 * ppu, 0.2 * ppu, 0, 0, 7);
          if (c === g) { c.fillStyle = row === 0 ? '#eed9a0' : ['#e3c27a', '#d7ac58', '#c99448'][row - 1]; c.fill(); c.strokeStyle = '#6b4320'; c.lineWidth = 0.035 * ppu; c.stroke(); }
          else if (c === hg) { c.fillStyle = `rgb(${190 - row * 12},${190 - row * 12},${190 - row * 12})`; c.fill(); c.strokeStyle = '#707070'; c.lineWidth = 0.05 * ppu; c.stroke(); }
          else if (row === 0 || f % 2 === 0) { c.strokeStyle = '#fff'; c.lineWidth = 0.05 * ppu; c.stroke(); }
          c.restore();
        }
      }
    }
  }

  // ---------- carved ledges with the verse ----------
  const carve = (text, u0, u1, yTop, size = 0.72) => {
    if (!text) return;
    for (const c of [g, hg]) {
      c.save(); c.font = `800 ${Math.round(size * ppu)}px ${FONT}`; c.textBaseline = 'alphabetic';
      const tw = c.measureText(text).width, sx = Math.min(1.08, (P(u1) - P(u0)) / tw);
      c.translate(P(u0) + (P(u1) - P(u0) - tw * sx) / 2, Q(yTop - 0.15 - size * 0.86)); c.scale(sx, 1);
      if (c === g) { c.fillStyle = 'rgba(255,232,180,.45)'; c.fillText(text, 2, 2); c.fillStyle = '#2b170b'; c.fillText(text, 0, 0); }
      else { c.fillStyle = '#383838'; c.fillText(text, 0, 0); }
      c.restore();
    }
  };
  const ledge = (u0, u1, y) => {
    const top = Q(y), bot = Q(y - 1.0);
    const lg = g.createLinearGradient(0, top, 0, bot); lg.addColorStop(0, '#c99a62'); lg.addColorStop(1, '#8e6238');
    g.fillStyle = lg; g.fillRect(P(u0), top, P(u1 - u0), bot - top);
    hg.fillStyle = '#c8c8c8'; hg.fillRect(P(u0), top, P(u1 - u0), bot - top);
    g.fillStyle = '#e4bb5e'; g.fillRect(P(u0), top, P(u1 - u0), 0.09 * ppu);
    gg.fillStyle = '#fff'; gg.fillRect(P(u0), top, P(u1 - u0), 0.09 * ppu);
    hg.fillStyle = '#f0f0f0'; hg.fillRect(P(u0), top, P(u1 - u0), 0.09 * ppu);
    g.fillStyle = 'rgba(20,10,4,.45)'; g.fillRect(P(u0), bot, P(u1 - u0), 0.07 * ppu);
  };
  for (const p of core.PLATFORMS) {
    if (p.id === 'ground') { ledge(p.u0, p.u1, p.y); continue; }
    ledge(p.u0, p.u1, p.y);
    const seg = PLATFORM_TEXT[p.id];
    if (seg == null) continue;
    const [a, b] = p.id === 'ground2' ? GROUND2_TEXT_RANGE : [p.u0 + 0.2, p.u1 - 0.2];
    carve(SCENE1_SEGMENTS[seg], a, b, p.y);
  }

  // ---------- exit doorway at dawn, "피하리이다" on the lintel ----------
  const d0 = 46.35, d1 = 47.85, dy0 = core.PLATFORMS.find((p) => p.id === 'p6').y, dy1 = dy0 + 3.0;
  const dg = g.createLinearGradient(0, Q(dy1), 0, Q(dy0)); dg.addColorStop(0, '#ffe9b8'); dg.addColorStop(1, '#f2a85c');
  g.fillStyle = dg; g.beginPath(); g.moveTo(P(d0), Q(dy0)); g.lineTo(P(d0), Q(dy1 - 0.6)); g.quadraticCurveTo(P((d0 + d1) / 2), Q(dy1 + 0.3), P(d1), Q(dy1 - 0.6)); g.lineTo(P(d1), Q(dy0)); g.closePath(); g.fill();
  gg.fillStyle = '#bbb'; gg.fillRect(P(d0), Q(dy1), P(d1 - d0), Q(dy0) - Q(dy1));
  hg.fillStyle = '#404040'; hg.fillRect(P(d0), Q(dy1), P(d1 - d0), Q(dy0) - Q(dy1));
  carve(SCENE1_SEGMENTS[5], 45.6, 47.95, dy1 + 1.15, 0.5);

  return { color: colC, height: hC, gold: gC, width: w, height_px: h };
}

/** Sobel the height canvas into an RGBA normal map; alpha carries the gold mask. */
export function buildNormalMap(heightCanvas, goldCanvas, strength = 3.2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const H = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const G = goldCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  const at = (x, y) => H[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    // canvas y runs down; flip so the map is upright for UV (texture flipY = false below)
    const o = ((h - 1 - y) * w + x) * 4;
    out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = G[(y * w + x) * 4];
  }
  return { data: out, width: w, height: h };
}

/** Painted, profile-view David: 8 frames (0 idle, 1-6 run, 7 jump). Faces right. */
export function drawDavidSheet() {
  const FW = 128, FH = 192, N = 8;
  const c = document.createElement('canvas'); c.width = FW * N; c.height = FH; const g = c.getContext('2d');
  const OUT = '#24120a', SKIN = '#b8693c', TUNIC = '#a3311f', TRIM = '#e0b04f', HAIR = '#3a1d0e', STAFF = '#7a4f24';
  const limb = (x0, y0, a, len, wdt, color) => {
    const x1 = x0 + Math.sin(a) * len, y1 = y0 + Math.cos(a) * len;
    g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = wdt + 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = color; g.lineWidth = wdt; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    return [x1, y1];
  };
  for (let f = 0; f < N; f++) {
    g.save(); g.translate(f * FW, 0);
    const run = f >= 1 && f <= 6, ph = run ? ((f - 1) / 6) * Math.PI * 2 : 0, jump = f === 7;
    const bob = run ? Math.abs(Math.sin(ph)) * -5 : 0;
    const hipX = 62, hipY = 118 + bob;
    const lA = jump ? -0.6 : run ? Math.sin(ph) * 0.75 : 0.06, lB = jump ? 0.5 : run ? -Math.sin(ph) * 0.75 : -0.06;
    const kneeA = jump ? 0.9 : run ? Math.max(0, -Math.cos(ph)) * 0.9 : 0, kneeB = jump ? 0.2 : run ? Math.max(0, Math.cos(ph)) * 0.9 : 0;
    // back leg, back arm (darker)
    let [kx, ky] = limb(hipX - 4, hipY, lB, 32, 11, '#8f5530'); limb(kx, ky, lB - kneeB, 32, 10, '#8f5530');
    const shX = 64, shY = 66 + bob, aA = jump ? -2.3 : run ? -Math.sin(ph) * 0.9 : 0.15;
    let [ex, ey] = limb(shX - 3, shY, run ? Math.sin(ph) * 0.9 : -0.1, 26, 9, '#8f5530'); limb(ex, ey, -0.6, 22, 8, '#8f5530');
    // tunic
    g.fillStyle = TUNIC; g.strokeStyle = OUT; g.lineWidth = 4;
    g.beginPath(); g.moveTo(50, 60 + bob); g.lineTo(78, 60 + bob); g.lineTo(84, 124 + bob); g.lineTo(42, 124 + bob); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = TRIM; g.fillRect(43, 116 + bob, 40, 6); g.fillRect(50, 86 + bob, 30, 5);
    // front leg
    [kx, ky] = limb(hipX + 4, hipY, lA, 32, 12, SKIN); const [fx, fy] = limb(kx, ky, lA - kneeA, 32, 11, SKIN);
    g.fillStyle = '#5b3517'; g.fillRect(fx - 6, fy - 3, 16, 6);
    // head and hair
    g.fillStyle = SKIN; g.strokeStyle = OUT; g.lineWidth = 4;
    g.beginPath(); g.ellipse(68, 38 + bob, 15, 18, 0.1, 0, 7); g.fill(); g.stroke();
    g.fillStyle = HAIR; g.beginPath(); g.ellipse(62, 30 + bob, 15, 13, -0.3, Math.PI * 0.85, Math.PI * 2.15); g.fill();
    g.fillStyle = OUT; g.beginPath(); g.arc(75, 36 + bob, 2.4, 0, 7); g.fill();
    // front arm with shepherd's crook
    [ex, ey] = limb(shX + 4, shY, aA, 26, 10, SKIN); const [hx, hy] = limb(ex, ey, aA - 0.7, 22, 9, SKIN);
    g.strokeStyle = STAFF; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx + 4, hy + 50); g.lineTo(hx + 4, hy - 46); g.arc(hx + 14, hy - 46, 10, Math.PI, Math.PI * 2.1); g.stroke();
    g.restore();
  }
  return { canvas: c, frames: N, fw: FW, fh: FH };
}
