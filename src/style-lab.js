/** Executable visual experiments, explicitly gated behind ?review=...&style=....
 * No asset replacement, story changes or gameplay camera modifications.
 */
export const STYLE_PRESETS = [
 {id:'01',name:'따뜻한 원화풍',kind:'현재 기준',note:'현재 조형과 재질을 유지하는 비교 기준.'},
 {id:'02',name:'플랫 셀 셰이딩',kind:'광원 표현',note:'실제 3단계 툰 재질. 모델과 표정은 동일.'},
 {id:'03',name:'잉크 윤곽선',kind:'툰 + 후처리',note:'셀 셰이딩에 깊이·색 경계 윤곽선을 추가.'},
 {id:'04',name:'파스텔 클레이',kind:'재질',note:'저채도 무광 점토 표면. 새로운 점토 모델은 아님.'},
 {id:'05',name:'목각 질감',kind:'재질 셰이더',note:'실제 모델 위에 절차적 나뭇결과 갈색 명암 적용.'},
 {id:'06',name:'픽셀 3D',kind:'저해상도 렌더',note:'가로·세로 1/4 해상도로 렌더하고 최근접 확대. 2D 픽셀 원화는 아님.'},
 {id:'07',name:'종이 재질 3D',kind:'재질 + 후처리',note:'밝은 종이색과 섬유 질감, 옅은 윤곽선. 종이 절개 모델은 아님.'},
 {id:'08',name:'각면 조형',kind:'표면 법선',note:'면 단위 명암을 강조. 실제 폴리곤 수는 줄이지 않음.'},
 {id:'09',name:'등각 컷어웨이',kind:'리뷰 카메라',note:'직교 투영과 높은 시점, 실내 상부 절단. 게임 전체 카메라로의 채택은 별도 검증 필요.'},
 {id:'10',name:'동판화 잉크',kind:'후처리',note:'단색 명암·교차 해칭·윤곽선을 실제 렌더에 적용.'}
];

function stylizeMaterial(THREE,source,id,gradient){
 if(source.isShaderMaterial || source.isRawShaderMaterial)return source;
 let mat;
 if(id==='02'||id==='03'){
  const options={gradientMap:gradient};
  for(const k of ['color','map','alphaMap','transparent','opacity','side','vertexColors','alphaTest','depthWrite','depthTest','fog','emissive','emissiveIntensity','emissiveMap','polygonOffset','polygonOffsetFactor','polygonOffsetUnits'])if(source[k]!==undefined)options[k]=source[k]?.isColor?source[k].clone():source[k];
  mat=new THREE.MeshToonMaterial(options);
 }else mat=source.clone();
 mat.onBeforeCompile=source.onBeforeCompile;
 const originalKey=source.customProgramCacheKey?.call(source)||'';
 if(['04','05','07','08'].includes(id)){
  if('roughness' in mat)mat.roughness=1;
  if('metalness' in mat)mat.metalness=0;
  mat.flatShading=id==='07'||id==='08';
  const previous=mat.onBeforeCompile;
  mat.onBeforeCompile=function(shader,renderer){
   previous?.call(this,shader,renderer);
   // Legacy grass forces a smooth normal; that varying is absent in flat shaders.
   if(this.flatShading)shader.fragmentShader=shader.fragmentShader.replaceAll('normal = normalize(vNormal);','#ifndef FLAT_SHADED\nnormal = normalize(vNormal);\n#endif');
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLabPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLabPosition=position;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLabPosition;');
   const code=id==='04'?`float l=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(l),.53); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.62,.48),.20);`
    :id==='05'?`float l=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)); float labWave=vLabPosition.y*48.0+sin(vLabPosition.x*4.0+vLabPosition.z*3.0)*2.7; float labAA=1.0-smoothstep(.4,3.0,fwidth(labWave)); float labGrain=1.0+.12*sin(labWave)*labAA; diffuseColor.rgb=mix(vec3(.055,.021,.008),vec3(.64,.36,.13),sqrt(clamp(l,0.0,1.0)))*labGrain;`
    :id==='07'?`float l=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(l*.95,l*.91,l*.82),.40); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.78,.64),.13);`
    :`diffuseColor.rgb*=vec3(1.02,.98,.91);`;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+code);
  };
 }
 mat.customProgramCacheKey=()=>`style-lab-${id}-${originalKey}`;
 mat.needsUpdate=true;return mat;
}

function installPost(THREE,game,id,ortho){
 const r=game.renderer,render=r.render.bind(r),pixel=id==='06',size=new THREE.Vector2();
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:pixel?THREE.NearestFilter:THREE.LinearFilter,magFilter:pixel?THREE.NearestFilter:THREE.LinearFilter,depthBuffer:true});
 target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
 const uniforms={image:{value:target.texture},depthImage:{value:target.depthTexture},resolution:{value:new THREE.Vector2()},nearFar:{value:new THREE.Vector2()},isOrtho:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:`
#define STYLE_MODE ${Number(id)}
uniform sampler2D image;uniform sampler2D depthImage;uniform vec2 resolution;uniform vec2 nearFar;uniform float isOrtho;varying vec2 vUv;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float linearDepth(vec2 uv){float d=texture2D(depthImage,uv).x;return isOrtho>.5?mix(nearFar.x,nearFar.y,d):(nearFar.x*nearFar.y)/(nearFar.y-d*(nearFar.y-nearFar.x));}
void main(){
 gl_FragColor=texture2D(image,vUv);
 #include <tonemapping_fragment>
 vec3 c=gl_FragColor.rgb;
 #if STYLE_MODE == 3 || STYLE_MODE == 7 || STYLE_MODE == 10
 vec2 px=1.0/resolution;float z=linearDepth(vUv);float dz=0.0;float dc=0.0;float l0=lum(texture2D(image,vUv).rgb);
 for(int j=0;j<4;j++){vec2 off=j==0?vec2(px.x,0.0):j==1?vec2(-px.x,0.0):j==2?vec2(0.0,px.y):vec2(0.0,-px.y);dz=max(dz,abs(linearDepth(vUv+off)-z)/max(z,.1));dc=max(dc,abs(lum(texture2D(image,vUv+off).rgb)-l0));}
 float edge=max(smoothstep(.009,.04,dz),smoothstep(.22,.60,dc));
 #endif
 #if STYLE_MODE == 3
 c=mix(c,vec3(.018,.024,.025),edge*.85);
 #elif STYLE_MODE == 5
 float l=lum(c);c=mix(c,vec3(l*1.10,l*.83,l*.53),.22);
 #elif STYLE_MODE == 6
 vec3 labSRGB=pow(max(c,vec3(0.0)),vec3(1.0/2.2));labSRGB=floor(labSRGB*15.0+.5)/15.0;c=pow(labSRGB,vec3(2.2));
 #elif STYLE_MODE == 7
 float paper=hash(floor(vUv*resolution));c*=.965+.065*paper;c=mix(c,vec3(.15,.12,.09),edge*.27);
 #elif STYLE_MODE == 10
 float l=clamp(sqrt(max(0.0,lum(c)))*1.2,0.0,1.0);vec2 q=vUv*resolution;
 float h1=smoothstep(.91,.99,abs(sin((q.x+q.y)*.45)));
 float h2=smoothstep(.92,.99,abs(sin((q.x-q.y)*.49)));
 float tone=.96-(1.0-l)*.45-h1*(1.0-smoothstep(.18,.72,l))*.35-h2*(1.0-smoothstep(.08,.38,l))*.24;
 c=vec3(1.0,.91,.73)*clamp(tone-edge*.57,.035,1.0);
 #endif
 gl_FragColor=vec4(c,1.0);
 #include <colorspace_fragment>
}`});
 const postScene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;postScene.add(quad);const postCamera=new THREE.Camera();
 r.render=function(scene,camera){
  if(scene!==game.scene)return render(scene,camera);
  r.getDrawingBufferSize(size);const w=Math.max(1,Math.floor(size.x/(pixel?4:1))),h=Math.max(1,Math.floor(size.y/(pixel?4:1)));
  if(target.width!==w||target.height!==h){target.setSize(w,h);uniforms.resolution.value.set(w,h);}
  const view=ortho||camera;
  if(ortho){const half=game.styleOrthoHeight/2;ortho.left=-half*camera.aspect;ortho.right=half*camera.aspect;ortho.top=half;ortho.bottom=-half;ortho.updateProjectionMatrix();}
  uniforms.nearFar.value.set(view.near,view.far);uniforms.isOrtho.value=ortho?1:0;
  const previous=r.getRenderTarget();r.setRenderTarget(target);render(scene,view);
  const calls=r.info.render.calls,triangles=r.info.render.triangles;
  r.setRenderTarget(previous);render(postScene,postCamera);
  game.styleRenderStats={calls:calls+r.info.render.calls,triangles:triangles+r.info.render.triangles,renderSize:[w,h],post:true};
 };
 game.styleDispose=()=>{r.render=render;target.dispose();target.depthTexture.dispose();quad.geometry.dispose();material.dispose();};
}

export function installStyleLab(THREE,game,id){
 if(!game.reviewReady)throw Error('Style lab is restricted to staged review scenes');
 const preset=STYLE_PRESETS.find(p=>p.id===id);if(!preset)throw Error(`Unknown style preset: ${id}`);
 const gradient=new THREE.DataTexture(new Uint8Array([75,165,255]),3,1,THREE.RedFormat);gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
 const cache=new Map();let meshes=0;
 if(['02','03','04','05','07','08'].includes(id))game.scene.traverse(object=>{
  if(!object.isMesh)return;meshes++;
  const convert=source=>{if(!cache.has(source))cache.set(source,stylizeMaterial(THREE,source,id,gradient));return cache.get(source);};
  object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
 });
 let ortho=null;
 if(id==='09'){
  const look=game.cineLook.clone(),distance=game.camera.position.distanceTo(look);
  game.styleOrthoHeight=2*distance*Math.tan(THREE.MathUtils.degToRad(game.camera.fov/2));
  ortho=new THREE.OrthographicCamera(-1,1,1,-1,game.camera.near,game.camera.far);
  if(['harp','mephibosheth','nathan','engedi'].includes(game.reviewChapter))game.renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),4.1)];
  ortho.position.copy(look).add(new THREE.Vector3(1,.92,1).normalize().multiplyScalar(distance));ortho.lookAt(look);
 }
 if(['03','05','06','07','09','10'].includes(id))installPost(THREE,game,id,ortho);
 const bar=document.getElementById('art-review');
 if(bar){const select=document.createElement('select');select.setAttribute('aria-label','그래픽 스타일');select.style.cssText='font:inherit;background:#2a352b;color:white;padding:5px;border-radius:5px';
  for(const p of STYLE_PRESETS){const o=document.createElement('option');o.value=p.id;o.textContent=p.id+' · '+p.name;o.selected=p.id===id;select.append(o);}
  select.onchange=()=>{const url=new URL(location.href);url.searchParams.set('style',select.value);location.href=url.href;};bar.prepend(select);
  const link=document.createElement('a');link.href='./style-lab.html';link.textContent='10종 비교표';link.style.color='#ffe0a2';bar.append(link);
 }
 game.styleLab={id,preset,meshes,materials:cache.size,reviewOnly:true};game.styleReady=true;return game.styleLab;
}
