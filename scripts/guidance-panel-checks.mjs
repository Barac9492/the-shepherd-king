import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Exercises the shared disclosure through real browser clicks/taps and keys.
// Content updates use the controllers' normal route/message paths.
export async function checkGuidancePanel(page, mode, touch = false) {
  const toggle = page.locator(`#${mode}GuidanceToggle`), content = page.locator(`#${mode}GuidanceContent`);
  const click = () => touch ? toggle.tap() : toggle.click();
  const collapsed = async () => {
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await content.isVisible(), false);
    assert.equal(await toggle.getAttribute('aria-controls'), mode + 'GuidanceContent');
    assert.equal(await toggle.getAttribute('aria-label'), await toggle.innerText());
    const box = await page.locator(`#${mode}Panel`).boundingBox(), view = page.viewportSize();
    assert.ok(box.height >= 44 && box.height <= 48 && box.width <= 180, JSON.stringify(box));
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height);
    for (const id of ['btnMenu', 'joy', 'tAct', mode + 'Action']) {
      const el = page.locator('#' + id); if (!await el.isVisible()) continue;
      const r = await el.boundingBox();
      assert.ok(box.x + box.width <= r.x || r.x + r.width <= box.x || box.y + box.height <= r.y || r.y + r.height <= box.y, 'toggle overlaps ' + id);
    }
  };
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const token = await page.evaluate(() => GAME.tok);
  for (let i = 0; i < 3; i++) {
    await click(); await collapsed();
    await page.evaluate(mode => {
      const c = mode === 'walk' ? GAME.exploration : GAME.peaceGarden;
      if (mode === 'walk') { c.selectDestination('well'); c.message('wellNote'); }
      else c.message('welcome');
      for (let n = 0; n < 30; n++) c.interactFrame(false);
      GAME.applyLang();
    }, mode);
    await collapsed(); await click(); assert.equal(await content.isVisible(), true);
  }
  // Pointer interaction clears an already held joystick/key/camera gesture.
  await page.evaluate(mode => {
    GAME.input.keys.add('KeyW'); GAME.input.act = true; Object.assign(GAME.input.joy, { x:.4, y:.4 }); GAME.input.lookX = 9;
    document.getElementById(mode + 'GuidanceToggle').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }, mode);
  assert.deepEqual(await page.evaluate(() => [GAME.input.keys.size, GAME.input.act, GAME.input.joy.x, GAME.input.joy.y, GAME.input.lookX]), [0, false, 0, 0, 0]);
  await click(); await collapsed();
  await page.click('#btnMenu'); await page.click('#mLang'); await page.click('#mResume');
  await collapsed(); assert.equal(await toggle.innerText(), 'Show guide');
  await page.click('#btnMenu'); await page.click('#mLang'); await page.click('#mResume'); await collapsed();
  if (!touch) {
    await toggle.focus(); await page.keyboard.press('Space'); assert.equal(await content.isVisible(), true);
    await page.keyboard.press('Enter'); await collapsed();
    assert.equal(await page.evaluate(() => document.activeElement.id), mode + 'GuidanceToggle');
    assert.deepEqual(await page.evaluate(() => [GAME.input.keys.size, GAME.input.act]), [0, false]);
    await click(); await click(); // Pointer toggle leaves game focus ready for WASD.
    const before = await page.evaluate(() => [GAME.player.pos.x, GAME.player.pos.z]);
    await page.keyboard.down('w');
    await page.waitForFunction(([x,z]) => Math.hypot(GAME.player.pos.x-x,GAME.player.pos.z-z) > .5, before, { timeout: 10000 });
    await page.keyboard.up('w'); await collapsed();
  } else {
    const before = await page.evaluate(() => [GAME.player.pos.x, GAME.player.pos.z]);
    await page.evaluate(() => {
      const el = document.getElementById('joy'), r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 81, pointerType: 'touch', bubbles: true, clientX: r.x+r.width/2, clientY: r.y+r.height/2-40 }));
    });
    await page.waitForFunction(([x,z]) => Math.hypot(GAME.player.pos.x-x,GAME.player.pos.z-z) > .5, before, { timeout: 10000 });
    await page.evaluate(() => document.getElementById('joy').dispatchEvent(new PointerEvent('pointercancel', { pointerId:81, pointerType:'touch' })));
    await collapsed();
  }
  if (process.env.SHOTS) {
    await page.locator('#loading').waitFor({ state: 'detached' });
    await fs.mkdir(process.env.SHOTS, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOTS}/${mode}-guide-collapsed-${touch ? 'mobile' : 'desktop'}.png` });
  }
  if (touch) {
    await page.setViewportSize({ width:844, height:390 }); await collapsed();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${mode}-guide-collapsed-landscape.png` });
    await click(); assert.equal(await content.isVisible(), true);
    const panel = await page.locator('#'+mode+'Panel').boundingBox(), joy = await page.locator('#joy').boundingBox();
    assert.ok(panel.y + panel.height <= joy.y, 'expanded guide overlaps joystick');
    await click(); await collapsed(); await page.setViewportSize({ width:390, height:844 }); await collapsed();
  }
  assert.equal(await page.evaluate(() => GAME.tok), token, 'toggle must not reload a world');
  await click(); assert.equal(await content.isVisible(), true);
  if (mode === 'walk') await page.selectOption('#walkDestination', '');
}
