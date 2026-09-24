import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:43871'}/?review=bethlehem&test=1`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.GAME?.reviewReady);
  const report=await page.evaluate(()=>{
    const g=GAME,T=GRAPHICS_TEST.THREE,chapters=[],reloads=[];
    for(let i=0;i<10;i++){
      g.loadWorld(i);g.mode='play';g.paused=true;g.placePlayer(...g.ch.start);g.syncDavid();g.cineOff();g.cineW=0;g.updateCamera(1);
      for(const a of g.actors){a.update(.016);a.m.root.updateMatrixWorld(true);}
      g.renderer.render(g.scene,g.camera);
      if(g.david.root.userData.storybookVisualVersion!==3||!g.david.head.children.some(x=>x.name==='storybook-head'))throw Error('Player bypasses approved simple portrait in chapter '+i);
      let invalid=0;g.scene.traverse(o=>{if(o.isMesh&&!o.matrixWorld.elements.every(Number.isFinite))invalid++;});
      chapters.push({i,id:g.ch.id,invalid,role:g.david.root.userData.storybookRole,profile:g.anthologyRenderProfile,actors:g.actors.length});
    }
    const ch=g.ch;g.applyEnv(ch.envNight);
    const night={extraLights:g.__anthologyWorld.lights.map(x=>x.light.intensity),focalVisible:g.sceneDirection.group.visible,windowGlow:g.__anthologyWorld.palaceGlow.emissiveIntensity};
    const originalPos=new T.Vector3(1,2,416),originalLook=new T.Vector3(0,1,414);const before=originalPos.toArray();g.reviewShot=null;g.cineTo(originalPos,originalLook,2);const cineInputUnchanged=JSON.stringify(before)===JSON.stringify(originalPos.toArray());
    for(let cycle=0;cycle<4;cycle++){
      for(const i of [6,8,9]){g.loadWorld(i);g.renderer.render(g.scene,g.camera);}
      reloads.push({...g.renderer.info.memory});
    }
    return {chapters,night,cineInputUnchanged,reloads,assets:g.graphicsAssets};
  });
  assert.equal(report.assets,'ready');assert.deepEqual(report.chapters.map(c=>c.id),[1,2,5,6,3,7,8,4,9,10]);assert.ok(report.chapters.every(c=>c.invalid===0&&c.role));
  assert.ok(report.night.extraLights.every(x=>x===0));assert.equal(report.night.focalVisible,false);assert.ok(report.night.windowGlow<=.12);assert.equal(report.cineInputUnchanged,true);
  assert.deepEqual(report.reloads.at(-1),report.reloads.at(-2));assert.deepEqual(errors,[]);console.log('GRAPHICS_REGRESSION_PASS',JSON.stringify(report));
}finally{await browser.close();}
