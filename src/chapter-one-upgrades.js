import CameraControls from '../vendor/gameplay/camera-controls.module.js';
import { createChapterOneSheepSteering } from './sheep-steering.js';

export const CHAPTER_ONE_UPGRADES_VERSION = '1.0.0';

const CAMERA_CONTROLS_INSTALLED = new WeakSet();
const INSTALL_MARK = Symbol.for('the-shepherd-king.chapter-one-upgrades');
const VECTOR_EPSILON_SQ = 1e-10;

const finite3 = value => Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
const finiteDt = value => Number.isFinite(value) && value > 0 ? Math.min(value, 1) : 0;
const sameVector = (a, b) => a.distanceToSquared(b) <= VECTOR_EPSILON_SQ;

function smoothWeight(value) {
  const t = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return t * t * (3 - 2 * t);
}

function cinematicRate(cine) {
  return Number.isFinite(cine?.k) && cine.k >= 0 ? cine.k : 2.5;
}

function smoothTimeForRate(rate) {
  if (rate === 0) return 1e6;
  return Math.max(1 / 120, 1 / rate);
}

function createChapterOneCameraSmoothing(game, THREE, CH1) {
  if (!CAMERA_CONTROLS_INSTALLED.has(THREE)) {
    CameraControls.install({ THREE });
    CAMERA_CONTROLS_INSTALLED.add(THREE);
  }

  const proxyCamera = game.camera.clone();
  const controls = new CameraControls(proxyCamera);
  controls.enabled = false;

  const hadOwnUpdate = Object.prototype.hasOwnProperty.call(game, 'updateCamera');
  const originalUpdate = game.updateCamera;
  const entryPosition = new THREE.Vector3();
  const entryLook = new THREE.Vector3();
  const nativeCinePosition = new THREE.Vector3();
  const nativeCineLook = new THREE.Vector3();
  const proxyLook = new THREE.Vector3();
  const correction = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const lastWrittenPosition = new THREE.Vector3();
  const lastWrittenLook = new THREE.Vector3();

  const diagnostics = {
    engine: 'camera-controls-cinematic-smoothing',
    active: false,
    transitions: 0,
    rebases: 0,
    invalidFrames: 0,
    lastRate: null,
    disposed: false,
  };

  let activeCine = null;
  let haveTarget = false;
  let haveLastWritten = false;

  function setTransitionTarget(cine, startPosition, startLook, rebase) {
    const rate = cinematicRate(cine);
    controls.smoothTime = smoothTimeForRate(rate);
    controls.draggingSmoothTime = controls.smoothTime;
    diagnostics.lastRate = rate;

    if (rebase) {
      controls.setLookAt(
        startPosition.x, startPosition.y, startPosition.z,
        startLook.x, startLook.y, startLook.z,
        false,
      );
      // Commit the immediate state before starting another transition. This also
      // clears the library's retained SmoothDamp velocities from the old target.
      controls.update(0);
      diagnostics.rebases++;
    }

    controls.setLookAt(
      cine.pos.x, cine.pos.y, cine.pos.z,
      cine.look.x, cine.look.y, cine.look.z,
      true,
    );
    targetPosition.copy(cine.pos);
    targetLook.copy(cine.look);
    haveTarget = true;
  }

  function clearTransitionState() {
    activeCine = null;
    haveTarget = false;
    haveLastWritten = false;
    diagnostics.active = false;
  }

  const wrappedUpdate = function chapterOneCinematicCameraUpdate(dt) {
    if (diagnostics.disposed || this.ch !== CH1) return originalUpdate.call(this, dt);

    const elapsed = finiteDt(dt);
    const cineAtEntry = this.cine;
    const smoothCinematic = Boolean(cineAtEntry) && !this.aiming;
    entryPosition.copy(this.cinePos);
    entryLook.copy(this.cineLook);

    const targetChanged = smoothCinematic && cineAtEntry !== activeCine;
    const explicitRebase = smoothCinematic
      && cineAtEntry === activeCine
      && haveLastWritten
      && (!sameVector(entryPosition, lastWrittenPosition) || !sameVector(entryLook, lastWrittenLook));

    const result = originalUpdate.call(this, elapsed);
    nativeCinePosition.copy(this.cinePos);
    nativeCineLook.copy(this.cineLook);

    if (!smoothCinematic) {
      clearTransitionState();
      return result;
    }

    if (!finite3(cineAtEntry.pos) || !finite3(cineAtEntry.look)
      || !finite3(entryPosition) || !finite3(entryLook)
      || !finite3(nativeCinePosition) || !finite3(nativeCineLook)) {
      diagnostics.invalidFrames++;
      clearTransitionState();
      return result;
    }

    const targetMoved = haveTarget
      && (!sameVector(cineAtEntry.pos, targetPosition) || !sameVector(cineAtEntry.look, targetLook));
    const rate = cinematicRate(cineAtEntry);
    const rateChanged = rate !== diagnostics.lastRate;

    if (targetChanged) {
      activeCine = cineAtEntry;
      diagnostics.transitions++;
      setTransitionTarget(cineAtEntry, entryPosition, entryLook, true);
    } else if (explicitRebase) {
      setTransitionTarget(cineAtEntry, entryPosition, entryLook, true);
    } else if (targetMoved || rateChanged || !haveTarget) {
      setTransitionTarget(cineAtEntry, entryPosition, entryLook, false);
    }

    controls.update(elapsed);
    controls.getTarget(proxyLook, false);
    if (!finite3(proxyCamera.position) || !finite3(proxyLook)) {
      diagnostics.invalidFrames++;
      controls.setLookAt(
        nativeCinePosition.x, nativeCinePosition.y, nativeCinePosition.z,
        nativeCineLook.x, nativeCineLook.y, nativeCineLook.z,
        false,
      );
      controls.update(0);
      proxyLook.copy(nativeCineLook);
    }

    const weight = smoothWeight(this.cineW);
    correction.subVectors(proxyCamera.position, nativeCinePosition);
    this.camera.position.addScaledVector(correction, weight);
    correction.subVectors(proxyLook, nativeCineLook);
    this.camLook.addScaledVector(correction, weight);

    // Native cineOff() fades from these fields, so retain the smoothed frame as
    // the authoritative cinematic contribution for the subsequent fade-out.
    this.cinePos.copy(proxyCamera.position);
    this.cineLook.copy(proxyLook);
    lastWrittenPosition.copy(this.cinePos);
    lastWrittenLook.copy(this.cineLook);
    haveLastWritten = true;
    diagnostics.active = true;
    this.camera.lookAt(this.camLook);
    return result;
  };

  game.updateCamera = wrappedUpdate;

  return {
    engine: diagnostics.engine,
    controls,
    proxyCamera,
    diagnostics,
    get active() { return diagnostics.active; },
    reset() {
      clearTransitionState();
      if (finite3(game.cinePos) && finite3(game.cineLook)) {
        controls.setLookAt(
          game.cinePos.x, game.cinePos.y, game.cinePos.z,
          game.cineLook.x, game.cineLook.y, game.cineLook.z,
          false,
        );
        controls.update(0);
      }
    },
    finite() {
      controls.getTarget(proxyLook, false);
      return finite3(proxyCamera.position) && finite3(proxyLook);
    },
    dispose() {
      if (diagnostics.disposed) return;
      diagnostics.disposed = true;
      clearTransitionState();
      controls.dispose();
      if (game.updateCamera === wrappedUpdate) {
        if (hadOwnUpdate) game.updateCamera = originalUpdate;
        else delete game.updateCamera;
      }
    },
  };
}

function attachChapterOneUpgrades(game, THREE, CH1) {
  game.chapterOneUpgrades?.dispose?.();

  const sheep = createChapterOneSheepSteering(game, CH1.s?.sheep || game.ch?.s?.sheep || []);
  let camera;
  try {
    camera = createChapterOneCameraSmoothing(game, THREE, CH1);
  } catch (error) {
    sheep.dispose();
    throw error;
  }

  const diagnostics = {
    chapterId: CH1.id,
    attached: true,
    disposed: false,
    sheep: sheep.diagnostics,
    camera: camera.diagnostics,
    finite() { return sheep.finite() && camera.finite(); },
  };

  const bundle = {
    version: CHAPTER_ONE_UPGRADES_VERSION,
    sheep,
    camera,
    diagnostics,
    dispose() {
      if (diagnostics.disposed) return;
      diagnostics.disposed = true;
      diagnostics.attached = false;
      camera.dispose();
      sheep.dispose();
      if (game.chapterOneUpgrades === bundle) game.chapterOneUpgrades = null;
    },
  };

  game.chapterOneUpgrades = bundle;
  if (typeof game.onChapterCleanup !== 'function') {
    bundle.dispose();
    throw new Error('Chapter 1 upgrades require game.onChapterCleanup()');
  }
  game.onChapterCleanup(() => bundle.dispose());
  return bundle;
}

/**
 * Installs a guarded post-build Chapter 1 adapter. Call after the existing
 * graphics installers and before constructing Game.
 */
export function installChapterOneUpgrades({ THREE, Game, CH1 }) {
  if (!THREE || !Game?.prototype || !CH1) {
    throw new Error('installChapterOneUpgrades requires THREE, Game, and CH1');
  }

  const proto = Game.prototype;
  if (proto[INSTALL_MARK]) return proto[INSTALL_MARK];

  const originalLoadWorld = proto.loadWorld;
  if (typeof originalLoadWorld !== 'function') {
    throw new Error('installChapterOneUpgrades requires Game.prototype.loadWorld');
  }

  const installed = {
    version: CHAPTER_ONE_UPGRADES_VERSION,
    originalLoadWorld,
  };

  const wrappedLoadWorld = function chapterOneUpgradesLoadWorld(...args) {
    const result = originalLoadWorld.apply(this, args);
    if (this.ch === CH1) attachChapterOneUpgrades(this, THREE, CH1);
    return result;
  };

  installed.wrappedLoadWorld = wrappedLoadWorld;
  Object.defineProperty(proto, INSTALL_MARK, { value: installed });
  Object.defineProperty(proto, '__chapterOneUpgradesInstalled', { value: true });
  proto.loadWorld = wrappedLoadWorld;
  return installed;
}
