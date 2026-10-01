import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPixelRatio,installRenderBudget} from '../src/render-budget.js';
import {MOBILE_POLISH_LIMITS,isMobilePolishViewport,mobilePixelRatio,installMobilePolish} from '../src/mobile-polish.js';

const CSS=readFileSync(new URL('../src/mobile-polish.css',import.meta.url),'utf8');

function saveGlobals(){
  return Object.fromEntries(['innerWidth','innerHeight','devicePixelRatio'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
}
function restoreGlobals(saved){
  for(const [key,descriptor] of Object.entries(saved)){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}
function viewport(width,height,ratio){
  globalThis.innerWidth=width;globalThis.innerHeight=height;globalThis.devicePixelRatio=ratio;
}

test('mobile viewport selector covers narrow portrait and bounded short landscape only',()=>{
  assert.equal(isMobilePolishViewport(320,568),true);
  assert.equal(isMobilePolishViewport(390,844),true);
  assert.equal(isMobilePolishViewport(600,1200),true);
  assert.equal(isMobilePolishViewport(601,844),false);
  assert.equal(isMobilePolishViewport(844,390),true);
  assert.equal(isMobilePolishViewport(950,500),true);
  assert.equal(isMobilePolishViewport(951,390),false);
  assert.equal(isMobilePolishViewport(844,501),false);
  for(const value of [NaN,Infinity,-1,0])assert.equal(isMobilePolishViewport(value,390),false);
 });

test('desktop and non-target layouts retain the existing render budget exactly',()=>{
  for(const sample of [[1440,900,2,false,false],[390,844,3,false,false],[1024,768,2,true,false],[3840,2160,2,false,true]]){
    assert.equal(mobilePixelRatio(...sample),renderPixelRatio(...sample));
  }
});

test('matching touch layouts cap DPR and backing-store area without upscaling DPR 1',()=>{
  for(const [width,height] of [[320,568],[390,844],[844,390],[950,500]]){
    const ratio=mobilePixelRatio(width,height,3,true,false);
    assert.ok(ratio>0&&ratio<=MOBILE_POLISH_LIMITS.pixelRatio);
    assert.ok(width*height*ratio*ratio<=MOBILE_POLISH_LIMITS.pixelArea+1);
    assert.equal(mobilePixelRatio(width,height,1,true,false),1);
    assert.ok(mobilePixelRatio(width,height,3,true,true)<=1);
  }
  assert.equal(mobilePixelRatio(600,2400,1,true,false),1,'native DPR 1 stays unchanged even above the high-DPR area budget');
});

test('pixel selector is finite and positive for invalid numeric inputs',()=>{
  for(const args of [[NaN,844,3,true,false],[390,Infinity,3,true,false],[390,844,NaN,true,false],[0,-2,0,true,true]]){
    const ratio=mobilePixelRatio(...args);
    assert.ok(Number.isFinite(ratio));
    assert.ok(ratio>0);
  }
});

test('installed wrapper runs after render budget and forwards context, args, compatibility, and orientation',()=>{
  const saved=saveGlobals();
  try{
    const nativeCalls=[];
    class FakeGame{
      resize(...args){nativeCalls.push({self:this,args});return this.returnValue;}
    }
    installRenderBudget({Game:FakeGame,IS_TOUCH:true});
    const installed=installMobilePolish({Game:FakeGame,IS_TOUCH:true});
    assert.equal(installMobilePolish({Game:FakeGame,IS_TOUCH:true}),installed,'installation is idempotent');
    const game=new FakeGame();game.returnValue={ok:true};let ratio=2;const writes=[];
    game.renderer={getPixelRatio:()=>ratio,setPixelRatio:value=>{writes.push(value);ratio=value;}};
    for(const compatibility of [false,true]){
      game.renderCompatibility=compatibility;
      for(const [width,height] of [[390,844],[844,390]]){
        viewport(width,height,3);writes.length=0;
        assert.equal(game.resize('orientation',width,height),game.returnValue);
        assert.equal(nativeCalls.at(-1).self,game);
        assert.deepEqual(nativeCalls.at(-1).args,['orientation',width,height]);
        assert.equal(ratio,mobilePixelRatio(width,height,3,true,compatibility));
        if(writes.length)assert.equal(writes.at(-1),ratio);
        assert.equal(game.graphicsQuality,compatibility?'compatibility':'native-budget');
      }
    }
  }finally{restoreGlobals(saved);}
});

test('installed wrapper leaves desktop and non-target touch renderer decisions untouched',()=>{
  const saved=saveGlobals();
  try{
    for(const [touch,width,height] of [[false,390,844],[true,1024,768]]){
      class FakeGame{resize(){return 'native';}}
      installRenderBudget({Game:FakeGame,IS_TOUCH:touch});
      installMobilePolish({Game:FakeGame,IS_TOUCH:touch});
      let ratio=2;const writes=[];const game=new FakeGame();
      game.renderer={getPixelRatio:()=>ratio,setPixelRatio:value=>{writes.push(value);ratio=value;}};
      viewport(width,height,3);
      assert.equal(game.resize(),'native');
      assert.equal(ratio,renderPixelRatio(width,height,3,touch,false));
      assert.equal(writes.length,1,'mobile polish adds no second renderer resize outside its target');
    }
  }finally{restoreGlobals(saved);}
});

test('stylesheet scopes mobile geometry, scrolling, safe areas, and Psalm formatting without hiding controls',()=>{
  assert.match(CSS,/@media \(max-width:600px\)/);
  assert.match(CSS,/@media \(max-height:500px\) and \(max-width:950px\) and \(orientation:landscape\)/);
  assert.match(CSS,/#title,\s*#card,\s*#help,\s*#menu,\s*#chapterList\s*\{[^}]*touch-action:pan-y/s);
  assert.match(CSS,/#card\.psalm23\s*\{[^}]*align-items:flex-start;[^}]*overflow-y:auto;[^}]*safe-area-inset-top[^}]*safe-area-inset-bottom/s);
  assert.match(CSS,/#card\.psalm23 \.inner\s*\{[^}]*width:min\(40rem,100%\);[^}]*margin-block:0/s);
  assert.match(CSS,/\.psalm23 #cVerse\s*\{[^}]*white-space:pre-line/s);
  assert.match(CSS,/\.psalm23 #cCite\s*\{[^}]*white-space:pre-line;[^}]*letter-spacing:normal;[^}]*text-transform:none/s);
  assert.match(CSS,/#joy\s*\{[^}]*width:104px;[^}]*height:104px;/s);
  assert.match(CSS,/#tAct\s*\{[^}]*width:64px;[^}]*height:64px;/s);
  assert.match(CSS,/#tSling\s*\{[^}]*right:calc\(env\(safe-area-inset-right,0px\) \+ 88px\);[^}]*width:64px;/s);
  assert.match(CSS,/#card \.numeral\s*\{top:-2\.2rem;right:0;font-size:7rem;\}/);
  assert.match(CSS,/#compass\s*\{[^}]*left:50%;[^}]*right:auto;[^}]*transform:translateX\(-50%\)/s);
  assert.match(CSS,/#my-shepherd-call\s*\{[^}]*safe-area-inset-bottom/s);
  assert.match(CSS,/#card\s*\{[^}]*align-items:flex-start;[^}]*overflow-y:auto;/s);
  assert.doesNotMatch(CSS,/display\s*:\s*none/i);
  assert.doesNotMatch(CSS,/(?:^|[,\s])#c(?:anvas)?(?:[,\s:{]|$)[^{]*\{[^}]*touch-action\s*:/im);
});
