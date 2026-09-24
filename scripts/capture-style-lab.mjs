import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';
const base=process.env.BASE_URL||'http://127.0.0.1:43872',out=process.env.CAPTURE_DIR||path.resolve('assets/style-lab');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{for(const id of (process.env.STYLES||'01,02,03,04,05,06,07,08,09,10').split(','))for(const shot of ['bethlehem','nathan']){
 await page.goto(`${base}/?review=${shot}&style=${id}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.GAME?.styleReady,{timeout:45000});
 await page.addStyleTag({content:'#art-review{display:none!important}'});
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>{let n=0;function tick(){if(++n>=15)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});});
 await page.screenshot({path:path.join(out,`${id}-${shot}.jpg`),type:'jpeg',quality:90});
 const state=await page.evaluate(()=>({style:GAME.styleLab.id,chapter:GAME.reviewChapter,geometry:GAME.renderer.info.memory.geometries,render:GAME.styleRenderStats||{calls:GAME.renderer.info.render.calls,triangles:GAME.renderer.info.render.triangles},canvas:[GAME.canvas.width,GAME.canvas.height]}));
 results.push({...state,errors:errors.splice(0)});console.log(JSON.stringify(results.at(-1)));
}await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(results,null,2));if(results.some(r=>r.errors.length))process.exitCode=1;
}finally{await browser.close();}
