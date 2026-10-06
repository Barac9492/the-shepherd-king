import { PSALM23 } from './psalm23.js';
import { DANCE_PSALMS } from './dance-psalms.js';

export const VERSES = PSALM23.ko;
export const SCORE_KEY = 'david-dance-local-v1';
// Only spacing and punctuation are optional. Letters, numbers and symbols remain significant.
export const normalize = value => String(value).normalize('NFC').replace(/[\s\p{P}]/gu, '');

export function compareVerse(expected, input) {
  const a = [...normalize(expected)], b = [...normalize(input)];
  const dp = Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=0;i<=a.length;i++)dp[i][0]=i;
  for(let j=0;j<=b.length;j++)dp[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)
    dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  let i=a.length,j=b.length;const edits=[];
  while(i||j){
    if(i&&j&&dp[i][j]===dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){
      edits.push({expected:a[i-1],actual:b[j-1],same:a[i-1]===b[j-1]});i--;j--;
    }else if(i&&dp[i][j]===dp[i-1][j]+1){edits.push({expected:a[--i],actual:'',same:false});}
    else{edits.push({expected:'',actual:b[--j],same:false});}
  }
  const groups=[];
  for(const edit of edits.reverse()){
    let group=groups.at(-1);
    if(!group||group.same!==edit.same){group={same:edit.same,expected:'',actual:''};groups.push(group);}
    group.expected+=edit.expected;group.actual+=edit.actual;
  }
  return {correct:dp[a.length][b.length]===0, accuracy:Math.max(0,Math.round(100*(1-dp[a.length][b.length]/Math.max(a.length,b.length,1)))),groups};
}

// Omitting an id deliberately retains the original online validator's text and rules.
// The new UI always passes a supplied-text id; its records never share the legacy key.
export function getPsalm(id) {
  if(id===undefined)return {id:undefined,chapter:23,title:'시편 23편',verses:VERSES};
  const psalm=DANCE_PSALMS.find(item=>item.id===id);
  if(!psalm)throw new RangeError('Unknown dance psalm');
  return psalm;
}
export const scoreKey = id => id===undefined ? SCORE_KEY : `david-dance-supplied-v1-${getPsalm(id).id}`;
export const isPrayerPsalm = id => getPsalm(id).chapter===51;
export function maxScore(id){const psalm=getPsalm(id);if(isPrayerPsalm(id))return 0;const count=psalm.verses.length;return count*100+5*count*(count+1)+300;}
export function createRound(mode='practice',psalmId) {
  getPsalm(psalmId);
  return {mode,psalmId,index:0,stage:0,phase:'input',score:0,streak:0,firstAccuracy:null,hinted:false,lastInput:null,verses:[],attempts:0};
}
export function revealHint(round){if(round.phase==='input')round.hinted=true;}
export function submitVerse(round,input){
  if(round.phase!=='input'||input.length>600||!normalize(input))return {ignored:true};
  const value=normalize(input);
  if(value===round.lastInput)return {ignored:true};
  round.lastInput=value;round.attempts++;
  const text=getPsalm(round.psalmId).verses;
  const result=compareVerse(text[round.index],input);
  // Psalm 51 is a prayer-reading aid, not a scored challenge. Corrections remain useful,
  // but neither attempts, hints nor completion produce points or a streak.
  if(isPrayerPsalm(round.psalmId)){
    round.score=0;round.streak=0;round.firstAccuracy=null;
    if(!result.correct)return result;
    round.stage++;round.verses.push({accuracy:null,hint:round.hinted,earned:0});
    round.phase=round.stage===text.length?'complete':'success';
    return {...result,earned:0};
  }
  if(round.firstAccuracy===null)round.firstAccuracy=result.accuracy;
  if(!result.correct){round.streak=0;return result;}
  const clean=round.attempts===1&&!round.hinted;
  round.streak=clean?round.streak+1:0;
  const earned=Math.max(0,round.firstAccuracy-(round.hinted?30:0))+10*round.streak;
  round.score+=earned;round.stage++;
  round.verses.push({accuracy:round.firstAccuracy,hint:round.hinted,earned});
  round.phase=round.stage===text.length?'complete':'success';
  if(round.phase==='complete')round.score+=300;
  return {...result,earned};
}
export function nextVerse(round){
  if(round.phase!=='success')return false;
  round.index++;round.phase='input';round.firstAccuracy=null;round.hinted=false;round.lastInput=null;round.attempts=0;return true;
}
export function readScores(storage,psalmId){
  if(isPrayerPsalm(psalmId))return [];
  const key=scoreKey(psalmId),maximum=maxScore(psalmId);
  try{return JSON.parse(storage.getItem(key)||'[]').filter(r=>r&&Number.isInteger(r.score)&&r.score>=300&&r.score<=maximum&&Number.isFinite(r.at)).slice(0,5);}catch{return [];}
}
export function saveScore(storage,round){
  if(isPrayerPsalm(round.psalmId)||round.mode!=='challenge'||round.phase!=='complete'||round.saved)return null;
  round.saved=true;
  const key=scoreKey(round.psalmId);
  const scores=[...readScores(storage,round.psalmId),{score:round.score,at:Date.now()}].sort((a,b)=>b.score-a.score||b.at-a.at).slice(0,5);
  try{storage.setItem(key,JSON.stringify(scores));return scores;}catch{return null;}
}
