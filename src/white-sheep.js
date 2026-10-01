/** Presentation-only palette policy. Preserve the factory's rig, sizes and behavior. */
export function withWhiteSheep(factory){
 if(typeof factory!=='function')throw new TypeError('quadruped factory required');
 if(factory.__whiteSheep)return factory;
 function whiteSheep(kind,options,...rest){
  if(kind!=='sheep')return factory.apply(this,arguments);
  return factory.call(this,kind,{...(options||{}),black:false},...rest);
 }
 whiteSheep.__whiteSheep=true;
 whiteSheep.__original=factory;
 return whiteSheep;
}
