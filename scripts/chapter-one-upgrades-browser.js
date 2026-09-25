export async function checkChapterOneUpgrades(){
 const g=window.GAME;if(!g)throw Error('GAME not ready');const results=[];
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 const check=(name,fn)=>{try{const detail=fn();results.push({name,pass:true,detail});}catch(e){results.push({name,pass:false,error:e.stack||String(e)});}};
 const nativeCamera=Object.getPrototypeOf(g).updateCamera;
 check('Production starts with original A and real Chapter1 adapters, no comparison or imported model',()=>{
  g.loadWorld(0);g.mode='play';g.paused=true;g.placePlayer(...g.ch.start);assert(g.chapterOneUpgrades?.version==='1.0.0','missing adapter');assert(!g.comparison,'comparison leaked into production');assert(g.david.root.visible&&g.david.root.userData.storybookVisualVersion===3,'original A missing');assert(!g.scene.getObjectByName('comparison-kaykit-player-anchor'),'imported character present');
 });
 check('David and hand identities survive steering, cinematic updates and adapter disposal',()=>{
  const bundle=g.chapterOneUpgrades,david=g.david,root=david.root,left=david.handL,right=david.handR;
  const pose=g.player.pos.clone();g.cineTo(pose.clone().add({x:6,y:4,z:5}),pose.clone().add({x:0,y:1,z:0}),2.5);
  for(let i=0;i<60;i++){g.updateCamera(1/60);g.david.update(1/60,0);}
  assert(g.david===david&&g.david.root===root&&g.david.handL===left&&g.david.handR===right,'character or hands replaced');
  assert(bundle.camera.diagnostics.transitions>0,'cinematic not controlled');bundle.dispose();
  assert(g.david===david&&g.david.handL===left&&g.david.handR===right,'dispose replaced character');assert(g.updateCamera===nativeCamera,'camera method not restored');return {visualVersion:root.userData.storybookVisualVersion,handIdentity:true};
 });
 check('Scripted lamb remains native and ordinary followers reach fold under original state rules',()=>{
  g.loadWorld(0);g.mode='play';g.paused=true;g.lock=false;g.placePlayer(-4,30,0);const S=g.ch.s,b=g.chapterOneUpgrades;
  assert(!b.sheep.records.some(r=>r.state===S.lamb),'lamb wrapped');const s=S.sheep[0];s.a.pos.copy(g.player.pos);s.a.dest=null;
  for(const f of g.updaters)f(.016);assert(s.st==='follow','native follow rule broken');
  const start=s.a.pos.clone();s.a.dest=s.a.pos.clone().add({x:4,y:0,z:0});s.a.walkSpeed=3;s.a.update(.2);assert(s.a.pos.distanceTo(start)>.01,'Yuka did not move follower');
  s.a.pos.set(0,g.groundAt(0,-8),-8);for(const f of g.updaters)f(.016);assert(s.st==='fold'&&S.inFold===1,'fold count broken');return{inFold:S.inFold,eligibleFrames:b.sheep.diagnostics.eligibleFrames};
 });
 check('Chapter reload disposes actor and camera wrappers and callbacks do not accumulate',()=>{
  const samples=[];let expected=null;
  for(let i=0;i<5;i++){
   g.loadWorld(0);const old=g.chapterOneUpgrades,records=old.sheep.records.map(r=>({actor:r.actor,original:r.originalUpdate,own:r.hadOwnUpdate}));const callbacks=g.chapterDisposers.length;
   if(expected===null)expected=callbacks;assert(callbacks===expected,'cleanup callbacks accumulated');
   g.renderer.render(g.scene,g.camera);samples.push({...g.renderer.info.memory,callbacks});
   g.loadWorld(1);assert(old.diagnostics.disposed&&!g.chapterOneUpgrades,'old bundle alive');assert(g.updateCamera===nativeCamera,'camera wrapper retained');
   for(const r of records){assert(r.actor.update===r.original,'actor wrapper retained');assert(Object.hasOwn(r.actor,'update')===r.own,'actor own-property changed');}
   assert(g.david.root.visible&&g.david.handL&&g.david.handR,'new chapter character incomplete');
  }
  assert(samples.at(-1).geometries<=samples[1].geometries+4,'geometries accumulated');assert(samples.at(-1).textures<=samples[1].textures+1,'textures accumulated');return samples;
 });
 check('All other chapters retain original character and have no upgrade bundle',()=>{
  const ids=[];for(let i=1;i<10;i++){g.loadWorld(i);assert(!g.chapterOneUpgrades,'upgrade leaked to chapter '+i);assert(g.updateCamera===nativeCamera,'camera leaked to chapter '+i);assert(g.david.root.visible&&g.david.root.userData.storybookVisualVersion===3,'A changed in chapter '+i);ids.push(g.ch.id);}return ids;
 });
 g.loadWorld(0);g.mode='play';g.paused=true;g.placePlayer(...g.ch.start);g.cineOff();g.cineW=0;g.updateCamera(1);g.renderer.render(g.scene,g.camera);
 return {passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,scope:'Assisted actual-browser production integration checks, not a complete human playthrough'};
}
if(typeof window!=='undefined')window.checkChapterOneUpgrades=checkChapterOneUpgrades;
