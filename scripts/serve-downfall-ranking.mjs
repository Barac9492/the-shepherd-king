// Disposable loopback fixture: real SQL/RPC, no production credentials or outbound API calls.
import http from 'node:http';
import {Readable} from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createDownfallHandler} from '../server/downfall-ranking-http.mjs';
import {createDownfallService} from '../server/downfall-ranking-service.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),port=Number(process.env.PORT||44982),base=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const dataDir=process.env.DOWNFALL_FIXTURE_DB?path.resolve(root,process.env.DOWNFALL_FIXTURE_DB):undefined;
if(dataDir&&!dataDir.startsWith(path.join(root,'test-results')+path.sep))throw Error('Fixture DB must be under task-owned test-results');
if(dataDir)await fs.mkdir(dataDir,{recursive:true});
const db=new PGlite(dataDir);
await db.exec("DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS;END IF;END$$;");
const migration=await fs.readFile(path.join(root,'supabase/migrations/20261006213000_downfall_top10.sql'),'utf8');
const existing=(await db.query("SELECT 1 FROM pg_namespace WHERE nspname='downfall_challenge'")).rows.length>0;
if(existing){
 if(!dataDir||await fs.readFile(dataDir+'.migration.sql','utf8')!==migration)throw Error('Fixture schema changed; choose a new disposable test-results DB directory');
}else{await db.exec(migration);if(dataDir)await fs.writeFile(dataDir+'.migration.sql',migration);}
const env={VERCEL:'1',DOWNFALL_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:'https://fixture.example',CHALLENGE_SUPABASE_URL:'https://jdsjvrynmnzoztfinlzi.supabase.co',CHALLENGE_SUPABASE_SECRET_KEY:'sb_secret_'+ 'fixture_only_not_a_credential_12345'};
let sqlTail=Promise.resolve();
const serviceFactory=config=>createDownfallService({...config,fetchImpl:async(url,options)=>{
 if(url!==env.CHALLENGE_SUPABASE_URL+'/rest/v1/rpc/downfall_challenge_rpc'||options.redirect!=='error')throw Error('Fixture outbound transport forbidden');
 const p=JSON.parse(options.body);
 const operation=sqlTail.then(async()=>{await db.exec('SET ROLE service_role');try{return(await db.query('SELECT public.downfall_challenge_rpc($1,$2::jsonb,$3) AS result',[p.p_action,JSON.stringify(p.p_input),p.p_client_key])).rows[0].result;}finally{await db.exec('RESET ROLE');}});
 sqlTail=operation.catch(()=>{});return Response.json(await operation);
}});
const handlers=Object.fromEntries(['record','attempts','finish','submit','invalidate'].map(a=>[a,createDownfallHandler(a,{env,serviceFactory})]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png'};
const requests=[];
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  const u=new URL(req.url,base),match=u.pathname.match(/^\/api\/downfall-challenge\/(record|attempts|finish|submit|invalidate)$/);
  if(match){
   if(req.headers['sec-fetch-site']==='cross-site'||(req.method==='POST'&&req.headers.origin!==base)||(req.headers.origin&&req.headers.origin!==base)){res.writeHead(403);res.end();return;}
   requests.push({method:req.method,path:u.pathname});
   const headers=new Headers(req.headers);headers.set('x-vercel-forwarded-for','203.0.113.42');if(req.method==='POST')headers.set('origin',env.CHALLENGE_ALLOWED_ORIGIN);
   const request=new Request(env.CHALLENGE_ALLOWED_ORIGIN+u.pathname+u.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await handlers[match[1]](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(u.pathname==='/_test/mobile'&&req.method==='GET'){
   const size=u.searchParams.get('size');if(!['390x844','320x568','844x390','568x320'].includes(size)){res.writeHead(400);res.end();return;}
   const [w,h]=size.split('x');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(`<!doctype html><title>Disposable mobile-layout fixture</title><style>body{margin:0;background:#111}iframe{border:0;width:${w}px;height:${h}px;display:block}</style><iframe id="mobileFrame" title="멸망전 모바일 검증" src="/downfall.html?test=1"></iframe>`);return;
  }
  if(u.pathname==='/_test/requests'&&req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(requests));return;}
  if(u.pathname.startsWith('/api/')||req.method!=='GET'){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(root+path.sep)||/(^|\/)\.[^/]/.test(u.pathname)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
 }catch{if(!res.headersSent)res.writeHead(500);res.end('Fixture request failed');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Downfall SQL fixture ${base}/downfall.html (test data only)`));
let closing=false;async function close(){if(closing)return;closing=true;server.close();await sqlTail;await db.close();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
