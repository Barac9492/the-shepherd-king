import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { articulateStorybookHuman } from '../src/character-motion.js';
import { createRearShepherd } from '../src/my-shepherd-character.js';

function makeFixtureHuman(options, { faceGeometry, faceMaterial, storybook = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(options.scale ?? 1);
  if (storybook) root.userData.storybookHuman = true;

  const human = {
    root,
    body,
    phase: 0,
    t: 0,
    pose: 'auto',
    speed: 0,
    tgt: { lL: 0, lR: 0, aL: 0, aR: 0, aLz: .1, aRz: -.1, by: 0, bx: 0, hx: 0, hy: 0 },
  };
  for (const name of ['legL', 'legR', 'armL', 'armR', 'head']) {
    human[name] = new THREE.Group();
    human[name].name = name;
    body.add(human[name]);
  }
  human.legL.position.set(.12, .9, 0);
  human.legR.position.set(-.12, .9, 0);
  human.armL.position.set(.39, 1.52, 0);
  human.armR.position.set(-.39, 1.52, 0);
  human.head.position.y = 1.86;

  human.handL = new THREE.Group();
  human.handR = new THREE.Group();
  human.handL.name = 'handL';
  human.handR.name = 'handR';
  human.handL.position.y = human.handR.position.y = -.64;
  human.armL.add(human.handL);
  human.armR.add(human.handR);

  const face = new THREE.Mesh(
    faceGeometry || new THREE.SphereGeometry(.2, 8, 6),
    faceMaterial || new THREE.MeshBasicMaterial(),
  );
  face.name = 'factory-face-bearing-head';
  human.head.add(face);
  human.faceVisual = face;

  if (storybook) {
    for (const leg of [human.legL, human.legR]) {
      const geometry = new THREE.CapsuleGeometry(.08, .52, 3, 8);
      geometry.translate(0, -.43, 0);
      const visual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      visual.userData.storybookHumanVisual = true;
      leg.add(visual);
    }
  }

  human.staff = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, 1.9, 5), new THREE.MeshBasicMaterial());
  human.staff.name = 'factory-staff';
  human.handL.add(human.staff);

  human.update = (dt, speed = 0) => {
    human.t += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    human.speed = speed;
    if (human.pose === 'carryarms') {
      human.armL.rotation.x = -1.1;
      human.armR.rotation.x = -1.1;
      human.armL.rotation.z = -.35;
      human.armR.rotation.z = .35;
    } else {
      human.armL.rotation.x = human.armR.rotation.x = 0;
      human.armL.rotation.z = .1;
      human.armR.rotation.z = -.1;
    }
  };
  return human;
}

test('uses the shared human factory while replacing only this instance head visual', () => {
  const sharedGeometry = new THREE.SphereGeometry(.2, 8, 6);
  sharedGeometry.userData.storybookShared = true;
  const sharedMaterial = new THREE.MeshBasicMaterial();
  let geometryDisposals = 0;
  let materialDisposals = 0;
  sharedGeometry.dispose = () => { geometryDisposals++; };
  sharedMaterial.dispose = () => { materialDisposals++; };

  let receivedOptions;
  let factoryHuman;
  const shepherd = createRearShepherd({
    THREE,
    makeHuman(options) {
      receivedOptions = options;
      factoryHuman = makeFixtureHuman(options, { faceGeometry: sharedGeometry, faceMaterial: sharedMaterial });
      return factoryHuman;
    },
  });

  assert.equal(shepherd, factoryHuman, 'the live makeHuman rig must be returned, not copied');
  assert.equal(receivedOptions.simple, false);
  assert.equal(receivedOptions.scale, 1);
  assert.equal(receivedOptions.staff, true);
  assert.ok(receivedOptions.robeLen >= 1.25, 'robe must remain long while exposing articulated feet');
  assert.ok(receivedOptions.cloak != null, 'the shared draped-cloak option must be used');
  assert.equal(receivedOptions.hat, null, 'a hat/hood must not replace the rear hair silhouette');
  assert.equal(receivedOptions.storybookRole, 'jesus-rear');

  assert.equal(geometryDisposals, 0, 'detaching this head must not dispose cached/shared geometry');
  assert.equal(materialDisposals, 0, 'detaching this head must not dispose cached/shared material');
  assert.deepEqual(shepherd.ownedDetachedGeometries, []);
  assert.equal(shepherd.disposeDetachedVisuals(), 0);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 0);
  assert.equal(factoryHuman.faceVisual.parent, null);
  assert.equal(shepherd.head.name, 'head', 'the existing head pivot API must be preserved');
  assert.deepEqual(shepherd.head.children.map(child => child.name).sort(), [
    'rear-back-neck-shell',
    'rear-shoulder-hair-shell',
  ]);
  assert.ok(shepherd.head.children.every(child => child.geometry.type === 'LatheGeometry'));
  assert.ok(shepherd.head.children.every(child => !/face|eye|nose|mouth/i.test(child.name)));

  for (const pivot of ['legL', 'legR', 'handL', 'handR']) assert.equal(shepherd[pivot], factoryHuman[pivot]);
  assert.equal(shepherd.root.userData.faceless, true);
  assert.equal(shepherd.root.userData.rearOnly, true);
  assert.equal(shepherd.root.userData.articulated, true);
  assert.equal(shepherd.ownedMaterials.length, 2);
  assert.ok(shepherd.ownedMaterials.every(material => material !== sharedMaterial));
  assert.deepEqual(shepherd.ownedMaterials.map(material => material.name).sort(), [
    'MyShepherd_RearHair',
    'MyShepherd_RearNape',
  ]);
});

test('disposes only detached instance-owned legacy head geometry, once', () => {
  const ownedGeometry = new THREE.SphereGeometry(.2, 8, 6);
  const factoryMaterial = new THREE.MeshBasicMaterial();
  let geometryDisposals = 0;
  let materialDisposals = 0;
  ownedGeometry.dispose = () => { geometryDisposals++; };
  factoryMaterial.dispose = () => { materialDisposals++; };
  const shepherd = createRearShepherd({
    THREE,
    makeHuman: options => makeFixtureHuman(options, { faceGeometry: ownedGeometry, faceMaterial: factoryMaterial }),
  });

  assert.deepEqual(shepherd.ownedDetachedGeometries, [ownedGeometry]);
  assert.equal(shepherd.disposeDetachedVisuals(), 1);
  assert.equal(shepherd.disposeDetachedVisuals(), 0);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 0, 'factory materials are never owned or disposed by this adapter');
});

test('provides a chest-side carry anchor and a reversible carry-arms/staff state', () => {
  const shepherd = createRearShepherd({ THREE, makeHuman: options => makeFixtureHuman(options) });
  assert.equal(shepherd.carryAnchor.parent, shepherd.body);
  assert.ok(shepherd.carryAnchor.position.y > 1.1 && shepherd.carryAnchor.position.y < 1.45);
  assert.ok(shepherd.carryAnchor.position.z > .25, 'the lamb belongs in front of the torso, not on the back');
  assert.ok(Math.abs(shepherd.carryAnchor.position.x) > .1, 'side offset keeps part of the lamb readable from behind');

  const staff = shepherd.staff;
  assert.equal(staff.visible, true);
  shepherd.setCarrying(true);
  assert.equal(shepherd.pose, 'carryarms');
  assert.equal(staff.visible, false, 'the hand-held staff must not float through a carried lamb');
  shepherd.update(1 / 60, 0);
  assert.ok(shepherd.armL.rotation.x < -1 && shepherd.armR.rotation.x < -1);
  assert.equal(shepherd.root.userData.carrying, true);

  shepherd.setCarrying(true);
  assert.equal(shepherd.pose, 'carryarms', 'repeated calls are idempotent');
  shepherd.setCarrying(false);
  assert.equal(shepherd.pose, 'auto');
  assert.equal(staff.visible, true);
  assert.equal(shepherd.root.userData.carrying, false);
});

test('synthetic articulated rig preserves knee and distance-gait contract without another update wrapper', () => {
  let articulatedUpdate;
  const shepherd = createRearShepherd({
    THREE,
    makeHuman(options) {
      const human = makeFixtureHuman(options, { storybook: true });
      articulateStorybookHuman(human);
      articulatedUpdate = human.update;
      return human;
    },
  });

  assert.equal(shepherd.update, articulatedUpdate, 'the character factory must not double-tick or replace distance gait');
  assert.equal(shepherd.__storyKnees.length, 2);
  assert.equal(shepherd.legL.parent, shepherd.body);
  assert.equal(shepherd.legR.parent, shepherd.body);

  for (let frame = 0; frame < 45; frame++) {
    shepherd.root.position.z += 2.4 / 60;
    shepherd.update(1 / 60, 2.4);
  }
  const articulatedAngles = [
    shepherd.legL.rotation.x,
    shepherd.legR.rotation.x,
    ...shepherd.__storyKnees.map(knee => knee.rotation.x),
  ];
  assert.ok(articulatedAngles.some(value => Math.abs(value) > .02), 'the shared two-knee gait must remain active');
  assert.ok(articulatedAngles.every(Number.isFinite));

  for (let frame = 0; frame < 60; frame++) shepherd.update(1 / 60, 8);
  const settled = [
    shepherd.legL.rotation.x,
    shepherd.legR.rotation.x,
    ...shepherd.__storyKnees.map(knee => knee.rotation.x),
  ];
  assert.ok(settled.every(value => Math.abs(value) < 1e-5), 'residual requested speed must not create walking in place');
});
