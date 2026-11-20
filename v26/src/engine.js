// Renderer wrapper: quality-driven setup, environment lighting, adaptive resolution.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Particles} from './particles.js';
import {Post, HEAT_FS, floatTargetsOK} from './post.js';

export class Engine {
  constructor(canvas, q) {
    this.q = q; this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({canvas, antialias: q.bloom ? false : q.aa, powerPreference: 'high-performance', alpha: false, stencil: false});
    this.r.setClearColor(0x02030a);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.fx = {px: .5, py: .5, mbx: 0, mby: 0, dash: 0, chroma: 0, hurt: 0, od: 0}; this.shocks = []; this.dtReal = .016;
    if (!q.bloom) {this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;}
    if (q.shadow) {this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;}
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(55, 1, .5, 2500);
    this.dpr = Math.min(devicePixelRatio || 1, q.dprMax);
    this.accum = 0; this.n = 0; this.minSlow = 0; this.slow = 0; this.fast = 0; this.targetMs = 1000 / 58; this.minDt = 1;
    // lights
    this.key = new THREE.DirectionalLight(0xfff2e0, 2.6); this.key.position.set(-30, 60, 25); this.scene.add(this.key); this.scene.add(this.key.target);
    if (q.lights > 1) {this.rim = new THREE.DirectionalLight(0x4aa8ff, 1.6); this.rim.position.set(35, 20, -45); this.scene.add(this.rim);}
    this.scene.add(new THREE.HemisphereLight(0x6a8cff, 0x201030, q.env ? .35 : 1.1));
    if (q.shadow) {
      const s = this.key.shadow; this.key.castShadow = true; s.mapSize.set(q.shadow, q.shadow);
      const c = s.camera; c.left = -28; c.right = 28; c.top = 28; c.bottom = -28; c.near = 5; c.far = 160; s.bias = -.0005;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({opacity: .45}));
      sh.rotation.x = -Math.PI / 2; sh.position.y = -5.9; sh.receiveShadow = true; this.shadowFloor = sh; this.scene.add(sh);
    }
    if (q.env) {
      const pm = new THREE.PMREMGenerator(this.r);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; this.scene.environmentIntensity = .9; pm.dispose();
    }
    this.particles = new Particles(this.scene, q.parts);
    if (q.bloom) {
      this.post = new Post(this);
      if (q.heat && this.post.heatRT) {this.heatScene = new THREE.Scene(); this.heat = new Particles(this.heatScene, Math.min(4000, q.parts >> 2), {fs: HEAT_FS}); this.heat.mat.blending = THREE.CustomBlending; this.heat.mat.blendSrc = THREE.OneFactor; this.heat.mat.blendDst = THREE.OneFactor; this.heat.mat.blendEquation = THREE.AddEquation;}
    }
    this.resize();
    this._rs = () => this.resize(); addEventListener('resize', this._rs); addEventListener('orientationchange', this._rs);
  }
  setScale(d) {this.dpr = THREE.MathUtils.clamp(d, this.q.dprMin, Math.min(devicePixelRatio || 1, this.q.dprMax)); this.resize();}
  resize() {
    const w = innerWidth, h = innerHeight; this.W = w; this.H = h;
    this.r.setPixelRatio(this.dpr); this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.cam.aspect = w / h;
    // keep a decent horizontal field of view in portrait
    const a = w / h, base = 55 * Math.PI / 360;
    this.cam.fov = a >= 1 ? 55 : Math.min(88, 2 * Math.atan(Math.tan(base) / a * 1.08) * 180 / Math.PI);
    this.cam.updateProjectionMatrix();
    this.post && this.post.resize();
    this.px = this.r.domElement.height / (2 * Math.tan(this.cam.fov * Math.PI / 360));
  }
  /** call each frame with real dt (s) -> adaptive resolution so low/mid phones hold frame rate */
  adapt(dt) {
    this.dtReal = dt;
    this.minDt = Math.min(this.minDt, dt);
    this.accum += dt; this.n++;
    if (this.n >= 45) {
      const ms = this.accum / this.n * 1000; this.accum = 0; this.n = 0;
      const tgt = Math.max(1000 / 125, Math.min(this.targetMs, this.minDt * 1000 * 1.45 + 2));
      if (ms > tgt * 1.18) {this.fast = 0; if (++this.slow >= 1) {this.slow = 0; if (this.dpr > this.q.dprMin + .01) this.setScale(this.dpr - .15); else if (this.auto && this.post && ++this.minSlow >= 3) {this.minSlow = 0; this.degrade();}}}
      else if (ms < tgt * .8) {this.slow = 0; this.minSlow = 0; if (++this.fast >= 5) {this.fast = 0; if (this.dpr < Math.min(devicePixelRatio || 1, this.q.dprMax) - .01) this.setScale(this.dpr + .1);}}
      else {this.slow = 0; this.fast = 0;}
      this.lastMs = ms;
    }
  }
  /** auto-quality only: shed post effects step by step when the device can't keep up even at minimum resolution */
  degrade() {
    this.deg = (this.deg || 0) + 1;
    if (this.deg === 1) {if (this.heat) {this.heat.points.visible = false; this.heat = null;} this.post && (this.post.noMB = true);}
    else if (this.post && !this.bypass) {this.bypass = true; this.r.autoClear = true; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05; this.r.setRenderTarget(null); this.setScale(this.q.dprMin);}
    this.onDegrade && this.onDegrade(this.deg);
  }
  addShock(x, z, R, s = 1, life = 1) {if (this.post && !this.bypass) {if (this.shocks.length >= 4) this.shocks.shift(); this.shocks.push({x, z, R, s, life, age: 0});}}
  render(t) {
    this.particles.update(t, this.px);
    if (this.post && !this.bypass) {this.post.render(t); return;}
    this.r.render(this.scene, this.cam);
  }
  dispose() {
    removeEventListener('resize', this._rs); removeEventListener('orientationchange', this._rs);
    this.post && this.post.dispose(); this.heat && this.heat.dispose();
    this.particles.dispose(); this.scene.environment && this.scene.environment.dispose(); this.r.dispose();
  }
}
