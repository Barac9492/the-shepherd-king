import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {configuredOrigin,readChallengeJson} from './challenge-online-http.mjs';
import {ChallengeServiceError} from './challenge-service.mjs';
import {exact,reject} from './side-challenge-replay.mjs';
import {createSideService} from './side-challenge-service.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export function createSideHandler(mode,action,{env=process.env,serviceFactory=createSideService,now=Date.now}={}){
  if(!['dance','engedi'].includes(mode)||!['record','attempts','finish','submit','invalidate'].includes(action))throw new TypeError('Invalid route');
  return async request=>{
    try{
      if(env[`${mode.toUpperCase()}_ONLINE_ENABLED`]!=='true')reject('online_disabled',503);
      const origin=configuredOrigin(env.CHALLENGE_ALLOWED_ORIGIN),method=action==='record'?'GET':'POST';
      if(request.method!==method)reject('method_not_allowed',405);
      const incoming=request.headers.get('origin');
      if(new URL(request.url).origin!==origin||(incoming&&incoming!==origin)||(method==='POST'&&!incoming)||request.headers.get('sec-fetch-site')==='cross-site')reject('origin_rejected',403);
      const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
      if(env.VERCEL!=='1'||!ip||!isIP(ip)||!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(env.CHALLENGE_SUPABASE_SECRET_KEY||''))reject('not_configured',503);
      const key=createHmac('sha256',env.CHALLENGE_SUPABASE_SECRET_KEY).update(`${mode}-rate:${new Date(now()).toISOString().slice(0,10)}:${ip}`).digest('hex');
      const service=serviceFactory({mode,url:env.CHALLENGE_SUPABASE_URL,secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY});
      let data;
      if(action==='record')data=await service.read(key);
      else{
        const payload=await readChallengeJson(request,{maxBytes:65536});
        if(action==='attempts'){if(!exact(payload,[]))reject('invalid_request');data=await service.issue(key);}
        else{
          if(!payload||typeof payload!=='object'||Array.isArray(payload))reject('invalid_request');
          const {attemptId,...input}=payload;if(!/^[a-f0-9]{48}$/.test(attemptId||''))reject('attempt_not_found',404);
          if(action==='invalidate'){if(!exact(input,[]))reject('invalid_request');data=await service.invalidate(attemptId,key);}
          else data=await service[action](attemptId,input,key);
        }
      }
      return new Response(JSON.stringify(data),{status:action==='attempts'?201:200,headers});
    }catch(e){const known=e instanceof ChallengeServiceError,status=known?e.status:503;
      return new Response(JSON.stringify({error:{code:known?e.code:'service_unavailable'}}),{status,headers:{...headers,...(status===429?{'retry-after':'60'}:{})}});}
  };
}
