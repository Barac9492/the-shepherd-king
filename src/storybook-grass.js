/** Curved grass ribbons and authored near-field beds. Original terrain/gameplay untouched. */
export function installStorybookGrass({THREE,Game,CH1,IS_TOUCH,rng,scatter,swayMat}) {
  const old=Game.prototype.buildGrass;
  Game.prototype.buildGrass=function(ch) {
    if(ch!==CH1)return old.call(this,ch);
    const r=rng(9601),positions=[],colors=[],normals=[];
    const root=new THREE.Color(0x667747),tip=new THREE.Color(0xb9bd79);
    // Four tapered bent leaves, two segments each. No alpha cards or texture overdraw.
    for(let b=0;b<4;b++) {
      const a=b*2.4,dx=Math.cos(a),dz=Math.sin(a),h=.35+b*.075,w=.04+b*.008,lean=.12+b*.035;
      const rows=[0,.52,1].map(t=>({x:dx*lean*t*t,y:h*t,z:dz*lean*t*t,w:w*(1-t)}));
      const v=(row,side)=>[row.x-dz*row.w*side,row.y,row.z+dx*row.w*side];
      for(let k=0;k<2;k++)for(const [row,side] of [[k,-1],[k,1],[k+1,-1],[k,1],[k+1,1],[k+1,-1]]){
        positions.push(...v(rows[row],side));const c=root.clone().lerp(tip,row/2);colors.push(c.r,c.g,c.b);normals.push(0,1,0);
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.computeBoundingSphere();
    const list=[],count=IS_TOUCH?6200:14000;
    for(let tries=0;list.length<count&&tries<count*12;tries++) {
      let x,z;const zone=r();
      if(zone<.52){const a=r()*Math.PI*2,rad=7.6+Math.sqrt(r())*16;x=Math.cos(a)*rad;z=-8+Math.sin(a)*rad;}
      else if(zone<.78){z=-2+r()*46;const center=z<20?z*3/20:(z-20)*3/24+3;x=center+(r()>.5?1:-1)*(2.4+r()*4.4);}
      else{x=(r()-.5)*210;z=(r()-.5)*210;}
      const density=ch.grass(x,z);if(density<=0||r()>density)continue;
      list.push({x,y:this.groundAt(x,z)-.035,z,ry:r()*Math.PI*2,s:.65+r()*.75,sy:.65+r()*.65});
    }
    const material=swayMat(new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),.18);
    const previous=material.onBeforeCompile;material.onBeforeCompile=shader=>{previous(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal = normalize(vNormal);');};
    const grass=scatter(geo,list,{mat:material,cast:false,receive:true});grass.name='storybook-grass-beds';this.root.add(grass);
    this.storybookGrassMaterial=material;
  };
  const clear=Game.prototype.clearChapter;
  Game.prototype.clearChapter=function(...args){if(this.storybookGrassMaterial){this.storybookGrassMaterial.dispose();this.storybookGrassMaterial=null;}return clear.apply(this,args);};
}
