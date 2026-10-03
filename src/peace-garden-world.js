// The garden owns its terrain and animals; no historical chapter is built or run.
export function createGardenWorld({ THREE, CH1 }) {
  return {
    id: 1125, size: 170, seg: 90, start: [0, 11, Math.PI],
    title: { ko:'평화의 동산', en:'Garden of Peace' }, ref: { ko:'이사야 11:6–9 · 65:25', en:'Isaiah 11:6–9 · 65:25' },
    env: { ...CH1.env, fogNear: 48, fogFar: 130, hemiInt: .8 },
    height(x,z) { const r = Math.hypot(x,z); return r < 27 ? 0 : Math.sin(x*.08)*Math.cos(z*.07)*Math.min(8,(r-27)*.18); },
    groundColor(c,x,y,z) { const r = Math.hypot(x,z); c.set(Math.abs(r-12)<1.25 || (Math.abs(x)<1.5 && z>5 && z<26) ? 0xc7b887 : 0x879258); c.offsetHSL(0,0,Math.sin(x*.21)*Math.cos(z*.19)*.035); },
    bound(x,z) { const r=Math.hypot(x,z); return r>24 ? [x*24/r,z*24/r] : [x,z]; },
    // Instanced existing art keeps the garden light on phones.
    build(g) {
      const instanced=[];const trees=[]; for(let i=0;i<18;i++){ const a=i*Math.PI*2/18, r=29+(i%3)*4; trees.push({x:Math.sin(a)*r,z:Math.cos(a)*r,y:0,s:.7+(i%4)*.1,ry:a}); }
      instanced.push(g.place('olive',trees));
      instanced.push(g.place('olive',[{x:-7,z:-3,y:0,s:1.15}],{collide:.65}));
      instanced.push(g.place('rock',[{x:6,z:-5,y:-.15,s:1.8},{x:8.5,z:-5,y:-.1,s:1.2}],{collide:.9}));
      const grass=[],flowers=[];
      for(let i=0;i<1500;i++){ const a=i*2.399963,r=3+Math.sqrt(i/1500)*35,x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.abs(r-12)<2 || (Math.abs(x)<4&&z>2&&z<16))continue;grass.push({x,y:g.groundAt(x,z),z,s:.45,ry:a,tint:i%2?0xaab571:0x89994c}); }
      instanced.push(g.place('grass',grass,{cast:false}));
      // Small flower patches, one instanced mesh, no image downloads.
      const geo=new THREE.IcosahedronGeometry(.10,0),mat=new THREE.MeshLambertMaterial({color:0xf6dfa7});
      for(let i=0;i<90;i++){const a=i*2.4,r=15+(i%6)*.6;flowers.push([Math.sin(a)*r,Math.cos(a)*r]);}
      const mesh=new THREE.InstancedMesh(geo,mat,flowers.length), matrix=new THREE.Matrix4();
      flowers.forEach(([x,z],i)=>{matrix.makeTranslation(x,.15,z);mesh.setMatrixAt(i,matrix);});g.add(mesh);
      return { materials:[mat], instanced:[...instanced,mesh] };
    }
  };
}

// A small, soft-faced wolf in the same low-poly palette as the existing lion.
export function makeGardenWolf(THREE) {
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const mats=[0x8e9697,0xd6d7cc,0x303a3a].map(color=>new THREE.MeshLambertMaterial({color,flatShading:true}));
  const part=(geo,x,y,z,sx,sy,sz,mat=0,parent=body)=>{const m=new THREE.Mesh(geo,mats[mat]);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;};
  part(new THREE.IcosahedronGeometry(1,1),0,.8,0,.34,.36,.65);
  part(new THREE.IcosahedronGeometry(1,1),0,1.05,.52,.29,.31,.33);
  part(new THREE.IcosahedronGeometry(1,0),0,.98,.8,.16,.14,.28,1);
  part(new THREE.IcosahedronGeometry(1,0),0,1.01,1.03,.065,.055,.045,2);
  for(const x of [-.18,.18]){part(new THREE.ConeGeometry(.14,.32,4),x,1.37,.5,1,1,.65);part(new THREE.SphereGeometry(.035,5,4),x*.82,1.13,.77,1,1,1,2);}
  const tail=part(new THREE.ConeGeometry(.17,.8,5),0,.7,-.87,1,1,1);tail.rotation.x=-.8;
  const legs=[];for(const x of [-.21,.21])for(const z of [-.4,.4]){const pivot=new THREE.Group();pivot.position.set(x,.6,z);body.add(pivot);part(new THREE.CylinderGeometry(.07,.055,.6,5),0,-.3,0,1,1,1,0,pivot);legs.push(pivot);}
  let phase=0;return{root,body,materials:mats,graze:0,update(dt,speed){phase+=dt*(2+speed*3);const swing=Math.sin(phase)*Math.min(.5,speed*.18);legs.forEach((leg,i)=>leg.rotation.x=(i===0||i===3?1:-1)*swing);tail.rotation.z=Math.sin(phase)*.15;body.rotation.x=this.graze*.16;}};
}
