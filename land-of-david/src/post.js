// HD-2D post stack: HDR scene -> tilt-shift depth of field + two-level bloom + grade.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `
uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold + 0.8, l); gl_FragColor = vec4(c * k, 1.0); }`;

const BLUR = `
uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  s += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0); }`;

const COMPOSITE = `
uniform sampler2D tScene, tBlur, tBloomA, tBloomB;
uniform float focusY, focusW, bloom, exposure, time, vignette, warmth, saturation, dof;
uniform vec2 res;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  float d = abs(vUv.y - focusY);
  float m = smoothstep(focusW, focusW + 0.34, d) * dof;
  // stronger blur toward the top (far) than the bottom (near), like a tilted lens
  m *= mix(1.0, 0.8, step(vUv.y, focusY));
  vec3 sharp = texture2D(tScene, vUv).rgb;
  vec3 blurred = texture2D(tBlur, vUv).rgb;
  vec3 col = mix(sharp, blurred, m);
  col += (texture2D(tBloomA, vUv).rgb * 0.55 + texture2D(tBloomB, vUv).rgb * 0.9) * bloom;
  col *= exposure;
  col = aces(col);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.92), warmth);
  // lift shadows slightly toward warm haze
  col = col + (1.0 - col) * vec3(0.018, 0.014, 0.006);
  vec2 q = vUv - 0.5; q.x *= res.x / res.y;
  col *= 1.0 - vignette * smoothstep(0.35, 1.05, length(q));
  col = toSRGB(col);
  col += (hash(vUv * res + time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostStack {
  constructor(renderer, { msaa = 4 } = {}) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: msaa };
    this.scene = new THREE.WebGLRenderTarget(4, 4, opts);
    const small = { type: THREE.HalfFloatType, depthBuffer: false };
    this.half1 = new THREE.WebGLRenderTarget(4, 4, small);
    this.half2 = new THREE.WebGLRenderTarget(4, 4, small);
    this.bA1 = new THREE.WebGLRenderTarget(4, 4, small);
    this.bA2 = new THREE.WebGLRenderTarget(4, 4, small);
    this.bB1 = new THREE.WebGLRenderTarget(4, 4, small);
    this.bB2 = new THREE.WebGLRenderTarget(4, 4, small);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mat(BRIGHT, { tDiffuse: { value: null }, threshold: { value: 1.0 } });
    this.mBlur = mat(BLUR, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mCopy = mat(`uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`, { tDiffuse: { value: null } });
    this.mComp = mat(COMPOSITE, {
      tScene: { value: null }, tBlur: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      focusY: { value: 0.5 }, focusW: { value: 0.09 }, bloom: { value: 0.6 }, exposure: { value: 1.0 }, time: { value: 0 },
      vignette: { value: 0.35 }, warmth: { value: 0.6 }, saturation: { value: 1.08 }, dof: { value: 1.0 }, res: { value: new THREE.Vector2(1, 1) },
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.half1.setSize(hw, hh); this.half2.setSize(hw, hh);
    this.bA1.setSize(hw >> 1, hh >> 1); this.bA2.setSize(hw >> 1, hh >> 1);
    this.bB1.setSize(hw >> 3, hh >> 3); this.bB2.setSize(hw >> 3, hh >> 3);
    this.mComp.uniforms.res.value.set(w, h);
  }
  pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.fsScene, this.cam); }
  blur(src, tmp, dst, radius) {
    const w = src.width, h = src.height;
    this.mBlur.uniforms.tDiffuse.value = src.texture; this.mBlur.uniforms.dir.value.set(radius / w, 0); this.pass(this.mBlur, tmp);
    this.mBlur.uniforms.tDiffuse.value = tmp.texture; this.mBlur.uniforms.dir.value.set(0, radius / h); this.pass(this.mBlur, dst);
  }
  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.scene); r.render(scene, camera);
    // depth-of-field blur at half res (two passes for a wide, soft kernel)
    this.mCopy.uniforms.tDiffuse.value = this.scene.texture; this.pass(this.mCopy, this.half1);
    this.blur(this.half1, this.half2, this.half1, 1.6);
    this.blur(this.half1, this.half2, this.half1, 2.6);
    // bloom
    this.mBright.uniforms.tDiffuse.value = this.scene.texture; this.pass(this.mBright, this.bA1);
    this.blur(this.bA1, this.bA2, this.bA1, 1.5);
    this.mCopy.uniforms.tDiffuse.value = this.bA1.texture; this.pass(this.mCopy, this.bB1);
    this.blur(this.bB1, this.bB2, this.bB1, 1.5);
    this.blur(this.bB1, this.bB2, this.bB1, 2.5);
    const u = this.mComp.uniforms;
    u.tScene.value = this.scene.texture; u.tBlur.value = this.half1.texture; u.tBloomA.value = this.bA1.texture; u.tBloomB.value = this.bB1.texture; u.time.value = time;
    this.pass(this.mComp, null);
  }
}
