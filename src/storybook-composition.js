/** Chapter-one art direction. Rendering only: no terrain heights, actors or colliders change. */
export function installStorybookComposition({THREE, Game, CH1, PATH1, PATH1b, distPath}) {
  const originalGrass = CH1.grass;
  CH1.grassN = 14500;
  CH1.grassTint = [0x758649, 0xc7bd75];
  // Clearings alternating with rich beds, rather than a uniformly spiky carpet.
  CH1.grass = function(x,z) {
    const eligible=originalGrass.call(this,x,z); if(!eligible)return 0;
    const d=Math.min(distPath(x,z,PATH1),distPath(x,z,PATH1b));
    const wave=Math.sin(x*.22+Math.sin(z*.11)*1.6)*Math.cos(z*.19+Math.sin(x*.13));
    const bed=Math.max(0,Math.min(1,(wave+.14)*2.4));
    const verge=d>2.1&&d<4.1 ? .85 : 0;
    return eligible*Math.max(verge,.06+.94*bed);
  };
  CH1.env.fogNear=42; CH1.env.fogFar=205;
  CH1.env.fog=0xcac9ad;
  CH1.env.top=0x648da3; CH1.env.horizon=0xe3d4ae;
  CH1.env.exposure=.94;

  const oldBuild=Game.prototype.buildTerrain;
  Game.prototype.buildTerrain=function(ch) {
    oldBuild.call(this,ch); if(ch!==CH1)return;
    // Smooth only the shading of the original collision-identical mesh.
    // Gradient normals remove distracting faceted light bands on broad hills.
    const geo=this.terrain.geometry,p=geo.attributes.position,n=geo.attributes.normal,c=geo.attributes.color;
    const color=new THREE.Color(),eps=.55,normal=new THREE.Vector3();
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),z=p.getZ(i),y=p.getY(i);
      const dx=ch.height(x+eps,z)-ch.height(x-eps,z),dz=ch.height(x,z+eps)-ch.height(x,z-eps);
      normal.set(-dx,2*eps,-dz).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
      ch.groundColor(color,x,y,z,1-normal.y);
      const patch=Math.sin(x*.14+Math.sin(z*.075))*Math.cos(z*.12)*.025;
      color.offsetHSL(-.006,-.035,patch);c.setXYZ(i,color.r,color.g,color.b);
    }
    n.needsUpdate=true;c.needsUpdate=true;
    // The world module clones this material and owns its later disposal.
    // Store a geometry tag so it can select smooth shading without touching MAT.vc.
    this.terrain.userData.storybookSmooth=true;
  };
  const oldLoad=Game.prototype.loadWorld;
  Game.prototype.loadWorld=function(...args) {
    const result=oldLoad.apply(this,args);
    if(this.ch===CH1 && this.terrain.userData.storybookSmooth) {
      this.terrain.material.flatShading=false;this.terrain.material.needsUpdate=true;
    }
    return result;
  };
}
