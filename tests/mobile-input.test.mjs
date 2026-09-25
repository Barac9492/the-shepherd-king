import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inputSource=html.slice(html.indexOf('class Input {'),html.indexOf('\nclass Actor {'));
const aimSource=html.slice(html.indexOf('  updateAim(dt) {'),html.indexOf('  throwStone() {')).trim();
class Surface {
 constructor(){this.handlers=new Map();this.style={};this.firstChild={style:{}};this.captures=new Set();this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>{if(on??!this.classes.has(x))this.classes.add(x);else this.classes.delete(x);}};}
 addEventListener(type,fn){const a=this.handlers.get(type)||[];a.push(fn);this.handlers.set(type,a);}
 removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(f=>f!==fn));}
 emit(type,props={}){const e={type,target:this,preventDefault(){},stopPropagation(){},...props};for(const fn of [...this.handlers.get(type)||[]])fn(e);}
 setPointerCapture(id){this.captures.add(id);}
 hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){if(this.captures.delete(id))this.emit('lostpointercapture',{pointerId:id,pointerType:'touch'});}
 getBoundingClientRect(){return{left:0,top:0,width:124,height:124};}
 focus(){}
}
function fixture(){
 const ids=new Map();const $=id=>{if(!ids.has(id))ids.set(id,new Surface());return ids.get(id);};
 const win=new Surface(),doc=new Surface(),orientation=new Surface();doc.hidden=false;doc.visibilityState='visible';doc.getElementById=$;
 const game={canvas:$('c'),audio:{init(){},sfx(){}},dialogOpen:()=>false,slingReady:()=>true,sling:true,aiming:false,aimCharge:0,stones:5,lock:false,bow:false,pouch:{visible:false},cord:{visible:false},throws:0,throwStone(){this.throws++;this.stones--;},toast(){}};
 const context=vm.createContext({window:win,document:doc,screen:{orientation},addEventListener:win.addEventListener.bind(win),$,STR:{},tr:x=>x,console});
 vm.runInContext(inputSource+'\nglobalThis.TestInput=Input;globalThis.actualUpdateAim=function '+aimSource+';',context);
 const input=new context.TestInput(game);game.input=input;const updateAim=()=>context.actualUpdateAim.call(game,.016);
 const pointer=(id=1,x=112,y=62)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0});
 const arm=(id=2)=>{$('tSling').emit('pointerdown',pointer(id));game.aiming=true;game.aimCharge=.8;};
 return{input,game,win,doc,orientation,$,pointer,arm,updateAim};
}
test('Blur neutralizes joystick and pending look/action; no charged sling is released',()=>{
 const f=fixture();f.$('joy').emit('pointerdown',f.pointer());f.$('c').emit('pointerdown',f.pointer(3,10,10));f.$('c').emit('pointermove',f.pointer(3,30,20));f.input.act=true;f.arm();assert.ok(f.input.moveVec().m>0);
 f.win.emit('blur');assert.equal(f.input.moveVec().m,0);assert.equal(f.input.lookX,0);assert.equal(f.input.lookY,0);assert.equal(f.input.act,false);assert.equal(f.input.lookId,null);f.updateAim();assert.equal(f.game.throws,0);assert.equal(f.game.stones,5);
});
test('Sling pointer cancellation does not throw a charged stone',()=>{const f=fixture();f.arm();f.$('tSling').emit('pointercancel',f.pointer(2));f.updateAim();assert.equal(f.game.throws,0);assert.equal(f.$('tSling').classList.contains('on'),false);});
test('Normal sling release and following lost capture still throw exactly once',()=>{const f=fixture();f.arm();f.$('tSling').emit('pointerup',f.pointer(2));f.$('tSling').emit('lostpointercapture',f.pointer(2));f.updateAim();f.updateAim();assert.equal(f.game.throws,1);});
test('Lost capture neutralizes joystick and cancels a held sling',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer());f.arm();f.$('joy').emit('lostpointercapture',f.pointer());assert.equal(f.input.moveVec().m,0);f.$('tSling').emit('lostpointercapture',f.pointer(2));f.updateAim();assert.equal(f.game.throws,0);});
test('A second pointer cannot steal an active joystick',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));const original=f.input.joy.x;f.$('joy').emit('pointerdown',f.pointer(4,12,62));assert.equal(f.input.joy.x,original);f.$('joy').emit('pointerup',f.pointer(4));assert.equal(f.input.joy.x,original);f.$('joy').emit('pointerup',f.pointer(1));assert.equal(f.input.moveVec().m,0);});
test('A second pointer cannot steal an active sling',()=>{const f=fixture();f.arm(2);f.$('tSling').emit('pointerdown',f.pointer(4));f.$('tSling').emit('pointerup',f.pointer(4));assert.equal(f.input.aim,true);f.$('tSling').emit('pointerup',f.pointer(2));f.updateAim();assert.equal(f.game.throws,1);});
test('Unrelated cancellation does not interrupt a held sling',()=>{const f=fixture();f.arm(2);f.$('tSling').emit('pointercancel',f.pointer(9));assert.equal(f.input.aim,true);assert.equal(f.game.aiming,true);});
for(const event of ['hidden','pagehide','orientationchange','screen-orientation'])test(event+' clears held controls and permits a fresh gesture',()=>{
 const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));f.arm(2);
 if(event==='hidden'){f.doc.hidden=true;f.doc.visibilityState='hidden';f.doc.emit('visibilitychange');}else if(event==='screen-orientation')f.orientation.emit('change');else f.win.emit(event);
 assert.equal(f.input.moveVec().m,0);f.updateAim();assert.equal(f.game.throws,0);f.doc.hidden=false;f.doc.visibilityState='visible';f.$('joy').emit('pointerdown',f.pointer(5));assert.ok(f.input.moveVec().m>0);f.$('joy').emit('pointerup',f.pointer(5));assert.equal(f.input.moveVec().m,0);
});
test('Independent joystick movement remains active during intentional sling release',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));f.arm(2);f.$('tSling').emit('pointerup',f.pointer(2));f.updateAim();assert.equal(f.game.throws,1);assert.ok(f.input.moveVec().m>0);});

test('Global reset releases captures safely even when lostcapture fires synchronously',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));f.arm(2);f.$('c').emit('pointerdown',f.pointer(3));f.$('cross').classList.add('on','target','weak');f.win.emit('blur');for(const id of ['joy','tSling','c'])assert.equal(f.$(id).captures.size,0);for(const c of ['on','target','weak'])assert.equal(f.$('cross').classList.contains(c),false);f.updateAim();assert.equal(f.game.throws,0);f.arm(5);f.$('tSling').emit('pointerup',f.pointer(5));f.updateAim();assert.equal(f.game.throws,1);});
test('Keyboard F release still fires; blur cancels and a fresh F gesture works',()=>{const f=fixture();const key={code:'KeyF',repeat:false};f.win.emit('keydown',key);f.game.aiming=true;f.game.aimCharge=.8;f.win.emit('keydown',{code:'KeyW',repeat:false});f.win.emit('keydown',{code:'ShiftLeft',repeat:false});f.win.emit('blur');f.updateAim();assert.equal(f.game.throws,0);assert.equal(f.input.keys.size,0);f.win.emit('keydown',key);f.game.aiming=true;f.game.aimCharge=.8;f.win.emit('keyup',key);f.updateAim();assert.equal(f.game.throws,1);});
test('Normal mouse release fires once and an unrelated pointer cannot release it',()=>{const f=fixture();const mouse={...f.pointer(7),pointerType:'mouse'};f.$('c').emit('pointerdown',mouse);f.game.aiming=true;f.game.aimCharge=.8;f.$('c').emit('pointerup',{...mouse,pointerId:9});assert.equal(f.input.aim,true);f.$('c').emit('pointerup',mouse);f.$('c').emit('lostpointercapture',mouse);f.updateAim();assert.equal(f.game.throws,1);});
test('Owned mouse cancellation suppresses the shot and accepts a new drag',()=>{const f=fixture();const mouse={...f.pointer(7),pointerType:'mouse'};f.$('c').emit('pointerdown',mouse);f.game.aiming=true;f.game.aimCharge=.8;f.$('c').emit('pointercancel',mouse);f.updateAim();assert.equal(f.game.throws,0);f.$('c').emit('pointerdown',{...mouse,pointerId:8});assert.equal(f.input.aim,true);});

test('Joystick cancellation leaves the independent sling held',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));f.arm(2);f.$('joy').emit('lostpointercapture',f.pointer(1));assert.equal(f.input.moveVec().m,0);assert.equal(f.input.aim,true);assert.equal(f.game.aiming,true);f.$('tSling').emit('pointerup',f.pointer(2));f.updateAim();assert.equal(f.game.throws,1);});
test('Sling cancellation leaves the independent joystick held',()=>{const f=fixture();f.$('joy').emit('pointerdown',f.pointer(1));f.arm(2);f.$('tSling').emit('pointercancel',f.pointer(2));f.updateAim();assert.equal(f.game.throws,0);assert.ok(f.input.moveVec().m>0);});
test('Canvas touch-look retains its owner and recovers after capture loss',()=>{const f=fixture();f.$('c').emit('pointerdown',f.pointer(3,10,10));f.$('c').emit('pointerdown',f.pointer(4,80,80));assert.equal(f.input.lookId,3);f.$('c').emit('pointermove',f.pointer(4,90,90));assert.equal(f.input.lookX,0);f.$('c').emit('lostpointercapture',f.pointer(3));assert.equal(f.input.lookId,null);f.$('c').emit('pointerdown',f.pointer(5,10,10));f.$('c').emit('pointermove',f.pointer(5,20,10));assert.ok(f.input.lookX>0);f.$('c').emit('pointercancel',f.pointer(5));assert.equal(f.input.lookId,null);});
test('Unexpected mouse capture loss cancels and a fresh mouse release works',()=>{const f=fixture();const mouse={...f.pointer(7),pointerType:'mouse'};f.$('c').emit('pointerdown',mouse);f.game.aiming=true;f.game.aimCharge=.8;f.$('c').emit('lostpointercapture',mouse);assert.equal(f.input.aim,false,'capture loss must cancel held aim');assert.equal(f.game.aiming,false,'capture loss must abort charged aim');f.updateAim();assert.equal(f.game.throws,0);f.$('c').emit('pointerdown',{...mouse,pointerId:8});f.game.aiming=true;f.game.aimCharge=.8;f.$('c').emit('pointerup',{...mouse,pointerId:8});f.updateAim();assert.equal(f.game.throws,1);});
test('Cancellation clears all aim visuals, then a fresh sling releases once',()=>{const f=fixture();f.arm(2);f.$('cross').classList.add('on','target','weak');f.$('charge').style.display='block';f.$('c').classList.add('aiming');f.game.pouch.visible=f.game.cord.visible=true;f.$('tSling').emit('pointercancel',f.pointer(2));for(const cls of ['on','target','weak'])assert.equal(f.$('cross').classList.contains(cls),false);assert.equal(f.$('tSling').classList.contains('on'),false);assert.equal(f.$('charge').style.display,'none');assert.equal(f.$('c').classList.contains('aiming'),false);assert.equal(f.game.pouch.visible,false);assert.equal(f.game.cord.visible,false);f.arm(5);f.$('tSling').emit('pointerup',f.pointer(5));f.updateAim();assert.equal(f.game.throws,1);});
test('Running is a selected toggle, not held input: blur and hidden preserve it',()=>{const f=fixture();f.$('tRun').emit('pointerdown',f.pointer(8));assert.equal(f.input.touchRun,true);f.win.emit('blur');f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.input.touchRun,true);assert.equal(f.$('tRun').classList.contains('on'),true);assert.equal(f.input.moveVec().m,0);});
