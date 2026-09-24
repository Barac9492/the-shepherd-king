import * as THREE from '../vendor/three.module.js';
const splitCache=new WeakMap();
export function splitLeg(geometry){
  if(splitCache.has(geometry))return splitCache.get(geometry);
  const g=geometry.index?geometry.toNonIndexed():geometry,attrs=g.attributes,buckets=[{},{}],joint=-.4;
  for(const b of buckets)for(const [name,a]of Object.entries(attrs))b[name]=[];
  const vertex=i=>Object.fromEntries(Object.entries(attrs).map(([name,a])=>[name,Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k])]));
  const intersect=(a,b)=>{const t=(joint-a.position[1])/(b.position[1]-a.position[1]);return Object.fromEntries(Object.keys(attrs).map(name=>[name,a[name].map((v,k)=>v+(b[name][k]-v)*t)]));};
  for(let i=0;i<attrs.position.count;i+=3){
    const tri=[vertex(i),vertex(i+1),vertex(i+2)];
    for(let side=0;side<2;side++){
      const polygon=[],inside=v=>side?v.position[1]<=joint:v.position[1]>=joint;
      for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],ai=inside(a),bi=inside(b);if(ai)polygon.push(a);if(ai!==bi)polygon.push(intersect(a,b));}
      for(let j=1;j+1<polygon.length;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]])for(const name of Object.keys(attrs)){
        v[name].forEach((value,n)=>buckets[side][name].push(side&&name==='position'&&n===1?value-joint:value));
      }
    }
  }
  const result=buckets.map(b=>{const n=new THREE.BufferGeometry();for(const [name,a]of Object.entries(attrs))n.setAttribute(name,new THREE.Float32BufferAttribute(b[name],a.itemSize));n.normalizeNormals();n.computeBoundingSphere();return n;});
  if(g!==geometry)g.dispose();splitCache.set(geometry,result);return result;
}
// Swing retains stance velocity at both joins, avoiding a visible stop/start
// twice per stride. Small toe-off/landing overshoot is intentional.
export function strideFootPosition(phase,reach){
 const p=((phase%1)+1)%1;
 if(p<.5)return reach*(1-4*p);
 const u=(p-.5)*2;
 return reach*(-8*u*u*u+12*u*u-2*u-1);
}
function playingHands(h,dt){
  h.__playingBlend=THREE.MathUtils.lerp(h.__playingBlend||0,h.pose==='play'?1:0,1-Math.exp(-16*Math.max(0,dt)));
  h.armR.rotation.x-=.45*h.__playingBlend;h.armR.rotation.z+=.25*h.__playingBlend;
}
/** Presentation-only hips/knees. Root physics, arm targets and hand pivots stay game-owned. */
export function articulateStorybookHuman(h,promoteCrowd=null){
  if(h.__storyKnees||!h.root.userData.storybookHuman)return h;
  if(h.root.userData.storybookHumanMetadata?.lod==='crowd' && promoteCrowd){
    const original=h.update;
    h.update=(dt,speed=0)=>{
      if(h.pose==='sit'||h.pose==='kneel'){
        h.update=original;promoteCrowd();h.root.userData.storybookCrowdPromoted=true;
        articulateStorybookHuman(h);h.update(dt,speed);
      }else {original(dt,speed);playingHands(h,dt);}
    };
    return h;
  }
  const knees=[];
  for(const leg of [h.legL,h.legR]){
    const visuals=leg.children.filter(c=>c.isMesh&&c.userData.storybookHumanVisual);if(!visuals.length)continue;
    const knee=new THREE.Group();knee.name='storybook-knee';knee.position.y=-.4;
    for (const visual of visuals) {
      const [upper,lower]=splitLeg(visual.geometry);visual.geometry=upper;visual.userData.keepGeo=true;visual.visible=upper.attributes.position.count>0;
      if(lower.attributes.position.count){const calf=new THREE.Mesh(lower,visual.material);calf.castShadow=true;calf.receiveShadow=true;calf.userData.keepGeo=true;knee.add(calf);}
    }
    leg.add(knee);knees.push(knee);
  }
  if(knees.length!==2)return h;
  h.__storyKnees=knees;const update=h.update.bind(h);
  const locomotion=new Set(['auto','walk','carry','carryarms','sling','bowaim']);
  // Local distance avoids different cadence for child/adult scales. Large jumps and
  // suspended frames reset the sample instead of masquerading as a running stride.
  const motion={x:h.root.position.x,z:h.root.position.z,cycle:0,blend:0,low:0,
    hips:[h.legL.rotation.x,h.legR.rotation.x],by:h.body.position.y,bx:h.body.rotation.x};
  const ease=(a,b,k)=>a+(b-a)*k;
  h.update=(dt,speed=0)=>{
    dt=Number.isFinite(dt)?Math.max(0,dt):0;
    const step=Math.min(dt,1),x=h.root.position.x,z=h.root.position.z;
    const scale=Math.max(.1,Math.abs(h.root.scale.x));
    const distance=Math.hypot(x-motion.x,z-motion.z)/scale;
    motion.x=x;motion.z=z;
    const valid=dt>0&&dt<=.1&&Number.isFinite(distance)&&distance<=Math.max(.35,dt*16);
    const actual=valid?distance/dt:0;
    const moving=locomotion.has(h.pose)&&actual>.015;
    // At full running speed a longer virtual stride caps cadence near 2.4 cycles/s.
    // This deliberately accepts some running slip rather than tiny frantic steps.
    const run=THREE.MathUtils.clamp((actual-4.8)/3.6,0,1);
    const stride=2.35+1.25*run;
    if(moving)motion.cycle=(motion.cycle+distance/stride)%1;
    motion.blend=ease(motion.blend,moving?1:0,1-Math.exp(-18*step));
    const low=h.pose==='sit'||h.pose==='kneel';
    motion.low=ease(motion.low,low?1:0,1-Math.exp(-6*step));
    // Keep the original update for the existing arm/head pose vocabulary, but no
    // residual player.speed may keep a stationary character walking in place.
    update(step,locomotion.has(h.pose)?actual:speed);playingHands(h,step);
    const garment=h.body.children.find(o=>o.name==='storybook-body');
    if(garment?.morphTargetInfluences?.length)garment.morphTargetInfluences[0]=ease(garment.morphTargetInfluences[0],h.pose==='sit'?1:0,1-Math.exp(-6*step));
    const hips=[h.legL.rotation.x,h.legR.rotation.x],bend=[0,0];
    if(low){hips[0]=h.pose==='sit'?-1.5:-1.6;hips[1]=h.pose==='sit'?-1.5:.2;bend[0]=h.pose==='sit'?1.5:1.6;bend[1]=h.pose==='sit'?1.5:.55;}
    else if(locomotion.has(h.pose)){
      for(let i=0;i<2;i++){
        const phase=(motion.cycle+i*.5)%1,stance=phase<.5;
        const u=stance?phase*2:(phase-.5)*2;
        // Straight backward travel in stance; eased recovery and knee lift in swing.
        const reach=.55+.10*run;
        const footZ=strideFootPosition(phase,reach);
        const knee=stance?.10:.10+.95*Math.sin(Math.PI*u)**2;
        hips[i]=(Math.asin(THREE.MathUtils.clamp(-footZ/.83,-.9,.9))-knee*.5)*motion.blend;
        bend[i]=knee*motion.blend;
      }
    }
    // No extra low-pass on a settled gait: it would undo the stance compensation.
    // Blend only on entry/exit from the existing sitting/kneeling targets.
    const poseK=1-Math.exp(-5*step),transition=low||motion.low>.002;
    for(let i=0;i<2;i++){
      motion.hips[i]=transition?ease(motion.hips[i],hips[i],poseK):hips[i];
      knees[i].rotation.x=transition?ease(knees[i].rotation.x,bend[i],poseK):bend[i];
      [h.legL,h.legR][i].rotation.x=motion.hips[i];
    }
    // Quiet counter-swing follows the same stride, rather than a second clock.
    // Explicit hand poses (sling/carry/play/bow) remain owned by the base animation.
    if(h.pose==='auto'||h.pose==='walk'){
      h.armL.rotation.x=ease(h.armL.rotation.x,-motion.hips[0]*.55,motion.blend);
      h.armR.rotation.x=ease(h.armR.rotation.x,-motion.hips[1]*.55,motion.blend);
      if(h.tgt){h.tgt.aL=h.armL.rotation.x;h.tgt.aR=h.armR.rotation.x;}
    }
    const by=low?(h.pose==='sit'?-.46:-.3):h.body.position.y;
    const bx=low?(h.pose==='kneel'?.25:0):h.body.rotation.x;
    motion.by=transition?ease(motion.by,by,poseK):by;
    motion.bx=transition?ease(motion.bx,bx,poseK):bx;
    h.body.position.y=motion.by;h.body.rotation.x=motion.bx;
    // Heel/toe sole samples in this existing rig, including torso pitch. This is
    // flat-root-plane clearance, not terrain IK, and never changes the root.
    if(low||transition||locomotion.has(h.pose)){
      let floor=Infinity;
      for(let i=0;i<2;i++)for(const toe of [-.08,.21]){
        const hip=motion.hips[i],angle=hip+knees[i].rotation.x,leg=[h.legL,h.legR][i];
        const fy=leg.position.y-.4*Math.cos(hip)-.455*Math.cos(angle)-toe*Math.sin(angle);
        const fz=leg.position.z-.4*Math.sin(hip)-.455*Math.sin(angle)+toe*Math.cos(angle);
        floor=Math.min(floor,motion.by+fy*Math.cos(motion.bx)-fz*Math.sin(motion.bx));
      }
      const correction=locomotion.has(h.pose)&&!transition&&floor>0?-floor*motion.blend:Math.max(0,-floor);
      h.body.position.y+=THREE.MathUtils.clamp(correction,-.18,.38);
    }
    // Keep base-pose easing synchronized, excluding the nonaccumulating sole lift.
    if(h.tgt){h.tgt.lL=motion.hips[0];h.tgt.lR=motion.hips[1];h.tgt.by=motion.by;h.tgt.bx=motion.bx;}
  };
  return h;
}
