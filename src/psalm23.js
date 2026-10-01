// Exact verse text, apart from presentation-only paragraph line breaks.
// Korean: Korean Bible Society, 1961 KRV. Attribution and provenance below.
// English: World English Bible Updated (public domain), eBible.org.
export const PSALM23=Object.freeze({
 ko:Object.freeze([
 '여호와는 나의 목자시니 내가 부족함이 없으리로다',
 '그가 나를 푸른 초장에 누이시며 쉴만한 물 가으로 인도하시는도다',
 '내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다',
 '내가 사망의 음침한 골짜기로 다닐찌라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다',
 '주께서 내 원수의 목전에서 내게 상을 베푸시고 기름으로 내 머리에 바르셨으니 내 잔이 넘치나이다',
 '나의 평생에 선하심과 인자하심이 정녕 나를 따르리니 내가 여호와의 집에 영원히 거하리로다',
 ]),
 en:Object.freeze([
 'The LORD is my shepherd; I shall lack nothing.',
 'He makes me lie down in green pastures. He leads me beside still waters.',
 'He restores my soul. He guides me in the paths of righteousness for his name’s sake.',
 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.',
 'You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over.',
 'Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in the LORD’s house forever.',
 ]),
});
export const PSALM23_SOURCES=Object.freeze({
 ko:'https://www.bskorea.or.kr/bible/korbibReadpage.php?linkBible=BHANpsa023003',
 koRights:'https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1',
 en:'https://ebible.org/engwebu/PSA023.htm',
 enRights:'https://worldenglish.bible/',
});
export const PSALM23_END=Object.freeze({
 text:Object.freeze({ko:PSALM23.ko.map((v,i)=>`${i+1}  ${v}`).join('\n\n'),en:PSALM23.en.map((v,i)=>`${i+1}  ${v}`).join('\n\n')}),
 cite:Object.freeze({ko:'시편 23:1–6 · 개역한글 (1961)\n성경전서 개역한글의 저작권은 대한성서공회에 있습니다.',en:'Psalm 23:1–6 · World English Bible Updated (Public Domain)'}),
});
/** Keep the original card/progression implementation; correct only this exact end card. */
export function installPsalm23Ending({Game,chapter,getLanguage=()=> 'ko',document:doc=globalThis.document}){
 const prior=Game.prototype.card;
 if(prior?.__psalm23Chapter===chapter)return prior;
 chapter.endVerse=PSALM23_END;
 // Let the Word, rather than a list of questions, be the closing reflection.
 chapter.questions=null;
 let noteHome=null;
 function psalm23Card(ch,idx,kind){
  const card=doc?.getElementById('card'),note=doc?.getElementById('cNote');
  if(noteHome&&note){noteHome.parent.insertBefore(note,noteHome.next);noteHome=null;}
  card?.classList?.remove('psalm23');
  card?.removeAttribute?.('tabindex');
  const result=prior.call(this,ch,idx,kind);
  if(ch===chapter&&kind==='end'){
   card?.classList?.add('psalm23');
   const lang=getLanguage()==='en'?'en':'ko';
   const cite=doc?.getElementById('cCite'),ref=doc?.getElementById('cRef');
   if(cite)cite.textContent=PSALM23_END.cite[lang];
   if(ref)ref.textContent=lang==='ko'?'시편 23편':'Psalm 23';
   // The base card focuses its bottom button after 60ms. For this long reading
   // only, redirect that first automatic focus to the scroll container. Restore
   // the button method immediately, so later keyboard navigation scrolls normally.
   const first=doc?.getElementById('cRow')?.querySelector?.('button');
   if(first&&typeof first.focus==='function'){
    const normalFocus=first.focus;
    first.focus=function(options){
     this.focus=normalFocus;
     if(!this.isConnected||card?.hidden||!card?.classList?.contains('psalm23'))return;
     card.setAttribute?.('tabindex','-1');card.focus?.({preventScroll:true});card.scrollTop=0;
    };
   }
   // Reveal first, then the complete Psalm. DOM order also serves screen readers.
   const quote=doc?.getElementById('cVerse')?.closest?.('blockquote');
   if(note&&quote&&note.parentNode===quote.parentNode){noteHome={parent:note.parentNode,next:note.nextSibling};note.parentNode.insertBefore(note,quote);}
   if(card)card.scrollTop=0;
  }
  return result;
 }
 psalm23Card.__psalm23Chapter=chapter;psalm23Card.__original=prior;
 Game.prototype.card=psalm23Card;
 return psalm23Card;
}
