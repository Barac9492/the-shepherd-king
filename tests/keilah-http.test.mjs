import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {randomUUID} from 'node:crypto';import {createKeilahHttp} from '../server/keilah-http.mjs';
test('HTTP origin, body limits, exact schema, room auth, score submission rejection and isolated ranking',async()=>{
 const api=createKeilahHttp();const server=http.createServer((req,res)=>api.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+'/api/keilah'+path,{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/rooms',{requestId:randomUUID()},{origin:'https://evil.test'})).status,403);
  assert.equal((await post('/rooms',{requestId:randomUUID(),score:1})).status,400);
  assert.equal((await post('/rooms',{requestId:'x'.repeat(3000)})).status,413);
  const a=await (await post('/rooms',{requestId:randomUUID()})).json();const code=a.state.code;
  assert.equal((await fetch(base+'/api/keilah/rooms/'+code)).status,403);
  assert.equal((await fetch(base+'/api/keilah/rooms/'+code,{headers:{authorization:'Bearer '+a.token}})).status,200);
  assert.equal((await post('/rooms/'+code+'/command',{seq:1,run:1,action:'ready',timeMs:1},{authorization:'Bearer '+a.token})).status,400);
  assert.equal((await post('/submit',{timeMs:1})).status,404);
  assert.equal((await fetch(base+'/api/sling-challenge/record')).status,404);
  const rank=await (await fetch(base+'/api/keilah/ranking')).json();assert.deepEqual(rank.entries,[]);assert.equal(rank.scope,'local-server');
 }finally{api.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
