/** Focal hierarchy for palace scenes, while preserving aim and original collision bounds. */
export function installSceneDirection({THREE,Game,chapters}) {
  const palaces=new Set([chapters.harp,chapters.jonathan,chapters.mephibosheth,chapters.nathan]);
  const load=Game.prototype.loadWorld,clear=Game.prototype.clearChapter,apply=Game.prototype.applyEnv,cine=Game.prototype.cineTo;
  Game.prototype.clearChapter=function(...args){
    const s=this.sceneDirection;if(s){for(const r of s.replacements){r.object.material=r.original;r.material.dispose();}s.group.removeFromParent();this.sceneDirection=null;}
    return clear.apply(this,args);
  };
  Game.prototype.loadWorld=function(...args){
    const result=load.apply(this,args),P=this.ch?.s?.P;if(!palaces.has(this.ch)||!P?.root)return result;
    const replacements=[],group=new THREE.Group();group.name='palace-focal-light';P.root.add(group);
    const box=new THREE.Vector3();
    for(const object of P.root.children){
      if(!object.isMesh||!object.geometry||!object.material?.isMeshStandardMaterial)continue;
      object.geometry.computeBoundingBox();object.geometry.boundingBox.getSize(box);
      // Keep original vertex materials; separate large architecture by value, not bloom.
      const floor=box.x>16&&box.z>25&&box.y<.35,wall=box.x>18&&box.z>28&&box.y>5;
      const table=box.x>3&&box.x<4&&box.y<1.2&&box.z>8,throneStep=box.x===5&&box.y<1.2;
      if(!floor&&!wall&&!table&&!throneStep)continue;
      const material=object.material.clone();material.color.set(floor?0x687784:table?0xa3977e:throneStep?0xc0b395:0xb4b9b5);material.roughness=floor?.95:.98;
      replacements.push({object,original:object.material,material});object.material=material;
    }
    const key=new THREE.SpotLight(0xffd5a0,28,12,.7,.82,1.5);
    key.position.set(-2.8,4.8,-P.hd+4.2);const focus=new THREE.Object3D();focus.position.set(0,1.15,-P.hd+4.5);key.target=focus;key.castShadow=false;group.add(key,focus);
    const fill=new THREE.SpotLight(0xa3bfd5,14,10,.74,.9,1.5);
    fill.position.set(3.8,3.8,-P.hd+8);const target=new THREE.Object3D();target.position.set(1,1.2,-P.hd+6);fill.target=target;fill.castShadow=false;group.add(fill,target);
    this.sceneDirection={group,replacements,P,key,fill,windowColor:this.__anthologyWorld?.palaceGlow?.emissive.clone()};
    const env=this.ch.env;this.syncSceneDirection(env);return result;
  };
  Game.prototype.syncSceneDirection=function(env){
    const s=this.sceneDirection;if(!s)return;
    const indoors=env===this.ch.envIn||((this.ch===chapters.mephibosheth||this.ch===chapters.nathan)&&env!==this.ch.envOut);
    const night=env===this.ch.envNight;
    s.group.visible=indoors&&!night;
    const world=this.__anthologyWorld;
    if(night){
      for(const {light} of world?.lights||[])light.intensity=0;
      if(world?.palaceGlow){world.palaceGlow.emissive.set(0x526887);world.palaceGlow.emissiveIntensity=.12;}
    }else if(world?.palaceGlow&&s.windowColor)world.palaceGlow.emissive.copy(s.windowColor);
    // Original lamps remain authoritative during story-driven extinguish/light actions.
  };
  Game.prototype.applyEnv=function(env){const result=apply.call(this,env);this.syncSceneDirection(env);return result;};
  Game.prototype.cineTo=function(pos,look,k){
    if(!this.reviewShot&&palaces.has(this.ch)&&look.z>300){
      pos=pos.clone();
      const offset=pos.clone().sub(look),distance=offset.length();
      if(distance>7.5)pos=look.clone().add(offset.multiplyScalar(7.5/distance));
      this.ch.camClamp?.(pos,look);
    }
    return cine.call(this,pos,look,k);
  };
}
