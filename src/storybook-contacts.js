/** Instanced soft contact grounding. All chapters; carried/hidden actors do not cast blobs. */
export function installStorybookContacts({THREE,Game}) {
  const originalLoad=Game.prototype.loadWorld,originalClear=Game.prototype.clearChapter;
  Game.prototype.clearChapter=function(...args){
    if(this.storyContacts){const s=this.storyContacts;s.mesh.removeFromParent();s.mesh.geometry.dispose();s.mesh.material.dispose();s.texture.dispose();this.storyContacts=null;}
    return originalClear.apply(this,args);
  };
  Game.prototype.loadWorld=function(...args){
    const result=originalLoad.apply(this,args);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'rgba(54,43,30,0.42)');gradient.addColorStop(.45,'rgba(54,43,30,0.2)');gradient.addColorStop(1,'rgba(54,43,30,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    const capacity=36,mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.frustumCulled=false;mesh.renderOrder=2;mesh.name='soft-character-contacts';this.root.add(mesh);
    const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
    const sync=()=>{
      const p=this.player.pos;
      const actors=this.actors.filter(a=>a.m.root.visible&&a.ground!==false&&Math.hypot(a.pos.x-p.x,a.pos.z-p.z)<42)
        .sort((a,b)=>a.pos.distanceToSquared(p)-b.pos.distanceToSquared(p)).slice(0,capacity-1);
      const targets=[{pos:p,root:this.david.root},...actors.map(a=>({pos:a.pos,root:a.m.root}))];
      mesh.count=targets.length;
      targets.forEach((t,i)=>{
        const q=t.pos,y=this.groundAt(q.x,q.z),e=.2;
        normal.set(this.groundAt(q.x-e,q.z)-this.groundAt(q.x+e,q.z),2*e,this.groundAt(q.x,q.z-e)-this.groundAt(q.x,q.z+e)).normalize();quat.setFromUnitVectors(up,normal);
        position.set(q.x,y+.035,q.z);const fade=t.root.visible?Math.max(0,1-Math.abs(q.y-y)*2):0;
        const animal=t.root.userData.storybookAsset?.includes('sheep'),s=t.root.scale.x;
        scale.set((animal?1.15:.8)*s*fade,1,(animal?1.3:.7)*s*fade);matrix.compose(position,quat,scale);mesh.setMatrixAt(i,matrix);
      });mesh.instanceMatrix.needsUpdate=true;
    };
    this.storyContacts={mesh,texture,sync};sync();
    if(!this._contactRenderHook){
      this._contactRenderHook=true;const render=this.renderer.render.bind(this.renderer);
      this.renderer.render=(scene,camera)=>{if(scene===this.scene)this.storyContacts?.sync();return render(scene,camera);};
    }
    return result;
  };
}
