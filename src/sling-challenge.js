import { CHALLENGE_RULES, CHALLENGE_COURSE_SEED, createChallengeState, advanceChallenge, challengeTarget, fireChallengeShot } from './sling-challenge-core.js';

const COPY = {
  name: ['물맷돌 챌린지', 'Sling Challenge'],
  subtitle: ['베들레헴 들판의 물매 연습장', 'The Bethlehem sling practice field'],
  rules: ['표적을 맞힐수록 더 작고 빠르게 움직이고, 제한 시간도 줄어들어요. 빗나가거나 시간이 다 되면 기회가 하나 줄어들어요. 기회는 3번이에요.', 'Targets get smaller and faster, with less time each round. A miss or timeout costs one of your three lives.'],
  controls: ['클릭 또는 F를 누르고 준비 표시가 뜨면 놓아 던져요. 마우스를 끌거나 방향키로 조준해요. 휴대폰은 물매 버튼을 누른 채 끌어 조준하고 놓아요.', 'Hold click or F until ready, then release. Drag or use arrow keys to aim. On a phone, hold and drag the Sling button, then release.'],
  scoring: ['모두 같은 코스예요. 명중 1,000점 + (라운드 − 1) × 10점 + 시간 보너스 0~10점. 한 단계 더 명중하는 것이 더 중요해요. 오래 돌려도 위력은 같아요. 최대 60라운드 또는 10분이에요.', 'Everyone plays the same course. Hit: 1,000 + (round − 1) × 10, plus a 0–10 time bonus. One more successful stage always matters more. Holding longer adds no power. Up to 60 rounds or 10 minutes.'],
  privacy: ['온라인 공개 시 최고 점수와 영문 이니셜만 함께 보여요. 이름·이메일·계정은 필요 없어요. 이야기 진행 상태는 바뀌지 않아요.', 'When online, only the best score and English initials are public. No name, email, or account is needed. Story progress is unchanged.'],
  record: ['최고 기록', 'Best record'], empty: ['아직 기록이 없어요', 'No record yet'],
  loading: ['기록을 불러오는 중…', 'Loading record…'], unavailable: ['온라인 순위가 아직 연결되지 않았어요. 연습은 바로 할 수 있어요.', 'The online board is not connected yet. You can still practice.'],
  connected: ['모든 플레이어가 함께 겨루는 온라인 최고 기록이에요.', 'A shared online best record for all players.'],
  online: ['온라인 도전 · 제출 제한 30분', 'ONLINE CHALLENGE · 30 MIN SUBMISSION LIMIT'],
  onlineStart: ['온라인 도전', 'Play online'],
  mock: ['로컬 서버 검증 체험 · 실제 온라인 순위 아님 · 제출 제한 30분', 'LOCAL SERVER TEST · NOT ONLINE · 30 MIN SUBMISSION LIMIT'],
  practice: ['연습 · 온라인 기록에 반영되지 않아요', 'PRACTICE · NO ONLINE SCORE'],
  start: ['연습 시작', 'Start practice'], test: ['서버 검증 체험', 'Try server validation'],
  back: ['처음으로', 'Back to title'], refresh: ['기록 다시 확인', 'Refresh record'],
  storyBack: ['2장 이야기 계속하기', 'Continue to Chapter 2'],
  learn: ['조작 익히기 · 표적 3개', 'Learn the controls · 3 targets'],
  tutorial: ['조작 연습 · 시간·점수 제한 없어요', 'LEARN · NO TIMER OR SCORE'],
  tutorialProgress: ['표적', 'TARGETS'], skip: ['연습 건너뛰기', 'Skip tutorial'],
  tutorialHint: ['물매를 누르고, 준비 표시가 뜨면 놓아요. 표적 3개를 맞혀 보세요.', 'Hold the sling, wait for the ready cue, then release. Hit three targets.'],
  tutorialDone: ['잘했어요! 이제 연습하거나 기록에 도전해 보세요.', 'Ready! You can practice or challenge the record now.'],
  practiceRetry: ['다시 연습', 'Practice again'], onlineRetry: ['기록 다시 도전', 'Challenge the record again'],
  recordUnavailable: ['온라인 기록 연결 전', 'Online record unavailable'],
  fieldBoard: ['물매 연습장', 'SLING PRACTICE'],
  cooldown: ['다음 돌 준비 중 · 잠시 뒤 다시 던져요', 'Next stone preparing · release again shortly'],
  preparing: ['도전을 준비하는 중…', 'Preparing attempt…'], startError: ['서버에 연결하지 못했어요. 다시 시도하거나 연습을 시작해 주세요.', 'Could not reach the server. Retry or start practice.'],
  result: ['도전 결과', 'Challenge result'], retry: ['다시 도전', 'Try again'],
  round: ['라운드', 'ROUND'], score: ['점수', 'SCORE'], lives: ['기회', 'LIVES'],
  hit: ['명중', 'Hit'], miss: ['빗나갔어요 · 다시 조준해 보세요', 'Miss · take aim again'], timeout: ['시간이 다 되었어요', 'Time is up'],
  finished: ['도전을 마쳤어요', 'Attempt complete'], verify: ['서버에서 기록을 확인하는 중…', 'Verifying the attempt…'],
  verified: ['기록을 확인했어요. 다음 최고 기록에 도전해 보세요!', 'Attempt verified. Try for the next record!'],
  qualifies: ['새 최고 기록이에요! 영문 이니셜 3자를 남길 수 있어요.', 'A new best! You can leave three English initials.'],
  initials: ['영문 이니셜 3자 (A–Z)', 'Three English initials (A–Z)'],
  notice: ['점수와 이니셜이 모든 플레이어에게 공개되는 데 동의해요. 본명은 입력하지 마세요.', 'I agree to publish my score and initials for all players. Do not enter your real name.'],
  mockNotice: ['이 체험에서는 현재 로컬 테스트 서버에만 저장돼요. 실제 온라인 순위에 공개되지 않아요.', 'This test saves only to the current local test server, not to an online board.'],
  submit: ['이니셜 새기기', 'Engrave initials'], submitting: ['기록을 저장하는 중…', 'Saving record…'],
  saved: ['이니셜과 기록을 저장했어요!', 'Your initials and score were saved!'],
  savedRefreshError: ['기록 저장은 확인했지만 현재 최고 기록을 불러오지 못했어요. 다시 확인해 주세요.', 'Your record was saved, but the current best could not be loaded. Refresh to check.'],
  surpassedRefreshError: ['더 높은 기록이 나와 등록되지 않았어요. 현재 최고 기록은 다시 확인해 주세요.', 'A higher score won, so yours was not recorded. Refresh to see the current best.'],
  rateLimited: ['요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.', 'Too many requests. Please wait before retrying.'],
  surpassed: ['그사이 더 높은 기록이 나왔어요. 다시 도전해 보세요!', 'Someone set a higher record meanwhile. Try again!'],
  badInitials: ['허용되는 영문 이니셜 3자와 공개 동의가 필요해요.', 'Enter three allowed English letters and agree to publication.'],
  network: ['연결이 끊겼어요. 화면을 나가지 않고 다시 확인하면 같은 기록을 재시도해요.', 'Connection interrupted. Retry here to check the same attempt.'],
  expired: ['이 도전의 기록 제출 시간이 지났어요. 새 도전을 시작해 주세요.', 'This attempt has expired. Start a new attempt.'],
  rejected: ['기록을 확인할 수 없어 등록하지 않았어요. 새 도전을 시작해 주세요.', 'This attempt could not be verified. Start a new attempt.'],
  recheck: ['기록 확인 재시도', 'Retry verification'],
  pauseHelp: ['이 모드는 제자리에서 조준해요. 방향키 또는 화면 끌기로 조준하고, F 또는 물매 버튼을 누른 뒤 놓아 던져요. 일시정지하면 돌리던 물매는 취소돼요.', 'Aim from a fixed spot. Use arrow keys or drag, then hold and release F or the Sling button. Pausing cancels a held throw.'],
};
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const API = '/api/sling-challenge';
const TUTORIAL_KEY = 'sling-challenge-tutorial-v2';
const serviceModeIsValid = data => data?.ruleVersion===CHALLENGE_RULES.version&&(data.mode==='local-mock'||(data.mode==='online'&&data.onlineEligible===true&&data.recordScope==='global'));

export function installSlingChallenge({ Game, THREE, CH1, getLanguage, isTouch }) {
  if (Game.prototype.__slingChallengeInstalled) return;
  Game.prototype.__slingChallengeInstalled = true;
  const original = {};
  for (const key of ['setupUI','applyLang','showTitle','startChapter','updateAim','updatePlayer','updateCamera','throwStone','aimRay','toggleMenu','showHelp','clearChapter']) original[key] = Game.prototype[key];
  Game.prototype.setupUI = function(...args) {
    original.setupUI.apply(this,args);
    this.slingChallenge = createController(this,{THREE,CH1,getLanguage,isTouch,original});
    const restart = document.getElementById('mRestart').onclick;
    document.getElementById('mRestart').onclick = () => this.slingChallenge.arena ? (this.slingChallenge.tutorial ? this.slingChallenge.startTutorial(this.slingChallenge.afterTutorial) : this.slingChallenge.start(this.slingChallenge.serverAttempt)) : restart();
    const title = document.getElementById('mTitleBtn').onclick;
    document.getElementById('mTitleBtn').onclick = () => this.slingChallenge.phase !== 'closed' ? this.slingChallenge.back() : title();
  };
  Game.prototype.applyLang = function(...args) { const result=original.applyLang.apply(this,args);this.slingChallenge?.translate();return result; };
  for (const key of ['showTitle','startChapter']) Game.prototype[key] = function(...args) {
    const c=this.slingChallenge;c?.close();const epoch=c?++c.navigationEpoch:0;if(c)c.navigationPending=true;
    const result=original[key].apply(this,args);const settled=()=>{if(c&&c.navigationEpoch===epoch)c.navigationPending=false;};
    Promise.resolve(result).then(settled,settled);return result;
  };
  Game.prototype.clearChapter = function(...args) { this.slingChallenge?.releaseWorld();return original.clearChapter.apply(this,args); };
  Game.prototype.updateAim = function(dt) {
    const c=this.slingChallenge;let aimDt=dt;if(c?.arena){if(c.phase!=='playing')return;c.tick();if(c.phase!=='playing')return;aimDt=c.prepareAim();}
    const result=original.updateAim.call(this,aimDt);if(c?.arena)c.decorateReadiness();return result;
  };
  Game.prototype.updatePlayer = function(dt) {
    if(!this.slingChallenge?.arena)return original.updatePlayer.call(this,dt);
    this.player.speed=0;this.player.yaw=this.cam.yaw+Math.PI;this.syncDavid();this.david.pose=this.aiming?'sling':'auto';this.david.update(dt,0);
  };
  Game.prototype.updateCamera = function(dt) {
    if(!this.slingChallenge?.arena)return original.updateCamera.call(this,dt);
    this.slingChallenge.camera(dt);
  };
  Game.prototype.throwStone = function(...args) {if(this.slingChallenge?.arena)return this.slingChallenge.throw();return original.throwStone.apply(this,args);};
  Game.prototype.aimRay = function(...args) {if(this.slingChallenge?.arena)return this.slingChallenge.aimRay();return original.aimRay.apply(this,args);};
  Game.prototype.toggleMenu = function(...args) {
    const c=this.slingChallenge;if(c?.phase==='lobby'){c.back();return;}
    if(c?.arena&&c.phase!=='playing')return;
    const result=original.toggleMenu.apply(this,args);if(c?.arena){c.lastNow=performance.now();c.chargeStarted=null;}return result;
  };
  Game.prototype.showHelp = function(...args) {
    const c=this.slingChallenge;
    if(!c?.arena)return original.showHelp.apply(this,args);
    this.input.clearHeld();this.paused=true;c.lastNow=performance.now();c.chargeStarted=null;
    const $=id=>document.getElementById(id);$('hTitle').textContent=c.t('name');$('hList').replaceChildren();
    const dd=document.createElement('dd');dd.textContent=c.t('pauseHelp');$('hList').append(dd);$('help').hidden=false;$('hOk').textContent=getLanguage()==='ko'?'계속하기':'Resume';
    return new Promise(resolve=>{$('hOk').onclick=()=>{this.input.clearHeld();$('help').hidden=true;this.paused=false;c.lastNow=performance.now();resolve();};$('hOk').focus();});
  };
}

function createController(g,{THREE,CH1,getLanguage,isTouch,original}) {
  const $=id=>document.getElementById(id);
  const panel=document.createElement('section');panel.id='challengePanel';panel.className='sling-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','challengeTitle');
  panel.innerHTML=`<div class="inner"><div class="eyebrow" id="challengeEyebrow"></div><h2 id="challengeTitle"></h2><div id="challengeIntro"><p id="challengeRules"></p><p id="challengeControls"></p><p class="challenge-note" id="challengeScoring"></p></div><div class="challenge-record"><small id="challengeRecordLabel"></small><strong id="challengeRecord"></strong></div><p class="challenge-note" id="challengePrivacy"></p><p class="challenge-note" id="challengeTestNotice"></p><p class="challenge-status" id="challengeStatus" role="status" aria-live="polite"></p><form id="challengeForm" hidden><label for="challengeInitials" id="challengeInitialsLabel"></label><input id="challengeInitials" type="text" maxlength="3" minlength="3" pattern="[A-Za-z]{3}" autocomplete="off" autocapitalize="characters" spellcheck="false" required><label class="consent"><input type="checkbox" id="challengeConsent" required><span id="challengeConsentText"></span></label><button type="submit" class="btn primary" id="challengeSubmit"></button></form><div class="challenge-actions"><button class="btn primary" id="challengeStart"></button><button class="btn" id="challengeTest" hidden></button><button class="btn" id="challengeRefresh"></button><button class="btn ghost" id="challengeBack"></button></div></div>`;
  document.body.append(panel);
  const hud=document.createElement('div');hud.id='challengeHud';hud.hidden=true;
  hud.innerHTML='<div id="challengeMode"></div><div class="challenge-stats"><span id="challengeRound"></span><span id="challengeScore"></span><span id="challengeLives"></span></div><div id="challengeTimer"><i></i></div><div id="challengeFeedback"></div><button class="btn ghost" id="challengeSkip" hidden></button>';
  document.body.append(hud);
  const learn=document.createElement('button');learn.id='challengeLearn';learn.className='btn ghost';$('challengeIntro').append(learn);
  const c={phase:'closed',arena:false,navigationEpoch:0,navigationPending:false,state:null,serverAttempt:false,attempt:null,record:null,recordState:'unavailable',mode:null,requestId:0,lastNow:0,elapsed:0,chargeStarted:null,shots:[],effects:[],materials:[],statusKey:null,busy:false,shotTarget:null,returnChapter:null,tutorial:false,tutorialHits:0,afterTutorial:null,tutorialSeen:false,boardTexture:null,boardCanvas:null,
    t:key=>COPY[key]?.[getLanguage()==='ko'?0:1]||key,
    translate(){
      $('bChallenge').textContent=c.t('name');$('challengeEyebrow').textContent=c.t('subtitle');$('challengeTitle').textContent=c.t(c.phase==='result'?'result':'name');
      for(const [id,key] of [['challengeRules','rules'],['challengeControls','controls'],['challengeScoring','scoring'],['challengePrivacy','privacy'],['challengeRecordLabel','record'],['challengeBack','back'],['challengeInitialsLabel','initials'],['challengeConsentText','notice'],['challengeSubmit','submit']])$(id).textContent=c.t(key);
      $('challengeStart').textContent=c.t(c.phase==='result'?(c.serverAttempt?'onlineRetry':'practiceRetry'):'start');$('challengeTest').textContent=c.t(c.mode==='online'?'onlineStart':'test');$('challengeRefresh').textContent=c.t(c.phase==='result'?'recheck':'refresh');
      $('challengeBack').textContent=c.t(c.returnChapter===1?'storyBack':'back');$('challengeLearn').textContent=c.t('learn');$('challengeSkip').textContent=c.t('skip');
      $('challengeStart').classList[c.mode==='online'&&c.phase==='lobby'?'remove':'add']('primary');$('challengeTest').classList[c.mode==='online'?'add':'remove']('primary');
      $('challengeTestNotice').textContent=c.mode==='local-mock'?c.t('mockNotice'):'';
      if(c.arena){$('hudTitle').textContent=c.t('name');$('hudRef').textContent=c.t(c.tutorial?'tutorial':c.serverAttempt?(c.mode==='online'?'online':'mock'):'practice');$('mRestart').textContent=c.t(c.tutorial?'learn':c.serverAttempt?'onlineRetry':'practiceRetry');$('mTitleBtn').textContent=c.t(c.returnChapter===1?'storyBack':'back');}
      if(c.statusKey)c.status(c.statusKey);c.renderRecord();if(c.state)c.render();
    },
    checkServiceMode(data){if(!serviceModeIsValid(data)||(c.mode&&data.mode!==c.mode))throw new Error('The record service changed modes');return data;},
    status(key,extra=''){c.statusKey=key;$('challengeStatus').textContent=c.t(key)+(extra?' '+extra:'');},
    renderRecord(){ $('challengeRecord').textContent=c.record?`${c.record.initials} · ${c.record.score.toLocaleString()}`:c.t(c.recordState==='loading'?'loading':c.recordState==='loaded'?'empty':'recordUnavailable');c.drawBoard(); },
    drawBoard(){
      const canvas=c.boardCanvas,ctx=canvas?.getContext?.('2d');if(!ctx)return;
      ctx.fillStyle='#aaa58b';ctx.fillRect(0,0,512,384);ctx.strokeStyle='#716b57';ctx.lineWidth=12;ctx.strokeRect(18,18,476,348);ctx.textAlign='center';ctx.fillStyle='#34382f';ctx.font='bold 34px serif';ctx.fillText(c.t('fieldBoard'),256,82);
      ctx.font='22px sans-serif';ctx.fillText(c.mode==='online'?c.t('record'):c.mode==='local-mock'?'LOCAL TEST':c.t('practice').split(' · ')[0],256,137);
      ctx.font='bold 56px serif';ctx.fillText(c.record?.initials??'—',256,216);ctx.font='bold 38px serif';ctx.fillText(c.record?c.record.score.toLocaleString():c.recordState==='loaded'?'0':'···',256,280);if(c.boardTexture)c.boardTexture.needsUpdate=true;
    },
    setBusy(busy){c.busy=busy;for(const id of ['challengeStart','challengeTest','challengeRefresh','challengeSubmit','challengeLearn'])$(id).disabled=busy;},
    async request(path,body){
      const controller=new AbortController();c.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),c.mode==='online'?18000:8000);
      try{const r=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:controller.signal});let data;try{data=await r.json();}catch{throw Object.assign(new Error('unavailable'),{code:'UNAVAILABLE'});}if(!r.ok)throw Object.assign(new Error(data.error?.message||data.error||'Request failed'),{code:data.error?.code||data.code,status:r.status,retryAfterMs:data.error?.retryAfterMs});return data;}finally{clearTimeout(timer);c.controllers.delete(controller);}
    },
    controllers:new Set(),
    cancelRequests(){c.requestId++;for(const controller of c.controllers)controller.abort();c.controllers.clear();c.setBusy(false);},
    openFromStory(nextChapter){
      if(nextChapter!==1||g.mode!=='endCard'||g.chIdx!==0||c.phase!=='closed')return;
      c.returnChapter=1;c.open(true);
    },
    open(fromStory=false){
      if(c.phase!=='closed'||(!fromStory&&(g.mode!=='title'||c.navigationPending))||(fromStory&&(g.mode!=='endCard'||g.chIdx!==0||c.returnChapter!==1)))return;
      if(!fromStory)c.returnChapter=null;
      g.input.clearHeld();g.paused=true;$('title').hidden=true;$('card').hidden=true;panel.hidden=false;c.phase='lobby';c.state=null;c.mode=null;c.record=null;c.recordState='loading';$('challengeIntro').hidden=false;$('challengeForm').hidden=true;$('challengeTest').hidden=true;$('challengeRefresh').hidden=false;c.translate();$('challengeStart').focus();c.loadRecord();
    },
    async loadRecord(){
      const requestId=++c.requestId;c.recordState='loading';c.renderRecord();c.status('loading');$('challengeRefresh').disabled=true;
      try{const data=await c.request('/record');if(requestId!==c.requestId||c.phase!=='lobby')return;
        if(!serviceModeIsValid(data))throw new Error('Unexpected service mode');
        c.mode=data.mode;c.record=data.record;c.recordState='loaded';c.status(data.mode==='online'?'connected':'mock');$('challengeTest').hidden=false;c.translate();
      }catch{if(requestId!==c.requestId||c.phase!=='lobby')return;c.mode=null;c.recordState='unavailable';c.status('unavailable');$('challengeTest').hidden=true;c.translate();}
      finally{if(requestId===c.requestId)$('challengeRefresh').disabled=false;}
    },
    hasTutorial(){try{return c.tutorialSeen||localStorage.getItem(TUTORIAL_KEY)==='1';}catch{return c.tutorialSeen;}},
    chooseStart(serverAttempt=false){if(c.busy)return;if(!c.hasTutorial())return c.startTutorial(serverAttempt);return c.start(serverAttempt);},
    startTutorial(after=null){if(c.busy)return;c.afterTutorial=after;return c.start(false,true);},
    async completeTutorial(){
      if(!c.tutorial||c.phase!=='playing')return;const after=c.afterTutorial;c.tutorial=false;c.afterTutorial=null;c.tutorialSeen=true;try{localStorage.setItem(TUTORIAL_KEY,'1');}catch{}
      g.input.clearHeld();$('challengeSkip').hidden=true;
      if(after!==null){await c.start(after);return;}
      c.showLobby('tutorialDone');if(c.recordState==='loading')void c.loadRecord();
    },
    showLobby(status){
      c.phase='lobby';c.tutorial=false;c.afterTutorial=null;c.serverAttempt=false;c.attempt=null;c.resultPayload=null;c.state=null;c.shots=[];g.input.clearHeld();g.paused=true;g.enableSling(false);hud.hidden=true;$('touch').hidden=true;$('challengeSkip').hidden=true;panel.hidden=false;$('challengeIntro').hidden=false;$('challengeForm').hidden=true;$('challengeRefresh').hidden=false;$('challengeTest').hidden=!c.mode;if(c.targetMesh)c.targetMesh.visible=false;if(c.post)c.post.visible=false;c.translate();c.status(status);$('challengeStart').focus();
    },
    target(){return c.tutorial?{position:[[-3,3.2,-9],[0,3.4,-10],[3,3.2,-9]][Math.min(c.tutorialHits,2)],radius:1.5,budgetMs:1,timeLeftMs:1}:challengeTarget(c.state);},
    async start(serverAttempt=false,tutorial=false){
      if(c.busy)return;c.cancelRequests();const requestId=c.requestId;c.setBusy(true);c.serverAttempt=serverAttempt;c.phase='starting';panel.hidden=false;$('menu').hidden=true;$('help').hidden=true;g.paused=true;g.input.clearHeld();c.status('preparing');
      try{
        let attempt=null;
        if(serverAttempt){const data=await c.request('/attempts',{});if(requestId!==c.requestId)return;if(!serviceModeIsValid(data)||(c.mode&&data.mode!==c.mode)||data.attempt?.version!==CHALLENGE_RULES.version||data.attempt?.seed!==CHALLENGE_COURSE_SEED)throw new Error('Unexpected challenge course');attempt=data.attempt;c.mode=data.mode;}
        if(requestId!==c.requestId)return;
        c.attempt=attempt;c.submitted=false;c.submissionPayload=null;$('challengeInitials').value='';$('challengeInitials').disabled=false;$('challengeConsent').checked=false;$('challengeConsent').disabled=false;c.shots=[];c.elapsed=0;c.chargeStarted=null;c.lastNow=performance.now();c.resultPayload=null;
        const seed=attempt?.seed??CHALLENGE_COURSE_SEED;c.tutorial=tutorial;c.tutorialHits=0;
        g.clearChapter();c.state=createChallengeState({seed:String(seed),attemptId:attempt?.id??null,onlineEligible:Boolean(attempt&&c.mode==='online')});c.build();c.arena=true;c.phase='playing';
        document.body.classList.add('sling-challenge');g.mode='play';g.paused=false;g.lock=false;g.enableSling(true,5,5);g.input.clearHeld();
        $('title').hidden=true;$('card').hidden=true;panel.hidden=true;$('challengeForm').hidden=true;$('hud').hidden=false;$('touch').hidden=!isTouch;hud.hidden=false;$('challengeSkip').hidden=!tutorial;g.setObjective(null);c.translate();c.camera(0);c.lastNow=performance.now();if(tutorial)c.feedback(c.t('tutorialHint'));g.canvas.focus();
      }catch{if(requestId!==c.requestId)return;c.showLobby('startError');}
      finally{if(requestId===c.requestId)c.setBusy(false);}
    },
    build(){
      const env={...CH1.env,fogNear:55,fogFar:190,moteOpacity:.1};
      g.ch={id:90,title:{ko:c.t('name'),en:'Sling Challenge'},ref:{ko:'',en:''},height:()=>0,groundOverride:()=>0,bound:()=>[-1,6]};g.chIdx=-1;g.applyEnv(env);
      const material=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.94,...extra});c.materials.push(m);return m;};
      const earth=material(0xa99866),stone=material(0x9c997e),wood=material(0x6b5035),leaf=material(0x667846),straw=material(0xd5b875),red=material(0x904c34),bone=material(0xeee0b5);
      const mesh=(geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.root.add(m);return m;};
      const ground=mesh(new THREE.PlaneGeometry(180,180),earth);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
      const rocks=[];for(let i=0;i<22;i++){const side=i%2?-1:1,z=9-Math.floor(i/2)*5;rocks.push({x:side*(8+(i%4)),y:0,z,s:.7+(i%3)*.15,sy:.65,ry:i*.9});}
      if(typeof g.place==='function')g.place('boulder',rocks);
      else for(const r of rocks){const rock=mesh(new THREE.DodecahedronGeometry(r.s,0),stone,r.x,.35,r.z);rock.scale.y=.75;}
      for(const [x,z,s] of [[-13,-12,1.2],[15,-23,1.5],[-18,-35,1.7],[20,-45,1.5]]){mesh(new THREE.CylinderGeometry(.15,.22,2.7,6),wood,x,1.3,z);const canopy=mesh(new THREE.DodecahedronGeometry(2.2,1),leaf,x,3.6,z);canopy.scale.set(s,s*.65,s);}
      for(let i=0;i<7;i++){const hill=mesh(new THREE.ConeGeometry(15+i%3*5,15+i%4*4,5),stone,-65+i*22,1,-75-(i%2)*15);hill.rotation.y=i;}
      // A fixed throwing line makes each seeded target comparable across devices.
      const line=mesh(new THREE.BoxGeometry(6,.03,.13),bone,-1,.02,5.5);line.castShadow=false;
      const slab=mesh(new THREE.BoxGeometry(3.4,2.55,.35),stone,-5.3,1.55,1);slab.name='sling-challenge-record-board';
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;
      if(canvas.getContext?.('2d')){c.boardCanvas=canvas;c.boardTexture=new THREE.CanvasTexture(canvas);c.boardTexture.colorSpace=THREE.SRGBColorSpace;const face=material(0xffffff,{map:c.boardTexture});mesh(new THREE.PlaneGeometry(3.15,2.35),face,-5.3,1.55,1.18);c.drawBoard();}
      c.targetMesh=new THREE.Group();c.targetMesh.name='sling-challenge-target';g.root.add(c.targetMesh);
      for(const [r,depth,mat] of [[1,.14,straw],[.71,.16,red],[.4,.18,bone],[.15,.2,red]]){const disc=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,32),mat);disc.rotation.x=Math.PI/2;disc.position.z=depth*.2;disc.castShadow=true;c.targetMesh.add(disc);}
      c.post=mesh(new THREE.CylinderGeometry(.07,.09,1,7),wood);g.setDavid({staff:false});g.placePlayer(-1,6,Math.PI);g.cam.yaw=0;g.cam.pitch=0;
      g.audio.init();g.audio.setMood('pasture');g.onChapterCleanup(()=>{for(const mat of c.materials)mat.dispose();c.materials=[];c.boardTexture?.dispose();c.boardTexture=null;c.boardCanvas=null;});
    },
    releaseWorld(){c.arena=false;c.effects=[];c.targetMesh=null;c.post=null;},
    close(){c.cancelRequests();c.phase='closed';c.arena=false;c.state=null;c.tutorial=false;c.afterTutorial=null;c.returnChapter=null;g.input.clearHeld();g.paused=false;panel.hidden=true;hud.hidden=true;$('challengeSkip').hidden=true;$('menu').hidden=true;$('help').hidden=true;document.body.classList.remove('sling-challenge');},
    back(){if(c.phase==='closed')return;const destination=c.returnChapter;g.input.clearHeld();if(destination===1)g.startChapter(1);else g.showTitle();},
    tick(){
      const now=performance.now();const delta=Math.max(0,now-c.lastNow);c.lastNow=now;c.elapsed+=delta;
      if(c.tutorial){const previous=c.state.activeMs;c.state.activeMs=Math.floor(c.elapsed);c.frameActiveDelta=c.state.activeMs-previous;c.render();return;}
      const previousTime=c.state.activeMs;const events=advanceChallenge(c.state,Math.min(CHALLENGE_RULES.maxActiveMs,Math.floor(c.elapsed)));c.frameActiveDelta=c.state.activeMs-previousTime;c.events(events);c.render();
      for(const effect of c.effects){if(!effect.done&&c.state.activeMs>=effect.at){effect.done=true;g.particles.emit(new THREE.Vector3(...effect.position),16,{color:0xe4b95a,speed:2,up:1.6,life:.5,gravity:3});g.audio.sfx('pick');}}
      c.effects=c.effects.filter(x=>!x.done);
      if(c.state.status==='ended')c.finish();
    },
    prepareAim(){const starting=g.input.aim&&!g.aiming;if(starting)c.chargeStarted=c.state.activeMs;if(!g.input.aim&&!g.aiming)c.chargeStarted=null;return starting?0:c.frameActiveDelta/1000;},
    decorateReadiness(){
      if(g.aiming&&c.state.lastShotAtMs!==null&&c.state.activeMs-c.state.lastShotAtMs<CHALLENGE_RULES.minShotIntervalMs){$('cross').classList.remove('sling-ready');$('slingCue').textContent=c.t('cooldown');}
    },
    camera(dt){
      if(c.phase==='playing'&&!g.paused){const k=g.input.keys,step=dt*1.1;g.cam.yaw-=g.input.lookX*(isTouch?.0065:.0048)+(k.has('ArrowRight')?step:0)-(k.has('ArrowLeft')?step:0);g.cam.pitch+=g.input.lookY*(isTouch?.0065:.0048)*.8+(k.has('ArrowDown')?step:0)-(k.has('ArrowUp')?step:0);}
      g.cam.yaw=clamp(g.cam.yaw,-.8,.8);g.cam.pitch=clamp(g.cam.pitch,-.45,.4);
      const dir=new THREE.Vector3(-Math.sin(g.cam.yaw)*Math.cos(g.cam.pitch),-Math.sin(g.cam.pitch),-Math.cos(g.cam.yaw)*Math.cos(g.cam.pitch));
      g.camera.position.set(0,2.8,10);g.camLook.copy(g.camera.position).add(dir);g.camera.lookAt(g.camLook);
    },
    aimRay(){
      const dir=new THREE.Vector3();g.camera.getWorldDirection(dir);const target=c.shotTarget||c.target();const point=g.camera.position.clone().addScaledVector(dir,80);
      if(!target)return{point,target:null};
      const position=new THREE.Vector3(...target.position),oc=position.clone().sub(g.camera.position),distance=oc.dot(dir);const hit=distance>0&&oc.addScaledVector(dir,-distance).lengthSq()<=target.radius*target.radius;
      return{point:hit?position:point,target:hit?{pos:()=>position.clone(),r:target.radius}:null};
    },
    throw(){
      if(c.phase!=='playing'||g.paused)return;
      const direction=new THREE.Vector3();g.camera.getWorldDirection(direction);const target=c.target(),before=c.state.score;
      const shot={atMs:c.state.activeMs,direction:direction.toArray(),heldMs:Math.max(0,c.state.activeMs-(c.chargeStarted??c.state.activeMs))};
      if(shot.heldMs<=CHALLENGE_RULES.readyAfterMs){c.chargeStarted=null;return;}
      if(c.tutorial){
        c.chargeStarted=null;const hit=new THREE.Ray(g.camera.position.clone(),direction).intersectsSphere(new THREE.Sphere(new THREE.Vector3(...target.position),target.radius));
        c.shotTarget=target;original.throwStone.call(g);if(hit&&g.stonesInAir.length)g.gameplayCues?.hit(g.stonesInAir.at(-1));c.shotTarget=null;g.setStones(5);
        if(hit){c.tutorialHits++;g.audio.sfx('pick');c.feedback(`${c.t('hit')} · ${c.tutorialHits}/3`);}else c.feedback(c.t('tutorialHint'));
        c.render();if(c.tutorialHits===3)void c.completeTutorial();return;
      }
      const result=fireChallengeShot(c.state,shot);c.chargeStarted=null;
      if(!result.accepted){c.feedback(c.t('cooldown'));return;}
      c.shots.push(shot);c.shotTarget=target;original.throwStone.call(g);if(result.hit&&g.stonesInAir.length)g.gameplayCues?.hit(g.stonesInAir.at(-1));c.shotTarget=null;g.setStones(5);
      if(result.hit){c.feedback(`${c.t('hit')} +${c.state.score-before}`);c.effects.push({at:c.state.activeMs+220,position:target.position,done:false});}else c.feedback(c.t('miss'));
      c.render();if(c.state.status==='ended')c.finish();
    },
    events(events){for(const event of events||[])if(event.type==='timeout')c.feedback(c.t('timeout'));},
    feedback(text){$('challengeFeedback').textContent=text;c.feedbackUntil=c.state.activeMs+1400;},
    render(){
      if(!c.state)return;const target=c.target();
      $('challengeMode').textContent=c.t(c.serverAttempt?(c.mode==='online'?'online':'mock'):'practice');$('challengeRound').textContent=`${c.t('round')} ${c.state.round}`;$('challengeScore').textContent=`${c.state.score.toLocaleString()} ${getLanguage()==='ko'?'점':'pts'}`;$('challengeLives').textContent=`${c.t('lives')} ${c.state.lives}/3`;
      $('challengeScore').hidden=c.tutorial;$('challengeLives').hidden=c.tutorial;$('challengeTimer').hidden=c.tutorial;
      if(c.tutorial){$('challengeMode').textContent=c.t('tutorial');$('challengeRound').textContent=`${c.t('tutorialProgress')} ${c.tutorialHits}/3`;}
      $('challengeTimer').firstChild.style.width=`${target?clamp(target.timeLeftMs/target.budgetMs*100,0,100):0}%`;
      if(!c.tutorial&&c.state.activeMs>c.feedbackUntil)$('challengeFeedback').textContent='';
      if(c.targetMesh){c.targetMesh.visible=!!target;if(target){c.targetMesh.position.set(...target.position);c.targetMesh.scale.setScalar(target.radius);c.post.visible=true;c.post.position.set(target.position[0],target.position[1]/2,target.position[2]);c.post.scale.y=target.position[1];}else c.post.visible=false;}
    },
    async finish(){
      if(c.phase!=='playing')return;c.phase='result';g.input.clearHeld();g.paused=true;g.enableSling(false);hud.hidden=true;$('touch').hidden=true;panel.hidden=false;$('challengeIntro').hidden=true;$('challengeForm').hidden=true;$('challengeTest').hidden=true;$('challengeRefresh').hidden=!c.serverAttempt;
      c.resultPayload={shots:c.shots.map(shot=>({...shot,direction:[...shot.direction]})),endedAtMs:c.state.activeMs};c.translate();$('challengeEyebrow').textContent=`${c.state.score.toLocaleString()} ${getLanguage()==='ko'?'점':'POINTS'} · ${c.state.hits} ${getLanguage()==='ko'?'명중':'HITS'}`;$('challengeStart').focus();
      if(c.serverAttempt)await c.verify();else c.status('practice');
    },
    async verify(){
      if(c.busy||!c.attempt||c.phase!=='result')return;const requestId=c.requestId;c.setBusy(true);c.status('verify');
      try{const data=await c.request(c.mode==='online'?'/finish':`/attempts/${encodeURIComponent(c.attempt.id)}/finish`,c.mode==='online'?{attemptId:c.attempt.id,...c.resultPayload}:c.resultPayload);if(requestId!==c.requestId||c.phase!=='result')return;c.checkServiceMode(data);if(typeof data.qualifies!=='boolean')throw new Error('Invalid verification response');c.record=data.record??c.record;c.renderRecord();$('challengeRefresh').hidden=true;$('challengeForm').hidden=!data.qualifies;c.status(data.qualifies?'qualifies':'verified');if(data.qualifies)$('challengeInitials').focus();}
      catch(error){if(requestId!==c.requestId)return;c.status(error.status===410||error.status===404?'expired':error.status===429?'rateLimited':error.status===400?'rejected':'network');$('challengeRefresh').hidden=[400,404,410].includes(error.status);}
      finally{if(requestId===c.requestId)c.setBusy(false);}
    },
    async refreshCurrentRecord(){
      if(c.busy)return;const requestId=c.requestId;c.setBusy(true);c.status('loading');
      try{const data=await c.request('/record');if(requestId!==c.requestId)return;c.checkServiceMode(data);c.record=data.record;c.renderRecord();c.status(c.submissionStatusKey||'saved');$('challengeRefresh').hidden=true;}
      catch{if(requestId===c.requestId)c.status(c.submissionStatusKey==='surpassed'?'surpassedRefreshError':'savedRefreshError');}
      finally{if(requestId===c.requestId)c.setBusy(false);}
    },
    async submit(event){
      event.preventDefault();if(c.busy||!c.attempt||c.phase!=='result')return;const initials=$('challengeInitials').value.toUpperCase();
      if(!c.submissionPayload&&(!/^[A-Z]{3}$/.test(initials)||!$('challengeConsent').checked)){c.status('badInitials');return;}
      c.submissionPayload??={initials,publicConsent:true};$('challengeInitials').disabled=true;$('challengeConsent').disabled=true;
      const requestId=c.requestId;c.setBusy(true);c.status('submitting');
      try{const data=await c.request(c.mode==='online'?'/submit':`/attempts/${encodeURIComponent(c.attempt.id)}/record`,c.mode==='online'?{attemptId:c.attempt.id,...c.submissionPayload}:c.submissionPayload);if(requestId!==c.requestId||c.phase!=='result')return;c.checkServiceMode(data);if(typeof data.accepted!=='boolean')throw new Error('Invalid submission response');c.submitted=true;c.submissionStatusKey=data.accepted?'saved':'surpassed';$('challengeForm').hidden=true;
        // A retry can return the original accepted response after somebody else won.
        // Always read today's record instead of presenting that old snapshot as current.
        try{const latest=await c.request('/record');if(requestId!==c.requestId)return;c.checkServiceMode(latest);c.record=latest.record;c.renderRecord();c.status(data.accepted?'saved':'surpassed');}
        catch{if(requestId!==c.requestId)return;c.record=null;$('challengeRecord').textContent='…';c.status(data.accepted?'savedRefreshError':'surpassedRefreshError');$('challengeRefresh').hidden=false;}
      }
      catch(error){if(requestId!==c.requestId)return;if(error.status===400){c.submissionPayload=null;$('challengeInitials').disabled=false;$('challengeConsent').disabled=false;}if(error.status===404||error.status===410)$('challengeForm').hidden=true;c.status(error.status===410||error.status===404?'expired':error.status===429?'rateLimited':error.status===400?'badInitials':'network');}
      finally{if(requestId===c.requestId)c.setBusy(false);}
    },
  };
  $('bChallenge').onclick=()=>c.open();$('challengeBack').onclick=()=>c.back();$('challengeStart').onclick=()=>c.chooseStart(c.phase==='result'&&c.serverAttempt);$('challengeTest').onclick=()=>c.chooseStart(true);$('challengeLearn').onclick=()=>c.startTutorial();$('challengeSkip').onclick=()=>c.completeTutorial();$('challengeRefresh').onclick=()=>c.phase==='result'?(c.submitted?c.refreshCurrentRecord():c.verify()):c.loadRecord();$('challengeForm').onsubmit=event=>c.submit(event);
  $('challengeInitials').addEventListener('input',()=>{$('challengeInitials').value=$('challengeInitials').value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();c.back();return;}if(event.key==='Tab'){const focusable=[...panel.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
  const suspend=()=>{if(c.arena&&c.phase==='playing'&&!g.paused)g.toggleMenu(true);};window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  c.translate();return c;
}
