/** Explicitly staged art views. No story progression or save writes. */
export const REVIEW_CHAPTERS = [
  ['bethlehem','1 · 베들레헴'],['elah','2 · 엘라 골짜기'],['harp','3 · 수금과 창'],
  ['jonathan','4 · 요나단'],['engedi','5 · 엔게디'],['abigail','6 · 아비가일'],
  ['ziklag','7 · 시글락'],['ark','8 · 궤의 행렬'],['mephibosheth','9 · 왕의 식탁'],['nathan','10 · 나단']
];
export function openArtReview(game, shot = 'fold', ctx = {}) {
  const aliases={fold:'bethlehem',face:'bethlehem',david:'bethlehem',vista:'bethlehem',gameplay:'bethlehem',palace:'harp',king:'nathan'};
  const key=aliases[shot]||shot, found=REVIEW_CHAPTERS.findIndex(c=>c[0]===key),idx=found<0?0:found;
  game.loadWorld(idx);game.mode='play';game.paused=true;game.lock=true;game.audio.setMute(true);
  game.reviewShot=shot;game.reviewChapter=REVIEW_CHAPTERS[idx][0];
  for(const id of ['title','card','hud','help','menu','touch','dialog'])document.getElementById(id).hidden=true;
  document.getElementById('fade').style.opacity='0';
  const h=(x,z)=>game.groundAt(x,z),S=game.ch.s;
  const actor=(a,x,z,yaw=0,pose='auto',absoluteY=null)=>{
    if(!a)return;a.pos.set(x,absoluteY??h(x,z),z);a.yaw=yaw;a.dest=null;a.face=null;a.speed=0;a.m.root.visible=true;a.m.pose=pose;a.m.phase=0;a.m.t=0;a.m.update(1,0);a.sync();
  };
  let player=game.ch.start.slice(),eye=null,target=null,absolute=false;
  if(idx===0){
    player=shot==='gameplay'?[6,40,Math.PI]:[0,0,.45];
    eye=shot==='david'?[2.5,2.8,3.8]:shot==='vista'?[38,28,38]:[13,11,16];target=shot==='david'?[0,1.2,0]:[0,1,-5];
    S.sheep.forEach((s,i)=>actor(s.a,[-2,1,3,-4,0,4,2][i],[-6,-8,-5,-10,-11,-10,-3][i],[.4,1.2,-.5,2,.2,-1,.6][i]));
    if(shot==='face'){eye=[.62,2,1.05];target=[0,1.82,0];}
    if(shot==='gameplay')eye=null;
  } else if(idx===1){player=[-8,0,Math.PI/2];eye=[-18,9,16];target=[9,4,0];}
  else if(idx===2){
    game.applyEnv(game.ch.envIn);player=[1.5,410.6,-2.6];eye=[-5.4,3.2,412];target=[.55,1.4,409.1];absolute=true;
    actor(S.saulIn,0,S.P.throne.z,0,'sit',.6);
    if(S.spearIn){S.spearIn.position.x=-.3;S.spearIn.rotation.z=.22;}
    const harp=ctx.lyre?.();if(harp){harp.position.set(.1,.1,.25);harp.rotation.set(-.4,0,.3);game.david.handL.add(harp);}game.player.pose='play';
  } else if(idx===3){player=[0,-4,Math.PI];actor(S.jon,-1.8,-6,.5);eye=[6,4,3];target=[-1,1.3,-5];}
  else if(idx===4){player=[1,418,0];eye=[-5,3.5,412];target=[0,1.2,425];absolute=true;}
  else if(idx===5){player=[24,-19,Math.PI];actor(S.abi,26,-22,-.6,'point');S.donkeys.forEach((a,i)=>actor(a,30+i*1.8,-25-i*1.7,-.5));eye=[17,5,-11];target=[27,1.4,-22];}
  else if(idx===6){player=[4,38,Math.PI];eye=[19,13,60];target=[0,2,36];}
  else if(idx===7){player=[95,64,-2.1];for(const f of game.updaters)f(0);eye=[104,10,78];target=[92,2,60];}
  else if(idx===8){
    player=[0,409,0];eye=[6.7,3.7,426];target=[0,1.2,415];absolute=true;
    const seat=S.mephSeat;actor(S.meph,seat.x,seat.z,seat.yaw,'sit');S.princes.forEach(a=>actor(a,a.pos.x,a.pos.z,a.yaw,'sit'));
  } else if(idx===9){
    player=[0,414,.4];eye=[6,3.2,420];target=[.2,1.3,416];absolute=true;actor(S.nathan,.3,418,Math.PI,'point');
  }
  game.placePlayer(...player);game.syncDavid();game.david.t=0;game.david.phase=0;game.david.pose=game.player.pose;game.david.update(1,0);
  // Review only. All views use the same focal length for original/upgrade comparisons.
  game.camera.fov=shot==='face'?40:innerWidth<innerHeight?68:55;game.camera.updateProjectionMatrix();
  if(eye){
    const base=absolute?0:h(player[0],player[1]);
    game.cinePos.set(eye[0],absolute?eye[1]:Math.max(base+eye[1],h(eye[0],eye[2])+1.4),eye[2]);
    game.cineLook.set(target[0],base+target[1],target[2]);
    game.cine={pos:game.cinePos.clone(),look:game.cineLook.clone(),k:100};game.cineW=1;game.camera.position.copy(game.cinePos);game.camera.lookAt(game.cineLook);
  }else{game.cineOff();game.cineW=0;game.updateCamera(1);}
  game.setWaypoint(null);game.reviewReady=true;
  document.getElementById('art-review')?.remove();
  const bar=document.createElement('nav');bar.id='art-review';bar.setAttribute('aria-label','그래픽 비교');
  bar.style.cssText='position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:100;display:flex;gap:9px;align-items:center;padding:10px 14px;background:#162019ed;border:1px solid #ffffff25;border-radius:12px;font:12px system-ui;color:white;width:max-content;max-width:94vw;flex-wrap:wrap;justify-content:center';
  const label=document.createElement('span');label.textContent='정지 연출 · 그래픽 비교';bar.append(label);
  const select=document.createElement('select');select.setAttribute('aria-label','비교할 장');select.style.cssText='font:inherit;background:#2a352b;color:white;border:1px solid #68705e;padding:5px;border-radius:5px';
  for(const [k,name]of REVIEW_CHAPTERS){const o=document.createElement('option');o.value=k;o.textContent=name;o.selected=k===game.reviewChapter;select.append(o);}
  select.onchange=()=>{const u=new URL(location.href);u.searchParams.set('review',select.value);location.href=u.href;};bar.append(select);
  const legacy=new URLSearchParams(location.search).get('graphics')==='legacy';
  const compare=document.createElement('a'),url=new URL(location.href);if(legacy)url.searchParams.delete('graphics');else url.searchParams.set('graphics','legacy');compare.href=url.href;compare.textContent=legacy?'개선본 보기':'원본 보기';compare.style.color='#ffe0a2';bar.append(compare);
  const play=document.createElement('a');play.href=location.pathname;play.textContent='실제 게임';play.style.color='white';bar.append(play);
  document.body.append(bar);return{shot,chapter:game.reviewChapter,graphics:legacy?'legacy':'storybook'};
}

/** Rolling CPU/frame intervals, not a GPU benchmark or a phone performance claim. */
export function installFrameMetrics(game) {
  const metrics={frames:[],last:performance.now(),version:'ten-chapter-storybook'};
  const original=game.renderer.render.bind(game.renderer);
  game.renderer.render=(...args)=>{
    if (args[0] === game.scene) {
      const now=performance.now(),dt=now-metrics.last;metrics.last=now;
      if(!document.hidden && dt>0) { metrics.frames.push(dt); if(metrics.frames.length>600)metrics.frames.shift(); }
    }
    const result = original(...args);
    if (args[0] === game.scene && metrics.frames.length >= 120 && performance.now() - (metrics.published || 0) > 2000) {
      metrics.published = performance.now();
      game.canvas.dataset.graphicsMetrics = JSON.stringify(game.graphicsMetrics());
      game.canvas.dataset.graphicsAssets = game.graphicsAssets;
    }
    return result;
  };
  game.resetGraphicsMetrics=()=>{metrics.frames.length=0;metrics.last=performance.now();metrics.published=0;};
  game.graphicsMetrics=()=>{
    const sorted=metrics.frames.slice().sort((a,b)=>a-b),n=sorted.length;
    return {samples:n,medianMs:sorted[Math.floor(n*.5)]||0,p95Ms:sorted[Math.floor(n*.95)]||0,p99Ms:sorted[Math.floor(n*.99)]||0,maxMs:sorted[n-1]||0,drawCalls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,geometries:game.renderer.info.memory.geometries,textures:game.renderer.info.memory.textures,pixelRatio:game.renderer.getPixelRatio(),viewport:[innerWidth,innerHeight],quality:game.graphicsQuality||'default'};
  };
}
