import { GARDEN_ACTIVITIES, createGardenJournal } from './peace-garden-activities.js';
import { createGardenNavigation } from './peace-garden-navigation.js';
import { createGardenWorld, makeGardenWolf } from './peace-garden-world.js';

const COPY = {
  title:['평화의 동산','Garden of Peace'], entry:['평화의 동산으로','Visit the Garden of Peace'],
  intro:['하나님이 약속하신 평화의 모습을 바탕으로 상상한 공간입니다. 동물들과 친구가 되어 함께 걸어 보세요.','An imagined place inspired by the peace God has promised. Befriend the animals and walk together.'],
  context:['이사야 11:6–9과 65:25에는 이리와 어린 양, 송아지와 어린 사자가 함께 지내며 서로 해치지 않는 모습이 나옵니다. 사자와 양이 함께 노는 모습은 이 약속을 바탕으로 한 창작 표현이며, 작은 만남과 놀이도 다윗의 생애에 있었던 사건을 재현한 것이 아닙니다.','Isaiah 11:6–9 and 65:25 describe wolves with lambs, calves with young lions, and creatures living without harm. Lions and lambs playing here are a creative expression of that promise, and these small activities are not events from David’s life.'],
  verse:['나의 거룩한 산 모든 곳에서 해됨도 없고 상함도 없을 것이니','They shall not hurt nor destroy in all my holy mountain'],
  cite:['이사야 11:9 · 개역한글','Isaiah 11:9 · KJV'],
  enter:['동산 들어가기','Enter the garden'], close:['닫기 · 돌아가기','Close · Go back'],
  scripture:['말씀 읽기','Read the scripture'], back:['산책으로 돌아가기','Back to the walk'],
  lion:['사자','Lion'], lamb:['어린 양','Lamb'], wolf:['이리 (늑대)','Wolf'],
  pet:['쓰다듬기','Pet'], play:['함께 놀기','Play together'], follow:['함께 걷기','Walk together'], rest:['함께 쉬기','Rest together'],
  interactions:['친구와 함께','Time with friends'], guide:['동산 안내','Garden guide'], home:['동산 입구로','Garden entrance'], camera:['시점 되돌리기','Reset camera'],
  controls:['WASD·방향키로 이동, Shift로 달리기, 화면을 끌어 둘러보기. E로 가까운 동물에게 인사하거나 활동을 이어가요.','Move with WASD / arrows, run with Shift, drag to look. Press E to greet a nearby animal or continue an activity.'],
  touch:['왼쪽 조이스틱으로 이동하고 빈 화면을 끌어 둘러보세요. 동물 곁에서 행동 버튼을 눌러요.','Move with the left stick and drag the open view to look. Tap the action button beside an animal.'],
  welcome:['서두르지 않아도 괜찮아요. 작은 만남을 찾아 걸어 보세요.','There is no hurry. Wander and see whom you meet.'],
  near:['가까이 있어요. 쓰다듬거나 함께 놀아 보세요.','Your friend is nearby. Pet them or play together.'],
  far:['빛기둥이 있는 친구 곁으로 다가가세요.','Walk closer to your friend at the light.'],
  petted:['친구가 반가워하며 다가와요.','Your friend is happy to see you.'],
  playing:['친구들이 함께 폴짝폴짝 놀아요. 언제든 함께 걸어도 좋아요.','Your friends are playing together. You can walk together whenever you like.'],
  following:['친구가 뒤따라 걸어요. 다른 친구를 만나도 우정은 그대로예요.','Your friend is following. Meeting another animal does not erase your friendship.'],
  resting:['친구와 잠시 쉬어요. 움직이면 다윗은 다시 일어나요.','Rest beside your friend. Move to stand up again.'],
  wander:['작은 만남을 찾아서','A little encounter awaits'],
  explore:['꽃길과 나무 그늘을 걸어 보세요. 가까이에서 만난 동물이 작은 놀이를 제안해요.','Explore the flower path and shady trees. Animals you meet nearby may invite you to play.'],
  friend:['함께한 친구','Your friend'], encounter:['반가운 만남','A new encounter'], progress:['함께한 발걸음','Shared steps'],
  resume:['이어서 함께하기','Continue together'], cancel:['나중에 이어하기','Continue another time'],
  hint:['발자국 힌트 보기','Show a trail hint'], hintShown:['빛기둥 쪽에 친구의 발자국이 있어요. 천천히 찾아가 보세요.','Follow the light toward your friend’s trail. Take your time.'],
  cancelled:['잠시 쉬어도 괜찮아요. 다시 만나면 함께한 곳부터 이어가요.','It is fine to take a break. Meet again to continue from your last shared step.'],
  release:['동행 친구 쉬게 하기','Let your companion rest'], released:['친구가 이곳에서 쉬어요. 다시 다가가면 함께 걸을 수 있어요.','Your friend rests here. Come close again whenever you want to walk together.'],
  memorySession:['이 브라우저에서는 저장할 수 없어, 이 페이지를 열어 둔 동안만 함께한 기억이 남아요.','This browser cannot save these memories. They last while this page stays open.'],
  memoryNote:['함께한 활동과 우정은 이 기기에 별도로 기억해요. 이야기 진도와는 연결되지 않아요.','Shared activities and friendships are remembered separately on this device, apart from story progress.'],
  lambTask:['어린 양의 작은 부탁','The lamb’s little request'],
  lambOffer:['어린 양이 풀밭의 양 무리를 찾고 있어요. 함께 찾아가 볼까요?','This lamb is looking for the sheep in the meadow. Shall we go together?'],
  lambStart:['양 무리 찾아주기','Help find the flock'], lambStarted:['양이 뒤따라와요. 빛기둥이 있는 풀밭으로 함께 걸어가요.','The lamb follows you. Walk together to the meadow at the light.'],
  lambRoute:['풀밭의 양 무리까지 함께 가요. 양이 따라오도록 가까이에서 기다려도 좋아요.','Walk to the flock in the meadow. You can pause nearby while the lamb catches up.'],
  lambFinish:['양 친구들에게 인사하기','Greet the flock'], lambComplete:['어린 양이 무리를 만났어요! 함께 걸어 준 다윗과 친구가 되었어요.','The lamb found its flock! After your walk together, you are now friends.'],
  lionTask:['사자와 꽃길 산책','A flower-path stroll'],
  lionOffer:['사자가 꽃길을 바라봐요. 두 곳에 들러 꽃향기와 풍경을 함께 즐겨 볼까요?','The lion is looking toward the flowers. Visit two places to enjoy the flowers and the view together.'],
  lionStart:['사자와 꽃길 걷기','Stroll with the lion'], lionStarted:['첫 꽃길까지 나란히 걸어가요. 서두를 필요는 없어요.','Walk together to the first flower stop. There is no need to hurry.'],
  lionRoute:['빛기둥이 있는 꽃길에서 사자와 함께 멈춰 보세요.','Pause together with the lion at the flower-path light.'],
  lionFinish:['꽃길 함께 바라보기','Enjoy the flowers together'], lionNext:['첫 풍경을 함께 봤어요. 이제 다음 꽃길까지 걸어가 볼까요?','You enjoyed the first view together. Let’s visit the next flower stop.'],
  lionComplete:['두 풍경을 함께 즐겼어요! 사자와 느긋한 산책 친구가 되었어요.','Two lovely views shared! The lion is now your strolling friend.'],
  wolfTask:['이리와 숨바꼭질','Hide-and-seek with the wolf'],
  wolfOffer:['이리가 나무 그늘 뒤로 고개를 내밀어요. 두 번의 숨바꼭질을 해 볼까요?','The wolf peeks out beside the shade. Would you like two rounds of hide-and-seek?'],
  wolfStart:['숨바꼭질 하기','Play hide-and-seek'], wolfStarted:['친구가 숨을 곳으로 가요. 준비되면 그늘을 둘러보세요.','The wolf is going to a hiding place. Explore the shade when your friend is ready.'],
  wolfHiding:['새 숨을 곳으로 가고 있어요. 천천히 따라가도 괜찮아요.','Your friend is moving to a hiding place. It is fine to follow slowly.'],
  wolfClue1:['작은 올리브나무 뒤에서 귀가 쫑긋 보여요. 찾기 어렵다면 발자국 힌트를 눌러요.','Look for ears behind the small olive tree. Use the trail hint if you would like help.'],
  wolfClue2:['이번에는 두 바위 너머예요. 천천히 돌아서 찾아보세요.','This time, look beyond the two rocks. Take your time walking around them.'],
  wolfFinish:['찾았다! 인사하기','Found you! Say hello'], wolfNext:['찾았다! 이번에는 바위 너머에서 다시 만나요.','Found you! Let’s meet again beyond the rocks.'],
  wolfComplete:['두 번 모두 만났어요! 이리가 꼬리를 흔들며 친구가 되었어요.','You found each other twice! With a wagging tail, the wolf is now your friend.'],
  returned:['입구로 돌아왔어요. 동물들은 원래 자리에서 기다리고, 함께한 기억은 남아 있어요.','Back at the entrance. The animals return to their places and remember your time together.'],
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
  const put=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
  panel.dataset.touch=String(isTouch);
  const world=createGardenWorld({THREE,CH1});
  let storage;try{storage=window.localStorage;}catch{}
  const journal=createGardenJournal(storage);
  const c={
    active:false,session:null,cardContext:null,journal,
    t(key){return COPY[key][getLanguage()==='en'?1:0];},
    translate(){
      for(const el of document.querySelectorAll('[data-garden-copy]'))el.textContent=c.t(el.dataset.gardenCopy);
      $('gardenControls').textContent=c.t(isTouch?'touch':'controls');panel.setAttribute('aria-label',c.t('title'));
      if(!c.active)return;
      $('hudTitle').textContent=c.t('title');$('hudRef').textContent=world.ref[getLanguage()];$('mRestart').textContent=c.t('home');
      c.message(c.session.message);c.interactFrame(false);
    },
    playable(){return c.active&&g.mode==='play'&&!g.paused&&!g.lock&&!g.dq&&!card.open;},
    syncVisibility(){
      if(!c.active)return;panel.hidden=!c.playable();
      if(!c.playable()){$('gardenAction').hidden=true;$('tAct').hidden=true;}
    },
    message(key){if(!c.session)return;c.session.message=key;put('gardenMessage',c.t(key));},
    showCard(intro=false){
      if(card.open||!(intro?g.exploration?.playable():c.playable()))return;
      c.cardContext={intro,paused:g.paused,focus:document.activeElement};g.input.clearHeld();g.paused=true;
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
      const animals=Object.entries(GARDEN_ACTIVITIES).map(([kind,activity])=>{
        const [x,z]=activity.home;
        const model=kind==='wolf'?makeGardenWolf(THREE):makeQuadruped(kind==='lamb'?'sheep':'lion',{scale:kind==='lamb'?.7:1});
        owned.materials.push(...(model.materials||[]));
        return{kind,a:new Actor(g,model,x,z,0),home:{x,z},friend:journal.get(kind).friend,state:'rest',path:[],repath:0,playTime:0};
      });
      // Two grazing sheep make the lamb's destination visible in the world.
      const flock=[[-16,0],[-14,-.5]].map(([x,z])=>new Actor(g,makeQuadruped('sheep',{scale:.9}),x,z,.3));
      flock.forEach(a=>a.m.graze=1);
      c.active=true;c.session={token:g.tok,disposed:false,returnWalk,animals,flock,selected:null,companion:null,activity:null,nav:createGardenNavigation(g.colliders),message:'welcome',owned,petUntil:0,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
      const s=c.session;
      // Dispose at actual world removal, after title/story fades stop rendering it.
      g.onChapterCleanup(()=>{
        if(c.session===s)c.close();
        for(const material of s.owned.materials)material.dispose();
        for(const mesh of s.owned.instanced)mesh.dispose();s.owned.disposed=true;
      });
      g.mode='play';g.paused=false;g.lock=false;g.input.touchRun=false;$('tRun').classList.remove('on');
      g.enableSling(false,0);g.setObjective(null);g.audio.setMood(CH1.mood);
      document.body.classList.add('peace-garden');$('hud').hidden=false;$('touch').hidden=!isTouch;
      $('gardenGuide').open=false;$('gardenInteractions').open=!isTouch;$('gardenBody').scrollTop=0;
      g.placePlayer(...world.start);c.resetCamera();c.translate();c.message('welcome');
      g.every(dt=>c.tick(s,dt));c.syncVisibility();g.canvas.focus();return true;
    },
    resetCamera(){if(!c.active)return;g.input.clearHeld();g.cam.yaw=g.player.yaw+Math.PI+.22;g.cam.pitch=.3;g.cam.dist=9;g.cam.tgt.set(g.player.pos.x,g.player.pos.y+1.5,g.player.pos.z);g.updateCamera(0);g.canvas.focus();},
    nearest(){
      const s=c.session;if(!s)return null;
      // An existing companion should not obscure a new animal encountered nearby.
      return s.animals.filter(a=>dist(a.a.pos,g.player.pos)<=4.5).sort((a,b)=>(dist(a.a.pos,g.player.pos)+(a===s.companion?4:0))-(dist(b.a.pos,g.player.pos)+(b===s.companion?4:0)))[0]||null;
    },
    stopFollowing(){const a=c.session?.companion;if(a){a.state='rest';a.path=[];a.a.stop();}if(c.session)c.session.companion=null;},
    goal(){const task=c.session?.activity;return task?GARDEN_ACTIVITIES[task.animal.kind].steps[task.step]:null;},
    canAdvance(){
      const task=c.session?.activity;if(!task)return false;
      const a=task.animal,goal=c.goal();
      if(a.kind==='wolf')return a.state==='seek'&&dist(a.a.pos,g.player.pos)<=4;
      return dist(g.player.pos,goal)<=2.5&&dist(a.a.pos,goal)<=4.3;
    },
    prepareStep(){
      const s=c.session,task=s.activity,a=task.animal;a.path=[];a.repath=0;a.a.stop();
      if(a.kind==='wolf'){a.state='hiding';a.path=s.nav.path(a.a.pos,c.goal());}
      else a.state='taskFollow';
    },
    startActivity(){
      if(!c.playable()||c.session.activity)return;
      const a=c.nearest();if(!a||a.friend)return;
      journal.meet(a.kind);c.stopFollowing();g.input.clearHeld();g.player.pose='auto';
      c.session.activity={animal:a,step:journal.get(a.kind).step,hint:false};
      c.prepareStep();c.message(a.kind+'Started');c.interactFrame(false);g.canvas.focus();
    },
    cancelActivity(feedback=true){
      const s=c.session,task=s?.activity;if(!task)return;
      task.animal.state='rest';task.animal.path=[];task.animal.a.stop();s.activity=null;
      g.input.clearHeld();g.setWaypoint(null);if(feedback)c.message('cancelled');
    },
    advanceActivity(){
      if(!c.playable()||!c.canAdvance())return;
      const s=c.session,task=s.activity,a=task.animal,entry=journal.advance(a.kind);
      a.playTime=1.8;g.input.clearHeld();g.audio.sfx('chime',1);
      g.particles.emit(a.a.pos.clone().add(new THREE.Vector3(0,1.3,0)),9,{color:0xffdf98,speed:.6,up:1,life:1.2,gravity:-.3});
      if(entry.friend){
        a.friend=true;a.state='play';a.path=[];a.a.stop();s.activity=null;g.setWaypoint(null);
        c.message(a.kind+'Complete');$('gardenInteractions').open=!isTouch;
      }else{task.step=entry.step;task.hint=false;c.prepareStep();c.message(a.kind+'Next');}
      c.interactFrame(false);g.canvas.focus();
    },
    act(kind='primary'){
      if(!c.playable())return;
      const s=c.session;
      if(kind==='primary'){
        if(s.activity){c.advanceActivity();return;}
        if(!c.nearest()?.friend){c.startActivity();return;}
        kind='pet';
      }
      const a=c.nearest();if(!a||!a.friend||s.activity)return;
      g.input.clearHeld();g.player.pose='auto';
      if(kind==='follow'){
        c.stopFollowing();a.state='follow';a.playTime=0;a.path=[];a.repath=0;s.companion=a;c.message('following');
      }else if(kind==='rest'){
        c.stopFollowing();a.state='rest';a.playTime=0;a.path=[];a.a.stop();g.player.pose='sit';c.message('resting');
      }else if(kind==='play'){
        c.stopFollowing();for(const friend of s.animals)if(friend.friend&&dist(friend.a.pos,g.player.pos)<9){friend.state='play';friend.playTime=6;friend.path=[];friend.a.stop();}
        c.message('playing');
      }else{
        a.a.lookAt(g.player.pos.x,g.player.pos.z);a.playTime=1.3;g.player.pose='point';s.petUntil=g.time+1.3;
        g.particles.emit(a.a.pos.clone().add(new THREE.Vector3(0,1.3,0)),9,{color:0xffdf98,speed:.6,up:1,life:1.2,gravity:-.3});c.message('petted');
      }
      c.interactFrame(false);g.canvas.focus();
    },
    interactFrame(consume=true){
      if(!c.active)return;c.syncVisibility();$('prompt').hidden=true;
      const s=c.session,task=s.activity,a=task?.animal||c.nearest(),visible=c.playable();s.selected=a;
      if(a&&!task)journal.meet(a.kind);
      put('gardenEncounter',task?c.t(a.kind+'Task'):a?c.t(a.kind)+(a.friend?' · '+c.t('friend'):' · '+c.t('encounter')):c.t('wander'));
      let label='',waypoint=null;
      if(task){
        const ready=c.canAdvance(),goal=c.goal();
        const instruction=ready?c.t(a.kind+'Finish'):a.kind==='wolf'?c.t(a.state==='hiding'?'wolfHiding':task.step===0?'wolfClue1':'wolfClue2'):c.t(a.kind+'Route');
        put('gardenProximity',instruction);put('gardenProgress',`${c.t('progress')} ${task.step} / ${GARDEN_ACTIVITIES[a.kind].steps.length}`);
        if(ready)label=c.t(a.kind+'Finish');
        if(a.kind!=='wolf'||task.hint)waypoint=new THREE.Vector3(goal.x,0,goal.z);
      }else{
        put('gardenProximity',a?c.t(a.friend?'near':a.kind+'Offer'):c.t('explore'));
        if(a)label=c.t(a.friend?'pet':journal.get(a.kind).step>0?'resume':a.kind+'Start');
      }
      $('gardenProgress').hidden=!task;$('gardenTaskControls').hidden=!task;
      $('gardenHint').hidden=!task||a?.kind!=='wolf';
      $('gardenStart').hidden=!!task||!a||a.friend;put('gardenStart',label);
      $('gardenInteractions').hidden=!!task||!a?.friend;
      $('gardenRelease').hidden=!s.companion;put('gardenMemory',c.t(journal.persistent?'memoryNote':'memorySession'));
      $('gardenAction').hidden=!visible||!label;put('gardenAction',(isTouch?'':'E · ')+label);
      $('tAct').hidden=!isTouch||!visible||!label;put('tActL',label);
      g.setWaypoint(waypoint);
      if(consume&&g.input.act){g.input.act=false;c.act();}
    },
    moveAnimal(a,dt,stopDistance=0){
      const s=c.session;let target=a.path[0];
      if(target&&dist(a.a.pos,target)<.15){a.path.shift();target=a.path[0];}
      if(!target||dist(a.a.pos,g.player.pos)<stopDistance)return;
      const p=a.a.pos,d=dist(p,target),step=Math.min(d,dt*(a.state==='hiding'?3.5:8.6));
      const nx=p.x+(target.x-p.x)/d*step,nz=p.z+(target.z-p.z)/d*step;
      if(s.nav.segment(p,{x:nx,z:nz})){a.a.yaw=Math.atan2(nx-p.x,nz-p.z);p.set(nx,g.groundAt(nx,nz),nz);a.a.speed=step/Math.max(dt,.001);a.a.m.update(dt,a.a.speed);}
    },
    tick(s,dt){
      if(!c.active||c.session!==s||s.disposed||s.token!==g.tok)return false;
      c.syncVisibility();if(!c.playable())return true;
      if(g.input.moveVec().m>.05||(g.player.pose==='point'&&g.time>s.petUntil))g.player.pose='auto';
      for(const a of s.animals){
        a.a.stop();a.playTime=Math.max(0,a.playTime-dt);
        if(a.state==='play'&&!a.playTime)a.state='rest';
        if(a.state==='follow'||a.state==='taskFollow'){
          a.repath-=dt;
          if(a.repath<=0){
            a.repath=.5;const p=g.player.pos,yaw=g.player.yaw;
            let target={x:p.x-Math.sin(yaw)*2.6,z:p.z-Math.cos(yaw)*2.6};
            if(!s.nav.clear(target.x,target.z))target={x:p.x,z:p.z};
            a.path=s.nav.path(a.a.pos,target);
          }
          c.moveAnimal(a,dt,2);
        }else if(a.state==='hiding'){
          c.moveAnimal(a,dt);
          if(dist(a.a.pos,c.goal())<.25){a.state='seek';a.path=[];a.a.lookAt(g.player.pos.x,g.player.pos.z);}
        }
        a.a.m.graze=a.state==='rest'?.5:0;a.a.sync();
        if(a.playTime>0&&!s.reducedMotion)a.a.m.root.position.y+=Math.abs(Math.sin((6-a.playTime)*5))*.22;
      }
      return true;
    },
    home(){
      if(!c.playable())return;c.cancelActivity(false);c.stopFollowing();g.input.clearHeld();g.input.touchRun=false;$('tRun').classList.remove('on');g.player.pose='auto';
      for(const a of c.session.animals){a.a.pos.set(a.home.x,0,a.home.z);a.a.stop();a.a.sync();a.state='rest';a.playTime=0;a.path=[];}
      g.placePlayer(...world.start);c.resetCamera();c.message('returned');
    },
    back(){
      if(!c.playable())return;const saved=c.session.returnWalk;c.close();g.mode='title';g.exploration.open();
      g.placePlayer(saved.position.x,saved.position.z,saved.yaw);Object.assign(g.cam,saved.camera);g.cam.tgt.set(saved.position.x,saved.position.y+1.65,saved.position.z);g.updateCamera(0);g.canvas.focus();
    },
    close(){
      if(!c.active)return;c.dismissCard(false);const s=c.session;c.cancelActivity(false);s.disposed=true;c.stopFollowing();c.active=false;c.session=null;
      for(const a of s.animals){a.path=[];a.a.stop();}
      g.input.clearHeld();g.player.pose='auto';g.paused=false;g.setWaypoint(null);g.setObjective(null);
      panel.hidden=true;$('gardenAction').hidden=true;$('tAct').hidden=false;
      document.body.classList.remove('peace-garden');g.applyLang();
    }
  };
  $('walkGarden').onclick=()=>c.showCard(true);$('gardenEnter').onclick=()=>c.open();$('gardenClose').onclick=()=>c.dismissCard();
  $('gardenVerse').onclick=()=>c.showCard();$('gardenBack').onclick=()=>c.back();$('gardenStart').onclick=()=>c.startActivity();
  $('gardenCancel').onclick=()=>{if(c.playable()){c.cancelActivity();c.interactFrame(false);g.canvas.focus();}};
  $('gardenHint').onclick=()=>{if(c.playable()&&c.session.activity){c.session.activity.hint=true;c.message('hintShown');c.interactFrame(false);g.canvas.focus();}};
  $('gardenRelease').onclick=()=>{if(c.playable()){c.stopFollowing();c.message('released');c.interactFrame(false);g.canvas.focus();}};
  for(const [id,kind] of [['gardenPet','pet'],['gardenPlay','play'],['gardenFollow','follow'],['gardenRest','rest']])$(id).onclick=()=>c.act(kind);
  $('gardenHome').onclick=()=>c.home();$('gardenCamera').onclick=()=>c.resetCamera();$('gardenAction').onclick=()=>c.act();
  panel.onkeydown=e=>{if(e.code!=='Escape')e.stopPropagation();};panel.onfocusin=()=>g.input.clearHeld();
  card.addEventListener('cancel',e=>{e.preventDefault();c.dismissCard();});
  card.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.code==='Escape'){e.preventDefault();c.dismissCard();}
    if(e.code==='Tab'){
      e.preventDefault();const controls=[...card.querySelectorAll('a[href],button')].filter(el=>!el.hidden&&!el.disabled),index=controls.indexOf(document.activeElement);
      controls[(index+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();
    }
  });
  c.translate();return c;
}
