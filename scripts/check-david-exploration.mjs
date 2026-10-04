import { chromium } from '@playwright/test';
import { checkGuidancePanel } from './guidance-panel-checks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:43985';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a local fixture server only');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: process.env.SOFTWARE === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'] });
const results = [], errors = [], requests = [];
const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log('PASS', name); };
const observe = page => { page.on('pageerror', e => errors.push(e.message)); page.on('request', req => { if (req.url().includes('/api/sling-challenge')) requests.push(req.url()); }); };
const ready = page => page.waitForFunction(() => window.GAME?.mode === 'title' && !GAME.slingChallenge.navigationPending);
const walk = page => page.waitForFunction(() => GAME.exploration.active && GAME.mode === 'play' && !GAME.paused);
const go = (page, x, z) => page.evaluate(([x, z]) => { GAME.input.clearHeld(); GAME.placePlayer(x, z, Math.PI); GAME.exploration.resetCamera(); GAME.exploration.interactFrame(false); }, [x, z]);
const storage = page => page.evaluate(() => localStorage.getItem('david-progress'));
const take = async (page, name) => { if (process.env.SHOTS) { await page.locator('#loading').waitFor({ state: 'detached' }); await fs.mkdir(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); } };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); observe(page);
  await page.goto(base + '/?test=1'); await ready(page); await take(page, 'desktop-title');
  await page.evaluate(() => localStorage.setItem('david-progress', '6'));
  await check('separate title entry opens a walk without story scripts, saves or challenge requests', async () => {
    await page.getByRole('button', { name: '다윗과 산책하기', exact: true }).click(); await walk(page);
    assert.deepEqual(await page.evaluate(() => ({ ch: GAME.chIdx, dq: !!GAME.dq, lock: GAME.lock, timers: GAME.timers.length, waiters: GAME.waiters.length, guide: !!GAME.sheepTutorial, follow: GAME.ch.s.canFollow, challenge: GAME.slingChallenge.phase })), { ch: 0, dq: false, lock: false, timers: 0, waiters: 0, guide: false, follow: false, challenge: 'closed' });
    assert.equal(await storage(page), '6'); assert.equal(requests.length, 0); await take(page, 'desktop-walk');
  });
  await check('desktop guidance stays collapsed across route updates, language and keyboard toggles', () => checkGuidancePanel(page, 'walk'));
  await check('keyboard walking, running, drag camera and reset remain usable', async () => {
    const before = await page.evaluate(() => GAME.player.pos.toArray());
    await page.keyboard.down('w'); await page.waitForFunction(before => GAME.player.pos.distanceTo(new GRAPHICS_TEST.THREE.Vector3(...before)) > 1, before); await page.keyboard.up('w');
    await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.waitForFunction(() => GAME.player.speed > 7); await page.keyboard.up('w'); await page.keyboard.up('Shift');
    const yaw = await page.evaluate(() => GAME.cam.yaw);
    await page.mouse.move(820, 360); await page.mouse.down(); await page.mouse.move(1020, 400, { steps: 6 }); await page.mouse.up();
    assert.ok(Math.abs(await page.evaluate(() => GAME.cam.yaw) - yaw) > .1);
    await page.locator('#walkGuide summary').click(); await page.click('#walkCamera');
    assert.equal(await page.evaluate(() => GAME.cam.dist), 9);
    assert.ok(Math.abs(await page.evaluate(() => GAME.cam.yaw - GAME.player.yaw - Math.PI)) < 1e-6);
  });
  await check('direction choices stay owned by the walk and do not force objectives', async () => {
    await page.selectOption('#walkDestination', 'well');
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => [GAME.waypoint.x, GAME.waypoint.z, GAME.objective]), [-34, -41, null]);
    await page.selectOption('#walkDestination', '');
    assert.equal(await page.evaluate(() => GAME.waypoint), null);
  });
  await check('guide keyboard input does not also move David; authored village walking route is traversable', async () => {
    await page.locator('#walkDestination').focus();
    await page.keyboard.down('ArrowDown');
    assert.equal(await page.evaluate(() => GAME.input.keys.has('ArrowDown')), false);
    await page.keyboard.up('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'walkDestination');
    await page.keyboard.press('Escape');
    if (await page.locator('#menu').isVisible()) await page.click('#mResume');
    const route = await page.evaluate(() => {
      const g = GAME; g.input.clearHeld(); g.paused = true; g.placePlayer(...g.ch.start);
      // Apply real moveTo in short steps, not teleports: ground, slope, bounds
      // and authored colliders all participate. This is assisted route evidence.
      const points = [[3,20],[0,4],[0,1],[8,1],[9,-10],[8,-18],[-2,-20],[-14,-26],[-28,-36],[-34,-41],[-40,-43],[-46,-43]];
      const results = [];
      for (const [x,z] of points) {
        let steps = 0;
        for (; steps < 1500; steps++) {
          const dx=x-g.player.pos.x,dz=z-g.player.pos.z,d=Math.hypot(dx,dz);
          if(d<.2)break;
          g.moveTo(g.player.pos.x+dx/d*Math.min(d,.14),g.player.pos.z+dz/d*Math.min(d,.14));
        }
        results.push({ point:[x,z], reached:steps<1500 });
      }
      g.paused=false; g.exploration.home(); return results;
    });
    assert.ok(route.every(row => row.reached), JSON.stringify(route));
  });
  await check('optional sheep companion never counts at the pen and can be released', async () => {
    await page.evaluate(() => { const sheep = GAME.ch.s.sheep[0]; GAME.placePlayer(sheep.a.pos.x + 1, sheep.a.pos.z, 0); GAME.exploration.interactFrame(false); });
    await page.keyboard.press('e'); await page.waitForFunction(() => !!GAME.exploration.session.companion);
    const count = await page.evaluate(() => GAME.ch.s.inFold);
    await page.evaluate(() => { const s = GAME.exploration.session.companion; GAME.placePlayer(0, -8, 0); s.a.pos.copy(GAME.player.pos); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => GAME.ch.s.inFold), count);
    assert.equal(await page.evaluate(() => GAME.ch.s.lion.m.root.visible), false);
    await page.keyboard.press('e'); await page.waitForFunction(() => !GAME.exploration.session.companion);
    assert.equal(await page.evaluate(() => GAME.ch.s.inFold), 0);
  });
  await check('well and pen observations remain optional; approaching Jesse does not start story', async () => {
    await go(page, -33, -43); await page.keyboard.press('e');
    await page.waitForFunction(() => GAME.exploration.session.message === 'wellNote'); await take(page, 'village-well');
    await go(page, 0, 1); await page.keyboard.press('e'); await page.waitForFunction(() => GAME.exploration.session.message === 'foldNote');
    await go(page, -46, -43); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => !!GAME.dq || GAME.lock), false);
    assert.match(await page.locator('#walkAction').textContent(), /1장 이야기/);
    assert.equal(await storage(page), '6');
    await page.evaluate(() => { GAME.ch.s.inFold = 7; }); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [GAME.waiters.length, GAME.timers.length, !!GAME.dq, GAME.lock]), [0, 0, false, false]);
  });
  await check('bounds and entry recovery remain enforced', async () => {
    await page.evaluate(() => { GAME.placePlayer(99, 0, 0); GAME.moveTo(120, 0); });
    assert.ok(await page.evaluate(() => Math.hypot(GAME.player.pos.x, GAME.player.pos.z) <= 104.001));
    await page.click('#walkHome');
    assert.deepEqual(await page.evaluate(() => [GAME.player.pos.x, GAME.player.pos.z]), [6, 40]);
  });
  await check('pause/help/language changes preserve exploration and return controls', async () => {
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#walkPanel').isVisible(), false);
    assert.match(await page.locator('#mRestart').innerText(), /산책 입구/);
    await page.click('#mLang'); assert.equal(await page.locator('#mRestart').innerText(), 'Return to the walk entrance');
    await page.click('#mHelp'); await page.click('#hOk'); await walk(page); await page.waitForSelector('#walkPanel:not([hidden])');
    await page.keyboard.press('Escape'); await page.click('#mRestart'); await walk(page);
    assert.equal(await storage(page), '6');
    await page.keyboard.press('Escape'); await page.click('#mLang'); await page.click('#mResume');
  });
  await check('repeated enter/exit releases old updater, resources and input; duplicate open is ignored', async () => {
    const counts = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.oldWalk = GAME.exploration.session; window.oldRoot = GAME.root; window.oldToken = GAME.tok; GAME.input.keys.add('KeyW'); });
      await page.click('#walkTitle'); await ready(page);
      assert.deepEqual(await page.evaluate(() => ({ disposed: oldWalk.disposed, rootGone: oldRoot.parent === null, active: GAME.exploration.active, held: GAME.input.keys.size, tokenChanged: GAME.tok > oldToken, walkUI: document.body.classList.contains('david-exploration') })), { disposed: true, rootGone: true, active: false, held: 0, tokenChanged: true, walkUI: false });
      await page.click('#bExplore'); await walk(page);
      assert.equal(await page.locator('#walkGuidanceToggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => { const tok = GAME.tok; GAME.exploration.open(); return tok === GAME.tok; }), true);
      await page.waitForTimeout(100);
      counts.push(await page.evaluate(() => ({ updaters: GAME.updaters.length, disposers: GAME.chapterDisposers.length, geometries: GAME.renderer.info.memory.geometries })));
      assert.equal(await storage(page), '6');
    }
    assert.equal(counts[0].updaters, counts[2].updaters); assert.equal(counts[0].disposers, counts[2].disposers);
    assert.ok(counts[2].geometries <= counts[0].geometries + 4, JSON.stringify(counts));
    assert.equal(requests.length, 0);
  });
  await check('explicit story action cleans up walk and starts unchanged Chapter 1', async () => {
    await page.evaluate(() => { GAME.helpShown = true; });
    await go(page, -46, -43); await page.click('#walkAction');
    await page.waitForFunction(() => GAME.mode === 'introCard' && GAME.chIdx === 0);
    assert.equal(await page.evaluate(() => GAME.exploration.active), false);
    assert.equal(await page.locator('#walkPanel').isVisible(), false);
    await page.click('#cRow .primary'); await page.waitForFunction(() => GAME.mode === 'play' && !!GAME.dq);
    assert.equal(await page.evaluate(() => !!GAME.sheepTutorial && GAME.ch.s.canFollow), true);
    assert.equal(await storage(page), '6');
    await page.evaluate(() => void GAME.showTitle()); await ready(page);
  });
  await check('challenge stays fixed and returns cleanly after a walk', async () => {
    await page.click('#bChallenge'); await page.waitForFunction(() => GAME.slingChallenge.phase === 'lobby');
    await page.click('#challengeStart'); await page.waitForFunction(() => GAME.slingChallenge.phase === 'playing');
    const position = await page.evaluate(() => GAME.player.pos.toArray());
    await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
    assert.deepEqual(await page.evaluate(() => GAME.player.pos.toArray()), position);
    assert.equal(await page.locator('#walkPanel').isVisible(), false);
    await page.keyboard.press('Escape'); await page.click('#mTitleBtn'); await ready(page);
    await page.click('#bExplore'); await walk(page); await page.click('#walkTitle'); await ready(page);
    assert.equal(await storage(page), '6');
    await page.reload(); await ready(page); assert.equal(await storage(page), '6');
  });
  // Release the active WebGL scene before booting the next device. Keeping
  // both render loops alive can starve software-rendered CI of CPU time.
  await page.close();
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); observe(touch);
  await touch.goto(base + '/?test=1'); await ready(touch); await take(touch, 'mobile-title'); await touch.tap('#bExplore'); await walk(touch);
  await check('mobile guidance stays compact through touch movement and rotation', () => checkGuidancePanel(touch, 'walk', true));
  await check('touch joystick + look, cancel, rotate and home controls recover without held movement', async () => {
    const before = await touch.evaluate(() => [GAME.player.pos.x, GAME.player.pos.z, GAME.cam.yaw]);
    const joy = await touch.locator('#joy').boundingBox();
    // Synthetic pointer ownership exercises actual Input handlers. Real-phone
    // multitouch and thermal performance remain a separate acceptance check.
    await touch.evaluate(({ x, y, width, height }) => {
      const send = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
      const stick = document.getElementById('joy'), cv = GAME.canvas;
      send(stick, 'pointerdown', 41, x + width / 2, y + height / 2 - 42);
      send(cv, 'pointerdown', 42, 280, 440); send(cv, 'pointermove', 42, 315, 440);
    }, joy);
    await touch.waitForFunction(([x, z]) => Math.hypot(GAME.player.pos.x - x, GAME.player.pos.z - z) > .8, before);
    assert.notEqual(await touch.evaluate(() => GAME.cam.yaw), before[2]);
    await touch.evaluate(() => { document.getElementById('joy').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 41, pointerType: 'touch' })); window.dispatchEvent(new Event('orientationchange')); });
    assert.deepEqual(await touch.evaluate(() => [GAME.input.joy.x, GAME.input.joy.y, GAME.input.lookId]), [0, 0, null]);
    await touch.locator('#walkGuide summary').tap(); await touch.tap('#walkHome');
    assert.deepEqual(await touch.evaluate(() => [GAME.player.pos.x, GAME.player.pos.z]), [6, 40]);
    await touch.locator('#walkGuide summary').tap(); await take(touch, 'mobile-walk');
    await go(touch, -33, -43); await touch.tap('#tAct'); await touch.waitForFunction(() => GAME.exploration.session.message === 'wellNote');
    await touch.setViewportSize({ width: 844, height: 390 }); await take(touch, 'mobile-landscape');
    await touch.locator('#walkGuide summary').tap();
    const panelBox = await touch.locator('#walkPanel').boundingBox(), joyBox = await touch.locator('#joy').boundingBox();
    assert.ok(panelBox.y + panelBox.height <= joyBox.y, 'expanded guide stays clear of joystick');
    await touch.locator('#walkGuide summary').tap();
    for (const id of ['walkPanel', 'joy', 'btnMenu', 'walkTitle']) {
      const rect = await touch.locator('#' + id).boundingBox(); assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 844 && rect.y + rect.height <= 390, id + JSON.stringify(rect));
    }
    await touch.tap('#walkTitle'); await ready(touch); assert.equal(await storage(touch), null);
  });
  await touch.close();
  await check('legacy rendering also opens and exits without changing chapter progress', async () => {
    const legacy = await browser.newPage(); observe(legacy);
    await legacy.goto(base + '/?graphics=legacy&test=1'); await ready(legacy);
    await legacy.click('#bExplore'); await walk(legacy);
    assert.equal(await legacy.evaluate(() => GAME.sheepTutorial), null);
    await legacy.click('#walkTitle'); await ready(legacy);
    assert.equal(await storage(legacy), null); await legacy.close();
  });
  assert.deepEqual(errors, []);
  console.log('DAVID_EXPLORATION_RESULT ' + JSON.stringify({ passed: results.length, results, errors }));
} finally { await browser.close(); }
