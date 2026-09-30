/** Presentation only: keep the two performers above the portrait rhythm HUD.
 * The original side-on cinematic is retained for wider screens.
 */
export function harpCameraFrame(aspect, player, saul) {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1.2 || !player || !saul) return null;
  const middleX = (player.x + saul.x) / 2;
  return {
    position: { x: middleX - 1.75, y: 3, z: player.z + 12 },
    // Looking below the actors puts their bodies above the lower-half note lanes.
    look: { x: middleX, y: -0.9, z: (player.z + saul.z) / 2 },
  };
}

export function installHarpCamera(Game, THREE) {
  const original = Game.prototype.updateCamera;
  const vectors = new WeakMap();
  Game.prototype.updateCamera = function(dt) {
    const source = this.cine;
    const active = this.chIdx === 2 && this.mode === 'play' && this.lock
      && this.player?.pos?.z > 300 && source && this.ch?.s?.saulIn;
    const frame = active && harpCameraFrame(this.camera.aspect, this.player.pos, this.ch.s.saulIn.pos);
    if (!frame) return original.call(this, dt);
    let fitted = vectors.get(this);
    if (!fitted) {
      fitted = { pos: new THREE.Vector3(), look: new THREE.Vector3(), k: source.k };
      vectors.set(this, fitted);
    }
    fitted.pos.set(frame.position.x, frame.position.y, frame.position.z);
    fitted.look.set(frame.look.x, frame.look.y, frame.look.z);
    fitted.k = source.k;
    this.cine = fitted;
    try { return original.call(this, dt); }
    finally { this.cine = source; }
  };
}
