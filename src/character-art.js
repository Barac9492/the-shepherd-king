import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const SUPPORTED_HATS = new Set([null, 'cloth', 'turban', 'crown', 'helmet']);
const geometryCache = new Map();
const storybookMaterial = new THREE.MeshStandardMaterial({
  name: 'Storybook_Human_Vertex_Palette',
  vertexColors: true,
  roughness: 0.9,
  metalness: 0.02,
});
storybookMaterial.userData.storybookShared = true;

function hex(value, fallback) {
  if (value == null) return fallback;
  if (value?.isColor) return value.getHex();
  return Number(value) >>> 0;
}

function tone(value, amount) {
  const color = new THREE.Color(value);
  if (amount < 0) color.multiplyScalar(1 + amount);
  else color.lerp(new THREE.Color(0xffffff), amount);
  return color.getHex();
}

function transformed(geometry, {
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
} = {}, color = 0xffffff) {
  let result = geometry.clone();
  const object = new THREE.Object3D();
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  object.scale.set(sx, sy, sz);
  object.updateMatrix();
  result.applyMatrix4(object.matrix);
  if (result.index) result = result.toNonIndexed();
  for (const key of Object.keys(result.attributes)) {
    if (key !== 'position' && key !== 'normal') result.deleteAttribute(key);
  }
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  const c = new THREE.Color(color);
  const count = result.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

function merged(parts) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Unable to merge storybook human geometry.');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.storybookShared = true;
  return geometry;
}

function cached(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}

function mesh(name, geometry) {
  const result = new THREE.Mesh(geometry, storybookMaterial);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  result.frustumCulled = true;
  result.userData.keepGeo = true;
  result.userData.storybookHumanVisual = true;
  return result;
}

function normalizeRole(role, options) {
  const raw = String(role || options.storybookRole || options.role || 'generic').toLowerCase().replace(/[_\s]+/g, '-');
  if (raw === 'player' || raw === 'david') {
    if (options.hat === 'crown') return 'david-king';
    if (options.beard) return 'david-adult';
    return 'david-young';
  }
  if (raw.includes('poor')) return 'poor-man';
  if (raw.includes('young')) return 'david-young';
  if (raw.includes('fugitive') || raw.includes('adult')) return 'david-adult';
  if (raw.includes('king') && raw.includes('david')) return 'david-king';
  for (const named of ['saul', 'jonathan', 'abigail', 'nathan']) if (raw.includes(named)) return named;
  if (raw === 'crowd' || raw === 'soldier') return raw;
  return raw || 'generic';
}

function characterProfile(options, role) {
  const simple = Boolean(options.simple || role === 'crowd');
  const feminine = role === 'abigail' || options.female === true;
  const youthful = role === 'david-young' || role === 'jonathan' || options.scale < 0.82;
  const giant = (options.scale ?? 1) > 2;
  const royal = role === 'david-king' || role === 'saul';
  return {
    simple,
    feminine,
    youthful,
    giant,
    royal,
    shoulder: giant ? 1.18 : royal ? 1.08 : feminine ? 0.92 : youthful ? 0.94 : 1,
    waist: feminine ? 0.91 : giant ? 1.12 : 1,
    headScale: giant ? 0.9 : youthful ? 1.04 : 1,
  };
}

function palette(options, role) {
  const skin = hex(options.skin, role === 'david-young' ? 0xcf966a : 0xc58a5c);
  const tunic = hex(options.tunic, 0x9b7a4e);
  const sleeve = hex(options.sleeve, tunic);
  const sash = hex(options.sash, 0x6b4a2b);
  const hair = Object.prototype.hasOwnProperty.call(options, 'hair') && options.hair == null
    ? null
    : hex(options.hair, 0x8a3d1b);
  const beard = hex(options.beardColor, hair ?? 0x4b2d20);
  return {
    skin, skinShade: tone(skin, -0.14), skinLight: tone(skin, 0.1),
    tunic, tunicShade: tone(tunic, -0.18), tunicLight: tone(tunic, 0.12),
    sleeve, sash, hair, beard,
    sandal: 0x4d3020,
    eye: 0x17120f,
    eyeLight: 0xf5eee1,
    cloak: options.cloak == null ? null : hex(options.cloak, 0x3a2a4a),
    hat: hex(options.hatColor, 0xe9e1cf),
    bronze: 0x9b7139,
    bronzeShade: 0x60451f,
    gold: 0xd1a642,
  };
}

// A closed, elliptical cloth loft keeps the tunic as one continuous surface. The
// small four-fold modulation is baked into each ring, rather than added as loose trim.
export function clothLoftGeometry(profile, segments, folds = 0) {
  if(profile[0].y > profile[profile.length-1].y) profile=profile.slice().reverse();
  const positions = [];
  const rings = profile.length;
  for (let row = 0; row < rings; row++) {
    const { y, x, z } = profile[row];
    for (let column = 0; column < segments; column++) {
      const angle = column / segments * Math.PI * 2;
      const frontWeight = Math.max(0, Math.sin(angle));
      const fold = folds ? Math.sin(angle * 4) * frontWeight * folds : 0;
      positions.push(Math.cos(angle) * x * (1 + fold), y, Math.sin(angle) * z * (1 + fold));
    }
  }
  const indices = [];
  for (let row = 0; row < rings - 1; row++) for (let column = 0; column < segments; column++) {
    const next = (column + 1) % segments;
    const a = row * segments + column;
    const b = row * segments + next;
    const c = (row + 1) * segments + column;
    const d = (row + 1) * segments + next;
    indices.push(a, c, b, b, c, d);
  }
  const bottom = positions.length / 3;
  positions.push(0, profile[0].y, 0);
  const top = positions.length / 3;
  positions.push(0, profile[rings - 1].y, 0);
  for (let column = 0; column < segments; column++) {
    const next = (column + 1) % segments;
    indices.push(bottom, column, next);
    const a = (rings - 1) * segments + column;
    const b = (rings - 1) * segments + next;
    indices.push(top, b, a);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A gently curved, double-sided back panel reads as cloth draped from the shoulders,
// without the cone-shaped silhouette or any detached decorative strips.
function drapedCloakGeometry(topY, bottomY, shoulder, waist, segments) {
  const positions = [];
  const rows = 5;
  const columns = segments + 1;
  for (let side = 0; side < 2; side++) for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    const y = topY + (bottomY - topY) * t;
    const width = (0.38 * shoulder) + (0.12 * waist * t);
    const depth = t === 0 ? 0.12 : 0.29 + 0.045 * t;
    for (let column = 0; column < columns; column++) {
      const angle = -1.45 + column / segments * 2.9;
      const wave = Math.sin(angle * 2) * 0.018 * (0.25 + t);
      positions.push(Math.sin(angle) * width, y + wave + (1-t)*.08*Math.cos(angle), -.015 - Math.cos(angle) * depth + (side ? 0.014 : 0));
    }
  }
  const indices = [];
  const sideSize = rows * columns;
  for (let side = 0; side < 2; side++) for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const a = side * sideSize + row * columns + column;
    const b = a + 1;
    const c = a + columns;
    const d = c + 1;
    if (side) indices.push(a, c, b, b, c, d);
    else indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addSeatedDrape(geometry,hemY){
  const source=geometry.attributes.position,ns=geometry.attributes.normal;
  const position=source.clone(),normal=ns.clone(),lift=Math.min(.48,Math.max(.23,.78-hemY)),reach=.22,bump=(.5-lift)*.22;
  for(let i=0;i<source.count;i++){
    const y=source.getY(i),z=source.getZ(i),w=Math.max(0,Math.min(1,(1.08-y)/.53)),f=Math.max(0,Math.min(1,(z+.06)/.34));
    position.setY(i,y+(lift*w+bump*Math.sin(Math.PI*w))*f);position.setZ(i,z+reach*w*f);
    const wy=y>.55&&y<1.08?-1/.53:0,fz=z>-.06&&z<.28?1/.34:0;
    const A=1+(lift+bump*Math.PI*Math.cos(Math.PI*w))*wy*f,B=(lift*w+bump*Math.sin(Math.PI*w))*fz,C=reach*wy*f,D=1+reach*w*fz,det=A*D-B*C;
    const n=new THREE.Vector3(ns.getX(i),(D*ns.getY(i)-C*ns.getZ(i))/det,(-B*ns.getY(i)+A*ns.getZ(i))/det).normalize();normal.setXYZ(i,n.x,n.y,n.z);
  }
  geometry.morphAttributes.position=[position];geometry.morphAttributes.normal=[normal];
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function bodyGeometry(options, role, p, c) {
  const key = JSON.stringify(['body-v2', p.simple, p.shoulder, p.waist, options.robeLen ?? 1, Boolean(options.armor), c.tunic, c.tunicShade, c.sash, c.skin, c.cloak]);
  return cached(key, () => {
    const robeLen = Math.max(0.72, Math.min(1.35, options.robeLen ?? 1));
    const hemY = 1.55 - robeLen;
    const segments = p.simple ? 7 : 12;
    const parts = [
      transformed(clothLoftGeometry([
        { y: hemY, x: 0.43 * p.waist, z: 0.31 * p.waist },
        { y: hemY + robeLen * 0.1, x: 0.44 * p.waist, z: 0.32 * p.waist },
        { y: hemY + robeLen * 0.48, x: 0.37 * p.waist, z: 0.285 * p.waist },
        { y: hemY + robeLen * 0.78, x: 0.325 * p.waist, z: 0.255 * p.waist },
        { y: 1.55, x: 0.36 * p.shoulder, z: 0.275 * p.shoulder },
        { y: 1.62, x: 0.26 * p.shoulder, z: 0.205 * p.shoulder },
        { y: 1.685, x: 0.095, z: 0.095 },
      ], segments, p.simple ? 0.012 : 0.026), {}, c.tunic),
      transformed(clothLoftGeometry([
        { y: 1.105, x: 0.37 * p.waist, z: 0.285 * p.waist },
        { y: 1.145, x: 0.39 * p.waist, z: 0.3 * p.waist },
        { y: 1.195, x: 0.385 * p.waist, z: 0.295 * p.waist },
      ], segments, 0.008), {}, c.sash),
      transformed(new THREE.CylinderGeometry(0.078, 0.09, 0.15, 8), { y: 1.69 }, c.skin),
    ];
    if (p.simple) {
      parts.push(
        transformed(new THREE.CylinderGeometry(0.074, 0.064, 0.82, 6), { x: 0.12, y: 0.49 }, c.skin),
        transformed(new THREE.CylinderGeometry(0.074, 0.064, 0.82, 6), { x: -0.12, y: 0.49 }, c.skin),
        transformed(new THREE.BoxGeometry(0.16, 0.07, 0.27), { x: 0.12, y: 0.065, z: 0.055 }, c.sandal),
        transformed(new THREE.BoxGeometry(0.16, 0.07, 0.27), { x: -0.12, y: 0.065, z: 0.055 }, c.sandal),
      );
    }
    if (c.cloak != null) parts.push(transformed(drapedCloakGeometry(1.57, Math.max(hemY + 0.16, 0.48), p.shoulder, p.waist, p.simple ? 6 : 10), {}, c.cloak));
    if (options.armor) {
      parts.push(
        transformed(new THREE.CylinderGeometry(0.36 * p.shoulder, 0.41 * p.waist, 0.72, p.simple ? 8 : 12), { y: 1.32 }, c.bronze),
        transformed(new THREE.SphereGeometry(0.37, p.simple ? 8 : 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { y: 1.64, sx: p.shoulder, sy: 0.44 }, c.bronze),
        transformed(new THREE.BoxGeometry(0.58, 0.045, 0.035), { y: 1.37, z: 0.37 }, c.bronzeShade),
        transformed(new THREE.BoxGeometry(0.5, 0.045, 0.035), { y: 1.18, z: 0.39 }, c.bronzeShade),
      );
    }
    const geometry=merged(parts);
    return !p.simple&&!options.armor?addSeatedDrape(geometry,hemY):geometry;
  });
}

function legGeometry(options, role, p, c) {
  const key = JSON.stringify(['leg', Boolean(options.armor), c.skin]);
  return cached(key, () => {
    const parts = [
      transformed(new THREE.CapsuleGeometry(0.068, 0.52, p.simple ? 2 : 4, p.simple ? 6 : 8), { y: -0.43, sx: 0.95, sz: 0.9 }, c.skin),
      transformed(new THREE.BoxGeometry(0.17, 0.07, 0.29), { y: -0.82, z: 0.065 }, c.sandal),
      transformed(new THREE.TorusGeometry(0.071, 0.013, 4, 10, Math.PI * 1.25), { y: -0.77, z: 0.08, rx: Math.PI / 2, rz: 0.42 }, tone(c.sandal, 0.15)),
    ];
    if (options.armor) parts.push(transformed(new THREE.CylinderGeometry(0.096, 0.082, 0.4, 7), { y: -0.55 }, c.bronze));
    return merged(parts);
  });
}

function armGeometry(options, role, p, c, side = 1) {
  const key = JSON.stringify(['arm-v2', side, p.simple, p.shoulder, c.sleeve, c.skin]);
  return cached(key, () => merged([
    transformed(clothLoftGeometry([
      { y: -0.01, x: 0.102 * p.shoulder, z: 0.088 * p.shoulder },
      { y: -0.13, x: 0.098 * p.shoulder, z: 0.084 * p.shoulder },
      { y: -0.31, x: 0.079, z: 0.07 },
    ], p.simple ? 6 : 8, 0.008), {}, c.sleeve),
    transformed(new THREE.CapsuleGeometry(0.066, 0.21, p.simple ? 2 : 4, p.simple ? 6 : 8), { y: -0.45, sx: 0.9, sz: 0.8 }, c.skin),
    // The palm is centered on the legacy hand attachment (-0.64), with a small
    // joined thumb for a calm grasp silhouette instead of a floating mitten ball.
    transformed(new THREE.SphereGeometry(0.078, p.simple ? 7 : 10, p.simple ? 5 : 7), { y: -0.625, sx: 0.76, sy: 1.18, sz: 0.62 }, c.skinLight),
    transformed(new THREE.SphereGeometry(0.047, p.simple ? 7 : 9, p.simple ? 5 : 6), { x: 0.052 * side, y: -0.645, z: 0.008, sx: 0.72, sy: 1.05, sz: 0.7, rz: -0.32 * side }, c.skinLight),
  ]));
}

function hairParts(parts, options, role, p, c) {
  if (c.hair == null) return;
  const backLength = role === 'abigail' ? 0.36 : role === 'david-adult' || role === 'david-king' ? 0.25 : 0.18;
  parts.push(
    transformed(new THREE.SphereGeometry(0.215, p.simple ? 8 : 12, p.simple ? 6 : 8, 0, Math.PI * 2, 0, Math.PI * 0.46), { y: 0.055, z: -0.015, sx: 1.04, sy: 0.96, sz: 1.01 }, c.hair),
    transformed(new THREE.SphereGeometry(0.17, p.simple ? 7 : 10, 6), { y: -0.015 - backLength * 0.18, z: -0.135, sy: 0.9 + backLength }, tone(c.hair, -0.12)),
  );
  if (!p.simple && role === 'david-young') parts.push(
    transformed(new THREE.SphereGeometry(0.075, 8, 6), { x: 0.14, y: 0.14, z: 0.12, sx: 1.2, sy: 0.55, rz: -0.42 }, tone(c.hair, 0.08)),
    transformed(new THREE.SphereGeometry(0.07, 8, 6), { x: 0.02, y: 0.18, z: 0.16, sx: 1.35, sy: 0.52, rz: -0.18 }, tone(c.hair, 0.12)),
  );
}

function headGeometry(options, role, p, c) {
  const key = JSON.stringify(['head', role, p.simple, p.headScale, Boolean(options.beard), options.hat ?? null, c.skin, c.hair, c.beard, c.hat]);
  return cached(key, () => {
    const hs = p.headScale;
    const parts = [
      transformed(new THREE.SphereGeometry(0.205, p.simple ? 9 : 14, p.simple ? 7 : 10), { sy: 1.08 * hs, sx: hs, sz: 0.98 * hs }, c.skin),
      // Small recessed eyes, level brows and a closed neutral mouth. No white eyeballs.
      transformed(new THREE.SphereGeometry(0.018, 9, 6), { x: 0.069, y: 0.028, z: 0.192, sy: 0.34, sz: 0.18 }, c.eye),
      transformed(new THREE.SphereGeometry(0.018, 9, 6), { x: -0.069, y: 0.028, z: 0.192, sy: 0.34, sz: 0.18 }, c.eye),
      transformed(new THREE.BoxGeometry(0.048, 0.006, 0.006), { x: 0.069, y: 0.064, z: 0.185 }, c.hair ?? c.skinShade),
      transformed(new THREE.BoxGeometry(0.048, 0.006, 0.006), { x: -0.069, y: 0.064, z: 0.185 }, c.hair ?? c.skinShade),
      transformed(new THREE.SphereGeometry(0.026, 10, 7), { y: -0.007, z: 0.195, sx: 0.55, sy: 0.85, sz: 0.32 }, c.skin),
      transformed(new THREE.SphereGeometry(0.026, 9, 5), { y: -0.108, z: 0.18, sy: 0.08, sz: 0.1 }, tone(c.skin, -0.12)),
      transformed(new THREE.SphereGeometry(0.042, 8, 6), { x: 0.2, y: -0.005, sx: 0.42 }, c.skinShade),
      transformed(new THREE.SphereGeometry(0.042, 8, 6), { x: -0.2, y: -0.005, sx: 0.42 }, c.skinShade),
    ];
    hairParts(parts, options, role, p, c);
    if (options.beard) {
      parts.push(
        transformed(new THREE.SphereGeometry(0.172, p.simple ? 8 : 12, p.simple ? 5 : 8, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52), { y: -0.075, z: 0.04, sx: 0.98, sy: role === 'nathan' ? 1.45 : 1.1, sz: 0.96 }, c.beard),
        transformed(new THREE.SphereGeometry(0.045, 10, 6), { y: -0.065, z: 0.202, sx: 1.25, sy: 0.12, sz: 0.3 }, c.beard),
      );
    }
    if (options.hat === 'cloth') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.232, p.simple ? 8 : 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.46), { y: 0.055, sy: 0.94 }, c.hat),
        transformed(new THREE.BoxGeometry(0.43, role === 'abigail' ? 0.46 : 0.34, 0.055), { y: -0.11, z: -0.17 }, tone(c.hat, -0.08)),
        transformed(new THREE.TorusGeometry(0.224, 0.023, 4, 14), { y: 0.09, rx: Math.PI / 2 }, tone(c.hat, -0.28)),
      );
    } else if (options.hat === 'turban') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.247, p.simple ? 8 : 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.46), { y: 0.065, sy: 0.9 }, c.hat),
        transformed(new THREE.TorusGeometry(0.225, 0.036, 5, 14), { y: 0.08, rx: Math.PI / 2 }, tone(c.hat, -0.13)),
        transformed(new THREE.SphereGeometry(0.055, 8, 6), { y: 0.11, z: 0.225, sy: 1.25 }, tone(c.hat, 0.08)),
      );
    } else if (options.hat === 'helmet') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.242, p.simple ? 8 : 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.46), { y: 0.035 }, c.bronze),
        transformed(new THREE.BoxGeometry(0.055, 0.15, 0.39), { y: 0.27 }, c.bronzeShade),
        transformed(new THREE.BoxGeometry(0.35, 0.13, 0.045), { y: -0.115, z: -0.2 }, c.bronzeShade),
      );
    } else if (options.hat === 'crown') {
      parts.push(transformed(new THREE.CylinderGeometry(0.205, 0.218, 0.09, 12, 1, true), { y: 0.17 }, c.gold));
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        parts.push(transformed(new THREE.CylinderGeometry(0.012, 0.028, 0.12, 5), { x: Math.sin(a) * 0.205, y: 0.25, z: Math.cos(a) * 0.205 }, c.gold));
      }
    }
    return merged(parts);
  });
}

export function buildStorybookHumanVisuals(options = {}, { role } = {}) {
  const normalizedRole = normalizeRole(role, options);
  const profile = characterProfile(options, normalizedRole);
  const colors = palette(options, normalizedRole);
  const supportedHead = SUPPORTED_HATS.has(options.hat ?? null);
  return {
    role: normalizedRole,
    supportedHead,
    material: storybookMaterial,
    body: mesh('storybook-body', bodyGeometry(options, normalizedRole, profile, colors)),
    legL: profile.simple ? null : mesh('storybook-legL', legGeometry(options, normalizedRole, profile, colors)),
    legR: profile.simple ? null : mesh('storybook-legR', legGeometry(options, normalizedRole, profile, colors)),
    armL: mesh('storybook-armL', armGeometry(options, normalizedRole, profile, colors, -1)),
    armR: mesh('storybook-armR', armGeometry(options, normalizedRole, profile, colors)),
    head: supportedHead ? mesh('storybook-head', headGeometry(options, normalizedRole, profile, colors)) : null,
    metadata: Object.freeze({
      role: normalizedRole,
      lod: profile.simple ? 'crowd' : 'standard',
      supportedHead,
      retainedLegacyHead: !supportedHead,
      meshCount: (profile.simple ? 3 : 5) + (supportedHead ? 1 : 0),
      articulatedPivots: ['body', 'legL', 'legR', 'armL', 'armR', 'head', 'handR', 'handL'],
      accessories: Object.freeze({
        beard: Boolean(options.beard),
        hat: options.hat ?? null,
        armor: Boolean(options.armor),
        cloak: options.cloak != null,
        staff: Boolean(options.staff),
        shield: Boolean(options.shield),
      }),
    }),
  };
}

export function getStorybookHumanCacheStatus() {
  return Object.freeze({ geometries: geometryCache.size, material: storybookMaterial.name });
}
