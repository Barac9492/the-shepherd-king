// UI-only submission fixtures. Real replay, HTTP and SQL behavior is covered by the local integration tests.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED } from '../src/sling-challenge-core.js';
const base=process.env.BASE_URL||'http://127.0.0.1:43983';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Use local preview only.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const results=[],submissions=[],requests=[],errors=[];
const metadata={mode:'online',onlineEligible:true,recordScope:'global',ruleVersion:CHALLENGE_RULES.version};
const record={initials:'OLD',score:5000};
let submitMode='error',readError=false,release;
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
await fs.mkdir('test-results/sling-ranking',{recursive:true});
try{
  const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  phone.on('pageerror',error=>errors.push(error.message));
  await phone.addInitScript(()=>localStorage.setItem('sling-challenge-tutorial-v2','1'));
  await phone.route('**/api/sling-challenge/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;requests.push(request.method()+' '+path);
    let body={...metadata,record,rankingVersion:'top10-v1'},status=200;
    if(request.method()==='GET'&&path.endsWith('/record')){body.entries=[{initials:'ABC',score:1234}];if(readError){status=503;body={error:{code:'unavailable'}};}}
    else if(request.method()==='POST'&&path.endsWith('/attempts'))body.attempt={id:'a'.repeat(48),seed:CHALLENGE_COURSE_SEED,version:CHALLENGE_RULES.version};
    else if(request.method()==='POST'&&path.endsWith('/finish')){body.qualifies=false;body.rankingEligible=true;}
    else if(request.method()==='POST'&&path.endsWith('/submit')){
      submissions.push(request.postDataJSON());
      if(submitMode==='error'){status=503;body={error:{code:'unavailable'}};}
      else{if(submitMode==='pending')await new Promise(resolve=>{release=resolve;});body.accepted=submitMode!=='outside';body.reason=body.accepted?'ranked':'outside_top10';}
    }else return route.abort();
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
  });
  await phone.goto(base);await phone.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending);
  await phone.locator('#bChallenge').tap();await phone.locator('#challengeTest').tap();
  const finish=async()=>{await phone.waitForFunction(()=>GAME.slingChallenge.phase==='playing');await phone.evaluate(()=>{const c=GAME.slingChallenge;c.state.status='ended';c.state.score=1234;c.state.hits=1;return c.finish();});await expect(phone.locator('#challengeForm')).toBeVisible();};
  await finish();
  await check('mobile lower-than-highest result offers explicit unchecked top-10 consent',async()=>{
    await expect(phone.locator('#challengeEyebrow')).toHaveText('1,234 점 · 1 명중');await expect(phone.locator('#challengeConsent')).not.toBeChecked();await expect(phone.locator('#challengeConsentText')).toContainText('상위 10개 공개 순위표');await expect(phone.locator('#challengeStatus')).toContainText('원하면 공개 순위표');
    await phone.locator('#challengeInitials').fill('abc');await phone.locator('#challengeSubmit').tap();assert.equal(submissions.length,0);
    await phone.screenshot({path:'test-results/sling-ranking/mobile-consent.png'});
  });
  await check('failed submission can retry the identical versioned consent payload',async()=>{
    await phone.locator('#challengeConsent').check();await phone.locator('#challengeSubmit').tap();await expect(phone.locator('#challengeStatus')).toContainText('연결이 끊겼어요');
    assert.equal(submissions[0].rankingConsent,'top10-v1');assert.equal(submissions[0].initials,'ABC');await expect(phone.locator('#challengeInitials')).toBeDisabled();
    submitMode='pending';await phone.locator('#challengeSubmit').tap();await expect(phone.locator('#challengeSubmit')).toBeDisabled();
    await phone.evaluate(()=>document.getElementById('challengeForm').requestSubmit());assert.equal(submissions.length,2);assert.deepEqual(submissions[0],submissions[1]);
    readError=true;submitMode='accepted';release();await expect(phone.locator('#challengeStatus')).toContainText('제출 결과는 확인했지만');await expect(phone.locator('#challengeForm')).toBeHidden();
  });
  await check('after confirmed submission, refresh retries only a GET',async()=>{
    const before=submissions.length;readError=false;await phone.locator('#challengeRefresh').tap();await expect(phone.locator('#challengeStatus')).toContainText('순위표 제출을 확인했어요');assert.equal(submissions.length,before);
  });
  await check('a new attempt resets consent and outside-top-ten result is explicit',async()=>{
    await phone.locator('#challengeStart').tap();await finish();await expect(phone.locator('#challengeConsent')).not.toBeChecked();await expect(phone.locator('#challengeInitials')).toHaveValue('');
    await phone.locator('#challengeInitials').fill('ABC');await phone.locator('#challengeConsent').check();submitMode='outside';await phone.locator('#challengeSubmit').tap();await expect(phone.locator('#challengeStatus')).toContainText('상위 10개에 들지 않아');
  });
  await check('back cancels a pending response without reopening the form',async()=>{
    await phone.locator('#challengeStart').tap();await finish();await phone.locator('#challengeInitials').fill('ABC');await phone.locator('#challengeConsent').check();submitMode='pending';await phone.locator('#challengeSubmit').tap();await expect(phone.locator('#challengeSubmit')).toBeDisabled();
    await phone.locator('#challengeBack').tap();submitMode='accepted';release();await phone.waitForFunction(()=>GAME.slingChallenge.phase==='closed'&&!GAME.slingChallenge.navigationPending);await expect(phone.locator('#challengePanel')).toBeHidden();
  });
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/sling-ranking/submission-report.json',JSON.stringify({results,requests,submissions,errors},null,2));
}finally{await browser.close();}
