import {createRearShepherd} from './my-shepherd-character.js';
import {PSALM23_END} from './psalm23.js';
const EN_KO=(en,ko)=>({en,ko});
const finite=n=>Number.isFinite(n)?n:0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function makeMaterial(THREE,color,roughness=.86){return new THREE.MeshStandardMaterial({color,roughness,metalness:0,flatShading:true});}
function mesh(THREE,geometry,material,name){const value=new THREE.Mesh(geometry,material);value.name=name;value.castShadow=true;value.receiveShadow=true;return value;}
function addWorld(g,object){if(g.add)return g.add(object);g.root.add(object);return object;}
function translated(deps,value){
  if(deps.translate){try{return deps.translate(value);}catch(_){}}
  const lang=deps.getLanguage?.()||'ko';return value?.[lang]??value?.ko??value?.en??String(value??'');
}


function buildScenery(THREE,g,chapter,S){
  const stone=makeMaterial(THREE,0x9e927a),pathMat=makeMaterial(THREE,0xc8ad78),trunk=makeMaterial(THREE,0x6d5132),leaf=makeMaterial(THREE,0x718052),flower=makeMaterial(THREE,0xd9b767);S.ownedMaterials.push(stone,pathMat,trunk,leaf,flower);
  const fold=new THREE.Group();fold.name='ten-sheep-fold';
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a-Math.PI/2),Math.cos(a-Math.PI/2)))<.36)continue;
    const r=5.4,x=S.fold.x+Math.cos(a)*r,z=S.fold.z+Math.sin(a)*r;
    const rock=mesh(THREE,new THREE.DodecahedronGeometry(.48+(i%3)*.05,0),stone,'fold-stone');rock.position.set(x,g.groundAt(x,z)+.35,z);rock.scale.y=.72;fold.add(rock);
  }
  addWorld(g,fold);
  const path=new THREE.Group();path.name='readable-forgiving-trail';
  const points=[chapter.start.slice(0,2),...S.route.map(p=>[p.x,p.z]),[S.fold.x,S.fold.z]];S.trailPoints=points.map(([x,z])=>({x,z}));
  for(let p=0;p<points.length-1;p++){
    const [ax,az]=points[p],[bx,bz]=points[p+1],length=Math.hypot(bx-ax,bz-az),steps=Math.max(2,Math.ceil(length/2.4));
    for(let i=0;i<=steps;i++){
      const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      const mark=mesh(THREE,new THREE.CircleGeometry(.22,7),pathMat,'trail-marker');mark.rotation.x=-Math.PI/2;mark.position.set(x,g.groundAt(x,z)+.025,z);mark.receiveShadow=false;path.add(mark);
    }
  }
  addWorld(g,path);
  const grove=new THREE.Group();grove.name='warm-pasture-grove';
  const trees=[[-25,8],[-18,-18],[18,13],[25,-9],[-2,-31],[31,-27],[-33,-14]];
  for(const [x,z]of trees){const t=mesh(THREE,new THREE.CylinderGeometry(.13,.2,1.7,6),trunk,'olive-trunk');t.position.set(x,g.groundAt(x,z)+.85,z);grove.add(t);const crown=mesh(THREE,new THREE.IcosahedronGeometry(.9,1),leaf,'olive-crown');crown.position.set(x,g.groundAt(x,z)+1.9,z);crown.scale.set(1.2,.72,1);grove.add(crown);}
  for(let i=0;i<28;i++){const a=i*2.399,d=8+(i%7)*4.1,x=Math.cos(a)*d,z=Math.sin(a)*d-4;const bloom=mesh(THREE,new THREE.OctahedronGeometry(.07,0),flower,'pasture-bloom');bloom.position.set(x,g.groundAt(x,z)+.1,z);grove.add(bloom);}
  addWorld(g,grove);
}

function setPhase(g,S,phase){
  if(S.phase===phase)return;S.phase=phase;S.phaseClock=0;S.history.push(phase);S.diagnostics.transitions++;
  if(phase==='return_nine'){g.setWaypoint?.(S.fold);g.setObjective?.(EN_KO('Bring the nine safely into the fold','아홉 마리를 우리 안으로 데려오기'),'9/10');}
  if(phase==='nine_safe'){g.setWaypoint?.(null);g.setObjective?.(EN_KO('Nine are safe. One is still missing.','아홉 마리는 안전해요. 한 마리가 아직 보이지 않아요.'),'9/10');}
  if(phase==='lost_call'){g.setWaypoint?.(null);g.setObjective?.(EN_KO('You are alone. Call out.','혼자 남겨졌어요. 소리를 내어 불러 보세요.'),'9/10');}
  if(phase==='seeking')g.setObjective?.(EN_KO('He heard you. Wait without fear.','목자가 내 소리를 들었어요.'),'9/10');
  if(phase==='returning')g.setObjective?.(EN_KO('The shepherd carries you home.','목자가 나를 안고 돌아갑니다.'),'9/10');
  if(phase==='complete'){g.setWaypoint?.(null);g.setObjective?.(EN_KO('All ten are home.','열 마리가 모두 돌아왔어요.'),'10/10');}
}

function menuVisible(){return typeof document!=='undefined'&&document.getElementById('menu')?.hidden===false;}
function callAllowed(g,S){return !S.cancelled&&!S.called&&['lost_call','seeking'].includes(S.phase)&&S.token===g.tok&&g.ch===S.chapter&&g.mode==='play'&&!g.paused&&!g.dq&&!menuVisible();}
function removeCallControls(S){
  const ui=S.ui;if(ui.callButton&&ui.onCallClick)ui.callButton.removeEventListener?.('click',ui.onCallClick);ui.callPanel?.remove?.();ui.callPanel=null;ui.callHint=null;ui.callButton=null;ui.onCallClick=null;
  if(typeof document!=='undefined'&&ui.oldActionLabel!=null){const label=document.getElementById('tActL');if(label)label.textContent=ui.oldActionLabel;}
}
function syncCallControls(deps,g,S,on){
  if(!on||!callAllowed(g,S)){removeCallControls(S);return;}
  if(typeof document==='undefined')return;const label=document.getElementById('tActL');
  if(label){if(S.ui.oldActionLabel==null)S.ui.oldActionLabel=label.textContent;label.textContent=translated(deps,EN_KO('Call out','불러보기'));}
  if(S.ui.callButton)return;
  const panel=document.createElement('div');panel.id='my-shepherd-call';panel.setAttribute('role','status');Object.assign(panel.style,{position:'fixed',left:'50%',bottom:'max(12px, env(safe-area-inset-bottom))',transform:'translateX(-50%)',zIndex:'29',display:'grid',gap:'.5rem',width:'min(18rem, calc(100vw - 24px))',maxWidth:'calc(100vw - 24px)',padding:'.65rem',boxSizing:'border-box',border:'1px solid rgba(244,217,148,.55)',background:'rgba(18,20,22,.9)',color:'#f1ead9',font:'600 .86rem system-ui',borderRadius:'6px',textAlign:'center',whiteSpace:'normal',overflowWrap:'anywhere',pointerEvents:'none'});
  const hint=document.createElement('div');hint.textContent=translated(deps,deps.getTouch?.()?EN_KO('Tap the button below to call out.','아래 버튼을 눌러 불러 보세요.'):EN_KO('E / Space or the button below','E / 스페이스 또는 아래 버튼'));hint.style.lineHeight='1.35';
  const button=document.createElement('button');button.type='button';button.textContent=translated(deps,EN_KO('Call out','불러보기'));button.setAttribute('aria-label',button.textContent);Object.assign(button.style,{appearance:'none',width:'100%',minHeight:'48px',padding:'.72rem 1rem',border:'1px solid rgba(244,217,148,.8)',borderRadius:'5px',background:'#e4b95a',color:'#1b1608',font:'700 1rem system-ui',whiteSpace:'normal',pointerEvents:'auto',touchAction:'manipulation'});
  const onCallClick=e=>{e?.preventDefault?.();e?.stopPropagation?.();if(!callAllowed(g,S)){if(g.input)g.input.act=false;removeCallControls(S);return;}if(!g.input||g.input.act)return;g.input.act=true;S.diagnostics.buttonActivations++;};
  button.addEventListener('click',onCallClick);panel.appendChild(hint);panel.appendChild(button);document.body.appendChild(panel);S.ui.callPanel=panel;S.ui.callHint=hint;S.ui.callButton=button;S.ui.onCallClick=onCallClick;
}

function moveFollowers(THREE,g,S,dt){
  const f=new THREE.Vector3(Math.sin(g.player.yaw),0,Math.cos(g.player.yaw)),r=new THREE.Vector3(f.z,0,-f.x),alpha=1-Math.exp(-clamp(dt,0,.1)*5.5);
  const following=S.sheep.filter(x=>x.state==='following');
  following.forEach((entry,i)=>{const row=Math.floor(i/3),side=(i%3-1)*1.15,target=g.player.pos.clone().addScaledVector(f,-1.8-row*1.25).addScaledVector(r,side);target.y=g.groundAt(target.x,target.z);const before=entry.actor.pos.clone();entry.actor.pos.lerp(target,alpha);const dx=entry.actor.pos.x-before.x,dz=entry.actor.pos.z-before.z;if(Math.hypot(dx,dz)>.001)entry.actor.yaw=Math.atan2(dx,dz);entry.actor.speed=Math.hypot(dx,dz)/Math.max(dt,.001);entry.actor.sync();});
}
function moveShepherdWithPlayer(g,S){S.shepherd.dest=null;S.shepherd.pos.copy(g.player.pos);S.shepherd.yaw=g.player.yaw;S.shepherd.speed=g.player.speed||0;S.shepherd.sync();}
function parkNine(g,S){
  const slots=[[-2.1,-1.3],[0,-1.7],[2.1,-1.3],[-2.8,.5],[-.9,.2],[1,.2],[2.8,.5],[-1.5,2],[1.5,2]];
  S.sheep.forEach((entry,i)=>{entry.state='safe';entry.actor.stop?.();entry.actor.dest=null;entry.actor.speed=0;entry.actor.pos.set(S.fold.x+slots[i][0],g.groundAt(S.fold.x+slots[i][0],S.fold.z+slots[i][1]),S.fold.z+slots[i][1]);entry.actor.yaw=Math.PI+(i%3-1)*.28;entry.actor.sync();entry.safePosition=entry.actor.pos.clone();});
  S.nineSafe=true;S.safeCount=9;S.diagnostics.nineParkedAt=S.phaseClock;
}
function beginLostView(g,S){
  S.control='lost-sheep';S.viewpoint='lost-sheep';S.povActive=true;g.lock=true;g.player.pos.copy(S.lastActor.pos);g.player.yaw=S.lastActor.yaw;g.player.speed=0;g.syncDavid?.();S.lastActor.m.root.visible=false;
  const dx=S.last.x-S.fold.x,dz=S.last.z-S.fold.z,d=Math.hypot(dx,dz)||1;S.stage.set(S.last.x-dx/d*3.2,0,S.last.z-dz/d*3.2);S.stage.y=g.groundAt(S.stage.x,S.stage.z);
  S.shepherd.dest=S.stage.clone();S.shepherd.walkSpeed=2.65;setPhase(g,S,'lost_call');syncCallControls(S.deps,g,S,true);
}
function acceptCall(g,S){
  if(S.called)return;S.called=true;S.callCount++;S.diagnostics.acceptedActions++;g.audio?.sfx?.('baa');S.lastCallText=EN_KO('Baa...','메에에.');g.toast?.(translated(S.deps,S.lastCallText),translated(S.deps,EN_KO('The shepherd turns toward the sound.','목자가 그 소리를 향해 옵니다.')),2.2);S.shepherd.dest=S.lastActor.pos.clone();S.shepherd.walkSpeed=2.35;setPhase(g,S,'seeking');syncCallControls(S.deps,g,S,false);
}
function pickUpLast(THREE,g,S){
  if(S.carrying)return;S.carrying=true;S.lastActor.stop?.();S.lastActor.dest=null;const i=g.actors.indexOf(S.lastActor);if(i>=0)g.actors.splice(i,1);S.lastActor.m.root.visible=false;
  const carry=S.makeQuadruped('sheep',{scale:.64});carry.root.name='carried-lost-sheep';carry.root.position.set(0,0,0);carry.root.rotation.set(-.15,Math.PI/2,0);S.shepherd.m.setCarrying(true);S.shepherd.m.carryAnchor.add(carry.root);S.carryModel=carry;
  S.revealText=EN_KO('You came to find me.','나를 찾으러 오셨구나.');g.toast?.(translated(S.deps,S.revealText),'',3.4);setPhase(g,S,'retrieved');
}
function finish(g,S){
  if(S.completed)return;S.completed=true;S.returned=10;S.safeCount=10;S.control='shepherd-carried-sheep';g.lock=false;setPhase(g,S,'complete');S.resolve?.({completed:true});S.resolve=null;
}

function updateChapter(THREE,g,S,dt){
  dt=clamp(finite(dt),0,.1);S.phaseClock+=dt;S.elapsed+=dt;
  const valid=S.token===g.tok&&!S.cancelled&&g.ch===S.chapter;if(!valid){if(g.input)g.input.act=false;syncCallControls(S.deps,g,S,false);return false;}
  const pov=['lost_call','seeking'].includes(S.phase)&&!S.carrying,visible=['play','review','graphicsReview','intro','introCard','endCard','title'].includes(g.mode)&&!pov;S.shepherd.m.root.visible=visible;
  const blocked=g.mode!=='play'||g.paused||g.dq||menuVisible();
  if(blocked){if(g.input)g.input.act=false;syncCallControls(S.deps,g,S,false);return true;}
  if(S.phase==='gather'||S.phase==='return_nine')moveShepherdWithPlayer(g,S);
  if(S.phase==='gather'){
    moveFollowers(THREE,g,S,dt);const current=S.sheep[S.nextIndex];
    if(current&&dist2(g.player.pos,current.actor.pos)<3.15&&g.input?.act){g.input.act=false;current.state='following';S.collected++;S.nextIndex++;S.diagnostics.acceptedActions++;g.setObjective?.(EN_KO('Follow the marked trail and gather the flock','표시된 길을 따라 양 떼를 모으기'),`${S.collected}/10`);const next=S.sheep[S.nextIndex];g.setWaypoint?.(next?next.actor.pos:S.fold);if(S.collected===9)setPhase(g,S,'return_nine');}
  }else if(S.phase==='return_nine'){
    moveFollowers(THREE,g,S,dt);if(dist2(g.player.pos,S.fold)<3.8){parkNine(g,S);setPhase(g,S,'nine_safe');g.lock=true;}
  }else if(S.phase==='nine_safe'){
    if(S.phaseClock>.85)beginLostView(g,S);
  }else if(S.phase==='lost_call'||S.phase==='seeking'){
    syncCallControls(S.deps,g,S,!S.called);if(g.input?.act){g.input.act=false;acceptCall(g,S);}
    if(S.called&&dist2(S.shepherd.pos,S.lastActor.pos)<1.15)pickUpLast(THREE,g,S);
  }else if(S.phase==='retrieved'){
    if(S.phaseClock>.9){S.shepherd.dest=new THREE.Vector3(S.fold.x,0,S.fold.z+1.5);S.shepherd.dest.y=g.groundAt(S.shepherd.dest.x,S.shepherd.dest.z);S.shepherd.walkSpeed=2.55;setPhase(g,S,'returning');}
  }else if(S.phase==='returning'){
    if(dist2(S.shepherd.pos,S.fold)<2.4)finish(g,S);
  }
  if(S.nineSafe){let drift=0;for(const entry of S.sheep)if(entry.safePosition)drift=Math.max(drift,entry.actor.pos.distanceTo(entry.safePosition));S.diagnostics.maxSafeSheepDrift=Math.max(S.diagnostics.maxSafeSheepDrift,drift);}
  return true;
}

export function createMyShepherdChapter({THREE,Actor,makeQuadruped,makeHuman,getLanguage=()=> 'ko',getTouch=()=>false,translate}={}){
  if(!THREE||!Actor||!makeQuadruped||!makeHuman)throw new TypeError('THREE, Actor, makeQuadruped, and makeHuman are required');
  const deps={getLanguage,getTouch,translate};
  const chapter={
    id:11,hebrew:'יא',mood:'pasture',
    ref:EN_KO('Luke 15:3–7 · John 10:11','누가복음 15:3–7 · 요한복음 10:11'),
    title:EN_KO('My Shepherd','나의 목자'),
    verse:{text:EN_KO('The good shepherd does not treat the missing one as a number. He goes out, finds it, and carries it home.','선한 목자는 보이지 않는 한 마리를 숫자로 넘기지 않습니다. 직접 찾아 나서서 품에 안고 돌아옵니다.'),cite:EN_KO('Inspired paraphrase · Luke 15:3–7; John 10:11','내용을 풀어쓴 말 · 누가복음 15:3–7; 요한복음 10:11')},
    note:EN_KO('This scene adapts Luke’s lost-sheep parable with ten sheep. Bring the sheep into the fold.','누가복음의 잃은 양 비유를 열 마리 양으로 각색했습니다. 양들을 우리로 데려와 주세요.'),
    endVerse:PSALM23_END,
    endNote:EN_KO('The last sheep was not someone else. I was the one being sought, lifted, and carried home.','마지막 한 마리는 다른 누군가가 아니었습니다. 찾아오신 품에 안겨 돌아온 그 양은 나였습니다.'),
    questions:null,
    env:{top:0x668db0,horizon:0xf4d6a2,bottom:0x8b7652,sunDir:[-.48,.42,-.5],sunColor:0xffddb0,sunInt:2.55,glow:.48,hemiSky:0xc4d8e2,hemiGround:0x786b46,hemiInt:.62,fog:0xe8d5af,fogNear:55,fogFar:230,exposure:1.02,envInt:.48,motes:0xffedbd,moteSize:.09,moteOpacity:.55},
    start:[-25,20,2.35],titleCam:[0,-5],size:150,seg:96,camScale:1,
    grassN:9500,grassR:65,grassTint:[0x789553,0xc0ad69],
    height(x,z){return Math.sin(x*.055)*.42+Math.cos(z*.05)*.34+Math.sin((x+z)*.027)*.38+Math.max(0,(Math.hypot(x,z)-42)*.018);},
    groundColor(c,x,y,z,steep){c.set(0x8ca55c).lerp(new THREE.Color(0xc7ad6a),clamp(.35+.3*Math.sin(x*.08)+.2*Math.cos(z*.07),0,1));if(steep>.12)c.lerp(new THREE.Color(0x95866d),clamp(steep*2.2,0,.6));if(Math.abs(x)<4&&z<4)c.lerp(new THREE.Color(0xb9a074),.12);},
    grass(x,z){const fold=Math.hypot(x,z+4);return fold<7?0:Math.hypot(x,z)>66?.2:.82;},
    bound(x,z){const r=Math.hypot(x,z);return r>68?[x*68/r,z*68/r]:[x,z];},
    build(g){
      const route=[[-20,15],[-14,10],[-8,6],[-1,4],[7,1],[12,-5],[8,-11],[1,-14],[-6,-10]].map(([x,z])=>new THREE.Vector3(x,g.groundAt(x,z),z));
      const fold=new THREE.Vector3(0,g.groundAt(0,-4),-4),last=new THREE.Vector3(27,g.groundAt(27,-25),-25);
      const oldDavidVisible=g.david?.root?.visible??true,oldCamera={yaw:g.cam?.yaw,pitch:g.cam?.pitch,dist:g.cam?.dist,target:g.cam?.tgt?.clone?.(),position:g.camera?.position?.clone?.(),look:g.camLook?.clone?.()},oldInput={lookX:g.input?.lookX,lookY:g.input?.lookY,zoom:g.input?.zoom},oldLock=!!g.lock;
      const S=this.s={chapter:this,phase:'gather',history:['gather'],phaseClock:0,elapsed:0,token:g.tok,cancelled:false,completed:false,collected:0,safeCount:0,returned:0,total:10,nextIndex:0,nineSafe:false,called:false,callCount:0,carrying:false,control:'shepherd',viewpoint:'shepherd',route,fold,last,stage:new THREE.Vector3(),sheep:[],ownedMaterials:[],materialsDisposed:false,trailPoints:[],ui:{oldActionLabel:null,callPanel:null,callHint:null,callButton:null,onCallClick:null},deps,makeQuadruped,diagnostics:{transitions:0,acceptedActions:0,buttonActivations:0,ownedMaterialDisposals:0,maxSafeSheepDrift:0,nineParkedAt:null,camera:{samples:0,minBehindDot:1,behindDot:1,mode:null,aspect:null}},resolve:null};
      S.promise=new Promise(resolve=>{S.resolve=resolve;});
      if(g.david?.root)g.david.root.visible=false;
      S.shepherd=new Actor(g,createRearShepherd({THREE,makeHuman}),chapter.start[0],chapter.start[1],chapter.start[2]);S.shepherd.m.root.userData.chapter11=true;S.ownedMaterials.push(...S.shepherd.m.ownedMaterials);
      route.forEach((p,i)=>{const actor=new Actor(g,makeQuadruped('sheep',{scale:.82+(i%3)*.06}),p.x,p.z,Math.PI+(i%2?.35:-.35));actor.m.graze=.7;S.sheep.push({actor,state:'waiting',index:i,safePosition:null});});
      S.lastActor=new Actor(g,makeQuadruped('sheep',{scale:.66}),last.x,last.z,-2.2);S.lastActor.m.graze=.2;S.lastActor.m.root.name='last-stranded-sheep';S.lastActor.m.root.visible=false;
      buildScenery(THREE,g,chapter,S);g.setWaypoint?.(S.sheep[0].actor.pos);g.setObjective?.(getTouch()?EN_KO('Follow the trail. Near a sheep, tap the hand button.','표시된 길을 따라가세요. 양 가까이에서 오른쪽 손 버튼을 누르세요.'):EN_KO('Follow the marked trail. Approach each sheep and press E / Space.','표시된 길을 따라가세요. 양 가까이에서 E / 스페이스를 누르세요.'),'0/10');
      S.updater=dt=>updateChapter(THREE,g,S,dt);g.every?.(S.updater);
      const cleanup=()=>{if(S.cancelled)return;S.cancelled=true;if(!S.completed){S.phase='cancelled';S.history.push('cancelled');S.resolve?.({cancelled:true});S.resolve=null;}syncCallControls(deps,g,S,false);S.shepherd.m.disposeDetachedVisuals?.();if(!S.materialsDisposed){S.materialsDisposed=true;for(const material of S.ownedMaterials){material.dispose();S.diagnostics.ownedMaterialDisposals++;}}if(g.david?.root)g.david.root.visible=oldDavidVisible;if(g.cam){if(oldCamera.target&&g.cam.tgt)g.cam.tgt.copy(oldCamera.target);if(Number.isFinite(oldCamera.yaw))g.cam.yaw=oldCamera.yaw;if(Number.isFinite(oldCamera.pitch))g.cam.pitch=oldCamera.pitch;if(Number.isFinite(oldCamera.dist))g.cam.dist=oldCamera.dist;}if(oldCamera.position&&g.camera?.position)g.camera.position.copy(oldCamera.position);if(oldCamera.look&&g.camLook)g.camLook.copy(oldCamera.look);g.lock=oldLock;if(g.input){g.input.act=false;if(Number.isFinite(oldInput.lookX))g.input.lookX=oldInput.lookX;if(Number.isFinite(oldInput.lookY))g.input.lookY=oldInput.lookY;if(Number.isFinite(oldInput.zoom))g.input.zoom=oldInput.zoom;}};
      S.cleanup=cleanup;g.onChapterCleanup?.(cleanup);
    },
    async run(g){const S=this.s;if(!S)throw new Error('My Shepherd chapter must be built before run');await S.promise;}
  };
  Object.defineProperty(chapter,'_myShepherdTHREE',{value:THREE});
  return chapter;
}

export function installMyShepherdCamera({Game,chapter,THREE}={}){
  if(!Game||!chapter)throw new TypeError('Game and chapter are required');
  THREE=THREE||chapter._myShepherdTHREE||globalThis.THREE;
  if(!THREE)throw new TypeError('THREE is required');
  const prior=Game.prototype.updateCamera;
  if(prior?.__myShepherdChapter===chapter)return prior;
  // The rendered rear camera follows the actor. It must not feed that new
  // heading back into a held sideways gesture, otherwise D/A spin forever.
  const priorPlayer=Game.prototype.updatePlayer;
  if(typeof priorPlayer==='function'){
    function updateShepherdPlayer(dt){
      const S=this.ch===chapter&&chapter.s;
      if(!S||S.cancelled)return priorPlayer.call(this,dt);
      const blocked=this.mode!=='play'||this.paused||this.lock||this.dq;
      const move=blocked?null:this.input?.moveVec?.();
      if(!move||move.m<=.05){S.moveYaw=null;return priorPlayer.call(this,dt);}
      if(!Number.isFinite(S.moveYaw))S.moveYaw=this.cam.yaw;
      const renderedYaw=this.cam.yaw;this.cam.yaw=S.moveYaw;
      try{return priorPlayer.call(this,dt);}finally{this.cam.yaw=renderedYaw;}
    }
    updateShepherdPlayer.__myShepherdOriginal=priorPlayer;
    Game.prototype.updatePlayer=updateShepherdPlayer;
  }
  const applyRearFrame=game=>{
    const S=game.ch===chapter&&chapter.s;if(!S?.shepherd?.m?.root||S.cancelled)return false;
    if(game.mode!=='play'||game.paused||game.lock||game.dq)S.moveYaw=null;
    const actor=S.shepherd,yaw=finite(actor.yaw),forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),aspect=finite(game.camera?.aspect)||1;
    const portrait=aspect<.78,lostView=['lost_call','seeking'].includes(S.phase)&&!S.carrying,travel=S.phase==='returning',carrying=S.phase==='retrieved'||S.phase==='returning'||S.phase==='complete';
    let pos,look,behindDot=1;
    if(lostView){
      actor.m.root.visible=false;S.lastActor.m.root.visible=false;
      const away=S.lastActor.pos.clone().sub(actor.pos);away.y=0;if(away.lengthSq()<1e-6)away.set(Math.sin(S.lastActor.yaw),0,Math.cos(S.lastActor.yaw));else away.normalize();
      const right=new THREE.Vector3(away.z,0,-away.x);pos=S.lastActor.pos.clone().addScaledVector(right,portrait?0:.16);pos.y=(game.groundAt?.(pos.x,pos.z)??S.lastActor.pos.y)+.48;
      look=pos.clone().addScaledVector(away,8);look.y=(game.groundAt?.(look.x,look.z)??pos.y)+.72;
      S.diagnostics.camera.viewpoint='lost-sheep';S.diagnostics.camera.povDistance=pos.distanceTo(S.lastActor.pos);S.diagnostics.camera.povHeight=pos.y-(game.groundAt?.(pos.x,pos.z)??0);
    }else{
      actor.m.root.visible=true;const distance=travel?(portrait?7.8:9.4):(portrait?5.8:7.1),height=travel?(portrait?2.25:2.65):(portrait?2.05:2.4);
      pos=actor.pos.clone().addScaledVector(forward,-distance);pos.y=Math.max((game.groundAt?.(pos.x,pos.z)??0)+.7,actor.pos.y+height);
      look=actor.pos.clone().addScaledVector(forward,carrying?1.4:2.3);look.y=actor.pos.y+(carrying?1.28:1.18);
      const view=pos.clone().sub(actor.pos).normalize();behindDot=-view.dot(forward);S.diagnostics.camera.viewpoint='rear-shepherd';
      if(game.cam){game.cam.yaw=yaw+Math.PI;game.cam.pitch=.2;game.cam.dist=distance;game.cam.tgt?.copy?.(look);}
    }
    game.camera.position.copy(pos);game.camLook?.copy?.(look);game.camera.lookAt(look);
    if(game.input){game.input.lookX=0;game.input.lookY=0;game.input.zoom=0;}
    game.sky?.mesh?.position?.copy?.(pos);
    S.diagnostics.camera.samples++;S.diagnostics.camera.behindDot=behindDot;S.diagnostics.camera.minBehindDot=Math.min(S.diagnostics.camera.minBehindDot,behindDot);S.diagnostics.camera.mode=game.mode;S.diagnostics.camera.aspect=aspect;
    return true;
  };
  function updateMyShepherdCamera(dt){if(applyRearFrame(this))return;return prior.call(this,dt);}
  updateMyShepherdCamera.__myShepherdChapter=chapter;updateMyShepherdCamera.__myShepherdOriginal=prior;Game.prototype.updateCamera=updateMyShepherdCamera;
  const load=Game.prototype.loadWorld;
  if(load&&!load.__myShepherdRenderBoundary){
    function loadWithRearRender(...args){
      const result=load.apply(this,args);
      if(this.renderer&&!this.__myShepherdRenderBoundary){
        this.__myShepherdRenderBoundary=true;const render=this.renderer.render.bind(this.renderer),game=this;
        this.renderer.render=function(scene,camera){if(scene===game.scene&&camera===game.camera)applyRearFrame(game);return render(scene,camera);};
      }
      return result;
    }
    loadWithRearRender.__myShepherdRenderBoundary=true;loadWithRearRender.__myShepherdOriginal=load;Game.prototype.loadWorld=loadWithRearRender;
  }
  return updateMyShepherdCamera;
}
