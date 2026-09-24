/** Roof parapets and recessed-looking windows inside existing house silhouettes. */
export function createVillageDetails(THREE,placements){
 const group=new THREE.Group();group.name='bethlehem-existing-village-details';
 const geometry=new THREE.BoxGeometry(1,1,1),roofMaterial=new THREE.MeshStandardMaterial({color:0xe1d1ad,roughness:1}),windowMaterial=new THREE.MeshStandardMaterial({color:0x493c2b,roughness:1});
 const roofs=new THREE.InstancedMesh(geometry,roofMaterial,placements.length*4),windows=new THREE.InstancedMesh(geometry,windowMaterial,placements.length*2);
 const base=new THREE.Matrix4(),local=new THREE.Matrix4(),out=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),identity=new THREE.Quaternion();
 let ri=0,wi=0;for(const t of placements){q.setFromAxisAngle(new THREE.Vector3(0,1,0),t.ry||0);base.compose(p.set(t.x,t.y,t.z),q,sc.set(t.sx??t.s??1,t.sy??t.s??1,t.sz??t.s??1));
  for(const v of [[-.485,1.105,0,.045,.15,1],[.485,1.105,0,.045,.15,1],[0,1.105,-.485,.94,.15,.045],[0,1.105,.485,.94,.15,.045]]){local.compose(p.set(...v.slice(0,3)),identity,sc.set(...v.slice(3)));roofs.setMatrixAt(ri++,out.multiplyMatrices(base,local));}
  for(const x of [-.24,.24]){local.compose(p.set(x,.65,.505),identity,sc.set(.12,.17,.012));windows.setMatrixAt(wi++,out.multiplyMatrices(base,local));}
 }
 for(const mesh of [roofs,windows]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);}
 let disposed=false;return{group,count:placements.length,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometry.dispose();roofMaterial.dispose();windowMaterial.dispose();}};
}
