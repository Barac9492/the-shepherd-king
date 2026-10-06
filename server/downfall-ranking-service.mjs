import {createHash,randomBytes} from 'node:crypto';
import {DOWNFALL_RANKING,RankingReplayError,replayDownfallRanking} from '../src/downfall-ranking-core.js';
import {ChallengeServiceError,validateInitials} from './challenge-service.mjs';
import {readChallengeJson} from './challenge-online-http.mjs';
import {validateSupabaseChallengeConfig} from './challenge-supabase.mjs';

const metadata=Object.freeze({mode:'downfall',version:DOWNFALL_RANKING.version});
const knownCodes=new Set([
  'invalid_request','invalid_result','unsupported_version','attempt_not_found','attempt_expired',
  'attempt_conflict','attempt_invalid','future_timing','attempt_unverified','not_qualified',
  'public_consent_required','invalid_initials','blocked_initials','rate_limited','server_busy',
]);
const messages=Object.freeze({
  invalid_request:'This request is not valid',invalid_result:'This attempt could not be verified',
  unsupported_version:'The ranking rules changed; start a new attempt',attempt_not_found:'This attempt was not found',
  attempt_expired:'This attempt expired; start a new one',attempt_conflict:'This attempt conflicts with an earlier request',
  attempt_invalid:'This attempt is no longer valid',future_timing:'The attempt is faster than elapsed server time',
  attempt_unverified:'Finish and verify this attempt first',not_qualified:'This score is not eligible for publication',
  public_consent_required:'Confirm public initials and score consent',invalid_initials:'Enter exactly three uppercase English letters',
  blocked_initials:'Please choose different initials',rate_limited:'Too many requests; wait before retrying',
  server_busy:'The ranking service is busy',service_unavailable:'The ranking service is temporarily unavailable',
});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(code,status=400)=>{throw new ChallengeServiceError(code,messages[code]||messages.service_unavailable,status);};
const validClientKey=key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)&&key!=='0'.repeat(64);
const validAttemptId=id=>typeof id==='string'&&/^[a-f0-9]{48}$/.test(id);

function publicEntries(value){
  if(!Array.isArray(value)||value.length>10)fail('service_unavailable',503);
  let previousScore=Infinity,previousRank=0;
  return value.map((entry,index)=>{
    const expectedRank=entry?.score===previousScore?previousRank:index+1;
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||!/^[A-Z]{3}$/.test(entry.initials||'')||
      !Number.isInteger(entry.score)||entry.score<1||entry.score>32400000||entry.score>previousScore||entry.rank!==expectedRank)
      fail('service_unavailable',503);
    previousScore=entry.score;previousRank=expectedRank;
    return{rank:expectedRank,initials:entry.initials,score:entry.score};
  });
}

export function createDownfallService({url,secretKey,fetchImpl=fetch,timeoutMs=6000}={}){
  const config=validateSupabaseChallengeConfig({url,secretKey});
  if(typeof fetchImpl!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1)throw new TypeError('Invalid service transport');
  async function rpc(action,input,clientKey){
    if(!validClientKey(clientKey))fail('invalid_request');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
    try{
      const response=await fetchImpl(`${config.url}/rest/v1/rpc/downfall_challenge_rpc`,{
        method:'POST',headers:{apikey:config.secretKey,'content-type':'application/json'},
        body:JSON.stringify({p_action:action,p_input:{...input,version:DOWNFALL_RANKING.version},p_client_key:clientKey}),
        signal:controller.signal,redirect:'error',cache:'no-store',
      });
      if(!response.ok)fail('service_unavailable',503);
      let data;
      try{data=await readChallengeJson(response,{maxBytes:16384,timeoutMs});}
      catch{fail('service_unavailable',503);}
      if(data?.error){
        const status=data.status;
        if(!knownCodes.has(data.error.code)||!Number.isInteger(status)||![400,404,409,410,429,503].includes(status))fail('service_unavailable',503);
        fail(data.error.code,status);
      }
      if(!data||data.mode!=='downfall'||data.version!==DOWNFALL_RANKING.version)fail('service_unavailable',503);
      return data;
    }catch(error){
      if(error instanceof ChallengeServiceError)throw error;
      fail('service_unavailable',503);
    }finally{clearTimeout(timer);}
  }
  return{
    async read(key){
      const data=await rpc('read',{},key);
      return{...metadata,entries:publicEntries(data.entries)};
    },
    async issue(key){
      const id=randomBytes(24).toString('hex');
      const data=await rpc('issue',{id},key);
      if(data.id!==id)fail('service_unavailable',503);
      return{...metadata,attemptId:id,seed:DOWNFALL_RANKING.seed};
    },
    async finish(id,input,key){
      if(!validAttemptId(id))fail('attempt_not_found',404);
      await rpc('inspect',{id},key);
      let result;
      try{result=replayDownfallRanking(input);}
      catch(error){
        if(error instanceof RankingReplayError||error?.name==='RankingReplayError')
          fail(error.code==='unsupported_version'?'unsupported_version':'invalid_result',error.code==='unsupported_version'?409:400);
        throw error;
      }
      await rpc('finalize',{id,result,transcriptHash:fingerprint(input)},key);
      return{...metadata,result:{score:result.score,kills:result.kills,wave:result.wave,activeMs:result.activeMs,maxCombo:result.maxCombo,shots:result.shots,hits:result.hits}};
    },
    async submit(id,input,key){
      if(!validAttemptId(id))fail('attempt_not_found',404);
      if(!exact(input,['initials','publicConsent','rankingConsent']))fail('invalid_request');
      validateInitials(input.initials);
      if(input.publicConsent!==true||input.rankingConsent!==DOWNFALL_RANKING.version)fail('public_consent_required');
      const data=await rpc('submit',{id,...input,submissionHash:fingerprint(input)},key);
      if(typeof data.ranked!=='boolean')fail('service_unavailable',503);
      return{...metadata,accepted:true,ranked:data.ranked};
    },
    async invalidate(id,key){
      if(!validAttemptId(id))fail('attempt_not_found',404);
      await rpc('invalidate',{id},key);
      return{...metadata,invalidated:true};
    },
  };
}
