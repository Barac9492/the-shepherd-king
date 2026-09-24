/** Keep the 3D canvas within a pixel budget; HTML text and controls stay native-res. */
export function renderPixelRatio(width,height,nativeRatio=1,touch=false){
 const area=Math.max(1,width)*Math.max(1,height);
 return Math.min(nativeRatio||1,touch?1.5:1.75,Math.sqrt(2600000/area));
}
export function installRenderBudget({Game,IS_TOUCH}){
 const resize=Game.prototype.resize;
 Game.prototype.resize=function(...args){
  const ratio=renderPixelRatio(innerWidth,innerHeight,devicePixelRatio||1,IS_TOUCH);
  if(Math.abs(this.renderer.getPixelRatio()-ratio)>.001)this.renderer.setPixelRatio(ratio);
  this.graphicsQuality=ratio<Math.min(devicePixelRatio||1,IS_TOUCH?1.5:1.75)-.01?'pixel-budget':'native-budget';
  return resize.apply(this,args);
 };
}
