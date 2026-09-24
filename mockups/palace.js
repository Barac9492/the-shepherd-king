import * as THREE from 'three';
/** A separate authored set; does not reuse the game's primitive scenery. */
export async function buildPalace(loader,assets){
 const root=new THREE.Group(),textures=new THREE.TextureLoader();
 const stone=new THREE.MeshStandardMaterial({color:0xb5ad93,roughness:.94});
 const floorMat=new THREE.MeshStandardMaterial({color:0xc9c0a7,roughness:.86});
 const wood=new THREE.MeshStandardMaterial({color:0x58402a,roughness:.8});
 if(assets.floorMaps){for(const [key,url]of Object.entries(assets.floorMaps)){const texture=await textures.loadAsync(url);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(6,10);if(key==='map')texture.colorSpace=THREE.SRGBColorSpace;floorMat[key]=texture;}floorMat.color.set(0xffffff);floorMat.normalScale.set(.75,.75);}
 if(assets.stoneMaps){for(const [key,url]of Object.entries(assets.stoneMaps)){const texture=await textures.loadAsync(url);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,1);if(key==='map')texture.colorSpace=THREE.SRGBColorSpace;stone[key]=texture;}stone.color.set(0xffffff);stone.normalScale.set(.7,.7);}
 const box=(x,y,z,sx,sy,sz,mat=stone)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;};
 box(0,-.2,0,15,.4,27,floorMat);
 box(0,2.5,-12,15,5,.6);box(-7.2,2.5,0,.6,5,25);box(7.2,2.5,0,.6,5,25);
 // Carved structural arches are real extruded geometry, not a texture overlay.
 const archShape=new THREE.Shape();archShape.moveTo(-1.7,0);archShape.lineTo(-1.7,3.15);archShape.absarc(0,3.15,1.7,Math.PI,0,true);archShape.lineTo(1.7,0);archShape.lineTo(1.18,0);archShape.lineTo(1.18,3.15);archShape.absarc(0,3.15,1.18,0,Math.PI,false);archShape.lineTo(-1.18,0);archShape.closePath();
 const archGeo=new THREE.ExtrudeGeometry(archShape,{depth:.55,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.045,curveSegments:18});
 for(const side of [-1,1])for(let i=0;i<6;i++){const arch=new THREE.Mesh(archGeo,stone);arch.position.set(side*5.25,0,-9.5+i*3.6);arch.rotation.y=Math.PI/2;arch.castShadow=arch.receiveShadow=true;root.add(arch);box(side*5.25,4.85,-.5,.75,.3,24);}
 for(const z of [-10,-6,-2,2,6,10])box(0,5.45,z,14,.28,.32,wood);
 box(0,.12,-8.5,7,.24,4.8,floorMat);box(0,.035,-5.75,5,.07,1.0,floorMat);
 const clothCanvas=document.createElement('canvas');clothCanvas.width=clothCanvas.height=128;const ctx=clothCanvas.getContext('2d');ctx.fillStyle='#34424b';ctx.fillRect(0,0,128,128);ctx.fillStyle='#91764a';ctx.fillRect(8,0,4,128);ctx.fillRect(116,0,4,128);ctx.globalAlpha=.1;for(let i=0;i<128;i+=2){ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}const clothTex=new THREE.CanvasTexture(clothCanvas);clothTex.colorSpace=THREE.SRGBColorSpace;clothTex.wrapS=clothTex.wrapT=THREE.RepeatWrapping;clothTex.repeat.set(1,4);box(0,.018,.5,3.1,.022,15,new THREE.MeshStandardMaterial({map:clothTex,roughness:1}));
 const loaded=new Map();const objectLoads=[];for(const entry of assets.objects||[]){if(!loaded.has(entry.url))loaded.set(entry.url,await loader.loadAsync(entry.url));const full=loaded.get(entry.url).scene;const object=entry.node?full.getObjectByName(entry.node):full;if(!object)throw Error('Missing authored asset node '+entry.node);objectLoads.push({entry,scene:object.clone(true)});}
 for(const {entry,scene}of objectLoads){const b=new THREE.Box3().setFromObject(scene),s=b.getSize(new THREE.Vector3());const scale=entry.height/s.y;scene.scale.setScalar(scale);scene.updateMatrixWorld(true);const nb=new THREE.Box3().setFromObject(scene),c=nb.getCenter(new THREE.Vector3());scene.position.add(new THREE.Vector3(-c.x,-nb.min.y,-c.z));
  for(const placement of entry.placements){const holder=new THREE.Group();holder.add(scene.clone(true));holder.position.fromArray(placement.position);holder.rotation.y=placement.yaw||0;root.add(holder);}}
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return root;
}
