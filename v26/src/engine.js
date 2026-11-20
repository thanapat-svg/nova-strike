// Renderer wrapper: quality-driven setup, environment lighting, adaptive resolution.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Particles} from './particles.js';

export class Engine {
  constructor(canvas, q) {
    this.q = q; this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({canvas, antialias: q.aa, powerPreference: 'high-performance', alpha: false, stencil: false});
    this.r.setClearColor(0x02030a);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    if (q.shadow) {this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;}
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(55, 1, .5, 2500);
    this.dpr = Math.min(devicePixelRatio || 1, q.dprMax);
    this.accum = 0; this.n = 0; this.slow = 0; this.fast = 0; this.targetMs = 1000 / 58; this.minDt = 1;
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
    this.px = this.r.domElement.height / (2 * Math.tan(this.cam.fov * Math.PI / 360));
  }
  /** call each frame with real dt (s) -> adaptive resolution so low/mid phones hold frame rate */
  adapt(dt) {
    this.minDt = Math.min(this.minDt, dt);
    this.accum += dt; this.n++;
    if (this.n >= 45) {
      const ms = this.accum / this.n * 1000; this.accum = 0; this.n = 0;
      const tgt = Math.max(1000 / 125, Math.min(this.targetMs, this.minDt * 1000 * 1.45 + 2));
      if (ms > tgt * 1.18) {this.fast = 0; if (++this.slow >= 1) {this.slow = 0; if (this.dpr > this.q.dprMin + .01) this.setScale(this.dpr - .15);}}
      else if (ms < tgt * .8) {this.slow = 0; if (++this.fast >= 5) {this.fast = 0; if (this.dpr < Math.min(devicePixelRatio || 1, this.q.dprMax) - .01) this.setScale(this.dpr + .1);}}
      else {this.slow = 0; this.fast = 0;}
      this.lastMs = ms;
    }
  }
  render(t) {
    this.particles.update(t, this.px);
    this.r.render(this.scene, this.cam);
  }
  dispose() {
    removeEventListener('resize', this._rs); removeEventListener('orientationchange', this._rs);
    this.particles.dispose(); this.scene.environment && this.scene.environment.dispose(); this.r.dispose();
  }
}
