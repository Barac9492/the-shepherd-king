// Follow the public menu path; never expose hidden buttons or bypass game entry guards.
export async function openTitleSection(page,section){
 await page.waitForFunction(()=>window.GAME?.mode==='title'&&!GAME.slingChallenge.navigationPending&&!document.getElementById('title').hidden);
 if(await page.locator(`#menu${section[0].toUpperCase()+section.slice(1)}`).isVisible())return;
 if(await page.locator('#menuBack').isVisible())await page.click('#menuBack');
 await page.click(`[data-menu-open="${section}"]`);
}
export async function openSlingRanking(page,touch=false){
 if(await page.evaluate(()=>GAME.slingChallenge.phase==='closed')){await openTitleSection(page,'challenge');await page.click('#bChallenge');}
 await page.waitForFunction(()=>GAME.slingChallenge.phase==='lobby');
 await page.locator('#bChallengeRanking')[touch?'tap':'click']();
 await page.waitForFunction(()=>GAME.slingChallenge.phase==='ranking');
}
