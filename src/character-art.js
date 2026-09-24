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

function bodyGeometry(options, role, p, c) {
  const key = JSON.stringify(['body', p.simple, p.shoulder, p.waist, options.robeLen ?? 1, Boolean(options.armor), c.tunic, c.tunicShade, c.tunicLight, c.sash, c.skin, c.cloak]);
  return cached(key, () => {
    const robeLen = Math.max(0.72, Math.min(1.35, options.robeLen ?? 1));
    const lowerY = 1.55 - 0.5 * robeLen;
    const parts = [
      transformed(new THREE.CylinderGeometry(0.31 * p.waist, 0.45 * p.waist, robeLen, p.simple ? 7 : 10), { y: lowerY }, c.tunic),
      transformed(new THREE.SphereGeometry(0.35, p.simple ? 8 : 12, p.simple ? 5 : 8), { y: 1.5, sx: p.shoulder, sy: 0.62, sz: 0.78 }, c.tunic),
      transformed(new THREE.CylinderGeometry(0.375, 0.38, 0.095, p.simple ? 7 : 10), { y: 1.15 }, c.sash),
      transformed(new THREE.CylinderGeometry(0.078, 0.09, 0.15, 8), { y: 1.69 }, c.skin),
      transformed(new THREE.BoxGeometry(0.045, Math.max(0.35, robeLen * 0.62), 0.025), { x: 0.2, y: lowerY - 0.03, z: 0.405, rz: -0.05 }, c.tunicLight),
      transformed(new THREE.BoxGeometry(0.03, Math.max(0.3, robeLen * 0.55), 0.02), { x: -0.14, y: lowerY - 0.05, z: 0.41, rz: 0.04 }, c.tunicShade),
    ];
    if (p.simple) {
      parts.push(
        transformed(new THREE.CylinderGeometry(0.074, 0.064, 0.82, 6), { x: 0.12, y: 0.49 }, c.skin),
        transformed(new THREE.CylinderGeometry(0.074, 0.064, 0.82, 6), { x: -0.12, y: 0.49 }, c.skin),
        transformed(new THREE.BoxGeometry(0.16, 0.07, 0.27), { x: 0.12, y: 0.065, z: 0.055 }, c.sandal),
        transformed(new THREE.BoxGeometry(0.16, 0.07, 0.27), { x: -0.12, y: 0.065, z: 0.055 }, c.sandal),
      );
    }
    if (c.cloak != null) {
      parts.push(
        transformed(new THREE.CylinderGeometry(0.37 * p.shoulder, 0.51 * p.waist, 1.18, p.simple ? 8 : 12, 1, true, Math.PI * 0.54, Math.PI * 0.92), { y: 1.08 }, c.cloak),
        transformed(new THREE.TorusGeometry(0.3, 0.035, 5, 12, Math.PI * 0.74), { y: 1.58, z: -0.04, rx: Math.PI / 2, rz: -1.16 }, tone(c.cloak, 0.12)),
      );
    }
    if (options.armor) {
      parts.push(
        transformed(new THREE.CylinderGeometry(0.36 * p.shoulder, 0.41 * p.waist, 0.72, p.simple ? 8 : 12), { y: 1.32 }, c.bronze),
        transformed(new THREE.SphereGeometry(0.37, p.simple ? 8 : 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { y: 1.64, sx: p.shoulder, sy: 0.44 }, c.bronze),
        transformed(new THREE.BoxGeometry(0.58, 0.045, 0.035), { y: 1.37, z: 0.37 }, c.bronzeShade),
        transformed(new THREE.BoxGeometry(0.5, 0.045, 0.035), { y: 1.18, z: 0.39 }, c.bronzeShade),
      );
    }
    return merged(parts);
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

function armGeometry(options, role, p, c) {
  const key = JSON.stringify(['arm', p.simple, p.shoulder, c.sleeve, c.skin]);
  return cached(key, () => merged([
    transformed(new THREE.CylinderGeometry(0.095 * p.shoulder, 0.082, 0.34, p.simple ? 6 : 9), { y: -0.17 }, c.sleeve),
    transformed(new THREE.CapsuleGeometry(0.071, 0.25, p.simple ? 2 : 4, p.simple ? 6 : 8), { y: -0.45, sx: 0.92, sz: 0.88 }, c.skin),
    transformed(new THREE.SphereGeometry(0.079, p.simple ? 7 : 10, p.simple ? 5 : 7), { y: -0.65, sy: 1.08 }, c.skinLight),
  ]));
}

function hairParts(parts, options, role, p, c) {
  if (c.hair == null) return;
  const backLength = role === 'abigail' ? 0.36 : role === 'david-adult' || role === 'david-king' ? 0.25 : 0.18;
  parts.push(
    transformed(new THREE.SphereGeometry(0.215, p.simple ? 8 : 12, p.simple ? 6 : 8, 0, Math.PI * 2, 0, Math.PI * 0.56), { y: 0.055, z: -0.015, sx: 1.04, sy: 0.96, sz: 1.01 }, c.hair),
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
      transformed(new THREE.SphereGeometry(0.032, 7, 5), { x: 0.073, y: 0.035, z: 0.188, sx: 1.05, sy: 1.05, sz: 0.65 }, c.eyeLight),
      transformed(new THREE.SphereGeometry(0.032, 7, 5), { x: -0.073, y: 0.035, z: 0.188, sx: 1.05, sy: 1.05, sz: 0.65 }, c.eyeLight),
      transformed(new THREE.SphereGeometry(0.018, 7, 5), { x: 0.073, y: 0.035, z: 0.207, sz: 0.55 }, c.eye),
      transformed(new THREE.SphereGeometry(0.018, 7, 5), { x: -0.073, y: 0.035, z: 0.207, sz: 0.55 }, c.eye),
      transformed(new THREE.SphereGeometry(0.04, 8, 6), { y: -0.015, z: 0.2, sx: 0.58, sy: 0.78, sz: 0.72 }, c.skinShade),
      transformed(new THREE.SphereGeometry(0.035, 8, 5), { y: -0.105, z: 0.188, sx: 1.35, sy: 0.38, sz: 0.45 }, tone(c.skin, -0.2)),
      transformed(new THREE.SphereGeometry(0.042, 8, 6), { x: 0.2, y: -0.005, sx: 0.42 }, c.skinShade),
      transformed(new THREE.SphereGeometry(0.042, 8, 6), { x: -0.2, y: -0.005, sx: 0.42 }, c.skinShade),
    ];
    hairParts(parts, options, role, p, c);
    if (options.beard) {
      parts.push(
        transformed(new THREE.SphereGeometry(0.172, p.simple ? 8 : 12, p.simple ? 5 : 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), { y: -0.065, z: 0.045, sx: 0.98, sy: role === 'nathan' ? 1.65 : 1.35, sz: 1.04 }, c.beard),
        transformed(new THREE.SphereGeometry(0.048, 8, 5), { x: 0.08, y: -0.055, z: 0.184, sx: 1.35, sy: 0.45 }, c.beard),
        transformed(new THREE.SphereGeometry(0.048, 8, 5), { x: -0.08, y: -0.055, z: 0.184, sx: 1.35, sy: 0.45 }, c.beard),
      );
    }
    if (options.hat === 'cloth') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.232, p.simple ? 8 : 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.57), { y: 0.055, sy: 0.94 }, c.hat),
        transformed(new THREE.BoxGeometry(0.43, role === 'abigail' ? 0.46 : 0.34, 0.055), { y: -0.11, z: -0.17 }, tone(c.hat, -0.08)),
        transformed(new THREE.TorusGeometry(0.224, 0.023, 4, 14), { y: 0.09, rx: Math.PI / 2 }, tone(c.hat, -0.28)),
      );
    } else if (options.hat === 'turban') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.247, p.simple ? 8 : 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.58), { y: 0.065, sy: 0.9 }, c.hat),
        transformed(new THREE.TorusGeometry(0.225, 0.036, 5, 14), { y: 0.08, rx: Math.PI / 2 }, tone(c.hat, -0.13)),
        transformed(new THREE.SphereGeometry(0.055, 8, 6), { y: 0.11, z: 0.225, sy: 1.25 }, tone(c.hat, 0.08)),
      );
    } else if (options.hat === 'helmet') {
      parts.push(
        transformed(new THREE.SphereGeometry(0.242, p.simple ? 8 : 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), { y: 0.035 }, c.bronze),
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
    armL: mesh('storybook-armL', armGeometry(options, normalizedRole, profile, colors)),
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
