import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withWhiteSheep} from '../src/white-sheep.js';
import {PSALM23,PSALM23_END,PSALM23_SOURCES,installPsalm23Ending} from '../src/psalm23.js';

test('white policy covers explicit black, inferred defaults and carried lamb scales without mutating caller or other animals',()=>{
 const calls=[],ctx={},result={};function factory(...args){calls.push({context:this,args});return result;}
 const wrapped=withWhiteSheep(factory),options=Object.freeze({black:true,scale:.64,grazeAngle:.9});
 assert.equal(withWhiteSheep(wrapped),wrapped);assert.equal(wrapped.call(ctx,'sheep',options,'extra'),result);
 assert.deepEqual(calls[0],{context:ctx,args:['sheep',{black:false,scale:.64,grazeAngle:.9},'extra']});assert.equal(options.black,true);
 wrapped('sheep');assert.deepEqual(calls[1].args,['sheep',{black:false}]);
 wrapped.call(ctx,'lion',options,'extra');assert.equal(calls[2].args[1],options);assert.deepEqual(calls[2].args,['lion',options,'extra']);
});

test('Psalm23 contains six complete sourced verses per language, original KRV wording and visible attribution',()=>{
 assert.equal(PSALM23.ko.length,6);assert.equal(PSALM23.en.length,6);
 assert.equal(PSALM23.ko[0],'여호와는 나의 목자시니 내가 부족함이 없으리로다');
 assert.match(PSALM23.ko[1],/쉴만한 물 가으로/);assert.match(PSALM23.ko[3],/다닐찌라도/);
 assert.equal(PSALM23.ko[5],'나의 평생에 선하심과 인자하심이 정녕 나를 따르리니 내가 여호와의 집에 영원히 거하리로다');
 assert.equal(PSALM23.en[5],'Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in the LORD’s house forever.');
 for(const lang of ['ko','en'])assert.equal(PSALM23_END.text[lang].split('\n\n').length,6);
 assert.match(PSALM23_END.cite.ko,/대한성서공회/);assert.match(PSALM23_END.cite.ko,/개역한글/);
 assert.match(PSALM23_SOURCES.ko,/bskorea\.or\.kr/);assert.match(PSALM23_SOURCES.en,/PSA023.htm/);
});

function dom(){
 const nodes={};const parent={children:[],insertBefore(node,next){const at=this.children.indexOf(node);if(at>=0)this.children.splice(at,1);const pos=next?this.children.indexOf(next):-1;if(pos<0)this.children.push(node);else this.children.splice(pos,0,node);node.parentNode=this;}};
 for(const id of ['card','cRef','cVerse','cCite','cQuote','cNote','cQs','cRow']){const classes=new Set();nodes[id]={id,textContent:'',classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}};}
 for(const id of ['cQuote','cNote','cQs'])parent.insertBefore(nodes[id],null);
 for(const node of Object.values(nodes))Object.defineProperty(node,'nextSibling',{get(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}});
 nodes.cVerse.closest=()=>nodes.cQuote;
 nodes.card.attributes={};nodes.card.setAttribute=(k,v)=>nodes.card.attributes[k]=v;nodes.card.removeAttribute=k=>delete nodes.card.attributes[k];nodes.card.focus=options=>{nodes.card.focusOptions=options;};
 nodes.cRow.button={isConnected:true,focus(){this.normalFocusCalls=(this.normalFocusCalls||0)+1;}};nodes.cRow.querySelector=()=>nodes.cRow.button;
 return{nodes,parent,doc:{getElementById:id=>nodes[id]||null}};
}

test('only finale end card gets exact quotation label and reveal-before-Psalm order; original promise and next-card order preserved',()=>{
 const {nodes,parent,doc}=dom(),chapter={questions:['old']},other={},promise=Promise.resolve('next');let language='ko',calls=0;
 class Game{card(ch,idx,kind){calls++;nodes.cCite.textContent='original 풀이';return promise;}}
 const original=Game.prototype.card;const wrapper=installPsalm23Ending({Game,chapter,getLanguage:()=>language,document:doc});
 assert.equal(installPsalm23Ending({Game,chapter,document:doc}),wrapper);assert.equal(chapter.endVerse,PSALM23_END);assert.equal(chapter.questions,null);
 const g=new Game();assert.equal(g.card(chapter,10,'end'),promise);assert.equal(nodes.cRef.textContent,'시편 23편');assert.equal(nodes.cCite.textContent,PSALM23_END.cite.ko);assert.equal(nodes.card.classList.contains('psalm23'),true);
 assert.deepEqual(parent.children.map(n=>n.id),['cNote','cQuote','cQs']);
 const first=nodes.cRow.button;nodes.card.scrollTop=147;first.focus();assert.equal(nodes.card.scrollTop,0);assert.deepEqual(nodes.card.focusOptions,{preventScroll:true});assert.equal(nodes.card.attributes.tabindex,'-1');assert.equal(first.normalFocusCalls,undefined);first.focus();assert.equal(first.normalFocusCalls,1);
 g.card(other,0,'end');assert.equal(nodes.cCite.textContent,'original 풀이');assert.equal(nodes.card.classList.contains('psalm23'),false);assert.deepEqual(parent.children.map(n=>n.id),['cQuote','cNote','cQs']);
 language='en';g.card(chapter,10,'end');assert.equal(nodes.cCite.textContent,PSALM23_END.cite.en);g.card(chapter,10,'intro');assert.equal(nodes.cCite.textContent,'original 풀이');assert.equal(nodes.card.classList.contains('psalm23'),false);
 assert.equal(calls,4);assert.equal(wrapper.__original,original);
});

test('white palette and mobile adapters install before any Game build, outside storybook-only branch',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const white=html.indexOf('makeQuadruped = withWhiteSheep(makeQuadruped)'),mobile=html.indexOf('installMobilePolish({ Game, IS_TOUCH })'),game=html.indexOf('game = new Game(); window.GAME = game;');
 assert.ok(white>html.indexOf('installRenderBudget({ Game, IS_TOUCH })'));assert.ok(mobile>white&&mobile<game);assert.ok(white<game);
 assert.match(html,/installPsalm23Ending\(\{ Game, chapter: myShepherdChapter/);
 assert.match(html,/getTouch: \(\) => IS_TOUCH/);
});
