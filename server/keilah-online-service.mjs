import {createHash,createHmac,randomBytes} from 'node:crypto';
import {validateSupabaseChallengeConfig} from './challenge-supabase.mjs';
import {readChallengeJson} from './challenge-online-http.mjs';
import {KeilahError} from './keilah-service.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function createKeilahOnlineService({url,secretKey,fetchImpl=fetch}){
 const config=validateSupabaseChallengeConfig({url,secretKey});
 const sign=s=>createHmac('sha256',config.secretKey).update(s).digest('hex');
 async function rpc(action,input,key){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);timer.unref?.();
  try{
   const response=await fetchImpl(config.url+'/rest/v1/rpc/keilah_coop_rpc',{method:'POST',headers:{apikey:config.secretKey,'content-type':'application/json'},body:JSON.stringify({p_action:action,p_input:{...input,version:'keilah-1'},p_client_key:key}),signal:controller.signal,redirect:'error',cache:'no-store'});
   if(!response.ok)throw new KeilahError('service_unavailable',503);
   const data=await readChallengeJson(response,{maxBytes:24000,timeoutMs:7000});
   if(data?.error){if(typeof data.error.code!=='string'||![400,403,404,409,410,429,503].includes(data.status))throw new KeilahError('service_unavailable',503);throw new KeilahError(data.error.code,data.status);}
   // The database projection must never expose private room capabilities.
   if(data.players?.some(p=>p&&('secret'in p||'joinKey'in p||'lastCommand'in p)))throw new KeilahError('service_unavailable',503);
   return data;
  }catch(e){if(e instanceof KeilahError)throw e;throw new KeilahError('service_unavailable',503);}finally{clearTimeout(timer);}
 }
 return {
  async enter(action,{code,requestId},key){
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId||''))throw new KeilahError('invalid_request');
   const requestKey=sign('keilah-request:'+action+':'+requestId),token=sign('keilah-token:'+action+':'+requestId);
   for(let n=0;n<3;n++){try{return {token,state:await rpc(action,{code:action==='create'?randomBytes(4).toString('hex').toUpperCase():code,requestKey,secret:sha(token)},key)};}catch(e){if(e.code!=='code_conflict'||action!=='create')throw e;}}
   throw new KeilahError('server_busy',503);
  },
  async read(code,token,key){return rpc('read',{code,secret:sha(token)},key);},
  async command(code,token,payload,key){return rpc('command',{...payload,code,secret:sha(token)},key);},
  async ranking(key){return rpc('ranking',{},key);},
 };
}
