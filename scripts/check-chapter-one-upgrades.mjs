import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:43871';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.GAME?.chapterOneUpgrades&&!document.getElementById('loading'));
 await page.addScriptTag({type:'module',url:new URL('/scripts/chapter-one-upgrades-browser.js',base).href});
 await page.waitForFunction(()=>typeof window.checkChapterOneUpgrades==='function');
 const report=await page.evaluate(()=>window.checkChapterOneUpgrades());assert.equal(report.failed,0,JSON.stringify(report.results));assert.equal(report.passed,5);assert.deepEqual(errors,[]);
 for(const query of ['?upgrades=off','?review=bethlehem']){
  await page.goto(base+query,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.GAME&&!document.getElementById('loading'));
  const guard=await page.evaluate(()=>({disabled:!GAME.chapterOneUpgrades,unexpected:performance.getEntriesByType('resource').filter(e=>/chapter-one-upgrades|sheep-steering|yuka|camera-controls/.test(e.name)).map(e=>e.name)}));assert.equal(guard.disabled,true);assert.deepEqual(guard.unexpected,[]);
 }
 assert.deepEqual(errors,[]);console.log('CHAPTER_ONE_UPGRADES_PASS',JSON.stringify(report));
}finally{await browser.close();}
