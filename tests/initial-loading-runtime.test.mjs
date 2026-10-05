import {openTitleSection} from '../scripts/title-menu-test-helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('initial loading: first paint, slow connections, recovery and ready lifecycle in Chrome', { timeout: 240000 }, async t => {
  let intercept = async () => null;
  const requests = [], writes = [], errors = [];
  const server = http.createServer(async (req, res) => {
    requests.push(req.url);
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      writes.push(`${req.method} ${req.url}`); res.writeHead(405); res.end(); return;
    }
    const name = new URL(req.url, 'http://localhost').pathname;
    const override = await intercept(name);
    if (res.destroyed) return;
    if (override) { res.writeHead(override); res.end('Unavailable'); return; }
    try {
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) throw Error('Outside fixture');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': name === '/' ? 'no-store' : 'public, max-age=3600' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const ready = p => p.waitForFunction(() => window.GAME?.mode === 'title' && !GAME.slingChallenge.navigationPending && !document.getElementById('title').hidden && !document.getElementById('loading'), null, { timeout: 45000 });
  const shot = async (p, name) => {
    if (!process.env.LOADING_SHOTS) return;
    await fs.mkdir(process.env.LOADING_SHOTS, { recursive: true });
    // The document load intentionally remains pending while modules are held.
    // Skip Playwright's font-ready wait; the loader uses installed system fonts.
    const previous = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
    try {
      await p.screenshot({ path: path.join(process.env.LOADING_SHOTS, `${name}.png`) });
    } finally {
      if (previous === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
      else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = previous;
    }
  };
  const open = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
    const page = await context.newPage();
    // Block optional remote fonts without request routing (which would disable HTTP cache).
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('david-progress')) localStorage.setItem('david-progress', '6');
      window.gameAssignments = 0;
      let game;
      Object.defineProperty(window, 'GAME', { configurable: true, get: () => game, set: value => { game = value; window.gameAssignments++; } });
    });
    return { context, page, cdp };
  };
  const fit = async p => {
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const selector of ['#loading-title', '#loading-stage', '#loading-retry']) {
      const element = p.locator(selector);
      if (!await element.isVisible()) continue;
      const box = await element.boundingBox(), viewport = p.viewportSize();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, `${selector} fits ${JSON.stringify(viewport)}`);
    }
  };
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: process.env.SOFTWARE === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'] });
    console.log(`Loading QA browser: ${browser.version()}`);

    await t.test('HTML paints before held modules, all game CSS and remote fonts; slow is help, not failure', async () => {
      const gate = deferred();
      intercept = async name => { if (name.endsWith('.js') || name.endsWith('.css')) await gate.promise; };
      const { context, page } = await open();
      try {
        await page.goto(base + '/?test=1', { waitUntil: 'commit' });
        await page.locator('#loading-title').waitFor();
        assert.equal(await page.locator('#loading-title').innerText(), '게임을 불러오는 중입니다');
        assert.equal(await page.evaluate(() => !!window.GAME), false);
        assert.equal(await page.locator('#gameContent').getAttribute('inert'), '');
        await page.waitForFunction(() => performance.getEntriesByType('paint').some(e => e.name === 'first-contentful-paint'), null, { timeout: 5000 });
        await fit(page); await shot(page, 'loading-desktop-first-paint');
        await page.locator('#loading-retry').waitFor({ state: 'visible', timeout: 15000 });
        assert.match(await page.locator('#loading-note').innerText(), /아직 준비 중/);
        assert.equal(await page.locator('#loading').getAttribute('data-startup-error'), null);
        assert.equal(requests.filter(x => x === '/?test=1').length, 1);
        await shot(page, 'loading-desktop-slow');
        gate.resolve(); await ready(page);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
        assert.equal(await page.locator('#gameContent').getAttribute('inert'), null);
        assert.equal(await page.evaluate(() => localStorage.getItem('david-progress')), '6');
      } finally { gate.resolve(); await context.close(); }
    });

    await t.test('mobile portrait/landscape, offline help, reduced motion and saved English preference', async () => {
      const gate = deferred(); intercept = async name => { if (name.endsWith('.js')) await gate.promise; };
      const { context, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        await page.goto(base, { waitUntil: 'commit' });
        await page.locator('#loading-title').waitFor();
        assert.equal(await page.locator('.loading-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
        await context.setOffline(true);
        await page.locator('#loading-retry').waitFor({ state: 'visible' });
        assert.match(await page.locator('#loading-note').innerText(), /인터넷 연결/);
        await fit(page); await shot(page, 'loading-mobile-offline');
        await page.setViewportSize({ width: 844, height: 390 }); await fit(page);
        await shot(page, 'loading-mobile-landscape');
        await context.setOffline(false);
        await page.locator('#loading-help').waitFor({ state: 'hidden' });
        await page.evaluate(() => localStorage.setItem('david-lang2', 'en'));
        await page.reload({ waitUntil: 'commit' });
        await page.locator('#loading-title').waitFor();
        assert.equal(await page.locator('#loading-title').innerText(), 'Loading the game');
      } finally { gate.resolve(); await context.close(); }
    });

    await t.test('a missing initial module gives an accessible error and keyboard retry reloads the exact URL once', async () => {
      let fail = true; intercept = async name => name === '/vendor/three.module.js' && fail ? 503 : null;
      const { context, page } = await open();
      try {
        const url = base + '/?test=1&compatibility=1#retry';
        await page.goto(url); await page.locator('#loading[data-startup-error]').waitFor();
        assert.equal(await page.locator('#loading').getAttribute('aria-busy'), 'false');
        assert.equal(await page.locator('#loading-stage').getAttribute('role'), 'alert');
        assert.equal(await page.evaluate(() => gameAssignments), 0);
        await shot(page, 'loading-module-failure');
        fail = false;
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'loading-retry');
        await page.keyboard.press('Enter'); await ready(page);
        assert.equal(page.url(), url);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
        assert.equal(await page.evaluate(() => localStorage.getItem('david-progress')), '6');
        assert.equal(requests.filter(x => x === '/?test=1&compatibility=1').length, 2);
      } finally { await context.close(); }
    });

    await t.test('failed required CSS stops startup and touch retry recovers', async () => {
      let fail = true; intercept = async name => name === '/src/peace-garden.css' && fail ? 503 : null;
      const { context, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      try {
        await page.goto(base); await page.locator('#loading[data-startup-error]').waitFor();
        assert.equal(await page.evaluate(() => gameAssignments), 0);
        fail = false; await page.getByRole('button', { name: '다시 시도', exact: true }).tap(); await ready(page);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
      } finally { await context.close(); }
    });

    await t.test('held GLB assets show their actual stage; asset failure retains the existing usable fallback', async () => {
      const gate = deferred(); intercept = async name => { if (name.endsWith('.glb')) { await gate.promise; return 503; } };
      const { context, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('loading-stage')?.textContent.includes('동물'));
        assert.equal(await page.evaluate(() => gameAssignments), 0);
        await fit(page); await shot(page, 'loading-mobile-assets');
        gate.resolve(); await ready(page);
        assert.equal(await page.evaluate(() => GAME.graphicsAssets), 'fallback');
        assert.equal(await page.evaluate(() => gameAssignments), 1);
      } finally { gate.resolve(); await context.close(); }
    });

    await t.test('delayed assets can finish successfully without an early title or duplicate scene', async () => {
      const gate = deferred(); intercept = async name => { if (name.endsWith('.glb')) await gate.promise; };
      const { context, page } = await open();
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('loading-stage')?.textContent.includes('동물'));
        assert.equal(await page.locator('#title').isVisible(), false);
        assert.equal(await page.evaluate(() => gameAssignments), 0);
        gate.resolve(); await ready(page);
        assert.equal(await page.evaluate(() => GAME.graphicsAssets), 'ready');
        assert.equal(await page.evaluate(() => gameAssignments), 1);
      } finally { gate.resolve(); await context.close(); }
    });

    await t.test('dynamic module failure stops cleanly and retry succeeds', async () => {
      let fail = true; intercept = async name => name === '/src/peace-garden.js' && fail ? 503 : null;
      const { context, page } = await open();
      try {
        await page.goto(base); await page.locator('.startup-error').waitFor();
        assert.match(await page.locator('.startup-error').textContent(), /GAME_START/);
        assert.equal(await page.evaluate(() => gameAssignments), 0);
        fail = false; await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await ready(page);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
      } finally { await context.close(); }
    });

    await t.test('WebGL failure preserves detailed recovery, never auto-reloads and explicit retry retains progress', async () => {
      intercept = async () => null;
      const { context, page } = await open();
      try {
        await page.addInitScript(() => {
          if (!sessionStorage.getItem('attemptedGL')) {
            sessionStorage.setItem('attemptedGL', '1');
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
          }
        });
        await page.goto(base); await page.locator('.startup-error').waitFor();
        assert.match(await page.locator('.startup-error').textContent(), /GL_CONTEXT/);
        await page.clock.install(); await page.clock.fastForward(20000);
        assert.equal(await page.locator('.startup-error').count(), 1);
        assert.equal(await page.locator('#loading-help').count(), 0);
        await page.clock.resume();
        await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await ready(page);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
        assert.equal(await page.evaluate(() => localStorage.getItem('david-progress')), '6');
      } finally { await context.close(); }
    });

    await t.test('cached fast return and repeated title entry leave no loader, duplicate initialization or delayed help', async () => {
      intercept = async () => null;
      const { context, page, cdp } = await open();
      const cached = []; cdp.on('Network.requestServedFromCache', e => cached.push(e.requestId));
      try {
        await page.goto(base + '/?test=1'); await ready(page);
        await page.goto(base + '/?test=1&return=1'); await ready(page);
        assert.ok(cached.length > 0, 'second navigation actually serves resources from cache');
        assert.equal(await page.evaluate(() => gameAssignments), 1);
        for (let i = 0; i < 2; i++) {
          await openTitleSection(page,'walk');await page.click('#bExplore'); await page.waitForFunction(() => GAME.exploration.active);
          await page.keyboard.press('Escape'); await page.click('#mTitleBtn'); await ready(page);
        }
        assert.equal(await page.locator('#loading-retry').count(), 0);
        assert.equal(await page.evaluate(() => gameAssignments), 1);
        assert.equal(await page.evaluate(() => localStorage.getItem('david-progress')), '6');
        await shot(page, 'loading-ready-title');
      } finally { await context.close(); }
    });
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
