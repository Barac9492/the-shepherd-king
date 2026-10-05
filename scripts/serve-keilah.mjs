/** Local prototype only. No Supabase credentials, remote records or deployment adapter. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createKeilahHttp} from '../server/keilah-http.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),api=createKeilahHttp();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const host=new URL('http://'+req.headers.host).hostname;
  if(!/^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)){res.writeHead(403);res.end();return;}
  if(await api.handle(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name.startsWith('/api/')||name.split('/').some(x=>x.startsWith('.'))||/^\/(server|scripts|tests|docs|supabase)\//.test(name)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||44936),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Keilah local prototype: http://${host}:${port}/keilah.html (rankings and rooms reset when server stops)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{api.close();server.close();server.closeAllConnections();});
