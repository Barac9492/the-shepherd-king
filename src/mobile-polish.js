import {renderPixelRatio} from './render-budget.js';

export const MOBILE_POLISH_LIMITS=Object.freeze({
  narrowWidth:600,
  landscapeWidth:950,
  landscapeHeight:500,
  pixelRatio:1.25,
  pixelArea:1400000,
});

const positiveFinite=(value,fallback=1)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;

/** Match the viewports covered by the mobile stylesheet without guessing device identity. */
export function isMobilePolishViewport(width,height){
  const w=Number(width),h=Number(height);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return false;
  return w<=MOBILE_POLISH_LIMITS.narrowWidth||(w<=MOBILE_POLISH_LIMITS.landscapeWidth&&h<=MOBILE_POLISH_LIMITS.landscapeHeight);
}

/**
 * Preserve the existing renderer budget outside touch-sized mobile layouts.
 * On matching touch layouts, preserve native DPR 1. For higher native DPR,
 * cap both DPR and backing-store pixels. This changes an analytic fill-rate
 * budget only; it makes no hardware performance or frame-rate claim.
 */
export function mobilePixelRatio(width,height,nativeRatio=1,touch=false,compatibility=false){
  const w=positiveFinite(width),h=positiveFinite(height),native=positiveFinite(nativeRatio);
  const existing=renderPixelRatio(w,h,native,Boolean(touch),Boolean(compatibility));
  if(!touch||!isMobilePolishViewport(w,h))return existing;
  if(native<=1)return existing;
  return Math.min(existing,MOBILE_POLISH_LIMITS.pixelRatio,Math.sqrt(MOBILE_POLISH_LIMITS.pixelArea/(w*h)));
}

/** Install after installRenderBudget and before constructing Game. */
export function installMobilePolish({Game,IS_TOUCH}={}){
  if(!Game?.prototype||typeof Game.prototype.resize!=='function')throw new TypeError('Game with a resize method is required');
  const prior=Game.prototype.resize;
  if(prior.__mobilePolishInstalled)return prior;
  function resizeWithMobilePolish(...args){
    const result=prior.apply(this,args);
    const renderer=this?.renderer;
    const width=positiveFinite(globalThis.innerWidth);
    const height=positiveFinite(globalThis.innerHeight);
    const native=positiveFinite(globalThis.devicePixelRatio);
    if(IS_TOUCH&&isMobilePolishViewport(width,height)&&renderer&&typeof renderer.getPixelRatio==='function'&&typeof renderer.setPixelRatio==='function'){
      const ratio=mobilePixelRatio(width,height,native,true,Boolean(this.renderCompatibility));
      const current=renderer.getPixelRatio();
      if(!Number.isFinite(current)||Math.abs(current-ratio)>.001)renderer.setPixelRatio(ratio);
    }
    return result;
  }
  Object.defineProperties(resizeWithMobilePolish,{
    __mobilePolishInstalled:{value:true},
    __mobilePolishOriginal:{value:prior},
  });
  Game.prototype.resize=resizeWithMobilePolish;
  return resizeWithMobilePolish;
}
