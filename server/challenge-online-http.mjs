/** Same-origin Vercel HTTP boundary. Disabled unless separately approved/configured. */
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { CHALLENGE_SERVICE_LIMITS, ChallengeServiceError } from './challenge-service.mjs';
import { createSupabaseChallengeService } from './challenge-supabase.mjs';

const fail=(code,message,status=400,details={})=>{throw new ChallengeServiceError(code,message,status,details);};
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(status,value,extra={})=>new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});

export function configuredOrigin(value) {
  try {const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&value.replace(/\/$/,'')===url.origin)return url.origin;}catch{}
  fail('not_configured','The online leaderboard is not configured',503);
}
export function challengeClientKey(request,{env,now=Date.now}) {
  // This header is trusted only inside Vercel's platform runtime, never a generic proxy.
  if(env.VERCEL!=='1')fail('not_configured','The online API requires its configured hosting runtime',503);
  const raw=request.headers.get('x-vercel-forwarded-for');
  const address=raw?.split(',')[0].trim();
  if(!address||!isIP(address))fail('network_unavailable','The server could not verify request routing',503);
  const day=new Date(now()).toISOString().slice(0,10);
  // Domain separation and daily rotation avoid an extra credential and a stable visitor identifier.
  return createHmac('sha256',env.CHALLENGE_SUPABASE_SECRET_KEY).update(`sling-challenge-rate:v1:${day}:${address}`).digest('hex');
}
export async function readChallengeJson(request,{maxBytes=CHALLENGE_SERVICE_LIMITS.maxBodyBytes,timeoutMs=5000}={}) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))fail('json_required','Use application/json',415);
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))fail('body_too_large','Request is too large',413);
  if(!request.body)fail('invalid_json','Send a valid JSON object');
  const reader=request.body.getReader();const chunks=[];let bytes=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ChallengeServiceError('request_timeout','Request timed out',408)),timeoutMs);});
  try {
    while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)fail('body_too_large','Request is too large',413);chunks.push(value);}
    const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{fail('invalid_json','Send a valid JSON object');}
  } finally {clearTimeout(timer);try{await reader.cancel();}catch{}reader.releaseLock();}
}
function attemptPayload(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('invalid_request','Send a JSON object');
  const {attemptId:id,...input}=payload;
  if(!/^[a-f0-9]{48}$/.test(id||''))fail('attempt_not_found','This attempt was not found',404);
  return {id,input};
}

export function createOnlineChallengeHandler(action,{env=process.env,serviceFactory=createSupabaseChallengeService,now=Date.now}={}) {
  if(!['record','attempts','finish','submit'].includes(action))throw new TypeError('Invalid route');
  return async request=>{
    if(env.CHALLENGE_ONLINE_ENABLED!=='true')return reply(503,{mode:'unavailable',onlineEligible:false,error:{code:'online_disabled',message:'Online leaderboard is not enabled'}});
    try {
      const origin=configuredOrigin(env.CHALLENGE_ALLOWED_ORIGIN);
      if(!/^sb_secret_[A-Za-z0-9_-]+$/.test(env.CHALLENGE_SUPABASE_SECRET_KEY||''))fail('not_configured','The online leaderboard is not configured',503);
      const url=new URL(request.url);const method=action==='record'?'GET':'POST';
      if(request.method!==method)fail('method_not_allowed',`Use ${method}`,405);
      const suppliedOrigin=request.headers.get('origin');
      // No cookies/auth state is used; still reject cross-origin mutations and unexpected deployment hosts.
      if(url.origin!==origin||(suppliedOrigin&&suppliedOrigin!==origin)||(method==='POST'&&!suppliedOrigin))fail('origin_rejected','Use the game website to submit a challenge',403);
      if(request.headers.get('sec-fetch-site')==='cross-site')fail('origin_rejected','Use the game website',403);
      const clientKey=challengeClientKey(request,{env,now});
      const service=serviceFactory({url:env.CHALLENGE_SUPABASE_URL,secretKey:env.CHALLENGE_SUPABASE_SECRET_KEY});
      if(action==='record')return reply(200,await service.getRecord({clientKey}));
      const payload=await readChallengeJson(request);
      if(action==='attempts'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length)fail('invalid_request','Attempt creation accepts only an empty object');
        return reply(201,await service.createAttempt({clientKey}));
      }
      // Capabilities stay in the body, never URL/query logs.
      const {id,input}=attemptPayload(payload);
      return reply(200,action==='finish'?await service.finishAttempt(id,input,{clientKey}):await service.submitRecord(id,input,{clientKey}));
    } catch(error) {
      const known=error instanceof ChallengeServiceError;
      const status=known?error.status:503;const retry=known&&status===429?Math.max(1,Math.ceil((error.details?.retryAfterMs||1000)/1000)):null;
      return reply(status,{mode:'unavailable',onlineEligible:false,error:{code:known?error.code:'service_unavailable',message:known?error.message:'The online leaderboard is temporarily unavailable',...(known?error.details:{})}},retry?{'Retry-After':String(retry)}:{});
    }
  };
}
