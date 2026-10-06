import {DANCE_PSALMS} from './dance-psalms.js';
import {getPsalm,isPrayerPsalm,createRound,submitVerse,nextVerse,revealHint,readScores,saveScore,scoreKey,maxScore,normalize} from './david-dance-core.js';
const $=id=>document.getElementById(id);
let round=createRound('practice',DANCE_PSALMS[0].id),composing=false,compositionEnded=0,pending=null,returnFocus=null,audio=null,muted=true;
let storage;try{storage=window.localStorage;}catch{}
const stages=[
 ['들판이 조용히 기다려요','첫 절을 완성하면 다윗이 한 걸음 춤춰요.'],
 ['첫 번째 기쁨의 걸음','다윗이 팔을 펴고 가볍게 움직여요.'],
 ['햇살도 반짝, 마음도 반짝','말씀을 이어 갈수록 들판에 반짝임이 더해져요.'],
 ['선율이 춤을 따라 흘러요','한 절씩 기억하며 다음 걸음을 이어 가요.'],
 ['온 들판에 기쁨이 번져요','바람에 리본이 나부껴요.'],
 ['양 친구가 놀러 왔어요','마지막 절까지 차근차근 이어 가요.'],
 ['한 편을 끝까지 기억했어요','다윗과 동물 친구들이 함께 기뻐해요.'],
];
function renderScores(){
 $('scoreboard').hidden=isPrayerPsalm(round.psalmId);
 if(isPrayerPsalm(round.psalmId)){$('scores').replaceChildren();$('clearScores').disabled=true;return;}
 const scores=readScores(storage,round.psalmId);$('scores').replaceChildren();
 $('scoresTitle').textContent=`${getPsalm(round.psalmId).title} · 이 기기 TOP 5`;
 for(const record of scores){const li=document.createElement('li');li.textContent=`${record.score}점 · ${new Date(record.at).toLocaleDateString('ko-KR')}`;$('scores').append(li);}
 if(!scores.length){const li=document.createElement('li');li.textContent='아직 도전 완주 기록이 없어요.';$('scores').append(li);}
 $('clearScores').disabled=!scores.length;
}
function render(){
 const practice=round.mode==='practice',complete=round.phase==='complete',success=round.phase==='success';
 const psalm=getPsalm(round.psalmId),total=psalm.verses.length;
 const level=round.stage===total?6:round.stage===0?0:Math.min(5,Math.ceil(round.stage/total*5));
 const reflective=isPrayerPsalm(round.psalmId);
 const scene=reflective
  ? [complete?'시편 51편 19절을 마쳤어요':'한 절씩 읽고 기억해요',complete?'필요한 구절을 다시 읽으며 기도를 이어 가세요.':'말씀을 천천히 읽으며 다음 절을 이어 가요.']
  : stages[level];
 document.body.dataset.experience=reflective?'prayer':'dance';
 document.title=reflective?'시편 51편 기도 암송 | The Shepherd King':`다윗 댄스 챌린지 · ${psalm.title} | The Shepherd King`;
 $('experienceTitle').textContent=reflective?'시편 51편 기도 암송':'다윗 댄스 챌린지';
 $('experienceKind').textContent=reflective?'기도 암송':'작은 놀이';
 $('selectionNote').textContent=reflective?'본문을 읽거나 가리고 기억해 보세요.':'시편을 골라 한 편씩 연습하거나 도전해 보세요.';
 $('sceneCard').setAttribute('aria-label',reflective?'시편 51편 기도 암송 진행':'다윗 댄스 챌린지 무대');
 $('gameCard').setAttribute('aria-label',reflective?'기도 암송 입력':'말씀 입력 놀이');
 $('modeTabs').setAttribute('aria-label',reflective?'읽기와 암송':'놀이 모드');
 $('sceneTag').textContent=reflective?'기도 암송':'다윗 댄스 챌린지';
 $('stage').hidden=reflective;$('prayerScene').hidden=!reflective;
 $('prayerVerse').textContent=reflective?psalm.verses[9]:'';
 $('sound').hidden=reflective;$('sound').disabled=reflective;
 $('score').hidden=reflective;$('resultScore').hidden=reflective;
 $('scoreboard').hidden=reflective;$('danceHelp').hidden=reflective;$('prayerHelp').hidden=!reflective;
 document.querySelector('.local-only-note').hidden=reflective;
 $('experienceFooter').textContent=reflective?'시편 51편 1–19절 · 제공된 본문 · 기도 암송':'시편 23편 · 3편 · 51편 · 제공된 본문 · 로컬 시제품';
 $('inputNote').innerHTML=reflective?'띄어쓰기와 문장부호는 자유롭게. 단어는 본문 그대로 써요.<br>줄바꿈은 Enter · 확인은 Ctrl/⌘ + Enter':'띄어쓰기와 문장부호는 자유롭게. 단어는 본문 그대로 써요.<br>타자 속도는 점수에 반영하지 않아요.<br>줄바꿈은 Enter · 확인은 Ctrl/⌘ + Enter';
 $('again').textContent=reflective?'처음부터 다시 읽기':'다시 한 걸음';
 $('result').setAttribute('aria-label',reflective?'기도 암송 마침':'완주 결과');
 $('selectedPsalm').textContent=`${psalm.title} · ${total}절`;
 $('psalmDescription').textContent=reflective?'정한 마음과 구원의 즐거움을 구하는 기도를 한 절씩 기억해 보세요.':psalm.chapter===3?'두려움 속에서 하나님을 의지하는 기도를 한 절씩 기억해 보세요.':'목자이신 하나님을 의지하는 말씀을 한 절씩 기억해 보세요.';
 document.querySelectorAll('[data-psalm]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.psalm===round.psalmId)));
 $('selahNote').hidden=psalm.chapter!==3;
 $('resultTitle').textContent=reflective?'시편 51편 19절을 마쳤어요':`${psalm.title} ${total}절 완주`;
 $('maximumScore').textContent=`${psalm.title} ${total}절 · 만점 ${maxScore(round.psalmId)}점`;
 $('practice').textContent=reflective?'보며 읽기':'연습';$('challenge').textContent=reflective?'가리고 암송':'도전';
 $('practice').setAttribute('aria-pressed',String(practice));$('challenge').setAttribute('aria-pressed',String(!practice));
 $('modeDescription').textContent=reflective?(practice?'본문을 보며 한 절씩 읽고 입력해 보세요.':'말씀을 가리고 기억한 내용을 입력해 보세요. 언제든 본문을 다시 볼 수 있어요.'):(practice?'말씀을 보며 천천히 익혀요. 연습 기록은 대결에 남지 않아요.':'말씀을 가리고 직접 입력해요. 힌트는 언제든 볼 수 있어요.');
 $('verseLabel').textContent=complete?`${psalm.title} · ${total}절 ${reflective?'마침':'완주'}`:`${psalm.title} ${round.index+1}절`;
 $('score').textContent=`${round.score}점 · 연속 ${round.streak}절`;
 const visible=practice||round.hinted||success||complete;
 $('verse').textContent=visible?psalm.verses[round.index]:'';
 $('verse').hidden=!visible;$('hiddenVerse').hidden=visible;
 $('hint').hidden=practice;$('hint').disabled=round.hinted;
 $('hint').textContent=reflective?(round.hinted?'본문을 보고 있어요':'본문 보기'):(round.hinted?'힌트 사용 중':'말씀 보기 · 힌트');
 $('answerForm').hidden=complete;$('answer').disabled=success;$('check').disabled=success||composing;
 $('sceneContinue').hidden=!(success||complete);$('sceneContinue').textContent=complete?(reflective?'마친 내용 보기 ↓':`${round.score}점 · 완주 결과 보기 ↓`):'다음 절 입력하기 ↓';
 $('next').hidden=!success;$('result').hidden=!complete;$('restart').hidden=complete;
 $('stage').dataset.level=String(reflective?0:level);$('stage').dataset.tone=reflective?'prayer':'joyful';$('stageCount').textContent=`${round.stage} / ${total}절`;
 $('stageTitle').textContent=scene[0];$('stageDescription').textContent=scene[1];
 $('stage').querySelector('svg').setAttribute('aria-label',scene.join('. '));
 if($('steps').children.length!==total){$('steps').replaceChildren(...psalm.verses.map((_,i)=>{const li=document.createElement('li');li.textContent=String(i+1);return li;}));}
 $('steps').setAttribute('aria-label',`${psalm.title} ${total}절 진행`);
 [...$('steps').children].forEach((li,i)=>{li.classList.toggle('done',i<round.stage);li.setAttribute('aria-label',`${i+1}절 ${i<round.stage?'완료':'아직'}`);});
 if(reflective)$('resultScore').textContent='';
 else if(complete){
  const accuracy=Math.round(round.verses.reduce((sum,v)=>sum+v.accuracy,0)/total),hints=round.verses.filter(v=>v.hint).length;
  $('resultScore').textContent=`${round.score}점 · 첫 입력 평균 정확도 ${accuracy}% · 힌트 ${hints}절 · 완주 +300점`;
 }
}
function reset(mode,psalmId=round.psalmId){round=createRound(mode,psalmId);if(isPrayerPsalm(psalmId))disposeAudio();composing=false;$('answer').value='';$('feedback').replaceChildren();$('saveStatus').textContent='';render();renderScores();$('answer').focus();}
function setPsalm(id){
 if(id===round.psalmId)return;
 const psalm=getPsalm(id),action=()=>reset(round.mode,id);
 if(hasProgress()&&round.phase!=='complete')request(action,`${psalm.title}으로 바꿀까요?`,'시편 바꾸기');else action();
}
for(const psalm of DANCE_PSALMS){const button=document.createElement('button');button.type='button';button.dataset.psalm=psalm.id;button.textContent=psalm.chapter===51?'시편 51편 · 기도 암송':`${psalm.title} · ${psalm.verses.length}절`;button.onclick=()=>setPsalm(psalm.id);$('psalmChoices').append(button);}
function hasProgress(){return !!(round.stage||round.attempts||round.hinted||$('answer').value);}
function request(action,title,label,text=isPrayerPsalm(round.psalmId)?'진행 중인 입력과 읽은 절 표시는 사라져요.':'진행 중인 입력과 점수는 사라져요.'){
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
$('leave').onclick=e=>{if(hasProgress()&&round.phase!=='complete'){e.preventDefault();request(()=>location.assign($('leave').href),'챌린지 선택으로 돌아갈까요?','챌린지 선택으로');}};
$('clearScores').onclick=()=>{if(isPrayerPsalm(round.psalmId))return;request(()=>{try{storage.removeItem(scoreKey(round.psalmId));}catch{}renderScores();$('scoresTitle').focus();},'이 시편의 기록을 지울까요?','기록 지우기',`이 브라우저의 ${getPsalm(round.psalmId).title} 완주 기록만 지워져요. 다른 시편과 이전 버전 기록은 남아요.`);};
$('hint').onclick=()=>{if(round.phase!=='input'||round.hinted||round.mode!=='challenge')return;revealHint(round);render();$('feedback').textContent=isPrayerPsalm(round.psalmId)?'본문을 열었어요. 천천히 읽고 다시 입력해 보세요.':'힌트를 열었어요. 이 절의 정확도 점수에서 30점이 줄고, 연속 성공은 이어지지 않아요.';$('answer').focus();};
$('answer').addEventListener('compositionstart',()=>{composing=true;$('check').disabled=true;});
$('answer').addEventListener('compositionend',()=>{composing=false;compositionEnded=performance.now();$('check').disabled=round.phase!=='input';});
$('answer').addEventListener('keydown',e=>{
 if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){
  e.preventDefault();if(!composing&&!e.isComposing&&e.keyCode!==229&&performance.now()-compositionEnded>100&&!e.repeat)$('answerForm').requestSubmit();
 }
});
function showFeedback(result){
 const feedback=$('feedback');feedback.replaceChildren();
 if(result.correct){feedback.textContent=isPrayerPsalm(round.psalmId)?`${round.index+1}절을 확인했어요.`:`${round.index+1}절을 완성했어요! +${result.earned}점${round.phase==='complete'?' · 완주 +300점':''}`;return;}
 const title=document.createElement('p');title.textContent=isPrayerPsalm(round.psalmId)?'본문과 다른 부분을 확인해 보세요.':`이번 입력 정확도 ${result.accuracy}%. 표시된 부분을 고쳐 보세요.`;feedback.append(title);
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
 showFeedback(result);render();
 if(result.correct){
  chime();
  if(round.phase==='complete'){
   const saved=isPrayerPsalm(round.psalmId)?null:saveScore(storage,round);
   $('saveStatus').textContent=isPrayerPsalm(round.psalmId)?'입력한 내용은 저장하거나 전송하지 않아요.':round.mode==='practice'?'연습 완주예요. 점수 대결은 도전 모드에서 시작해 보세요.':saved?'이 브라우저에 상위 5개 점수만 남아요. 같은 기기에서 다음 사람이 도전할 수 있어요.':'이 브라우저에서는 기록을 저장할 수 없어요. 현재 화면에서 점수를 확인해 주세요.';
   renderScores();$('resultTitle').focus();
  }else $('next').focus();
  if(matchMedia('(max-width:760px)').matches){$('sceneContinue').focus({preventScroll:true});document.querySelector('.scene-card').scrollIntoView({block:'start'});}
 }else $('answer').focus();
});
function advance(){if(nextVerse(round)){$('answer').value='';$('feedback').replaceChildren();render();$('answer').focus();}}
$('next').onclick=advance;
$('sceneContinue').onclick=()=>{if(round.phase==='complete')$('resultTitle').focus();else advance();};
function audioLabel(){$('sound').textContent=muted?'소리 꺼짐':'소리 켜짐';$('sound').setAttribute('aria-pressed',String(!muted));}
function disposeAudio(){muted=true;const previous=audio;audio=null;previous?.close().catch(()=>{});audioLabel();}
$('sound').onclick=async()=>{
 if(isPrayerPsalm(round.psalmId)){disposeAudio();return;}
 if(!muted){disposeAudio();return;}
 if(audio)return;
 try{
  const context=new (window.AudioContext||window.webkitAudioContext)();audio=context;await context.resume();
  if(audio!==context)return;muted=false;audioLabel();chime();
 }catch{disposeAudio();$('sound').textContent='소리 사용 불가';}
};
function chime(){
 if(isPrayerPsalm(round.psalmId)||muted||!audio||audio.state!=='running')return;
 [392,493.88,587.33].slice(0,Math.min(3,round.stage+1)).forEach((frequency,i)=>{
  const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.1;
  oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+.45);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+.5);
 });
}
addEventListener('pagehide',disposeAudio);
document.addEventListener('visibilitychange',()=>{if(document.hidden)disposeAudio();});
render();renderScores();
