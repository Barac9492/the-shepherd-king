import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(process.env.HARP_SOURCE || new URL('../index.html',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function rhythmGame(g, o) {'),source.indexOf('function dodge(g,',source.indexOf('function rhythmGame(g, o) {')));
function harness(options={}) {
  const listeners=new Map(), timers=new Map(); let nextTimer=0, callback, cleanup;
  class El {
    constructor(){this.style={};this.children=[];this.textContent='';this.clientHeight=300;this.className='';this.hidden=false;this.classList={add:(c)=>{this.className+=' '+c;},remove:(...cs)=>{cs.forEach(c=>{this.className=this.className.replace(c,'');});},toggle:(c,on)=>{this.className=this.className.replace(c,'');if(on)this.className+=' '+c;},contains:(c)=>this.className.split(' ').includes(c)};this.attrs={};this.events=new Map();}
    appendChild(n){n.parent=this;this.children.push(n);return n;}
    append(...ns){ns.forEach(n=>this.appendChild(n));}
    remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
    addEventListener(k,f){this.events.set(k,f);}
    removeEventListener(k){this.events.delete(k);}
    setAttribute(k,v){this.attrs[k]=v;}
    querySelector(s){return this.queries?.[s] || (this.queries ||= {},this.queries[s] ||= new El());}
    querySelectorAll(s){return s==='.lane'?lanes:[];}
  }
  const lanes=[new El(),new El(),new El()], body=new El(), bar=new El(), label=new El();
  lanes.forEach(l=>l.queries={'b':new El()});
  const document={body,hidden:false,getElementById(){return null;},createElement(){const e=new El();e.queries={'.meter span':label,'.bar i':bar,'.meter .bar i':bar};return e;},addEventListener(k,f){listeners.set('doc:'+k,f);},removeEventListener(k){listeners.delete('doc:'+k);}};
  const audio={ctx:null,muted:true,master:null,pluck(){},setMood(){}};
  const g={tok:1,paused:false,audio,every(f){callback=f;},onChapterCleanup(f){const prev=cleanup;cleanup=()=>{prev?.();f();};}};
  const context={document,LANG:'ko',Number,IS_TOUCH:!!options.touch,tr:x=>typeof x==='string'?x:x.ko,Math:Object.assign(Object.create(Math),{random:()=>0.5}),setTimeout(f){const i=++nextTimer;timers.set(i,f);return i;},clearTimeout(i){timers.delete(i);},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),console};
  vm.createContext(context);vm.runInContext(code+'\nthis.startRhythm=rhythmGame;',context);
  let resolved=false;const promise=context.startRhythm(g,{start:25,goal:100,label:{ko:'마음',en:'Heart'},...options}).then(()=>resolved=true);
  return {g,el:body.children[0],body,lanes,bar,listeners,timers,step(dt){callback(dt);},press(i){listeners.get('keydown')?.({code:['KeyA','KeyS','KeyD'][i],repeat:false,preventDefault(){}});},tap(i){lanes[i].events.get('pointerdown')?.({preventDefault(){},stopPropagation(){}});},notes(){return lanes.flatMap((l,i)=>l.children.filter(n=>!n.removed).map(n=>({el:n,lane:i})));},cleanup(){cleanup();},promise,get resolved(){return resolved;}};
}
function center(n){ const s=n.el.style; if(s.transform){const m=s.transform.match(/translate(?:3d|Y)?\([^,]*,?\s*(-?[\d.]+)px/);if(m)return Number(m[1])+17;}return parseFloat(s.top)+17; }
test('notes follow scheduled beat instead of the late spawn frame',()=>{
 const h=harness();for(let i=0;i<27;i++)h.step(.07); // t=1.89, first spawn scheduled at .8
 const n=h.notes()[0];assert.ok(n);assert.ok(Math.abs(center(n)-(1.89-.8)/1.8*300)<.001,`note center=${center(n)}, expected=${(1.89-.8)/1.8*300}`);
});
test('notes animate with transform, not layout top writes',()=>{const h=harness();h.step(.8);h.step(.1);const n=h.notes()[0];assert.match(n.el.style.transform||'',/translate/);assert.equal(n.el.style.top,undefined);});
test('keyboard and pointer hits preserve +5 scoring once per note',()=>{
 for(const touch of [false,true]){const h=harness({touch});h.step(.8);h.step(1.8*.86);const n=h.notes()[0];touch?h.tap(n.lane):h.press(n.lane);h.step(0);assert.equal(parseFloat(h.bar.style.width),30);touch?h.tap(n.lane):h.press(n.lane);h.step(0);assert.ok(Math.abs(parseFloat(h.bar.style.width)-29)<1e-8);}
});
test('menu pause and stale chapter ignore presses',()=>{
 const h=harness();h.step(.8);h.step(1.8*.86);const n=h.notes()[0];h.g.paused=true;h.press(n.lane);h.step(0);assert.equal(parseFloat(h.bar.style.width),25);h.g.paused=false;h.g.tok++;h.press(n.lane);h.step(0);assert.ok(h.el.removed);
});
test('miss remains -4 and off-note press -1',()=>{const h=harness();h.step(.8);h.step(1.8*(.86+.131));h.step(0);assert.equal(parseFloat(h.bar.style.width),21);h.press(0);h.step(0);assert.equal(parseFloat(h.bar.style.width),20);});
test('spear pauses synchronously, restores overlay, and resumes with lead-in',async()=>{
 let release,called=0;const h=harness({events:[{at:30,fn:()=>{called++;return new Promise(r=>release=r);}}]});h.step(.8);h.step(1.8*.86);h.press(h.notes()[0].lane);h.step(0);const el=h.body.children[0];assert.equal(called,1);assert.equal(el.style.visibility,'hidden');assert.equal(h.notes().length,0);h.step(3);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(el.style.visibility,'visible');h.step(.1);assert.equal(h.notes().length,0);h.step(.9);assert.ok(h.notes().length>0);
});
test('cleanup makes late event result harmless and removes keyboard listener',async()=>{
 let release;const h=harness({events:[{at:25,fn:()=>new Promise(r=>release=r)}]});h.step(0);h.cleanup();release();await new Promise(resolve=>setImmediate(resolve));assert.ok(h.el.removed);assert.equal(h.listeners.has('keydown'),false);
});
test('hitAll still completes only after every configured event',async()=>{
 const calls=[];const h=harness({events:[{at:45,fn:()=>calls.push(1)},{at:78,fn:()=>calls.push(2)}]});h.g._rhythm.hitAll();for(let i=0;i<6;i++){h.step(0);await Promise.resolve();}await h.promise;assert.deepEqual(calls,[1,2]);assert.equal(h.resolved,true);assert.ok(h.el.removed);assert.equal(h.listeners.has('keydown'),false);
});

test('invalid gaps cannot create a non-terminating spawn loop',()=>{for(const gap of [0,-1,NaN,Infinity]){const h=harness({gap});h.step(.8);h.step(.6);assert.equal(h.notes().length,2);h.cleanup();}});
test('cleanup removes timers, pointer handlers, helper and further note spawning',()=>{const h=harness();h.step(.8);h.step(1.8*.86);h.press(h.notes()[0].lane);assert.ok(h.timers.size>0);h.cleanup();assert.equal(h.timers.size,0);assert.equal(h.g._rhythm,undefined);assert.ok(h.lanes.every(l=>!l.events.has('pointerdown')));h.step(5);assert.equal(h.notes().length,0);});
test('event failure rejects the minigame rather than skipping the spear event',async()=>{const failure=new Error('failed spear');const h=harness({events:[{at:25,fn:()=>Promise.reject(failure)}]});const check=assert.rejects(h.promise,/failed spear/);h.step(0);await check;assert.ok(h.el.removed);assert.equal(h.listeners.has('keydown'),false);});
test('hit feedback is immediate without another frame',()=>{const h=harness();h.step(.8);h.step(1.8*.86);h.tap(h.notes()[0].lane);assert.equal(h.el.querySelector('.feedback').textContent,'좋아요 +5');});
