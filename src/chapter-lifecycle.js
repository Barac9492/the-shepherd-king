/** Register disposable overlay/input resources against a chapter, not the whole page. */
export function installChapterLifecycle(Game) {
  const clear=Game.prototype.clearChapter;
  Game.prototype.onChapterCleanup=function(dispose){(this.chapterDisposers??=[]).push(dispose);};
  Game.prototype.clearChapter=function(...args){
    const disposers=this.chapterDisposers||[];this.chapterDisposers=[];
    for(const dispose of disposers)dispose();
    this._rhythm=null;this._dodge=null;
    return clear.apply(this,args);
  };
}
