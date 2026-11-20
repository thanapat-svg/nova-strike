// Multi-phase bosses built from destructible 3D parts. Armor/turrets break off and fly as physical chunks.
import * as THREE from 'three';
import * as World from './world.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const hexRGB = h => {const c = new THREE.Color(h); return [c.r, c.g, c.b];};

// kinds: turret (shoots), armor (shields the core), pod (spawns drones)
export const BOSSES = {
  mothership: {name: 'MOTHERSHIP', col: 0x3a7aff, coreHp: 150, coreR: 4.6, speed: 7,
    body: [{g: 'cyl', a: [8.5, 10.5, 2.2, 28], y: 0}, {g: 'cyl', a: [5.2, 6.4, 1.4, 20], y: 1.6}],
    parts: [{k: 'turret', x: -9, z: 2.5, r: 2.4, hp: 30}, {k: 'turret', x: 9, z: 2.5, r: 2.4, hp: 30}, {k: 'armor', x: -5.2, z: -7, r: 3.3, hp: 42}, {k: 'armor', x: 5.2, z: -7, r: 3.3, hp: 42}]},
  dreadnought: {name: 'DREADNOUGHT', col: 0xff7a30, coreHp: 190, coreR: 4, speed: 5.5, cz: 7,
    body: [{g: 'box', a: [8, 2.4, 28], y: 0}, {g: 'box', a: [14, 1.4, 9], y: -.2, z: 5}],
    parts: [{k: 'turret', x: -6, z: -3, r: 2.2, hp: 30}, {k: 'turret', x: 6, z: -3, r: 2.2, hp: 30}, {k: 'turret', x: -6, z: -10, r: 2.2, hp: 30}, {k: 'turret', x: 6, z: -10, r: 2.2, hp: 30}, {k: 'armor', x: 0, z: -14.5, r: 4.2, hp: 70}]},
  warden: {name: 'WARDEN', col: 0x5ae0ff, coreHp: 170, coreR: 4.4, speed: 6,
    body: [{g: 'cyl', a: [3, 3, 7, 12], y: 0}],
    parts: [0, 1, 2, 3].map(i => ({k: 'armor', x: 0, z: 0, r: 3, hp: 36, orbit: {R: 10, a0: i * TAU / 4}}))},
  hive: {name: 'HIVE QUEEN', col: 0x5aff8a, coreHp: 160, coreR: 5, speed: 5,
    body: [{g: 'cyl', a: [6.5, 7.5, 2.4, 6], y: 0}],
    parts: [{k: 'pod', x: 0, z: -9, r: 3, hp: 34}, {k: 'pod', x: -8, z: 5, r: 3, hp: 34}, {k: 'pod', x: 8, z: 5, r: 3, hp: 34}]},
  reaper: {name: 'REAPER', col: 0xff3a6a, coreHp: 175, coreR: 3.8, speed: 9,
    body: [{g: 'box', a: [3.2, 2, 14], y: 0}, {g: 'box', a: [18, .8, 3.5], y: -.2, z: 2}],
    parts: [{k: 'armor', x: -9, z: 1, r: 3.2, hp: 46}, {k: 'armor', x: 9, z: 1, r: 3.2, hp: 46}]}
};

function mk(q, col, emi, ei = .35) {
  return q.pbr ? new THREE.MeshStandardMaterial({color: col, metalness: .75, roughness: .38, emissive: emi, emissiveIntensity: ei}) : new THREE.MeshLambertMaterial({color: col, emissive: emi});
}

export function spawnBoss(A, kind) {
  const cfg = BOSSES[kind] || BOSSES.mothership, q = A.q, P = A.P;
  const ang = rnd(0, TAU), D = A.vr * 1.1;
  const B = {cfg, kind, x: P.p.x + Math.cos(ang) * D, z: P.p.z + Math.sin(ang) * D, vx: 0, vz: 0, ry: 0, t: 0, phase: 1, atkT: 2.5, ringT: 3, sprT: 6, spA: 0, spOn: 0, lunge: 0, lungeT: 4, st: 0,
    hp: 0, max: 0, dying: false, dieT: 0, enraged: false, podT: 2, kx: 0, kz: 0};
  const r = Math.hypot(B.x, B.z), RR = World.ARENA_R - 22; if (r > RR) {B.x *= RR / r; B.z *= RR / r;}
  B.max = B.hp = cfg.coreHp * (1 + (A.wave / 5 - 1) * .35 + A.bossKills * .25);
  const g = B.group = new THREE.Group(); g.position.set(B.x, 0, B.z);
  const hullM = mk(q, 0x20242c, cfg.col, .18); B.mats = [hullM]; B.geos = [];
  B.bodies = [];
  for (const b of cfg.body) {
    const geo = b.g === 'cyl' ? new THREE.CylinderGeometry(...b.a) : new THREE.BoxGeometry(...b.a); B.geos.push(geo);
    const m = new THREE.Mesh(geo, hullM); m.position.set(b.x || 0, b.y || 0, b.z || 0); g.add(m); B.bodies.push(m);
  }
  const cz = cfg.cz || 0;
  const coreM = mk(q, 0x101820, cfg.col, 1.6); B.mats.push(coreM);
  const cg = new THREE.IcosahedronGeometry(cfg.coreR, 1); B.geos.push(cg);
  B.core = new THREE.Mesh(cg, coreM); B.core.position.set(0, 1.4, cz); g.add(B.core); B.cz = cz;
  B.coreLight = new THREE.Mesh(new THREE.SphereGeometry(cfg.coreR * 1.5, 12, 8), new THREE.MeshBasicMaterial({color: cfg.col, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
  B.coreLight.position.copy(B.core.position); g.add(B.coreLight); B.geos.push(B.coreLight.geometry); B.mats.push(B.coreLight.material);
  B.parts = cfg.parts.map(pc => {
    const M = mk(q, pc.k === 'armor' ? 0x3a4250 : 0x2a2f38, pc.k === 'pod' ? 0x5aff8a : pc.k === 'turret' ? 0xff4a4a : cfg.col, pc.k === 'armor' ? .12 : .6);
    B.mats.push(M);
    const gr = new THREE.Group();
    if (pc.k === 'turret') {
      const b1 = new THREE.BoxGeometry(pc.r * 1.4, pc.r * .8, pc.r * 1.4), b2 = new THREE.CylinderGeometry(.35, .35, pc.r * 1.6, 8); b2.rotateX(Math.PI / 2); b2.translate(0, 0, -pc.r);
      B.geos.push(b1, b2); gr.add(new THREE.Mesh(b1, M), new THREE.Mesh(b2, M));
    } else if (pc.k === 'pod') {const s = new THREE.SphereGeometry(pc.r, 12, 8); B.geos.push(s); gr.add(new THREE.Mesh(s, M));}
    else {const b1 = new THREE.BoxGeometry(pc.r * 1.9, pc.r * .9, pc.r * 1.5); B.geos.push(b1); gr.add(new THREE.Mesh(b1, M));}
    gr.position.set(pc.x, .9, pc.z); g.add(gr);
    return {cfg: pc, k: pc.k, mesh: gr, mat: M, hp: pc.hp * (1 + A.bossKills * .2), max: pc.hp, alive: true, lx: pc.x, lz: pc.z, r: pc.r, fireT: rnd(.6, 1.6), fl: 0, a: pc.orbit ? pc.orbit.a0 : 0};
  });
  if (q.shadow) g.traverse(o => {if (o.isMesh) o.castShadow = true;});
  A.scene.add(g); A.boss = B;
  A.ui.toast && A.ui.toast('WARNING · ' + cfg.name); A.addShake(.6); A.kick = 1;
  return B;
}

const wp = (B, lx, lz) => {const c = Math.cos(B.ry), s = Math.sin(B.ry); return [B.x + lx * c + lz * s, B.z - lx * s + lz * c];};
export const partPos = (B, p) => wp(B, p.lx, p.lz);
export const corePos = B => wp(B, 0, B.cz);
export const armorLeft = B => B.parts.some(p => p.alive && p.k === 'armor');

function fire(A, x, z, ang, spd, big) {
  if (A.EB.length >= 210) return;
  A.EB.push({x, z, vx: Math.cos(ang) * spd, vz: Math.sin(ang) * spd, life: 5.5, s: big ? 1.9 : 1, r: big ? 4.6 : 3.4});
}
function aimed(A, x, z, n, spread, spd, big) {
  const a0 = Math.atan2(A.P.p.z - z, A.P.p.x - x);
  for (let i = 0; i < n; i++) fire(A, x, z, a0 + (i - (n - 1) / 2) * spread, spd, big);
  A.eng.particles.burst(x, 0, z, 5, 9, .25, 1.1, 1, .4, .3, 3);
}
function ring(A, x, z, n, spd, off, big) {for (let i = 0; i < n; i++) fire(A, x, z, off + i * TAU / n, spd, big); A.ring(x, z, 10, 0xff6a5a, .4, .5);}

function destroyPart(A, B, p) {
  p.alive = false; const [x, z] = partPos(B, p);
  A.explode(x, z, B.cfg.col, 1.5); A.addShake(.55); A.hitStop(.07); A.score += 150; A.blast(x, z, 14, 20, 0);
  const m = p.mesh; A.scene.attach(m);
  const dx = x - B.x, dz = z - B.z, dm = Math.hypot(dx, dz) || 1;
  A.chunks.push({mesh: m, vx: dx / dm * rnd(14, 24), vz: dz / dm * rnd(14, 24), vy: rnd(3, 9), sp: rnd(-4, 4), sp2: rnd(-3, 3), life: 3.2, hp: 1, r: p.r, mats: [p.mat]});
  if (A.ui.toast && p.k === 'armor' && !armorLeft(B)) A.ui.toast('CORE EXPOSED');
}

/** Bullet/explosion hits boss. Returns true if the bullet was absorbed. */
export function hitBoss(A, b, dmg) {
  const B = A.boss; if (!B || B.dying) return false;
  for (const p of B.parts) {
    if (!p.alive || b.hit.has(p)) continue;
    const [x, z] = partPos(B, p);
    if ((x - b.x) ** 2 + (z - b.z) ** 2 < (p.r + b.rad) ** 2) {b.hit.add(p); damagePart(A, B, p, dmg); return true;}
  }
  const [cx, cz] = corePos(B), cr = B.cfg.coreR + b.rad;
  if (!b.hit.has(B) && (cx - b.x) ** 2 + (cz - b.z) ** 2 < cr * cr) {b.hit.add(B); damageCore(A, B, dmg); return true;}
  return false;
}
export function damagePart(A, B, p, d) {
  p.hp -= d * (p.k === 'armor' ? .8 : 1); p.fl = .09; const [px, pz] = partPos(B, p); A.eng.particles.burst(px, 0, pz, 2, 12, .25, .9, 1, .8, .5, 2);
  if (p.hp <= 0) destroyPart(A, B, p);
}
export function damageCore(A, B, d) {
  const shielded = armorLeft(B), k = shielded ? .08 : 1;
  B.hp -= d * k; B.coreFl = .08;
  if (shielded && Math.random() < .3) A.eng.particles.burst(B.x, 1, B.z, 2, 14, .2, .9, .6, .8, 1, 3);
  A.score += 1;
  if (B.hp <= 0 && !B.dying) bossDie(A, B);
}
function bossDie(A, B) {
  B.dying = true; B.dieT = 2.1; A.EB.length = 0; B.chain = 0;
  A.tsHold = 1.6; A.hitStop(.2); A.addShake(1.3);
  for (const p of B.parts) if (p.alive) destroyPart(A, B, p);
  A.ui.toast && A.ui.toast('TARGET DESTROYED');
}
function finishBoss(A, B) {
  const [x, z] = corePos(B);
  A.explode(x, z, B.cfg.col, 3.6); A.ring(x, z, 95, 0xffffff, 1.1, 1); A.ring(x, z, 60, B.cfg.col, .8, .9); A.addShake(1.6); A.hitStop(.15);
  A.blast(x, z, 70, 55, 14); A.shockwave && A.shockwave(x, z);
  for (const m of B.bodies) {A.scene.attach(m); const dx = m.position.x - B.x, dz = m.position.z - B.z, d = Math.hypot(dx, dz) || 1; A.chunks.push({mesh: m, vx: dx / d * rnd(8, 18) + rnd(-6, 6), vz: dz / d * rnd(8, 18) + rnd(-6, 6), vy: rnd(5, 12), sp: rnd(-3, 3), sp2: rnd(-3, 3), life: 3.6, hp: 1, r: 6, mats: []});}
  A.scene.remove(B.group);
  A.bossKills++; A.nextBoss = Math.max(A.nextBoss, A.wave) + 5; A.score += 2000 * A.bossKills; A.coins += (40 + 12 * A.wave) * A.coinMul; A.kills += 6;
  A.bossDead = B; A.boss = null;
  for (const g of B.geos) A._bossGeos.push(g); for (const m of B.mats) A._bossMats.push(m);
}

export function updateBoss(A, dt) {
  const B = A.boss; if (!B) return; const P = A.P, cfg = B.cfg;
  B.t += dt; const hpR = B.hp / B.max;
  if (!B.dying) {
    const ph = hpR > .6 ? 1 : hpR > .3 ? 2 : 3;
    if (ph > B.phase) {B.phase = ph; A.ui.toast && A.ui.toast('PHASE ' + ph); A.addShake(.5); A.ring(B.x, B.z, 40, cfg.col, .7, .8); A.EB.length = 0;}
    if (!armorLeft(B) && !B.enraged && B.parts.some(p => p.k === 'armor')) {B.enraged = true; B.phase = Math.max(B.phase, 2);}
  }
  // ----- movement -----
  const dx = P.p.x - B.x, dz = P.p.z - B.z, d = Math.hypot(dx, dz) || 1;
  let wx = 0, wz = 0, sp = cfg.speed * (1 + (B.phase - 1) * .25);
  if (B.dying) {sp = 0;}
  else if (B.kind === 'reaper') {
    B.lungeT -= dt;
    if (B.st === 0) {const want = A.vr * .8, rad = d - want; wx = dx / d * Math.sign(rad) * Math.min(1, Math.abs(rad) / 10) - dz / d * .8; wz = dz / d * Math.sign(rad) * Math.min(1, Math.abs(rad) / 10) + dx / d * .8; if (B.lungeT <= 0) {B.st = 1; B.lungeT = .9; B.ldx = dx / d; B.ldz = dz / d;}}
    else if (B.st === 1) {sp = 0; B.ldx = dx / d; B.ldz = dz / d; if (B.lungeT <= 0) {B.st = 2; B.lungeT = .75;}}
    else if (B.st === 2) {wx = B.ldx; wz = B.ldz; sp = 64; if (B.lungeT <= 0) {B.st = 0; B.lungeT = 3.2 / (1 + (B.phase - 1) * .3); ring(A, B.x, B.z, 12 + B.phase * 4, 20, rnd(0, TAU));}}
  } else {const want = A.vr * .85, rad = d - want, k = Math.min(1, Math.abs(rad) / 12); wx = dx / d * Math.sign(rad) * k - dz / d * .55; wz = dz / d * Math.sign(rad) * k + dx / d * .55;}
  const acc = B.kind === 'reaper' && B.st === 2 ? 20 : 1.8;
  B.vx += (wx * sp - B.vx) * (1 - Math.exp(-acc * dt)); B.vz += (wz * sp - B.vz) * (1 - Math.exp(-acc * dt));
  B.x += (B.vx + B.kx) * dt; B.z += (B.vz + B.kz) * dt; B.kx *= Math.exp(-3 * dt); B.kz *= Math.exp(-3 * dt);
  const r = Math.hypot(B.x, B.z), RR = World.ARENA_R - 14; if (r > RR) {B.x *= RR / r; B.z *= RR / r;}
  const tryR = Math.atan2(-dx, -dz) + (B.kind === 'reaper' && B.st === 2 ? 0 : 0); let dy = ((tryR - B.ry + Math.PI) % TAU + TAU) % TAU - Math.PI; B.ry += dy * (1 - Math.exp(-(B.st === 1 ? 9 : 1.6) * dt));
  if (B.dying) B.ry += dt * 1.2;
  B.group.position.set(B.x, Math.sin(B.t * 1.2) * .3, B.z); B.group.rotation.y = B.ry;
  // orbiting shields
  for (const p of B.parts) if (p.alive && p.cfg.orbit) {p.a += dt * (.9 + (B.phase - 1) * .5) * (B.dying ? 0 : 1); p.lx = Math.cos(p.a) * p.cfg.orbit.R; p.lz = Math.sin(p.a) * p.cfg.orbit.R; p.mesh.position.set(p.lx, .9, p.lz); p.mesh.rotation.y = -p.a;}
  // flash
  for (const p of B.parts) if (p.alive) {p.fl -= dt; p.mat.emissiveIntensity !== undefined && (p.mat.emissiveIntensity = p.fl > 0 ? 2.2 : (p.k === 'armor' ? .12 : .6));}
  B.coreFl = (B.coreFl || 0) - dt; B.core.scale.setScalar(1 + Math.sin(B.t * 5) * .04 + (B.coreFl > 0 ? .1 : 0)); B.core.rotation.y += dt; B.core.material.emissiveIntensity = (armorLeft(B) ? 1 : 2.4) + Math.sin(B.t * 6) * .3 + (B.coreFl > 0 ? 1.5 : 0);
  // ----- death sequence -----
  if (B.dying) {
    B.dieT -= dt; B.chain -= dt;
    if (B.chain <= 0) {B.chain = .13; const a = rnd(0, TAU), rr = rnd(0, cfg.coreR * 2.4); A.explode(B.x + Math.cos(a) * rr, B.z + Math.sin(a) * rr, Math.random() < .5 ? cfg.col : 0xffb060, 1 + Math.random() * .7); A.addShake(.35);}
    if (B.dieT <= 0) finishBoss(A, B); return;
  }
  // ----- contact -----
  if (A.state === 'play') {
    const [cx, cz] = corePos(B); if ((cx - P.p.x) ** 2 + (cz - P.p.z) ** 2 < (cfg.coreR + P.r) ** 2) A.hurt(20, cx, cz);
    for (const p of B.parts) if (p.alive) {const [x, z] = partPos(B, p); if ((x - P.p.x) ** 2 + (z - P.p.z) ** 2 < (p.r + P.r) ** 2) A.hurt(14, x, z);}
    if (B.kind === 'reaper' && B.st === 2 && d < cfg.coreR + P.r + 8) A.hurt(26, B.x, B.z);
  }
  // ----- attacks -----
  const ph = B.phase, rate = 1 + (ph - 1) * .35, [cx, cz] = corePos(B);
  B.ringT -= dt; B.atkT -= dt;
  if (B.kind === 'mothership') {
    for (const p of B.parts) if (p.alive && p.k === 'turret') {p.fireT -= dt; if (p.fireT <= 0) {p.fireT = 1.9 / rate; const [x, z] = partPos(B, p); aimed(A, x, z, 3, .17, 26);}}
    if (B.ringT <= 0) {B.ringT = 4.6 / rate; ring(A, cx, cz, 10 + ph * 4, 17, rnd(0, TAU));}
    if (ph >= 2) {B.sprT -= dt; if (B.sprT <= 0) {B.spOn = 2.6; B.sprT = 7;} if (B.spOn > 0) {B.spOn -= dt; B.spA += dt * 6; B.atkT -= 0; if ((B.sub = (B.sub || 0) - dt) <= 0) {B.sub = .11 / (ph >= 3 ? 1.4 : 1); fire(A, cx, cz, B.spA, 21); fire(A, cx, cz, B.spA + Math.PI, 21);}}}
  } else if (B.kind === 'dreadnought') {
    for (const p of B.parts) if (p.alive && p.k === 'turret') {p.fireT -= dt; if (p.fireT <= 0) {p.fireT = 1.6 / rate; const [x, z] = partPos(B, p); aimed(A, x, z, 2, .12, 30);}}
    if (B.ringT <= 0) { // curtain of parallel shots aimed at the player
      B.ringT = 4 / rate; const a = Math.atan2(P.p.z - cz, P.p.x - cx), nx = -Math.sin(a), nz = Math.cos(a), n = 7 + ph * 2;
      for (let i = 0; i < n; i++) {const o = (i - (n - 1) / 2) * 3.2; fire(A, cx + nx * o, cz + nz * o, a, 25);}
    }
    if (ph >= 3 && B.atkT <= 0) {B.atkT = 2.2; aimed(A, cx, cz, 1, 0, 20, true);}
  } else if (B.kind === 'warden') {
    if (B.ringT <= 0) {B.ringT = 2.6 / rate; ring(A, cx, cz, 12 + ph * 2, 16, B.t);}
    if (B.atkT <= 0) {B.atkT = 3.2 / rate; aimed(A, cx, cz, 4 + ph, .14, 27);}
  } else if (B.kind === 'hive') {
    B.podT -= dt;
    if (B.podT <= 0) {B.podT = 3.6 / rate; for (const p of B.parts) if (p.alive && p.k === 'pod' && A.E.length < 14) {const [x, z] = partPos(B, p); A.spawnEnemy('drone', x, z);}}
    if (B.ringT <= 0) {B.ringT = 3.8 / rate; ring(A, cx, cz, 8 + ph * 2, 12, rnd(0, TAU), true);}
    if (!B.parts.some(p => p.alive && p.k === 'pod') && A.E.length < 10 && B.atkT <= 0) {B.atkT = 2; A.spawnEnemy('drone', cx, cz);}
  } else if (B.kind === 'reaper') {
    for (const p of B.parts) if (p.alive && B.st === 0) {p.fireT -= dt; if (p.fireT <= 0) {p.fireT = 2.2 / rate; const [x, z] = partPos(B, p); aimed(A, x, z, 2, .2, 28);}}
  }
}

export function updateChunks(A, dt) {
  for (let i = A.chunks.length - 1; i >= 0; i--) {
    const c = A.chunks[i]; c.life -= dt; const m = c.mesh;
    m.position.x += c.vx * dt; m.position.z += c.vz * dt; c.vy -= 8 * dt; m.position.y += c.vy * dt; if (m.position.y < -4.5) {m.position.y = -4.5; c.vy = Math.abs(c.vy) * .3;}
    m.rotation.x += c.sp * dt; m.rotation.z += c.sp2 * dt; const dr = Math.exp(-.6 * dt); c.vx *= dr; c.vz *= dr;
    if (c.hp > 0 && (c.vx * c.vx + c.vz * c.vz) > 80) for (const e of A.E) if ((e.x - m.position.x) ** 2 + (e.z - m.position.z) ** 2 < (e.r + c.r) ** 2) {A.damageEnemy(e, 4); e.kx += c.vx * .5; e.kz += c.vz * .5; c.hp = 0; A.addShake(.2); break;}
    if (Math.random() < dt * 25) A.eng.particles.spawn(m.position.x, m.position.y, m.position.z, rnd(-2, 2), rnd(0, 2), rnd(-2, 2), .5, 1.4, 1, .55, .2, 1.5);
    if (c.life < .5) m.scale.setScalar(Math.max(.01, c.life / .5));
    if (c.life <= 0) {A.scene.remove(m); A.chunks.splice(i, 1);}
  }
}
