import test from 'node:test';import assert from 'node:assert/strict';import {renderPixelRatio,installRenderBudget} from '../src/render-budget.js';
test('Normal desktop and portrait mobile preserve existing native resolution',()=>{assert.equal(renderPixelRatio(1440,900,1),1);assert.equal(renderPixelRatio(390,844,3,true),1.5);});
test('Retina and 4K canvases stay within the fill-rate budget',()=>{for(const [w,h]of [[1440,900],[2560,1440],[3840,2160]]){const p=renderPixelRatio(w,h,2);assert.ok(p>0&&p<=1.75);assert.ok(w*h*p*p<=2600001);}});

test('Compatibility mode keeps reduced pixel ratio across resizes',()=>{for(const [w,h]of [[390,844],[844,390],[3840,2160]]){const p=renderPixelRatio(w,h,3,true,true);assert.ok(p>0&&p<=1);assert.ok(w*h*p*p<=2600001);}});

test('Installed resize wrapper retains context, arguments and compatibility across orientations',()=>{
 const saved=Object.fromEntries(['innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try {
  let calls=0;
  class FakeGame { resize(arg){calls++;assert.equal(arg,'resize');assert.ok(this.renderer);return this;} }
  installRenderBudget({Game:FakeGame,IS_TOUCH:true});
  const g=new FakeGame();let ratio=2;g.renderer={getPixelRatio:()=>ratio,setPixelRatio:v=>{ratio=v;}};
  for(const compatibility of [true,false]){g.renderCompatibility=compatibility;
   for(const [w,h]of [[390,844],[844,390],[3840,2160]]){globalThis.innerWidth=w;globalThis.innerHeight=h;globalThis.devicePixelRatio=3;assert.equal(g.resize('resize'),g);assert.equal(ratio,renderPixelRatio(w,h,3,true,compatibility));if(compatibility)assert.equal(g.graphicsQuality,'compatibility');}
  }assert.equal(calls,6);
 }finally{for(const [key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
