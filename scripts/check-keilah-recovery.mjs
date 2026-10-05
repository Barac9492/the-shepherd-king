import {chromium,expect} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:44937';if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const results=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
const state=p=>p.evaluate(async()=>{const s=JSON.parse(sessionStorage.getItem('keilah-session-v1'));return(await fetch('/api/keilah/rooms/'+s.code,{headers:{authorization:'Bearer '+s.token}})).json();});
try{
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage();await p.goto(base+'/keilah.html');await expect(p.locator('#create')).toBeEnabled();
 let created;
 await check('lost create response survives refresh and recovers the existing seat',async()=>{
  await p.route('**/api/keilah/rooms',async r=>{const response=await r.fetch();created=(await response.json()).state.code;await r.abort();});
  await p.click('#create');await expect(p.locator('#notice')).toContainText('연결을 확인');await p.unroute('**/api/keilah/rooms');await p.reload();await expect(p.locator('#roomCode')).toHaveText(created);
 });
 await check('public consent is required; lost ready response cannot toggle twice',async()=>{
  await expect(p.locator('#ready')).toBeDisabled();await p.locator('#consent').check();let lost=false;
  await p.route('**/api/keilah/rooms/*/command',async r=>{if(!lost){lost=true;await r.fetch();await r.abort();}else await r.continue();});
  await p.click('#ready');await expect(p.locator('#ready')).toHaveText('준비 취소',{timeout:10000});await expect(p.locator('#ready')).toBeEnabled({timeout:10000});const s=await state(p);assert.equal(s.players[0].seq,1);assert.equal(s.players[0].ready,true);await expect(p.locator('#consent')).toBeDisabled();await p.unroute('**/api/keilah/rooms/*/command');await p.click('#ready');await expect(p.locator('#ready')).toHaveText('준비하기');
 });
 await check('out-of-order state response does not undo a newer command snapshot',async()=>{
  let release,arrived;const waiting=new Promise(r=>arrived=r),barrier=new Promise(r=>release=r);let once=false;
  await p.route('**/api/keilah/rooms/'+created,async r=>{if(!once){once=true;const response=await r.fetch();const old=await response.json();arrived();await barrier;await r.fulfill({json:old});}else await r.continue();});
  await waiting;await p.click('#ready');await expect(p.locator('#ready')).toHaveText('준비 취소');release();await p.waitForTimeout(500);await expect(p.locator('#ready')).toHaveText('준비 취소');await p.unroute('**/api/keilah/rooms/'+created);
 });
 await check('refresh preserves membership and cancel/leave clears it',async()=>{await p.reload();await expect(p.locator('#roomCode')).toHaveText(created);await expect(p.locator('#ready')).toHaveText('준비 취소');await expect(p.locator('#consent')).toBeChecked();await p.click('#leave');await p.click('#cancelLeave');await expect(p.locator('#room')).toBeVisible();await p.click('#leave');await p.click('#confirmLeave');await expect(p.locator('#entry')).toBeVisible();assert.equal(await p.evaluate(()=>sessionStorage.getItem('keilah-session-v1')),null);});
 await fs.mkdir('test-results/keilah',{recursive:true});await fs.writeFile('test-results/keilah/recovery-report.json',JSON.stringify({results,scope:'production handler + unchanged PostgreSQL RPC; dropped responses only'},null,2));
}finally{for(const c of browser.contexts())await c.close();await browser.close();}
