// 360° free-roam arena: player ship, enemy AI, weapons, debris physics, camera rig.
import * as THREE from 'three';
import {SHIPS, PLANETS, BCOLS, FLAMES} from './data.js';
import {buildShip} from './ships3d.js';
import * as World from './world.js';
import {spawnBoss, updateBoss, updateChunks, hitBoss, partPos, corePos, damagePart, damageCore} from './boss.js';
import {initAst, fillAst, updateAst, blast, spawnAst} from './asteroids.js';
import {MODS, MOUNT_OFF, shoot as modShoot, activeSyn, initModules, updateModules, arcStrike, openHole, bullet} from './modules.js';
import {Build, RiftRun} from './rift.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = THREE.MathUtils.clamp;
const angDiff = (a, b) => {let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d;};
const hexRGB = h => {const c = new THREE.Color(h); return [c.r, c.g, c.b];};

const ETYPES = {
  drone:  {hp: 3,  r: 1.5, spd: 15, col: 0xff4a5a, score: 10, coins: 1, w: 0, dmg: 10},
  dasher: {hp: 4,  r: 1.7, spd: 13, col: 0xffa23a, score: 20, coins: 2, w: 2, dmg: 16},
  gunner: {hp: 6,  r: 2.0, spd: 11, col: 0xb46cff, score: 30, coins: 3, w: 3, dmg: 10},
  brute:  {hp: 18, r: 3.1, spd: 7.5, col: 0x4aff9a, score: 60, coins: 6, w: 5, dmg: 22}
};
export class Arena {
  constructor(eng, save, input, ui) {
    this.eng = eng; this.q = eng.q; this.save = save; this.inp = input; this.ui = ui;
    this.scene = eng.scene; this.objs = []; this.state = 'idle';
  }
  add(o) {this.scene.add(o); this.objs.push(o); return o;}

  start(planetIdx, mode = 'sortie') {
    this.mode = mode; this.rift = null;
    if (mode === 'rift') {this.rift = new RiftRun(this); planetIdx = this.rift.pl[0];}
    const q = this.q, save = this.save, D = this.D = SHIPS[save.ship] || SHIPS.nova, up = save.up || {};
    this.planet = PLANETS[planetIdx] || PLANETS[0]; this.pIdx = planetIdx;
    this.sky = this.add(World.makeSky(this.planet, q)); this.stars = this.add(World.makeStars(q.stars)); this.stars.material.uniforms.uPx.value = this.eng.dpr;
    this.dust = this.add(World.makeDust(q.dust)); this.floor = this.add(World.makeFloor(this.planet));
    // --- player ---
    this.ship = buildShip(save.ship, q, save.paint && save.paint[save.ship]);
    const fl = FLAMES.find(f => f.id === save.flame && f.c); this.flameCol = new THREE.Color(fl ? fl.c : (D.flame || '#59c8ff')); this.rainbow = fl && fl.id === 'rainbow';
    for (const f of this.ship.flames) f.m.color.copy(this.flameCol);
    this.add(this.ship.group);
    if (q.shadow) this.ship.group.traverse(o => {if (o.isMesh) o.castShadow = true;});
    const P = this.P = {p: new THREE.Vector3(), v: new THREE.Vector3(), h: new THREE.Vector2(0, -1), yaw: 0, roll: 0, pitch: 0, inv: 0, dashT: 0, dashCd: 0, r: 1.7,
      maxHp: D.hp + (up.hp || 0) * 20, hp: 0, bombs: (D.bombs || 0) + (up.bomb || 0), cd: {f: 0, l: 0, r: 0, b: 0}, shieldOn: false};
    P.hp = P.maxHp;
    this.maxSpeed = 24 * D.spd * (1 + .06 * (up.spd || 0));
    this.dmgMul = D.dmg * (1 + .1 * (up.dmg || 0)); this.rateMul = D.rate * (1 + .08 * (up.rate || 0));
    this.crit = D.crit || 0; this.coinMul = this.baseCoinMul = 1 + .2 * (up.coin || 0); this.wlv = (D.startLv || 0) + (up.wlv || 0);
    this.hpMounts = Object.assign({f: 'blaster', l: null, r: null, b: null}, (save.g3.hp && save.g3.hp[save.ship]) || {});
    if (!['f', 'l', 'r', 'b'].some(k => this.hpMounts[k])) this.hpMounts.f = 'blaster';
    this.syn = activeSyn(this.hpMounts); this.bld = new Build(this); this.meteors = [];
    // --- pools ---
    const bc = (BCOLS.find(b => b.id === save.bcol) || BCOLS[0]).c;
    this.bCol = hexRGB(bc); this.bColor = new THREE.Color(bc);
    this.bm = this.add(new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .18, 1.5), new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false}), 320)); this.bm.frustumCulled = false; this.bm.count = 0; this.bm.setColorAt(0, this.bColor);
    this.shieldM = this.add(new THREE.Mesh(new THREE.SphereGeometry(3, 18, 12), new THREE.MeshBasicMaterial({color: 0x5ad8ff, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}))); this.shieldM.visible = false; this.shieldM.renderOrder = 4;
    this.ebm = this.add(new THREE.InstancedMesh(new THREE.SphereGeometry(.5, 8, 6), new THREE.MeshBasicMaterial({color: 0xff5a3a, toneMapped: false}), 230)); this.ebm.frustumCulled = false; this.ebm.count = 0;
    this.dbm = this.add(new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.55), q.pbr ? new THREE.MeshStandardMaterial({color: 0x8a8f99, metalness: .7, roughness: .4, emissive: 0x221108}) : new THREE.MeshLambertMaterial({color: 0x8a8f99}), 90)); this.dbm.frustumCulled = false; this.dbm.count = 0;
    this.rings = []; const rg = new THREE.RingGeometry(.88, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false})); m.visible = false; m.renderOrder = 5; this.add(m); this.rings.push({m, t: 0, life: 1, R: 10});}
    if (q.blob) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      this.blobs = this.add(new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false}), 80)); this.blobs.frustumCulled = false; this.blobs.renderOrder = -4;
    }
    this.eGeo = {drone: new THREE.OctahedronGeometry(1, 0), dasher: new THREE.ConeGeometry(.9, 2.4, 6), gunner: new THREE.IcosahedronGeometry(1, 0), brute: new THREE.DodecahedronGeometry(1, 0)};
    this.eGeo.dasher.rotateX(-Math.PI / 2);
    this.eMat = {}; for (const k in ETYPES) this.eMat[k] = q.pbr ? new THREE.MeshStandardMaterial({color: 0x20242c, metalness: .7, roughness: .35, emissive: ETYPES[k].col, emissiveIntensity: .55}) : new THREE.MeshLambertMaterial({color: 0x20242c, emissive: ETYPES[k].col});
    // --- state ---
    this.B = []; this.EB = []; this.DB = []; this.E = [];
    this.t = 0; this.score = 0; this.kills = 0; this.coins = 0; this.wave = 1; this.combo = 0; this.comboT = 0; this.spawnT = 1;
    this.shake = 0; this.stopT = 0; this.kick = 0; this.hudT = 0; this.endT = 0; this.ts = 1;
    this.cam = {look: new THREE.Vector3(), roll: 0};
    this.eng.cam.position.set(0, 40, 30); this.state = 'play';
    this.inp.reset(); this.inp.enabled = true;
    this.tmp = new THREE.Object3D(); this.sp = new THREE.Vector3(); this.sp2 = new THREE.Vector3(); this.fxH = 0; this.fxOD = 0;
    this.vr = 30; this.waveToast = 1;
    this.boss = null; this.chunks = []; this.nextBoss = 5; this.bossKills = 0; this._bossGeos = []; this._bossMats = []; this.tsHold = 0;
    this.gauge = 0; this.odT = 0; this.grazeN = 0; this.gIdle = 0; this.tsNow = 1; this.astT = 0;
    this._corePos = corePos; this._partPos = partPos; this._damagePart = (B, p, d) => damagePart(this, B, p, d); this._damageCore = (B, d) => damageCore(this, B, d);
    initAst(this); fillAst(this, true); initModules(this, q);
    const act = Object.values(this.syn).filter(s => !s.id.startsWith('twin:'));
    if (this.rift) this.rift.begin();
    else {this.ui.toast && this.ui.toast(act.length ? 'FUSION · ' + act.map(s => s.n).join(' + ') : 'WAVE 1 · ' + this.planet.en); if (act.length) {this.shockwave(0, 0); this.addShake(.3);}}
  }

  stop() {
    this.state = 'idle'; this.inp.enabled = false;
    for (const o of this.objs) {this.scene.remove(o); o.traverse && o.traverse(c => {c.geometry && c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => {m.map && m.map.dispose(); m.dispose();});});}
    if (this.boss) {this.scene.remove(this.boss.group); this.boss.geos.forEach(g => g.dispose()); this.boss.mats.forEach(m => m.dispose()); this.boss = null;}
    for (const c of this.chunks || []) this.scene.remove(c.mesh); this.chunks = [];
    for (const e of this.E || []) this.scene.remove(e.mesh);
    this._bossGeos.forEach(g => g.dispose()); this._bossMats.forEach(m => m.dispose()); this._bossGeos = []; this._bossMats = [];
    this.objs = []; this.ship && this.ship.dispose();
    for (const k in this.eGeo || {}) this.eGeo[k].dispose();
    for (const k in this.eMat || {}) this.eMat[k].dispose();
    for (const k in this.eMatE || {}) this.eMatE[k].dispose(); this.eMatE = null;
    this.ui.pickHide && this.ui.pickHide();
  }

  /* ---------------- helpers ---------------- */
  ring(x, z, R, col, life = .6, op = .9) {
    const r = this.rings.find(r => !r.m.visible) || this.rings[0];
    r.m.visible = true; r.t = 0; r.life = life; r.R = R; r.op = op; r.m.position.set(x, -4.5, z); r.m.material.color.setHex(col); r.m.scale.setScalar(.1);
  }
  explode(x, z, col, power = 1) {
    const q = this.q, pt = this.eng.particles, [r, g, b] = hexRGB(col), n = Math.round(46 * q.burst * power);
    pt.burst(x, 0, z, n, 26 * power, .9, 1.6, r, g, b, 1.5);
    pt.burst(x, 0, z, Math.round(n * .45), 38 * power, .5, 1.0, 1, .95, .8, 2.2);
    pt.spawn(x, 0, z, 0, 0, 0, .28, 9 * power, 1, 1, .9, 0);
    this.ring(x, z, 9 * power + 3, col, .55); blast(this, x, z, 9 * power + 5, 14 * power, 0);
    if (this.eng.heat) this.eng.heat.burst(x, 0, z, 4, 10 * power, .7, 6 * power, 1, 1, 1, 1.8);
    if (power >= 1.5) this.eng.addShock(x, z, 12 * power, .35 * power, .7);
    const nd = Math.min(q.debris * power | 0, 24);
    for (let i = 0; i < nd; i++) if (this.DB.length < 88) {const a = rnd(0, TAU), s = rnd(14, 34); this.DB.push({x, z, y: rnd(-1, 1), vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(-2, 6), rx: rnd(0, 6), ry: rnd(0, 6), sp: rnd(-9, 9), life: rnd(1.2, 2.4), s: rnd(.5, 1.2) * Math.sqrt(power)});}
  }
  shockwave(x, z) {this.eng.addShock(x, z, 95, 1.8, 1.4);}
  hitStop(s) {this.stopT = Math.max(this.stopT, s);}
  addShake(s) {this.shake = Math.min(1.6, Math.max(this.shake, this.shake + s * .6, s));}
  nearest(x, z, maxD = 1e9) {let best = null, bd = maxD * maxD; for (const e of this.E) {const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) {bd = d; best = e;}} const B = this.boss; if (B && !B.dying) {const [cx, cz] = corePos(B), d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) best = {x: cx, z: cz, r: B.cfg.coreR, boss: true};} return best;}
  blast(x, z, R, f, d) {blast(this, x, z, R, f, d);}

  /* ---------------- weapons ---------------- */
  shoot(ang, mod, mountScale) {modShoot(this, ang, mod, mountScale);}

  /* ---------------- enemies ---------------- */
  eliteMat(type) {
    this.eMatE = this.eMatE || {}; if (!this.eMatE[type]) this.eMatE[type] = this.q.pbr ? new THREE.MeshStandardMaterial({color: 0x2a2410, metalness: .8, roughness: .3, emissive: 0xffc83d, emissiveIntensity: .95}) : new THREE.MeshLambertMaterial({color: 0x2a2410, emissive: 0xffc83d});
    return this.eMatE[type];
  }
  spawnEnemy(type, bx, bz, elite) {
    const T = ETYPES[type], P = this.P, es = elite ? 1.3 : 1;
    const vr = this.vr; let a = rnd(0, TAU), x = P.p.x + Math.cos(a) * rnd(vr * 1.15, vr * 1.5), z = P.p.z + Math.sin(a) * rnd(vr * 1.15, vr * 1.5);
    const R = World.ARENA_R - 6, r = Math.hypot(x, z); if (r > R) {x *= R / r; z *= R / r;}
    if (bx !== undefined) {x = bx; z = bz;}
    const mesh = new THREE.Mesh(this.eGeo[type], elite ? this.eliteMat(type) : this.eMat[type]); mesh.scale.setScalar(T.r * es); mesh.position.set(x, 0, z);
    if (this.q.shadow) mesh.castShadow = true;
    this.scene.add(mesh);
    const hp = T.hp * (1 + (this.wave - 1) * .14) * (elite ? 2.8 : 1);
    this.E.push({type, T, mesh, x, z, vx: 0, vz: 0, hp, maxHp: hp, r: T.r * es, elite: !!elite, t: rnd(0, 3), ph: rnd(0, TAU), orb: rnd(this.vr * .7, this.vr * .95), dir: Math.random() < .5 ? 1 : -1, st: 0, stT: rnd(2.2, 4.6), fireT: rnd(1, 2.4), dodge: Math.random() < .55, flash: 0, ldx: 0, ldz: 0, ang: a, kx: 0, kz: 0, gz: false});
  }
  killEnemy(e, byDebris) {
    const T = e.T, i = this.E.indexOf(e); if (i < 0) return;
    this.E.splice(i, 1); this.scene.remove(e.mesh);
    this.kills++; this.combo++; this.comboT = 2.6;
    this.score += Math.round(T.score * (e.elite ? 2.5 : 1) * (1 + Math.min(this.combo, 40) * .05));
    this.coins += T.coins * (e.elite ? 3 : 1) * this.coinMul;
    const big = e.type === 'brute' || e.elite, bl = this.bld;
    this.explode(e.x, e.z, e.elite ? 0xffc83d : T.col, big ? 1.9 : e.type === 'gunner' ? 1.25 : 1);
    this.addShake(big ? .9 : .32); this.hitStop(big ? .1 : .04);
    if (bl.vamp) this.P.hp = Math.min(this.P.maxHp, this.P.hp + (e.elite ? 2 : .4) * bl.vamp);
    if (bl.chain && !this._inChain) {this._inChain = 1; this.ring(e.x, e.z, 8 + bl.chain * 2.5, 0xff9a3c, .4, .7); this.blast(e.x, e.z, 8 + bl.chain * 2.5, 12, 2.6 * bl.chain * this.dmgMul * bl.dmgNow()); this._inChain = 0;}
    const nw = 1 + Math.floor(this.kills / 12);
    if (!this.rift && nw > this.wave) {this.wave = nw; this.ui.toast && this.ui.toast('WAVE ' + nw);}
  }
  damageEnemy(e, d) {
    e.hp -= d; e.flash = .09;
    const pt = this.eng.particles; pt.burst(e.x, 0, e.z, 3, 14, .25, .8, 1, .9, .7, 2);
    if (e.hp <= 0) this.killEnemy(e);
  }
  hurt(d, fromX, fromZ) {
    const P = this.P, bl = this.bld; if (P.inv > 0 || this.state !== 'play') return;
    if (bl.ghost && Math.random() < bl.ghost) {P.inv = .45; this.ring(P.p.x, P.p.z, 10, 0x9fe0ff, .4, .6); this.eng.particles.burst(P.p.x, 0, P.p.z, 10, 14, .4, 1, .6, .9, 1, 2); return;}
    if (P.shieldOn) {P.shieldOn = false; P.inv = 1; this.ring(P.p.x, P.p.z, 22, 0x5ad8ff, .5, .9); this.addShake(.3); this.blast(P.p.x, P.p.z, 20, 26, 0); this.ui.toast && this.ui.toast('SHIELD BREAK'); return;}
    d *= bl.dr;
    if (bl.mirror) for (let k = 0; k < 1 + bl.mirror; k++) {const e = this.nearest(P.p.x, P.p.z, this.vr * 1.3); if (e) bullet(this, P.p.x, P.p.z, Math.atan2(e.z - P.p.z, e.x - P.p.x) + rnd(-.3, .3), {spd: 60, life: 1.4, dmg: 3 * this.dmgMul * bl.dmgNow(), hom: 8, rad: 1.2, kind: 1, c: new THREE.Color('#9fe0ff'), sc: [1.6, 1.6, 1.4]});}
    if (this.rift) this.rift.hit = true;
    P.hp -= d; P.inv = .85; this.fxH = 1; this.addShake(.55); this.hitStop(.07); this.combo = 0;
    const dx = P.p.x - fromX, dz = P.p.z - fromZ, m = Math.hypot(dx, dz) || 1; P.v.x += dx / m * 22; P.v.z += dz / m * 22;
    this.eng.particles.burst(P.p.x, 0, P.p.z, Math.round(18 * this.q.burst), 20, .5, 1.1, 1, .4, .3, 2);
    this.ui.hurt && this.ui.hurt();
    if (navigator.vibrate && this.save.set.vib !== false) navigator.vibrate(30);
    if (P.hp <= 0) {
      if (bl.phoenix && !this.phoenixUsed) {
        this.phoenixUsed = true; P.hp = P.maxHp * .6; P.inv = 2.2; this.ring(P.p.x, P.p.z, 70, 0xffb347, .9, 1); this.shockwave(P.p.x, P.p.z); this.addShake(1); this.hitStop(.15); this.EB.length = 0;
        this.blast(P.p.x, P.p.z, 55, 60, 10); this.ui.toast && this.ui.toast('PHOENIX REBORN'); return;
      }
      P.hp = 0; this.die();
    }
  }
  die() {
    this.state = 'dying'; this.endT = 1.5; const P = this.P;
    this.explode(P.p.x, P.p.z, 0xffb060, 2.6); this.ring(P.p.x, P.p.z, 40, 0xffffff, 1, 1); this.addShake(1.4); this.hitStop(.18);
    this.ship.group.visible = false;
  }

  /* ---------------- main update ---------------- */
  update(dtReal) {
    if (this.state === 'idle' || this.state === 'pick') return;
    let dt = Math.min(dtReal, .05);
    if (this.stopT > 0) {this.stopT -= dtReal; dt *= .04;}
    // time scale: overdrive bullet-time / boss-kill slow motion
    const want = this.tsHold > 0 ? .28 : this.odT > 0 ? .42 : 1; this.tsHold -= dtReal; this.tsNow += (want - this.tsNow) * (1 - Math.exp(-(want < this.tsNow ? 14 : 5) * dtReal));
    dt *= this.tsNow;
    const dtp = this.tsNow < 1 ? dt / this.tsNow : dt;  // player + player bullets run at real speed during bullet-time
    this.t += dt;
    const P = this.P, inp = this.inp, eng = this.eng, pt = eng.particles, eSl = this.bld.time && P.hp < P.maxHp * .4 ? 1 - .16 * this.bld.time : 1;

    // screen position of player for mouse aim
    this.sp.copy(P.p).project(eng.cam); const sx = (this.sp.x * .5 + .5) * eng.W, sy = (-this.sp.y * .5 + .5) * eng.H;
    inp.poll(sx, sy);
    const live = this.state === 'play';

    /* --- player movement --- */
    if (live) {
      const mx = inp.mv.x, mz = inp.mv.y, mm = Math.hypot(mx, mz);
      P.inv -= dtp; P.dashCd -= dtp; P.dashT -= dtp;
      if (inp.dashReq) {
        inp.dashReq = false;
        if (P.dashCd <= 0) {
          const dx = mm > .15 ? mx / mm : P.h.x, dz = mm > .15 ? mz / mm : P.h.y;
          P.v.x = dx * 64; P.v.z = dz * 64; P.dashT = .26; P.inv = Math.max(P.inv, .4); P.dashCd = 1.6; this.kick = 1; this.addShake(.25);
          pt.burst(P.p.x, 0, P.p.z, Math.round(26 * this.q.burst), 18, .45, 1.1, this.flameCol.r, this.flameCol.g, this.flameCol.b, 2.5);
          this.ring(P.p.x, P.p.z, 8, this.flameCol.getHex(), .4, .6); eng.addShock(P.p.x, P.p.z, 16, .45, .5);
        }
      }
      if (inp.bombReq) {inp.bombReq = false; if (P.bombs > 0) {P.bombs--; this.bomb();}}
      if (P.dashT <= 0) { // steer toward target velocity
        const k = 1 - Math.exp(-(mm > .05 ? 7 : 4.5) * dtp);
        P.v.x += (mx * this.maxSpeed - P.v.x) * k; P.v.z += (mz * this.maxSpeed - P.v.z) * k;
      }
      P.p.x += P.v.x * dtp; P.p.z += P.v.z * dtp;
      const r = Math.hypot(P.p.x, P.p.z), R = World.ARENA_R - 3;
      if (r > R) {const nx = P.p.x / r, nz = P.p.z / r; P.p.x = nx * R; P.p.z = nz * R; const vo = P.v.x * nx + P.v.z * nz; if (vo > 0) {P.v.x -= nx * vo * 1.4; P.v.z -= nz * vo * 1.4;}}

      /* --- aim / heading / fire --- */
      let tgtAng = Math.atan2(P.h.y, P.h.x), firing = false;
      const ctrl = this.save.g3.ctrl, aimed = inp.aiming;
      const nearE = this.nearest(P.p.x, P.p.z, this.vr * 1.15);
      if (aimed) {
        tgtAng = Math.atan2(inp.aim.y, inp.aim.x); firing = inp.fire;
        if (ctrl.aimAssist && nearE) {const ea = Math.atan2(nearE.z - P.p.z, nearE.x - P.p.x), d = angDiff(tgtAng, ea); if (Math.abs(d) < .2) tgtAng += d * .6;}
      } else if (ctrl.autoFire && nearE) {tgtAng = Math.atan2(nearE.z - P.p.z, nearE.x - P.p.x); firing = true;}
      else if (mm > .2) tgtAng = Math.atan2(mz, mx);
      const cur = Math.atan2(P.h.y, P.h.x), d = angDiff(cur, tgtAng), nang = cur + d * (1 - Math.exp(-14 * dtp));
      P.turn = angDiff(cur, nang) / Math.max(dtp, 1e-3); P.h.set(Math.cos(nang), Math.sin(nang));
      if (firing) {
        const bl = this.bld;
        for (const m of ['f', 'l', 'r', 'b']) {
          let mod = this.hpMounts[m], ms = m === 'f' ? 1 : .6;
          if (m === 'b' && !mod && bl.rear) {mod = this.hpMounts.f || 'blaster'; ms = .45 + .15 * bl.rear;}
          if (!mod) continue; P.cd[m] -= dtp;
          if (P.cd[m] <= 0) {P.cd[m] = 1 / (MODS[mod].rate * this.rateMul * (m === 'f' ? 1 : .7) * (this.odT > 0 ? 1.6 : 1) * bl.rate * (this.syn['twin:' + mod] ? 1.25 : 1)); this.shoot(nang + MOUNT_OFF[m], mod, ms);}
        }
      }
    } else {P.v.multiplyScalar(Math.exp(-3 * dtp)); P.p.x += P.v.x * dtp; P.p.z += P.v.z * dtp;}

    /* --- ship visuals: heading, bank, pitch, exhaust --- */
    {
      const sh = this.ship, g = sh.group, ph = Math.atan2(-P.h.x, -P.h.y);  // model forward = -Z
      g.position.set(P.p.x, 0, P.p.z);
      let dy = angDiff(g.rotation.y, ph); g.rotation.y += dy * (1 - Math.exp(-16 * dtp));
      const fwd = -(P.v.x * Math.sin(g.rotation.y) + P.v.z * Math.cos(g.rotation.y)) * -1;
      const lat = P.v.x * Math.cos(g.rotation.y) - P.v.z * Math.sin(g.rotation.y);
      const tr = clamp(-lat * .028 + clamp(-(P.turn || 0) * .018, -.45, .45), -.85, .85), tp = clamp(-(P.v.x * -Math.sin(g.rotation.y) + P.v.z * -Math.cos(g.rotation.y)) * .006, -.25, .25);
      P.roll += (tr - P.roll) * (1 - Math.exp(-9 * dtp)); P.pitch += (tp - P.pitch) * (1 - Math.exp(-7 * dtp));
      sh.body.rotation.z = P.roll; sh.body.rotation.x = P.pitch + Math.sin(this.t * 2.2) * .012; sh.body.position.y = Math.sin(this.t * 1.7) * .12;
      const sp = Math.hypot(P.v.x, P.v.z) / this.maxSpeed, thr = clamp(sp, 0, 1.4);
      sh.setThrust(Math.min(1, thr), P.dashT > 0);
      if (this.rainbow) for (const f of sh.flames) f.m.color.setHSL((this.t * .6) % 1, 1, .6);
      g.visible = (this.state === 'play' || (this.state === 'dying' && this.rift && this.rift.won)) && (P.inv <= 0 || (Math.floor(this.t * 20) & 1));
      if (this.state === 'play' && this.q.trail) { // exhaust particles scale with speed
        const nz = thr > .15 ? (this.q.burst >= 1 ? 2 : 1) : 0;
        for (const en of sh.engines) {
          g.localToWorld(this.sp.copy(en));
          if (eng.heat && (this._hf = !this._hf)) eng.heat.spawn(this.sp.x, this.sp.y, this.sp.z, -P.v.x * .2 + P.h.x * -5, 0, -P.v.z * .2 + P.h.y * -5, .38, 2.6, 1, 1, 1, 2);
          for (let i = 0; i < nz; i++) pt.spawn(this.sp.x, this.sp.y, this.sp.z, -P.v.x * .25 + P.h.x * -6 + rnd(-1.6, 1.6), rnd(-.8, .8), -P.v.z * .25 + P.h.y * -6 + rnd(-1.6, 1.6), rnd(.25, .5), rnd(.5, .9), this.flameCol.r, this.flameCol.g, this.flameCol.b, 2.2);
        }
      }
    }

    /* --- spawning --- */
    if (live) {
      this.spawnT -= dt;
      const cap = this.boss ? 6 : Math.min(14 + this.wave * 2, this.q.id === 'low' ? 22 : 38);
      if (!this.rift && !this.boss && this.wave >= this.nextBoss) {const ks = ['mothership', 'dreadnought', 'warden', 'hive', 'reaper']; spawnBoss(this, PLANETS[this.pIdx] && ks.includes(PLANETS[this.pIdx].boss) && this.bossKills % 2 === 0 ? PLANETS[this.pIdx].boss : ks[(this.bossKills + this.pIdx) % ks.length]);}
      if (!this.rift && this.spawnT <= 0 && this.E.length < cap) {
        const interval = Math.max(.3, 1.5 - this.t * .008 - this.wave * .04); this.spawnT = interval;
        const pool = []; for (const k in ETYPES) if (this.wave >= ETYPES[k].w) pool.push(k);
        const w = {drone: 6, dasher: 3, gunner: 2.4, brute: .9}; let tot = 0; for (const k of pool) tot += w[k];
        let r = Math.random() * tot, pick = pool[0]; for (const k of pool) {r -= w[k]; if (r <= 0) {pick = k; break;}}
        const grp = Math.random() < .25 ? 3 : 1; // occasional pincer group arriving from one side
        for (let i = 0; i < grp; i++) this.spawnEnemy(pick);
      }
      this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
      if (this.rift) this.rift.tick(dt);
    }

    /* --- enemy AI --- */
    const E = this.E;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i]; e.t += dt; e.flash -= dt;
      const dx = P.p.x - e.x, dz = P.p.z - e.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      let wx = 0, wz = 0, sp = e.T.spd * eSl, acc = 3;
      if (e.type === 'drone') {
        if (e.st === 0) { // flank: orbit on the player's side, tightening
          e.ang += e.dir * dt * .55; const R = Math.max(12, e.orb - e.t * 2.4);
          const tx = P.p.x + Math.cos(e.ang) * R, tz = P.p.z + Math.sin(e.ang) * R, ex = tx - e.x, ez = tz - e.z, em = Math.hypot(ex, ez) || 1;
          wx = ex / em; wz = ez / em; if (e.t > e.stT && live) {e.st = 1; e.t = 0;}
        } else {wx = nx; wz = nz; sp *= 2.5; acc = 6; if (e.t > .9) {e.st = 0; e.t = 0; e.stT = rnd(2.5, 5); e.ang = Math.atan2(e.z - P.p.z, e.x - P.p.x);}}
      } else if (e.type === 'dasher') {
        if (e.st === 0) {e.gz = false; const tx = P.p.x + Math.cos(e.ang) * this.vr * .75, tz = P.p.z + Math.sin(e.ang) * this.vr * .75, ex = tx - e.x, ez = tz - e.z, em = Math.hypot(ex, ez) || 1; wx = ex / em; wz = ez / em; e.ang += e.dir * dt * .3; if (e.t > e.stT && live) {e.st = 1; e.t = 0; e.ldx = nx; e.ldz = nz;}}
        else if (e.st === 1) {wx = 0; wz = 0; acc = 9; e.ldx = nx; e.ldz = nz; e.mesh.material === this.eMat.dasher; if (e.t > .75) {e.st = 2; e.t = 0;} else if (Math.random() < dt * 40) pt.spawn(e.x, 0, e.z, e.ldx * 8, 0, e.ldz * 8, .25, 1.4, 1, .6, .2, 2);}
        else if (e.st === 2) {e.vx = e.ldx * 56; e.vz = e.ldz * 56; wx = e.ldx; wz = e.ldz; sp = 56; acc = 30; if (e.t > .5) {e.st = 3; e.t = 0;}}
        else {wx = 0; wz = 0; acc = 2.5; if (e.t > .9) {e.st = 0; e.t = 0; e.stT = rnd(2, 4);}}
      } else if (e.type === 'gunner') {
        const vr = this.vr, want = d > vr * .95 ? 1 : d < vr * .62 ? -1 : 0; wx = nx * want - nz * e.dir * .7; wz = nz * want + nx * e.dir * .7;
        e.fireT -= dt; if (e.fireT <= 0 && live && d < vr * 1.4) {
          e.fireT = rnd(1.5, 2.4);
          const lead = d / 24, ax = P.p.x + P.v.x * lead * .5 - e.x, az = P.p.z + P.v.z * lead * .5 - e.z, am = Math.hypot(ax, az) || 1;
          if (this.EB.length < 120) this.EB.push({x: e.x, z: e.z, vx: ax / am * 24, vz: az / am * 24, life: 4});
          pt.burst(e.x, 0, e.z, 6, 8, .25, 1, 1, .4, .8, 3);
        }
      } else {wx = nx; wz = nz; acc = 1.6;}
      // dodge incoming player bullets
      if (e.dodge && e.st !== 2) {
        let n = 0; for (let k = this.B.length - 1; k >= 0 && n < 14; k--, n++) {
          const b = this.B[k], bx = b.x - e.x, bz = b.z - e.z, bd = bx * bx + bz * bz;
          if (bd < 110 && (b.vx * bx + b.vz * bz) < 0) {const cr = b.vx * bz - b.vz * bx; const s = cr > 0 ? 1 : -1; wx += -b.vz / 80 * s * 1.8; wz += b.vx / 80 * s * 1.8; acc = Math.max(acc, 6); break;}
        }
      }
      // separation (check a few neighbours only)
      for (let k = 1; k <= 5; k++) {const o = E[(i + k) % E.length]; if (o === e) break; const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz); const md = e.r + o.r + 1.2; if (sd < md && sd > .01) {const f = (md - sd) / md; wx += sx / sd * f * 2.2; wz += sz / sd * f * 2.2;}}
      const wm = Math.hypot(wx, wz); if (wm > 1) {wx /= wm; wz /= wm;}
      const kk = 1 - Math.exp(-acc * dt); e.vx += (wx * sp - e.vx) * kk; e.vz += (wz * sp - e.vz) * kk;
      e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt; const kd = Math.exp(-2.6 * dt); e.kx *= kd; e.kz *= kd;
      const er = Math.hypot(e.x, e.z), ER = World.ARENA_R + 8; if (er > ER) {e.x *= ER / er; e.z *= ER / er;}
      // visuals
      const m = e.mesh; m.position.set(e.x, Math.sin(e.t * 3 + e.ph) * .3, e.z);
      const sv = Math.hypot(e.vx, e.vz);
      if (e.type === 'dasher') m.rotation.y = Math.atan2(-e.vx || -e.ldx, -e.vz || -e.ldz) || m.rotation.y; else m.rotation.y += dt * (e.type === 'brute' ? 1 : 2.4);
      if (e.type === 'drone') m.rotation.x += dt * 1.5;
      const pul = e.flash > 0 ? 1.25 : (e.type === 'dasher' && e.st === 1 ? 1 + Math.sin(e.t * 40) * .15 : 1);
      m.scale.setScalar(e.r * pul);
      if (e.type === 'dasher' && e.st === 2 && !e.gz && live && d < e.r + P.r + 5 && d > e.r + P.r) {e.gz = true; this.graze(e.x, e.z, 1.6);}
      // contact damage
      if (live && d < e.r + P.r) {this.hurt(e.type === 'dasher' && e.st === 2 ? e.T.dmg : e.T.dmg * .7, e.x, e.z); e.vx -= nx * 18; e.vz -= nz * 18; if (e.type !== 'brute' && P.dashT <= 0) this.damageEnemy(e, 1.5);}
      else if (live && P.dashT > 0 && d < e.r + P.r + 1.2) {this.damageEnemy(e, 2); e.vx -= nx * 30; e.vz -= nz * 30;}
    }

    /* --- player bullets --- */
    for (let i = this.B.length - 1; i >= 0; i--) {
      const b = this.B[i]; b.life -= dtp;
      if (b.hom) { // homing missile
        const e = this.nearest(b.x, b.z, 55); if (e) {const want = Math.atan2(e.z - b.z, e.x - b.x), d = angDiff(b.a, want); b.a += clamp(d, -b.hom * dtp, b.hom * dtp); const s = Math.hypot(b.vx, b.vz) + 40 * dtp; b.vx = Math.cos(b.a) * s; b.vz = Math.sin(b.a) * s;}
        if (Math.random() < dtp * 50) pt.spawn(b.x, 0, b.z, -b.vx * .1, 0, -b.vz * .1, .35, .9, 1, .7, .3, 1);
      }
      b.x += b.vx * dtp; b.z += b.vz * dtp;
      if (b.pull) for (const e of E) {const dx = b.x - e.x, dz = b.z - e.z, d2 = dx * dx + dz * dz; if (d2 < 340 && d2 > 1) {const d = Math.sqrt(d2), f = 46 * (1 - d / 18.4) * dtp / Math.sqrt(e.r); e.kx += dx / d * f * 3; e.kz += dz / d * f * 3;}}
      if (b.kind === 3 && Math.random() < dtp * 70) pt.spawn(b.x, 0, b.z, rnd(-4, 4), 0, rnd(-4, 4), .4, 1.7, .7, .45, 1, 1);
      let dead = b.life <= 0 || Math.hypot(b.x, b.z) > World.ARENA_R + 12;
      if (!dead && this.boss && hitBoss(this, b, b.dmg * (this.odT > 0 ? 1 : 1))) {
        if (b.kind === 1) {this.explode(b.x, b.z, 0xffa040, .7); this.blast(b.x, b.z, 8, 10, b.dmg * .7); dead = true;} else if (b.pierce > 0) b.pierce--; else dead = true;
        pt.burst(b.x, 0, b.z, 2, 10, .2, .8, 1, .9, .6, 3);
      }
      if (!dead) for (let k = E.length - 1; k >= 0; k--) {
        const e = E[k]; if (b.hit.has(e)) continue;
        if ((e.x - b.x) ** 2 + (e.z - b.z) ** 2 < (e.r + b.rad) ** 2) {
          b.hit.add(e);
          if (b.kind === 3) {dead = true; break;}
          if (b.kind === 1) {this.explode(b.x, b.z, 0xffa040, .7); this.damageEnemy(e, b.dmg); this.blast(b.x, b.z, 8, 12, b.dmg * .6); this.addShake(.25); dead = true; break;}
          const cc = this.crit + this.bld.crit, crit = cc && Math.random() < cc; this.damageEnemy(e, b.dmg * (crit ? 2.5 + this.bld.cdm : 1));
          if (b.arc && Math.random() < b.arc) arcStrike(this, e.x, e.z, 0, 4, 1, b.dmg * .7);
          if (b.pierce > 0) b.pierce--; else {dead = true; break;}
          if (b.kind === 2) {e.vx += b.vx * .25; e.vz += b.vz * .25;}
        }
      }
      if (!dead) for (const a of this.AS) if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < (a.r + b.rad * .5) ** 2) {a.hp -= b.dmg; a.vx += b.vx * .02 / Math.sqrt(a.m) * 6; a.vz += b.vz * .02 / Math.sqrt(a.m) * 6; if (b.kind === 1) this.blast(b.x, b.z, 8, 12, b.dmg); if (b.pierce > 0 && b.kind !== 2) b.pierce--; else if (b.kind !== 2) dead = true; break;}
      if (dead) {if (b.kind === 3) openHole(this, b.x, b.z, false, !!this.syn.barrage); else if (b.life > 0 && b.kind !== 1) pt.burst(b.x, 0, b.z, 2, 9, .2, .8, this.bCol[0], this.bCol[1], this.bCol[2], 3); this.B[i] = this.B[this.B.length - 1]; this.B.pop();}
    }
    /* --- enemy bullets --- */
    for (let i = this.EB.length - 1; i >= 0; i--) {
      const b = this.EB[i]; b.life -= dt * eSl; b.x += b.vx * dt * eSl; b.z += b.vz * dt * eSl;
      let dead = b.life <= 0 || Math.hypot(b.x, b.z) > World.ARENA_R + 20;
      const bd2 = (b.x - P.p.x) ** 2 + (b.z - P.p.z) ** 2, hr = b.r || 3.4;
      if (!dead && live) {if (bd2 < hr * hr) {if (P.inv <= 0) {this.hurt(b.s > 1 ? 14 : 9, b.x - b.vx, b.z - b.vz); dead = true;} } else if (!b.gz && bd2 < (hr + 3.4) ** 2) {b.gz = true; this.graze(b.x, b.z, 1);}}
      if (Math.random() < dt * 30) pt.spawn(b.x, 0, b.z, 0, 0, 0, .3, .8, 1, .3, .2, 0);
      if (dead) {this.EB[i] = this.EB[this.EB.length - 1]; this.EB.pop();}
    }
    /* --- debris physics: shards fly, bounce and smash into other ships --- */
    for (let i = this.DB.length - 1; i >= 0; i--) {
      const s = this.DB[i]; s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt; s.y += s.vy * dt; s.vy -= 6 * dt; s.rx += s.sp * dt; s.ry += s.sp * .7 * dt;
      const dr = Math.exp(-.9 * dt); s.vx *= dr; s.vz *= dr;
      if (s.y < -4.6) {s.y = -4.6; s.vy = Math.abs(s.vy) * .35;}
      let dead = s.life <= 0;
      if (!dead && (s.vx * s.vx + s.vz * s.vz) > 120) for (const e of E) {
        if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 < (e.r + s.s) ** 2) {this.damageEnemy(e, 1.1 * s.s); e.vx += s.vx * .12; e.vz += s.vz * .12; pt.burst(s.x, 0, s.z, 3, 10, .25, .8, 1, .7, .4, 2); dead = true; break;}
      }
      if (dead) {this.DB[i] = this.DB[this.DB.length - 1]; this.DB.pop();}
    }
    updateAst(this, dt); updateBoss(this, dt); updateChunks(this, dt); updateModules(this, dt);
    this.shieldM.visible = P.shieldOn && this.state === 'play'; if (this.shieldM.visible) {this.shieldM.position.set(P.p.x, 0, P.p.z); this.shieldM.scale.setScalar(1 + Math.sin(this.t * 6) * .04);}
    this.updateOD(dtReal);
    /* --- rings --- */
    for (const r of this.rings) if (r.m.visible) {r.t += dt / r.life; if (r.t >= 1) {r.m.visible = false; continue;} r.m.scale.setScalar(r.R * (1 - (1 - r.t) ** 3)); r.m.material.opacity = (1 - r.t) * r.op;}

    /* --- instances --- */
    const o = this.tmp;
    this.bm.count = this.B.length; this.B.forEach((b, i) => {o.position.set(b.x, 0, b.z); o.rotation.set(0, Math.atan2(-b.vx, -b.vz), 0); o.scale.set(b.sc[0], b.sc[1], b.sc[2]); o.updateMatrix(); this.bm.setMatrixAt(i, o.matrix); this.bm.setColorAt(i, b.c);}); this.bm.instanceMatrix.needsUpdate = true; this.bm.instanceColor.needsUpdate = true;
    this.ebm.count = this.EB.length; this.EB.forEach((b, i) => {o.position.set(b.x, 0, b.z); o.rotation.set(0, 0, 0); const s = (b.s || 1) * (1 + Math.sin(this.t * 20 + i) * .15); o.scale.setScalar(s); o.updateMatrix(); this.ebm.setMatrixAt(i, o.matrix);}); this.ebm.instanceMatrix.needsUpdate = true;
    this.dbm.count = this.DB.length; this.DB.forEach((s, i) => {o.position.set(s.x, s.y, s.z); o.rotation.set(s.rx, s.ry, 0); o.scale.setScalar(s.s); o.updateMatrix(); this.dbm.setMatrixAt(i, o.matrix);}); this.dbm.instanceMatrix.needsUpdate = true;
    if (this.blobs) {
      let n = 0; o.rotation.set(0, 0, 0);
      const put = (x, z, r) => {o.position.set(x, -5.6, z); o.scale.setScalar(r * 2.6); o.updateMatrix(); this.blobs.setMatrixAt(n++, o.matrix);};
      if (this.state === 'play') put(P.p.x, P.p.z, 2.6); for (const e of E) if (n < 79) put(e.x, e.z, e.r);
      this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true;
    }

    /* --- camera rig: dynamic 3rd-person --- */
    {
      const c = eng.cam, k = 1 - Math.exp(-5.5 * dtReal), ahead = .3;
      this.cam.look.x += (P.p.x + P.v.x * ahead - this.cam.look.x) * k; this.cam.look.z += (P.p.z + P.v.z * ahead - this.cam.look.z) * k;
      const spd = Math.hypot(P.v.x, P.v.z) / this.maxSpeed; this.kick = Math.max(0, this.kick - dtReal * 2.2);
      const ar = eng.W / eng.H, zoom = (1 + .2 * Math.min(spd, 1.3) + .22 * this.kick) * (ar < 1 ? 1.05 : 1);
      const df = (ar < 1 ? .74 : .88) * ({near: .8, mid: 1, far: 1.22}[this.save.g3.ctrl.cam || 'mid'] || 1), H = 38 * zoom * df, Dz = 25 * zoom * df; this.vr = Math.max(24, H * Math.tan(c.fov * Math.PI / 360) * Math.max(1, ar) * .9);
       const sway = clamp(-P.v.x * .0042, -.14, .14) + Math.sin(this.t * .5) * .006;
      const cs = Math.cos(sway), sn = Math.sin(sway);
      this.shake = Math.max(0, this.shake - dtReal * 2.4); const sk = this.shake * this.shake * 1.6;
      c.position.set(this.cam.look.x + Dz * sn + rnd(-sk, sk), H + rnd(-sk, sk) * .5, this.cam.look.z + Dz * cs + rnd(-sk, sk));
      c.lookAt(this.cam.look.x, 0, this.cam.look.z - 3);
      this.cam.roll += ((-P.v.x * .0018) - this.cam.roll) * (1 - Math.exp(-4 * dtReal)); c.rotateZ(this.cam.roll + rnd(-sk, sk) * .01);
      this.floor.material.uniforms.uC.value.set(P.p.x, 0, P.p.z); this.floor.material.uniforms.uT.value = this.t;
      this.dust.material.uniforms.uC.value.copy(P.p); this.dust.material.uniforms.uPx.value = eng.px; this.dust.material.uniforms.uSp.value = Math.min(1, spd);
      {
        const f = eng.fx; this.sp.copy(P.p).project(c); f.px = this.sp.x * .5 + .5; f.py = this.sp.y * .5 + .5;
        this.sp2.set(P.p.x + P.v.x * .05, 0, P.p.z + P.v.z * .05).project(c);
        const vx = (this.sp2.x - this.sp.x) * .5, vy = (this.sp2.y - this.sp.y) * .5, m = Math.hypot(vx, vy) || 1, k = Math.min(1.3, spd) ** 2 * .011;
        f.mbx = vx / m * k; f.mby = vy / m * k; f.dash = this.kick * this.kick;
        this.fxH = Math.max(0, this.fxH - dtReal * 3); this.fxOD += ((this.odT > 0 ? 1 : 0) - this.fxOD) * (1 - Math.exp(-6 * dtReal));
        f.hurt = this.fxH; f.od = this.fxOD; f.chroma = .0022 * Math.min(1, spd) + .012 * this.fxH + .004 * this.fxOD + .007 * this.kick;
      }
      this.sky.position.copy(c.position); this.stars.position.copy(c.position); this.sky.material.uniforms.uT.value = this.t;
      this.eng.key.position.set(P.p.x - 30, 60, P.p.z + 25); this.eng.key.target.position.set(P.p.x, 0, P.p.z);
      if (this.eng.shadowFloor) this.eng.shadowFloor.position.set(P.p.x, -5.9, P.p.z);
    }

    /* --- state / HUD --- */
    if (this.state === 'dying') {this.endT -= dtReal; if (this.endT <= 0) {this.state = 'over'; this.inp.enabled = false; this.ui.over && this.ui.over(this.summary());}}
    this.hudT -= dtReal; if (this.hudT <= 0) {this.hudT = .1; this.ui.hud && this.ui.hud({hp: P.hp, max: P.maxHp, score: this.score, kills: this.kills, coins: Math.floor(this.coins), wave: this.wave, rl: this.rift ? this.rift.hudLabel() : '', combo: this.combo, dash: clamp(1 - P.dashCd / 1.6, 0, 1), bombs: P.bombs, gauge: this.gauge, od: this.odT > 0, graze: this.grazeN, boss: this.boss ? {name: this.boss.cfg.name, hp: Math.max(0, this.boss.hp / this.boss.max), armor: this.boss.parts.filter(p => p.alive && p.k === 'armor').length, phase: this.boss.phase, dying: this.boss.dying} : null});}
  }

  graze(x, z, k) {
    if (this.state !== 'play') return;
    this.grazeN++; this.gIdle = 0; const P = this.P;
    if (this.odT <= 0) this.gauge = Math.min(100, this.gauge + 6.5 * k * (P.dashT > 0 ? 2 : 1) * this.bld.odm);
    if (this.bld.gzh && (this.gzT || 0) < this.t) {this.gzT = this.t + .3; P.hp = Math.min(P.maxHp, P.hp + this.bld.gzh);}
    this.eng.particles.burst((x + P.p.x) / 2, 0, (z + P.p.z) / 2, 6, 16, .3, .9, .4, 1, 1, 2.5);
    this.score += 2; if (navigator.vibrate && this.save.set.vib !== false && Math.random() < .3) navigator.vibrate(8);
  }
  updateOD(dtReal) {
    if (this.state !== 'play') return;
    if (this.odT > 0) {
      this.odT -= dtReal; this.gauge = Math.max(0, this.gauge * (this.odT / (this.odT + dtReal)));
      if (this.odT <= 0) {this.odT = 0; this.gauge = 0; this.ui.od && this.ui.od(false);}
    } else if (this.gauge >= 100) {
      this.odT = 3.4; this.kick = 1; this.addShake(.3); this.ui.od && this.ui.od(true); this.ui.toast && this.ui.toast('OVERDRIVE');
      this.ring(this.P.p.x, this.P.p.z, 30, 0x56e0ff, .6, .9);
    } else {this.gIdle += dtReal; if (this.gIdle > 4) this.gauge = Math.max(0, this.gauge - 5 * dtReal);}
  }
  bomb() {
    const P = this.P; this.eng.addShock(P.p.x, P.p.z, 70, 1.2, .9); this.ring(P.p.x, P.p.z, 70, 0xffe08a, .8, 1); this.ring(P.p.x, P.p.z, 45, 0xffffff, .5, .8);
    this.eng.particles.burst(P.p.x, 0, P.p.z, Math.round(120 * this.q.burst), 60, 1, 1.8, 1, .85, .45, 1.6);
    this.addShake(1); this.hitStop(.1); this.EB.length = 0;
    this.blast(P.p.x, P.p.z, 62, 40, 12);
  }
  spawnRock(x, z, r, vx, vz) {return spawnAst(this, x, z, r, vx, vz);}
  retheme(pi) {
    this.pIdx = pi; this.planet = PLANETS[pi] || PLANETS[0];
    for (const k of ['sky', 'floor']) {const o = this[k], i = this.objs.indexOf(o); this.scene.remove(o); if (i >= 0) this.objs.splice(i, 1); o.geometry && o.geometry.dispose(); o.material && o.material.dispose();}
    this.sky = this.add(World.makeSky(this.planet, this.q)); this.floor = this.add(World.makeFloor(this.planet));
    this.ring(this.P.p.x, this.P.p.z, 90, 0xffffff, 1, .9); this.shockwave(this.P.p.x, this.P.p.z);
  }
  finish(win) {this.state = 'dying'; this.endT = win ? 1.4 : 1.5; this.inp.reset(); if (win) {this.ring(this.P.p.x, this.P.p.z, 100, 0xffd24a, 1.2, 1); this.shockwave(this.P.p.x, this.P.p.z); this.addShake(.6);}}
  summary() {return {score: this.score, kills: this.kills, coins: Math.floor(this.coins), wave: this.wave, time: this.t, planet: this.pIdx, bosses: this.bossKills, graze: this.grazeN, mode: this.mode, rift: this.rift ? this.rift.summary() : null};}
}
