import {createHash,randomBytes} from 'node:crypto';
import {validateSupabaseChallengeConfig} from './challenge-supabase.mjs';
import {validateInitials,ChallengeServiceError} from './challenge-service.mjs';
import {readChallengeJson} from './challenge-online-http.mjs';
import {SIDE_VERSION,exact,reject,replaySide} from './side-challenge-replay.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const codes=new Set(['invalid_request','invalid_result','attempt_not_found','attempt_expired','attempt_conflict','attempt_invalid','future_timing','attempt_unverified','public_consent_required','invalid_initials','blocked_initials','rate_limited','server_busy','unsupported_version']);
export function createSideService({mode,url,secretKey,fetchImpl=fetch,timeoutMs=6000}){
  if(!['dance','engedi'].includes(mode))throw new TypeError('Invalid mode');
  const config=validateSupabaseChallengeConfig({url,secretKey});
  const metadata={mode,version:SIDE_VERSION};
  async function rpc(action,input,clientKey){
    if(!/^[a-f0-9]{64}$/.test(clientKey||'')||clientKey==='0'.repeat(64))reject('invalid_request');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
    try{
      const response=await fetchImpl(`${config.url}/rest/v1/rpc/${mode}_challenge_rpc`,{method:'POST',headers:{apikey:config.secretKey,'content-type':'application/json'},
        body:JSON.stringify({p_action:action,p_input:{...input,version:SIDE_VERSION},p_client_key:clientKey}),signal:controller.signal,redirect:'error',cache:'no-store'});
      if(!response.ok)reject('service_unavailable',503);
      const data=await readChallengeJson(response,{maxBytes:16384,timeoutMs});
      if(data?.error){if(!codes.has(data.error.code)||![400,404,409,410,429,503].includes(data.status))reject('service_unavailable',503);reject(data.error.code,data.status);}
      if(data?.version!==SIDE_VERSION||data.mode!==mode)reject('service_unavailable',503);
      return data;
    }catch(e){if(e instanceof ChallengeServiceError)throw e;reject('service_unavailable',503);}finally{clearTimeout(timer);}
  }
  return {
    async read(key){const data=await rpc('read',{},key);if(!Array.isArray(data.entries)||data.entries.length>10)reject('service_unavailable',503);
      let last=mode==='dance'?Infinity:-Infinity,lastRank=0;
      const entries=data.entries.map((e,i)=>{
        const rank=e.metric===last?lastRank:i+1;
        if(!/^[A-Z]{3}$/.test(e.initials)||!Number.isInteger(e.metric)||e.metric<(mode==='dance'?300:1)||e.metric>(mode==='dance'?1110:12000)||
          (mode==='dance'?e.metric>last:e.metric<last)||e.rank!==rank)reject('service_unavailable',503);
        last=e.metric;lastRank=rank;return{initials:e.initials,metric:e.metric,rank};});return{...metadata,entries};},
    async issue(key){const id=randomBytes(24).toString('hex');const data=await rpc('issue',{id},key);if(data.id!==id)reject('service_unavailable',503);return{...metadata,attemptId:id};},
    async finish(id,input,key){await rpc('inspect',{id},key);const result=replaySide(mode,input);await rpc('finalize',{id,result,transcriptHash:hash(input)},key);return{...metadata,result};},
    async invalidate(id,key){await rpc('invalidate',{id},key);return{...metadata,invalidated:true};},
    async submit(id,input,key){
      if(!exact(input,['initials','publicConsent','rankingConsent']))reject('invalid_request');
      validateInitials(input.initials);
      if(input.publicConsent!==true||input.rankingConsent!==`${mode}-${SIDE_VERSION}`)reject('public_consent_required');
      const data=await rpc('submit',{id,...input,submissionHash:hash(input)},key);
      if(typeof data.ranked!=='boolean')reject('service_unavailable',503);
      return{...metadata,accepted:true,ranked:data.ranked};
    },
  };
}
