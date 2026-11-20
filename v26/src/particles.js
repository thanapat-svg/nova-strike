// Stateless GPU particle system: the vertex shader integrates position from spawn data,
// so the CPU only writes a record once per particle (ring buffer, partial uploads).
import * as THREE from 'three';

const VS = `
attribute vec3 aVel; attribute vec4 aSpawn; attribute vec4 aCol;
uniform float uTime, uPx;
varying vec4 vC;
void main(){
  float age = uTime - aSpawn.x, k = age / aSpawn.y;
  if(k < 0. || k > 1.){ gl_Position = vec4(2.,2.,2.,1.); gl_PointSize = 0.; vC = vec4(0.); return; }
  float d = aCol.w;                     // drag
  float travel = d > .001 ? (1. - exp(-d * age)) / d : age;
  vec3 p = position + aVel * travel;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float fade = 1. - k;
  vC = vec4(aCol.rgb * (.5 + 1.1 * fade * fade), min(1., k * 14.) * fade);
  gl_PointSize = clamp(aSpawn.z * uPx * (1. - .55 * k) / max(.5, -mv.z), 0., 160.);
}`;
const FS = `
varying vec4 vC;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float a = smoothstep(1., 0., d);
  gl_FragColor = vec4(vC.rgb, vC.a * a * a);
  if(gl_FragColor.a < .004) discard;
}`;

export class Particles {
  constructor(scene, max, opts = {}) {
    this.max = max; this.i = 0; this.t = 0; this.dirty0 = -1; this.dirty1 = -1; this.wrapped = false;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.spn = new Float32Array(max * 4); this.col = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) this.spn[i * 4] = -1e6; // never alive
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aVel = new THREE.BufferAttribute(this.vel, 3);
    this.aSpn = new THREE.BufferAttribute(this.spn, 4); this.aCol = new THREE.BufferAttribute(this.col, 4);
    for (const a of [this.aPos, this.aVel, this.aSpn, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aVel', this.aVel); g.setAttribute('aSpawn', this.aSpn); g.setAttribute('aCol', this.aCol);
    this.uni = {uTime: {value: 0}, uPx: {value: 900}};
    this.mat = new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: opts.fs || FS, uniforms: this.uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 10;
    scene.add(this.points);
    this.live = 0;
  }
  /** spawn(x,y,z, vx,vy,vz, life, size, r,g,b, drag) */
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, drag = 0) {
    const i = this.i, o3 = i * 3, o4 = i * 4;
    this.pos[o3] = x; this.pos[o3 + 1] = y; this.pos[o3 + 2] = z;
    this.vel[o3] = vx; this.vel[o3 + 1] = vy; this.vel[o3 + 2] = vz;
    this.spn[o4] = this.t; this.spn[o4 + 1] = life; this.spn[o4 + 2] = size;
    this.col[o4] = r; this.col[o4 + 1] = g; this.col[o4 + 2] = b; this.col[o4 + 3] = drag;
    if (this.dirty0 < 0) this.dirty0 = i;
    this.dirty1 = i + 1;
    if (++this.i >= this.max) {this.i = 0; this.wrapped = true;}
  }
  /** radial burst of n particles */
  burst(x, y, z, n, speed, life, size, r, g, b, drag = 1.2) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.2832, s = Math.sqrt(1 - u * u), sp = speed * (.25 + Math.random() * .75);
      this.spawn(x, y, z, Math.cos(th) * s * sp, u * sp * .6, Math.sin(th) * s * sp, life * (.5 + Math.random() * .7), size * (.5 + Math.random()), r, g, b, drag);
    }
  }
  update(t, pxScale) {
    this.t = t; this.uni.uTime.value = t; this.uni.uPx.value = pxScale;
    const ups = [this.aPos, this.aVel, this.aSpn, this.aCol], strides = [3, 3, 4, 4];
    if (this.wrapped) { for (const a of ups) {a.clearUpdateRanges(); a.needsUpdate = true;} this.wrapped = false; this.dirty0 = -1; return; }
    if (this.dirty0 >= 0) {
      const n = this.dirty1 - this.dirty0;
      ups.forEach((a, k) => {a.clearUpdateRanges(); a.addUpdateRange(this.dirty0 * strides[k], n * strides[k]); a.needsUpdate = true;});
      this.dirty0 = -1;
    }
  }
  dispose() {this.points.geometry.dispose(); this.mat.dispose(); this.points.parent && this.points.parent.remove(this.points);}
}
