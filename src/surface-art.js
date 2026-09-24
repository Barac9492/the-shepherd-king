/** Quiet world-space material detail. No textures, lights, meshes or per-frame allocations. */
export function decoratePalaceSurface(material,kind){
  const previous=material.onBeforeCompile;
  const mode={floor:0,wall:1,linen:2,stone:3}[kind];
  if(mode==null)throw new Error(`Unknown palace surface: ${kind}`);
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
varying vec3 vCraftPosition;
varying vec3 vCraftNormal;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vCraftPosition=(modelMatrix*vec4(position,1.0)).xyz;
vCraftNormal=normalize(mat3(modelMatrix)*normal);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vCraftPosition;
varying vec3 vCraftNormal;
float craftHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}
float craftNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(craftHash(i),craftHash(i+vec3(1,0,0)),f.x),mix(craftHash(i+vec3(0,1,0)),craftHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(craftHash(i+vec3(0,0,1)),craftHash(i+vec3(1,0,1)),f.x),mix(craftHash(i+vec3(0,1,1)),craftHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`);
    let treatment;
    if(kind==='linen')treatment=`
float linenMask=1.0;
#ifdef USE_COLOR
linenMask=smoothstep(.42,.64,dot(vColor.rgb,vec3(.3333)));
#endif
vec2 weaveCoord=vCraftPosition.xz*150.0;
float weaveAA=1.0-smoothstep(.3,1.2,max(fwidth(weaveCoord.x),fwidth(weaveCoord.y)));
float weave=sin(weaveCoord.x)*sin(weaveCoord.y)*weaveAA;
float clothShade=1.0+.028*weave+.035*(craftNoise(vCraftPosition*3.0)-.5);
diffuseColor.rgb*=mix(1.0,clothShade,linenMask);`;
    else treatment=`
float largeGrain=craftNoise(vCraftPosition*2.8);
float smallGrain=craftNoise(vCraftPosition*24.0);
float grainAA=1.0-smoothstep(.04,.16,length(fwidth(vCraftPosition)));
float mineral=1.0+.075*(largeGrain-.5)+.035*(smallGrain-.5)*grainAA;
${kind==='wall'?`vec3 an=abs(vCraftNormal);
vec2 course=vec2(an.z>an.x?vCraftPosition.x:vCraftPosition.z,vCraftPosition.y)/vec2(1.8,.72);
course.x+=mod(floor(course.y),2.0)*.5;
vec2 edge=min(fract(course),1.0-fract(course));
vec2 aa=max(fwidth(course),vec2(.0001));
float seam=1.0-min(smoothstep(.005,.005+aa.x*1.5,edge.x),smoothstep(.009,.009+aa.y*1.5,edge.y));
mineral*=1.0-.055*seam*(1.0-smoothstep(.25,.7,an.y));`:''}
diffuseColor.rgb*=mineral;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${treatment}`);
  };
  material.customProgramCacheKey=()=>`palace-crafted-surface-${mode}-v1`;
  material.userData.craftedSurface=kind;
  material.needsUpdate=true;
  return material;
}
