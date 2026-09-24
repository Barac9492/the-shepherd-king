import {chromium} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.BASE_URL||'http://127.0.0.1:43871';
const chapters=(process.env.CHAPTERS||'bethlehem,elah,harp,jonathan,engedi,abigail,ziklag,ark,mephibosheth,nathan').split(',');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  for(const chapter of chapters){
    const start=Date.now();await page.goto(`${base}/?review=${chapter}&test=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.GAME?.reviewReady,{},{timeout:30000});
    const readyMs=Date.now()-start;
    const detail=await page.evaluate(async()=>{
      const g=GAME;g.paused=false;
      const frames=n=>new Promise(resolve=>{let i=0;function tick(){if(++i>=n)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
      await frames(180);g.resetGraphicsMetrics();await frames(360);
      const gl=g.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),metrics:g.graphicsMetrics(),assets:g.graphicsAssets,profile:g.anthologyRenderProfile||'bethlehem'};
    });
    results.push({chapter,readyMs,...detail});console.log(chapter,JSON.stringify(results.at(-1)));
  }
}finally{await browser.close();}
const report={scenario:'Animated staged views after 180 warmup frames; 360 measured frames. Apple desktop GPU, not physical-phone performance or complete story playthrough.',errors,results};
if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
