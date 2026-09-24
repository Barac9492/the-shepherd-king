/** A readable seven-string lyre. Retains the original hand attachment and story lifecycle. */
export function makeStorybookLyreFactory({THREE,G,merge,mesh}){
  const wood=0x9d683b,gold=0xd5a454,parts=[];
  for(const side of [-1,1]){
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.2,.02,0),new THREE.Vector3(side*.29,.23,0),new THREE.Vector3(side*.31,.53,0),new THREE.Vector3(side*.26,.72,0)]);
    parts.push(G(new THREE.TubeGeometry(curve,12,.033,7,false),{color:wood}));
  }
  parts.push(G(new THREE.SphereGeometry(.25,12,7),{y:.035,sy:.43,sz:.3,color:0xb7864e}),G(new THREE.CylinderGeometry(.035,.035,.62,8),{y:.69,rz:Math.PI/2,color:wood}));
  for(let i=0;i<7;i++){
    const x=(i-3)*.065;
    parts.push(G(new THREE.CylinderGeometry(.004,.004,.59,5),{x,y:.365,z:.019,color:0xd8bf84}),G(new THREE.SphereGeometry(.023,6,5),{x,y:.7,z:.015,color:gold}));
  }
  const geometry=merge(parts);
  return ()=>{
    const root=new THREE.Group();root.name='storybook-seven-string-lyre';
    const instrument=mesh(geometry);instrument.userData.keepGeo=true;
    // Counter the legacy forearm and prop rotations: strings stand upright, not as a pale plank.
    instrument.rotation.x=1.4;instrument.scale.setScalar(.95);
    // Align the right lower frame to the left palm under the original caller transform.
    const caller=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.4,0,.3));
    const grip=new THREE.Vector3(.2,.04,.015).multiplyScalar(.95).applyEuler(instrument.rotation);
    instrument.position.copy(new THREE.Vector3(0,-.015,0).sub(new THREE.Vector3(.1,.1,.25)).applyQuaternion(caller.invert()).sub(grip));
    root.add(instrument);
    return root;
  };
}
