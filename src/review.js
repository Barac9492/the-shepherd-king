/** Explicit opt-in art-review scenes. Never saves or advances story progress. */
export function openArtReview(game, shot = 'fold') {
  game.loadWorld(0);
  game.mode = 'play'; game.paused = true; game.lock = true;
  game.audio.setMute(true);
  for (const id of ['title','card','hud','help','menu','touch','dialog']) document.getElementById(id).hidden = true;
  const fade = document.getElementById('fade'); fade.style.opacity = '0';
  const h = (x,z) => game.groundAt(x,z);
  const shots = {
    fold: { player:[0,0,0.45], eye:[13,11,16], target:[0,1,-5] },
    david: { player:[0,0,0.55], eye:[2.5,2.8,3.8], target:[0,1.2,0] },
    vista: { player:[3,3,-0.7], eye:[38,28,38], target:[-6,2,-10] },
    gameplay: { player:[6,40,Math.PI], eye:null }
  };
  const key = Object.hasOwn(shots,shot) ? shot : 'fold', s = shots[key];
  game.placePlayer(...s.player); game.syncDavid();
  game.david.t = 0; game.david.phase = 0; game.david.update(0,0);
  // Fixed positions in review only: compare the same silhouettes across treatments.
  game.ch.s.sheep.forEach((sheep,i) => {
    const x = [-2,1,3,-4,0,4,2][i], z = [-6,-8,-5,-10,-11,-10,-3][i];
    sheep.a.pos.set(x,h(x,z),z); sheep.a.yaw = [0.4,1.2,-0.5,2,0.2,-1,0.6][i];
    sheep.a.dest = null; sheep.a.sync(); sheep.a.m.phase = 0; sheep.a.m.t = 0;
    sheep.a.m.update(0,0);
  });
  if(s.eye) {
    const base = h(s.player[0],s.player[1]);
    game.cinePos.set(s.eye[0],Math.max(base+s.eye[1],h(s.eye[0],s.eye[2])+1.4),s.eye[2]);
    game.cineLook.set(s.target[0],base+s.target[1],s.target[2]);
    game.cine = {pos:game.cinePos.clone(),look:game.cineLook.clone(),k:100}; game.cineW = 1;
    game.camera.position.copy(game.cinePos); game.camera.lookAt(game.cineLook);
  } else { game.cineOff(); game.cineW = 0; game.updateCamera(1); }
  game.setWaypoint(null);
  const old = document.getElementById('art-review'); if(old) old.remove();
  const bar=document.createElement('nav'); bar.id='art-review'; bar.setAttribute('aria-label','Graphics review');
  Object.assign(bar.style,{position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',zIndex:100,display:'flex',gap:'7px',alignItems:'center',padding:'10px 14px',background:'rgba(22,30,24,.88)',border:'1px solid #ffffff25',borderRadius:'12px',font:'12px system-ui',color:'#fff',maxWidth:'95vw',flexWrap:'wrap',justifyContent:'center'});
  const label=document.createElement('span'); label.textContent = 'ART REVIEW'; label.style.letterSpacing='.1em'; bar.append(label);
  for(const [k,text] of [['fold','Sheepfold'],['david','David'],['vista','Landscape'],['gameplay','Play camera']]) {
    const a=document.createElement('a'); const url=new URL(location.href);url.searchParams.set('review',k);a.href=url.href; a.textContent=text;
    a.style.cssText=`color:${key===k?'#ffe0a2':'#c4cec2'};text-decoration:none;padding:4px`;bar.append(a);
  }
  const compare=document.createElement('a'), compareURL=new URL(location.href);
  const legacy=compareURL.searchParams.get('graphics')==='legacy';
  if(legacy) compareURL.searchParams.delete('graphics');else compareURL.searchParams.set('graphics','legacy');
  compare.href=compareURL.href; compare.textContent=legacy?'View upgrade':'View original';compare.style.cssText='color:#fff;padding:4px';bar.append(compare);
  const play=document.createElement('a');play.href=location.pathname;play.textContent='Play game';play.style.cssText='color:#ffe0a2;padding:4px';bar.append(play);
  document.body.append(bar);
  game.reviewShot = key;
  return {shot:key,graphics:legacy?'legacy':'storybook'};
}

/** Rolling CPU/frame intervals, not a GPU benchmark or a phone performance claim. */
export function installFrameMetrics(game) {
  const metrics={frames:[],last:performance.now(),version:'chapter-one-storybook'};
  const original=game.renderer.render.bind(game.renderer);
  game.renderer.render=(...args)=>{
    if (args[0] === game.scene) {
      const now=performance.now(),dt=now-metrics.last;metrics.last=now;
      if(!document.hidden && dt>0 && dt<1000) { metrics.frames.push(dt); if(metrics.frames.length>600)metrics.frames.shift(); }
    }
    const result = original(...args);
    if (args[0] === game.scene && metrics.frames.length >= 120 && performance.now() - (metrics.published || 0) > 2000) {
      metrics.published = performance.now();
      game.canvas.dataset.graphicsMetrics = JSON.stringify(game.graphicsMetrics());
      game.canvas.dataset.graphicsAssets = game.graphicsAssets;
    }
    return result;
  };
  game.graphicsMetrics=()=>{
    const sorted=metrics.frames.slice().sort((a,b)=>a-b),n=sorted.length;
    return {samples:n,medianMs:sorted[Math.floor(n*.5)]||0,p95Ms:sorted[Math.floor(n*.95)]||0,drawCalls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,geometries:game.renderer.info.memory.geometries,textures:game.renderer.info.memory.textures,pixelRatio:game.renderer.getPixelRatio(),viewport:[innerWidth,innerHeight],quality:game.graphicsQuality||'default'};
  };
}
