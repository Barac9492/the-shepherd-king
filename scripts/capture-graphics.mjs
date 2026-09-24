import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';
const base=process.env.BASE_URL||'http://127.0.0.1:43871',out=process.env.CAPTURE_DIR;
if(!out)throw Error('Set CAPTURE_DIR to a temporary proof directory');await fs.mkdir(out,{recursive:true});
const mode=process.env.GRAPHICS||'storybook',keys=(process.env.CHAPTERS||'bethlehem,elah,harp,jonathan,engedi,abigail,ziklag,ark,mephibosheth,nathan').split(',');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.SOFTWARE==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const key of keys){
 await page.goto(`${base}/?review=${key}${mode==='legacy'?'&graphics=legacy':''}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.GAME?.reviewReady,{timeout:45000});
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 await page.screenshot({path:path.join(out,`${mode}-${key}.png`)});
 const data=await page.evaluate(()=>({key:GAME.reviewChapter,assets:GAME.graphicsAssets,metrics:GAME.graphicsMetrics(),pose:GAME.david.pose,chapter:GAME.ch.title.ko,profile:GAME.anthologyRenderProfile||GAME.__storybookWorld&&'bethlehem'||null}));
 results.push({...data,errors:errors.splice(0)});console.log(key,JSON.stringify(results.at(-1)));
}
await fs.writeFile(path.join(out,`${mode}-capture.json`),JSON.stringify(results,null,2));await browser.close();
