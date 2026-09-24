/** Instanced soft contact grounding. All chapters; carried/hidden actors do not cast blobs. */
export function installStorybookContacts({THREE,Game}) {
  const originalLoad=Game.prototype.loadWorld,originalClear=Game.prototype.clearChapter;
  Game.prototype.clearChapter=function(...args){
    if(this.storyContacts){const s=this.storyContacts;this.storyContacts=null;s.clearCache();s.mesh.removeFromParent();s.mesh.dispose();s.mesh.geometry.dispose();s.mesh.material.dispose();s.texture.dispose();}
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
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
    const cache=new Map(),actors=[],sampleStepSquared=.1*.1;
    const byDistance=(a,b)=>a.distanceSquared-b.distanceSquared;
    const recordFor=(root,pos)=>{
      let record=cache.get(root);
      if(!record){record={root,pos,distanceSquared:0,sampled:false,x:0,z:0,y:0,slopeX:0,slopeZ:0,quat:new THREE.Quaternion()};cache.set(root,record);}
      record.pos=pos;return record;
    };
    const draw=(record,i)=>{
      const q=record.pos,root=record.root,dx=q.x-record.x,dz=q.z-record.z;
      // Measure from the last sample, not the previous frame: slow motion still refreshes.
      if(root.visible&&(!record.sampled||dx*dx+dz*dz>=sampleStepSquared)){
        const e=.2;record.x=q.x;record.z=q.z;record.y=this.groundAt(q.x,q.z);
        normal.set(this.groundAt(q.x-e,q.z)-this.groundAt(q.x+e,q.z),2*e,this.groundAt(q.x,q.z-e)-this.groundAt(q.x,q.z+e)).normalize();
        record.quat.setFromUnitVectors(up,normal);record.slopeX=-normal.x/Math.max(.01,normal.y);record.slopeZ=-normal.z/Math.max(.01,normal.y);record.sampled=true;
      }
      // Matrices, elevation fade, visibility, and scale follow the live actor every frame.
      const groundY=record.y+(q.x-record.x)*record.slopeX+(q.z-record.z)*record.slopeZ;
      position.set(q.x,groundY+.035,q.z);const fade=root.visible?Math.max(0,1-Math.abs(q.y-groundY)*2):0;
      const animal=root.userData.storybookAsset?.includes('sheep'),s=root.scale.x;
      scale.set((animal?1.15:.8)*s*fade,1,(animal?1.3:.7)*s*fade);matrix.compose(position,record.quat,scale);mesh.setMatrixAt(i,matrix);
      if(!root.visible)record.sampled=false;
    };
    let davidRoot=null;
    const sync=()=>{
      const p=this.player.pos,root=this.david.root;
      if(root!==davidRoot){if(davidRoot)cache.delete(davidRoot);davidRoot=root;}
      actors.length=0;
      for(let i=0;i<this.actors.length;i++){
        const actor=this.actors[i],actorRoot=actor.m.root;
        if(!actorRoot.visible||actor.ground===false){const record=cache.get(actorRoot);if(record)record.sampled=false;continue;}
        const q=actor.pos,dx=q.x-p.x,dz=q.z-p.z,horizontalSquared=dx*dx+dz*dz;
        if(!(horizontalSquared<42*42))continue;
        const record=recordFor(actorRoot,q),dy=q.y-p.y;
        record.distanceSquared=horizontalSquared+dy*dy;actors.push(record);
      }
      actors.sort(byDistance);
      const count=Math.min(actors.length,capacity-1);mesh.count=count+1;
      draw(recordFor(root,p),0);
      for(let i=0;i<count;i++)draw(actors[i],i+1);
      mesh.instanceMatrix.needsUpdate=true;
    };
    const clearCache=()=>{cache.clear();actors.length=0;davidRoot=null;};
    this.storyContacts={mesh,texture,sync,clearCache};sync();
    if(!this._contactRenderHook){
      this._contactRenderHook=true;const render=this.renderer.render.bind(this.renderer);
      this.renderer.render=(scene,camera)=>{if(scene===this.scene)this.storyContacts?.sync();return render(scene,camera);};
    }
    return result;
  };
}
