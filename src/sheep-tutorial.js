const INSTALL_MARK = Symbol.for('the-shepherd-king.sheep-tutorial');
const VERSION = '1.0.0';
const RECRUIT_RADIUS = 8;
const WANDER_DEST_RADIUS = 4.2;
const WANDER_RETURN_RADIUS = 5.5;

// All six adults stay on or immediately beside the existing open southeast
// approach to the pasture path. The first two retain their authored safe
// locations; the other four replace remote hillside spawns without entering
// the stone fold or the path-side decoration bands.
const ADULT_TUTORIAL_SPOTS = Object.freeze([
  Object.freeze([-4, 30]),
  Object.freeze([13, 26]),
  Object.freeze([5, 31]),
  Object.freeze([5, 23]),
  Object.freeze([4, 18]),
  Object.freeze([3, 12]),
]);

const finite2 = value => Number.isFinite(value?.x) && Number.isFinite(value?.z);

function setActorDestination(THREE, actor, x, z) {
  if (actor.dest?.set) actor.dest.set(x, 0, z);
  else actor.dest = new THREE.Vector3(x, 0, z);
}

function createGuidanceMarker(THREE) {
  const marker = new THREE.Group();
  marker.name = 'sheep-tutorial-guidance';
  marker.userData.sheepTutorial = true;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd878,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.02, 24), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  marker.add(ring);

  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 8), arrowMaterial);
  arrow.position.y = 1.55;
  arrow.rotation.x = Math.PI;
  marker.add(arrow);

  marker.visible = false;
  return marker;
}

function disposeObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse?.(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach(geometry => geometry.dispose?.());
  materials.forEach(material => material.dispose?.());
}

function addToWorld(game, object) {
  if (typeof game.add === 'function') game.add(object);
  else game.root?.add?.(object);
}

function writeWaypoint(game, waypoint) {
  if (typeof game.setWaypoint === 'function') game.setWaypoint(waypoint);
  else {
    game.waypoint = waypoint;
    if (game.beam) game.beam.visible = Boolean(waypoint);
  }
}

function repositionAdults(game, state) {
  const adults = state.sheep.filter(sheep => !sheep?.lamb).slice(0, ADULT_TUTORIAL_SPOTS.length);
  adults.forEach((sheep, index) => {
    const [x, z] = ADULT_TUTORIAL_SPOTS[index];
    const actor = sheep.a;
    actor.stop?.();
    actor.pos.set(x, game.groundAt?.(x, z) ?? actor.pos.y ?? 0, z);
    actor.dest = null;
    actor.speed = 0;
    actor.sync?.();
    sheep.home = [x, z];
  });
  return adults;
}

function attachTutorial(game, THREE, CH1, FOLD) {
  const state = CH1.s || game.ch?.s;
  if (!state || !Array.isArray(state.sheep)) {
    throw new Error('Chapter 1 tutorial requires CH1.s.sheep after build');
  }

  const adults = repositionAdults(game, state);
  const lamb = state.lamb || state.sheep.find(sheep => sheep?.lamb) || null;
  const foldPoint = new THREE.Vector3(FOLD[0], 0, FOLD[1]);
  const marker = createGuidanceMarker(THREE);
  addToWorld(game, marker);

  const diagnostics = {
    version: VERSION,
    recruitments: 0,
    waypointClaims: 0,
    boundedReturns: 0,
    disposed: false,
    completed: false,
  };

  let waypointTarget = null;
  let elapsed = 0;
  let legacyClearWrapper = null;
  let originalClearChapter = null;
  let hadOwnClearChapter = false;

  const ownedWaypoint = () => waypointTarget;

  function clearOwnedWaypoint() {
    waypointTarget = null;
    marker.visible = false;
    if (game.waypoint === ownedWaypoint) writeWaypoint(game, null);
  }

  function claimWaypoint(target) {
    waypointTarget = target;
    if (game.waypoint !== ownedWaypoint) {
      writeWaypoint(game, ownedWaypoint);
      diagnostics.waypointClaims++;
    }
  }

  function active() {
    return game.ch === CH1
      && game.mode === 'play'
      && !game.paused
      && !game.dq
      && !game.lock
      && !game.sling
      && !game.cine
      && state.canFollow !== false;
  }

  function eligibleToRecruit(sheep) {
    return sheep?.st === 'graze'
      && sheep.a
      && finite2(sheep.a.pos)
      && (!sheep.lamb || sheep.noFollow === false);
  }

  function keepAdultWanderingBounded(sheep) {
    if (sheep.st !== 'graze' || !Array.isArray(sheep.home) || !finite2(sheep.a?.pos)) return;
    const [homeX, homeZ] = sheep.home;
    const actor = sheep.a;

    if (finite2(actor.dest)) {
      const dx = actor.dest.x - homeX;
      const dz = actor.dest.z - homeZ;
      const distance = Math.hypot(dx, dz);
      if (distance > WANDER_DEST_RADIUS) {
        const scale = WANDER_DEST_RADIUS / distance;
        actor.dest.x = homeX + dx * scale;
        actor.dest.z = homeZ + dz * scale;
      }
    }

    if (Math.hypot(actor.pos.x - homeX, actor.pos.z - homeZ) > WANDER_RETURN_RADIUS) {
      setActorDestination(THREE, actor, homeX, homeZ);
      actor.walkSpeed = 1.1;
      diagnostics.boundedReturns++;
    }
  }

  function nearestUncollectedAdult() {
    const player = game.player?.pos;
    if (!finite2(player)) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const sheep of adults) {
      if (sheep.st !== 'graze' || !finite2(sheep.a?.pos)) continue;
      const distance = Math.hypot(sheep.a.pos.x - player.x, sheep.a.pos.z - player.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = sheep;
      }
    }
    return nearest;
  }

  function updateMarker(target, dt) {
    if (!finite2(target)) {
      marker.visible = false;
      return;
    }
    elapsed += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    marker.visible = true;
    marker.position.set(target.x, (game.groundAt?.(target.x, target.z) ?? target.y ?? 0) + 0.08, target.z);
    marker.rotation.y += 0.8 * (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0);
    marker.scale.setScalar(0.94 + Math.sin(elapsed * 3.2) * 0.08);
  }

  function updater(dt) {
    if (diagnostics.disposed || diagnostics.completed) return false;

    for (const sheep of adults) keepAdultWanderingBounded(sheep);

    if (state.inFold >= 7) {
      diagnostics.completed = true;
      clearOwnedWaypoint();
      return false;
    }

    if (!active()) {
      clearOwnedWaypoint();
      return;
    }

    const player = game.player?.pos;
    if (finite2(player)) {
      for (const sheep of state.sheep) {
        if (!eligibleToRecruit(sheep)) continue;
        // The lion can drop the rescued lamb beyond David's movement boundary.
        // Let it walk back after the rescue dialogue, without requiring David
        // to reach the drop point. Ordinary sheep still use nearby recruitment.
        if (sheep.lamb || Math.hypot(sheep.a.pos.x - player.x, sheep.a.pos.z - player.z) <= RECRUIT_RADIUS) {
          sheep.st = 'follow';
          diagnostics.recruitments++;
        }
      }
    }

    const following = state.sheep.find(sheep => sheep?.st === 'follow' && (!sheep.lamb || sheep.noFollow === false));
    let target = null;
    if (following) target = foldPoint;
    else {
      const nearestAdult = nearestUncollectedAdult();
      if (nearestAdult) target = nearestAdult.a.pos;
      else if (eligibleToRecruit(lamb)) target = lamb.a.pos;
    }

    if (!target) {
      clearOwnedWaypoint();
      return;
    }

    claimWaypoint(target);
    updateMarker(target, dt);
  }

  function dispose() {
    if (diagnostics.disposed) return;
    diagnostics.disposed = true;
    clearOwnedWaypoint();
    marker.parent?.remove?.(marker);
    disposeObjectResources(marker);

    if (legacyClearWrapper && game.clearChapter === legacyClearWrapper) {
      if (hadOwnClearChapter) game.clearChapter = originalClearChapter;
      else delete game.clearChapter;
    }
    if (game.sheepTutorial === bundle) game.sheepTutorial = null;
  }

  const bundle = {
    version: VERSION,
    adults,
    lamb,
    marker,
    diagnostics,
    updater,
    dispose,
  };

  game.sheepTutorial = bundle;
  game.every?.(updater);

  if (typeof game.onChapterCleanup === 'function') {
    game.onChapterCleanup(dispose);
  } else if (typeof game.clearChapter === 'function') {
    hadOwnClearChapter = Object.prototype.hasOwnProperty.call(game, 'clearChapter');
    originalClearChapter = game.clearChapter;
    legacyClearWrapper = function sheepTutorialClearChapter(...args) {
      dispose();
      return originalClearChapter.apply(this, args);
    };
    game.clearChapter = legacyClearWrapper;
  }

  return bundle;
}

/**
 * Installs Chapter 1's file-only sheep-finding tutorial as a guarded post-build
 * adapter. The authored Chapter 1 build, run, lion, sling, fold count, and later
 * servant/family sequence remain authoritative.
 */
export function installSheepTutorial({ THREE, CH1, FOLD }) {
  if (!THREE?.Vector3 || !THREE?.Group || !CH1 || typeof CH1.build !== 'function') {
    throw new Error('installSheepTutorial requires THREE and CH1.build');
  }
  if (!Array.isArray(FOLD) || !Number.isFinite(FOLD[0]) || !Number.isFinite(FOLD[1])) {
    throw new Error('installSheepTutorial requires a finite [x, z] FOLD');
  }
  if (CH1[INSTALL_MARK]) return CH1[INSTALL_MARK];

  const originalBuild = CH1.build;
  const wrappedBuild = function sheepTutorialBuild(game, ...args) {
    game?.sheepTutorial?.dispose?.();
    const result = originalBuild.call(this, game, ...args);
    attachTutorial(game, THREE, CH1, FOLD);
    return result;
  };

  const installed = { version: VERSION, originalBuild, wrappedBuild };
  Object.defineProperty(CH1, INSTALL_MARK, { value: installed });
  Object.defineProperty(CH1, '__sheepTutorialInstalled', { value: true });
  CH1.build = wrappedBuild;
  return installed;
}
