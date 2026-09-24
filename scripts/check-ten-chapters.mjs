import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const externalBase = process.env.BASE_URL;
const base = externalBase || 'http://127.0.0.1:43971';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let ownedServer = null;
if (!externalBase) {
  ownedServer = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '43971' }, stdio: 'ignore' });
}
for (let i = 0; i < 50; i++) {
  try { const response = await fetch(base, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {}
  if (i === 49) throw new Error(`server unavailable: ${base}`);
  await new Promise(r => setTimeout(r, 100));
}
const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: process.env.SOFTWARE === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'],
});

const results = [];
const failures = [];
const filter = process.env.TEN_CHAPTER_FILTER || '';
async function check(name, fn) {
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, pass: true, ms: Date.now() - started, detail });
    console.log('PASS', name, detail || '');
  } catch (error) {
    const failure = { name, pass: false, ms: Date.now() - started, error: error?.stack || String(error) };
    results.push(failure);
    failures.push(failure);
    console.error('FAIL', name, error?.message || error);
  }
}

async function freshPage(viewport = { width: 1280, height: 720 }, mobile = false) {
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}/?graphics=${process.env.GRAPHICS || 'storybook'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GAME?.mode === 'title' && !document.getElementById('loading'), null, { timeout: 30000 });
  return { context, page, errors };
}

async function beginChapter(page, index, timeScale = 8) {
  await page.evaluate(async ({ index, timeScale }) => {
    const g = window.GAME;
    // One simulation clock: keep real rendering, but do not race RAF updates against explicit steps.
    if (!g.__assistedClock) {
      g.__assistedClock = true;
      g.loop = () => { requestAnimationFrame(g.loop); g.renderer.render(g.scene, g.camera); };
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    g.helpShown = true;
    g.fade = async () => {};
    document.querySelector('#title').hidden = true;
    document.querySelector('#card').hidden = true;
    document.querySelector('#menu').hidden = true;
    g.loadWorld(index);
    const s = g.ch.start;
    g.placePlayer(s[0], s[1], s[2]);
    g.mode = 'play';
    g.paused = false;
    g.timeScale = timeScale;
    window.__chapterRunError = null;
    window.__chapterRunDone = false;
    Promise.resolve(g.ch.run(g)).then(() => { window.__chapterRunDone = true; }).catch(e => { window.__chapterRunError = e?.stack || String(e); });
  }, { index, timeScale });
}

async function stepRuntime(page, dt = 0.2) {
  await page.evaluate(dt => {
    const g = GAME;
    if (g.mode !== 'play') return;
    g.time += dt;
    g.processTimers();
    g.updateDialog(dt);
    g.updateAim(dt);
    g.updateStones(dt);
    g.updateInteract();
    for (const a of g.actors) a.update(dt);
    g.updaters = g.updaters.filter(f => f(dt) !== false);
    if (g.ch?.ambient) g.ch.ambient(g, dt);
    g.syncDavid();
    g.david.update(dt, g.player.speed || 0);
    g.input.consume();
  }, dt);
}

async function state(page) {
  return page.evaluate(() => {
    const g = GAME;
    const wp = typeof g.waypoint === 'function' ? g.waypoint() : g.waypoint;
    return {
      dq: !!g.dq,
      choice: !!g.dq?.choice,
      choices: document.querySelectorAll('#dialog .choices button').length,
      interacts: g.interacts.length,
      lock: g.lock,
      waypoint: wp ? { x: wp.x, z: wp.z } : null,
      dodge: !!document.querySelector('#dodge'),
      rhythm: !!document.querySelector('#rhythm'),
      objective: document.querySelector('#objText')?.textContent || '',
      count: document.querySelector('#objCount')?.textContent || '',
      runError: window.__chapterRunError,
      runDone: window.__chapterRunDone,
      chapterIndex: g.chIdx,
      mode: g.mode,
      sling: g.sling,
      bow: g.bow,
      stones: g.stones,
    };
  });
}

async function advanceDialog(page, limit = 120) {
  for (let i = 0; i < limit; i++) {
    const s = await state(page);
    if (s.runError) throw new Error(s.runError);
    if (!s.dq || s.choice) return s;
    await page.evaluate(() => { GAME.input.act = true; });
    await stepRuntime(page, 0.25);
    await page.waitForTimeout(8);
  }
  throw new Error('dialog did not drain');
}

async function choose(page, index = 1) {
  await page.waitForFunction(() => GAME.dq?.choice && document.querySelectorAll('#dialog .choices button').length > 0, null, { timeout: 15000 });
  await page.evaluate(index => {
    const buttons = [...document.querySelectorAll('#dialog .choices button')];
    buttons[Math.min(index, buttons.length - 1)].click();
  }, index);
}

async function triggerFirstInteract(page) {
  await page.waitForFunction(() => GAME.interacts.length > 0 && !GAME.dq && !GAME.lock, null, { timeout: 15000 });
  const before = await page.evaluate(() => GAME.interacts.length);
  await page.evaluate(() => {
    const g = GAME;
    const it = g.interacts[0];
    const p = typeof it.pos === 'function' ? it.pos() : it.pos;
    g.placePlayer(p.x, p.z, g.player.yaw);
  });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { GAME.input.act = true; });
    await stepRuntime(page, 0.1);
    await page.waitForTimeout(10);
    if (await page.evaluate(n => GAME.interacts.length < n || GAME.lock || !!GAME.dq, before)) return;
  }
  const debug = await page.evaluate(() => { const g = GAME, it = g.interacts[0], p = it && (typeof it.pos === 'function' ? it.pos() : it.pos); return { state: { mode: g.mode, paused: g.paused, lock: g.lock, dq: !!g.dq, act: g.input.act, count: g.interacts.length }, player: { x: g.player.pos.x, z: g.player.pos.z }, target: p && { x: p.x, z: p.z, r: it.r }, label: it?.label?.en || null }; });
  throw new Error(`interaction queue did not consume input: ${JSON.stringify(debug)}`);
}

async function drive(page, predicate, options = {}) {
  const timeout = options.timeout ?? 30000;
  const choiceIndex = options.choiceIndex ?? 1;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await stepRuntime(page, 0.22);
    if (await predicate()) return;
    const s = await state(page);
    if (s.runError) throw new Error(s.runError);
    if (s.dodge) {
      await page.keyboard.press('Space');
    } else if (s.choice) {
      await choose(page, choiceIndex);
    } else if (s.dq) {
      await page.evaluate(() => { GAME.input.act = true; });
    } else if (s.interacts && !s.lock) {
      await triggerFirstInteract(page);
    } else if (s.waypoint && !s.lock && options.teleportWaypoint !== false) {
      await page.evaluate(() => {
        const g = GAME;
        const p = typeof g.waypoint === 'function' ? g.waypoint() : g.waypoint;
        if (p) g.placePlayer(p.x, p.z, g.player.yaw);
      });
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`drive timeout; state=${JSON.stringify(await state(page))}`);
}

async function waitForRuntime(page, predicate, { steps = 120, dt = 0.08, message = 'runtime condition' } = {}) {
  for (let i = 0; i < steps; i++) {
    await stepRuntime(page, dt);
    const value = await predicate();
    if (value) return value;
    await page.waitForTimeout(5);
  }
  throw new Error(`timed out waiting for ${message}`);
}

async function hitOneRhythmNote(page) {
  const found = await waitForRuntime(page, () => page.evaluate(() => {
    const lanes = [...document.querySelectorAll('#rhythm .lane')];
    for (let i = 0; i < lanes.length; i++) for (const note of lanes[i].querySelectorAll('.note')) {
      const h = lanes[i].clientHeight;
      const y = (parseFloat(note.style.top || '-999') + 17) / h;
      if (y > 0.78 && y < 0.91 && !note.classList.contains('miss')) return { lane: i, before: parseFloat(document.querySelector('#rhythm .bar i').style.width) };
    }
    return null;
  }), { steps: 160, dt: 0.04, message: 'a rhythm note at the gold line' });
  await page.keyboard.press(['KeyA', 'KeyS', 'KeyD'][found.lane]);
  await stepRuntime(page, 0.02);
  const after = await page.evaluate(() => parseFloat(document.querySelector('#rhythm .bar i').style.width));
  assert.ok(after > found.before, `rhythm calm did not rise: ${found.before} -> ${after}`);
  return { ...found, after };
}

async function aimAndRelease(page, targetIndex = 0) {
  const before = await page.evaluate(() => GAME.stones);
  await page.evaluate(targetIndex => {
    const g = GAME;
    const active = g.targets.filter(t => !t.active || t.active());
    const t = active[targetIndex];
    if (!t) throw new Error(`no active target ${targetIndex}; total ${active.length}`);
    const c = t.pos().clone();
    g.placePlayer(c.x, c.z + 10, Math.PI);
    g.syncDavid();
    const pos = c.clone().add({ x: 0, y: 1.2, z: 10 });
    g.cine = { pos: pos.clone(), look: c.clone(), k: 100 };
    g.cinePos.copy(pos); g.cineLook.copy(c); g.cineW = 1;
    g.camera.position.copy(pos); g.camera.lookAt(c); g.camera.updateMatrixWorld(true);
    g.lock = false; g.paused = false; g.mode = 'play';
  }, targetIndex);
  await page.keyboard.down('KeyF');
  for (let i = 0; i < 4; i++) await stepRuntime(page, 0.12);
  assert.equal(await page.evaluate(() => GAME.aiming && GAME.aimCharge > 0.38), true);
  await page.keyboard.up('KeyF');
  await stepRuntime(page, 0.08);
  const released = await page.evaluate(() => ({ stones: GAME.stones, arrowCreated: GAME.stonesInAir.some(s => s.arrow), projectileCount: GAME.stonesInAir.length }));
  assert.ok(released.stones < before);
  for (let i = 0; i < 20; i++) await stepRuntime(page, 0.06);
  return { before, afterRelease: released.stones, after: await page.evaluate(() => GAME.stones), arrowCreated: released.arrowCreated, projectileCount: released.projectileCount };
}

await check('chapter 1 real sheep follow and fold count reaches the lion gate', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 0, 6);
    await advanceDialog(page);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(i => {
        const g = GAME, s = g.ch.s.sheep[i];
        s.a.stop(); s.a.pos.set(8 + i, g.groundAt(8 + i, -2), -2); s.a.sync();
        g.placePlayer(8 + i, -2, Math.PI);
      }, i);
      await waitForRuntime(page, () => page.evaluate(i => GAME.ch.s.sheep[i].st === 'follow', i), { steps: 80, dt: .04, message: 'sheep follow' });
      await page.evaluate(i => {
        const g = GAME, s = g.ch.s.sheep[i];
        s.a.stop(); s.a.pos.set(0, g.groundAt(0, -8), -8); s.a.sync();
      }, i);
      await waitForRuntime(page, () => page.evaluate(n => GAME.ch.s.inFold >= n, i + 1), { steps: 80, dt: .04, message: 'sheep fold count' });
    }
    await waitForRuntime(page, () => page.evaluate(() => GAME.ch.s.lion.m.root.visible && GAME.lock), { steps: 80, dt: .04, message: 'lion gate' });
    const detail = await page.evaluate(() => ({ inFold: GAME.ch.s.inFold, lock: GAME.lock, lionVisible: GAME.ch.s.lion.m.root.visible }));
    assert.equal(detail.inFold, 3);
    assert.equal(detail.lock, true);
    assert.equal(detail.lionVisible, true);
    assert.deepEqual(errors, []);
    return detail;
  } finally { await context.close(); }
});

await check('chapter 2 real sling release creates a projectile and hits Goliath weak point', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 1, 10);
    await drive(page, async () => page.evaluate(() => GAME.ch.s?.pick?.length > 0 && GAME.showStones), { timeout: 25000 });
    for (let i = 0; i < 8 && await page.evaluate(() => GAME.ch.s.collected < 5); i++) {
      await page.evaluate(() => {
        const g = GAME, p = g.ch.s.pick[0].position;
        g.placePlayer(p.x, p.z, g.player.yaw);
      });
      await stepRuntime(page, 0.12);
    }
    assert.equal(await page.evaluate(() => GAME.ch.s.collected), 5);
    await drive(page, async () => page.evaluate(() => GAME.sling && GAME.ch.s?.battle && GAME.targets.length >= 3), { timeout: 25000 });
    await page.evaluate(() => { GAME.ch.s.gstate = 'roar'; GAME.ch.s.gT = 2; GAME.timeScale = 1; });
    const projectile = await aimAndRelease(page, 0);
    await page.waitForFunction(() => GAME.ch.s.won === true, null, { timeout: 5000 });
    assert.ok(projectile.afterRelease < projectile.before);
    assert.equal(await page.evaluate(() => GAME.ch.s.won), true);
    assert.deepEqual(errors, []);
    return { projectile, won: true };
  } finally { await context.close(); }
});

await check('chapter 3 real rhythm key and dodge work; replay cleans rhythm overlay', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 2, 8);
    await drive(page, async () => page.locator('#rhythm').count().then(n => n === 1), { timeout: 25000 });
    await page.evaluate(() => { GAME.timeScale = 1; });
    const hv = await hitOneRhythmNote(page);
    await page.evaluate(() => { void GAME.startChapter(2); });
    await page.waitForTimeout(100);
    const staleRhythm = await page.evaluate(() => !!document.querySelector('#rhythm'));
    if (staleRhythm) await page.evaluate(() => document.querySelector('#rhythm')?.remove());
    assert.equal(staleRhythm, false, 'replay left #rhythm mounted after chapter token changed');
    assert.deepEqual(errors, []);
    return { lane: hv.lane, calmBefore: hv.before, calmAfter: hv.after, rhythmRemovedOnReplay: true };
  } finally { await context.close(); }
});

await check('chapter 3 dodge handler accepts Space and replay abort removes stale dodge UI/listener', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 2, 8);
    await drive(page, async () => page.locator('#rhythm').count().then(n => n === 1), { timeout: 25000 });
    await page.evaluate(() => { GAME.timeScale = 1; GAME._rhythm.hitAll(); });
    await waitForRuntime(page, () => page.locator('#dodge').count().then(n => n === 1), { message: 'first dodge prompt' });
    await page.keyboard.press('Space');
    await stepRuntime(page, 0.04);
    assert.equal(await page.locator('#dodge').count(), 0, 'Space did not resolve dodge');
    await drive(page, async () => page.evaluate(() => { const el = document.querySelector('#rhythm'); return !!el && el.style.visibility !== 'hidden' && !GAME.dq; }), { timeout: 15000, teleportWaypoint: false });
    await page.evaluate(() => GAME._rhythm.hitAll());
    await waitForRuntime(page, () => page.locator('#dodge').count().then(n => n === 1), { steps: 240, message: 'second dodge prompt' });
    await page.evaluate(() => { void GAME.startChapter(2); });
    await page.waitForTimeout(250);
    const stale = await page.evaluate(() => ({ dodge: !!document.querySelector('#dodge'), handler: typeof GAME._dodge === 'function' }));
    if (stale.dodge) await page.keyboard.press('Space');
    assert.equal(stale.dodge, false, 'replay left #dodge mounted after chapter token changed');
    assert.deepEqual(errors, []);
    return stale;
  } finally { await context.close(); }
});

await check('chapter 4 real bow release creates an arrow and hits the gold-circle target', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 3, 10);
    await drive(page, async () => page.evaluate(() => GAME.bow && GAME.sling && GAME.targets.some(t => !t.active || t.active())), { timeout: 45000, choiceIndex: 0 });
    await page.evaluate(() => { GAME.timeScale = 1; });
    const projectile = await aimAndRelease(page, 0);
    await page.waitForFunction(() => !GAME.sling, null, { timeout: 5000 });
    assert.ok(projectile.afterRelease < projectile.before);
    assert.equal(projectile.arrowCreated, true);
    assert.equal(await page.evaluate(() => GAME.stonesInAir.some(s => !s.arrow)), false);
    assert.deepEqual(errors, []);
    return { projectile, bowDisabledAfterHit: true };
  } finally { await context.close(); }
});

await check('chapter 5 stealth detection distinguishes exposed and safe positions, then garment cut resolves', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 4, 6);
    await drive(page, async () => page.evaluate(() => GAME.ch.s?.active === true), { timeout: 15000, teleportWaypoint: false });
    const points = await page.evaluate(() => {
      const g = GAME, ch = g.ch; let exposed = null, safe = null, best = 0;
      ch.s.frozen = true; ch.s.detect = 0;
      for (let z = 100; z >= -70; z -= 5) for (let x = -18; x <= 18; x += 3) {
        g.placePlayer(x, z, 0); const seen = ch.seen(g);
        if (seen > best) { best = seen; exposed = { x, z, seen }; }
        if (!safe && seen === 0 && z < 70 && z > -30) safe = { x, z, seen };
      }
      ch.s.frozen = false; ch.s.detect = 0;
      return { exposed, safe, best };
    });
    assert.ok(points.exposed && points.best > 0, JSON.stringify(points));
    assert.ok(points.safe, JSON.stringify(points));
    await page.evaluate(p => { GAME.paused = true; GAME.ch.s.frozen = false; GAME.ch.s.detect = 0; GAME.placePlayer(p.x, p.z, 0); }, points.exposed);
    const detectionSamples = [];
    for (let i = 0; i < 8; i++) { await stepRuntime(page, 0.04); detectionSamples.push(await page.evaluate(() => ({ detect: GAME.ch.s.detect, seen: GAME.ch.seen(GAME), active: GAME.ch.s.active, frozen: GAME.ch.s.frozen }))); }
    const exposedDetect = Math.max(...detectionSamples.map(x => x.detect));
    assert.ok(exposedDetect > 0.08, JSON.stringify({ points, detectionSamples }));
    await page.evaluate(p => GAME.placePlayer(p.x, p.z, 0), points.safe);
    await waitForRuntime(page, () => page.evaluate(before => GAME.ch.s.detect < before, exposedDetect), { steps: 40, dt: 0.08, message: 'stealth detection decay' });
    await page.evaluate(() => { GAME.paused = false; const c = { x: GAME.waypoint.x, z: GAME.waypoint.z }; GAME.placePlayer(c.x, c.z, 0); });
    await drive(page, async () => page.evaluate(() => GAME.dq?.choice === true), { timeout: 20000, teleportWaypoint: false });
    await choose(page, 1);
    await drive(page, async () => page.evaluate(() => GAME.interacts.some(it => String(it.label?.en || '').includes('robe'))), { timeout: 15000, teleportWaypoint: false });
    await triggerFirstInteract(page);
    await page.waitForFunction(() => GAME.ch.s.sneak === false, null, { timeout: 5000 });
    assert.deepEqual(errors, []);
    return { exposed: points.exposed, safe: points.safe, exposedDetect, garmentCut: true };
  } finally { await context.close(); }
});

await check('chapter 6 convoy reaches Abigail and a real dialogue choice is consumed', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 5, 10);
    await drive(page, async () => page.evaluate(() => GAME.objective?.text?.en?.includes('four hundred')), { timeout: 25000, teleportWaypoint: false });
    const actorsBefore = await page.evaluate(() => GAME.actors.length);
    await page.evaluate(() => GAME.placePlayer(2, 0, 0));
    await waitForRuntime(page, () => page.evaluate(() => GAME.ch.s.metAbi === true), { steps: 100, dt: .1, message: 'Abigail convoy midpoint' });
    await drive(page, async () => page.evaluate(() => GAME.dq?.choice === true), { timeout: 20000, teleportWaypoint: false });
    const prompt = await page.locator('#dialog .txt').textContent();
    await choose(page, 1);
    await page.waitForFunction(() => !GAME.dq?.choice, null, { timeout: 3000 });
    const detail = await page.evaluate(actorsBefore => ({ metAbi: GAME.ch.s.metAbi, actorsBefore, actorsNow: GAME.actors.length, walked: GAME.ch.s.walked }), actorsBefore);
    assert.equal(detail.metAbi, true);
    assert.ok(detail.actorsNow >= detail.actorsBefore);
    assert.match(prompt, /David|다윗/);
    assert.deepEqual(errors, []);
    return detail;
  } finally { await context.close(); }
});

await check('chapter 7 rescue target hit advances through captive release into dawn return', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 6, 10);
    await drive(page, async () => page.evaluate(() => GAME.sling && GAME.targets.filter(t => !t.active || t.active()).length >= 9), { timeout: 60000, choiceIndex: 1 });
    await page.evaluate(() => { GAME.timeScale = 1; });
    const projectile = await aimAndRelease(page, 0);
    await page.waitForFunction(() => GAME.ch.s.hits >= 1, null, { timeout: 5000 });
    await page.evaluate(() => {
      const g = GAME;
      for (const t of g.targets) if ((!t.active || t.active()) && g.ch.s.hits < 9) t.onHit(t.pos().clone(), t);
      g.timeScale = 10;
    });
    await drive(page, async () => page.evaluate(() => GAME.dq?.choice === true && /divide|나눌/.test(document.querySelector('#dialog .txt')?.textContent || '')), { timeout: 35000, choiceIndex: 1 });
    const detail = await page.evaluate(() => ({ hits: GAME.ch.s.hits, firesVisible: GAME.ch.s.fires.some(f => f.visible), playerZ: GAME.player.pos.z, objective: GAME.objective?.text?.en || null }));
    assert.ok(projectile.afterRelease < projectile.before);
    assert.ok(detail.hits >= 9);
    assert.equal(detail.firesVisible, false);
    assert.ok(detail.playerZ > -40);
    assert.deepEqual(errors, []);
    return detail;
  } finally { await context.close(); }
});

await check('chapter 8 procession advances and real dance interaction increments station count', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 7, 8);
    const initial = await page.evaluate(() => GAME.ch.s.sArk);
    await drive(page, async () => page.evaluate(() => GAME.ch.s.danced >= 1), { timeout: 25000 });
    const detail = await page.evaluate(initial => ({ danced: GAME.ch.s.danced, sArk: GAME.ch.s.sArk, initial, pose: GAME.player.pose }), initial);
    assert.ok(detail.danced >= 1);
    assert.ok(detail.sArk > detail.initial);
    assert.deepEqual(errors, []);
    return detail;
  } finally { await context.close(); }
});

await check('chapter 9 follower reaches cart and real seat interaction seats Mephibosheth', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 8, 10);
    await drive(page, async () => page.evaluate(() => GAME.ch.s.follow === true && GAME.speedMul === 0.4), { timeout: 30000 });
    await page.evaluate(() => {
      const g = GAME, m = g.ch.s.meph;
      g.placePlayer(26, 28, 0); m.pos.set(26, g.groundAt(26, 28), 28); m.sync();
    });
    await drive(page, async () => page.evaluate(() => !GAME.lock && !GAME.dq && GAME.interacts.some(it => String(it.label?.en || '').includes('seat'))), { timeout: 25000, teleportWaypoint: false });
    await triggerFirstInteract(page);
    await drive(page, async () => page.evaluate(() => GAME.ch.s.meph.m.pose === 'sit' && GAME.ch.s.follow === false), { timeout: 15000, teleportWaypoint: false });
    const detail = await page.evaluate(() => ({ pose: GAME.ch.s.meph.m.pose, follow: GAME.ch.s.follow, speedMul: GAME.speedMul }));
    assert.equal(detail.pose, 'sit');
    assert.equal(detail.follow, false);
    assert.equal(detail.speedMul, 1);
    assert.deepEqual(errors, []);
    return detail;
  } finally { await context.close(); }
});

await check('chapter 10 avatar switch, lamb carry/home, king return choices, and five candles execute', async () => {
  const { context, page, errors } = await freshPage();
  try {
    await beginChapter(page, 9, 10);
    await drive(page, async () => page.evaluate(() => GAME.objective?.text?.en?.includes('Give the lamb water')), { timeout: 25000 });
    const poorAvatar = await page.evaluate(() => ({ role: GAME.david.root.userData.storybookRole, title: GAME.ch.title.en }));
    await drive(page, async () => page.evaluate(() => GAME.ch.s.carried === true), { timeout: 15000 });
    const carriedPose = await page.evaluate(() => GAME.player.pose);
    if ((process.env.GRAPHICS || 'storybook') !== 'legacy') assert.equal(poorAvatar.role, 'poor-man');
    await page.evaluate(() => GAME.placePlayer(0, -0.6, 0));
    await drive(page, async () => page.evaluate(() => GAME.dq?.choice === true && /king say|왕은/.test(document.querySelector('#dialog .txt')?.textContent || '')), { timeout: 30000, choiceIndex: 1 });
    await choose(page, 1);
    await drive(page, async () => page.evaluate(() => GAME.dq?.choice === true && /What will David do|다윗은 어떻게/.test(document.querySelector('#dialog .txt')?.textContent || '')), { timeout: 15000, choiceIndex: 1 });
    await choose(page, 1);
    await drive(page, async () => page.evaluate(() => GAME.interacts.length >= 5 && GAME.objective?.text?.en?.includes('Light the lamps')), { timeout: 30000, teleportWaypoint: false });
    for (let i = 0; i < 5; i++) {
      await drive(page, async () => page.evaluate(() => !GAME.lock && !GAME.dq && GAME.interacts.length > 0), { timeout: 10000, teleportWaypoint: false });
      await triggerFirstInteract(page);
      await drive(page, async () => page.evaluate(target => {
        const n = Number((document.querySelector('#objCount')?.textContent || '0').split('/')[0].trim());
        return n >= target && !GAME.dq;
      }, i + 1), { timeout: 10000, teleportWaypoint: false });
    }
    assert.equal(await page.locator('#objCount').textContent(), '5 / 5');
    const detail = await page.evaluate(() => ({ finalPose: GAME.player.pose, role: GAME.david.root.userData.storybookRole, lit: GAME.ch.s.P.flames.slice(0, 5).filter(f => f.visible).length, count: document.querySelector('#objCount')?.textContent, kingChoiceResolved: !GAME.dq?.choice }));
    assert.equal(carriedPose, 'carryarms');
    assert.equal(detail.lit, 5);
    if ((process.env.GRAPHICS || 'storybook') !== 'legacy') assert.equal(detail.role, 'david-king');
    assert.equal(detail.count, '5 / 5');
    assert.deepEqual(errors, []);
    return { poorAvatar, carriedPose, ...detail };
  } finally { await context.close(); }
});

await check('all ten Korean question cards render on 390x844 and chapter 10 is selectable from menu', async () => {
  const { context, page, errors } = await freshPage({ width: 390, height: 844 }, true);
  try {
    await page.evaluate(() => GAME.setLang('ko'));
    const cards = [];
    for (let i = 0; i < 10; i++) {
      const card = await page.evaluate(i => {
        GAME.loadWorld(i);
        GAME.card(GAME.ch, i, 'end');
        const r = document.querySelector('#card .inner').getBoundingClientRect();
        return {
          chapter: GAME.ch.id,
          title: document.querySelector('#cTitle').textContent,
          questions: [...document.querySelectorAll('#cQs li')].map(x => x.textContent),
          rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
          viewport: { width: innerWidth, height: innerHeight },
        };
      }, i);
      cards.push(card);
      assert.equal(card.questions.length, 2, `chapter index ${i} question count`);
      assert.ok(card.questions.every(q => /[가-힣]/.test(q)), `chapter index ${i} Korean questions`);
      assert.ok(card.rect.left >= -1 && card.rect.right <= card.viewport.width + 1, `chapter index ${i} horizontal overflow`);
    }
    await page.evaluate(() => GAME.showTitle());
    await page.waitForFunction(() => GAME.mode === 'title');
    await page.getByRole('button', { name: '장 선택', exact: true }).click();
    const menu = page.locator('#chapterList button');
    assert.equal(await menu.count(), 10);
    await menu.nth(9).click();
    await page.waitForFunction(() => GAME.chIdx === 9 && GAME.mode === 'introCard', null, { timeout: 10000 });
    assert.equal(await page.locator('#cTitle').textContent(), '당신이 그 사람입니다');
    assert.deepEqual(errors, []);
    return { cards: cards.length, viewport: '390x844', selectedChapterIndex: 9 };
  } finally { await context.close(); }
});

await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
if (ownedServer) ownedServer.kill();
const summary = { passed: results.filter(r => r.pass).length, failed: failures.length, results, graphics: process.env.GRAPHICS || 'storybook', renderer: process.env.SOFTWARE === '1' ? 'SwiftShader' : 'Apple Metal', limitation: 'Assisted setup/teleports are not full playthrough evidence.' };
console.log('TEN_CHAPTER_RESULT ' + JSON.stringify(summary));
process.exit(failures.length ? 1 : 0);
