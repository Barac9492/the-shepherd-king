// Builds the voxel terrain, water, architecture and vegetation from the generated world.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { T, fbm, rand } from './world.js';
import { atlasUV, SIDE, makeTerrainAtlas, makePropTextures, makeTuftTextures } from './pixel.js';

export const TILT = -0.36; // billboard lean toward the camera
export const BILLBOARD_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT, 0, 0));

export function makeCoords(world) {
  const wx = (i) => i - world.W / 2;
  const wz = (j) => j - world.H / 2;
  const ti = (x) => Math.round(x + world.W / 2);
  const tj = (z) => Math.round(z + world.H / 2);
  return { wx, wz, ti, tj };
}

// ---------------- Terrain ----------------
function sideFor(t, lip, desert) {
  if (lip) {
    if (t === T.GRASS || t === T.FIELD) return SIDE.GRASS;
    if (t === T.DRY) return SIDE.DRY;
    if (t === T.LUSH) return SIDE.LUSH;
    if (t === T.SAND) return SIDE.SAND;
    if (t === T.PATH || t === T.SOIL || t === T.GRAVEL) return SIDE.SOIL;
  }
  if (t === T.PAVE) return SIDE.PAVE;
  if (desert || t === T.ROCK) return SIDE.ROCK;
  return SIDE.LIME;
}

export function buildTerrain(world) {
  const { W, H, height, type, idx, inb } = world;
  const { wx, wz } = makeCoords(world);
  const pos = [], nor = [], uv = [], col = [], ind = [];
  const r = rand(3);
  const quad = (p, n, u, c) => {
    const b = pos.length / 3;
    for (let k = 0; k < 4; k++) { pos.push(...p[k]); nor.push(...n); uv.push(...u[k]); col.push(...c[k]); }
    ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const hAt = (i, j) => (inb(i, j) ? height[idx(i, j)] : -2);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = idx(i, j), h = height[k], t = type[k];
    const x = wx(i), z = wz(j);
    // top face with corner AO
    const [u0, v0, u1, v1] = atlasUV(t);
    let uvs = [[u0, v1], [u0, v0], [u1, v0], [u1, v1]]; // corners: NW, SW, SE, NE
    if (t !== T.PAVE && t !== T.FIELD && t !== T.SAND) { const rot = Math.floor(r() * 4); uvs = uvs.slice(rot).concat(uvs.slice(0, rot)); }
    const tint = 0.9 + fbm(i * 0.15, j * 0.15, 21) * 0.2;
    const ao = (di, dj) => {
      let n = 0;
      if (hAt(i + di, j) > h + 0.2) n++; if (hAt(i, j + dj) > h + 0.2) n++; if (hAt(i + di, j + dj) > h + 0.2) n++;
      const f = tint * (1 - n * 0.14);
      return [f, f, f * 0.98];
    };
    quad([[x - 0.5, h, z - 0.5], [x - 0.5, h, z + 0.5], [x + 0.5, h, z + 0.5], [x + 0.5, h, z - 0.5]], [0, 1, 0], uvs,
      [ao(-1, -1), ao(-1, 1), ao(1, 1), ao(1, -1)]);
    // sides
    const desert = i > 97;
    for (const [di, dj, nx, nz] of [[1, 0, 1, 0], [-1, 0, -1, 0], [0, 1, 0, 1], [0, -1, 0, -1]]) {
      const nh = hAt(i + di, j + dj);
      if (nh >= h) continue;
      const bottom = Math.max(nh, -1);
      let seg = 0;
      for (let yt = h; yt > bottom + 0.001; yt -= 0.5, seg++) {
        const yb = Math.max(bottom, yt - 0.5);
        const s = sideFor(t, seg === 0, desert);
        const [a0, b0, a1, b1] = atlasUV(s);
        const vm = (b0 + b1) / 2;
        const upper = seg === 0 ? true : Math.round(yt * 2) % 2 === 0;
        const vt = upper ? b1 : vm, vb = upper ? vm : b0;
        const vbb = vt - (vt - vb) * ((yt - yb) / 0.5);
        const depthShade = (y) => 0.78 + 0.22 * Math.min(1, Math.max(0, (y - bottom) / Math.max(0.5, h - bottom)));
        let p;
        if (nx === 1) p = [[x + 0.5, yt, z + 0.5], [x + 0.5, yb, z + 0.5], [x + 0.5, yb, z - 0.5], [x + 0.5, yt, z - 0.5]];
        else if (nx === -1) p = [[x - 0.5, yt, z - 0.5], [x - 0.5, yb, z - 0.5], [x - 0.5, yb, z + 0.5], [x - 0.5, yt, z + 0.5]];
        else if (nz === 1) p = [[x - 0.5, yt, z + 0.5], [x - 0.5, yb, z + 0.5], [x + 0.5, yb, z + 0.5], [x + 0.5, yt, z + 0.5]];
        else p = [[x + 0.5, yt, z - 0.5], [x + 0.5, yb, z - 0.5], [x - 0.5, yb, z - 0.5], [x - 0.5, yt, z - 0.5]];
        const ct = depthShade(yt) * tint, cb = depthShade(yb) * tint;
        quad(p, [nx, 0, nz], [[a0, vt], [a0, vbb], [a1, vbb], [a1, vt]], [[ct, ct, ct], [cb, cb, cb], [cb, cb, cb], [ct, ct, ct]]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: makeTerrainAtlas(), vertexColors: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// ---------------- Water ----------------
export function buildWater(world) {
  const { W, H, water, idx } = world;
  const { wx, wz } = makeCoords(world);
  const pos = [], ind = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const lv = water[idx(i, j)];
    if (lv < 0) continue;
    const x = wx(i), z = wz(j), b = pos.length / 3;
    pos.push(x - 0.5, lv, z - 0.5, x - 0.5, lv, z + 0.5, x + 0.5, lv, z + 0.5, x + 0.5, lv, z - 0.5);
    ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ind);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, light: { value: 1 } }]),
    vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float time; uniform float light; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = floor(vW.xz * 16.0) / 16.0;
        float n = sin(p.x * 3.1 + time * 1.3) * sin(p.y * 2.3 - time * 1.1) + sin((p.x + p.y) * 5.7 + time * 2.0) * 0.5;
        float sea = smoothstep(55.0, 61.0, vW.x);
        vec3 shallow = vec3(0.30, 0.62, 0.62), deep = vec3(0.12, 0.36, 0.46);
        vec3 c = mix(shallow, deep, 0.5 + 0.25 * n);
        c = mix(c, vec3(0.32, 0.62, 0.64), sea * 0.4);
        float spark = step(1.15, n + 0.35 * sin(p.x * 13.0 + p.y * 7.0 + time * 3.0));
        spark *= 1.0 - sea * 0.85;
        c += spark * vec3(1.4, 1.5, 1.5);
        c *= light;
        gl_FragColor = vec4(c, 0.74 + spark * 0.2);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  return m;
}

// ---------------- Props ----------------
class Builder {
  constructor(textures) { this.tex = textures; this.buckets = {}; }
  add(key, geo) { (this.buckets[key] ||= []).push(geo); }
  box(key, x, y, z, w, h, d, rotY = 0, rotX = 0, rotZ = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const n = f * 4 + v; uv.setXY(n, uv.getX(n) * dims[f][0], uv.getY(n) * dims[f][1]); }
    if (rotX) g.rotateX(rotX); if (rotZ) g.rotateZ(rotZ); if (rotY) g.rotateY(rotY);
    g.translate(x, y + h / 2, z);
    this.add(key, g);
    return g;
  }
  cyl(key, x, y, z, rt, rb, h, seg = 8) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    const uv = g.attributes.uv;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * Math.PI * 2 * Math.max(rt, rb), uv.getY(n) * h);
    g.translate(x, y + h / 2, z);
    this.add(key, g);
  }
  prism(key, x, y, z, w, h, d) { // ridge tent along x
    const g = new THREE.CylinderGeometry(1, 1, w, 3, 1, false);
    g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(0, -bb.min.y, 0);
    g.scale(1, h / (bb.max.y - bb.min.y), (d / 2) / Math.max(Math.abs(bb.min.z), bb.max.z));
    const uv = g.attributes.uv;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * 3, uv.getY(n) * w);
    g.translate(x, y, z);
    this.add(key, g);
  }
  build(group) {
    for (const [key, list] of Object.entries(this.buckets)) {
      const geo = mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g), false);
      const t = this.tex[key];
      const mat = key === 'dark' ? new THREE.MeshBasicMaterial({ color: 0x1a1410 }) : new THREE.MeshLambertMaterial({ map: t });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'props:' + key;
      group.add(m);
    }
  }
}

export function buildProps(world, ctx) {
  const { wx, wz } = makeCoords(world);
  const F = world.features;
  const TX = makePropTextures();
  const B = new Builder(TX);
  const group = new THREE.Group();
  const r = rand(77);
  const windows = []; // world positions of window panes that glow at night
  const lights = []; // {pos: Vector3, small:boolean}
  const tileX0 = (i) => wx(i) - 0.5, tileZ0 = (j) => wz(j) - 0.5;

  // houses
  for (const h of F.houses) {
    const x0 = tileX0(h.i0) + 0.06, z0 = tileZ0(h.j0) + 0.06, w = h.w - 0.12, d = h.d - 0.12;
    const cx = x0 + w / 2, cz = z0 + d / 2, y = h.y;
    const wallKey = h.style === 2 ? 'ashlar' : h.style === 1 ? 'mudbrick' : 'plaster';
    B.box('ashlar', cx, y, cz, w + 0.08, 0.35, d + 0.08);
    B.box(wallKey, cx, y + 0.35, cz, w, h.h - 0.35, d);
    B.box('roof', cx, y + h.h, cz, w + 0.14, 0.14, d + 0.14);
    for (const [px, pz, pw, pd] of [[cx, z0 - 0.02, w + 0.14, 0.12], [cx, z0 + d + 0.02, w + 0.14, 0.12], [x0 - 0.02, cz, 0.12, d + 0.14], [x0 + w + 0.02, cz, 0.12, d + 0.14]])
      B.box(wallKey, px, y + h.h + 0.14, pz, pw, 0.2, pd);
    // beams poking out under the roof
    for (let bx = x0 + 0.3; bx < x0 + w; bx += 0.6) B.box('wood', bx, y + h.h - 0.2, z0 + d + 0.08, 0.1, 0.1, 0.18);
    const dx = cx + (h.w > 2 ? (r() - 0.5) * (w - 1.2) : 0);
    B.box('door', dx, y, z0 + d + 0.02, 0.5, 0.95, 0.06);
    B.box('wood', dx, y + 0.95, z0 + d + 0.05, 0.7, 0.1, 0.1);
    const winY = y + Math.min(h.h - 0.55, 1.35);
    for (const wxp of [x0 + 0.35, x0 + w - 0.35]) if (Math.abs(wxp - dx) > 0.55) { B.box('dark', wxp, winY, z0 + d + 0.01, 0.24, 0.26, 0.04); windows.push(new THREE.Vector3(wxp, winY + 0.13, z0 + d + 0.045)); }
    if (h.style === 1 && h.w >= 3) for (let s = 0; s < 5; s++) B.box(wallKey, x0 + w + 0.22, y, z0 + d - 0.3 - s * 0.36, 0.4, (s + 1) * (h.h / 5), 0.36);
    if (r() < 0.5) B.box('hay', cx + (r() - 0.5) * (w - 0.8), y + h.h + 0.14, cz + (r() - 0.5) * (d - 0.8), 0.6, 0.18, 0.4, r());
    if (h.style === 2 && r() < 0.8) B.box(['clothRed', 'clothBlue', 'clothGreen'][Math.floor(r() * 3)], cx, y + 1.25, z0 + d + 0.35, Math.min(w, 1.6), 0.06, 0.7, 0, 0.25);
    if (r() < 0.6) { B.cyl('terracotta', x0 + 0.2, y, z0 + d + 0.3, 0.12, 0.16, 0.42, 7); }
  }
  // town walls and fold walls
  for (const wl of F.walls) {
    if (wl.fold) { const s = 0.36 + r() * 0.12; B.box('fieldstone', wl.x - world.W / 2, wl.y, wl.z - world.H / 2, s, wl.h, s, r() * 3); continue; }
    B.box('ashlar', wx(wl.i), wl.y, wz(wl.j), 1.0, wl.h, 1.0);
    if ((wl.i + wl.j) % 2 === 0) B.box('ashlar', wx(wl.i), wl.y + wl.h, wz(wl.j), 0.5, 0.25, 0.5);
  }
  for (const tw of F.towers) {
    const x = wx(tw.i), z = wz(tw.j);
    B.box('ashlar', x, tw.y, z, 1.3, tw.h, 1.3);
    for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) B.box('ashlar', x + a, tw.y + tw.h, z + b, 0.38, 0.3, 0.38);
    B.box('dark', x, tw.y + tw.h - 0.8, z + 0.66, 0.16, 0.36, 0.02);
  }
  // stronghold of Zion
  if (F.stronghold) {
    const s = F.stronghold, x0 = tileX0(s.i0), z0 = tileZ0(s.j0), cx = x0 + s.w / 2, cz = z0 + s.d / 2;
    B.box('ashlar', cx, s.y, cz, s.w - 0.2, s.h, s.d - 0.2);
    B.box('roof', cx, s.y + s.h, cz, s.w - 0.1, 0.12, s.d - 0.1);
    for (let k = 0; k < s.w; k++) if (k % 2 === 0) { B.box('ashlar', x0 + 0.3 + k, s.y + s.h + 0.12, z0 + s.d - 0.2, 0.42, 0.3, 0.3); B.box('ashlar', x0 + 0.3 + k, s.y + s.h + 0.12, z0 + 0.2, 0.42, 0.3, 0.3); }
    for (const [a, b] of [[x0 + 0.6, z0 + 0.6], [x0 + s.w - 0.6, z0 + 0.6], [x0 + 0.6, z0 + s.d - 0.6], [x0 + s.w - 0.6, z0 + s.d - 0.6]]) {
      B.box('ashlar', a, s.y, b, 1.4, s.h + 1.1, 1.4);
      for (const [c, d] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) B.box('ashlar', a + c, s.y + s.h + 1.1, b + d, 0.38, 0.3, 0.38);
    }
    B.box('door', cx, s.y, z0 + s.d - 0.08, 1.1, 1.5, 0.06);
    B.box('wood', cx, s.y + 1.5, z0 + s.d - 0.05, 1.4, 0.14, 0.12);
    for (const k of [-3, -1.8, 1.8, 3]) { B.box('dark', cx + k, s.y + 2.2, z0 + s.d - 0.09, 0.26, 0.42, 0.04); windows.push(new THREE.Vector3(cx + k, s.y + 2.41, z0 + s.d - 0.06)); }
    B.box('clothBlue', cx - 2.4, s.y + 2.7, z0 + s.d - 0.07, 0.5, 0.9, 0.03);
    B.box('clothBlue', cx + 2.4, s.y + 2.7, z0 + s.d - 0.07, 0.5, 0.9, 0.03);
  }
  // Millo: stepped stone structure
  if (F.millo) {
    const m = F.millo, x0 = tileX0(m.i0) - 1, z0 = tileZ0(m.j0);
    for (let s = 0; s < m.steps; s++) B.box('fieldstone', x0 + 3 + s * 0.45, 6.5 - 0.0 + 0, z0 + 3.5, 6 - s * 0.9, 0.55 * (m.steps - s), 7 - s * 0.6);
  }
  // Ark tent
  if (F.arkTent) {
    const a = F.arkTent, cx = tileX0(a.i0) + a.w / 2, cz = tileZ0(a.j0) + a.d / 2;
    B.box('linen', cx, a.y, cz, a.w - 0.4, 1.2, a.d - 0.4);
    B.prism('linen', cx, a.y + 1.2, cz, a.w - 0.2, 0.9, a.d - 0.1);
    B.box('clothBlue', cx, a.y + 1.05, cz + (a.d - 0.4) / 2 + 0.02, a.w - 0.4, 0.16, 0.02);
    B.box('clothRed', cx, a.y + 0.0, cz + (a.d - 0.4) / 2 + 0.02, 1.0, 1.0, 0.02);
    for (const [px, pz] of [[-a.w / 2 - 0.2, -a.d / 2 - 0.2], [a.w / 2 + 0.2, -a.d / 2 - 0.2], [-a.w / 2 - 0.2, a.d / 2 + 0.2], [a.w / 2 + 0.2, a.d / 2 + 0.2]]) B.box('wood', cx + px, a.y, cz + pz, 0.08, 0.6, 0.08);
  }
  // camp tents
  for (const t of F.tents) {
    const cx = tileX0(t.i0) + t.w / 2, cz = tileZ0(t.j0) + t.d / 2;
    const key = t.style === 0 ? 'tentBlack' : 'tentStripe';
    B.box(key, cx, t.y, cz, t.w - 0.2, 0.45, t.d - 0.5);
    B.prism(key, cx, t.y + 0.45, cz, t.w + 0.1, 0.75, t.d);
    B.box('dark', cx, t.y, cz + (t.d - 0.5) / 2 + 0.01, 0.7, 0.42, 0.02);
    B.box(key, cx, t.y + 0.62, cz + t.d / 2 + 0.25, t.w * 0.7, 0.05, 0.6, 0, 0.35); // front awning
    B.box('wood', cx - t.w * 0.33, t.y, cz + t.d / 2 + 0.5, 0.05, 0.62, 0.05); B.box('wood', cx + t.w * 0.33, t.y, cz + t.d / 2 + 0.5, 0.05, 0.62, 0.05);
    B.box('wood', cx - t.w / 2 - 0.05, t.y, cz, 0.06, 1.15, 0.06);
    B.box('wood', cx + t.w / 2 + 0.05, t.y, cz, 0.06, 1.15, 0.06);
  }
  // stalls
  for (const s of F.stalls) {
    const x = wx(s.i), z = wz(s.j), y = world.height[world.idx(s.i, s.j)];
    for (const [a, b] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) B.box('wood', x + a, y, z + b, 0.07, 1.25, 0.07);
    B.box(['clothRed', 'clothBlue', 'clothGreen'][s.color], x, y + 1.25, z + 0.1, 1.15, 0.06, 1.0, 0, 0.22);
    B.box('wood', x, y + 0.5, z, 0.95, 0.08, 0.6);
    for (let k = 0; k < 4; k++) B.box(s.color === 0 ? 'hay' : 'terracotta', x - 0.3 + k * 0.2, y + 0.58, z + (r() - 0.5) * 0.3, 0.14, 0.1, 0.14, r());
  }
  // well
  if (F.well) {
    const x = wx(F.well.i), z = wz(F.well.j), y = F.well.y;
    B.cyl('fieldstone', x, y, z, 0.48, 0.52, 0.55, 10);
    B.cyl('dark', x, y + 0.56, z, 0.34, 0.34, 0.01, 10);
    B.box('wood', x - 0.5, y, z, 0.08, 1.3, 0.08); B.box('wood', x + 0.5, y, z, 0.08, 1.3, 0.08);
    B.box('wood', x, y + 1.25, z, 1.1, 0.08, 0.08);
    B.cyl('wood', x, y + 0.85, z, 0.09, 0.08, 0.16, 6);
  }
  // small props
  for (const p of F.props) {
    const x = p.i - world.W / 2, z = p.j - world.H / 2, y = world.height[world.idx(Math.round(p.i), Math.round(p.j))];
    if (p.kind === 'jar') { B.cyl('terracotta', x, y, z, 0.13, 0.18, 0.46, 7); B.cyl('terracotta', x, y + 0.46, z, 0.08, 0.12, 0.1, 7); }
    else if (p.kind === 'basket') B.cyl('hay', x, y, z, 0.24, 0.18, 0.26, 8);
    else if (p.kind === 'hay') B.box('hay', x, y, z, 0.8, 0.45, 0.55, r());
  }
  // fires
  const fires = [];
  for (const f of F.fires) {
    const x = wx(f.i), z = wz(f.j), y = f.y;
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; B.box('fieldstone', x + Math.cos(a) * 0.36, y, z + Math.sin(a) * 0.36, 0.16, 0.12, 0.16, a); }
    B.box('wood', x, y + 0.02, z, 0.6, 0.08, 0.08, 0.6); B.box('wood', x, y + 0.06, z, 0.6, 0.08, 0.08, -0.7);
    fires.push({ pos: new THREE.Vector3(x, y + 0.08, z), size: f.small ? 0.7 : 0.95 });
  }
  for (const t of F.torches) {
    const x = t.i - world.W / 2, z = t.j - world.H / 2;
    const y = world.height[world.idx(Math.round(t.i), Math.round(t.j))];
    if (t.brazier) { B.cyl('wood', x, y, z, 0.05, 0.05, 0.7, 5); B.cyl('terracotta', x, y + 0.7, z, 0.28, 0.16, 0.18, 8); fires.push({ pos: new THREE.Vector3(x, y + 0.86, z), size: 0.6 }); }
    else { B.box('wood', x, y, z, 0.08, 1.35, 0.08); B.box('hay', x, y + 1.35, z, 0.14, 0.14, 0.14); fires.push({ pos: new THREE.Vector3(x, y + 1.46, z), size: 0.45, torch: true }); }
  }
  // cave roof (separate so it can fade when David walks inside)
  let caveRoof = null;
  if (F.cave) {
    const c = F.cave;
    const x0 = tileX0(c.i0), x1 = tileX0(c.i1 + 1), z0 = tileZ0(c.j0), z1 = tileZ0(c.j1 + 1);
    const g = new THREE.BoxGeometry(x1 - x0 + 0.02, 4.4, z1 - z0 + 0.02);
    const uv = g.attributes.uv; const dims = [[z1 - z0, 4.4], [z1 - z0, 4.4], [x1 - x0, z1 - z0], [x1 - x0, z1 - z0], [x1 - x0, 4.4], [x1 - x0, 4.4]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const n = f * 4 + v; uv.setXY(n, uv.getX(n) * dims[f][0], uv.getY(n) * dims[f][1]); }
    g.translate((x0 + x1) / 2, 3.65 + 2.2, (z0 + z1) / 2);
    caveRoof = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: TX.rockFace, transparent: true, opacity: 1 }));
    caveRoof.castShadow = true; caveRoof.receiveShadow = true;
    group.add(caveRoof);
    // opening shadow lip
    B.box('dark', (x0 + x1) / 2, 1.5, z1 - 0.3, 2.6, 0.02, 0.6);
  }

  // ---- Trees (instanced foliage cubes) ----
  const leafSets = { olive: [], terebinth: [], palm: [] };
  for (const t of F.trees) {
    const x = wx(t.i) + (r() - 0.5) * 0.4, z = wz(t.j) + (r() - 0.5) * 0.4, y = t.y, s = t.s;
    const rr = rand(t.seed);
    if (t.kind === 'palm') {
      let px = x, pz = z, py = y; const lean = (rr() - 0.5) * 0.12, segs = 7 + Math.floor(rr() * 3);
      for (let k = 0; k < segs; k++) { B.box('palmTrunk', px, py, pz, 0.32 - k * 0.012, 0.5, 0.32 - k * 0.012, k * 0.2); px += lean + k * lean * 0.3; py += 0.5; }
      const fr = 8;
      for (let k = 0; k < fr; k++) {
        const a = (k / fr) * Math.PI * 2 + rr();
        const g = new THREE.BoxGeometry(0.34, 0.06, 1.9);
        const uv = g.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n), uv.getY(n) * 2);
        g.translate(0, 0, 0.95); g.rotateX(0.35 + rr() * 0.3); g.rotateY(a); g.translate(px, py + 0.1, pz);
        B.add('leafPalm', g);
      }
      for (let k = 0; k < 3; k++) B.box('terracotta', px + (rr() - 0.5) * 0.4, py - 0.35, pz + (rr() - 0.5) * 0.4, 0.16, 0.24, 0.16);
      continue;
    }
    const big = t.kind === 'terebinth';
    const trunkH = (big ? 1.5 : 1.15) * s;
    // gnarled trunk
    B.box('bark', x, y, z, 0.42 * s, trunkH * 0.55, 0.38 * s, rr());
    B.box('bark', x + 0.08, y + trunkH * 0.5, z, 0.32 * s, trunkH * 0.55, 0.3 * s, rr(), 0, (rr() - 0.5) * 0.4);
    B.box('bark', x - 0.15 * s, y + trunkH * 0.7, z, 0.18 * s, 0.6 * s, 0.18 * s, 0, 0, 0.6);
    const n = big ? 46 : 34, R = (big ? 1.55 : 1.25) * s, cy = y + trunkH + (big ? 0.7 : 0.45) * s;
    for (let k = 0; k < n; k++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * R, h = (rr() - 0.35) * R * 0.75;
      const c = (0.38 + rr() * 0.3) * s * (big ? 1.1 : 1);
      leafSets[t.kind].push({ x: x + Math.cos(a) * d, y: cy + h, z: z + Math.sin(a) * d * 0.85, s: c, rot: rr() * 1.5, shade: (0.62 + 0.5 * Math.max(0, h / (R * 0.75) + 0.35)) * (0.9 + rr() * 0.15) });
    }
  }
  for (const [kind, list] of Object.entries(leafSets)) {
    if (!list.length) continue;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: kind === 'olive' ? TX.leafOlive : TX.leafDark });
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach((l, k) => { q.setFromEuler(e.set(0, l.rot, 0)); m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.s, l.s * 0.8, l.s)); im.setMatrixAt(k, m); im.setColorAt(k, c.setScalar(l.shade)); });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }

  B.build(group);

  // ---- Waterfall ----
  let waterfall = null;
  if (F.waterfall) {
    const wf = F.waterfall, hgt = wf.top - wf.bottom;
    const g = new THREE.PlaneGeometry(2.1, hgt);
    const uv = g.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n), uv.getY(n) * hgt / 2);
    const t = TX.waterfall; t.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, color: new THREE.Color(1.25, 1.3, 1.35), depthWrite: false });
    waterfall = new THREE.Mesh(g, mat);
    waterfall.position.set(wf.x - world.W / 2, wf.bottom + hgt / 2, wf.zTop - world.H / 2 + 0.05 - 0.5);
    group.add(waterfall);
  }

  return { group, windows, fires, caveRoof, waterfall, textures: TX };
}

// ---------------- Grass tufts / flowers / barley / shrubs ----------------
export function buildVegetation(world, time) {
  const { W, H, type, height, water, path, blocked, idx } = world;
  const { wx, wz } = makeCoords(world);
  const tex = makeTuftTextures();
  const r = rand(123);
  const lists = tex.map(() => []);
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    const k = idx(i, j);
    if (water[k] >= 0 || path[k] || world.tag[k]) continue;
    const t = type[k];
    let n = 0, v = 0;
    if (t === T.GRASS) { n = r() < 0.85 ? 1 + (r() < 0.45 ? 1 : 0) : 0; v = r() < 0.18 ? 2 : r() < 0.12 ? 3 : 0; }
    else if (t === T.DRY) { n = r() < 0.6 ? 1 : 0; v = r() < 0.15 ? 0 : 1; }
    else if (t === T.LUSH) { n = 1 + (r() < 0.6 ? 1 : 0); v = r() < 0.12 ? 2 : r() < 0.1 ? 3 : 0; }
    else if (t === T.FIELD) { n = 3; v = 4; }
    for (let q = 0; q < n; q++) lists[t === T.FIELD ? 4 : (q ? (r() < 0.5 ? 0 : v) : v)].push([wx(i) + (r() - 0.5) * 0.9, height[k], wz(j) + (r() - 0.5) * 0.9, 0.4 + r() * 0.28]);
  }
  for (const s of world.features.shrubs) lists[5].push([s.x - W / 2, s.y, s.z - H / 2, 0.8 * s.s + 0.3]);
  const group = new THREE.Group();
  const uniforms = { uTime: time };
  tex.forEach((t, n) => {
    const list = lists[n];
    if (!list.length) return;
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        transformed.x += sin(uTime * 1.6 + ip.x * 0.55 + ip.z * 0.35) * 0.09 * position.y;`);
    };
    // grass normals point up so tufts light like the ground they sit on
    const nrm = g.attributes.normal; for (let v = 0; v < nrm.count; v++) nrm.setXYZ(v, 0, 1, 0);
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m = new THREE.Matrix4(), sc = new THREE.Vector3();
    list.forEach(([x, y, z, s], k) => { m.compose(new THREE.Vector3(x, y, z), BILLBOARD_Q, sc.set(s * (n === 4 ? 1.1 : 1), s * (n === 4 ? 1.3 : 1), 1)); im.setMatrixAt(k, m); });
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  });
  return group;
}
