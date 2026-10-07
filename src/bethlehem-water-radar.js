// Tactical top-down radar overlay for "베들레헴의 물".
// Reads only data the player could legitimately know from a tactical map:
// static LAYOUT geometry (obstacles/shelters) plus per-frame guard/player/noise
// state that is already surfaced to the player through stealthInfo()/sightPolygon().
// Draws real sight cones from core.sightPolygon when available; never invents or
// duplicates core detection math, and never reveals guard intent beyond heading/mode.
// No magic circles: bushes are drawn as foliage patches, not glowing auras.

import { SIGHT_COLORS as MODE_COLOR, SIGHT_OPACITY } from './bethlehem-stealth-palette.js';

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export const MODE_LABEL_KO = {
  patrol: '순찰', suspicious: '의심', investigate: '확인 중', search: '수색 중', alert: '추격',
};

export function createRadar({
  layout,
  core,
  canvasId = 'radar-canvas',
  rootId = 'radar',
  toggleId = 'radar-toggle',
} = {}) {
  const canvas = document.getElementById(canvasId);
  const root = document.getElementById(rootId);
  const toggle = document.getElementById(toggleId);
  const ctx = canvas ? canvas.getContext('2d') : null;
  let collapsed = false;

  const bounds = (layout && layout.bounds) || { minX: -21, maxX: 21, minZ: -32, maxZ: 27 };
  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldD = Math.max(1, bounds.maxZ - bounds.minZ);

  function setCollapsed(next) {
    collapsed = !!next;
    if (root) root.classList.toggle('collapsed', collapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.textContent = collapsed ? '+' : '접기';
      toggle.setAttribute('aria-label', collapsed ? '전술 지도 펼치기' : '전술 지도 접기');
    }
  }
  if (toggle) toggle.addEventListener('click', () => setCollapsed(!collapsed));

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  const mapScale = () => Math.min(canvas.width / worldW, canvas.height / worldD);
  function toCanvas(x, z) {
    const k=mapScale();
    return [(canvas.width-worldW*k)/2+(x-bounds.minX)*k,(canvas.height-worldD*k)/2+(z-bounds.minZ)*k];
  }

  function drawShelters() {
    const shelters = layout && layout.shelters;
    if (!shelters) return;
    for (const s of shelters) {
      const [cx, cz] = toCanvas(s.x, s.z);
      const r = Math.max(4, (s.radius || 2.5) * mapScale());
      ctx.beginPath();
      ctx.fillStyle = 'rgba(94,122,70,0.4)';
      ctx.strokeStyle = 'rgba(160,192,120,0.55)';
      ctx.lineWidth = 1;
      ctx.arc(cx, cz, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // a few leaf flecks so it reads as foliage, not a status ring
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + cx * 0.01;
        ctx.fillStyle = 'rgba(180,210,140,0.5)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.5, cz + Math.sin(a) * r * 0.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawObstacles() {
    const obstacles = layout && layout.obstacles;
    if (!obstacles) return;
    for (const o of obstacles) {
      const tall = o.kind ? o.kind !== 'cover' : (o.h == null || o.h >= 3);
      const [x0, z0] = toCanvas(o.x - o.w / 2, o.z - o.d / 2);
      const [x1, z1] = toCanvas(o.x + o.w / 2, o.z + o.d / 2);
      ctx.beginPath();
      ctx.fillStyle = tall ? 'rgba(40,36,28,0.85)' : 'rgba(130,112,78,0.5)';
      ctx.strokeStyle = tall ? 'rgba(255,245,222,0.35)' : 'rgba(255,245,222,0.22)';
      ctx.lineWidth = tall ? 1.4 : 1;
      ctx.setLineDash(tall ? [] : [3, 3]);
      ctx.rect(Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0));
      ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawSightPolygon(guard, crouching, color) {
    if (typeof core?.sightPolygon !== 'function') return;
    let poly;
    try { poly = core.sightPolygon(guard, crouching); } catch { poly = null; }
    if (!Array.isArray(poly) || poly.length < 2) return;
    ctx.beginPath();
    const [ox, oz] = toCanvas(guard.x, guard.z);
    ctx.moveTo(ox, oz);
    for (const pt of poly) {
      const [px, pz] = toCanvas(pt.x, pt.z);
      ctx.lineTo(px, pz);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, SIGHT_OPACITY[guard.mode] || SIGHT_OPACITY.patrol);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.95);
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  function drawGuards(state, playerCrouching) {
    for (const g of state.guards || []) {
      const mode = g.mode || 'patrol';
      const color = MODE_COLOR[mode] || MODE_COLOR.patrol;
      drawSightPolygon(g, !!playerCrouching, color);
    }
    for (const g of state.guards || []) {
      const mode = g.mode || 'patrol';
      const color = MODE_COLOR[mode] || MODE_COLOR.patrol;
      const [gx, gz] = toCanvas(g.x, g.z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(gx, gz, 5, 0, Math.PI * 2); ctx.fill();
      const heading = g.heading || 0;
      const hx = gx + Math.sin(heading) * 11, hz = gz + Math.cos(heading) * 11;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx, gz); ctx.lineTo(hx, hz); ctx.stroke();
      if (g.lastSeen && (mode === 'investigate' || mode === 'search')) {
        const [lx, lz] = toCanvas(g.lastSeen.x, g.lastSeen.z);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(lx, lz, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', lx, lz - 7);
      }
    }
  }

  function drawNoise(state) {
    const sounds=[state.noise];
    if(state.movementNoise && state.noise?.kind==='stone')sounds.push(state.movementNoise);
    for(const noise of sounds){
      if (!noise) continue;
      const [nx, nz] = toCanvas(noise.x, noise.z);
      const r = Math.max(2, (noise.radius || 0) * mapScale());
      const ttl = Number.isFinite(noise.ttl) ? Math.max(0, Math.min(1, noise.ttl)) : 1;
      ctx.strokeStyle = `rgba(255,224,160,${0.15 + ttl * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(nx, nz, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawObjective(state) {
    const target = typeof core?.targetFor === 'function' ? core.targetFor(state) : null;
    if (!target) return;
    const [tx, tz] = toCanvas(target.x, target.z);
    ctx.fillStyle = 'rgba(255,246,223,0.92)';
    ctx.beginPath();
    ctx.moveTo(tx, tz - 7); ctx.lineTo(tx + 6, tz + 5); ctx.lineTo(tx - 6, tz + 5);
    ctx.closePath(); ctx.fill();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p) return;
    const [px, pz] = toCanvas(p.x, p.z);
    ctx.fillStyle = p.crouching ? 'rgba(201,222,255,0.92)' : '#fff6df';
    ctx.beginPath(); ctx.arc(px, pz, p.crouching ? 4 : 5, 0, Math.PI * 2); ctx.fill();
    const heading = p.heading || 0;
    const hx = px + Math.sin(heading) * 10, hz = pz + Math.cos(heading) * 10;
    ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(hx, hz); ctx.stroke();
  }

  function render(state) {
    if (!ctx || collapsed || !state || !state.player) return;
    resizeCanvas();
    if (!canvas.width || !canvas.height) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(16,24,22,0.74)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawShelters();
    drawObstacles();
    drawNoise(state);
    drawGuards(state, !!state.player.crouching);
    drawObjective(state);
    drawPlayer(state);
  }

  setCollapsed(false);
  return { render, setCollapsed, isCollapsed: () => collapsed };
}
