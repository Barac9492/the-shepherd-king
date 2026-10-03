import { createGardenNavigation } from './peace-garden-navigation.js';
import { createGardenWorld, makeGardenWolf } from './peace-garden-world.js';

const COPY = {
  title:['평화의 동산','Garden of Peace'], entry:['평화의 동산으로','Visit the Garden of Peace'],
  intro:['하나님이 약속하신 평화의 모습을 바탕으로 상상한 공간입니다. 동물들과 친구가 되어 함께 걸어 보세요.','An imagined place inspired by the peace God has promised. Befriend the animals and walk together.'],
  context:['이사야 11:6–9과 65:25에는 이리와 어린 양, 송아지와 어린 사자가 함께 지내며 서로 해치지 않는 모습이 나옵니다. 사자와 양이 함께 노는 모습은 이 약속을 바탕으로 한 창작 표현이며, 다윗의 생애에 있었던 사건을 재현한 것이 아닙니다.','Isaiah 11:6–9 and 65:25 describe wolves with lambs, calves with young lions, and creatures living without harm. Lions and lambs playing here are a creative expression of that promise, not an event from David’s life.'],
  verse:['나의 거룩한 산 모든 곳에서 해됨도 없고 상함도 없을 것이니','They shall not hurt nor destroy in all my holy mountain'],
  cite:['이사야 11:9 · 개역한글','Isaiah 11:9 · KJV'],
  enter:['동산 들어가기','Enter the garden'], close:['닫기 · 돌아가기','Close · Go back'],
  scripture:['말씀 읽기','Read the scripture'], back:['산책으로 돌아가기','Back to the walk'],
  choose:['만날 친구','Meet a friend'], lion:['사자','Lion'], lamb:['어린 양','Lamb'], wolf:['이리 (늑대)','Wolf'],
  pet:['쓰다듬기','Pet'], play:['함께 놀기','Play together'], follow:['함께 걷기','Walk together'], rest:['함께 쉬기','Rest together'],
  interactions:['친구와 함께','Time with friends'], guide:['동산 안내','Garden guide'], home:['동산 입구로','Garden entrance'], camera:['시점 되돌리기','Reset camera'],
  controls:['WASD·방향키로 이동, Shift로 달리기, 화면을 끌어 둘러보기. E로 가까운 친구를 쓰다듬어요.','Move with WASD / arrows, run with Shift, drag to look. Press E to pet a nearby friend.'],
  touch:['왼쪽 조이스틱으로 이동하고 빈 화면을 끌어 둘러보세요. 친구 곁에서 쓰다듬기 버튼을 눌러요.','Move with the left stick and drag the open view to look. Tap Pet when beside a friend.'],
  welcome:['서로 해치지 않는 동산이에요. 친구를 고르고 빛기둥 쪽으로 걸어 보세요.','A garden without harm. Choose a friend and walk toward the light.'],
  near:['가까이 있어요. 쓰다듬거나 함께 놀아 보세요.','Your friend is nearby. Pet them or play together.'],
  far:['빛기둥이 있는 친구 곁으로 다가가세요.','Walk closer to your friend at the light.'],
  petted:['반가워요! 마음을 나누는 친구가 되었어요.','A happy greeting! You have made a friend.'],
  playing:['친구들이 함께 폴짝폴짝 놀아요. 언제든 함께 걸어도 좋아요.','Your friends are playing together. You can walk together whenever you like.'],
  following:['친구가 뒤따라 걸어요. 다른 친구를 고르면 곁에서 쉬어요.','Your friend is following. Choose another friend to let this one rest.'],
  resting:['친구와 잠시 쉬어요. 움직이면 다윗은 다시 일어나요.','Rest beside your friend. Move to stand up again.'],
  selected:['친구를 골랐어요. 빛기둥을 따라 만나러 가요.','Friend selected. Follow the light to meet them.'],
  returned:['동산 입구예요. 친구들도 함께 돌아왔어요.','Back at the garden entrance, with your friends.'],
};
const INSTALL = Symbol.for('the-shepherd-king.peace-garden');
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

export function installPeaceGarden(deps) {
  const { Game } = deps, p = Game.prototype;
  if(p[INSTALL]) return;
  Object.defineProperty(p,INSTALL,{value:true});
  const original=Object.fromEntries(['setupUI','applyLang','updateInteract','showTitle','startChapter','clearChapter','toggleMenu','showHelp'].map(k=>[k,p[k]]));
  p.setupUI=function(...args){
    original.setupUI.apply(this,args); this.peaceGarden=createController(this,deps);
    const restart=document.getElementById('mRestart').onclick;
    document.getElementById('mRestart').onclick=()=>{
      if(!this.peaceGarden.active)return restart();
      this.toggleMenu(false);this.peaceGarden.home();
    };
  };
  p.applyLang=function(...args){const r=original.applyLang.apply(this,args);this.peaceGarden?.translate();return r;};
  p.updateInteract=function(...args){if(this.peaceGarden?.active)return this.peaceGarden.interactFrame();return original.updateInteract.apply(this,args);};
  for(const k of ['showTitle','startChapter','clearChapter'])p[k]=function(...args){
    if(this.peaceGarden?.active){this.peaceGarden.close();if(k!=='clearChapter')this.mode='intro';}
    this.peaceGarden?.dismissCard(false);
    return original[k].apply(this,args);
  };
  for(const k of ['toggleMenu','showHelp'])p[k]=function(...args){const r=original[k].apply(this,args);this.peaceGarden?.syncVisibility();return r;};
}

function createController(g,{THREE,Actor,makeQuadruped,CH1,getLanguage,isTouch}) {
  const $=id=>document.getElementById(id), panel=$('gardenPanel'), card=$('gardenCard');
  panel.dataset.touch=String(isTouch);
  const world=createGardenWorld({THREE,CH1});
  const c={
    active:false,session:null,cardContext:null,
    t(key){return COPY[key][getLanguage()==='en'?1:0];},
    translate(){
      for(const el of document.querySelectorAll('[data-garden-copy]'))el.textContent=c.t(el.dataset.gardenCopy);
      $('gardenControls').textContent=c.t(isTouch?'touch':'controls');
      $('gardenChoice').setAttribute('aria-label',c.t('choose'));panel.setAttribute('aria-label',c.t('title'));
      if(!c.active)return;
      $('hudTitle').textContent=c.t('title');$('hudRef').textContent=world.ref[getLanguage()];$('mRestart').textContent=c.t('home');
      c.message(c.session.message);c.interactFrame(false);
    },
    playable(){return c.active&&g.mode==='play'&&!g.paused&&!g.lock&&!g.dq&&!card.open;},
    syncVisibility(){
      if(!c.active)return;
      panel.hidden=!c.playable();if(!c.playable())$('gardenAction').hidden=true;
      if(!c.playable())$('tAct').hidden=true;
    },
    message(key){if(!c.session)return;c.session.message=key;$('gardenMessage').textContent=c.t(key);},
    showCard(intro=false){
      if(card.open||!(intro?g.exploration?.playable():c.playable()))return;
      c.cardContext={intro,paused:g.paused,focus:document.activeElement};
      g.input.clearHeld();g.paused=true;
      $('gardenEnter').hidden=!intro;card.showModal();card.scrollTop=0;
      c.syncVisibility();g.exploration?.syncVisibility();$('gardenClose').focus();
    },
    dismissCard(restore=true){
      const previous=c.cardContext;if(!previous)return;
      c.cardContext=null;card.close();g.input.clearHeld();g.paused=previous.paused;
      if(restore){c.syncVisibility();g.exploration?.syncVisibility();if(previous.focus?.isConnected)previous.focus.focus();}
    },
    open(){
      if(!c.cardContext?.intro||!g.exploration.active||c.active)return false;
      const returnWalk={position:g.player.pos.clone(),yaw:g.player.yaw,camera:{yaw:g.cam.yaw,pitch:g.cam.pitch,dist:g.cam.dist}};
      c.dismissCard(false);g.exploration.close();g.clearChapter();
      g.ch=world;g.chIdx=-1;g.applyEnv(world.env);g.buildTerrain(world);g.setDavid(CH1.david||{});
      const owned=world.build(g);
      const animals=[['lion',-3,5],['lamb',-.5,3],['wolf',3,5]].map(([kind,x,z])=>{
        const model=kind==='wolf'?makeGardenWolf(THREE):makeQuadruped(kind==='lamb'?'sheep':'lion',{scale:kind==='lamb'?.7:1});
        owned.materials.push(...(model.materials||[]));
        return{kind,a:new Actor(g,model,x,z,0),home:{x,z},friend:false,state:'rest',path:[],repath:0,playTime:0};
      });
      c.active=true;c.session={token:g.tok,disposed:false,returnWalk,animals,selected:animals[0],companion:null,nav:createGardenNavigation(g.colliders),message:'welcome',owned,petUntil:0,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
      const s=c.session;
      // Dispose at actual world removal, after any title/story fade. Disposing
      // while the old scene still renders can recreate GPU resources mid-fade.
      g.onChapterCleanup(()=>{
        if(c.session===s)c.close();
        for(const material of s.owned.materials)material.dispose();
        for(const mesh of s.owned.instanced)mesh.dispose();
        s.owned.disposed=true;
      });
      g.mode='play';g.paused=false;g.lock=false;g.input.touchRun=false;$('tRun').classList.remove('on');
      g.enableSling(false,0);g.setObjective(null);g.audio.setMood(CH1.mood);
      document.body.classList.add('peace-garden');$('hud').hidden=false;$('touch').hidden=!isTouch;
      $('gardenChoice').value='lion';$('gardenGuide').open=false;$('gardenInteractions').open=!isTouch;panel.scrollTop=0;
      g.placePlayer(...world.start);c.resetCamera();c.translate();c.message('welcome');
      g.every(dt=>c.tick(s,dt));c.syncVisibility();g.canvas.focus();return true;
    },
    resetCamera(){if(!c.active)return;g.input.clearHeld();g.cam.yaw=g.player.yaw+Math.PI+.22;g.cam.pitch=.3;g.cam.dist=9;g.cam.tgt.set(g.player.pos.x,g.player.pos.y+1.5,g.player.pos.z);g.updateCamera(0);g.canvas.focus();},
    select(kind){
      if(!c.playable())return;const a=c.session.animals.find(a=>a.kind===kind);if(!a)return;
      c.stopFollowing();c.session.selected=a;g.input.clearHeld();g.player.pose='auto';c.message('selected');c.interactFrame(false);
    },
    stopFollowing(){const a=c.session?.companion;if(a){a.state='rest';a.path=[];a.a.stop();}if(c.session)c.session.companion=null;},
    act(kind='pet'){
      if(!c.playable())return;const s=c.session,a=s.selected;
      if(dist(a.a.pos,g.player.pos)>4.5){c.message('far');return;}
      g.input.clearHeld();g.player.pose='auto';a.friend=true;
      if(kind==='follow'){
        c.stopFollowing();a.state='follow';a.playTime=0;a.path=[];a.repath=0;s.companion=a;c.message('following');
      }else if(kind==='rest'){
        c.stopFollowing();a.state='rest';a.playTime=0;a.path=[];a.a.stop();g.player.pose='sit';c.message('resting');
      }else if(kind==='play'){
        c.stopFollowing();for(const friend of s.animals){if(dist(friend.a.pos,g.player.pos)<9){friend.state='play';friend.playTime=6;friend.path=[];friend.a.stop();}}
        c.message('playing');
      }else{
        a.a.lookAt(g.player.pos.x,g.player.pos.z);a.playTime=1.3;g.player.pose='point';s.petUntil=g.time+1.3;
        g.particles.emit(a.a.pos.clone().add(new THREE.Vector3(0,1.3,0)),9,{color:0xffdf98,speed:.6,up:1,life:1.2,gravity:-.3});
        c.message('petted');
      }
      c.interactFrame(false);g.canvas.focus();
    },
    interactFrame(consume=true){
      if(!c.active)return;c.syncVisibility();$('prompt').hidden=true;
      const a=c.session.selected,near=dist(g.player.pos,a.a.pos)<=4.5,visible=c.playable();
      const label=c.t(a.kind)+' · '+c.t('pet');
      $('gardenAction').hidden=!visible||!near;$('gardenAction').textContent=(isTouch?'':'E · ')+label;
      $('tAct').hidden=!isTouch||!visible||!near;$('tActL').textContent=c.t('pet');
      for(const id of ['gardenPet','gardenPlay','gardenFollow','gardenRest'])$(id).disabled=!near;
      const status=c.t(a.kind)+' · '+c.t(near?'near':'far');
      if($('gardenProximity').textContent!==status)$('gardenProximity').textContent=status;
      g.setWaypoint(a.a.pos);
      if(consume&&g.input.act){g.input.act=false;c.act();}
    },
    tick(s,dt){
      if(!c.active||c.session!==s||s.disposed||s.token!==g.tok)return false;
      c.syncVisibility();if(!c.playable())return true;
      if(g.input.moveVec().m>.05||(g.player.pose==='point'&&g.time>s.petUntil))g.player.pose='auto';
      for(const a of s.animals){
        a.a.stop(); // Movement is owned here; Actor's straight-line destinations cannot cut corners.
        a.playTime=Math.max(0,a.playTime-dt);
        if(a.state==='play'&&!a.playTime)a.state='rest';
        if(a.state==='follow'){
          a.repath-=dt;
          if(a.repath<=0){
            a.repath=.5;const p=g.player.pos,yaw=g.player.yaw;
            let target={x:p.x-Math.sin(yaw)*2.6,z:p.z-Math.cos(yaw)*2.6};
            if(!s.nav.clear(target.x,target.z))target={x:p.x,z:p.z};
            a.path=s.nav.path(a.a.pos,target);
          }
          let target=a.path[0];if(target&&dist(a.a.pos,target)<.15){a.path.shift();target=a.path[0];}
          if(target&&dist(a.a.pos,g.player.pos)>2){
            const p=a.a.pos,d=dist(p,target),step=Math.min(d,dt*8.6),nx=p.x+(target.x-p.x)/d*step,nz=p.z+(target.z-p.z)/d*step;
            if(s.nav.segment(p,{x:nx,z:nz})){a.a.yaw=Math.atan2(nx-p.x,nz-p.z);p.set(nx,g.groundAt(nx,nz),nz);a.a.speed=step/Math.max(dt,.001);a.a.m.update(dt,a.a.speed);}
          }
        }
        a.a.m.graze=a.state==='rest'?.5:0;a.a.sync();
        // Gentle play bow / hop, bounded to an open spot. Reduced motion stays still.
        if(a.playTime>0&&!s.reducedMotion){a.a.m.root.position.y+=Math.abs(Math.sin((6-a.playTime)*5))*.22;}
      }
      return true;
    },
    home(){
      if(!c.playable())return;c.stopFollowing();g.input.clearHeld();g.input.touchRun=false;$('tRun').classList.remove('on');g.player.pose='auto';
      for(const a of c.session.animals){a.a.pos.set(a.home.x,0,a.home.z);a.a.stop();a.a.sync();a.state='rest';a.playTime=0;a.path=[];}
      g.placePlayer(...world.start);c.resetCamera();c.message('returned');
    },
    back(){
      if(!c.playable())return;const saved=c.session.returnWalk;c.close();g.mode='title';g.exploration.open();
      g.placePlayer(saved.position.x,saved.position.z,saved.yaw);Object.assign(g.cam,saved.camera);g.cam.tgt.set(saved.position.x,saved.position.y+1.65,saved.position.z);g.updateCamera(0);g.canvas.focus();
    },
    close(){
      if(!c.active)return;c.dismissCard(false);const s=c.session;s.disposed=true;c.stopFollowing();c.active=false;c.session=null;
      for(const a of s.animals){a.path=[];a.a.stop();}
      g.input.clearHeld();g.player.pose='auto';g.paused=false;g.setWaypoint(null);g.setObjective(null);
      panel.hidden=true;$('gardenAction').hidden=true;$('tAct').hidden=false;
      document.body.classList.remove('peace-garden');g.applyLang();
    }
  };
  $('walkGarden').onclick=()=>c.showCard(true);$('gardenEnter').onclick=()=>c.open();$('gardenClose').onclick=()=>c.dismissCard();
  $('gardenVerse').onclick=()=>c.showCard();$('gardenBack').onclick=()=>c.back();$('gardenChoice').onchange=e=>c.select(e.target.value);
  for(const [id,kind] of [['gardenPet','pet'],['gardenPlay','play'],['gardenFollow','follow'],['gardenRest','rest']])$(id).onclick=()=>c.act(kind);
  $('gardenHome').onclick=()=>c.home();$('gardenCamera').onclick=()=>c.resetCamera();$('gardenAction').onclick=()=>c.act();
  panel.onkeydown=e=>{if(e.code!=='Escape')e.stopPropagation();};panel.onfocusin=()=>g.input.clearHeld();
  card.addEventListener('cancel',e=>{e.preventDefault();c.dismissCard();});
  card.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.code==='Escape'){e.preventDefault();c.dismissCard();}
    if(e.code==='Tab'){
      e.preventDefault();
      const controls=[...card.querySelectorAll('a[href],button')].filter(el=>!el.hidden&&!el.disabled);
      const index=controls.indexOf(document.activeElement);
      controls[(index+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();
    }
  });
  c.translate();return c;
}
