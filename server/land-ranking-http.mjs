import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

import {ChallengeServiceError} from './challenge-service.mjs';
import {configuredOrigin,readChallengeJson} from './challenge-online-http.mjs';
import {createLandService,LAND_VERSION,LAND_ACTS} from './land-ranking-service.mjs';

const responseHeaders=Object.freeze({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=(code,status=400)=>{throw new ChallengeServiceError(code,'Request rejected',status);};
const reply=(status,value,extra={})=>new Response(JSON.stringify(value),{status,headers:{...responseHeaders,...extra}});

export function createLandHandler(action,{env=process.env,serviceFactory=createLandService,now=Date.now}={}){
  if(!['record','attempts','finish','submit','invalidate'].includes(action))throw new TypeError('Invalid route');
  return async request=>{
    try{
      if(env.LAND_ONLINE_ENABLED!=='true')fail('online_disabled',503);
      const origin=configuredOrigin(env.CHALLENGE_ALLOWED_ORIGIN);
      if(!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(env.CHALLENGE_SUPABASE_SECRET_KEY||''))fail('not_configured',503);
      const method=action==='record'?'GET':'POST';
      if(request.method!==method)fail('method_not_allowed',405);
      const url=new URL(request.url),incoming=request.headers.get('origin');
      if(url.origin!==origin||(method==='POST'&&url.search)||url.hash||(incoming&&incoming!==origin)||(method==='POST'&&!incoming)||request.headers.get('sec-fetch-site')==='cross-site')fail('origin_rejected',403);
      if(env.VERCEL!=='1')fail('not_configured',503);
      const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
      if(!ip||!isIP(ip))fail('not_configured',503);
      const instant=typeof now==='function'?now():now;
      if(!Number.isFinite(instant))fail('not_configured',503);
      const day=new Date(instant).toISOString().slice(0,10);
      const key=createHmac('sha256',env.CHALLENGE_SUPABASE_SECRET_KEY).update(`land-ranking-rate:v1:${day}:${ip}`).digest('hex');
      const service=serviceFactory({url:env.CHALLENGE_SUPABASE_URL,secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY});
      let data,act;
      if(action==='record'){
        const params=[...url.searchParams.entries()];
        if(params.length!==1||params[0][0]!=='act'||!LAND_ACTS.includes(params[0][1])||url.search!=='?act='+params[0][1])fail('invalid_request');
        act=params[0][1];data=await service.read(act,key);
      }
      else{
        const payload=await readChallengeJson(request,{maxBytes:4*1024*1024,timeoutMs:5000});
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||!LAND_ACTS.includes(payload.act))fail('invalid_request');
        act=payload.act;
        if(action==='attempts'){
          if(!exact(payload,['act']))fail('invalid_request');
          data=await service.issue(act,key);
        }else{
          if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('invalid_request');
          const{attemptId,act:ignoredAct,...input}=payload;
          if(typeof attemptId!=='string'||!/^[a-f0-9]{48}$/.test(attemptId))fail('attempt_not_found',404);
          if(action==='invalidate'){
            if(!exact(input,[]))fail('invalid_request');
            data=await service.invalidate(act,attemptId,key);
          }else{
            if(action==='finish'&&!exact(input,['version','events']))fail('invalid_result');
            if(action==='submit'&&!exact(input,['initials','publicConsent','rankingConsent']))fail('invalid_request');
            data=await service[action](act,attemptId,input,key);
          }
        }
      }
      if(!data||data.mode!=='land'||data.version!==LAND_VERSION||data.act!==act)fail('service_unavailable',503);
      return reply(action==='attempts'?201:200,data);
    }catch(error){
      const known=error instanceof ChallengeServiceError;
      const status=known?error.status:503;
      return reply(status,{error:{code:known?error.code:'service_unavailable'}},status===429?{'retry-after':'60'}:{});
    }
  };
}
