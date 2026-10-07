const COPY={story:['스토리','Story'],challenge:['챌린지','Challenges'],walk:['산책','Walk'],back:['← 처음으로','← Main menu'],garden:['평화의 동산','Garden of Peace'],note:['기록과 TOP 10은 지원하는 챌린지에서 확인할 수 있어요.','Records and TOP 10 are available in supported challenges.']};
const GROUP={story:'menuStory',challenge:'menuChallenge',walk:'menuWalk'};
const ENTRY={story:'bStoryMenu',challenge:'bChallengeMenu',walk:'bWalkMenu'};

/** Title navigation only: existing game controllers own every game and record request. */
export function installTitleMenu({Game,getLanguage}){
 const p=Game.prototype;if(p.__titleMenuInstalled)return;p.__titleMenuInstalled=true;
 const original={setupUI:p.setupUI,applyLang:p.applyLang,showTitle:p.showTitle};
 p.setupUI=function(...args){original.setupUI.apply(this,args);this.titleMenu=createMenu(this,getLanguage);};
 p.applyLang=function(...args){const r=original.applyLang.apply(this,args);this.titleMenu?.render();return r;};
 p.showTitle=async function(...args){await original.showTitle.apply(this,args);this.titleMenu?.restore();};
}
function createMenu(g,getLanguage){
 const $=id=>document.getElementById(id),title=$('title');
 const initial=new URLSearchParams(location.search).get('menu');
 const c={section:Object.hasOwn(GROUP,initial)?initial:'home',lastEntry:null,
  t:key=>COPY[key][getLanguage()==='en'?1:0],
  render(){
   title.dataset.menu=c.section;$('mainMenu').hidden=c.section!=='home';$('menuHeader').hidden=c.section==='home';
   for(const [key,id] of Object.entries(GROUP)){$(id).hidden=c.section!==key;$(ENTRY[key]).textContent=c.t(key);}
   $('menuHeading').textContent=c.section==='home'?'':c.t(c.section);$('menuBack').textContent=c.t('back');
   $('bKeilah').textContent=getLanguage()==='en'?'Keilah Co-op Rescue':'그일라 2인 구출전';
   $('bLandOfDavid').textContent=getLanguage()==='en'?'Land of David · Bible Map World':'다윗의 땅 · 성경 지도 월드';
   $('bBethlehem').textContent=getLanguage()==='en'?'Water from Bethlehem · Stealth':'베들레헴의 물 · 잠입';
   $('bGardenMenu').textContent=c.t('garden');$('challengeMenuNote').textContent=c.t('note');
   $('mainMenu').setAttribute('aria-label',getLanguage()==='en'?'Choose a game':'놀이 선택');
   $('bChapters').setAttribute('aria-expanded',String(!$('chapterList').hidden));
  },
  show(section,focus=true){
   if(g.mode!=='title'||g.slingChallenge?.navigationPending||title.hidden)return;
   const previous=c.section;c.section=Object.hasOwn(GROUP,section)?section:'home';$('chapterList').hidden=true;c.render();
   if(focus)(c.section==='home'?$(ENTRY[previous]||'bStoryMenu'):$('menuHeading')).focus();
  },
  restore(){c.render();const target=c.lastEntry&&$(c.lastEntry);if(target&&!target.closest('[hidden]'))target.focus();else if(c.section!=='home')$('menuHeading').focus();},
 };
 for(const button of document.querySelectorAll('[data-menu-open]'))button.onclick=()=>c.show(button.dataset.menuOpen);
 $('menuBack').onclick=()=>c.show('home');
 title.addEventListener('keydown',event=>{if(event.key==='Escape'&&c.section!=='home'){event.preventDefault();event.stopImmediatePropagation();c.show('home');}},{capture:true});
 title.addEventListener('click',event=>{const button=event.target.closest('.title-submenu button,.title-submenu a');if(button)c.lastEntry=button.id;});
 const chapters=$('bChapters').onclick;$('bChapters').onclick=()=>{chapters();c.render();};
 $('bGardenMenu').onclick=()=>{if(g.exploration.open())g.peaceGarden.showCard(true);};
 c.render();return c;
}
