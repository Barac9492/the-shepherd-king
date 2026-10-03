// A local, disposable walk through the existing Bethlehem world. Story scripts,
// chapter progress and the challenge controller remain owned by their original flows.
const COPY = {
  name: ['다윗과 산책하기', 'Walk with David'],
  intro: ['베들레헴을 자유롭게 둘러보세요. 이야기는 원할 때 시작해요.', 'Explore Bethlehem at your own pace. Start the story when you choose.'],
  place: ['자유 산책 · 베들레헴', 'FREE EXPLORATION · BETHLEHEM'],
  guide: ['산책 안내', 'Walking guide'],
  destination: ['길 안내', 'Directions'],
  anywhere: ['마음 가는 대로', 'Wander freely'],
  fold: ['양우리 입구', 'Sheep pen entrance'],
  well: ['마을 우물', 'Village well'],
  house: ['이새의 집 앞', "Outside Jesse’s house"],
  home: ['입구로', 'To entrance'],
  camera: ['시점 되돌리기', 'Reset camera'],
  title: ['처음 화면', 'Title screen'],
  restart: ['산책 입구로 돌아가기', 'Return to the walk entrance'],
  story: ['1장 이야기 시작하기', 'Start Chapter 1'],
  storyNote: ['1장을 처음부터 시작합니다. 이전 장 진도는 유지돼요.', 'Starts Chapter 1 from its beginning. Your saved chapter progress is kept.'],
  controls: ['WASD·방향키로 이동, Shift로 달리기, 화면을 끌어 둘러보기. 가까이에서 E로 행동해요.', 'Move with WASD / arrows, run with Shift, drag to look. Press E near a point of interest.'],
  touchControls: ['왼쪽 조이스틱으로 이동, 빈 화면을 끌어 둘러보기. 가까이에서 행동 버튼을 눌러요.', 'Move with the left stick and drag the open view to look. Tap the action button nearby.'],
  invite: ['양과 함께 걷기', 'Walk with this sheep'],
  release: ['양 쉬게 하기', 'Let the sheep rest'],
  resting: ['양이 풀을 뜯으며 쉬어요. 이제 다른 길로 걸어가도 좋아요.', 'The sheep rests and grazes. You can take another path.'],
  following: ['양 한 마리가 함께 걸어요. 가까이에서 다시 행동하면 쉬게 할 수 있어요.', 'One sheep is walking with you. Interact again nearby to let it rest.'],
  inspectWell: ['우물 살펴보기', 'Look at the well'],
  wellNote: ['산책 메모 · 우물가의 항아리와 돌담을 둘러보세요. 잠시 멈춰 마을 풍경을 바라봐도 좋아요.', 'Walking note · Look at the jars and stonework around the well. Take a moment to enjoy the village.'],
  inspectFold: ['양우리 살펴보기', 'Look at the sheep pen'],
  foldNote: ['산책 메모 · 돌담 사이로 입구가 나 있어요. 산책에서는 양을 모두 모을 필요가 없어요.', 'Walking note · There is an entrance between the stones. You don’t need to gather the flock on this walk.'],
  boundary: ['이쪽은 산책길의 끝이에요. 양우리나 마을 쪽으로 돌아가 볼까요?', 'This is the edge of the walking area. Turn back toward the pen or village.'],
  returned: ['산책 입구로 돌아왔어요.', 'Back at the walk entrance.'],
};
const INSTALL = Symbol.for('the-shepherd-king.david-exploration');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function installDavidExploration({ Game, THREE, CH1, FOLD, HOUSE, getLanguage, isTouch }) {
  const proto = Game.prototype;
  if (proto[INSTALL]) return;
  Object.defineProperty(proto, INSTALL, { value: true });
  const original = Object.fromEntries(['setupUI', 'applyLang', 'updateInteract', 'showTitle', 'startChapter', 'clearChapter', 'toggleMenu', 'showHelp'].map(key => [key, proto[key]]));
  proto.setupUI = function(...args) {
    original.setupUI.apply(this, args);
    this.exploration = createExploration(this, { THREE, CH1, FOLD, HOUSE, getLanguage, isTouch });
    const restart = document.getElementById('mRestart').onclick;
    document.getElementById('mRestart').onclick = () => {
      if (!this.exploration.active) return restart();
      this.toggleMenu(false);
      this.exploration.home();
    };
  };
  proto.applyLang = function(...args) {
    const result = original.applyLang.apply(this, args);
    this.exploration?.translate();
    return result;
  };
  proto.updateInteract = function(...args) {
    if (this.exploration?.active) return this.exploration.interactFrame();
    return original.updateInteract.apply(this, args);
  };
  // Close before the original fade awaits: no old updater/input can run during
  // navigation. Existing story/challenge entry points keep their save semantics.
  for (const key of ['showTitle', 'startChapter']) proto[key] = function(...args) {
    if (this.exploration?.active) {
      this.exploration.close();
      this.mode = 'intro';
    }
    return original[key].apply(this, args);
  };
  proto.clearChapter = function(...args) {
    this.exploration?.close();
    return original.clearChapter.apply(this, args);
  };
  for (const key of ['toggleMenu', 'showHelp']) proto[key] = function(...args) {
    const result = original[key].apply(this, args);
    this.exploration?.syncVisibility();
    return result;
  };
}

function createExploration(g, { THREE, CH1, FOLD, HOUSE, getLanguage, isTouch }) {
  const $ = id => document.getElementById(id);
  const panel = $('walkPanel'), action = $('walkAction');
  const point = (x, z) => new THREE.Vector3(x, g.groundAt(x, z), z);
  const places = { fold: [FOLD[0], FOLD[1] + 9], well: [-34, -41], house: [HOUSE[0] + 1, HOUSE[1] + 7] };
  const c = {
    active: false, session: null,
    t(key) { return COPY[key][getLanguage() === 'en' ? 1 : 0]; },
    translate() {
      for (const element of document.querySelectorAll('[data-walk-copy]')) element.textContent = c.t(element.dataset.walkCopy);
      $('walkControls').textContent = c.t(isTouch ? 'touchControls' : 'controls');
      $('walkDestination').setAttribute('aria-label', c.t('destination'));
      panel.setAttribute('aria-label', c.t('guide'));
      if (!c.active) return;
      $('hudRef').textContent = c.t('place'); $('hudTitle').textContent = c.t('name');
      $('mRestart').textContent = c.t('restart');
      $('walkMessage').textContent = c.t(c.session.message);
      c.interactFrame(false);
    },
    playable() { return c.active && g.mode === 'play' && !g.paused && !g.lock && !g.dq; },
    syncVisibility() {
      const visible = c.playable();
      panel.hidden = !visible;
      if (!visible) action.hidden = true;
    },
    message(key) {
      if (!c.session) return;
      c.session.message = key;
      $('walkMessage').textContent = c.t(key);
    },
    open() {
      if (c.active || g.mode !== 'title' || g.slingChallenge?.phase !== 'closed' || g.slingChallenge?.navigationPending) return false;
      g.audio.init();
      const previous = { yaw: g.cam.yaw, pitch: g.cam.pitch, dist: g.cam.dist, run: g.input.touchRun };
      g.input.clearHeld();
      g.loadWorld(0);
      // Build adapters also install story guidance. Dispose it explicitly and
      // turn off native automatic recruiting while keeping ambient grazing.
      g.sheepTutorial?.dispose();
      CH1.s.canFollow = false;
      CH1.s.onCount = null;
      c.active = true;
      const session = c.session = { token: g.tok, previous, message: 'intro', companion: null, sheepHome: null, destination: '', disposed: false, boundaryNotice: false };
      g.onChapterCleanup(() => { if (c.session === session) c.close(); });
      g.mode = 'play'; g.paused = false; g.lock = false; g.cineOff(); g.cineW = 0;
      g.input.touchRun = false; $('tRun').classList.remove('on');
      for (const id of ['title', 'card', 'help', 'menu', 'dialog']) $(id).hidden = true;
      $('hud').hidden = false; $('touch').hidden = !isTouch;
      document.body.classList.remove('talking'); g._talk = false;
      document.body.classList.add('david-exploration');
      g.enableSling(false); g.setObjective(null); g.setWaypoint(null);
      $('walkDestination').value = ''; $('walkGuide').open = false;
      g.placePlayer(...CH1.start); c.resetCamera(); c.translate();
      g.every(() => c.tick(session));
      c.syncVisibility(); g.canvas.focus();
      return true;
    },
    resetCamera() {
      if (!c.active) return;
      g.input.clearHeld();
      g.cam.yaw = g.player.yaw + Math.PI; g.cam.pitch = .3; g.cam.dist = 9;
      g.cam.tgt.set(g.player.pos.x, g.player.pos.y + 1.65, g.player.pos.z);
      g.updateCamera(0); g.canvas.focus();
    },
    home() {
      if (!c.playable()) return;
      c.releaseCompanion(true); g.input.clearHeld();
      g.input.touchRun = false; $('tRun').classList.remove('on');
      g.placePlayer(...CH1.start); c.resetCamera(); c.message('returned');
    },
    selectDestination(value) {
      if (!c.playable()) return;
      c.session.destination = Object.hasOwn(places, value) ? value : '';
      const xy = places[c.session.destination];
      g.setWaypoint(xy ? point(...xy) : null);
      g.input.clearHeld();
    },
    nearest() {
      if (!c.playable()) return null;
      const p = g.player.pos;
      const fixed = [
        { key: 'story', pos: point(...places.house), radius: 5.5 },
        { key: 'inspectWell', pos: point(-36, -45), radius: 5 },
        { key: 'inspectFold', pos: point(...places.fold), radius: 5 },
      ];
      const candidates = fixed.filter(it => distance(p, it.pos) < it.radius);
      for (const sheep of CH1.s.sheep) {
        if (sheep.lamb || (c.session.companion && sheep !== c.session.companion)) continue;
        if (distance(p, sheep.a.pos) < 4.8) candidates.push({ key: sheep === c.session.companion ? 'release' : 'invite', pos: sheep.a.pos, sheep });
      }
      return candidates.sort((a, b) => distance(p, a.pos) - distance(p, b.pos))[0] || null;
    },
    interactFrame(consume = true) {
      c.syncVisibility();
      $('prompt').hidden = true;
      const target = c.nearest();
      action.hidden = !target;
      $('tAct').hidden = !isTouch || !target;
      if (target) {
        action.textContent = (isTouch ? '' : 'E · ') + c.t(target.key);
        $('tActL').textContent = c.t(target.key);
      }
      if (consume && g.input.act) {
        g.input.act = false;
        if (target) c.act(target);
      }
    },
    act(target = c.nearest()) {
      if (!target || !c.playable()) return;
      g.input.clearHeld();
      if (target.key === 'story') { void g.startChapter(0); return; }
      if (target.key === 'invite') {
        const sheep = target.sheep;
        c.session.companion = sheep;
        c.session.sheepHome = [...sheep.home];
        // Native CH1 only handles graze/follow/fold. This session owns a separate
        // state so crossing the pen cannot count a sheep or start the lion.
        sheep.st = 'exploring'; sheep.a.stop(); sheep.a.m.graze = 0;
        c.message('following');
      } else if (target.key === 'release') {
        c.releaseCompanion(); c.message('resting');
      } else c.message(target.key === 'inspectWell' ? 'wellNote' : 'foldNote');
      g.canvas.focus();
    },
    releaseCompanion(returnHome = false) {
      const s = c.session, sheep = s?.companion;
      if (!sheep) return;
      if (returnHome) {
        sheep.a.pos.copy(point(...s.sheepHome)); sheep.a.sync();
      }
      sheep.a.stop(); sheep.st = 'graze'; sheep.home = [sheep.a.pos.x, sheep.a.pos.z]; sheep.t = 2;
      s.companion = null; s.sheepHome = null;
    },
    tick(session) {
      if (!c.active || c.session !== session || session.disposed || session.token !== g.tok) return false;
      c.syncVisibility();
      if (!c.playable()) return;
      const sheep = session.companion;
      if (sheep) {
        const p = g.player.pos, yaw = g.player.yaw;
        const [x, z] = CH1.bound(p.x - Math.sin(yaw) * 2.6, p.z - Math.cos(yaw) * 2.6);
        const target = point(x, z), d = distance(sheep.a.pos, target);
        if (d > .8) { sheep.a.dest = target; sheep.a.walkSpeed = Math.min(8.6, Math.max(1.2, d * 1.7)); }
        else sheep.a.stop();
      }
      const atEdge = Math.hypot(g.player.pos.x, g.player.pos.z) > 101;
      if (atEdge && !session.boundaryNotice) c.message('boundary');
      session.boundaryNotice = atEdge;
      // A help dialog can close without calling toggleMenu; resync each frame.
      return true;
    },
    close() {
      if (!c.active) return;
      const s = c.session;
      c.releaseCompanion(); s.disposed = true; c.active = false; c.session = null;
      g.input.clearHeld(); g.input.touchRun = s.previous.run; $('tRun').classList.toggle('on', s.previous.run);
      Object.assign(g.cam, { yaw: s.previous.yaw, pitch: s.previous.pitch, dist: s.previous.dist });
      g.setWaypoint(null); g.setObjective(null); g.paused = false;
      for (const id of ['walkPanel', 'walkAction', 'prompt', 'menu', 'help']) $(id).hidden = true;
      $('tAct').hidden = false;
      document.body.classList.remove('david-exploration', 'talking'); g._talk = false;
      g.applyLang();
    },
  };
  // These handlers belong to one page-level controller; session entry never
  // adds listeners or wall-clock timers. Its updater and state are disposable.
  $('bExplore').onclick = () => c.open();
  $('walkHome').onclick = () => c.home();
  $('walkCamera').onclick = () => c.resetCamera();
  $('walkTitle').onclick = () => { if (c.playable()) void g.showTitle(); };
  $('walkDestination').onchange = event => c.selectDestination(event.target.value);
  // Arrow/Space navigation inside the guide must not also move David. Escape
  // still reaches the normal pause menu; keyup can always clear held input.
  panel.onkeydown = event => { if (event.code !== 'Escape') event.stopPropagation(); };
  panel.onfocusin = () => g.input.clearHeld();
  action.onclick = () => c.act();
  c.translate();
  return c;
}
