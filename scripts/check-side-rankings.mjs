import {openTitleSection} from './title-menu-test-helpers.mjs';
/** Entire browser → HTTP → replay → PostgreSQL test runs on loopback with inert keys. */
import {chromium} from '@playwright/test';
import {PGlite} from '@electric-sql/pglite';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSideHandler} from '../server/side-challenge-http.mjs';
import {createSideService} from '../server/side-challenge-service.mjs';
import {SCORE_KEY,scoreKey} from '../src/david-dance-core.js';
import {PSALM_PRESCRIPTIONS} from '../src/psalm-prescriptions.js';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=process.env.SHOTS||'test-results/side-rankings';await fs.mkdir(out,{recursive:true});
const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');await db.exec(await fs.readFile(path.join(root,'supabase/migrations/20261005074002_dance_engedi_top10.sql'),'utf8'));await db.exec('SET ROLE service_role');
const origin='https://fixture.example',env={VERCEL:'1',DANCE_ONLINE_ENABLED:'true',ENGEDI_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:origin,CHALLENGE_SUPABASE_URL:'https://jdsjvrynmnzoztfinlzi.supabase.co',CHALLENGE_SUPABASE_SECRET_KEY:'sb_secret_'+'localtest'.repeat(4)};
const requests=[],errors=[],checks=[];let fakeIp=10;
const serviceFactory=config=>createSideService({...config,fetchImpl:async(url,options)=>{const p=JSON.parse(options.body),mode=url.includes('/dance_')?'dance':'engedi';const data=(await db.query(`SELECT public.${mode}_challenge_rpc($1,$2::jsonb,$3) AS data`,[p.p_action,JSON.stringify(p.p_input),p.p_client_key])).rows[0].data;return Response.json(data);}});
const server=http.createServer(async(req,res)=>{
 try{
 const pathname=new URL(req.url,'http://localhost').pathname,m=pathname.match(/^\/api\/(dance|engedi)-challenge\/(record|attempts|finish|submit|invalidate)$/);
 if(m){let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw Error('cap');}requests.push({mode:m[1],action:m[2],body:body?JSON.parse(body):null});
  const request=new Request(origin+pathname,{method:req.method,headers:{origin,'content-type':'application/json','x-vercel-forwarded-for':`203.0.113.${fakeIp}`},body:body||undefined});
  const response=await createSideHandler(m[1],m[2],{env,serviceFactory})(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('path');const content=await fs.readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream'),'cache-control':'no-store'});res.end(content);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{assert.ok(!r.url().startsWith('http')||r.url().startsWith(base)||/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.url()),'no external requests except existing static fonts');});};
const rank=p=>p.locator('[data-ranking]'),s=(p,key)=>rank(p).locator(`[data-rank="${key}"]`);
const completePrescription=async(p,item)=>{await p.click(`[data-prescription="${item.id}"]`);await p.click('#recallMode');assert.equal(await p.locator('#verse').isVisible(),false);await p.fill('#answer',item.text);await p.click('#check');assert.equal(await p.locator('#result').isVisible(),true);assert.equal(await p.locator('#verse').innerText(),item.text);};
try{
 const p=await browser.newPage({viewport:{width:1280,height:1000}});observe(p);await p.goto(base+'/dance.html');assert.equal(await p.locator('h1').innerText(),'다윗의 시편 처방전');
 const preservedKeys=[SCORE_KEY,scoreKey('psalm23'),scoreKey('psalm3'),scoreKey('psalm51'),'david-progress'];
 const preserved=Object.fromEntries(preservedKeys.map((key,i)=>[key,i===4?'6':JSON.stringify([{score:1110,at:123456}])]));
 await check('prescription selector follows supplied leaflet and has no ranking entry',async()=>{
  assert.equal(await rank(p).count(),0);assert.deepEqual(await p.locator('[data-prescription]').evaluateAll(buttons=>buttons.map(b=>b.dataset.prescription)),PSALM_PRESCRIPTIONS.map(x=>x.id));assert.equal(await p.locator('#verse').innerText(),PSALM_PRESCRIPTIONS[0].text);assert.equal(requests.length,0);
  await p.evaluate(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},preserved);
 });
 await check('all five representative verses complete without ranking/API/storage writes',async()=>{
  for(const item of PSALM_PRESCRIPTIONS)await completePrescription(p,item);
  assert.match(await p.locator('#completedCount').innerText(),/5\s*\/\s*5/);assert.equal(requests.length,0);
  assert.deepEqual(await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),preserved);await p.screenshot({path:`${out}/prescription-desktop.png`,fullPage:true});
 });
 await check('unavailable old ranking service does not affect prescription recall',async()=>{
  let called=0;await p.route('**/api/dance-challenge/**',route=>{called++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'online_disabled'}})});});
  await completePrescription(p,PSALM_PRESCRIPTIONS[0]);assert.equal(called,0);assert.equal(requests.length,0);await p.unroute('**/api/dance-challenge/**');
 });
 await p.goto('about:blank');
 for(const width of [320,390]){
  fakeIp++;const context=await browser.newContext({viewport:{width,height:width===320?700:844},isMobile:true,hasTouch:true});const m=await context.newPage();observe(m);await m.goto(base+'/dance.html');
  await check(`${width}px prescription long title/verse, touch/IME, all five cases, no storage`,async()=>{
   const item=PSALM_PRESCRIPTIONS[3];await m.tap(`[data-prescription="${item.id}"]`);await m.tap('#recallMode');await m.fill('#answer',item.text);await m.dispatchEvent('#answer','compositionstart');assert.equal(await m.locator('#check').isDisabled(),true);await m.evaluate(()=>document.querySelector('#answerForm').requestSubmit());assert.equal(await m.locator('#result').isVisible(),false);await m.dispatchEvent('#answer','compositionend');await m.tap('#check');assert.equal(await m.locator('#result').isVisible(),true);assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const entry of PSALM_PRESCRIPTIONS)if(entry.id!==item.id)await completePrescription(m,entry);
   assert.match(await m.locator('#completedCount').innerText(),/5\s*\/\s*5/);assert.equal(await m.evaluate(()=>localStorage.length),0);assert.equal(requests.length,0);assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.screenshot({path:`${out}/prescription-mobile-${width}.png`,fullPage:true});
  });await context.close();
 }
 fakeIp++;console.log('OPEN_ENGEDI');await p.setViewportSize({width:1280,height:800});await p.bringToFront();await p.goto(base+'/?test=1'+(process.env.SOFTWARE==='1'?'&compatibility=1':''),{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);await openTitleSection(p,'challenge');await p.click('#bEngedi');
 // This integration gate exercises the shipped compatibility renderer on CPU-only CI.
 // The separate dance-engedi-runtime job retains the standard-renderer real-time run.
 // No clock, replay, interruption limit, input or challenge state is changed here.
 if(process.env.SOFTWARE==='1')await check('software integration uses the production compatibility context before timing',async()=>{
  const profile=await p.evaluate(()=>({compatibility:GAME.renderCompatibility,attributes:GAME.renderer.getContext().getContextAttributes(),phase:GAME.engediChallenge.phase,tick:GAME.engediChallenge.state.tick}));
  assert.equal(profile.compatibility,true);assert.equal(profile.attributes.antialias,false);assert.equal(profile.attributes.stencil,false);assert.equal(profile.phase,'lobby');assert.equal(profile.tick,0);
  console.log('RANKING_RENDER_PROFILE',JSON.stringify(profile));
 });
 await check('En-Gedi separate empty top10; real-time keyboard completion → replay → consented SQL record',async()=>{
  await s(p,'read').click();await s(p,'status').filter({hasText:'아직 공개 기록'}).waitFor();await p.waitForTimeout(1500);await s(p,'start').click();await p.waitForFunction(()=>GAME.engediChallenge.phase==='playing');
  await p.evaluate(()=>{let key;const timer=setInterval(()=>{const c=GAME.engediChallenge;if(c.phase!=='playing'){clearInterval(timer);return;}const x=c.state.progress,tight=[[180000,270000],[490000,580000],[760000,850000]].some(([a,b])=>x>=a-1800&&x<b),next=tight?'KeyA':'KeyD';if(next===key)return;if(key)dispatchEvent(new KeyboardEvent('keyup',{code:key,bubbles:true}));key=next;dispatchEvent(new KeyboardEvent('keydown',{code:key,bubbles:true}));},16);});
  await p.waitForFunction(()=>GAME.engediChallenge.phase==='result',null,{timeout:40000});assert.equal(await p.evaluate(()=>GAME.engediChallenge.state.status),'success',JSON.stringify(await p.evaluate(()=>({state:GAME.engediChallenge.state,gap:GAME.engediChallenge.clock.maxGapMs,hidden:document.hidden}))));
  const tick=await p.evaluate(()=>GAME.engediChallenge.state.tick);await s(p,'initials').fill('RUN');await s(p,'consent').check();await s(p,'submit').click();await s(p,'status').filter({hasText:'TOP 10에 공개했어요'}).waitFor();
  await s(p,'read').click();await s(p,'entries').filter({hasText:'RUN'}).waitFor();assert.match(await s(p,'entries').innerText(),new RegExp((tick/100).toFixed(3)));assert.doesNotMatch(await s(p,'entries').innerText(),/ABC|MOB/);
  await p.screenshot({path:`${out}/engedi-desktop-top10.png`,fullPage:true});console.log('REAL_VERIFIED_ENGEDI_MS',tick*10);
 });
 await check('hidden/blur/gap ranked En-Gedi invalidates server attempt; practice completion is excluded',async()=>{
  for(const kind of ['hidden','blur','gap']){
   await s(p,'start').click();await p.waitForFunction(()=>GAME.engediChallenge.phase==='playing');
   const invalidated=p.waitForResponse(r=>r.url().endsWith('/engedi-challenge/invalidate'));
   if(kind==='hidden')await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
   if(kind==='blur')await p.evaluate(()=>dispatchEvent(new Event('blur')));
   if(kind==='gap')await p.evaluate(()=>{const end=performance.now()+300;while(performance.now()<end){}});
   await p.waitForFunction(()=>GAME.engediChallenge.phase==='result');assert.equal(await s(p,'form').isVisible(),false);assert.match(await s(p,'status').innerText(),/중단된/);assert.equal((await invalidated).status(),200);assert.equal((await db.query('SELECT invalid FROM engedi_challenge.attempts ORDER BY issued_at DESC LIMIT 1')).rows[0].invalid,true);
  }
  await p.click('#engediStart');await p.waitForFunction(()=>GAME.engediChallenge.phase==='playing');await p.keyboard.press('Escape');assert.equal(await s(p,'form').isVisible(),false);
  await p.click('#engediBack');await p.waitForFunction(()=>GAME.mode==='title');assert.equal(await p.evaluate(()=>GAME.engediChallenge.listeners),null);
 });
 await p.goto('about:blank');
 for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:width===320?700:844},isMobile:true,hasTouch:true});const m=await context.newPage();observe(m);await m.goto(base+'/?test=1');await m.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);await openTitleSection(m,'challenge');await m.click('#bEngedi');
  await check(`${width}px En-Gedi ranking and modal keyboard focus stay accessible`,async()=>{await s(m,'read').tap();await s(m,'entries').filter({hasText:'RUN'}).waitFor();assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));for(let i=0;i<15;i++){await m.keyboard.press('Tab');assert.ok(await m.evaluate(()=>document.querySelector('#engediPanel').contains(document.activeElement)));}await rank(m).scrollIntoViewIfNeeded();await m.screenshot({path:`${out}/engedi-mobile-${width}-top10.png`});});await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,apiRequests:requests.length,scope:'loopback ephemeral PGlite; no remote writes'},null,2));console.log('PASS',checks.length,'checks; errors',errors.length);
}catch(error){console.error('QA_FAILED',error);for(const c of browser.contexts())for(const p of c.pages()){console.error('QA_STATE',await p.evaluate(()=>{const c=window.GAME?.engediChallenge;return c?{phase:c.phase,state:c.state,gaps:c.prepareGaps,ready:c.readyFrames,hidden:document.hidden,ratio:GAME.renderer.getPixelRatio(),render:GAME.renderer.info.render,status:document.querySelector('[data-ranking=engedi] [data-rank=status]')?.textContent}:{};}).catch(()=>({})));}throw error;}finally{console.log('QA_CLEANUP');server.closeAllConnections();for(const context of browser.contexts())await context.close();await browser.close();await new Promise(r=>server.close(r));await db.close();}
