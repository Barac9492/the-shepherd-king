import {openTitleSection} from './title-menu-test-helpers.mjs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PSALM_PRESCRIPTIONS as items} from '../src/psalm-prescriptions.js';
const base=process.env.BASE_URL||'http://127.0.0.1:44025';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local only');
const out=process.env.SHOTS||'test-results/david-dance';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],errors=[],requests=[];let observe=true;
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const context=await browser.newContext({viewport:{width:1280,height:1000}}),p=await context.newPage();
p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(observe&&(r.url().includes('/api/')||r.url().startsWith('http')&&!r.url().startsWith(base)))requests.push(r.url());});
const shot=name=>p.screenshot({path:out+'/'+name+'.png',fullPage:true});
const submit=async(text,q=p)=>{await q.fill('#answer',text);await q.click('#check');};
const choose=id=>p.locator('[data-prescription="'+id+'"]').click();
try{
 await p.goto(base+'/dance.html');
 await check('five image situations, representative verses, no dance or rankings',async()=>{
  assert.deepEqual(await p.locator('[data-prescription]').evaluateAll(bs=>bs.map(b=>b.dataset.prescription)),items.map(x=>x.id));
  assert.equal(await p.locator('h1').innerText(),'다윗의 시편 처방전');assert.equal(await p.locator('#verse').innerText(),items[0].text);
  assert.equal(await p.locator('#completedCount').innerText(),'0 / 5');assert.equal(await p.locator('#sound,#stage,[data-ranking],audio,video').count(),0);
  assert.equal(await p.locator('#answer').getAttribute('maxlength'),'600');await shot('desktop-read');
 });
 await check('recall conceals source and explanation, optional reveal has no penalty',async()=>{
  await p.click('#recallMode');assert.equal(await p.locator('#verse').textContent(),'');assert.equal(await p.locator('#explanation').textContent(),'');
  await p.click('#hint');assert.equal(await p.locator('#verse').innerText(),items[0].text);await p.click('#readMode');await p.click('#recallMode');assert.equal(await p.locator('#verse').textContent(),'');
 });
 await check('blank wrong duplicate and unsafe text use neutral safe feedback',async()=>{
  await submit(' , ! ');assert.match(await p.locator('#feedback').innerText(),/먼저 입력/);
  await submit(items[0].text.replace('영혼','영원'));assert.match(await p.locator('#feedback').innerText(),/본문:/);assert.match(await p.locator('#feedback').innerText(),/입력:/);
  const count=await p.locator('.correction').count();await p.click('#check');assert.equal(await p.locator('.correction').count(),count);assert.match(await p.locator('#feedback').innerText(),/같은 내용/);
  await submit('<script>window.__rxXss=1</script>');assert.equal(await p.locator('#feedback script').count(),0);assert.equal(await p.evaluate(()=>window.__rxXss),undefined);assert.equal(await p.locator('#completedCount').innerText(),'0 / 5');await p.fill('#answer','');
 });
 await check('composition guard, newline and submit shortcut, duplicate success',async()=>{
  await p.fill('#answer',items[0].text);await p.locator('#answer').dispatchEvent('compositionstart');assert.equal(await p.locator('#check').isDisabled(),true);await p.evaluate(()=>document.getElementById('answerForm').requestSubmit());assert.equal(await p.locator('#result').isVisible(),false);
  await p.locator('#answer').dispatchEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,keyCode:229});assert.equal(await p.locator('#result').isVisible(),false);
  await p.locator('#answer').dispatchEvent('compositionend');assert.equal(await p.locator('#check').isDisabled(),false);await p.focus('#answer');await p.keyboard.press('End');await p.keyboard.press('Enter');assert.ok((await p.locator('#answer').inputValue()).includes('\n'));
  await p.keyboard.press('Control+Enter');assert.equal(await p.locator('#result').isVisible(),true);assert.equal(await p.locator('#completedCount').innerText(),'1 / 5');
  await p.evaluate(()=>{document.getElementById('answerForm').requestSubmit();document.getElementById('answerForm').requestSubmit();});assert.equal(await p.locator('#completedCount').innerText(),'1 / 5');
 });
 await check('mode after completion starts fresh concealed recall, completion unique',async()=>{
  await p.click('#recallMode');assert.equal(await p.locator('#result').isVisible(),false);assert.equal(await p.locator('#verse').textContent(),'');assert.equal(await p.locator('#answer').inputValue(),'');
  await submit(items[0].text.replace(/[\s\p{P}]/gu,''));assert.equal(await p.locator('#completedCount').innerText(),'1 / 5');await p.click('#next');assert.equal(await p.locator('#verse').innerText(),items[1].text);
 });
 await check('switch restart and leave guards preserve text and focus on cancel',async()=>{
  await p.fill('#answer','입력 중');await choose('rest');await p.click('#cancelAction');assert.equal(await p.locator('#answer').inputValue(),'입력 중');assert.equal(await p.locator('#answer').evaluate(e=>e===document.activeElement),true);
  await p.click('#restart');await p.keyboard.press('Escape');assert.equal(await p.locator('#answer').inputValue(),'입력 중');
  await p.click('#leave');await p.click('#cancelAction');assert.ok(p.url().endsWith('/dance.html'));assert.equal(await p.locator('#answer').inputValue(),'입력 중');
  await choose('rest');await p.click('#confirmAction');assert.equal(await p.locator('#answer').inputValue(),'');assert.equal(await p.locator('#verse').innerText(),items[2].text);
  await p.fill('#answer','다시 읽기');await p.click('#restart');await p.click('#confirmAction');assert.equal(await p.locator('#answer').inputValue(),'');
 });
 await check('all five exact quotes complete without scoring storage or API calls',async()=>{
  await p.evaluate(()=>{localStorage.setItem('david-progress','6');localStorage.setItem('david-dance-local-v1','[{"score":1110,"at":123}]');localStorage.setItem('david-dance-supplied-v1-psalm51','historical-record');});
  const before=await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))));
  for(const item of items){await choose(item.id);await p.click('#recallMode');assert.equal(await p.locator('#verse').textContent(),'');await submit(item.text);assert.equal(await p.locator('#result').isVisible(),true);assert.equal(await p.locator('#verse').innerText(),item.text);assert.equal(await p.locator('#explanation').innerText(),item.explanation);}
  assert.equal(await p.locator('#completedCount').innerText(),'5 / 5');assert.doesNotMatch(await p.locator('.reading-panel').innerText(),/점수|정확도|연속|축제|춤|\d+점/);
  assert.equal(await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))),before);assert.deepEqual(requests,[]);await shot('all-five-complete');
 });
 await check('320 and 390 pixel long titles and quotes have no horizontal overflow',async()=>{
  for(const width of [320,390]){await p.setViewportSize({width,height:800});await choose('rescue');assert.equal(await p.locator('#situationTitle').innerText(),items[3].situation);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await p.locator('#verse').innerText(),items[3].text);await shot('mobile-'+width);}
  await p.setViewportSize({width:1280,height:1000});
 });
 await check('storage denied still permits completion and hint',async()=>{
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('denied');}});Object.defineProperty(window,'sessionStorage',{get(){throw Error('denied');}});});const q=await blocked.newPage();q.on('pageerror',e=>errors.push(e.message));
  try{await q.goto(base+'/dance.html');await q.click('#recallMode');await q.click('#hint');await submit(items[0].text,q);assert.equal(await q.locator('#result').isVisible(),true);}finally{await blocked.close();}
 });
 await check('entry exit preserve main progress and old records; session count resets',async()=>{
  observe=false;await p.click('#leave');await openTitleSection(p,'challenge');assert.equal(await p.locator('#bDance').innerText(),'다윗의 시편 처방전');await p.click('#bDance');await p.waitForURL('**/dance.html');observe=true;
  assert.equal(await p.evaluate(()=>localStorage.getItem('david-progress')),'6');assert.equal(await p.evaluate(()=>localStorage.getItem('david-dance-supplied-v1-psalm51')),'historical-record');assert.equal(await p.locator('#completedCount').innerText(),'0 / 5');
 });
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={checks:checks.length,names:checks,errors,externalRequests:requests,limitations:['Synthetic composition events, not physical Korean keyboard.','CSS viewport emulation, not physical device.'],screenshots:out};
 await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log('DAVID_DANCE_RESULT',JSON.stringify(report));
}finally{await context.close();await browser.close();}
