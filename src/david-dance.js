import {createSideRanking} from './side-ranking.js';
import {VERSES,createRound,submitVerse,nextVerse,revealHint,readScores,saveScore,SCORE_KEY,normalize} from './david-dance-core.js';
import {createDanceFx,createDanceMusic,danceTier} from './david-dance-fx.js';
const $=id=>document.getElementById(id);
let round=createRound(),composing=false,compositionEnded=0,pending=null,returnFocus=null,audio=null,muted=true;
let ranking, actions=[];
const fx=createDanceFx({stage:$('stage')}),music=createDanceMusic();
let storage;try{storage=window.localStorage;}catch{}
const stages=[
 ['들판이 조용히 기다려요','첫 절을 완성하면 다윗이 한 걸음 춤춰요.'],
 ['첫 번째 기쁨의 걸음','다윗이 팔을 펴고 가볍게 움직여요.'],
 ['햇살도 반짝, 마음도 반짝','두 걸음째, 들판에 반짝임이 더해져요.'],
 ['선율이 춤을 따라 흘러요','세 걸음째, 하늘에 음표가 피어나요.'],
 ['온 들판에 기쁨이 번져요','네 걸음째, 바람에 리본이 나부껴요.'],
 ['양 친구가 놀러 왔어요','다섯 걸음째, 축제가 가까워졌어요.'],
 ['여섯 절, 함께 만든 축제!','다윗과 동물 친구들이 함께 기뻐해요.'],
];
function renderScores(){
 const scores=readScores(storage);$('scores').replaceChildren();
 for(const record of scores){const li=document.createElement('li');li.textContent=`${record.score}점 · ${new Date(record.at).toLocaleDateString('ko-KR')}`;$('scores').append(li);}
 if(!scores.length){const li=document.createElement('li');li.textContent='아직 도전 완주 기록이 없어요.';$('scores').append(li);}
 $('clearScores').disabled=!scores.length;
}
function render(){
 const practice=round.mode==='practice',complete=round.phase==='complete',success=round.phase==='success';
 $('practice').setAttribute('aria-pressed',String(practice));$('challenge').setAttribute('aria-pressed',String(!practice));
 $('modeDescription').textContent=practice?'말씀을 보며 천천히 익혀요. 연습 기록은 대결에 남지 않아요.':'말씀을 가리고 직접 입력해요. 힌트는 언제든 볼 수 있어요.';
 $('verseLabel').textContent=complete?'시편 23편 · 여섯 절 완주':`시편 23편 ${round.index+1}절`;
 $('score').textContent=`${round.score}점 · 연속 ${round.streak}절`;
 const visible=practice||round.hinted||success||complete;
 $('verse').textContent=visible?VERSES[round.index]:'';
 $('verse').hidden=!visible;$('hiddenVerse').hidden=visible;
 $('hint').hidden=practice;$('hint').disabled=round.hinted;
 $('hint').textContent=round.hinted?'힌트 사용 중':'말씀 보기 · 힌트';
 $('answerForm').hidden=complete;$('answer').disabled=success;$('check').disabled=success||composing;
 $('sceneContinue').hidden=!(success||complete);$('sceneContinue').textContent=complete?`${round.score}점 · 완주 결과 보기 ↓`:'다음 절 입력하기 ↓';
 $('next').hidden=!success;$('result').hidden=!complete;$('restart').hidden=complete;
 $('stage').dataset.level=String(round.stage);$('stageCount').textContent=`${round.stage} / 6 걸음`;
 $('stageTitle').textContent=stages[round.stage][0];$('stageDescription').textContent=stages[round.stage][1];
 $('stage').querySelector('svg').setAttribute('aria-label',stages[round.stage].join('. '));
 [...$('steps').children].forEach((li,i)=>{li.classList.toggle('done',i<round.stage);li.setAttribute('aria-label',`${i+1}절 ${i<round.stage?'완료':'아직'}`);});
 music.setLevel(round.stage);
 if(complete){
  const [tier,tierNote]=danceTier(round.score,round.mode);$('resultTier').textContent=tier;$('resultTierNote').textContent=tierNote;$('resultBig').textContent=String(round.score);
  const accuracy=Math.round(round.verses.reduce((sum,v)=>sum+v.accuracy,0)/6),hints=round.verses.filter(v=>v.hint).length;
  $('resultScore').textContent=`${round.score}점 · 첫 입력 평균 정확도 ${accuracy}% · 힌트 ${hints}절 · 완주 +300점`;
 }
}
function reset(mode,ranked=false){if(!ranked)ranking?.reset();actions=[];fx.reset();round=createRound(mode);composing=false;$('answer').value='';$('feedback').replaceChildren();render();$('answer').focus();}
function hasProgress(){return !!(round.stage||round.attempts||round.hinted||$('answer').value);}
function request(action,title,label,text='진행 중인 입력과 점수는 사라져요.'){
 if(pending)return;pending=action;returnFocus=document.activeElement;$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmAction').textContent=label;$('confirm').showModal();$('cancelAction').focus();
}
function cancel(){pending=null;$('confirm').close();returnFocus?.focus();}
$('cancelAction').onclick=cancel;
$('confirm').addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;
 const first=$('cancelAction'),last=$('confirmAction');
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
$('confirm').addEventListener('cancel',e=>{e.preventDefault();cancel();});
$('confirmAction').onclick=()=>{const action=pending;pending=null;$('confirm').close();action?.();};
function setMode(mode){if(round.mode===mode)return;const action=()=>reset(mode);if(hasProgress()&&round.phase!=='complete')request(action,'모드를 바꿀까요?','모드 바꾸기');else action();}
$('practice').onclick=()=>setMode('practice');$('challenge').onclick=()=>setMode('challenge');
$('restart').onclick=()=>{if(hasProgress())request(()=>reset(round.mode),'처음부터 시작할까요?','처음부터');else reset(round.mode);};
$('again').onclick=()=>reset(round.mode);
$('leave').onclick=e=>{if(hasProgress()&&round.phase!=='complete'){e.preventDefault();request(()=>location.assign('./'),'게임으로 돌아갈까요?','게임으로');}};
$('clearScores').onclick=()=>request(()=>{try{storage.removeItem(SCORE_KEY);}catch{}renderScores();$('clearScores').focus();},'이 기기의 기록을 지울까요?','기록 지우기','이 브라우저의 다윗 춤 완주 기록만 지워져요.');
$('hint').onclick=()=>{if(round.phase!=='input'||round.hinted||round.mode!=='challenge')return;revealHint(round);if(ranking.active)actions.push({type:'hint'});render();$('feedback').textContent='힌트를 열었어요. 이 절의 정확도 점수에서 30점이 줄고, 연속 성공은 이어지지 않아요.';$('answer').focus();};
$('answer').addEventListener('input',()=>{fx.typed();music.keyNote();});
$('answer').addEventListener('compositionstart',()=>{composing=true;$('check').disabled=true;});
$('answer').addEventListener('compositionend',()=>{composing=false;compositionEnded=performance.now();$('check').disabled=round.phase!=='input';});
$('answer').addEventListener('keydown',e=>{
 if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){
  e.preventDefault();if(!composing&&!e.isComposing&&e.keyCode!==229&&performance.now()-compositionEnded>100&&!e.repeat)$('answerForm').requestSubmit();
 }
});
function showFeedback(result){
 const feedback=$('feedback');feedback.replaceChildren();
 if(result.correct){feedback.textContent=`${round.index+1}절을 완성했어요! +${result.earned}점${round.phase==='complete'?' · 완주 +300점':''}`;return;}
 const title=document.createElement('p');title.textContent=`이번 입력 정확도 ${result.accuracy}%. 표시된 부분을 고쳐 보세요.`;feedback.append(title);
 const expected=document.createElement('p');expected.append('본문: ');
 const entered=document.createElement('p');entered.append('입력: ');
 for(const group of result.groups){
  for(const [row,key,empty] of [[expected,'expected','(추가됨)'],[entered,'actual','(빠짐)']]){
   const span=document.createElement(group.same?'span':'mark');span.textContent=group[key]||empty;row.append(span);
  }
 }
 feedback.append(expected,entered);const note=document.createElement('p');note.className='small';note.textContent='비교를 위해 띄어쓰기를 제외했어요. 색칠한 부분만 본문과 달라요.';feedback.append(note);
}
$('answerForm').addEventListener('submit',e=>{
 e.preventDefault();if(composing||round.phase!=='input')return;
 const result=submitVerse(round,$('answer').value);
 if(result.ignored){if(!normalize($('answer').value))$('feedback').textContent='기억나는 말씀을 먼저 입력해 주세요.';else if(round.lastInput&&!$('duplicateNote')){const note=document.createElement('p');note.id='duplicateNote';note.textContent='입력을 수정한 뒤 다시 확인해 주세요.';$('feedback').append(note);}return;}
 if(ranking.active){actions.push({type:'answer',text:$('answer').value});if(actions.length>128)ranking.invalidate();}
 showFeedback(result);render();
 if(result.correct){
  fx.success(round.stage,result.earned,round.streak,round.phase==='complete');if(round.phase==='complete'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const target=round.score,t0=performance.now(),el=$('resultBig');const step=now=>{const k=Math.min(1,(now-t0)/1300);el.textContent=String(Math.round(target*(1-Math.pow(1-k,3))));if(k<1&&round.phase==='complete'&&round.score===target)requestAnimationFrame(step);else el.textContent=String(round.score);};requestAnimationFrame(step);}music.sting(round.phase==='complete');
  if(round.phase==='complete'){
   if(ranking.active)ranking.complete({actions});
   const saved=saveScore(storage,round);
   $('saveStatus').textContent=round.mode==='practice'?'연습 완주예요. 점수 대결은 도전 모드에서 시작해 보세요.':saved?'이 브라우저에 상위 5개 점수만 남아요. 같은 기기에서 다음 사람이 도전할 수 있어요.':'이 브라우저에서는 기록을 저장할 수 없어요. 현재 화면에서 점수를 확인해 주세요.';
   renderScores();$('resultTitle').focus();
  }else $('next').focus();
  if(matchMedia('(max-width:760px)').matches){$('sceneContinue').focus({preventScroll:true});document.querySelector('.scene-card').scrollIntoView({block:'start'});}
 }else{fx.stumble();music.oops();$('answer').focus();}
});
function advance(){if(nextVerse(round)){if(ranking.active)actions.push({type:'next'});$('answer').value='';$('feedback').replaceChildren();render();$('answer').focus();}}
$('next').onclick=advance;
$('sceneContinue').onclick=()=>{if(round.phase==='complete')$('resultTitle').focus();else advance();};
function audioLabel(){$('sound').textContent=muted?'♪ 음악 켜고 춤추기':'♪ 음악 끄기';$('sound').setAttribute('aria-pressed',String(!muted));}
function disposeAudio(){music.stop();muted=true;const previous=audio;audio=null;previous?.close().catch(()=>{});audioLabel();}
$('sound').onclick=async()=>{
 if(!muted){disposeAudio();return;}
 if(audio)return;
 try{
  const context=new (window.AudioContext||window.webkitAudioContext)();audio=context;await context.resume();
  if(audio!==context)return;muted=false;audioLabel();music.start(context,round.stage);music.sting(false);
 }catch{disposeAudio();$('sound').textContent='소리 사용 불가';}
};
addEventListener('pagehide',()=>{disposeAudio();ranking.reset();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)disposeAudio();});
$('share').onclick=async()=>{
 const [tier]=danceTier(round.score,round.mode),url=new URL('./dance.html',location.href).href;
 const text=`다윗의 춤 · 시편 23편 ${round.mode==='challenge'?'도전':'연습'} ${round.score}점, '${tier}'! 여섯 절을 외우면 다윗과 동물 친구들이 함께 춤춰요.`;
 try{if(navigator.share){await navigator.share({title:'다윗의 춤 · 시편 23편',text,url});$('shareStatus').textContent='공유했어요.';return;}}catch(e){if(e?.name==='AbortError')return;}
 try{await navigator.clipboard.writeText(`${text} ${url}`);$('shareStatus').textContent='결과 문구를 복사했어요. 원하는 곳에 붙여 넣어 주세요.';}catch{$('shareStatus').textContent='이 브라우저에서는 공유할 수 없어요.';}
};
ranking=createSideRanking({mode:'dance',host:document.querySelector('.below'),begin:()=>reset('challenge',true)});
render();renderScores();
