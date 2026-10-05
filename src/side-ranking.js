/** Opt-in rankings. Capabilities and transcripts live only in memory for this new run. */
export function createSideRanking({mode,host,begin}){
 const name=mode==='dance'?'다윗의 춤':'엔게디',unit=mode==='dance'?'점수':'시간';
 const root=document.createElement('section');root.className='side-ranking';root.dataset.ranking=mode;
 root.innerHTML=`<h3>${name} TOP 10</h3><p class="rank-rules">${mode==='dance'?'점수가 높은 순':'완주 시간이 짧은 순'} · 같은 기록은 공동 순위예요. 동률은 먼저 공개한 기록부터 보여 주며 상위 10개만 남아요.</p><div class="rank-actions"><button type="button" data-rank="start">새 순위 도전 시작</button><button type="button" data-rank="read">TOP 10 보기</button></div><p data-rank="status" role="status" aria-live="polite">연습과 지난 로컬 기록은 공개 순위에 보내지 않아요.</p><ol data-rank="entries"></ol><form data-rank="form" hidden><fieldset><label>영문 이니셜 3자 <input data-rank="initials" aria-label="영문 이니셜 3자" maxlength="3" pattern="[A-Za-z]{3}" autocomplete="off" autocapitalize="characters" required></label><label class="rank-consent"><input type="checkbox" data-rank="consent" required> 이번 이니셜과 ${unit}를 누구나 볼 수 있는 TOP 10에 공개하는 데 동의해요.</label><p>${mode==='dance'?'검산을 위해 이번 도전의 답안·오답·힌트 기록을 전송해요. 실제 암송이나 복사·붙여넣기를 완전히 확인하지는 못해요.':'검산을 위해 이번 도전의 속도 입력·완주 시간·중단 여부를 전송해요. 브라우저 기록의 조작을 완전히 판별하지는 못해요.'} 답안과 입력 기록은 DB에 저장하지 않아요. 상위 10개에서 밀리면 공개 기록은 삭제돼요.</p><button type="submit" data-rank="submit">동의하고 검산·공개하기</button></fieldset></form><details><summary>공개 기록과 보관 안내</summary><p>새 순위 도전만 등록할 수 있어요. 도전 인증 정보는 30분간 유효하고 만료 뒤 요청 시 정리돼요. 비공개 임시 정보에는 결과, 재전송 확인용 해시가 포함돼요. 요청 제한용 네트워크 해시는 매일 바뀌어요. 실제 이름이나 연락처를 입력하지 마세요.</p></details>`;
 host.append(root);const $=key=>root.querySelector(`[data-rank="${key}"]`);
 let generation=0,id=null,trace=null,busy=false,published=false,frozen=null,controller=null;
 const status=text=>{$('status').textContent=text;};
 async function request(action,body,signal){
  const response=await fetch(`/api/${mode}-challenge/${action}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal});
  let data;try{data=await response.json();}catch{throw Error('unavailable');}
  if(!response.ok||data?.error||data.mode!==mode)throw Error(data?.error?.code||'unavailable');return data;
 }
 const errorText=e=>({public_consent_required:'공개 동의를 확인해 주세요.',invalid_initials:'영문 이니셜 세 글자를 입력해 주세요.',blocked_initials:'다른 이니셜을 사용해 주세요.',rate_limited:'요청이 많아요. 잠시 뒤 다시 시도해 주세요.',attempt_invalid:'중단된 도전은 등록할 수 없어요. 새 도전을 시작해 주세요.',attempt_not_found:'도전이 만료되었거나 없어요. 새 도전을 시작해 주세요.',attempt_expired:'30분이 지나 도전이 만료됐어요. 새로 시작해 주세요.',invalid_result:'기록을 검산하지 못했어요. 새 도전을 시작해 주세요.'}[e.message]||'온라인 순위를 사용할 수 없어요. 로컬 연습은 계속할 수 있어요.');
 function reset(){
  const old=id;generation++;controller?.abort();controller=null;id=null;trace=null;busy=false;frozen=null;
  if(old&&!published)void fetch(`/api/${mode}-challenge/invalidate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({attemptId:old}),keepalive:true}).catch(()=>{});
  published=false;$('form').hidden=true;$('form').reset();$('form').querySelector('fieldset').disabled=false;$('start').disabled=false;$('read').disabled=false;
  status('연습과 지난 로컬 기록은 공개 순위에 보내지 않아요.');
 }
 async function read(){
  const gen=generation;$('read').disabled=true;
  try{const data=await request('record');if(gen!==generation)return;
   if(!Array.isArray(data.entries)||data.entries.length>10)throw Error('unavailable');
   $('entries').replaceChildren();
   for(const row of data.entries){if(!/^[A-Z]{3}$/.test(row.initials)||!Number.isInteger(row.metric)||!Number.isInteger(row.rank))throw Error('unavailable');
    const li=document.createElement('li');li.textContent=`${row.rank}위 · ${row.initials} · ${mode==='dance'?row.metric+'점':(row.metric/100).toFixed(3)+'초'}`;$('entries').append(li);}
   status(data.entries.length?'현재 공개 TOP 10이에요.':'아직 공개 기록이 없어요.');
  }catch(e){if(gen===generation)status(errorText(e));}finally{if(gen===generation)$('read').disabled=false;}
 }
 $('start').onclick=async()=>{
  if(busy)return;reset();const gen=generation;busy=true;$('start').disabled=true;controller=new AbortController();status('새 순위 도전을 준비하고 있어요…');
  try{const data=await request('attempts',{},controller.signal);if(gen!==generation)return;
   if(!/^[a-f0-9]{48}$/.test(data.attemptId||''))throw Error('unavailable');id=data.attemptId;
   begin();status('새 순위 도전 중이에요. 30분 안에 완주 후 공개 여부를 선택해요.');
  }catch(e){if(gen===generation)status(errorText(e));}finally{if(gen===generation){busy=false;$('start').disabled=false;}}
 };
 $('read').onclick=read;
 $('form').onsubmit=async e=>{
  e.preventDefault();if(busy||!id||!trace||published||!$('consent').checked)return;
  const initials=$('initials').value.toUpperCase();if(!/^[A-Z]{3}$/.test(initials))return;
  const gen=generation,attemptId=id;frozen??={initials,publicConsent:true,rankingConsent:`${mode}-side-top10-v1`};
  busy=true;$('form').querySelector('fieldset').disabled=true;$('start').disabled=true;controller=new AbortController();status('기록을 검산하고 공개하고 있어요…');
  try{
   await request('finish',{attemptId,...trace},controller.signal);
   const data=await request('submit',{attemptId,...frozen},controller.signal);if(gen!==generation)return;
   if(data.accepted!==true||typeof data.ranked!=='boolean')throw Error('unavailable');
   published=true;$('form').hidden=true;trace=null;status(data.ranked?'TOP 10에 공개했어요.':'검산은 성공했지만 현재 TOP 10 범위 밖이에요.');
  }catch(e){if(gen===generation){status(errorText(e)+' 같은 제출을 다시 시도할 수 있어요.');$('form').querySelector('fieldset').disabled=false;
   // An unknown outcome must retry exactly the same consent and initials.
   $('initials').value=frozen.initials;$('consent').checked=true;
   if(['invalid_initials','blocked_initials','public_consent_required'].includes(e.message)){frozen=null;$('initials').readOnly=false;}else $('initials').readOnly=true;}}
  finally{if(gen===generation){busy=false;$('start').disabled=false;}}
 };
 return{root,reset,read,get active(){return !!id&&!published;},complete(value){if(!id||trace)return;trace=structuredClone(value);$('form').hidden=false;$('initials').readOnly=false;status('완주했어요. 공개하려면 이니셜과 동의를 입력해 주세요.');},invalidate(){if(id){reset();status('중단된 순위 도전은 등록할 수 없어요. 새 도전으로 시작해 주세요.');}}};
}
