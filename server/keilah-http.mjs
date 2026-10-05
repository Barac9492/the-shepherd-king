import {createKeilahService,KeilahError} from './keilah-service.mjs';
const PREFIX='/api/keilah';
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.sort().join(',');
export function createKeilahHttp({service=createKeilahService(),now=Date.now}={}){
 const buckets=new Map();
 const timer=setInterval(()=>service.tick(),100);timer.unref();
 async function handle(req,res){
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(PREFIX+'/'))return false;
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(body));};
  try{
   const key=req.socket.remoteAddress,t=now();let bucket=buckets.get(key);if(!bucket||t-bucket.at>=60000){bucket={at:t,n:0};buckets.set(key,bucket);}if(++bucket.n>1800)throw new KeilahError('rate_limited',429);
   for(const [k,b] of buckets)if(t-b.at>120000)buckets.delete(k);
   const origin=`http://${req.headers.host}`;
   if((req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site'||(req.method==='POST'&&req.headers.origin!==origin))throw new KeilahError('origin_rejected',403);
   if(req.method==='GET'&&url.pathname===PREFIX+'/ranking'){send(200,service.ranking());return true;}
   const m=url.pathname.match(/^\/api\/keilah\/rooms\/([A-F0-9]{8})(?:\/(join|command))?$/);
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(req.method==='GET'&&m&&!m[2]){send(200,service.read(m[1],token));return true;}
   if(req.method!=='POST')throw new KeilahError('method_not_allowed',405);
   if(!/^application\/json(?:;|$)/.test(req.headers['content-type']||''))throw new KeilahError('json_required',415);
   const body=await readBody(req);
   let result;
   if(url.pathname===PREFIX+'/rooms'){if(!exact(body,['requestId']))throw new KeilahError('invalid_body');result=service.create(body.requestId);}
   else if(m?.[2]==='join'){if(!exact(body,['requestId']))throw new KeilahError('invalid_body');result=service.join(m[1],body.requestId);}
   else if(m?.[2]==='command'){if(!exact(body,body.action==='move'?['seq','run','action','to']:['seq','run','action']))throw new KeilahError('invalid_body');result=service.command(m[1],token,body);}
   else throw new KeilahError('not_found',404);
   send(200,result);
  }catch(e){send(e instanceof KeilahError?e.status:500,{error:e instanceof KeilahError?e.code:'server_error'});}
  return true;
 }
 return {handle,close:()=>clearInterval(timer)};
}
function readBody(req){return new Promise((resolve,reject)=>{
 let size=0,done=false,chunks=[];
 const finish=(err,data)=>{if(done)return;done=true;clearTimeout(timer);if(err){req.resume();reject(err);}else resolve(data);};
 const timer=setTimeout(()=>finish(new KeilahError('request_timeout',408)),5000);timer.unref();
 req.on('data',chunk=>{size+=chunk.length;if(size>2048)finish(new KeilahError('body_too_large',413));else if(!done)chunks.push(chunk);});
 req.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString()));}catch{finish(new KeilahError('invalid_json'));}});
 req.on('error',()=>finish(new KeilahError('invalid_request')));req.on('aborted',()=>finish(new KeilahError('invalid_request')));
});}
