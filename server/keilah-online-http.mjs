import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {configuredOrigin,readChallengeJson} from './challenge-online-http.mjs';
import {createKeilahOnlineService} from './keilah-online-service.mjs';
import {ChallengeServiceError} from './challenge-service.mjs';
import {KeilahError} from './keilah-service.mjs';
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export function createKeilahOnlineHandler({env=process.env,serviceFactory=createKeilahOnlineService,now=Date.now}={}){
 return async request=>{
  try{
   if(env.KEILAH_ONLINE_ENABLED!=='true')throw new KeilahError('online_disabled',503);
   const origin=configuredOrigin(env.CHALLENGE_ALLOWED_ORIGIN),url=new URL(request.url),incoming=request.headers.get('origin');
   if(url.origin!==origin||(incoming&&incoming!==origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&incoming!==origin))throw new KeilahError('origin_rejected',403);
   const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
   if(env.VERCEL!=='1'||!isIP(ip||'')||!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(env.CHALLENGE_SUPABASE_SECRET_KEY||''))throw new KeilahError('not_configured',503);
   const path=url.pathname==='/api/keilah'?'/'+(url.searchParams.get('route')||''):url.pathname.replace(/^\/api\/keilah/,'');
   if(path==='/config'&&request.method==='GET')return Response.json({backend:'postgres',requiresConsent:true,pollMs:1000,graceMs:12000,resumeMs:60000},{headers});
   const key=createHmac('sha256',env.CHALLENGE_SUPABASE_SECRET_KEY).update(`keilah:${new Date(now()).toISOString().slice(0,10)}:${ip}`).digest('hex');
   const service=serviceFactory({url:env.CHALLENGE_SUPABASE_URL,secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY});
   if(path==='/ranking'&&request.method==='GET')return Response.json(await service.ranking(key),{headers});
   const match=path.match(/^\/rooms\/([A-F0-9]{8})(?:\/(join|command))?$/);
   const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
   if(match&&!match[2]&&request.method==='GET'){
    if(!token)throw new KeilahError('not_a_member',403);
    return Response.json(await service.read(match[1],token,key),{headers});
   }
   if(request.method!=='POST')throw new KeilahError('method_not_allowed',405);
   const body=await readChallengeJson(request,{maxBytes:2048,timeoutMs:5000});let result;
   if(path==='/rooms'||match?.[2]==='join'){
    if(!exact(body,['requestId']))throw new KeilahError('invalid_body');
    result=await service.enter(path==='/rooms'?'create':'join',{...body,code:match?.[1]},key);
   }else if(match?.[2]==='command'){
    if(!token)throw new KeilahError('not_a_member',403);
    const keys=body?.action==='move'?['seq','run','action','to']:body?.action==='ready'?['seq','run','action','consent']:['seq','run','action'];
    if(!exact(body,keys)||!Number.isSafeInteger(body.seq)||!Number.isSafeInteger(body.run)||(body.action==='ready'&&typeof body.consent!=='boolean'))throw new KeilahError('invalid_body');
    result=await service.command(match[1],token,body,key);
   }else throw new KeilahError('not_found',404);
   return Response.json(result,{headers});
  }catch(e){const known=e instanceof KeilahError||e instanceof ChallengeServiceError;return Response.json({error:known?e.code:'service_unavailable'},{status:known?e.status:503,headers});}
 };
}
