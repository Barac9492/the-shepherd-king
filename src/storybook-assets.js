import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { buildStorybookHumanVisuals, getStorybookHumanCacheStatus } from './character-art.js';

const ASSET_URLS = {
  david: new URL('../assets/storybook/david.glb', import.meta.url),
  sheep: new URL('../assets/storybook/sheep.glb', import.meta.url),
};

const DAVID_PIVOTS = ['body', 'legL', 'legR', 'armL', 'armR', 'head', 'handR', 'handL', 'staff'];
const SHEEP_PIVOTS = ['body', 'legFL', 'legFR', 'legBL', 'legBR', 'head'];
const SHEEP_LEG_NAMES = ['legFL', 'legFR', 'legBL', 'legBR'];

let assetPromise = null;
let loadedAssets = null;
const sheepMaterialVariants = new Map();
const davidMaterialVariants = new Map();

function findAssetRoot(scene, name) {
  return scene.getObjectByName(name) || scene.children[0] || scene;
}

function requireNodes(root, names, assetName) {
  const nodes = {};
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`${assetName} is missing required pivot "${name}".`);
    nodes[name] = node;
  }
  return nodes;
}

function prepareTemplate(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.keepGeo = true;
    object.frustumCulled = true;
  });
  root.updateMatrixWorld(true);
  return root;
}

/**
 * Loads and caches both storybook GLBs. Call this during boot before using the
 * synchronous createStorybookDavid/createStorybookSheep adapters.
 */
export async function loadStorybookAssets() {
  if (loadedAssets) return loadedAssets;
  if (!assetPromise) {
    assetPromise = (async () => {
      const loader = new GLTFLoader();
      const [davidGLTF, sheepGLTF] = await Promise.all([
        loader.loadAsync(ASSET_URLS.david.href),
        loader.loadAsync(ASSET_URLS.sheep.href),
      ]);
      const david = prepareTemplate(findAssetRoot(davidGLTF.scene, 'StorybookDavid'));
      const sheep = prepareTemplate(findAssetRoot(sheepGLTF.scene, 'StorybookSheep'));
      requireNodes(david, DAVID_PIVOTS, 'storybook David');
      requireNodes(sheep, SHEEP_PIVOTS, 'storybook sheep');
      loadedAssets = Object.freeze({ david, sheep });
      return loadedAssets;
    })().catch(error => {
      assetPromise = null;
      throw error;
    });
  }
  return assetPromise;
}

function assetsOrThrow() {
  if (!loadedAssets) {
    throw new Error('Storybook assets are not loaded. Await loadStorybookAssets() before creating chapter models.');
  }
  return loadedAssets;
}

function cloneTemplate(template) {
  const clone = template.clone(true);
  clone.traverse(object => {
    if (!object.isMesh) return;
    // Object3D.clone intentionally shares immutable geometry/material resources.
    // clearChapter respects this flag and therefore cannot dispose cached GLB geometry.
    object.userData.keepGeo = true;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function disposeOwnedGeometry(root) {
  root.traverse(object => {
    if (object.isMesh && object.geometry && !object.userData.keepGeo) object.geometry.dispose();
  });
}

function removeDirectVisuals(pivot, predicate = null) {
  if (!pivot) return;
  const visualChildren = pivot.children.filter(child =>
    (child.isMesh || child.isLine || child.isPoints) && (!predicate || predicate(child))
  );
  for (const child of visualChildren) {
    pivot.remove(child);
    disposeOwnedGeometry(child);
  }
}

function detachLegacyHeadVisuals(baseHuman) {
  if (baseHuman.__storybookLegacyHeadVisuals) return baseHuman.__storybookLegacyHeadVisuals;
  const visuals = baseHuman.head.children.filter(child => child.isMesh || child.isLine || child.isPoints);
  for (const visual of visuals) baseHuman.head.remove(visual);
  Object.defineProperty(baseHuman, '__storybookLegacyHeadVisuals', {
    value: visuals,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return visuals;
}

function moveDirectVisuals(sourcePivot, targetPivot) {
  const visuals = sourcePivot.children.filter(child => child.isMesh || child.isLine || child.isPoints);
  for (const visual of visuals) targetPivot.add(visual);
}

function copyTransform(target, source) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
}

function replaceAttachment(current, replacement, fallbackTransform) {
  const transformSource = current || fallbackTransform;
  if (current?.parent) current.parent.remove(current);
  if (current) disposeOwnedGeometry(current);
  if (transformSource) copyTransform(replacement, transformSource);
  return replacement;
}

/**
 * Grafts a reusable storybook human onto an existing makeHuman(...) result.
 * This is synchronous after loadStorybookAssets(). All legacy animation pivots,
 * controller state, scale, poses, and hand children are retained. Supported
 * accessories are rebuilt by the shared visual system; staff, shield, and any
 * props added to either hand remain the original live attachments.
 *
 * Known role values: david-young, david-adult, david-king, poor-man, saul,
 * jonathan, abigail, nathan, crowd, soldier, generic. Passing player/david
 * infers young/adult/king from the supplied options.
 */
export function createStorybookHuman(baseHuman, options = {}, { role = 'generic' } = {}) {
  if (!baseHuman?.root || !baseHuman.body || !baseHuman.legL || !baseHuman.legR ||
      !baseHuman.armL || !baseHuman.armR || !baseHuman.head || !baseHuman.handR || !baseHuman.handL) {
    throw new TypeError('createStorybookHuman expects the object returned by makeHuman(...).');
  }
  assetsOrThrow();

  // Legacy simple humans create the leg pivots but forget to attach or position
  // them. Repair that contract before grafting so all existing poses still work.
  if (!baseHuman.legL.parent) {
    baseHuman.legL.position.set(0.12, 0.9, 0);
    baseHuman.body.add(baseHuman.legL);
  }
  if (!baseHuman.legR.parent) {
    baseHuman.legR.position.set(-0.12, 0.9, 0);
    baseHuman.body.add(baseHuman.legR);
  }

  const repeated = Boolean(baseHuman.root.userData.storybookHuman);
  const visuals = buildStorybookHumanVisuals(options, { role });
  const pivots = [baseHuman.body, baseHuman.legL, baseHuman.legR, baseHuman.armL, baseHuman.armR];
  for (const pivot of pivots) {
    removeDirectVisuals(pivot, repeated ? child => child.userData.storybookHumanVisual : null);
  }

  const legacyHead = detachLegacyHeadVisuals(baseHuman);
  removeDirectVisuals(baseHuman.head, child => child.userData.storybookHumanVisual);
  for (const visual of legacyHead) {
    if (visual.parent === baseHuman.head) baseHuman.head.remove(visual);
  }

  baseHuman.body.add(visuals.body);
  if (visuals.legL) baseHuman.legL.add(visuals.legL);
  if (visuals.legR) baseHuman.legR.add(visuals.legR);
  baseHuman.armL.add(visuals.armL);
  baseHuman.armR.add(visuals.armR);
  if (visuals.head) baseHuman.head.add(visuals.head);
  else for (const visual of legacyHead) baseHuman.head.add(visual);

  baseHuman.root.userData.storybookAsset = 'human';
  baseHuman.root.userData.storybookHuman = true;
  baseHuman.root.userData.storybookRole = visuals.role;
  baseHuman.root.userData.storybookVisualVersion = 2;
  baseHuman.root.userData.storybookUpgrade = visuals.supportedHead ? 'full' : 'partial-legacy-head';
  baseHuman.root.userData.storybookHumanMetadata = visuals.metadata;
  baseHuman.root.updateMatrixWorld(true);
  return baseHuman;
}

/**
 * Grafts the original high-detail storybook David visuals onto an existing makeHuman(...) result.
 * The base object, update function, controller state, and all live animation
 * pivots remain intact. The return value is the same baseHuman object.
 */
export function createStorybookDavid(baseHuman, options = {}) {
  if (!baseHuman?.root || !baseHuman.body || !baseHuman.legL || !baseHuman.legR ||
      !baseHuman.armL || !baseHuman.armR || !baseHuman.head || !baseHuman.handR || !baseHuman.handL) {
    throw new TypeError('createStorybookDavid expects the object returned by makeHuman(...).');
  }

  const { david: template } = assetsOrThrow();
  const clone = cloneTemplate(template);
  clone.traverse(object => {
    if (!object.isMesh || !object.material?.name) return;
    const name = object.material.name;
    let value = null, shade = 1;
    if (name.startsWith('David_Tunic')) { value = options.tunic; shade = name.includes('Shadow') ? .88 : name.includes('Light') ? 1.07 : 1; }
    else if (name.startsWith('David_Sash')) { value = options.sash; shade = name.includes('Edge') ? .72 : 1; }
    else if (name.startsWith('David_Skin')) { value = options.skin; shade = name.includes('Warm') ? .82 : 1; }
    else if (name.startsWith('David_Hair')) { value = options.hair; shade = name.includes('Highlight') ? 1.18 : 1; }
    if (value == null) return;
    const key = name + ':' + value;
    if (!davidMaterialVariants.has(key)) { const material = object.material.clone(); material.color.set(value).multiplyScalar(shade); davidMaterialVariants.set(key, material); }
    object.material = davidMaterialVariants.get(key);
  });
  const source = requireNodes(clone, DAVID_PIVOTS, 'storybook David clone');
  const targets = {
    body: baseHuman.body,
    legL: baseHuman.legL,
    legR: baseHuman.legR,
    armL: baseHuman.armL,
    armR: baseHuman.armR,
    head: baseHuman.head,
    handR: baseHuman.handR,
    handL: baseHuman.handL,
  };

  const oldStaff = baseHuman.staff;
  for (const target of Object.values(targets)) removeDirectVisuals(target);

  moveDirectVisuals(source.body, targets.body);
  moveDirectVisuals(source.legL, targets.legL);
  moveDirectVisuals(source.legR, targets.legR);
  moveDirectVisuals(source.armL, targets.armL);
  moveDirectVisuals(source.armR, targets.armR);
  moveDirectVisuals(source.head, targets.head);
  moveDirectVisuals(source.handL, targets.handL);
  moveDirectVisuals(source.handR, targets.handR);

  // makeHuman's staff local attachment is position (0,0,0.05), rotation.x 1.45.
  // Preserve the actual live transform in case the legacy implementation changes.
  if (oldStaff) {
    source.staff.parent?.remove(source.staff);
    baseHuman.staff = replaceAttachment(oldStaff, source.staff, source.staff);
    targets.handL.add(baseHuman.staff);
  } else {
    source.staff.parent?.remove(source.staff);
    baseHuman.staff = null;
  }

  baseHuman.root.userData.storybookAsset = 'david';
  baseHuman.root.userData.storybookVisualVersion = 1;
  baseHuman.root.updateMatrixWorld(true);
  return baseHuman;
}

function inferBlackSheep(originalQuadruped) {
  let total = 0;
  let count = 0;
  originalQuadruped?.body?.traverse(object => {
    if (!object.isMesh) return;
    const color = object.geometry?.getAttribute?.('color');
    if (color) {
      const sampleStep = Math.max(1, Math.floor(color.count / 96));
      for (let i = 0; i < color.count; i += sampleStep) {
        total += color.getX(i) * 0.2126 + color.getY(i) * 0.7152 + color.getZ(i) * 0.0722;
        count++;
      }
    } else if (object.material?.color) {
      const c = object.material.color;
      total += c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      count++;
    }
  });
  return count > 0 && total / count < 0.38;
}

function getSheepMaterial(material, black) {
  if (!black) return material;
  const key = `${material.uuid}:black`;
  if (sheepMaterialVariants.has(key)) return sheepMaterialVariants.get(key);
  const variant = material.clone();
  variant.name = `${material.name}_BlackVariant`;
  const colors = {
    Sheep_Wool: 0x3d3834,
    Sheep_Wool_Shade: 0x262421,
    Sheep_Face: 0x211e1c,
    Sheep_Muzzle: 0x4a4039,
    Sheep_Eyes: 0xd6b969,
    Sheep_Hooves: 0x171513,
  };
  if (colors[material.name] != null) variant.color.setHex(colors[material.name]);
  sheepMaterialVariants.set(key, variant);
  return variant;
}

function applySheepPalette(root, black) {
  root.traverse(object => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map(mat => getSheepMaterial(mat, black));
    } else {
      object.material = getSheepMaterial(object.material, black);
    }
  });
}

function installSheepHeadAnimation(model, head, grazeAngle) {
  if (!model.__storybookLegacyUpdate) model.__storybookLegacyUpdate = model.update.bind(model);
  model.update = (dt, speed = 0) => {
    model.__storybookLegacyUpdate(dt, speed);
    const target = model.graze ? grazeAngle : 0;
    const damping = 1 - Math.exp(-5 * Math.max(0, dt));
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, target, damping);
    const idle = speed < 0.12 && !model.graze ? Math.sin(model.t * 1.6 + model.phase) * 0.035 : 0;
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, idle, damping * 0.55);
  };
}

/**
 * Grafts the storybook sheep visuals onto makeQuadruped('sheep', ...).
 * Existing root/body/four leg pivots and locomotion behavior are retained.
 * options.black is optional and is inferred from the legacy vertex colors.
 */
export function createStorybookSheep(originalQuadruped, options = {}) {
  if (!originalQuadruped?.root || !originalQuadruped.body ||
      !Array.isArray(originalQuadruped.legs) || originalQuadruped.legs.length !== 4) {
    throw new TypeError("createStorybookSheep expects the object returned by makeQuadruped('sheep', ...).");
  }

  const black = options.black ?? inferBlackSheep(originalQuadruped);
  const grazeAngle = options.grazeAngle ?? 0.95;
  const { sheep: template } = assetsOrThrow();
  const clone = cloneTemplate(template);
  applySheepPalette(clone, black);
  const source = requireNodes(clone, SHEEP_PIVOTS, 'storybook sheep clone');

  if (originalQuadruped.head?.parent) originalQuadruped.head.parent.remove(originalQuadruped.head);
  removeDirectVisuals(originalQuadruped.body);
  for (const leg of originalQuadruped.legs) removeDirectVisuals(leg);

  moveDirectVisuals(source.body, originalQuadruped.body);
  for (let i = 0; i < SHEEP_LEG_NAMES.length; i++) {
    moveDirectVisuals(source[SHEEP_LEG_NAMES[i]], originalQuadruped.legs[i]);
    originalQuadruped.legs[i].name = SHEEP_LEG_NAMES[i];
  }

  source.head.parent?.remove(source.head);
  originalQuadruped.body.add(source.head);
  originalQuadruped.head = source.head;
  installSheepHeadAnimation(originalQuadruped, source.head, grazeAngle);

  originalQuadruped.root.userData.storybookAsset = black ? 'black-sheep' : 'sheep';
  originalQuadruped.root.userData.storybookVisualVersion = 1;
  originalQuadruped.root.updateMatrixWorld(true);
  return originalQuadruped;
}

export function getStorybookAssetStatus() {
  return Object.freeze({
    loaded: Boolean(loadedAssets),
    urls: Object.freeze({ david: ASSET_URLS.david.href, sheep: ASSET_URLS.sheep.href }),
    humanCache: getStorybookHumanCacheStatus(),
  });
}
