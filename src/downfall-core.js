// Deterministic, local-only symbolic arena. Names are thematic labels, not quotations.
export const SINS = Object.freeze([
  {id:'lust',name:'음란',reference:'마가복음 7:21–23',color:0xaf527d,speed:2.15,hp:1,radius:.68},
  {id:'greed',name:'탐욕',reference:'마가복음 7:21–23',color:0xb69b61,speed:1.4,hp:3,radius:.88},
  {id:'murder',name:'살인',reference:'마가복음 7:21–23',color:0xb34e4c,speed:2.35,hp:2,radius:.76},
  {id:'envy',name:'시기',reference:'갈라디아서 5:19–21',color:0x638f84,speed:2.7,hp:1,radius:.64},
  {id:'jealousy',name:'질투',reference:'갈라디아서 5:19–21 · 투기',color:0x64899e,speed:2.5,hp:1,radius:.64},
  {id:'anger',name:'분노',reference:'갈라디아서 5:19–21 · 분냄',color:0xd25a3e,speed:1.9,hp:2,radius:.8},
  {id:'unbelief',name:'불신',reference:'요한계시록 21:8 · 믿지 아니함',color:0x878295,speed:1.5,hp:3,radius:.86},
  {id:'pride',name:'교만',reference:'마가복음 7:21–23',color:0xa590bb,speed:1.65,hp:3,radius:.86},
  {id:'lie',name:'거짓',reference:'요한계시록 21:8',color:0x729ea3,speed:2.5,hp:1,radius:.64},
].map(Object.freeze));
export const RULES = Object.freeze({arena:19,maxEnemies:32,fireInterval:.24,playerSpeed:7,playerHP:5,dashCooldown:3});
export const GRACE_RULES=Object.freeze({duration:4.2,clearStart:.7,clearDuration:2.2,radius:40});
// Wave totals have no finale; bound simultaneous entities and physics speed, not progression.
export function waveRules(wave){
  const level=Math.max(0,(Number.isFinite(wave)?Math.floor(wave):1)-1);
  return {count:18+level*6,initial:Math.min(18,8+Math.floor(level/2)),spawnInterval:Math.max(.18,1.35*Math.pow(.82,level)),speedMultiplier:Math.min(4,1+level*.16),hpBonus:Math.floor(level/3)};
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const vector=(x,z)=>{ x=Number.isFinite(x)?x:0;z=Number.isFinite(z)?z:0;const n=Math.hypot(x,z);return n>0?{x:x/n,z:z/n,n}: {x:0,z:0,n:0}; };
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function effect(s,x,z,kind,color=0xffffff){s.effects.push({id:++s.serial,x,z,kind,life:kind==='kill'?.6:.3,color});}
function clip(p,limit=RULES.arena-1){const n=Math.hypot(p.x,p.z);if(n>limit){p.x*=limit/n;p.z*=limit/n;}}
function spawn(s){
  const sin=SINS[s.spawned%SINS.length], angle=random(s)*Math.PI*2;
  let x=Math.cos(angle)*17,z=Math.sin(angle)*17;
  if(Math.hypot(x-s.player.x,z-s.player.z)<8){x=-x;z=-z;}
  const hp=sin.hp+waveRules(s.wave).hpBonus;
  s.enemies.push({id:++s.serial,sinId:sin.id,x,z,hp,maxHp:hp,radius:sin.radius,flash:0,age:0});s.spawned++;
}
export function createBattle(seed=123){
  const s={phase:'playing',result:null,graceElapsed:0,graceRadius:0,wave:1,player:{x:0,z:0,hp:RULES.playerHP,invulnerable:0,dashRemaining:0,dashCooldown:0},enemies:[],stones:[],effects:[],kills:0,score:0,combo:0,maxCombo:0,shots:0,hits:0,time:0,cooldown:0,spawned:0,waveKills:0,spawnTimer:0,aim:{x:0,z:-1},seed:seed>>>0,serial:0,comboTimer:0};
  for(let i=0;i<waveRules(s.wave).initial;i++)spawn(s);return s;
}
export function fireStone(s,x,z){
  if(s.phase!=='playing'||s.cooldown>1e-8)return false;
  const v=vector(x,z);if(!v.n)return false;
  s.aim={x:v.x,z:v.z};s.cooldown=RULES.fireInterval;s.shots++;
  s.stones.push({id:++s.serial,x:s.player.x+v.x*.7,z:s.player.z+v.z*.7,vx:v.x*32,vz:v.z*32,life:1.45,power:1,pierce:s.combo>=10?2:1,hitIds:[]});return true;
}
export function dash(s,x,z){
  if(s.phase!=='playing'||s.player.dashCooldown>0)return false;
  let v=vector(x,z);if(!v.n)v=vector(s.aim.x,s.aim.z);
  s.player.x+=v.x*4;s.player.z+=v.z*4;clip(s.player);
  s.player.invulnerable=Math.max(s.player.invulnerable,.45);s.player.dashRemaining=.18;s.player.dashCooldown=RULES.dashCooldown;effect(s,s.player.x,s.player.z,'dash');return true;
}
export function beginNextWave(s){
  if(s.phase!=='intermission')return false;
  s.wave++;s.phase='playing';s.spawned=0;s.waveKills=0;s.spawnTimer=0;s.cooldown=0;s.stones=[];s.effects=[];s.combo=0;s.comboTimer=0;
  s.player.hp=Math.min(RULES.playerHP,s.player.hp+1);s.player.invulnerable=1;
  for(let i=0;i<waveRules(s.wave).initial;i++)spawn(s);return true;
}
// A score is a record of the player's effort, never a measure or price of grace.
function enterGrace(s){
  s.phase='grace';s.result=Object.freeze({score:s.score,kills:s.kills,wave:s.wave,time:s.time,maxCombo:s.maxCombo,shots:s.shots,hits:s.hits});
  s.graceElapsed=0;s.graceRadius=0;s.stones=[];s.effects=[];s.player.invulnerable=0;
}
export function finishGrace(s){
  if(s.phase!=='grace')return false;
  s.phase='complete';s.enemies=[];s.stones=[];s.effects=[];s.graceElapsed=GRACE_RULES.duration;s.graceRadius=GRACE_RULES.radius;return true;
}
function advanceGrace(s,dt){
  s.graceElapsed=Math.min(GRACE_RULES.duration,s.graceElapsed+dt);
  s.graceRadius=clamp((s.graceElapsed-GRACE_RULES.clearStart)/GRACE_RULES.clearDuration,0,1)*GRACE_RULES.radius;
  for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
  if(s.graceElapsed>GRACE_RULES.clearStart){
    s.enemies=s.enemies.filter(e=>{if(Math.hypot(e.x-s.player.x,e.z-s.player.z)>s.graceRadius)return true;effect(s,e.x,e.z,'grace',0xfff1cc);return false;});
  }
  if(s.graceElapsed>=GRACE_RULES.duration)finishGrace(s);
}
function distanceToSegment(px,pz,ax,az,bx,bz){const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz,t=len?clamp(((px-ax)*dx+(pz-az)*dz)/len,0,1):0;return Math.hypot(px-ax-t*dx,pz-az-t*dz);}
export function stepBattle(s,dt,input={}){
  if(!Number.isFinite(dt)||dt<=0)return s;
  dt=Math.min(dt,.05);
  if(s.phase==='grace'){advanceGrace(s,dt);return s;}
  if(s.phase!=='playing')return s;
  s.time+=dt;s.cooldown=Math.max(0,s.cooldown-dt);s.comboTimer=Math.max(0,s.comboTimer-dt);if(s.comboTimer===0)s.combo=0;
  const p=s.player;p.invulnerable=Math.max(0,p.invulnerable-dt);p.dashRemaining=Math.max(0,p.dashRemaining-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);
  const move=vector(input.moveX,input.moveZ), magnitude=Math.min(move.n,1);p.x+=move.x*magnitude*RULES.playerSpeed*dt;p.z+=move.z*magnitude*RULES.playerSpeed*dt;clip(p);
  const aim=vector(input.aimX??s.aim.x,input.aimZ??s.aim.z);if(aim.n)s.aim={x:aim.x,z:aim.z};
  if(input.firing)fireStone(s,s.aim.x,s.aim.z);
  const difficulty=waveRules(s.wave),interval=difficulty.spawnInterval;
  s.spawnTimer=Math.min(interval,s.spawnTimer+dt);
  if(s.spawnTimer>=interval&&s.spawned<difficulty.count&&s.enemies.length<RULES.maxEnemies){s.spawnTimer=0;spawn(s);}
  for(const e of s.enemies){
    const sin=SINS.find(t=>t.id===e.sinId);e.age+=dt;e.flash=Math.max(0,e.flash-dt);
    const v=vector(p.x-e.x,p.z-e.z);let speed=sin.speed*difficulty.speedMultiplier;
    if(e.sinId==='anger'&&Math.sin(e.age*1.8)>.65)speed*=2.1;
    let side=(e.sinId==='lie'||e.sinId==='envy')?Math.sin(e.age*3+e.id)*.65:0;
    e.x+=(v.x-v.z*side)*speed*dt;e.z+=(v.z+v.x*side)*speed*dt;
  }
  // Soft separation keeps the crowd readable without unbounded entity counts.
  for(let i=0;i<s.enemies.length;i++)for(let j=i+1;j<s.enemies.length;j++){
    const a=s.enemies[i],b=s.enemies[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=(a.radius+b.radius)*.85;
    if(d<min&&d>.001){const f=(min-d)*.3;a.x-=dx/d*f;a.z-=dz/d*f;b.x+=dx/d*f;b.z+=dz/d*f;}
  }
  for(const e of s.enemies)clip(e,RULES.arena-e.radius);
  for(const stone of s.stones){
    const ox=stone.x,oz=stone.z;stone.x+=stone.vx*dt;stone.z+=stone.vz*dt;stone.life-=dt;
    // Sort by travel order so a single stone cannot hit a rear giant through a nearer one.
    const contacts=s.enemies.filter(e=>e.hp>0&&!stone.hitIds.includes(e.id)&&distanceToSegment(e.x,e.z,ox,oz,stone.x,stone.z)<=e.radius+.2).sort((a,b)=>Math.hypot(a.x-ox,a.z-oz)-Math.hypot(b.x-ox,b.z-oz));
    for(const e of contacts){
      if(stone.pierce<=0)break;stone.hitIds.push(e.id);stone.pierce--;e.hp-=stone.power;e.flash=.12;s.hits++;const sin=SINS.find(t=>t.id===e.sinId);effect(s,e.x,e.z,'hit',sin.color);
      if(e.hp<=0){s.kills++;s.waveKills++;s.combo++;s.maxCombo=Math.max(s.maxCombo,s.combo);s.comboTimer=3;s.score+=100+Math.min(s.combo,20)*10;effect(s,e.x,e.z,'kill',sin.color);}
      if(stone.pierce<=0)stone.life=0;
    }
  }
  s.enemies=s.enemies.filter(e=>e.hp>0);s.stones=s.stones.filter(v=>v.life>0&&Math.hypot(v.x,v.z)<28);
  for(const e of s.enemies){
    if(p.invulnerable<=0&&Math.hypot(e.x-p.x,e.z-p.z)<e.radius+.48){
      p.hp--;p.invulnerable=1.15;s.combo=0;effect(s,p.x,p.z,'hurt',0xee5544);
      const v=vector(e.x-p.x,e.z-p.z);e.x+=v.x*2;e.z+=v.z*2;clip(e,RULES.arena-e.radius);
      if(p.hp<=0){enterGrace(s);break;}
    }
  }
  for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
  if(s.phase==='playing'&&s.spawned===difficulty.count&&s.enemies.length===0){s.phase='intermission';s.stones=[];}
  return s;
}
