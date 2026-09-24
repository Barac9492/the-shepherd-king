/*
 * Distant Chapter 1 landscape for The Shepherd King.
 *
 * Rendering only: no colliders, updaters, lights, shadows, or gameplay state.
 * The returned group is unattached. The caller may add it to game.root and
 * should call dispose() after removing it (dispose also removes it if needed).
 */

const CENTRE = Object.freeze({ x: -100, z: -125, rx: 42, rz: 35, rotation: -0.12 });
const HILL_RINGS = 15;
const HILL_SEGMENTS = 56;

// Disconnected, differently sized field benches. These gently flatten only
// local patches of the natural hill; they never form complete contour rings.
const FIELD_PATCHES = Object.freeze([
  { x: -20, z: 16, rx: 15, rz: 5.2, strength: 0.50, slope: -0.010 },
  { x: 14, z: 16, rx: 16, rz: 5.8, strength: 0.46, slope: 0.013 },
  { x: -18, z: 8, rx: 13, rz: 4.8, strength: 0.44, slope: 0.008 },
  { x: 16, z: 6, rx: 13, rz: 4.6, strength: 0.42, slope: -0.010 },
  { x: -13, z: 0, rx: 11, rz: 4.2, strength: 0.38, slope: 0.010 },
  { x: 12, z: -3, rx: 11, rz: 4.0, strength: 0.36, slope: -0.008 },
  { x: -2, z: -10, rx: 13, rz: 5.2, strength: 0.34, slope: 0.006 },
]);

// Short agricultural retaining runs, split around paths and natural breaks.
// Explicit polylines keep them irregular and localized instead of elliptical.
const TERRACE_RUNS = Object.freeze([
  { h: 0.82, points: [[-33, 13], [-28, 16], [-22, 18], [-15, 19], [-9, 18]] },
  { h: 0.72, points: [[2, 21], [8, 20], [15, 18], [21, 15], [28, 11]] },
  { h: 0.78, points: [[-29, 6], [-24, 9], [-18, 11], [-11, 11], [-6, 10]] },
  { h: 0.68, points: [[7, 12], [13, 11], [19, 8], [25, 4]] },
  { h: 0.74, points: [[-25, -2], [-20, 1], [-14, 3], [-8, 3], [-4, 2]] },
  { h: 0.66, points: [[8, 4], [14, 3], [20, 0], [25, -4]] },
  { h: 0.70, points: [[-21, -10], [-16, -7], [-10, -6], [-4, -7]] },
  { h: 0.62, points: [[4, -7], [10, -8], [16, -11], [20, -14]] },
  { h: 0.58, points: [[-12, -17], [-6, -14], [1, -14], [7, -16]] },
]);

// Organic clusters rather than mirrored rows. The broad upper house remains the
// one legible landmark, but it is embedded among neighboring rooflines.
const BUILDINGS = Object.freeze([
  { x: -3, z: -9, sx: 9.2, sz: 6.8, h: 6.1, ry: 0.10, landmark: true, color: 0xd8c39a },
  { x: -15, z: -8, sx: 6.4, sz: 5.3, h: 4.5, ry: -0.10, color: 0xcab48b },
  { x: 8, z: -12, sx: 5.8, sz: 5.0, h: 4.2, ry: 0.19, color: 0xdfcda7 },
  { x: 18, z: -5, sx: 6.0, sz: 5.0, h: 4.4, ry: 0.09, color: 0xc6ad83 },
  { x: -22, z: 0, sx: 5.8, sz: 4.8, h: 4.0, ry: -0.20, color: 0xd4be94 },
  { x: -9, z: 2, sx: 6.3, sz: 4.8, h: 4.0, ry: -0.04, color: 0xe0cba3 },
  { x: 4, z: 0, sx: 5.0, sz: 4.4, h: 3.7, ry: 0.12, color: 0xcab38a },
  { x: 16, z: 4, sx: 5.7, sz: 4.5, h: 4.0, ry: 0.24, color: 0xdcc7a0 },
  { x: -28, z: 8, sx: 5.0, sz: 4.2, h: 3.6, ry: -0.27, color: 0xc7ae83 },
  { x: -17, z: 11, sx: 5.7, sz: 4.5, h: 3.8, ry: -0.11, color: 0xd8c29a },
  { x: -4, z: 10, sx: 5.8, sz: 4.5, h: 3.9, ry: 0.04, color: 0xd4bd92 },
  { x: 9, z: 11, sx: 5.2, sz: 4.2, h: 3.5, ry: 0.15, color: 0xe0caa0 },
  { x: 23, z: 13, sx: 4.9, sz: 4.0, h: 3.5, ry: 0.30, color: 0xc5ad84 },
  { x: -30, z: 18, sx: 4.7, sz: 3.9, h: 3.4, ry: -0.31, color: 0xd6c097 },
  { x: -17, z: 20, sx: 5.2, sz: 4.1, h: 3.5, ry: -0.17, color: 0xcdb68d },
  { x: -2, z: 19, sx: 5.6, sz: 4.3, h: 3.7, ry: 0.01, color: 0xdac49b },
  { x: 14, z: 18, sx: 5.1, sz: 4.0, h: 3.5, ry: 0.19, color: 0xc4aa80 },
  { x: 28, z: 5, sx: 4.8, sz: 4.0, h: 3.6, ry: 0.33, color: 0xd6bf96 },
]);

const RIDGES = Object.freeze([
  { front: -176, back: -226, left: -310, right: 220, height: 17, phase: 0.4, color: 0x958d72 },
  { front: -214, back: -278, left: -365, right: 285, height: 24, phase: 1.7, color: 0x888574 },
  { front: -260, back: -334, left: -430, right: 350, height: 31, phase: 2.8, color: 0x7f8177 },
]);

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function smoothstep(a, b, value) {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function createGroundSampler(game) {
  const groundAt = typeof game?.groundAt === 'function' ? game.groundAt.bind(game) : null;
  const chapterHeight = typeof game?.ch?.height === 'function' ? game.ch.height.bind(game.ch) : null;
  if (!groundAt && !chapterHeight) throw new Error('createBethlehemLandscape requires game.groundAt() or game.ch.height()');
  return (x, z) => {
    const y = groundAt ? groundAt(x, z) : chapterHeight(x, z);
    if (Number.isFinite(y)) return y;
    const fallback = chapterHeight ? chapterHeight(x, z) : NaN;
    if (!Number.isFinite(fallback)) throw new Error(`Invalid Chapter 1 height at ${x}, ${z}`);
    return fallback;
  };
}

function localToWorld(lx, lz) {
  const c = Math.cos(CENTRE.rotation), s = Math.sin(CENTRE.rotation);
  return { x: CENTRE.x + lx * c - lz * s, z: CENTRE.z + lx * s + lz * c };
}

function hillLiftAt(lx, lz) {
  const nx = lx / CENTRE.rx, nz = lz / CENTRE.rz;
  const r = Math.hypot(nx, nz);
  if (r >= 1) return 0;
  const edge = 1 - smoothstep(0.78, 1, r);
  const dome = 8.0 * Math.pow(Math.max(0, 1 - r * r), 1.23);
  const crest = 1.45 * Math.exp(-(((lx + 4) / 17) ** 2 + ((lz + 9) / 13) ** 2));
  const leftShoulder = 0.75 * Math.exp(-(((lx + 23) / 16) ** 2 + ((lz - 6) / 14) ** 2));
  const rightShoulder = 0.55 * Math.exp(-(((lx - 20) / 18) ** 2 + ((lz - 10) / 15) ** 2));
  const weathering = (Math.sin(lx * 0.17 + lz * 0.07) + 0.55 * Math.sin(lx * 0.08 - lz * 0.19)) * 0.28 * edge;
  return Math.max(0, (dome + crest + leftShoulder + rightShoulder) * edge + weathering);
}

function naturalSurfaceAt(terrainAt, lx, lz) {
  const p = localToWorld(lx, lz);
  return terrainAt(p.x, p.z) + hillLiftAt(lx, lz);
}

function patchWeight(patch, lx, lz) {
  const r = Math.hypot((lx - patch.x) / patch.rx, (lz - patch.z) / patch.rz);
  return r >= 1 ? 0 : (1 - smoothstep(0.48, 1, r)) * patch.strength;
}

function surfaceAt(terrainAt, lx, lz) {
  let y = naturalSurfaceAt(terrainAt, lx, lz);
  for (const patch of FIELD_PATCHES) {
    const weight = patchWeight(patch, lx, lz);
    if (!weight) continue;
    const centreY = naturalSurfaceAt(terrainAt, patch.x, patch.z);
    const target = centreY + (lx - patch.x) * patch.slope;
    y += (target - y) * weight;
  }
  return y;
}

function colorValues(THREE, value, multiplier = 1) {
  const c = new THREE.Color(value);
  return [clamp01(c.r * multiplier), clamp01(c.g * multiplier), clamp01(c.b * multiplier)];
}

function hillColor(THREE, lx, lz) {
  let field = 0;
  for (const patch of FIELD_PATCHES) field = Math.max(field, patchWeight(patch, lx, lz));
  const base = new THREE.Color(0x8d8b5d);
  const crop = new THREE.Color(0xa49a68);
  const dry = new THREE.Color(0x9c8b62);
  base.lerp(crop, clamp01(field * 1.55));
  base.lerp(dry, clamp01((Math.sin(lx * 0.12) * Math.cos(lz * 0.09) + 1) * 0.09));
  return [base.r, base.g, base.b];
}

function pushVertex(positions, colors, p, color) {
  positions.push(p.x, p.y, p.z);
  colors.push(color[0], color[1], color[2]);
}

function pushTriangle(positions, colors, a, b, c, ca, cb = ca, cc = ca) {
  pushVertex(positions, colors, a, ca);
  pushVertex(positions, colors, b, cb);
  pushVertex(positions, colors, c, cc);
}

function pushQuad(positions, colors, a, b, c, d, color) {
  pushTriangle(positions, colors, a, b, c, color);
  pushTriangle(positions, colors, a, c, d, color);
}

function appendBox(THREE, positions, colors, o) {
  const hx = o.sx * 0.5, hy = o.sy * 0.5, hz = o.sz * 0.5;
  const cy = Math.cos(o.ry || 0), sy = Math.sin(o.ry || 0);
  const point = (x, y, z) => ({ x: o.x + x * cy - z * sy, y: o.y + y, z: o.z + x * sy + z * cy });
  const v = [
    point(-hx, -hy, -hz), point(hx, -hy, -hz), point(hx, hy, -hz), point(-hx, hy, -hz),
    point(-hx, -hy, hz), point(hx, -hy, hz), point(hx, hy, hz), point(-hx, hy, hz),
  ];
  const side = colorValues(THREE, o.color, o.shade ?? 0.94);
  const dark = colorValues(THREE, o.color, (o.shade ?? 0.94) * 0.82);
  const light = colorValues(THREE, o.color, (o.shade ?? 0.94) * 1.08);
  pushQuad(positions, colors, v[0], v[1], v[2], v[3], dark);
  pushQuad(positions, colors, v[5], v[4], v[7], v[6], side);
  pushQuad(positions, colors, v[4], v[0], v[3], v[7], dark);
  pushQuad(positions, colors, v[1], v[5], v[6], v[2], side);
  pushQuad(positions, colors, v[3], v[2], v[6], v[7], light);
  pushQuad(positions, colors, v[4], v[5], v[1], v[0], dark);
}

function makeGeometry(THREE, positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeIndexedGeometry(THREE, positions, colors, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildNaturalHill(THREE, terrainAt) {
  const positions = [], colors = [], indices = [];
  const rings = [];
  const centreY = surfaceAt(terrainAt, 0, 0);
  positions.push(CENTRE.x, centreY, CENTRE.z);
  colors.push(...hillColor(THREE, 0, 0));

  for (let ring = 1; ring <= HILL_RINGS; ring++) {
    const r = ring / HILL_RINGS;
    const row = [];
    for (let i = 0; i < HILL_SEGMENTS; i++) {
      const baseAngle = i / HILL_SEGMENTS * Math.PI * 2;
      const angle = baseAngle + Math.sin(i * 1.71 + ring * 0.63) * 0.012 * r;
      const edgeWarp = 1 + 0.055 * Math.sin(angle * 3 + 0.8) + 0.028 * Math.sin(angle * 7 - 1.1);
      const radialWarp = 1 + Math.sin(i * 2.17 + ring * 1.31) * 0.012 * r;
      const rr = r * edgeWarp * radialWarp;
      const lx = Math.cos(angle) * CENTRE.rx * rr;
      const lz = Math.sin(angle) * CENTRE.rz * rr;
      const p = localToWorld(lx, lz);
      row.push(positions.length / 3);
      positions.push(p.x, surfaceAt(terrainAt, lx, lz), p.z);
      colors.push(...hillColor(THREE, lx, lz));
    }
    rings.push(row);
  }

  for (let i = 0; i < HILL_SEGMENTS; i++) indices.push(0, rings[0][(i + 1) % HILL_SEGMENTS], rings[0][i]);
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const inner = rings[ring], outer = rings[ring + 1];
    for (let i = 0; i < HILL_SEGMENTS; i++) {
      const next = (i + 1) % HILL_SEGMENTS;
      indices.push(inner[i], inner[next], outer[next], inner[i], outer[next], outer[i]);
    }
  }
  return makeIndexedGeometry(THREE, positions, colors, indices);
}

function buildTerraceStonework(THREE, terrainAt) {
  const positions = [], colors = [];
  const stoneColors = [0xb8a982, 0xc4b58d, 0xaa9b77, 0xc0b08a];
  let piece = 0;
  for (const run of TERRACE_RUNS) {
    for (let point = 0; point < run.points.length - 1; point++) {
      const [ax, az] = run.points[point], [bx, bz] = run.points[point + 1];
      const distance = Math.hypot(bx - ax, bz - az);
      const divisions = Math.max(1, Math.ceil(distance / 3.8));
      for (let d = 0; d < divisions; d++) {
        const t0 = d / divisions, t1 = (d + 1) / divisions;
        const lx0 = ax + (bx - ax) * t0, lz0 = az + (bz - az) * t0;
        const lx1 = ax + (bx - ax) * t1, lz1 = az + (bz - az) * t1;
        const p0 = localToWorld(lx0, lz0), p1 = localToWorld(lx1, lz1);
        const mx = (p0.x + p1.x) * 0.5, mz = (p0.z + p1.z) * 0.5;
        const localMidX = (lx0 + lx1) * 0.5, localMidZ = (lz0 + lz1) * 0.5;
        const top = surfaceAt(terrainAt, localMidX, localMidZ) + 0.12;
        const height = run.h * (0.9 + 0.13 * Math.sin(piece * 2.41));
        appendBox(THREE, positions, colors, {
          x: mx, y: top - height * 0.5, z: mz,
          sx: Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.16,
          sy: height, sz: 0.40 + 0.06 * (piece % 3),
          ry: Math.atan2(p1.z - p0.z, p1.x - p0.x),
          color: stoneColors[piece % stoneColors.length],
        });
        piece++;
      }
    }
  }

  // A few irregular path stones imply access without creating a monumental stair.
  const pathStones = [[1, 24], [0.4, 20], [1.3, 16], [0.6, 12], [-0.4, 8], [-0.8, 4]];
  pathStones.forEach(([lx, lz], i) => {
    const p = localToWorld(lx, lz);
    const top = surfaceAt(terrainAt, lx, lz) + 0.07;
    appendBox(THREE, positions, colors, {
      x: p.x, y: top, z: p.z,
      sx: 1.5 + (i % 2) * 0.35, sy: 0.14, sz: 1.05 + (i % 3) * 0.18,
      ry: CENTRE.rotation + (i % 2 ? -0.10 : 0.08), color: i % 2 ? 0xb4a47e : 0xc0b087,
    });
  });
  return makeGeometry(THREE, positions, colors);
}

function localOffset(lx, lz, ox, oz, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return localToWorld(lx + ox * c - oz * s, lz + ox * s + oz * c);
}

function buildingFoundation(terrainAt, building) {
  const samples = [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([ux, uz]) => {
    const c = Math.cos(building.ry), s = Math.sin(building.ry);
    const ox = ux * building.sx, oz = uz * building.sz;
    const lx = building.x + ox * c - oz * s;
    const lz = building.z + ox * s + oz * c;
    return surfaceAt(terrainAt, lx, lz);
  });
  return { floor: Math.max(...samples), bottom: Math.min(...samples) - 0.72 };
}

function buildSettlement(THREE, terrainAt) {
  const positions = [], colors = [];
  let landmark = null;
  for (const b of BUILDINGS) {
    const p = localToWorld(b.x, b.z);
    const foundation = buildingFoundation(terrainAt, b);
    const top = foundation.floor + b.h;
    const ry = CENTRE.rotation + b.ry;
    appendBox(THREE, positions, colors, {
      x: p.x, y: (foundation.bottom + top) * 0.5, z: p.z,
      sx: b.sx, sy: top - foundation.bottom, sz: b.sz, ry, color: b.color,
    });
    appendBox(THREE, positions, colors, {
      x: p.x, y: top + 0.10, z: p.z,
      sx: b.sx + 0.28, sy: 0.24, sz: b.sz + 0.28, ry, color: 0xd9c9a4,
    });

    const parapetY = top + 0.37;
    const parapetColor = b.landmark ? 0xe0d1ad : 0xcdbd99;
    const front = localOffset(b.x, b.z, 0, b.sz * 0.5 - 0.16, b.ry);
    const back = localOffset(b.x, b.z, 0, -b.sz * 0.5 + 0.16, b.ry);
    const left = localOffset(b.x, b.z, -b.sx * 0.5 + 0.16, 0, b.ry);
    const right = localOffset(b.x, b.z, b.sx * 0.5 - 0.16, 0, b.ry);
    appendBox(THREE, positions, colors, { x: front.x, y: parapetY, z: front.z, sx: b.sx, sy: 0.55, sz: 0.28, ry, color: parapetColor });
    appendBox(THREE, positions, colors, { x: back.x, y: parapetY, z: back.z, sx: b.sx, sy: 0.55, sz: 0.28, ry, color: parapetColor });
    appendBox(THREE, positions, colors, { x: left.x, y: parapetY, z: left.z, sx: 0.28, sy: 0.55, sz: b.sz, ry, color: parapetColor });
    appendBox(THREE, positions, colors, { x: right.x, y: parapetY, z: right.z, sx: 0.28, sy: 0.55, sz: b.sz, ry, color: parapetColor });

    const door = localOffset(b.x, b.z, 0, b.sz * 0.5 + 0.035, b.ry);
    appendBox(THREE, positions, colors, {
      x: door.x, y: foundation.floor + (b.landmark ? 1.1 : 0.86), z: door.z,
      sx: b.landmark ? 1.25 : 0.86, sy: b.landmark ? 2.2 : 1.72, sz: 0.10,
      ry, color: 0x4c4031, shade: 0.74,
    });

    if (b.landmark) {
      appendBox(THREE, positions, colors, {
        x: p.x - Math.cos(ry) * 0.45, y: top + 1.23, z: p.z + Math.sin(ry) * 0.45,
        sx: 5.2, sy: 2.2, sz: 4.1, ry, color: 0xcfb88e,
      });
      appendBox(THREE, positions, colors, {
        x: p.x - Math.cos(ry) * 0.45, y: top + 2.40, z: p.z + Math.sin(ry) * 0.45,
        sx: 5.5, sy: 0.18, sz: 4.4, ry, color: 0xe0d0aa,
      });
      landmark = new THREE.Vector3(p.x, top + 2.65, p.z);
    }
  }
  return { geometry: makeGeometry(THREE, positions, colors), landmark };
}

function buildRidges(THREE, terrainAt) {
  const positions = [], colors = [], indices = [];
  const xSegments = 96, zSegments = 6;
  RIDGES.forEach((ridge, layer) => {
    const offset = positions.length / 3;
    for (let iz = 0; iz <= zSegments; iz++) {
      const tz = iz / zSegments;
      const z = ridge.front + (ridge.back - ridge.front) * tz;
      const crest = Math.sin(Math.PI * tz) ** 1.45;
      for (let ix = 0; ix <= xSegments; ix++) {
        const tx = ix / xSegments;
        const x = ridge.left + (ridge.right - ridge.left) * tx;
        const broad = 0.77 + 0.14 * Math.sin(tx * Math.PI * 4.2 + ridge.phase) + 0.055 * Math.sin(tx * Math.PI * 9.5 - ridge.phase);
        positions.push(x, terrainAt(x, z) + crest * ridge.height * broad, z);
        colors.push(...colorValues(THREE, ridge.color, 1.03 - layer * 0.055 - iz * 0.012));
      }
    }
    const width = xSegments + 1;
    for (let iz = 0; iz < zSegments; iz++) for (let ix = 0; ix < xSegments; ix++) {
      const a = offset + iz * width + ix, b = a + 1, d = offset + (iz + 1) * width + ix, c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
  });
  return makeIndexedGeometry(THREE, positions, colors, indices);
}

function countGeometry(geometry) {
  const vertices = geometry.attributes.position?.count || 0;
  const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
  return { vertices, triangles };
}

function nearestPlanarRadius(geometries) {
  let nearest = Infinity;
  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) nearest = Math.min(nearest, Math.hypot(position.getX(i), position.getZ(i)));
  }
  return nearest;
}

/**
 * Create Chapter 1's distant Bethlehem composition.
 * Returns an unattached group; the parent owns attachment and atmosphere.
 */
export function createBethlehemLandscape({ THREE, game }) {
  if (!THREE?.Group || !THREE?.BufferGeometry || !game) throw new Error('createBethlehemLandscape requires { THREE, game }');

  const terrainAt = createGroundSampler(game);
  const group = new THREE.Group();
  group.name = 'chapter1-bethlehem-distant-landscape';

  // Smooth shared normals soften the hill and ridge silhouettes. The box-built
  // architecture remains visually flat because its face vertices are split.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: 1,
    metalness: 0,
    fog: true,
    dithering: true,
    polygonOffset: true,
    polygonOffsetFactor: -0.35,
    polygonOffsetUnits: -0.35,
  });

  const hillGeometry = buildNaturalHill(THREE, terrainAt);
  const wallGeometry = buildTerraceStonework(THREE, terrainAt);
  const settlement = buildSettlement(THREE, terrainAt);
  const ridgeGeometry = buildRidges(THREE, terrainAt);
  const geometries = [hillGeometry, wallGeometry, settlement.geometry, ridgeGeometry];

  const addMesh = (geometry, name, renderOrder = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = renderOrder;
    group.add(mesh);
    return mesh;
  };

  addMesh(ridgeGeometry, 'judean-ridge-layers', -2);
  addMesh(hillGeometry, 'bethlehem-natural-hill', -1);
  addMesh(wallGeometry, 'bethlehem-local-terraces');
  addMesh(settlement.geometry, 'bethlehem-silhouette-buildings', 1);

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const totals = geometries.reduce((sum, geometry) => {
    const n = countGeometry(geometry);
    sum.vertices += n.vertices;
    sum.triangles += n.triangles;
    return sum;
  }, { vertices: 0, triangles: 0 });

  const stats = Object.freeze({
    drawCalls: 4,
    meshes: 4,
    materials: 1,
    geometries: 4,
    vertices: totals.vertices,
    triangles: totals.triangles,
    buildings: BUILDINGS.length,
    terraceRuns: TERRACE_RUNS.length,
    fieldPatches: FIELD_PATCHES.length,
    ridgeLayers: RIDGES.length,
    nearestFeatureRadius: nearestPlanarRadius(geometries),
    bounds: Object.freeze({
      min: Object.freeze([bounds.min.x, bounds.min.y, bounds.min.z]),
      max: Object.freeze([bounds.max.x, bounds.max.y, bounds.max.z]),
    }),
  });

  group.userData.bethlehemLandscape = { distantOnly: true, noColliders: true, shadows: false, stats };

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    group.clear();
    for (const geometry of geometries) geometry.dispose();
    material.dispose();
  };

  return {
    group,
    dispose,
    stats,
    landmark: settlement.landmark || new THREE.Vector3(CENTRE.x, terrainAt(CENTRE.x, CENTRE.z) + 16, CENTRE.z),
  };
}
