/** Small instanced contact shadows, not expensive screen-space AO. Chapter 1 only. */
export function installStorybookContacts({THREE,Game,CH1}) {
  const originalLoad=Game.prototype.loadWorld,originalClear=Game.prototype.clearChapter;
  Game.prototype.clearChapter=function(...args){
    if(this.storyContacts){const s=this.storyContacts;s.mesh.removeFromParent();s.mesh.geometry.dispose();s.mesh.material.dispose();s.texture.dispose();this.storyContacts=null;}
    return originalClear.apply(this,args);
  };
  Game.prototype.loadWorld=function(...args){
    const result=originalLoad.apply(this,args);if(this.ch!==CH1)return result;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'rgba(54,43,30,0.42)');gradient.addColorStop(.45,'rgba(54,43,30,0.2)');gradient.addColorStop(1,'rgba(54,43,30,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    const mesh=new THREE.InstancedMesh(geometry,material,8);mesh.frustumCulled=false;mesh.renderOrder=2;mesh.name='soft-character-contacts';this.root.add(mesh);
    const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
    const sync=()=>{
      const targets=[{pos:this.player.pos,scale:1,visible:this.david?.root.visible},...this.ch.s.sheep.map(s=>({pos:s.a.pos,scale:s.a.m.root.scale.x,visible:s.a.m.root.visible&&s.st!=='carried'}))];
      targets.forEach((t,i)=>{
        const p=t.pos,y=this.groundAt(p.x,p.z),e=.2;
        normal.set(this.groundAt(p.x-e,p.z)-this.groundAt(p.x+e,p.z),2*e,this.groundAt(p.x,p.z-e)-this.groundAt(p.x,p.z+e)).normalize();quat.setFromUnitVectors(up,normal);
        position.set(p.x,y+.035,p.z);const fade=t.visible?Math.max(0,1-Math.abs(p.y-y)*1.5):0;
        scale.set((i?1.15:.8)*t.scale*fade,1,(i?1.3:.7)*t.scale*fade);matrix.compose(position,quat,scale);mesh.setMatrixAt(i,matrix);
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
