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
/** Presentation-only knee articulation. Keeps original gait clock, hands, hip pivots and poses. */
export function articulateStorybookHuman(h,promoteCrowd=null){
  if(h.__storyKnees||!h.root.userData.storybookHuman)return h;
  if(h.root.userData.storybookHumanMetadata?.lod==='crowd' && promoteCrowd){
    const original=h.update;
    h.update=(dt,speed=0)=>{
      if(h.pose==='sit'||h.pose==='kneel'){
        h.update=original;promoteCrowd();h.root.userData.storybookCrowdPromoted=true;
        articulateStorybookHuman(h);h.update(dt,speed);
      }else original(dt,speed);
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
  h.update=(dt,speed=0)=>{
    update(dt,speed);let a=0,b=0;
    if(h.pose==='sit'){a=b=1.5;}
    else if(h.pose==='kneel'){a=1.6;b=.55;}
    else if(['auto','walk','carry','carryarms','sling','bowaim'].includes(h.pose)){
      const amp=Math.min(1,speed/4.8);a=Math.max(0,-Math.cos(h.phase))*.58*amp;b=Math.max(0,Math.cos(h.phase))*.58*amp;
    }
    const k=1-Math.exp(-18*Math.max(0,dt));knees[0].rotation.x=THREE.MathUtils.lerp(knees[0].rotation.x,a,k);knees[1].rotation.x=THREE.MathUtils.lerp(knees[1].rotation.x,b,k);
    if(speed>.1&&['auto','walk'].includes(h.pose)){
      const feet=[h.legL,h.legR].map((leg,i)=>h.body.position.y+leg.position.y-.4*Math.cos(leg.rotation.x)-.43*Math.cos(leg.rotation.x+knees[i].rotation.x)-.035);
      h.body.position.y-=THREE.MathUtils.clamp(Math.min(...feet),-.08,.12);
    }
  };
  return h;
}
