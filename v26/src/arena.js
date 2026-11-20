// 360° free-roam arena: player ship, enemy AI, weapons, debris physics, camera rig.
import * as THREE from 'three';
import {SHIPS, PLANETS, BCOLS, FLAMES} from './data.js';
import {buildShip} from './ships3d.js';
import * as World from './world.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = THREE.MathUtils.clamp;
const angDiff = (a, b) => {let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d;};
const hexRGB = h => {const c = new THREE.Color(h); return [c.r, c.g, c.b];};

const ETYPES = {
  drone:  {hp: 3,  r: 1.5, spd: 15, col: 0xff4a5a, score: 10, coins: 1, w: 0, dmg: 10},
  dasher: {hp: 4,  r: 1.7, spd: 13, col: 0xffa23a, score: 20, coins: 2, w: 2, dmg: 16},
  gunner: {hp: 6,  r: 2.0, spd: 11, col: 0xb46cff, score: 30, coins: 3, w: 3, dmg: 10},
  brute:  {hp: 18, r: 3.1, spd: 7.5, col: 0x4aff9a, score: 60, coins: 6, w: 5, dmg: 22}
};
const WEAPONS = { // rate (shots/s), dmg per shot, speed, life
  blaster: {rate: 7, dmg: 1, spd: 78, life: 1.1},
  spread:  {rate: 3.4, dmg: .75, spd: 66, life: .8},
  laser:   {rate: 11, dmg: .55, spd: 120, life: .7},
  missile: {rate: 2, dmg: 3.2, spd: 42, life: 2.2},
  wave:    {rate: 1.4, dmg: 2.2, spd: 38, life: 1.1}
};
const MOUNT_OFF = {f: 0, r: Math.PI / 2, b: Math.PI, l: -Math.PI / 2};

export class Arena {
  constructor(eng, save, input, ui) {
    this.eng = eng; this.q = eng.q; this.save = save; this.inp = input; this.ui = ui;
    this.scene = eng.scene; this.objs = []; this.state = 'idle';
  }
  add(o) {this.scene.add(o); this.objs.push(o); return o;}

  start(planetIdx) {
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
      maxHp: D.hp + (up.hp || 0) * 20, hp: 0, bombs: (D.bombs || 0) + (up.bomb || 0), cd: {f: 0, l: 0, r: 0, b: 0}};
    P.hp = P.maxHp;
    this.maxSpeed = 24 * D.spd * (1 + .06 * (up.spd || 0));
    this.dmgMul = D.dmg * (1 + .1 * (up.dmg || 0)); this.rateMul = D.rate * (1 + .08 * (up.rate || 0));
    this.crit = D.crit || 0; this.coinMul = 1 + .2 * (up.coin || 0); this.wlv = (D.startLv || 0) + (up.wlv || 0);
    this.hpMounts = Object.assign({f: 'blaster', l: null, r: null, b: null}, (save.g3.hp && save.g3.hp[save.ship]) || {});
    // --- pools ---
    const bc = (BCOLS.find(b => b.id === save.bcol) || BCOLS[0]).c;
    this.bCol = hexRGB(bc);
    this.bm = this.add(new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .18, 1.5), new THREE.MeshBasicMaterial({color: bc, toneMapped: false}), 320)); this.bm.frustumCulled = false; this.bm.count = 0;
    this.ebm = this.add(new THREE.InstancedMesh(new THREE.SphereGeometry(.5, 8, 6), new THREE.MeshBasicMaterial({color: 0xff5a3a, toneMapped: false}), 140)); this.ebm.frustumCulled = false; this.ebm.count = 0;
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
    this.tmp = new THREE.Object3D(); this.sp = new THREE.Vector3();
    this.vr = 30; this.waveToast = 1; this.ui.toast && this.ui.toast('WAVE 1 · ' + this.planet.en);
  }

  stop() {
    this.state = 'idle'; this.inp.enabled = false;
    for (const o of this.objs) {this.scene.remove(o); o.traverse && o.traverse(c => {c.geometry && c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => {m.map && m.map.dispose(); m.dispose();});});}
    this.objs = []; this.ship && this.ship.dispose();
    for (const k in this.eGeo || {}) this.eGeo[k].dispose();
    for (const k in this.eMat || {}) this.eMat[k].dispose();
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
    this.ring(x, z, 9 * power + 3, col, .55);
    const nd = Math.min(q.debris * power | 0, 24);
    for (let i = 0; i < nd; i++) if (this.DB.length < 88) {const a = rnd(0, TAU), s = rnd(14, 34); this.DB.push({x, z, y: rnd(-1, 1), vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(-2, 6), rx: rnd(0, 6), ry: rnd(0, 6), sp: rnd(-9, 9), life: rnd(1.2, 2.4), s: rnd(.5, 1.2) * Math.sqrt(power)});}
  }
  hitStop(s) {this.stopT = Math.max(this.stopT, s);}
  addShake(s) {this.shake = Math.min(1.6, Math.max(this.shake, this.shake + s * .6, s));}
  nearest(x, z, maxD = 1e9) {let best = null, bd = maxD * maxD; for (const e of this.E) {const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) {bd = d; best = e;}} return best;}

  /* ---------------- weapons ---------------- */
  shoot(ang, mod, mountScale) {
    const W = WEAPONS[mod]; if (!W) return;
    const P = this.P, lv = this.wlv, pt = this.eng.particles, ca = Math.cos(ang), sa = Math.sin(ang);
    const dm = W.dmg * this.dmgMul * (1 + .22 * lv) * mountScale;
    const mk = (a, o = {}) => {
      if (this.B.length >= 300) return;
      const spd = o.spd || W.spd; this.B.push({x: P.p.x + Math.cos(a) * 2.2 - Math.sin(a) * (o.off || 0), z: P.p.z + Math.sin(a) * 2.2 + Math.cos(a) * (o.off || 0), vx: Math.cos(a) * spd, vz: Math.sin(a) * spd, a, life: W.life, dmg: dm * (o.dm || 1), pierce: o.pierce || 0, hom: o.hom || 0, rad: o.rad || .9, kind: o.kind || 0, hit: new Set()});
    };
    if (mod === 'blaster') {const n = 1 + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0), sp = .55; for (let i = 0; i < n; i++) mk(ang, {off: (i - (n - 1) / 2) * sp * 2});}
    else if (mod === 'spread') {const n = 3 + lv; for (let i = 0; i < n; i++) mk(ang + (i - (n - 1) / 2) * .17, {rad: .8});}
    else if (mod === 'laser') {const n = lv >= 2 ? 2 : 1; for (let i = 0; i < n; i++) mk(ang, {pierce: 2 + lv, off: (i - (n - 1) / 2) * 1.4, rad: .7});}
    else if (mod === 'missile') {const n = 1 + (lv >= 2 ? 1 : 0); for (let i = 0; i < n; i++) mk(ang + (i - (n - 1) / 2) * .35, {hom: 7, rad: 1.3, kind: 1, spd: W.spd});}
    else if (mod === 'wave') {mk(ang, {pierce: 99, rad: 2.6, kind: 2, dm: 1});}
    pt.burst(P.p.x + ca * 2.4, 0, P.p.z + sa * 2.4, 2, 10, .15, .9, this.bCol[0], this.bCol[1], this.bCol[2], 3);
  }

  /* ---------------- enemies ---------------- */
  spawnEnemy(type, bx, bz) {
    const T = ETYPES[type], P = this.P;
    const vr = this.vr; let a = rnd(0, TAU), x = P.p.x + Math.cos(a) * rnd(vr * 1.15, vr * 1.5), z = P.p.z + Math.sin(a) * rnd(vr * 1.15, vr * 1.5);
    const R = World.ARENA_R - 6, r = Math.hypot(x, z); if (r > R) {x *= R / r; z *= R / r;}
    if (bx !== undefined) {x = bx; z = bz;}
    const mesh = new THREE.Mesh(this.eGeo[type], this.eMat[type]); mesh.scale.setScalar(T.r); mesh.position.set(x, 0, z);
    if (this.q.shadow) mesh.castShadow = true;
    this.scene.add(mesh);
    const hp = T.hp * (1 + (this.wave - 1) * .14);
    this.E.push({type, T, mesh, x, z, vx: 0, vz: 0, hp, maxHp: hp, r: T.r, t: rnd(0, 3), ph: rnd(0, TAU), orb: rnd(this.vr * .7, this.vr * .95), dir: Math.random() < .5 ? 1 : -1, st: 0, stT: rnd(2.2, 4.6), fireT: rnd(1, 2.4), dodge: Math.random() < .55, flash: 0, ldx: 0, ldz: 0, ang: a});
  }
  killEnemy(e, byDebris) {
    const T = e.T, i = this.E.indexOf(e); if (i < 0) return;
    this.E.splice(i, 1); this.scene.remove(e.mesh);
    this.kills++; this.combo++; this.comboT = 2.6;
    this.score += Math.round(T.score * (1 + Math.min(this.combo, 40) * .05));
    this.coins += T.coins * this.coinMul;
    const big = e.type === 'brute';
    this.explode(e.x, e.z, T.col, big ? 1.9 : e.type === 'gunner' ? 1.25 : 1);
    this.addShake(big ? .9 : .32); this.hitStop(big ? .1 : .04);
    const nw = 1 + Math.floor(this.kills / 12);
    if (nw > this.wave) {this.wave = nw; this.ui.toast && this.ui.toast('WAVE ' + nw);}
  }
  damageEnemy(e, d) {
    e.hp -= d; e.flash = .09;
    const pt = this.eng.particles; pt.burst(e.x, 0, e.z, 3, 14, .25, .8, 1, .9, .7, 2);
    if (e.hp <= 0) this.killEnemy(e);
  }
  hurt(d, fromX, fromZ) {
    const P = this.P; if (P.inv > 0 || this.state !== 'play') return;
    P.hp -= d; P.inv = .85; this.addShake(.55); this.hitStop(.07); this.combo = 0;
    const dx = P.p.x - fromX, dz = P.p.z - fromZ, m = Math.hypot(dx, dz) || 1; P.v.x += dx / m * 22; P.v.z += dz / m * 22;
    this.eng.particles.burst(P.p.x, 0, P.p.z, Math.round(18 * this.q.burst), 20, .5, 1.1, 1, .4, .3, 2);
    this.ui.hurt && this.ui.hurt();
    if (navigator.vibrate && this.save.set.vib !== false) navigator.vibrate(30);
    if (P.hp <= 0) {P.hp = 0; this.die();}
  }
  die() {
    this.state = 'dying'; this.endT = 1.5; const P = this.P;
    this.explode(P.p.x, P.p.z, 0xffb060, 2.6); this.ring(P.p.x, P.p.z, 40, 0xffffff, 1, 1); this.addShake(1.4); this.hitStop(.18);
    this.ship.group.visible = false;
  }

  /* ---------------- main update ---------------- */
  update(dtReal) {
    if (this.state === 'idle') return;
    let dt = Math.min(dtReal, .05);
    if (this.stopT > 0) {this.stopT -= dtReal; dt *= .04;}
    dt *= this.ts;
    this.t += dt;
    const P = this.P, inp = this.inp, eng = this.eng, pt = eng.particles;

    // screen position of player for mouse aim
    this.sp.copy(P.p).project(eng.cam); const sx = (this.sp.x * .5 + .5) * eng.W, sy = (-this.sp.y * .5 + .5) * eng.H;
    inp.poll(sx, sy);
    const live = this.state === 'play';

    /* --- player movement --- */
    if (live) {
      const mx = inp.mv.x, mz = inp.mv.y, mm = Math.hypot(mx, mz);
      P.inv -= dt; P.dashCd -= dt; P.dashT -= dt;
      if (inp.dashReq) {
        inp.dashReq = false;
        if (P.dashCd <= 0) {
          const dx = mm > .15 ? mx / mm : P.h.x, dz = mm > .15 ? mz / mm : P.h.y;
          P.v.x = dx * 64; P.v.z = dz * 64; P.dashT = .26; P.inv = Math.max(P.inv, .4); P.dashCd = 1.6; this.kick = 1; this.addShake(.25);
          pt.burst(P.p.x, 0, P.p.z, Math.round(26 * this.q.burst), 18, .45, 1.1, this.flameCol.r, this.flameCol.g, this.flameCol.b, 2.5);
          this.ring(P.p.x, P.p.z, 8, this.flameCol.getHex(), .4, .6);
        }
      }
      if (inp.bombReq) {inp.bombReq = false; if (P.bombs > 0) {P.bombs--; this.bomb();}}
      if (P.dashT <= 0) { // steer toward target velocity
        const k = 1 - Math.exp(-(mm > .05 ? 7 : 4.5) * dt);
        P.v.x += (mx * this.maxSpeed - P.v.x) * k; P.v.z += (mz * this.maxSpeed - P.v.z) * k;
      }
      P.p.x += P.v.x * dt; P.p.z += P.v.z * dt;
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
      const cur = Math.atan2(P.h.y, P.h.x), d = angDiff(cur, tgtAng), nang = cur + d * (1 - Math.exp(-14 * dt));
      P.turn = angDiff(cur, nang) / Math.max(dt, 1e-3); P.h.set(Math.cos(nang), Math.sin(nang));
      if (firing) for (const m of ['f', 'l', 'r', 'b']) {
        const mod = this.hpMounts[m]; if (!mod) continue; P.cd[m] -= dt;
        if (P.cd[m] <= 0) {P.cd[m] = 1 / (WEAPONS[mod].rate * this.rateMul * (m === 'f' ? 1 : .7)); this.shoot(nang + MOUNT_OFF[m], mod, m === 'f' ? 1 : .6);}
      }
    } else {P.v.multiplyScalar(Math.exp(-3 * dt)); P.p.x += P.v.x * dt; P.p.z += P.v.z * dt;}

    /* --- ship visuals: heading, bank, pitch, exhaust --- */
    {
      const sh = this.ship, g = sh.group, ph = Math.atan2(-P.h.x, -P.h.y);  // model forward = -Z
      g.position.set(P.p.x, 0, P.p.z);
      let dy = angDiff(g.rotation.y, ph); g.rotation.y += dy * (1 - Math.exp(-16 * dt));
      const fwd = -(P.v.x * Math.sin(g.rotation.y) + P.v.z * Math.cos(g.rotation.y)) * -1;
      const lat = P.v.x * Math.cos(g.rotation.y) - P.v.z * Math.sin(g.rotation.y);
      const tr = clamp(-lat * .028 + clamp(-(P.turn || 0) * .018, -.45, .45), -.85, .85), tp = clamp(-(P.v.x * -Math.sin(g.rotation.y) + P.v.z * -Math.cos(g.rotation.y)) * .006, -.25, .25);
      P.roll += (tr - P.roll) * (1 - Math.exp(-9 * dt)); P.pitch += (tp - P.pitch) * (1 - Math.exp(-7 * dt));
      sh.body.rotation.z = P.roll; sh.body.rotation.x = P.pitch + Math.sin(this.t * 2.2) * .012; sh.body.position.y = Math.sin(this.t * 1.7) * .12;
      const sp = Math.hypot(P.v.x, P.v.z) / this.maxSpeed, thr = clamp(sp, 0, 1.4);
      sh.setThrust(Math.min(1, thr), P.dashT > 0);
      if (this.rainbow) for (const f of sh.flames) f.m.color.setHSL((this.t * .6) % 1, 1, .6);
      g.visible = this.state === 'play' && (P.inv <= 0 || (Math.floor(this.t * 20) & 1));
      if (this.state === 'play' && this.q.trail) { // exhaust particles scale with speed
        const nz = thr > .15 ? (this.q.burst >= 1 ? 2 : 1) : 0;
        for (const en of sh.engines) {
          g.localToWorld(this.sp.copy(en));
          for (let i = 0; i < nz; i++) pt.spawn(this.sp.x, this.sp.y, this.sp.z, -P.v.x * .25 + P.h.x * -6 + rnd(-1.6, 1.6), rnd(-.8, .8), -P.v.z * .25 + P.h.y * -6 + rnd(-1.6, 1.6), rnd(.25, .5), rnd(.5, .9), this.flameCol.r, this.flameCol.g, this.flameCol.b, 2.2);
        }
      }
    }

    /* --- spawning --- */
    if (live) {
      this.spawnT -= dt;
      const cap = Math.min(14 + this.wave * 2, this.q.id === 'low' ? 22 : 38);
      if (this.spawnT <= 0 && this.E.length < cap) {
        const interval = Math.max(.3, 1.5 - this.t * .008 - this.wave * .04); this.spawnT = interval;
        const pool = []; for (const k in ETYPES) if (this.wave >= ETYPES[k].w) pool.push(k);
        const w = {drone: 6, dasher: 3, gunner: 2.4, brute: .9}; let tot = 0; for (const k of pool) tot += w[k];
        let r = Math.random() * tot, pick = pool[0]; for (const k of pool) {r -= w[k]; if (r <= 0) {pick = k; break;}}
        const grp = Math.random() < .25 ? 3 : 1; // occasional pincer group arriving from one side
        for (let i = 0; i < grp; i++) this.spawnEnemy(pick);
      }
      this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    }

    /* --- enemy AI --- */
    const E = this.E;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i]; e.t += dt; e.flash -= dt;
      const dx = P.p.x - e.x, dz = P.p.z - e.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      let wx = 0, wz = 0, sp = e.T.spd, acc = 3;
      if (e.type === 'drone') {
        if (e.st === 0) { // flank: orbit on the player's side, tightening
          e.ang += e.dir * dt * .55; const R = Math.max(12, e.orb - e.t * 2.4);
          const tx = P.p.x + Math.cos(e.ang) * R, tz = P.p.z + Math.sin(e.ang) * R, ex = tx - e.x, ez = tz - e.z, em = Math.hypot(ex, ez) || 1;
          wx = ex / em; wz = ez / em; if (e.t > e.stT && live) {e.st = 1; e.t = 0;}
        } else {wx = nx; wz = nz; sp *= 2.5; acc = 6; if (e.t > .9) {e.st = 0; e.t = 0; e.stT = rnd(2.5, 5); e.ang = Math.atan2(e.z - P.p.z, e.x - P.p.x);}}
      } else if (e.type === 'dasher') {
        if (e.st === 0) {const tx = P.p.x + Math.cos(e.ang) * this.vr * .75, tz = P.p.z + Math.sin(e.ang) * this.vr * .75, ex = tx - e.x, ez = tz - e.z, em = Math.hypot(ex, ez) || 1; wx = ex / em; wz = ez / em; e.ang += e.dir * dt * .3; if (e.t > e.stT && live) {e.st = 1; e.t = 0; e.ldx = nx; e.ldz = nz;}}
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
      e.x += e.vx * dt; e.z += e.vz * dt;
      const er = Math.hypot(e.x, e.z), ER = World.ARENA_R + 8; if (er > ER) {e.x *= ER / er; e.z *= ER / er;}
      // visuals
      const m = e.mesh; m.position.set(e.x, Math.sin(e.t * 3 + e.ph) * .3, e.z);
      const sv = Math.hypot(e.vx, e.vz);
      if (e.type === 'dasher') m.rotation.y = Math.atan2(-e.vx || -e.ldx, -e.vz || -e.ldz) || m.rotation.y; else m.rotation.y += dt * (e.type === 'brute' ? 1 : 2.4);
      if (e.type === 'drone') m.rotation.x += dt * 1.5;
      const pul = e.flash > 0 ? 1.25 : (e.type === 'dasher' && e.st === 1 ? 1 + Math.sin(e.t * 40) * .15 : 1);
      m.scale.setScalar(e.r * pul);
      // contact damage
      if (live && d < e.r + P.r) {this.hurt(e.type === 'dasher' && e.st === 2 ? e.T.dmg : e.T.dmg * .7, e.x, e.z); e.vx -= nx * 18; e.vz -= nz * 18; if (e.type !== 'brute' && P.dashT <= 0) this.damageEnemy(e, 1.5);}
      else if (live && P.dashT > 0 && d < e.r + P.r + 1.2) {this.damageEnemy(e, 2); e.vx -= nx * 30; e.vz -= nz * 30;}
    }

    /* --- player bullets --- */
    for (let i = this.B.length - 1; i >= 0; i--) {
      const b = this.B[i]; b.life -= dt;
      if (b.hom) { // homing missile
        const e = this.nearest(b.x, b.z, 55); if (e) {const want = Math.atan2(e.z - b.z, e.x - b.x), d = angDiff(b.a, want); b.a += clamp(d, -b.hom * dt, b.hom * dt); const s = Math.hypot(b.vx, b.vz) + 40 * dt; b.vx = Math.cos(b.a) * s; b.vz = Math.sin(b.a) * s;}
        if (Math.random() < dt * 50) pt.spawn(b.x, 0, b.z, -b.vx * .1, 0, -b.vz * .1, .35, .9, 1, .7, .3, 1);
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      let dead = b.life <= 0 || Math.hypot(b.x, b.z) > World.ARENA_R + 12;
      if (!dead) for (let k = E.length - 1; k >= 0; k--) {
        const e = E[k]; if (b.hit.has(e)) continue;
        if ((e.x - b.x) ** 2 + (e.z - b.z) ** 2 < (e.r + b.rad) ** 2) {
          b.hit.add(e);
          if (b.kind === 1) {this.explode(b.x, b.z, 0xffa040, .7); for (const o of E.slice()) if ((o.x - b.x) ** 2 + (o.z - b.z) ** 2 < 64) this.damageEnemy(o, b.dmg * (o === e ? 1 : .6)); this.addShake(.25); dead = true; break;}
          const crit = this.crit && Math.random() < this.crit; this.damageEnemy(e, b.dmg * (crit ? 2.5 : 1));
          if (b.pierce > 0) b.pierce--; else {dead = true; break;}
          if (b.kind === 2) {e.vx += b.vx * .25; e.vz += b.vz * .25;}
        }
      }
      if (dead) {if (b.life > 0 && b.kind !== 1) pt.burst(b.x, 0, b.z, 2, 9, .2, .8, this.bCol[0], this.bCol[1], this.bCol[2], 3); this.B[i] = this.B[this.B.length - 1]; this.B.pop();}
    }
    /* --- enemy bullets --- */
    for (let i = this.EB.length - 1; i >= 0; i--) {
      const b = this.EB[i]; b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
      let dead = b.life <= 0 || Math.hypot(b.x, b.z) > World.ARENA_R + 20;
      if (!dead && live && (b.x - P.p.x) ** 2 + (b.z - P.p.z) ** 2 < 3.4 * 3.4) {this.hurt(9, b.x - b.vx, b.z - b.vz); dead = true;}
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
    /* --- rings --- */
    for (const r of this.rings) if (r.m.visible) {r.t += dt / r.life; if (r.t >= 1) {r.m.visible = false; continue;} r.m.scale.setScalar(r.R * (1 - (1 - r.t) ** 3)); r.m.material.opacity = (1 - r.t) * r.op;}

    /* --- instances --- */
    const o = this.tmp;
    this.bm.count = this.B.length; this.B.forEach((b, i) => {o.position.set(b.x, 0, b.z); o.rotation.set(0, Math.atan2(-b.vx, -b.vz), 0); o.scale.set(b.kind === 2 ? 5 : b.kind === 1 ? 2.4 : 1, b.kind === 2 ? .3 : 1, b.kind === 2 ? .6 : 1); o.updateMatrix(); this.bm.setMatrixAt(i, o.matrix);}); this.bm.instanceMatrix.needsUpdate = true;
    this.ebm.count = this.EB.length; this.EB.forEach((b, i) => {o.position.set(b.x, 0, b.z); o.rotation.set(0, 0, 0); const s = 1 + Math.sin(this.t * 20 + i) * .15; o.scale.setScalar(s); o.updateMatrix(); this.ebm.setMatrixAt(i, o.matrix);}); this.ebm.instanceMatrix.needsUpdate = true;
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
      const df = ar < 1 ? .74 : .88, H = 38 * zoom * df, Dz = 25 * zoom * df; this.vr = Math.max(24, H * Math.tan(c.fov * Math.PI / 360) * Math.max(1, ar) * .9);
       const sway = clamp(-P.v.x * .0042, -.14, .14) + Math.sin(this.t * .5) * .006;
      const cs = Math.cos(sway), sn = Math.sin(sway);
      this.shake = Math.max(0, this.shake - dtReal * 2.4); const sk = this.shake * this.shake * 1.6;
      c.position.set(this.cam.look.x + Dz * sn + rnd(-sk, sk), H + rnd(-sk, sk) * .5, this.cam.look.z + Dz * cs + rnd(-sk, sk));
      c.lookAt(this.cam.look.x, 0, this.cam.look.z - 3);
      this.cam.roll += ((-P.v.x * .0018) - this.cam.roll) * (1 - Math.exp(-4 * dtReal)); c.rotateZ(this.cam.roll + rnd(-sk, sk) * .01);
      this.floor.material.uniforms.uC.value.set(P.p.x, 0, P.p.z); this.floor.material.uniforms.uT.value = this.t;
      this.dust.material.uniforms.uC.value.copy(P.p); this.dust.material.uniforms.uPx.value = eng.px; this.dust.material.uniforms.uSp.value = Math.min(1, spd);
      this.sky.position.copy(c.position); this.stars.position.copy(c.position); this.sky.material.uniforms.uT.value = this.t;
      this.eng.key.position.set(P.p.x - 30, 60, P.p.z + 25); this.eng.key.target.position.set(P.p.x, 0, P.p.z);
      if (this.eng.shadowFloor) this.eng.shadowFloor.position.set(P.p.x, -5.9, P.p.z);
    }

    /* --- state / HUD --- */
    if (this.state === 'dying') {this.endT -= dtReal; if (this.endT <= 0) {this.state = 'over'; this.inp.enabled = false; this.ui.over && this.ui.over(this.summary());}}
    this.hudT -= dtReal; if (this.hudT <= 0) {this.hudT = .1; this.ui.hud && this.ui.hud({hp: P.hp, max: P.maxHp, score: this.score, kills: this.kills, coins: Math.floor(this.coins), wave: this.wave, combo: this.combo, dash: clamp(1 - P.dashCd / 1.6, 0, 1), bombs: P.bombs});}
  }

  bomb() {
    const P = this.P; this.ring(P.p.x, P.p.z, 70, 0xffe08a, .8, 1); this.ring(P.p.x, P.p.z, 45, 0xffffff, .5, .8);
    this.eng.particles.burst(P.p.x, 0, P.p.z, Math.round(120 * this.q.burst), 60, 1, 1.8, 1, .85, .45, 1.6);
    this.addShake(1); this.hitStop(.1); this.EB.length = 0;
    for (const e of this.E.slice()) if (Math.hypot(e.x - P.p.x, e.z - P.p.z) < 60) this.damageEnemy(e, 12);
  }
  summary() {return {score: this.score, kills: this.kills, coins: Math.floor(this.coins), wave: this.wave, time: this.t, planet: this.pIdx};}
}
