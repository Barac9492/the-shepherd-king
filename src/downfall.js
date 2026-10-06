import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { SINS, RULES, GRACE_RULES, finishGrace, waveRules, createBattle, stepBattle, beginNextWave, dash } from './downfall-core.js';

const $ = id => document.getElementById(id);
const canvas = $('battleCanvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer=matchMedia('(pointer: coarse)').matches;
const compactViewport=()=>innerWidth<=650||(innerHeight<=540&&innerWidth<=1000);
let touchMode = coarsePointer||compactViewport();
document.body.classList.toggle('touch-mode', touchMode);
let state = createBattle(), started = false, paused = false, failed = false, contextLost = false;
let renderer, scene, camera, david, aimRing, aimLine, lastTime = 0, previousPhase = '', previousHP = RULES.playerHP;
let width = innerWidth, height = innerHeight, pointerHeld = false, pointerId = null, pointerPosition = null;
let lastAim = { x: 0, z: -1 }, movement = { x: 0, z: 0 }, padAim = null, shake = 0, walkSpeed = 0;
let hudCache = '';
let field={left:0,top:0,width:innerWidth,height:innerHeight},graceRing,graceGlow,graceLight,playerRing;
const darkBackground=new THREE.Color('#172126'),graceBackground=new THREE.Color('#536461');
const staticActorCache=new Map();
const keys = new Set(), enemies = new Map(), stones = new Map(), effects = new Map();
const raycaster = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
const projection = new THREE.Vector3();
const sinById = new Map(SINS.map(s => [s.id, s]));
const pads = [ {el:$('movePad'), id:null, x:0,y:0}, {el:$('aimPad'), id:null,x:0,y:0} ];
const geometry = {
 sphere:new THREE.SphereGeometry(1,10,7), body:new THREE.CylinderGeometry(.68,.49,1,8),
 limb:new THREE.CylinderGeometry(.16,.21,1,7), helmet:new THREE.SphereGeometry(1,10,5,0,Math.PI*2,0,Math.PI*.56),
 disc:new THREE.CircleGeometry(1,24), rock:new THREE.IcosahedronGeometry(1,0),
 ring:new THREE.RingGeometry(.8,1,40), shield:new THREE.CylinderGeometry(1,1,.12,10),
 box:new THREE.BoxGeometry(1,1,1)
};
const matCache = new Map();
const actorShadowMaterial=new THREE.MeshBasicMaterial({color:'#04070a',transparent:true,opacity:.4,depthWrite:false});
function syncControlLabel(){canvas.setAttribute('aria-label',touchMode?'멸망전. 왼쪽 원을 끌어 이동하고, 오른쪽 원을 끌어 조준하며 연속 발사합니다. 회피 버튼으로 빠져나오세요.':'멸망전. WASD로 이동, 방향키로 조준, 스페이스로 연속 발사, Shift로 회피합니다.');}
syncControlLabel();
function material(color, options={}) {
  const key = String(color)+JSON.stringify(options);
  if (!matCache.has(key)) matCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.86,metalness:.13,...options}));
  return matCache.get(key);
}
function mesh(geo,mat,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
}
function ring(parent,r,color,opacity,y=.025){
  const m=mesh(geometry.ring,new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}),parent,0,y,0,r,.012*r,r);
  m.scale.set(r,r,r);m.rotation.x=-Math.PI/2;return m;
}
function batchStaticParts(group,key){
  const originals=group.children.filter(child=>child.isMesh);
  let parts=staticActorCache.get(key);
  if(!parts){
    const byMaterial=new Map();
    for(const child of originals){child.updateMatrix();const clone=child.geometry.clone().applyMatrix4(child.matrix);if(!byMaterial.has(child.material))byMaterial.set(child.material,[]);byMaterial.get(child.material).push(clone);}
    parts=[];for(const [mat,geometries]of byMaterial){const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('Actor geometry could not be merged');parts.push({geometry:merged,material:mat});for(const geometry of geometries)geometry.dispose();}
    staticActorCache.set(key,parts);
  }
  for(const child of originals)group.remove(child);
  for(const part of parts)group.add(new THREE.Mesh(part.geometry,part.material));
}
function makeActor(sin=null,index=0){
  const group=new THREE.Group(), body=new THREE.Group();group.add(body);
  const giant=!!sin, scale=giant ? 1.6 : 1;
  body.scale.setScalar(scale);
  const armor=material(giant ? (sin.color || '#6e7477') : '#e0d7bd');
  const dark=material(giant?'#252c32':'#674b38'), skin=material(giant?'#818781':'#b8916c');
  const steel=material(giant?'#3e494e':'#9a7f60',{metalness:.5});
  const shadow=mesh(geometry.disc,actorShadowMaterial,group,0,.027,0,giant?1.15:.64,giant?1.15:.64,1);shadow.rotation.x=-Math.PI/2;
  mesh(geometry.body,armor,body,0,1.03,0,.75,.76,.64);
  mesh(geometry.limb,dark,body,0,.68,0,2.7,.15,1.8);
  mesh(geometry.sphere,skin,body,0,1.7,0,.27,.31,.26);
  if(giant){
    mesh(geometry.helmet,steel,body,0,1.76,0,.34,.38,.32);
    mesh(geometry.box,steel,body,0,1.67,.263,.085,.35,.1);
    mesh(geometry.sphere,material('#ed795f',{emissive:'#8a2217',emissiveIntensity:.7}),body,-.11,1.73,.239,.042,.024,.025);
    mesh(geometry.sphere,material('#ed795f',{emissive:'#8a2217',emissiveIntensity:.7}),body,.11,1.73,.239,.042,.024,.025);
    for(const side of [-1,1])mesh(geometry.helmet,steel,body,side*.57,1.39,0,.35,.25,.34);
    if(index%3===0){const sh=mesh(geometry.shield,steel,body,-.79,.96,.22,.52,.7,.52);sh.rotation.x=Math.PI/2;mesh(geometry.sphere,armor,body,-.79,.96,.32,.15,.15,.08);}
  }else{
    mesh(geometry.helmet,material('#3e302b'),body,0,1.82,-.04,.29,.24,.29);
    mesh(geometry.box,material('#bc6b52'),body,.13,1.13,.27,.12,.67,.04).rotation.z=-.25;
  }
  batchStaticParts(body,sin?`torso:${sin.id}`:'torso:david');
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.22,.66,0);body.add(leg);
    mesh(geometry.limb,dark,leg,0,-.3,0,1,.59,1);
    mesh(geometry.sphere,dark,leg,0,-.61,.08,.19,.11,.28);batchStaticParts(leg,giant?'leg:giant':'leg:david');legs.push(leg);
    const arm=new THREE.Group();arm.position.set(side*.53,1.36,0);body.add(arm);
    mesh(geometry.limb,giant?steel:skin,arm,0,-.3,0,1,.59,1);
    mesh(geometry.sphere,skin,arm,0,-.62,0,.13,.15,.13);batchStaticParts(arm,giant?'arm:giant':'arm:david');arms.push(arm);
  }
  let sling=null;
  if(!giant){
    sling=new THREE.Group();sling.position.set(0,-.58,0);arms[1].add(sling);
    const cordMat=new THREE.LineBasicMaterial({color:'#d1b689'});
    const cordGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(.45,.03,0),new THREE.Vector3(.8,0,0),new THREE.Vector3(.45,-.03,0),new THREE.Vector3(0,0,0)]);
    sling.add(new THREE.Line(cordGeo,cordMat));mesh(geometry.rock,material('#d7d8c8'),sling,.8,0,0,.11,.08,.08);
  }
  group.userData={body,legs,arms,sling,scale};return group;
}
function initScene(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touchMode?1.25:1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;
  scene=new THREE.Scene();scene.background=new THREE.Color('#172126');scene.fog=new THREE.Fog('#172126',62,110);
  camera=new THREE.OrthographicCamera(-25,25,25,-25,.1,160);
  scene.add(new THREE.HemisphereLight('#cadde2','#363238',2.15));
  const key=new THREE.DirectionalLight('#f1e4d6',3);key.position.set(-18,30,12);scene.add(key);
  const rim=new THREE.DirectionalLight('#95b9c6',1.8);rim.position.set(12,15,-20);scene.add(rim);
  const floor=mesh(new THREE.CircleGeometry(70,64),material('#283238'),scene,0,-.06,0);floor.rotation.x=-Math.PI/2;
  const arena=mesh(new THREE.CircleGeometry(RULES.arena+1,64),material('#394246'),scene);arena.rotation.x=-Math.PI/2;
  ring(scene,RULES.arena,'#ad9990',.18,.012);
  const outer=new THREE.Mesh(new THREE.RingGeometry(RULES.arena-.13,RULES.arena+.13,100),material('#a58575'));
  outer.rotation.x=-Math.PI/2;outer.position.y=.012;scene.add(outer);
  for(let i=0;i<36;i++){
    const angle=i*Math.PI*2/36, r=RULES.arena+3.8+(i%3)*1.1;
    const stone=mesh(geometry.rock,material(i%2?'#343d42':'#41494b'),scene,Math.sin(angle)*r,.5,Math.cos(angle)*r,.7+(i%3)*.3,.8+(i%4)*.3,.7);stone.rotation.set(i*.7,i,0);
  }
  for(let i=0;i<10;i++){
    const angle=i*Math.PI*2/10, r=RULES.arena+5;
    const pillar=new THREE.Group();pillar.position.set(Math.sin(angle)*r,0,Math.cos(angle)*r);scene.add(pillar);
    const high=2.4+(i%3)*1.2;
    mesh(new THREE.CylinderGeometry(.62,.8,high,7),material('#4a5152'),pillar,0,high/2,0);
    mesh(geometry.box,material('#5c6260'),pillar,0,.16,0,1.8,.32,1.8);
    if(i%3!==1)mesh(geometry.box,material('#545c5c'),pillar,0,high,0,1.6,.3,1.6).rotation.z=.12;
  }
  const crackMat=new THREE.LineBasicMaterial({color:'#1c282d',transparent:true,opacity:.65});
  for(let i=0;i<32;i++){
    const a=i*2.3999,r=3+(i%7)*2.3,x=Math.sin(a)*r,z=Math.cos(a)*r;
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,.02,z),new THREE.Vector3(x+.8,.02,z+1.1),new THREE.Vector3(x+.4,.02,z+2),new THREE.Vector3(x+1.1,.02,z+2.4)]);scene.add(new THREE.Line(geo,crackMat));
  }
  const center=ring(scene,3.5,'#a79e8e',.08,.022);center.scale.set(3.5,3.5,3.5);
  david=makeActor();scene.add(david);
  playerRing=ring(scene,.78,'#fff4d5',.78,.045);
  graceRing=ring(scene,1,'#fff4d8',.75,.075);graceRing.visible=false;
  graceGlow=mesh(geometry.disc,new THREE.MeshBasicMaterial({color:'#fff5db',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}),scene,0,.06,0);graceGlow.rotation.x=-Math.PI/2;graceGlow.visible=false;
  graceLight=new THREE.PointLight('#fff3d2',0,85,1.5);scene.add(graceLight);
  aimRing=ring(scene,.5,'#f3e7cd',.8,.055);
  const aimGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.1,0),new THREE.Vector3(0,.1,-5)]);
  aimLine=new THREE.Line(aimGeo,new THREE.LineDashedMaterial({color:'#e8e0cc',transparent:true,opacity:.3,dashSize:.25,gapSize:.25}));aimLine.computeLineDistances();scene.add(aimLine);
  resize();syncActors(0);renderScene();
}
function resize(){
  width=innerWidth;height=innerHeight;touchMode=touchMode||coarsePointer||compactViewport();document.body.classList.toggle('touch-mode',touchMode);syncControlLabel();if(!renderer)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio,touchMode?1.25:1.65));renderer.setSize(width,height,false);
  field={left:0,top:0,width,height};
  if(started&&touchMode){
    const landscape=width>height;
    const baseTop=landscape?104:(height<650?118:138),baseBottom=landscape?20:(height<650?146:177),side=landscape?116:0;
    const hudBottom=$('battleHud').getBoundingClientRect().bottom,top=Math.max(baseTop,hudBottom+(landscape?17:height<650?26:32));
    const controlBottom=parseFloat(getComputedStyle($('controls')).bottom)||0,bottom=baseBottom+(landscape?0:Math.max(0,controlBottom-(height<650?26:29)));
    field={left:side,top,width:Math.max(80,width-side*2),height:Math.max(120,height-top-bottom)};
  }
  const aspect=field.width/field.height,half=started&&touchMode?Math.max(21.8/aspect,19):aspect<1?22/aspect:23;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  positionCamera();
}
function renderScene(){
  renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.setClearColor(scene.background,1);renderer.clear();
  renderer.setViewport(field.left,height-field.top-field.height,field.width,field.height);renderer.setScissor(field.left,height-field.top-field.height,field.width,field.height);renderer.setScissorTest(true);renderer.render(scene,camera);renderer.setScissorTest(false);
}
function positionCamera(){
  const offset=started?0:(width>650?-9:0);
  camera.position.set(offset,38,29);camera.lookAt(offset,0,0);
  if(shake>0&&!reducedMotion){camera.position.x+=Math.sin(state.time*91)*shake;camera.position.z+=Math.cos(state.time*77)*shake;}
  camera.updateMatrixWorld();
}
function sinOf(enemy){return sinById.get(enemy.sinId)||SINS[0];}
function syncActors(dt){
  const p=state.player;david.position.set(p.x,0,p.z);david.rotation.y=Math.atan2(lastAim.x,lastAim.z);
  const moving=walkSpeed>.05&&!paused&&state.phase==='playing';
  david.userData.legs.forEach((leg,i)=>{leg.rotation.x=moving?Math.sin(state.time*15+i*Math.PI)*.62:0;});
  david.userData.arms[1].rotation.x=pointerHeld||padAim||keys.has('Space')?-1.2:-.15;
  if(david.userData.sling)david.userData.sling.rotation.y=state.time*26;
  david.visible=reducedMotion||!(p.invulnerable>0&&state.phase==='playing'&&Math.floor(state.time*15)%2===0);
  playerRing.position.set(p.x,.045,p.z);playerRing.visible=started;
  const graceActive=state.phase==='grace'||state.phase==='complete',graceProgress=graceActive?Math.min(1,state.graceElapsed/GRACE_RULES.duration):0;
  graceRing.visible=graceActive&&!reducedMotion&&state.graceRadius>0;graceGlow.visible=graceActive;
  graceRing.position.set(p.x,.075,p.z);graceRing.scale.setScalar(Math.max(.001,state.graceRadius));graceRing.material.opacity=.65*(1-graceProgress*.6);
  graceGlow.position.set(p.x,.06,p.z);graceGlow.scale.setScalar(reducedMotion?GRACE_RULES.radius:Math.max(.001,state.graceRadius));graceGlow.material.opacity=reducedMotion?.09:.13*graceProgress;
  graceLight.position.set(p.x,7,p.z);graceLight.intensity=graceActive?(reducedMotion?2:2.8*graceProgress):0;
  scene.background.copy(darkBackground).lerp(graceBackground,graceProgress*.65);scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure=1.24+graceProgress*.12;
  if(state.phase==='grace'){$('graceTitle').textContent=state.graceElapsed<1.3?'우리의 힘이 다해도':'승리는 하나님께 속해 있습니다';$('graceCopy').textContent=state.graceElapsed<1.3?'하나님의 은혜는 끝나지 않습니다.':'적들은 사라지고, 하나님의 은혜가 남습니다.';}
  const occupiedLabels=[];
  for(const e of state.enemies){
    let item=enemies.get(e.id);const sin=sinOf(e);
    if(!item){const actor=makeActor(sin,SINS.indexOf(sin));scene.add(actor);const label=document.createElement('div');label.className='enemy-label';label.textContent=sin.name;const hp=document.createElement('i');hp.className='enemy-hp';label.append(hp);$('enemyLabels').append(label);item={actor,label,hp};enemies.set(e.id,item);}
    item.actor.position.set(e.x,0,e.z);item.actor.rotation.y=Math.atan2(p.x-e.x,p.z-e.z);
    item.actor.userData.body.position.y=reducedMotion?0:Math.sin((e.age||state.time)*6+e.id)*.05;
    item.actor.userData.legs.forEach((leg,i)=>{leg.rotation.x=started&&!paused&&state.phase==='playing'?Math.sin((e.age||state.time)*6+i*Math.PI+e.id)*.3:0;});
    item.actor.userData.arms[1].rotation.x=-.15+Math.sin((e.age||state.time)*5)*.12;
    item.actor.scale.setScalar(e.flash>0?1.04:1);
    projection.set(e.x,3.6,e.z).project(camera);
    const labelX=field.left+(projection.x*.5+.5)*field.width, baseY=field.top+(-projection.y*.5+.5)*field.height;
    let labelY=baseY;
    for(const offset of [0,-22,22,-44,44,-66,66]){const candidate=baseY+offset;if(!occupiedLabels.some(p=>Math.abs(p.x-labelX)<42&&Math.abs(p.y-candidate)<22)){labelY=candidate;break;}}
    occupiedLabels.push({x:labelX,y:labelY});
    item.label.style.transform=`translate3d(${labelX}px,${labelY}px,0) translate(-50%,-100%)`;
    item.label.style.display=projection.z>1||projection.z< -1?'none':'';
    const ahead=Math.hypot(e.x-p.x,e.z-p.z)-state.graceRadius;
    const dissolve=state.phase==='grace'&&!reducedMotion?Math.max(.12,Math.min(1,ahead/2.5)):1;
    if(state.phase==='grace')item.actor.scale.setScalar(dissolve);
    item.label.style.opacity=String(dissolve);
    item.hp.style.transform=`scaleX(${Math.max(0,e.hp/e.maxHp)})`;item.hp.hidden=e.maxHp<=1;
  }
  const enemyIds=new Set(state.enemies.map(e=>e.id));for(const [id,item] of enemies)if(!enemyIds.has(id)){scene.remove(item.actor);item.label.remove();enemies.delete(id);}
  for(const s of state.stones){let m=stones.get(s.id);if(!m){m=new THREE.Group();mesh(geometry.rock,material('#fcf1cf',{emissive:'#b59555',emissiveIntensity:.65}),m,0,0,0,.14,.14,.14);const tail=mesh(geometry.limb,material('#eadabb',{transparent:true,opacity:.5,emissive:'#baa880'}),m,0,0,-.52,.42,1,.42);tail.rotation.x=Math.PI/2;scene.add(m);stones.set(s.id,m);}m.position.set(s.x,.9,s.z);m.rotation.y=Math.atan2(s.vx,s.vz);}
  const stoneIds=new Set(state.stones.map(s=>s.id));for(const[id,m]of stones)if(!stoneIds.has(id)){scene.remove(m);stones.delete(id);}
  for(const e of state.effects){if(reducedMotion&&e.kind==='grace')continue;let m=effects.get(e.id);if(!m){m=new THREE.Group();const col=e.color||(e.kind==='hurt'?'#d75d4e':'#e9d7a4');for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(geometry.rock,material(col),m,Math.sin(a)*.5,.25+(i%2)*.3,Math.cos(a)*.5,.13,.15,.13);}scene.add(m);effects.set(e.id,m);}m.position.set(e.x,.15,e.z);const t=Math.max(.02,e.life);m.scale.setScalar(Math.max(.08,1.7-t));m.rotation.y=state.time;for(const child of m.children)child.scale.setScalar(Math.min(.22,t*.45));}
  const effectIds=new Set(state.effects.map(e=>e.id));for(const[id,m]of effects)if(!effectIds.has(id)){scene.remove(m);effects.delete(id);}
  const aimDistance=4;aimRing.position.set(p.x+lastAim.x*aimDistance,.055,p.z+lastAim.z*aimDistance);
  aimLine.position.set(p.x,0,p.z);aimLine.rotation.y=Math.atan2(-lastAim.x,-lastAim.z);
  aimRing.visible=aimLine.visible=started&&state.phase==='playing';
  shake=Math.max(0,shake-dt*1.8);
}
function screenDirection(dx,dy){
  // Camera has no yaw. Screen vertical is the projected world Z axis.
  const z=dy/Math.cos(Math.atan2(29,38));const length=Math.hypot(dx,z)||1;return{x:dx/length,z:z/length};
}
function pointerAim(){
  if(!pointerPosition)return;
  raycaster.setFromCamera(new THREE.Vector2((pointerPosition.x-field.left)/field.width*2-1,1-(pointerPosition.y-field.top)/field.height*2),camera);
  if(raycaster.ray.intersectPlane(ground,hit)){const x=hit.x-state.player.x,z=hit.z-state.player.z,len=Math.hypot(x,z);if(len>.1)lastAim={x:x/len,z:z/len};}
}
function input(){
  let x=movement.x,z=movement.z;
  if(keys.has('KeyA'))x--;if(keys.has('KeyD'))x++;if(keys.has('KeyW'))z--;if(keys.has('KeyS'))z++;
  const norm=Math.max(1,Math.hypot(x,z));x/=norm;z/=norm;walkSpeed=Math.hypot(x,z);
  let ax=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),az=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
  if(ax||az)lastAim=screenDirection(ax,az);else if(padAim)lastAim=padAim;else pointerAim();
  return{moveX:x,moveZ:z,aimX:lastAim.x,aimZ:lastAim.z,firing:pointerHeld||!!padAim||keys.has('Space')};
}
function clearInputs(){
  keys.clear();pointerHeld=false;pointerPosition=null;
  if(pointerId!==null){const id=pointerId;pointerId=null;try{canvas.releasePointerCapture(id);}catch{}}
  movement={x:0,z:0};padAim=null;walkSpeed=0;
  for(const pad of pads){const id=pad.id;pad.id=null;pad.el.classList.remove('active');pad.el.querySelector('.knob').style.transform='';if(id!==null)try{pad.el.releasePointerCapture(id);}catch{}}
}
function updateHud(){
  const cache=[state.wave,state.waveKills,state.kills,state.player.hp,state.combo,Math.ceil(state.player.dashCooldown*10),paused,state.phase,touchMode].join('|');
  if(cache===hudCache)return;hudCache=cache;
  const difficulty=waveRules(state.wave);
  $('waveValue').textContent=String(state.wave).padStart(2,'0');
  $('waveLabel').textContent=`이번 공세 ${state.waveKills} / ${difficulty.count}`;
  $('killsValue').textContent=state.result?`${state.result.score.toLocaleString('ko-KR')}점 확정`:`총 ${state.kills} 처치`;
  $('waveProgress').style.width=`${state.waveKills/difficulty.count*100}%`;
  $('healthValue').innerHTML=Array.from({length:RULES.playerHP},(_,i)=>`<i${i>=state.player.hp?' class="empty"':''}></i>`).join('');
  $('healthValue').setAttribute('aria-label',`체력 ${RULES.playerHP} 중 ${state.player.hp}`);
  $('comboValue').textContent=state.result?'은혜로 사라진 적은 점수에 더하지 않아요':state.combo>1?`${state.combo} 연속 처치`:'물맷돌 무제한';
  $('dashBtn').disabled=state.player.dashCooldown>0||paused||state.phase!=='playing';
  $('dashTimer').textContent=state.player.dashCooldown>0?`${state.player.dashCooldown.toFixed(1)}초`:touchMode?'준비':'SHIFT';
  if(state.player.hp<previousHP){shake=.25;$('battleAnnouncement').textContent=`피격. 체력 ${state.player.hp}`;}
  previousHP=state.player.hp;
}
function setOverlay(title,copy,eyebrow,button){
  clearInputs();$('graceScene').hidden=true;$('resultStats').hidden=true;$('resultNote').hidden=true;$('finalScripture').hidden=true;$('screenOverlay').classList.remove('victory');$('overlayTitle').textContent=title;$('overlayCopy').textContent=copy;$('overlayEyebrow').textContent=eyebrow;
  $('continueBtn').firstChild.textContent=button+' ';$('continueBtn').hidden=false;
  $('screenOverlay').hidden=false;$('controls').hidden=true;$('pauseBtn').hidden=true;
  canvas.tabIndex=-1;$('topbar').inert=true;$('battleHud').inert=true;
  $('overlayTitle').focus();$('battleAnnouncement').textContent=title;
}
function hideOverlay(){
  $('screenOverlay').hidden=true;$('resultStats').hidden=true;$('resultNote').hidden=true;$('finalScripture').hidden=true;$('retryBtn').hidden=true;
  $('controls').hidden=state.phase!=='playing';$('graceScene').hidden=state.phase!=='grace';$('pauseBtn').hidden=state.phase==='complete';$('topbar').inert=false;$('battleHud').inert=false;
  canvas.tabIndex=state.phase==='playing'?0:-1;if(state.phase==='grace')$('skipGraceBtn').focus();else canvas.focus();
}
function pause(){
  if(!started||paused||!['playing','grace'].includes(state.phase)||failed)return;
  paused=true;setOverlay(state.phase==='grace'?'엔딩 일시정지':'전투 일시정지','돌아오면 계속하기를 눌러 주세요.','잠시 쉬어 가기','계속하기');$('retryBtn').hidden=false;
}
function phaseChanged(){
  if(state.phase===previousPhase)return;previousPhase=state.phase;
  if(state.phase==='intermission'){
    const next=waveRules(state.wave+1);
    setOverlay(`${state.wave}차 공세를 막았어요`,`다음은 ${next.count}명의 거인입니다. 체력을 1 회복하고 다시 맞서세요.`,'난이도 상승',`${state.wave+1}차 공세 시작`);
  }else if(state.phase==='grace'){
    clearInputs();shake=0;$('controls').hidden=true;$('desktopHelp').hidden=true;$('combatHint').hidden=true;$('graceScene').hidden=false;$('pauseBtn').hidden=false;
    $('graceTitle').textContent='우리의 힘이 다해도';$('graceCopy').textContent='하나님의 은혜는 끝나지 않습니다.';
    canvas.tabIndex=-1;$('skipGraceBtn').focus();$('battleAnnouncement').textContent='플레이 점수가 확정되었습니다. 하나님의 은혜로 적들이 사라집니다.';
  }else if(state.phase==='complete'){
    const result=state.result;
    setOverlay('승리는 하나님께 속해 있습니다','우리의 힘에는 끝이 있지만, 그리스도 안에서 주시는 하나님의 승리는 사라지지 않습니다.','은혜로 주신 승리','다시 플레이');
    $('screenOverlay').classList.add('victory');$('resultStats').hidden=false;
    $('resultStats').innerHTML=`<div class="result-score"><strong>${result.score.toLocaleString('ko-KR')}<small>점</small></strong><span>이번 플레이 기록</span></div><div><strong>${result.wave}<small>차</small></strong><span>도달 공세</span></div><div><strong>${result.kills}</strong><span>직접 처치</span></div><div><strong>${Math.floor(result.time)}<small>초</small></strong><span>플레이 시간</span></div>`;
    $('resultNote').hidden=false;$('finalScripture').hidden=false;$('battleHud').hidden=true;
  }
}
function start(){
  if(failed||contextLost)return;
  clearInputs();state=createBattle();started=true;paused=false;previousPhase='playing';previousHP=RULES.playerHP;lastAim={x:0,z:-1};hudCache='';
  $('screenStart').hidden=true;$('graceScene').hidden=true;$('screenOverlay').classList.remove('victory');document.body.classList.add('playing');
  shake=0;scene.background.copy(darkBackground);scene.fog.color.copy(darkBackground);renderer.toneMappingExposure=1.24;graceLight.intensity=0;graceRing.visible=graceGlow.visible=false;
  $('battleHud').hidden=false;$('combatHint').hidden=false;$('desktopHelp').hidden=false;
  hideOverlay();resize();updateHud();$('battleAnnouncement').textContent='첫 번째 공세. 전투 시작.';
}
function doDash(){if(!started||paused||state.phase!=='playing')return;const i=input();dash(state,i.moveX||i.moveZ?i.moveX:lastAim.x,i.moveX||i.moveZ?i.moveZ:lastAim.z);updateHud();}
function fatal(message){
  failed=true;clearInputs();$('screenStart').hidden=true;$('screenOverlay').hidden=true;$('errorCopy').textContent=message;$('errorPanel').hidden=false;
  $('controls').hidden=true;$('graceScene').hidden=true;$('pauseBtn').hidden=true;$('battleHud').hidden=true;$('combatHint').hidden=true;$('topbar').inert=false;
}
function animate(ms){
  requestAnimationFrame(animate);if(failed||contextLost||!renderer)return;
  const dt=Math.min(.05,Math.max(0,(ms-lastTime)/1000||0));lastTime=ms;
  if(started&&!paused&&['playing','grace'].includes(state.phase)){stepBattle(state,dt,state.phase==='playing'?input():{});updateHud();phaseChanged();}
  positionCamera();syncActors(dt);renderScene();
}
for(const [index,pad] of pads.entries()){
  const update=e=>{const box=pad.el.getBoundingClientRect(),radius=box.width*.34;let dx=e.clientX-(box.left+box.width/2),dy=e.clientY-(box.top+box.height/2);const len=Math.hypot(dx,dy),scale=Math.min(1,radius/(len||1));dx*=scale;dy*=scale;pad.el.querySelector('.knob').style.transform=`translate(${dx}px,${dy}px)`;
    if(index===0){const d=screenDirection(dx,dy),strength=Math.min(1,len/radius);movement=len<5?{x:0,z:0}:{x:d.x*strength,z:d.z*strength};}
    else padAim=len<7?null:screenDirection(dx,dy);
  };
  pad.el.addEventListener('pointerdown',e=>{if(!started||paused||state.phase!=='playing'||pad.id!==null)return;e.preventDefault();touchMode=true;document.body.classList.add('touch-mode');syncControlLabel();pad.id=e.pointerId;try{pad.el.setPointerCapture(e.pointerId);}catch{}pad.el.classList.add('active');update(e);});
  pad.el.addEventListener('pointermove',e=>{if(e.pointerId===pad.id){e.preventDefault();update(e);}});
  const release=e=>{if(e.pointerId!==pad.id)return;const id=pad.id;pad.id=null;pad.el.classList.remove('active');pad.el.querySelector('.knob').style.transform='';if(index===0)movement={x:0,z:0};else padAim=null;try{pad.el.releasePointerCapture(id);}catch{}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.el.addEventListener(type,release);
}
canvas.addEventListener('pointerdown',e=>{if(!started||paused||state.phase!=='playing'||e.button!==0||e.pointerType==='touch')return;e.preventDefault();canvas.focus();pointerId=e.pointerId;pointerHeld=true;pointerPosition={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')pointerPosition={x:e.clientX,y:e.clientY};});
const releasePointer=e=>{if(e.pointerId!==pointerId)return;const id=pointerId;pointerId=null;pointerHeld=false;try{canvas.releasePointerCapture(id);}catch{}};
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,releasePointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(started&&!paused&&['playing','grace'].includes(state.phase))pause();return;}
  if(!started||paused||state.phase!=='playing'||failed)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)){
    if(e.target.closest?.('button,a,summary')&&e.code==='Space')return;
    e.preventDefault();keys.add(e.code);if(e.code.startsWith('Shift')&&!e.repeat)doDash();
  }
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInputs();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();pause();}});
window.addEventListener('resize',()=>{if(innerWidth!==width||innerHeight!==height){clearInputs();pause();resize();}});
$('skipGraceBtn').addEventListener('click',()=>{if(paused||contextLost||failed)return;if(finishGrace(state)){clearInputs();phaseChanged();updateHud();}});
$('startBtn').addEventListener('click',start);$('pauseBtn').addEventListener('click',pause);$('dashBtn').addEventListener('click',doDash);$('retryBtn').addEventListener('click',start);
$('continueBtn').addEventListener('click',()=>{
  if(contextLost)return;
  if(paused){paused=false;clearInputs();hideOverlay();return;}
  if(state.phase==='intermission'){beginNextWave(state);previousPhase='playing';clearInputs();hideOverlay();updateHud();$('battleAnnouncement').textContent=`${state.wave}차 공세 시작`;return;}
  start();
});
$('screenOverlay').addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;const controls=[...$('screenOverlay').querySelectorAll('button:not([hidden]),a[href]')].filter(el=>!el.disabled&&el.getClientRects().length>0);const first=controls[0],last=controls.at(-1);
  if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('overlayTitle'))){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;clearInputs();pause();fatal('그래픽 연결이 끊겼어요. 새로고침한 뒤 다시 시작해 주세요.');});
for(const sin of SINS){const li=document.createElement('li');li.textContent=sin.name;const ref=document.createElement('span');ref.textContent=sin.reference;li.append(ref);$('sinList').append(li);}
if(new URLSearchParams(location.search).get('test')==='1')Object.defineProperty(window,'DOWNFALL',{value:Object.freeze({get state(){return state;},get paused(){return paused;},get rendererInfo(){return renderer?Object.freeze({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),geometries:renderer.info.memory.geometries,field:Object.freeze({...field}),staticActorTemplates:staticActorCache.size}):null;}}),configurable:false,writable:false});
try{initScene();$('startBtn').disabled=false;$('startBtn').firstChild.textContent='전투 시작 ';requestAnimationFrame(animate);}catch(error){console.error('Downfall renderer unavailable',error);fatal('3D 그래픽을 실행하지 못했어요. 브라우저의 그래픽 가속을 켠 뒤 새로고침해 주세요.');}
