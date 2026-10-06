import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { TRAIL_TEXT } from '../src/psalm-trail-text.js';
import { toInitials } from '../src/psalm-trail-core.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:44961';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture only');
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks = [], errors = [], requests = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
const open = async (p, mode='copy') => {
  await p.goto(base+'/psalm-trail.html');
  await p.locator(`label:has(input[name="startMode"][value="${mode}"])`).click();
  await p.locator('#startBtn').click();
  await expect(p.locator('#screenPlay')).toBeVisible();
};
const finish = async (p, ids=[1,2,3,4,5,6]) => {
  for (const id of ids) {
    await p.locator('#answer').fill(TRAIL_TEXT[id-1]);
    await p.locator('#checkBtn').click();
    await expect(p.locator('#checkpoint')).toBeVisible();
    await p.locator('#nextBtn').click();
  }
  await expect(p.locator('#screenResult')).toBeVisible();
};
try {
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  const p = await context.newPage();
  p.on('pageerror', e=>errors.push(e.message));
  p.on('request', req=>requests.push(req.url()));
  await check('source text, missing answer and wrong input cannot finish a verse',async()=>{
    await open(p);
    assert.equal(await p.locator('#verseVisible').textContent(),TRAIL_TEXT[0]);
    await expect(p.locator('.source-label')).toContainText('개역개정');
    await p.locator('#checkBtn').click(); await expect(p.locator('#checkpoint')).toBeHidden();
    await p.locator('#answer').fill('잘못된 말씀'); await p.locator('#checkBtn').click();
    await expect(p.locator('#checkpoint')).toBeHidden(); await expect(p.locator('#stationMeta')).toContainText('1절');
  });
  await check('synthetic IME composition does not submit early; explicit check completes',async()=>{
    await p.locator('#answer').fill(TRAIL_TEXT[0]);
    await p.locator('#answer').dispatchEvent('compositionstart');
    await p.locator('#answer').dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});
    await expect(p.locator('#checkpoint')).toBeHidden();
    await p.locator('#answer').dispatchEvent('compositionend');
    await p.locator('#answer').press('Enter');
    await expect(p.locator('#checkpoint')).toBeVisible();
    await p.locator('#nextBtn').click();
    await expect(p.locator('#stationMeta')).toContainText('2절');
  });
  await check('all-six copy journey and targeted review',async()=>{
    await finish(p,[2,3,4,5,6]);
    await expect(p.locator('#resultList > li')).toHaveCount(6);
    await expect(p.locator('#retryWeak')).toBeVisible();
    await p.locator('#retryWeak').click();
    await expect(p.locator('#stationMeta')).toContainText('1절');
    await finish(p,[1]); await expect(p.locator('#resultList > li')).toHaveCount(1);
  });
  await check('initials are cues, not accepted abbreviated answers',async()=>{
    await open(p,'initials');
    await expect(p.locator('#verseVisible')).toBeHidden();
    assert.equal(await p.locator('#verseInitials').textContent(),toInitials(TRAIL_TEXT[0]));
    await p.locator('#answer').fill(toInitials(TRAIL_TEXT[0])); await p.locator('#checkBtn').click();
    await expect(p.locator('#checkpoint')).toBeHidden();
    await p.locator('#hintBtn').click(); await expect(p.locator('#verseVisible')).toHaveText(TRAIL_TEXT[0]);
    await finish(p); await expect(p.locator('#resultList > li').first()).toContainText('힌트');
  });
  await check('recall does not leak target and hints remain separately classified',async()=>{
    await open(p,'recall');
    await expect(p.locator('#verseVisible')).toHaveText('');
    await expect(p.locator('#verseInitials')).toHaveText('');
    await expect(p.locator('#verseHidden')).toBeVisible();
    await p.locator('#hintBtn').click(); await finish(p);
    await expect(p.locator('#replayHarder')).toBeHidden();
    await expect(p.locator('#resultList > li').first()).toContainText('힌트');
  });
  await check('no score storage or API/network traffic',async()=>{
    assert.ok(!requests.some(url=>new URL(url).pathname.startsWith('/api/')));
    assert.ok(requests.every(url=>new URL(url).origin===new URL(base).origin));
    assert.deepEqual(await p.evaluate(()=>Object.keys(localStorage)),[]);
  });
  await context.close();
  for (const size of [{width:390,height:844},{width:320,height:680},{width:740,height:390}]) {
    const c=await browser.newContext({viewport:size,hasTouch:true,reducedMotion:'reduce'});
    const mobile=await c.newPage(); mobile.on('pageerror',e=>errors.push(e.message));
    await check(`${size.width}x${size.height} CSS layout and long verse`,async()=>{
      await open(mobile);
      for(let id=1;id<=3;id++) {
        await mobile.locator('#answer').fill(TRAIL_TEXT[id-1]); await mobile.locator('#checkBtn').click(); await mobile.locator('#nextBtn').click();
      }
      await expect(mobile.locator('#verseVisible')).toHaveText(TRAIL_TEXT[3]);
      assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      for(const id of ['answer','checkBtn']) {
        const b=await mobile.locator('#'+id).boundingBox();
        assert.ok(b && b.x>=0 && b.x+b.width<=size.width+1);
      }
    });
    await c.close();
  }
  assert.deepEqual(errors,[]);
  const result={checks,errors,requestCount:requests.length,nativeDevice:'not tested'};
  if(process.env.REPORT_PATH) await fs.writeFile(process.env.REPORT_PATH,JSON.stringify(result,null,2));
  console.log('PSALM_TRAIL_RESULT '+JSON.stringify(result));
} finally { await browser.close(); }
