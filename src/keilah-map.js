/** Fixed public course. All movement and rescue decisions are made on the server. */
export const MAP_VERSION='keilah-1';
export const NODES=[
 {id:'exit',x:300,y:570,name:'남문 · 탈출'},
 {id:'square',x:300,y:460,name:'성 안 광장'},
 {id:'west',x:150,y:365,name:'서쪽 손잡이',holds:'east'},
 {id:'east',x:450,y:365,name:'동쪽 손잡이',holds:'west'},
 {id:'wgate',x:65,y:265,name:'서쪽 통로'},
 {id:'egate',x:535,y:265,name:'동쪽 통로'},
 {id:'w1',x:90,y:155,name:'곡식 마당',family:'곡식 마당 가족'},
 {id:'w2',x:205,y:65,name:'서쪽 지붕',family:'서쪽 지붕 가족'},
 {id:'e1',x:510,y:155,name:'우물가',family:'우물가 가족'},
 {id:'e2',x:395,y:65,name:'동쪽 지붕',family:'동쪽 지붕 가족'},
];
export const EDGES=[
 ['exit','square',8000],['square','west',6000],['square','east',6000],['west','east',8000],
 ['west','wgate',10000,'west'],['east','egate',10000,'east'],
 ['wgate','w1',8000],['w1','w2',8000],['wgate','w2',15000,null,true],
 ['egate','e1',8000],['e1','e2',8000],['egate','e2',15000,null,true],
];
export const RESCUE_MS=14000;
export const node=id=>NODES.find(n=>n.id===id);
export const edge=(a,b)=>EDGES.find(e=>(e[0]===a&&e[1]===b)||(e[1]===a&&e[0]===b));
export const neighbors=id=>EDGES.filter(e=>e[0]===id||e[1]===id).map(e=>e[0]===id?e[1]:e[0]);
