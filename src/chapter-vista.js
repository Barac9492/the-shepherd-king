import {createBethlehemLandscape} from './bethlehem-landscape.js';
import {createVillageDetails} from './bethlehem-village.js';


function addAerialPerspective(THREE,game,state){
 const cache=new Map();state.materials=[];state.replacements=[];state.timeUniform={value:game.time};
 game.root.traverse(object=>{
  if(!object.isMesh)return;
  const change=source=>{
   if(!source?.isMeshStandardMaterial&&!source?.isMeshLambertMaterial)return source;
   if(cache.has(source))return cache.get(source);
   const material=source.clone(),previous=source.onBeforeCompile,key=source.customProgramCacheKey?.call(source)||'';
   material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);shader.uniforms.vistaTime=state.timeUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vVistaWorld;').replace('#include <project_vertex>',    '#include <project_vertex>\nvec4 vistaWP=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nvistaWP=instanceMatrix*vistaWP;\n#endif\nvVistaWorld=(modelMatrix*vistaWP).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vVistaWorld;\nuniform float vistaTime;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',    '#include <color_fragment>\nfloat vistaCloud=sin(vVistaWorld.x*.044+vistaTime*.009+sin(vVistaWorld.z*.021))*cos(vVistaWorld.z*.036-vistaTime*.004);\ndiffuseColor.rgb*=1.0-.12*smoothstep(.15,.65,vistaCloud);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',    '#include <fog_fragment>\nfloat vistaDistance=length(vVistaWorld-cameraPosition);\nfloat vistaLow=1.0-smoothstep(8.0,48.0,vVistaWorld.y);\nfloat vistaHaze=smoothstep(28.0,140.0,vistaDistance)*(.10+.10*vistaLow)+smoothstep(160.0,480.0,vistaDistance)*.16;\ngl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.70,.76,.78),clamp(vistaHaze,0.0,.34));');
   };
   material.customProgramCacheKey=()=>key+'-vista-aerial-v1';material.needsUpdate=true;cache.set(source,material);state.materials.push(material);return material;
  };
  const original=object.material;const replacement=Array.isArray(original)?original.map(change):change(original);if(replacement!==original){state.replacements.push({object,original});object.material=replacement;}
 });
}

/** Visual scene direction only. Terrain, actors, bounds, collision and scripts remain authoritative. */
export function installChapterVista({THREE,Game,CH1}){
 if(Game.prototype.__chapterVistaInstalled)return;
 Object.defineProperty(Game.prototype,'__chapterVistaInstalled',{value:true});
 Object.assign(CH1.env,{top:0x4a86ab,horizon:0xd2dce0,fog:0xa9bbc5,fogNear:95,fogFar:620,exposure:.94,glow:.24,moteOpacity:.14,moteSize:.08});
 const load=Game.prototype.loadWorld,clear=Game.prototype.clearChapter,apply=Game.prototype.applyEnv,place=Game.prototype.placePlayer,placeMesh=Game.prototype.place;
 Game.prototype.place=function(name,list,options){const result=placeMesh.call(this,name,list,options);if(this.ch===CH1&&name==='house')this.__vistaHouses=list.map(x=>({...x}));return result;};
 Game.prototype.clearChapter=function(...args){const s=this.chapterVista;if(s){for(const r of s.replacements)r.object.material=r.original;for(const m of s.materials)m.dispose();if(this.cam.dist===9)this.cam.dist=s.savedDist;s.landscape.dispose();s.village.dispose();this.chapterVista=null;}this.__vistaHouses=[];return clear.apply(this,args);};
 Game.prototype.applyEnv=function(env){const result=apply.call(this,env);if(this.ch===CH1){this.sun.color.set(0xffd6a0);this.sun.intensity=2.75;this.hemi.color.set(0xabc4d4);this.hemi.groundColor.set(0x6e7153);this.hemi.intensity=.59;}return result;};
 Game.prototype.loadWorld=function(...args){
  const result=load.apply(this,args);if(this.ch!==CH1)return result;
  const landscape=createBethlehemLandscape({THREE,game:this});if(!landscape.group.parent)this.root.add(landscape.group);
  const village=createVillageDetails(THREE,this.__vistaHouses||[]);this.root.add(village.group);
  this.chapterVista={landscape,village,savedDist:this.cam.dist,age:0,last:performance.now(),mode:null,arrivalActive:false};
  addAerialPerspective(THREE,this,this.chapterVista);
  this.cam.pitch=.18;
  if(!this.__vistaRenderInstalled){
   this.__vistaRenderInstalled=true;const render=this.renderer.render.bind(this.renderer),game=this;
   const eye=new THREE.Vector3(),look=new THREE.Vector3();
   this.renderer.render=function(scene,camera){
    const s=game.chapterVista;
    if(scene===game.scene&&camera===game.camera&&s){
     s.timeUniform.value=game.time;
     const now=performance.now();const delta=Math.min(.05,(now-s.last)/1000);s.last=now;
     if(s.mode!==game.mode){s.age=0;s.mode=game.mode;}else if(!game.paused)s.age+=delta;
     s.arrivalActive=!game.reviewShot&&['title','intro','introCard'].includes(game.mode);
     if(s.arrivalActive){
      // Use only existing title/card time: no gameplay wait, lock, autowalk or skip obligation.
      const t=THREE.MathUtils.smoothstep(Math.min(s.age/12,1),0,1);
      const x=THREE.MathUtils.lerp(37,18,t),z=THREE.MathUtils.lerp(68,48,t);
      eye.set(x,game.groundAt(x,z)+THREE.MathUtils.lerp(18,9,t),z);
      const target=s.landscape.landmark;look.set(THREE.MathUtils.lerp(-19,-27,t),THREE.MathUtils.lerp(11,8,t),THREE.MathUtils.lerp(-36,-48,t));
      if(target)look.y=Math.max(look.y,Math.min(target.y*.34,16));
      camera.position.copy(eye);camera.lookAt(look);game.sky.mesh.position.copy(eye);
     }
    }
    return render(scene,camera);
   };
  }
  return result;
 };
 Game.prototype.placePlayer=function(x,z,yaw){const result=place.call(this,x,z,yaw);if(this.ch===CH1&&Math.abs(x-6)<.01&&Math.abs(z-40)<.01){this.cam.yaw=.32;this.cam.pitch=.18;this.cam.dist=9;}return result;};
}
