// Custom mobile-friendly post pipeline: HDR scene target -> mip-chain bloom -> composite
// (heat distortion, shockwave ripples, radial/directional motion blur, chroma, ACES, vignette).
import * as THREE from 'three';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const FS_PRE = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uT; uniform float uThr, uKnee;
vec3 tap(vec2 o){ return min(texture2D(tSrc, vUv + o * uT).rgb, vec3(24.)); }
void main(){
  vec3 c = (tap(vec2(-1.,-1.)) + tap(vec2(1.,-1.)) + tap(vec2(-1.,1.)) + tap(vec2(1.,1.))) * .25;
  float br = max(max(c.r, c.g), c.b); float s = clamp(br - uThr + uKnee, 0., 2. * uKnee); s = s * s / (4. * uKnee + 1e-4);
  gl_FragColor = vec4(c * (max(s, br - uThr) / max(br, 1e-4)), 1.); }`;
const FS_DOWN = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uT;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.;
  c += texture2D(tSrc, vUv + vec2(-1.,-1.) * uT).rgb + texture2D(tSrc, vUv + vec2(1.,-1.) * uT).rgb + texture2D(tSrc, vUv + vec2(-1.,1.) * uT).rgb + texture2D(tSrc, vUv + vec2(1.,1.) * uT).rgb;
  gl_FragColor = vec4(c * .125, 1.); }`;
const FS_UP = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uT; uniform float uK;
void main(){ vec3 c = texture2D(tSrc, vUv + vec2(-1.,0.) * uT).rgb + texture2D(tSrc, vUv + vec2(1.,0.) * uT).rgb + texture2D(tSrc, vUv + vec2(0.,-1.) * uT).rgb + texture2D(tSrc, vUv + vec2(0.,1.) * uT).rgb
    + 2. * (texture2D(tSrc, vUv + vec2(-.5,-.5) * uT).rgb + texture2D(tSrc, vUv + vec2(.5,-.5) * uT).rgb + texture2D(tSrc, vUv + vec2(-.5,.5) * uT).rgb + texture2D(tSrc, vUv + vec2(.5,.5) * uT).rgb);
  gl_FragColor = vec4(c / 12. * uK, 1.); }`;

const FS_COMP = `varying vec2 vUv;
uniform sampler2D tScene, tBloom, tHeat;
uniform vec2 uPlayer, uMBdir, uAspect;
uniform float uBloom, uDash, uChroma, uHurt, uOD, uTime, uHeatOn, uGrain, uExp;
uniform vec4 uSW[4]; uniform vec4 uSWp[4];
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if(uHeatOn > .5){ vec2 h = texture2D(tHeat, uv).rg; uv += h * .014 * (1. + .25 * sin(uTime * 40. + uv.y * 90.)); }
  for(int i = 0; i < 4; i++){
    if(uSWp[i].y > 0.){
      vec2 c = uSW[i].xy, r = uSW[i].zw, d = (uv - c) / r; float L = length(d) + 1e-4;
      float ring = exp(-pow((L - uSWp[i].x) / uSWp[i].z, 2.)) * (1. - uSWp[i].x) * uSWp[i].y;
      uv += (d / L) * r * ring * .06;
    }
  }
  vec2 dirR = uv - uPlayer;
  vec2 bv = dirR * uDash * .11 + uMBdir;
  vec3 col;
  if(dot(bv, bv) > 1e-8){
    col = vec3(0.);
    for(int i = 0; i < TAPS; i++){ float t = float(i) / float(TAPS - 1) - .5; col += texture2D(tScene, uv + bv * t).rgb; }
    col /= float(TAPS);
  } else col = texture2D(tScene, uv).rgb;
  if(uChroma > 1e-4){ col.r = texture2D(tScene, uv + dirR * uChroma).r; col.b = texture2D(tScene, uv - dirR * uChroma).b; }
  col += texture2D(tBloom, uv).rgb * uBloom * (1. + uOD * .6);
  float vg = length((vUv - .5) * vec2(1., 1.1));
  col = mix(col, col * vec3(.7, 1., 1.3) + vec3(0., .02, .05), uOD * .55);
  col += vec3(.55, .02, .04) * uHurt * smoothstep(.25, .8, vg);
  col = aces(col * uExp);
  col *= 1. - .38 * pow(vg, 2.3);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1. / 2.4)) - .055, step(.0031308, col));
  col += (hash(vUv * 900. + uTime) - .5) * uGrain;
  gl_FragColor = vec4(col, 1.); }`;

export const HEAT_FS = `varying vec4 vC; void main(){ vec2 p = gl_PointCoord - .5; float a = smoothstep(.5, 0., length(p)); vec2 d = normalize(p + 1e-4); gl_FragColor = vec4(d * a * vC.a, 0., a * vC.a); }`;

export function floatTargetsOK(r) {const e = r.extensions; return r.capabilities.isWebGL2 && (e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float'));}

export class Post {
  constructor(eng) {
    this.eng = eng; this.r = eng.r; this.q = eng.q;
    this.hdr = floatTargetsOK(this.r);
    this.type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.levels = [0, 3, 4, 5][this.q.bloom] || 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(geo, null); this.quad.frustumCulled = false;
    this.scn = new THREE.Scene(); this.scn.add(this.quad); this.cam = new THREE.Camera();
    const T = {tSrc: {value: null}, uT: {value: new THREE.Vector2()}};
    const mk = (fs, u, blend) => new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, blending: blend || THREE.NoBlending, defines: {}});
    this.mPre = mk(FS_PRE, {tSrc: {value: null}, uT: {value: new THREE.Vector2()}, uThr: {value: .85}, uKnee: {value: .6}});
    this.mDown = mk(FS_DOWN, {tSrc: {value: null}, uT: {value: new THREE.Vector2()}});
    this.mUp = new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS_UP, uniforms: {tSrc: {value: null}, uT: {value: new THREE.Vector2()}, uK: {value: 1}}, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor});
    this.sw = Array.from({length: 4}, () => new THREE.Vector4()); this.swp = Array.from({length: 4}, () => new THREE.Vector4());
    this.mComp = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS_COMP, depthTest: false, depthWrite: false, defines: {TAPS: this.q.mb || 5},
      uniforms: {tScene: {value: null}, tBloom: {value: null}, tHeat: {value: null}, uPlayer: {value: new THREE.Vector2(.5, .5)}, uMBdir: {value: new THREE.Vector2()}, uAspect: {value: new THREE.Vector2(1, 1)},
        uBloom: {value: [0, .5, .65, .8][this.q.bloom]}, uDash: {value: 0}, uChroma: {value: 0}, uHurt: {value: 0}, uOD: {value: 0}, uTime: {value: 0}, uHeatOn: {value: this.q.heat ? 1 : 0}, uGrain: {value: this.q.bloom >= 3 ? .018 : 0}, uExp: {value: 1.12},
        uSW: {value: this.sw}, uSWp: {value: this.swp}}
    });
    this.r.autoClear = false;
    this.rt = null; this.mips = []; this.heatRT = null; this.size = new THREE.Vector2();
    this.resize();
  }
  _rt(w, h, o = {}) {
    const t = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), Object.assign({type: this.type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false}, o));
    t.texture.colorSpace = THREE.NoColorSpace; return t;
  }
  resize() {
    this.r.getDrawingBufferSize(this.size); const w = this.size.x, h = this.size.y;
    this.rt && this.rt.dispose(); this.mips.forEach(m => m.dispose()); this.heatRT && this.heatRT.dispose();
    this.rt = this._rt(w, h, {depthBuffer: true, samples: this.q.aa ? 4 : 0});
    this.mips = []; for (let i = 0; i < this.levels; i++) this.mips.push(this._rt(w / 2 ** (i + 1), h / 2 ** (i + 1)));
    this.heatRT = this.q.heat && this.hdr ? this._rt(w / 2, h / 2) : null;
    this.mComp.uniforms.uHeatOn.value = this.heatRT ? 1 : 0;
  }
  pass(mat, target, clear = false) {this.quad.material = mat; this.r.setRenderTarget(target); if (clear) this.r.clear(); this.r.render(this.scn, this.cam);}
  render(t) {
    const e = this.eng, r = this.r, fx = e.fx;
    // scene -> HDR target
    r.setRenderTarget(this.rt); r.clear(); r.render(e.scene, e.cam);
    // heat map
    if (this.heatRT && e.heat) {e.heat.update(t, e.px * .5); r.setRenderTarget(this.heatRT); r.setClearColor(0x000000, 0); r.clear(); r.render(e.heatScene, e.cam); r.setClearColor(0x02030a, 1);}
    // bloom chain
    const L = this.mips.length;
    this.mPre.uniforms.tSrc.value = this.rt.texture; this.mPre.uniforms.uT.value.set(1 / this.rt.width, 1 / this.rt.height); this.pass(this.mPre, this.mips[0]);
    for (let i = 1; i < L; i++) {const s = this.mips[i - 1]; this.mDown.uniforms.tSrc.value = s.texture; this.mDown.uniforms.uT.value.set(1 / s.width, 1 / s.height); this.pass(this.mDown, this.mips[i]);}
    for (let i = L - 1; i > 0; i--) {const s = this.mips[i]; this.mUp.uniforms.tSrc.value = s.texture; this.mUp.uniforms.uT.value.set(1 / s.width, 1 / s.height); this.mUp.uniforms.uK.value = 1; this.pass(this.mUp, this.mips[i - 1]);}
    // shockwaves -> uniforms
    const cam = e.cam, v = this._v || (this._v = new THREE.Vector3()), v2 = this._v2 || (this._v2 = new THREE.Vector3());
    let n = 0; for (let i = e.shocks.length - 1; i >= 0; i--) {const s = e.shocks[i]; s.age += e.dtReal / s.life; if (s.age >= 1) e.shocks.splice(i, 1);}
    for (const s of e.shocks) {
      if (n >= 4) break;
      v.set(s.x, -4.5, s.z).project(cam); if (v.z > 1) continue;
      v2.set(s.x + s.R, -4.5, s.z).project(cam); const rx = Math.abs(v2.x - v.x) * .5; v2.set(s.x, -4.5, s.z - s.R).project(cam); const ry = Math.abs(v2.y - v.y) * .5;
      this.sw[n].set(v.x * .5 + .5, v.y * .5 + .5, Math.max(rx, .01), Math.max(ry, .01)); this.swp[n].set(1 - (1 - s.age) ** 2.2, s.s, .16 + s.age * .1, 0); n++;
    }
    for (; n < 4; n++) this.swp[n].set(0, 0, 1, 0);
    const u = this.mComp.uniforms; u.tScene.value = this.rt.texture; u.tBloom.value = this.mips[0].texture; u.tHeat.value = this.heatRT ? this.heatRT.texture : null; u.uHeatOn.value = this.heatRT && e.heat ? 1 : 0;
    u.uTime.value = t % 100; u.uPlayer.value.set(fx.px, fx.py); u.uMBdir.value.set(this.noMB ? 0 : fx.mbx, this.noMB ? 0 : fx.mby); u.uDash.value = this.noMB ? 0 : fx.dash; u.uChroma.value = fx.chroma * (this.q.bloom >= 2 ? 1 : 0); u.uHurt.value = fx.hurt; u.uOD.value = fx.od;
    this.pass(this.mComp, null);
  }
  dispose() {
    this.rt.dispose(); this.mips.forEach(m => m.dispose()); this.heatRT && this.heatRT.dispose();
    [this.mPre, this.mDown, this.mUp, this.mComp].forEach(m => m.dispose()); this.quad.geometry.dispose();
  }
}
