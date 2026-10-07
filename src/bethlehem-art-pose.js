// Art-lab-only procedural contact pass over the original six GLB clips.
// This is not exported back into the Blender source or claimed as gameplay IK.
export function createArtPoseRefiner(THREE, character, placement) {
  const bones=new Map();character.traverse(o=>{if(o.isBone)bones.set(o.userData.name||o.name,o);});
  const get=n=>bones.get(n)||bones.get(n.replaceAll('.',''));
  for(const n of ['upper_arm.L','forearm.L','hand.L','upper_arm.R','forearm.R','hand.R','prop_master'])if(!get(n))throw new Error('Contact pass missing bone '+n);
  const v=()=>new THREE.Vector3(), q=()=>new THREE.Quaternion();
  character.updateWorldMatrix(true,true);
  const arms={};for(const side of ['L','R']){const upper=get('upper_arm.'+side),fore=get('forearm.'+side),hand=get('hand.'+side);arms[side]={upper,fore,hand,a:upper.getWorldPosition(v()).distanceTo(fore.getWorldPosition(v())),b:fore.getWorldPosition(v()).distanceTo(hand.getWorldPosition(v()))};}
  function orient(bone, child, end){bone.updateWorldMatrix(true,true);const start=bone.getWorldPosition(v()),direction=child.getWorldPosition(v()).sub(start).normalize(),desired=end.clone().sub(start).normalize();const rotation=q().setFromUnitVectors(direction,desired);const world=bone.getWorldQuaternion(q()).premultiply(rotation);const parent=bone.parent.getWorldQuaternion(q()).invert();bone.quaternion.copy(parent.multiply(world));bone.updateWorldMatrix(false,true);}
  function solve(side,target){const a=arms[side],s=a.upper.getWorldPosition(v()),d=target.clone().sub(s),distance=Math.min(d.length(),a.a+a.b-.006);d.normalize();const pole=local((side==='L'?-1:1)*.63,1.10,.03).sub(s);pole.addScaledVector(d,-pole.dot(d)).normalize();const along=(a.a*a.a-a.b*a.b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a.a*a.a-along*along));const elbow=s.clone().addScaledVector(d,along).addScaledVector(pole,height);const wrist=s.clone().addScaledVector(d,distance);orient(a.upper,a.fore,elbow);orient(a.fore,a.hand,wrist);return a.hand.getWorldPosition(v());}
  function local(x,y,z){return placement.localToWorld(new THREE.Vector3(x,y,z));}
  function placeProp(worldPosition,tilt){const prop=get('prop_master');prop.position.copy(prop.parent.worldToLocal(worldPosition.clone()));const world=placement.getWorldQuaternion(q()).multiply(q().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt));prop.quaternion.copy(prop.parent.getWorldQuaternion(q()).invert().multiply(world));prop.updateWorldMatrix(false,true);}
  function update(name,time){character.updateWorldMatrix(true,true);let left,right;
    if(['Carry','DrawWater','Pour'].includes(name)){
      const phase=Math.min(1,time/3),dip=name==='DrawWater'?Math.sin(phase*Math.PI)*.14:0,tilt=name==='Pour'?Math.sin(Math.min(1,phase*1.5)*Math.PI/2)*.75:0;
      const center=local(0,.86-dip,.38+dip*.25);placeProp(center,tilt);
      const grip=new THREE.Vector3(0,.245,.005).applyAxisAngle(new THREE.Vector3(1,0,0),tilt);const base=placement.worldToLocal(center.clone()).add(grip);
      left=solve('L',local(base.x-.12,base.y,base.z));right=solve('R',local(base.x+.12,base.y,base.z));
    }else{
      const swing=name==='Walk'?Math.sin(time*Math.PI*1.5)*.10:0,drop=name==='Crouch'?Math.min(1,time)*.12:0;
      left=solve('L',local(-.29,.88-drop,.075+swing));right=solve('R',local(.29,.88-drop,.07-swing));
      const h=placement.worldToLocal(left.clone());placeProp(local(h.x,h.y-.46,h.z+.025),0);
    }
    character.updateWorldMatrix(true,true);
    return {left:left.toArray(),right:right.toArray()};
  }
  return {update,boneCount:bones.size};
}
