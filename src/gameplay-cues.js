// Presentation only. The original input, projectile and chapter rules stay authoritative.
export const SLING_READY_THRESHOLD = 0.3;
const FOLD_OBJECTIVE = 'Gather the sheep into the stone fold';
const INSTALLED = Symbol.for('the-shepherd-king.gameplay-cues');
const COPY = {
  winding: { en: 'Getting ready…', ko: '물매 준비 중…' },
  ready: { en: 'Release to throw · fixed power', ko: '놓으면 던져요 · 위력은 같아요' },
  released: { en: 'Stone released', ko: '돌을 던졌어요' },
  missed: { en: 'Missed · aim and try again', ko: '빗나갔어요 · 다시 조준해 보세요' },
  following: { en: 'A sheep is following · lead it to the fold', ko: '양이 따라와요 · 우리로 데려가세요' },
};

export function slingCueState(game) {
  if (!game.sling || game.bow || !game.aiming || game.mode !== 'play' || game.paused || game.lock || game.dq) return null;
  return game.aimCharge > SLING_READY_THRESHOLD ? 'ready' : 'winding';
}

export function createGameplayCues({ game, THREE, CH1, FOLD, document, translate }) {
  const slingLabel = document.getElementById('slingCue');
  const flockLabel = document.getElementById('flockCue');
  const cross = document.getElementById('cross');
  const charge = document.getElementById('charge');
  let hitProjectiles = new WeakSet();
  let recruited = new WeakSet();
  let slingEvent = null, slingUntil = 0, flockUntil = 0;
  let foldRing = null, flock = null;
  const now = () => game.time || 0;
  const playable = () => game.mode === 'play' && !game.paused && !game.lock && !game.dq && !game.cine;
  const foldActive = () => game.ch === CH1 && playable() && !game.sling && flock?.canFollow !== false
    && flock?.inFold < 7 && game.objective?.text?.en === FOLD_OBJECTIVE;
  function label(element, key) {
    element.hidden = !key;
    const text = key ? translate(COPY[key]) : '';
    if (element.textContent !== text) element.textContent = text;
  }
  function clearAim() {
    slingEvent = null;
    slingUntil = 0;
    cross.classList.remove('sling-ready');
    label(slingLabel, null);
  }
  function suspend() {
    clearAim();
    flockUntil = 0;
    label(flockLabel, null);
    if (foldRing) foldRing.visible = false;
  }
  function updateAim() {
    const state = slingCueState(game);
    cross.classList.toggle('sling-ready', state === 'ready');
    if (state) {
      // This bar measures readiness, never power. Bow retains its original bar.
      charge.firstChild.style.width = `${state === 'ready' ? 100 : Math.min(99, Math.max(0, game.aimCharge / SLING_READY_THRESHOLD * 100))}%`;
      label(slingLabel, state);
    } else {
      label(slingLabel, playable() && game.sling && !game.bow && now() < slingUntil ? slingEvent : null);
    }
  }
  function release(projectile) {
    if (projectile.arrow) return;
    slingEvent = 'released'; slingUntil = now() + 0.55;
  }
  function hit(projectile) {
    // Called only by the authoritative collision branch. Authored hit/helmet
    // callbacks already own their audio and particles; add no duplicate effects.
    if (!projectile.arrow) hitProjectiles.add(projectile);
  }
  function removed(projectile) {
    if (projectile.arrow) return;
    const contacted = hitProjectiles.delete(projectile);
    if (!contacted && playable() && game.sling && !game.bow) {
      slingEvent = 'missed'; slingUntil = now() + 1.05;
    }
  }
  function disposeFold() {
    if (!foldRing) return;
    foldRing.removeFromParent();
    foldRing.geometry.dispose();
    foldRing.material.dispose();
    foldRing = null; flock = null;
  }
  function attachFold(state) {
    disposeFold(); recruited = new WeakSet(); flock = state;
    const geometry = new THREE.RingGeometry(1.25, 1.4, 28);
    geometry.rotateX(-Math.PI / 2);
    const x = FOLD[0], z = FOLD[1] + 6.4;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, game.groundAt(x + positions.getX(i), z + positions.getZ(i)) + 0.055);
    }
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ color: 0xe4c584, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
    foldRing = new THREE.Mesh(geometry, material);
    foldRing.name = 'gameplay-fold-entrance';
    foldRing.position.set(x, 0, z); foldRing.visible = false;
    game.root.add(foldRing);
    for (const sheep of state.sheep) if (sheep.st === 'follow' || sheep.st === 'fold') recruited.add(sheep);
  }
  function updateFlock() {
    if (!foldRing || !flock) return;
    const active = foldActive();
    foldRing.visible = active;
    for (const sheep of flock.sheep) {
      if (sheep.st !== 'follow' || recruited.has(sheep)) continue;
      recruited.add(sheep);
      if (active) flockUntil = now() + 1.6;
    }
    if (!active) flockUntil = 0;
    label(flockLabel, active && now() < flockUntil ? 'following' : null);
  }
  function reset() {
    suspend(); disposeFold(); hitProjectiles = new WeakSet(); recruited = new WeakSet();
  }
  return { updateAim, release, hit, removed, attachFold, updateFlock, clearAim, suspend, reset,
    get foldRing() { return foldRing; } };
}

/** Install after chapter adapters so recruitment observation runs after both AIs. */
export function installGameplayCues({ Game, Input, THREE, CH1, FOLD, document = globalThis.document, translate = text => text.en }) {
  if (Game.prototype[INSTALLED]) return;
  Object.defineProperty(Game.prototype, INSTALLED, { value: true });
  const loadWorld = Game.prototype.loadWorld;
  Game.prototype.loadWorld = function(...args) {
    this.gameplayCues ??= createGameplayCues({ game: this, THREE, CH1, FOLD, document, translate });
    return loadWorld.apply(this, args);
  };
  const clearChapter = Game.prototype.clearChapter;
  Game.prototype.clearChapter = function(...args) {
    this.gameplayCues?.reset();
    return clearChapter.apply(this, args);
  };
  const updateAim = Game.prototype.updateAim;
  Game.prototype.updateAim = function(...args) {
    const result = updateAim.apply(this, args);
    this.gameplayCues?.updateAim();
    return result;
  };
  const throwStone = Game.prototype.throwStone;
  Game.prototype.throwStone = function(...args) {
    const before = this.stonesInAir.length;
    const result = throwStone.apply(this, args);
    if (this.stonesInAir.length > before) this.gameplayCues?.release(this.stonesInAir.at(-1));
    return result;
  };
  const abortAim = Input.prototype.abortAim;
  Input.prototype.abortAim = function(...args) {
    const result = abortAim.apply(this, args);
    this.g.gameplayCues?.suspend();
    return result;
  };
  const enableSling = Game.prototype.enableSling;
  Game.prototype.enableSling = function(...args) {
    const result = enableSling.apply(this, args);
    if (!this.sling || this.bow) this.gameplayCues?.clearAim();
    return result;
  };
  const build = CH1.build;
  CH1.build = function(game, ...args) {
    const result = build.call(this, game, ...args);
    game.gameplayCues?.attachFold(this.s);
    game.every(() => game.gameplayCues?.updateFlock());
    return result;
  };
}
