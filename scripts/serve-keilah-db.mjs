/** Local, file-backed PostgreSQL test harness. Every API request uses the production handler/RPC.
 * No environment secret is read and fetchImpl cannot contact Supabase. */
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
import {openKeilahDb,serviceFactory,testEnv} from './fixtures/keilah-db.mjs';
import {createKeilahOnlineHandler} from '../server/keilah-online-http.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const dbPath=path.resolve(process.env.KEILAH_LOCAL_DB||'test-results/keilah-postgres-review');await fs.mkdir(path.dirname(dbPath),{recursive:true});
const db=await openKeilahDb(dbPath),factory=serviceFactory(db);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(!/^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)){res.writeHead(403);res.end();return;}
  if(url.pathname.startsWith('/api/keilah/')){
   if((req.headers.origin&&req.headers.origin!==url.origin)||(req.method==='POST'&&req.headers.origin!==url.origin)){res.writeHead(403);res.end();return;}
   let body; if(req.method==='POST'){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2048){res.writeHead(413);res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
   const headers=new Headers(req.headers);headers.set('x-vercel-forwarded-for',req.socket.remoteAddress?.replace('::ffff:','')||'127.0.0.1');if(headers.has('origin'))headers.set('origin',testEnv.CHALLENGE_ALLOWED_ORIGIN);
   const target=new Request(testEnv.CHALLENGE_ALLOWED_ORIGIN+url.pathname+url.search,{method:req.method,headers,body});
   // Deliberately create a fresh handler/service on every request: no in-memory rooms.
   let response=await createKeilahOnlineHandler({env:testEnv,serviceFactory:factory})(target);
   if(url.pathname==='/api/keilah/config'&&response.ok){const settings=await response.json();response=Response.json({...settings,localDatabase:true},{headers:response.headers});}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const name=decodeURIComponent(url.pathname);
  if(name.startsWith('/api/')||name.split('/').some(x=>x.startsWith('.'))||/^\/(server|scripts|tests|docs|supabase|test-results)\//.test(name)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:body);
 }catch(e){console.error('Local harness request failed:',e.message);if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'service_unavailable'}));}
});
const port=Number(process.env.PORT||44937),host=process.env.HOST||'127.0.0.1';server.listen(port,host,()=>console.log(`Keilah PostgreSQL preview http://${host}:${port}/keilah.html (local file DB; no remote writes)`));
let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;server.close();server.closeAllConnections();await db.close();});
