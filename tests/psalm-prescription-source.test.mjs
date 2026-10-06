import test from 'node:test';
import assert from 'node:assert/strict';
import {PSALM_PRESCRIPTIONS} from '../src/psalm-prescriptions.js';
// Independent transcription of the five highlighted lines in the supplied leaflet.
const expected=[
 ['일상 속 은혜를 발견할 때',103,2,'내 영혼아, 주님을 찬송하여라. 주님이 베푸신 모든 은혜를 잊지 말아라.'],
 ['마음이 불안할 때',56,3,'두려움이 온통 나를 휩싸는 날에도, 나는 오히려 주님을 의지합니다.'],
 ['지치고 쉼이 필요할 때',23,3,'나에게 다시 새 힘을 주시고, 당신의 이름을 위하여 바른 길로 나를 인도하신다.'],
 ['고난과 위기 속에서 하나님이 건져주셨을 때',18,2,'주님은 나의 반석, 나의 요새, 나를 건지시는 분, 나의 하나님은 내가 피할 바위, 나의 방패, 나의 구원의 뿔, 나의 산성이십니다.'],
 ['중요한 일을 앞두고 있을 때',20,4,'임금님의 소원대로, 주님께서 임금님께 모든 것을 허락하여 주시고, 임금님의 계획대로, 주님께서 임금님께 모든 것을 이루어 주시기를 원합니다.']
];
test('attachment supplies exactly five representative 새번역 verses in order',()=>{
 assert.deepEqual(PSALM_PRESCRIPTIONS.map(x=>[x.situation,x.chapter,x.verseNumber,x.text]),expected);
 assert.equal(new Set(PSALM_PRESCRIPTIONS.map(x=>x.id)).size,5);
 assert.deepEqual(PSALM_PRESCRIPTIONS.map(x=>x.number),['01','02','03','04','05']);
 for(const item of PSALM_PRESCRIPTIONS){assert.equal(item.translation,'새번역');assert.equal(item.reference,`시편 ${item.chapter}편 ${item.verseNumber}절`);assert.ok(item.explanation.length>80);}
});
