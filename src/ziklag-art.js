/** Aftermath, not a new combat effect: charred roof beams and slow smoke at existing homes. */
export function installZiklagArt({THREE,Game,CH_ZIK,PROTO}){
  const load=Game.prototype.loadWorld,clear=Game.prototype.clearChapter;
  Game.prototype.clearChapter=function(...args){
    const s=this.ziklagArt;if(s){s.root.removeFromParent();s.geometry.dispose();for(const m of s.materials)m.dispose();s.texture.dispose();this.ziklagArt=null;}
    return clear.apply(this,args);
  };
  Game.prototype.loadWorld=function(...args){
    const result=load.apply(this,args);if(this.ch!==CH_ZIK)return result;
    let houses;this.root.traverse(o=>{if(o.isInstancedMesh&&o.geometry===PROTO.house)houses=o;});if(!houses)return result;
    const root=new THREE.Group();root.name='ziklag-smouldering-roofs';this.root.add(root);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(49,46,44,.75)');grad.addColorStop(.5,'rgba(63,58,52,.35)');grad.addColorStop(1,'rgba(75,70,63,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.BoxGeometry(1,1,1),beamMat=new THREE.MeshStandardMaterial({color:0x241c18,roughness:1});
    const beams=new THREE.InstancedMesh(geometry,beamMat,12);beams.castShadow=true;beams.receiveShadow=true;root.add(beams);
    const emberMat=new THREE.MeshStandardMaterial({color:0x4c2318,emissive:0xc14914,emissiveIntensity:.75,roughness:1});
    const embers=new THREE.InstancedMesh(geometry,emberMat,3);root.add(embers);
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),sources=[],sprites=[],materials=[beamMat,emberMat];
    for(let i=0;i<3;i++){
      houses.getMatrixAt(Math.min(houses.count-1,1+i*3),matrix);matrix.decompose(position,quat,scale);
      const p=position.clone();p.y+=scale.y*.93;sources.push(p);
      for(let j=0;j<4;j++){
        const o=new THREE.Object3D();o.position.copy(p).add(new THREE.Vector3((j-1.5)*.63,-.24-j*.2,(j%2?1:-1)*.6));o.rotation.set(.24+j*.14,(j%2?.65:-.5),j%2?.25:-.2);o.scale.set(.18,.16,2.9);o.updateMatrix();beams.setMatrixAt(i*4+j,o.matrix);
        const mat=new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.42,depthWrite:false,fog:true});materials.push(mat);const smoke=new THREE.Sprite(mat);root.add(smoke);sprites.push({smoke,p,phase:j/4+i*.11});
      }
      const patch=new THREE.Object3D();patch.position.copy(p).add(new THREE.Vector3(0,-.2,0));patch.scale.set(1.1,.04,.65);patch.rotation.y=.7;patch.updateMatrix();embers.setMatrixAt(i,patch.matrix);
    }
    const tick=()=>{for(const {smoke,p,phase}of sprites){const k=(this.time*.065+phase)%1;smoke.position.copy(p).add(new THREE.Vector3(k*1.9,1+k*6,Math.sin(k*4+phase)*.7));smoke.scale.setScalar(1.8+k*3.5);smoke.material.opacity=.48*Math.sin(k*Math.PI);}emberMat.emissiveIntensity=.6+Math.sin(this.time*3)*.15;};
    tick();this.every(tick);this.ziklagArt={root,geometry,materials,texture,sources};return result;
  };
}
