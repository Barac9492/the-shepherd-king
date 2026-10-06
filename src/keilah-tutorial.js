const STEPS=[
 {title:'1. 지도와 이동 버튼',body:'●는 나, ◆는 동료, ♟는 구출할 가족이에요. 지도 위 캐릭터를 끌어서 움직이지 않아요. 아래에서 현재 위치와 선으로 이어진 목적지 버튼을 눌러요.',action:'둘 다 성 안 광장으로 이동',positions:['square','square']},
 {title:'2. 서로 다른 손잡이로 이동',body:'1번은 서쪽 손잡이, 2번은 동쪽 손잡이로 갑니다. 손잡이는 자기 쪽이 아니라 반대편 통로를 열어요.',action:'각자 손잡이로 이동',positions:['west','east']},
 {title:'3. 2번이 서쪽 통로 열기',body:'동쪽 손잡이에 선 2번이 “서쪽 통로 열어 두기”를 눌러요. 이동하면 손잡이가 자동으로 놓이므로 그대로 기다립니다.',action:'2번: 서쪽 통로 열어 두기',positions:['west','east'],holding:'west'},
 {title:'4. 1번이 완전히 건너기',body:'1번이 “이동 · 서쪽 통로”를 눌러요. 1번의 이동이 완전히 끝나기 전에 2번이 손잡이를 놓으면 통과가 취소돼요.',action:'1번: 서쪽 통로 끝까지 건너기',positions:['wgate','east'],gates:['west'],holding:'west',opened:[0,1]},
 {title:'5. 돌아와 역할 바꾸기',body:'열린 서쪽 통로는 계속 열려 있어요. 2번은 “손잡이 놓기”를 누르고, 1번은 서쪽 손잡이로 돌아와 반대편인 동쪽 통로를 열어 줍니다.',action:'역할 바꾸고 동쪽 통로 열기',positions:['west','east'],gates:['west'],holding:'east',opened:[0,1]},
 {title:'6. 2번이 동쪽 통로 건너기',body:'2번이 “이동 · 동쪽 통로”를 눌러 완전히 건너요. 이제 두 사람 모두 통로를 연 역할이 한 번씩 기록됐어요.',action:'2번: 동쪽 통로 끝까지 건너기',positions:['west','egate'],gates:['west','east'],holding:'east',opened:[1,1]},
 {title:'7. 가족을 한 팀씩 인솔하기',body:'1번은 이동하며 손잡이가 자동으로 놓여요. 각자 ♟ 가족에게 가서 “가족 인솔 시작 · 14초”를 눌러요. 한 팀을 데리고 있을 때는 다른 가족을 또 인솔할 수 없어요.',action:'둘 다 가족 한 팀 인솔하기',positions:['w1','e1'],gates:['west','east'],holding:null,carrying:[true,true],opened:[1,1],rescued:[1,1],rescuedNodes:['w1','e1']},
 {title:'8. 남문 자동 도착과 탈출',body:'가족과 남문에 도착하면 별도 내려놓기 없이 자동으로 안전 도착해요. 같은 방법으로 네 가족을 모두 옮긴 뒤 두 사람 모두 남문에서 각자 탈출 버튼을 눌러야 끝나요.',action:'네 가족 도착 · 두 사람 모두 탈출',positions:['exit','exit'],gates:['west','east'],holding:null,carrying:[false,false],opened:[1,1],rescued:[2,2],rescuedNodes:['w1','w2','e1','e2'],delivered:4,complete:true},
];

const POS={exit:[150,260],square:[150,210],west:[80,160],east:[220,160],wgate:[35,105],egate:[265,105],w1:[65,50],w2:[120,24],e1:[235,50],e2:[180,24]};
const LABEL={exit:'남문',square:'광장',west:'서쪽 손잡이',east:'동쪽 손잡이',wgate:'서쪽 통로',egate:'동쪽 통로',w1:'가족',w2:'가족',e1:'가족',e2:'가족'};
const LINES=[['exit','square'],['square','west'],['square','east'],['west','east'],['west','wgate','west'],['east','egate','east'],['wgate','w1'],['w1','w2'],['egate','e1'],['e1','e2']];

function snapshotAt(completedSteps){
 const merged={positions:['exit','exit'],gates:[],holding:null,opened:[0,0],rescued:[0,0],rescuedNodes:[],carrying:[false,false],delivered:0,complete:false};
 for(let i=0;i<completedSteps;i++)Object.assign(merged,STEPS[i]);
 return merged;
}

function mapMarkup(view){
 const roads=LINES.map(([a,b,gate])=>{const [x1,y1]=POS[a],[x2,y2]=POS[b],open=!gate||view.gates.includes(gate)||view.holding===gate;return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${gate?(open?'tutorial-road open':'tutorial-road locked'):'tutorial-road'}"/>`;}).join('');
 const symbol=id=>id==='exit'?'⌂':id==='square'||id.includes('gate')?'·':id==='west'||id==='east'?'⚙':view.rescuedNodes.includes(id)?'✓':'♟';
 const nodes=Object.entries(POS).map(([id,[x,y]])=>`<g><circle cx="${x}" cy="${y}" r="${id.includes('gate')?10:13}" class="tutorial-node ${id==='west'||id==='east'?'handle':''}"/><text x="${x}" y="${y+4}" text-anchor="middle" class="tutorial-symbol">${symbol(id)}</text><text x="${x}" y="${y+24}" text-anchor="middle" class="tutorial-label">${LABEL[id]}</text></g>`).join('');
 const players=view.positions.map((id,index)=>{const [x,y]=POS[id],px=x+(index?-8:8),py=y-13,carrying=view.carrying[index],shape=index?`<polygon points="${px},${py-9} ${px+9},${py} ${px},${py+9} ${px-9},${py}" class="tutorial-player p2"/>`:`<circle cx="${px}" cy="${py}" r="8" class="tutorial-player p1"/>`;return `<g>${shape}<text x="${px}" y="${py+3}" text-anchor="middle" class="tutorial-player-label">${index+1}</text>${carrying?`<text x="${px}" y="${py-13}" text-anchor="middle" class="tutorial-carry">♟</text>`:''}</g>`;}).join('');
 return `<svg viewBox="0 0 300 290" role="img" aria-label="축약한 그일라 연습 지도">${roads}${nodes}${players}</svg>`;
}

export function mountKeilahTutorial({dialog,root,triggers=[],closeButton,resetButton}){
 let step=0,opener=null;
 const render=()=>{
  const finished=step===STEPS.length,item=finished?null:STEPS[step],view=snapshotAt(step),shownStep=finished?STEPS.length:step+1;
  const title=finished?'연습 완료':item.title,body=finished?'이제 실제 방에서 같은 순서로 협력해 보세요. 연습에서는 시간이 짧아졌지만 실전 기본 이동은 6–15초, 가족 인솔은 14초가 걸려요. 이 연습은 방 상태나 기록을 바꾸지 않았어요.':item.body;
  root.innerHTML=`<div class="tutorial-progress" aria-label="연습 진행 ${step}/${STEPS.length}"><span style="width:${(step/STEPS.length)*100}%"></span></div><p class="tutorial-step">${shownStep} / ${STEPS.length} · 축약 연습</p><h3 tabindex="-1">${title}</h3><p>${body}</p><div class="tutorial-map">${mapMarkup(view)}<div class="tutorial-legend"><span>● 1번</span><span>◆ 2번</span><span>♟ 가족</span><span class="tutorial-hold">${view.holding?`${view.holding==='west'?'서쪽':'동쪽'} 통로 여는 중`:view.complete?'둘 다 탈출 완료':'버튼을 누르면 지도가 바뀌어요'}</span></div></div><div class="tutorial-summary"><span>통로 역할 ${view.opened.filter(Boolean).length}/2</span><span>직접 인솔 ${view.rescued.filter(Boolean).length}/2명</span><span>남문 도착 ${view.delivered}/4</span></div><button type="button" class="primary tutorial-next">${finished?'연습 닫기':item.action}</button>${finished?'<p class="tutorial-done" role="status">가족 네 팀과 두 사람이 모두 남문 밖에 도착했어요.</p>':''}`;
  const next=root.querySelector('.tutorial-next');
  next.onclick=()=>{if(finished){dialog.close();return;}step++;render();root.querySelector('h3').focus();};
 };
 const open=event=>{opener=event.currentTarget;step=0;render();dialog.showModal();closeButton.focus();};
 for(const trigger of triggers)trigger?.addEventListener('click',open);
 closeButton.addEventListener('click',()=>dialog.close());
 resetButton.addEventListener('click',()=>{step=0;render();root.querySelector('h3').focus();});
 dialog.addEventListener('close',()=>opener?.focus());
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 render();
 return {reset(){step=0;render();},open};
}
