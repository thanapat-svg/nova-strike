// Sandbox physics: asteroids with mass, elastic collisions, shattering; shared blast impulses.
import * as THREE from 'three';
import * as World from './world.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);

export function initAst(A) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {v.fromBufferAttribute(p, i); const n = 1 + (Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 5.7 + v.x * 2.1)) * .22; p.setXYZ(i, v.x * n, v.y * n, v.z * n);}
  g.computeVertexNormals();
  const col = A.planet.bt ? new THREE.Color(A.planet.bt).lerp(new THREE.Color(0x7a6e62), .5) : new THREE.Color(0x77695c);
  const mat = A.q.pbr ? new THREE.MeshStandardMaterial({color: col, roughness: .92, metalness: .08, flatShading: true}) : new THREE.MeshLambertMaterial({color: col, flatShading: true});
  A.am = A.add(new THREE.InstancedMesh(g, mat, 40)); A.am.frustumCulled = false; A.am.count = 0; A.AS = [];
  A.rockCol = [col.r * 1.2, col.g * 1.2, col.b * 1.2];
}

export function spawnAst(A, x, z, r, vx, vz) {
  if (A.AS.length >= 36) return null;
  const a = {x, z, vx, vz, r, m: r * r, hp: r * 3.4, rx: rnd(0, 6), ry: rnd(0, 6), srx: rnd(-1.2, 1.2), sry: rnd(-1.2, 1.2), sx: rnd(.85, 1.15), sz: rnd(.85, 1.15)};
  A.AS.push(a); return a;
}

export function fillAst(A, initial) {
  const target = (A.q.id === 'low' ? 6 : 9) + Math.min(6, A.wave), P = A.P;
  let guard = 20;
  while (A.AS.length < target && guard--) {
    const r = rnd(1.7, 4.4), sp = rnd(2, 9), a = rnd(0, TAU);
    let x, z;
    if (initial) {const rr = rnd(25, World.ARENA_R - 10), th = rnd(0, TAU); x = Math.cos(th) * rr; z = Math.sin(th) * rr; if (Math.hypot(x - P.p.x, z - P.p.z) < 22) continue;}
    else {const d = A.vr * rnd(1.35, 1.7), th = rnd(0, TAU); x = P.p.x + Math.cos(th) * d; z = P.p.z + Math.sin(th) * d; if (Math.hypot(x, z) > World.ARENA_R - r) continue;}
    spawnAst(A, x, z, r, Math.cos(a) * sp, Math.sin(a) * sp);
  }
}

/** radial impulse + optional damage to enemies, asteroids, boss */
export function blast(A, x, z, R, force, dmg) {
  for (const a of A.AS) {const dx = a.x - x, dz = a.z - z, d = Math.hypot(dx, dz); if (d < R && d > .01) {const f = force * (1 - d / R) / Math.sqrt(a.m); a.vx += dx / d * f; a.vz += dz / d * f; if (dmg) a.hp -= dmg * (1 - d / R);}}
  for (const e of A.E.slice()) {const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz); if (d < R && d > .01) {const f = force * (1 - d / R) / Math.sqrt(e.r); e.kx += dx / d * f; e.kz += dz / d * f; if (dmg && !A._inBlast) {A._inBlast = 1; A.damageEnemy(e, dmg * (1 - d / R)); A._inBlast = 0;}}}
  if (A.boss && dmg && !A.boss.dying) {const B = A.boss, tgt = [[...A._corePos(B), B.cfg.coreR, null]]; for (const p of B.parts) if (p.alive) tgt.push([...A._partPos(B, p), p.r, p]);
    for (const [px, pz, pr, p] of tgt) {const d = Math.hypot(px - x, pz - z); if (d < R * .6 + pr) {const f = dmg * (1 - d / (R * .6 + pr)); if (p) A._damagePart(B, p, f); else A._damageCore(B, f);}}}
}

function breakAst(A, a, i) {
  A.AS.splice(i, 1);
  const pt = A.eng.particles, c = A.rockCol;
  pt.burst(a.x, 0, a.z, Math.round(20 * A.q.burst * a.r / 3), 14, .8, 1.3, c[0], c[1], c[2], 1.6);
  A.score += Math.round(a.r * 4); A.addShake(.12 + a.r * .04);
  if (a.r > 2.4) for (let k = 0; k < 2; k++) {const s = k ? 1 : -1, n = spawnAst(A, a.x - a.vz * 0 + s * a.r * .5, a.z + s * a.r * .3, a.r * .6, a.vx + s * rnd(6, 12), a.vz - s * rnd(6, 12)); if (n) n.hp = n.r * 2.6;}
  for (let k = 0; k < Math.min(6, A.q.debris); k++) if (A.DB.length < 88) {const an = rnd(0, TAU), s = rnd(10, 26); A.DB.push({x: a.x, z: a.z, y: 0, vx: Math.cos(an) * s, vz: Math.sin(an) * s, vy: rnd(0, 5), rx: 0, ry: 0, sp: rnd(-8, 8), life: rnd(1, 2), s: rnd(.4, .9)});}
}

function resolve(a, b, ma, mb, e) { // a,b: {x,z,vx,vz}; returns [dva, dvb, speed] or null
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || .001, nx = dx / d, nz = dz / d;
  const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz; if (vn >= 0) return null;
  const j = -(1 + e) * vn / (1 / ma + 1 / mb);
  return {ax: -j * nx / ma, az: -j * nz / ma, bx: j * nx / mb, bz: j * nz / mb, sp: -vn, nx, nz};
}

export function updateAst(A, dt) {
  const AS = A.AS, P = A.P, pt = A.eng.particles, R = World.ARENA_R;
  if (A.state === 'play' && (A.astT = (A.astT || 0) - dt) <= 0) {A.astT = 2; fillAst(A, false);}
  for (let i = AS.length - 1; i >= 0; i--) {
    const a = AS[i]; a.x += a.vx * dt; a.z += a.vz * dt; a.rx += a.srx * dt; a.ry += a.sry * dt;
    const r = Math.hypot(a.x, a.z); if (r > R - a.r) {const nx = a.x / r, nz = a.z / r, vo = a.vx * nx + a.vz * nz; if (vo > 0) {a.vx -= 1.8 * vo * nx; a.vz -= 1.8 * vo * nz;} a.x = nx * (R - a.r); a.z = nz * (R - a.r);}
    const sp = Math.hypot(a.vx, a.vz); if (sp > 40) {a.vx *= 40 / sp; a.vz *= 40 / sp;}
    // vs asteroids
    for (let j = i - 1; j >= 0; j--) {
      const b = AS[j], d2 = (a.x - b.x) ** 2 + (a.z - b.z) ** 2, rr = a.r + b.r; if (d2 >= rr * rr) continue;
      const res = resolve(b, a, b.m, a.m, .75), d = Math.sqrt(d2) || .01;
      const ov = (rr - d) / 2; a.x += (a.x - b.x) / d * ov; a.z += (a.z - b.z) / d * ov; b.x -= (a.x - b.x) / d * ov; b.z -= (a.z - b.z) / d * ov;
      if (res) {b.vx += res.ax; b.vz += res.az; a.vx += res.bx; a.vz += res.bz; if (res.sp > 12) {a.hp -= res.sp * .1; b.hp -= res.sp * .1; pt.burst((a.x + b.x) / 2, 0, (a.z + b.z) / 2, 5, 12, .3, 1, 1, .8, .5, 2);}}
    }
    // vs enemies
    for (const e of A.E) {
      const rr = a.r + e.r; if ((a.x - e.x) ** 2 + (a.z - e.z) ** 2 >= rr * rr) continue;
      const ev = {x: e.x, z: e.z, vx: e.vx + e.kx, vz: e.vz + e.kz}, em = e.r * e.r * 1.3, res = resolve(ev, a, em, a.m, .55);
      const d = Math.hypot(a.x - e.x, a.z - e.z) || .01, ov = rr - d; a.x += (a.x - e.x) / d * ov * .5; a.z += (a.z - e.z) / d * ov * .5; e.x -= (a.x - e.x) / d * ov * .5; e.z -= (a.z - e.z) / d * ov * .5;
      if (res) {e.kx += res.ax; e.kz += res.az; a.vx += res.bx; a.vz += res.bz; if (res.sp > 8) {pt.burst(e.x, 0, e.z, 4, 14, .3, 1, 1, .8, .5, 2); A.damageEnemy(e, (res.sp - 6) * .4 * Math.sqrt(a.m) * .5); a.hp -= res.sp * .08; A.addShake(.08);}}
    }
    // vs player
    if (A.state === 'play') {
      const rr = a.r + P.r; if ((a.x - P.p.x) ** 2 + (a.z - P.p.z) ** 2 < rr * rr) {
        const res = resolve({x: P.p.x, z: P.p.z, vx: P.v.x, vz: P.v.z}, a, 4, a.m, .6), d = Math.hypot(a.x - P.p.x, a.z - P.p.z) || .01;
        P.p.x -= (a.x - P.p.x) / d * (rr - d) * .6; P.p.z -= (a.z - P.p.z) / d * (rr - d) * .6; a.x += (a.x - P.p.x) / d * (rr - d) * .4; a.z += (a.z - P.p.z) / d * (rr - d) * .4;
        if (res) {a.vx += res.bx; a.vz += res.bz; P.v.x += res.ax; P.v.z += res.az; if (res.sp > 6) {if (P.dashT > 0) {a.hp -= 6; pt.burst(a.x, 0, a.z, 5, 14, .3, 1, 1, .8, .5, 2);} else A.hurt(Math.min(22, 5 + res.sp * .45), a.x, a.z);}}
      }
    }
    // vs boss parts / core
    if (A.boss && !A.boss.dying) {
      const B = A.boss, pr = [[...A._corePos(B), B.cfg.coreR, null]]; for (const p of B.parts) if (p.alive) pr.push([...A._partPos(B, p), p.r, p]);
      for (const [x, z, r, p] of pr) {
        const rr = a.r + r, d = Math.hypot(a.x - x, a.z - z); if (d >= rr) continue;
        const nx = (a.x - x) / (d || 1), nz = (a.z - z) / (d || 1), vn = a.vx * nx + a.vz * nz; a.x = x + nx * rr; a.z = z + nz * rr;
        if (vn < 0) {a.vx -= 1.7 * vn * nx; a.vz -= 1.7 * vn * nz; if (-vn > 7) {const dmg = (-vn - 5) * .9; if (p) A._damagePart(B, p, dmg); else A._damageCore(B, dmg); a.hp -= -vn * .12; pt.burst(x + nx * r, 0, z + nz * r, 5, 14, .3, 1, 1, .8, .5, 2); A.addShake(.12);}}
      }
    }
    // absorb enemy bullets (cover)
    for (let k = A.EB.length - 1; k >= 0; k--) {const b = A.EB[k]; if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 < (a.r + .4) ** 2) {pt.burst(b.x, 0, b.z, 3, 8, .2, .8, 1, .5, .3, 3); A.EB[k] = A.EB[A.EB.length - 1]; A.EB.pop();}}
    if (a.hp <= 0) breakAst(A, a, i);
  }
  // instances
  const o = A.tmp; A.am.count = AS.length; o.rotation.order = 'XYZ';
  AS.forEach((a, i) => {o.position.set(a.x, -.5, a.z); o.rotation.set(a.rx, a.ry, 0); o.scale.set(a.r * a.sx, a.r * .9, a.r * a.sz); o.updateMatrix(); A.am.setMatrixAt(i, o.matrix);});
  A.am.instanceMatrix.needsUpdate = true;
}
