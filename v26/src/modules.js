// Weapon modules for the 4 hardpoints (front/left/right/rear), synergies, and the entities they create
// (wormholes, mines, chain lightning).
import * as THREE from 'three';
import {hitBoss} from './boss.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const C = h => new THREE.Color(h);

export const FAM = {kinetic: {n: 'KINETIC', c: '#ffd23a'}, energy: {n: 'ENERGY', c: '#7ff0ff'}, ordnance: {n: 'ORDNANCE', c: '#ff9a3c'}, gravity: {n: 'GRAVITY', c: '#b48cff'}};

export const MODS = {
  blaster:  {n: 'Blaster',  fam: 'kinetic',  price: 0,    rate: 7,   dmg: 1,   spd: 78,  life: 1.1, col: null,      d: 'ปืนกลมาตรฐาน ยิงเร็ว แม่นยำ'},
  spread:   {n: 'Scatter',  fam: 'kinetic',  price: 0,    rate: 3.4, dmg: .75, spd: 66,  life: .8,  col: '#ffe08a', d: 'ลูกซองกระจาย ใกล้แรง'},
  laser:    {n: 'Laser',    fam: 'energy',   price: 0,    rate: 11,  dmg: .55, spd: 120, life: .7,  col: '#7ff0ff', d: 'ลำแสงทะลุศัตรู'},
  missile:  {n: 'Missile',  fam: 'ordnance', price: 0,    rate: 2,   dmg: 3.2, spd: 42,  life: 2.2, col: '#ff9a3c', d: 'จรวดนำวิถี ระเบิดเป็นวง'},
  wave:     {n: 'Wave',     fam: 'energy',   price: 0,    rate: 1.4, dmg: 2.2, spd: 38,  life: 1.1, col: '#ff6ad5', d: 'คลื่นพลาสม่าทะลุทุกอย่าง'},
  arc:      {n: 'Arc',      fam: 'energy',   price: 3500, rate: 3,   dmg: 1.5, spd: 0,   life: 0,   col: '#9fe0ff', d: 'สายฟ้าฟาดต่อเนื่อง กระโดดข้ามศัตรู'},
  mine:     {n: 'Mine',     fam: 'ordnance', price: 2500, rate: 1.1, dmg: 3.5, spd: 0,   life: 0,   col: '#ffb347', d: 'ทิ้งทุ่นระเบิด ติดอาวุธแล้วระเบิดเมื่อศัตรูเข้าใกล้'},
  wormhole: {n: 'Singularity', fam: 'gravity', price: 6000, rate: .55, dmg: 1.3, spd: 24, life: .85, col: '#b48cff', d: 'ลูกแรงโน้มถ่วงเปิดรูหนอนดูดศัตรู'}
};
export const MOD_IDS = Object.keys(MODS);
export const MOUNTS = [['f', 'FRONT'], ['l', 'LEFT'], ['r', 'RIGHT'], ['b', 'REAR']];
export const MOUNT_OFF = {f: 0, r: Math.PI / 2, b: Math.PI, l: -Math.PI / 2};

// fusion weapons (first five keep their v25 ids)
export const SYNS = [
  {id: 'storm',    a: 'blaster', b: 'spread',  n: 'Storm Cannon',     c: '#ffd23a', d: 'ปืนกลยิงเป็นพัด 5 นัด + ลูกซองเพิ่ม 2 นัด'},
  {id: 'swarm',    a: 'missile', b: 'spread',  n: 'Rocket Swarm',     c: '#ff9a3c', d: 'จรวดเพิ่มเป็น 4 ลูก + ลูกซองเพิ่ม'},
  {id: 'rail',     a: 'blaster', b: 'laser',   n: 'Railgun',          c: '#9ff0ff', d: 'เลเซอร์หนา ทะลุทุกอย่าง ดาเมจ ×2.2'},
  {id: 'prism',    a: 'laser',   b: 'wave',    n: 'Prism Sweep',      c: '#e0a0ff', d: 'ลำแสง 5 เส้นกวาดส่ายทั้งจอ'},
  {id: 'helix',    a: 'missile', b: 'wave',    n: 'Plasma Helix',     c: '#ff6ad5', d: 'คลื่นเกลียวคู่ + จรวดนำวิถีเพิ่ม'},
  {id: 'barrage',  a: 'missile', b: 'wormhole', n: 'Black Hole Barrage', c: '#ff7a5a', d: 'รูหนอนดูดศัตรูพร้อมยิงจรวดปูพรมลงกลางรู'},
  {id: 'tesla',    a: 'laser',   b: 'arc',     n: 'Tesla Lance',      c: '#8fd8ff', d: 'สายฟ้ากระโดดไกลขึ้น +2 ทอด ดาเมจ ×1.5'},
  {id: 'horizon',  a: 'mine',    b: 'wormhole', n: 'Event Horizon',   c: '#c08cff', d: 'ทุ่นระเบิดระเบิดแล้วเปิดรูหนอนจิ๋วดูดศัตรู'},
  {id: 'minefield', a: 'missile', b: 'mine',   n: 'Smart Minefield',  c: '#ffb347', d: 'ทุ่นระเบิดยิงจรวดนำวิถี 3 ลูกตอนระเบิด'},
  {id: 'static',   a: 'arc',     b: 'blaster', n: 'Static Rounds',    c: '#a0e8ff', d: 'กระสุนปืนกลมีโอกาสปล่อยสายฟ้าต่อ'},
  {id: 'tsunami',  a: 'wave',    b: 'wormhole', n: 'Gravity Tsunami', c: '#d08cff', d: 'คลื่นพลาสม่าดูดศัตรูเข้าหาแนวคลื่น'}
];
export function activeSyn(mounts) {
  const ids = ['f', 'l', 'r', 'b'].map(k => mounts[k]).filter(Boolean), out = {};
  for (const s of SYNS) if (ids.includes(s.a) && ids.includes(s.b)) out[s.id] = s;
  const cnt = {}; for (const m of ids) cnt[m] = (cnt[m] || 0) + 1;
  for (const m in cnt) if (cnt[m] >= 2) out['twin:' + m] = {id: 'twin:' + m, n: 'Twin-Link ' + MODS[m].n, c: MODS[m].col || '#fff', d: 'ติดตั้งซ้ำสองช่อง ยิงเร็ว +25%'};
  return out;
}

/* ---------------- bullets ---------------- */
function bullet(A, x, z, a, o) {
  if (A.B.length >= 300) return null;
  const spd = o.spd, b = {x, z, vx: Math.cos(a) * spd, vz: Math.sin(a) * spd, a, life: o.life, dmg: o.dmg, pierce: o.pierce || 0, hom: o.hom || 0, rad: o.rad || .9, kind: o.kind || 0, hit: new Set(), c: o.c || A.bColor, sc: o.sc || [1, 1, 1], arc: o.arc || 0, pull: o.pull || 0, mod: o.mod || ''};
  A.B.push(b); return b;
}
export {bullet};

export function shoot(A, ang, mod, mscale) {
  const W = MODS[mod]; if (!W) return;
  const P = A.P, lv = A.wlv, S = A.syn, pt = A.eng.particles, ca = Math.cos(ang), sa = Math.sin(ang);
  const dm = W.dmg * A.dmgMul * (1 + .22 * lv) * mscale * (A.odT > 0 ? 1.5 : 1) * (A.bld ? A.bld.dmgNow() : 1);
  const ox = P.p.x + ca * 2.2, oz = P.p.z + sa * 2.2, col = W.col ? C(W.col) : A.bColor, mk = (a, o = {}) => bullet(A, ox - Math.sin(a) * (o.off || 0), oz + Math.cos(a) * (o.off || 0), a, Object.assign({spd: W.spd, life: W.life, dmg: dm, c: col, mod}, o));
  const px = A.bld ? A.bld.pierce : 0;
  if (mod === 'blaster') {
    if (S.storm) {for (let i = 0; i < 5; i++) mk(ang + (i - 2) * .06, {dm: .8, dmg: dm * .8, arc: S.static ? .3 : 0});}
    else {const n = 1 + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0); for (let i = 0; i < n; i++) mk(ang, {off: (i - (n - 1) / 2) * 1.1, pierce: px, arc: S.static ? .3 : 0});}
  } else if (mod === 'spread') {
    const n = 3 + lv + (S.storm ? 2 : 0) + (S.swarm ? 2 : 0); for (let i = 0; i < n; i++) mk(ang + (i - (n - 1) / 2) * .17, {rad: .8, sc: [.8, .8, .7], pierce: px});
  } else if (mod === 'laser') {
    const rail = S.rail, n = lv >= 2 ? 2 : 1;
    if (S.prism) {const sw = Math.sin(A.t * 3) * .5; for (let i = 0; i < 5; i++) mk(ang + sw + (i - 2) * .09, {pierce: 5 + px, rad: .8, sc: [.8, .8, 3], c: C(['#ff6a6a', '#ffd86a', '#7dff8a', '#6ad8ff', '#c08cff'][i]), dmg: dm * .8});}
    else for (let i = 0; i < n; i++) mk(ang, {pierce: rail ? 99 : 2 + lv + px, off: (i - (n - 1) / 2) * 1.4, rad: rail ? 1.4 : .7, sc: rail ? [1.6, 1.6, 3.4] : [.7, .7, 2.4], dmg: dm * (rail ? 2.2 : 1) * (S.tesla ? 1.3 : 1)});
  } else if (mod === 'missile') {
    const n = 1 + (lv >= 2 ? 1 : 0) + (S.swarm ? 2 : 0) + (S.helix ? 1 : 0); for (let i = 0; i < n; i++) mk(ang + (i - (n - 1) / 2) * .35, {hom: 7, rad: 1.3, kind: 1, sc: [1.6, 1.6, 1.4]});
  } else if (mod === 'wave') {
    if (S.helix) {mk(ang + .22, {pierce: 99, rad: 2.2, kind: 2, sc: [5, .3, .6], pull: S.tsunami ? 1 : 0}); mk(ang - .22, {pierce: 99, rad: 2.2, kind: 2, sc: [5, .3, .6], pull: S.tsunami ? 1 : 0});}
    else mk(ang, {pierce: 99, rad: 2.6, kind: 2, sc: [5, .3, .6], pull: S.tsunami ? 1 : 0});
  } else if (mod === 'wormhole') {
    mk(ang, {kind: 3, rad: 1.6, sc: [2.6, 2.6, 1.2]});
  } else if (mod === 'arc') {
    arcStrike(A, P.p.x, P.p.z, ang, 56, 3 + (S.tesla ? 2 : 0), dm * (S.tesla ? 1.5 : 1), px);
  } else if (mod === 'mine') {
    if (A.MN.length < 16) A.MN.push({x: P.p.x - ca * 2, z: P.p.z - sa * 2, life: 14, arm: .6, dmg: dm});
  }
  if (mod !== 'arc' && mod !== 'mine') pt.burst(P.p.x + ca * 2.4, 0, P.p.z + sa * 2.4, 2, 10, .15, .9, col.r, col.g, col.b, 3);
}

/* ---------------- chain lightning ---------------- */
function zap(A, x0, z0, x1, z1, col) {
  const pt = A.eng.particles, d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, d / 2.2 | 0);
  for (let i = 0; i <= n; i++) {const t = i / n; pt.spawn(x0 + (x1 - x0) * t + rnd(-.7, .7), 0, z0 + (z1 - z0) * t + rnd(-.7, .7), 0, 0, 0, .2, 1.3, col[0], col[1], col[2], 0);}
}
export function arcStrike(A, x, z, ang, range, chains, dmg, px = 0) {
  const col = [.6, .85, 1], seen = new Set(); let cx = x, cz = z, a = ang, first = true;
  for (let c = 0; c <= chains; c++) {
    let best = null, bd = (first ? range : 24) ** 2;
    for (const e of A.E) {if (seen.has(e)) continue; const dx = e.x - cx, dz = e.z - cz, d = dx * dx + dz * dz; if (d >= bd) continue; if (first) {let da = Math.atan2(dz, dx) - a; da = Math.abs(((da + Math.PI) % TAU + TAU) % TAU - Math.PI); if (da > .75) continue;} bd = d; best = e;}
    if (!best && first && A.boss && !A.boss.dying) {const B = A.boss, bx = B.x, bz = B.z, d = Math.hypot(bx - cx, bz - cz); if (d < range + 8) best = {x: bx, z: bz, boss: true};}
    if (!best) break;
    zap(A, cx, cz, best.x, best.z, col); seen.add(best); cx = best.x; cz = best.z; first = false;
    if (best.boss) hitBoss(A, {x: cx, z: cz, rad: 8, hit: new Set()}, dmg * .8); else A.damageEnemy(best, dmg * (1 - c * .12));
  }
  if (first) { // nothing in range: still show a short bolt
    zap(A, x, z, x + Math.cos(ang) * 14, z + Math.sin(ang) * 14, col);
  }
}

/* ---------------- wormholes ---------------- */
export function openHole(A, x, z, small, barrage) {
  if (A.WH.length >= 4) A.WH.shift();
  const h = {x, z, t: 0, life: small ? 1.8 : 2.8, r: small ? 9 : 15, barrage: !!barrage, tick: 0, br: 0};
  A.WH.push(h); A.eng.addShock(x, z, h.r * 1.6, .7, .6); A.ring(x, z, h.r, 0xb48cff, .5, .8);
}
export function initModules(A, q) {
  A.MN = []; A.WH = []; A.whMesh = [];
  const dg = new THREE.CircleGeometry(1, 32); dg.rotateX(-Math.PI / 2);
  const rg = new THREE.RingGeometry(.78, 1, 40); rg.rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(), disc = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: .9, depthWrite: false}));
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({color: 0xb48cff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false}));
    ring.renderOrder = 6; disc.renderOrder = 5; g.add(disc, ring); g.visible = false; A.add(g); A.whMesh.push({g, disc, ring});
  }
  const mg = new THREE.OctahedronGeometry(.9, 0);
  A.mnm = A.add(new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false}), 20)); A.mnm.frustumCulled = false; A.mnm.count = 0;
}

export function updateModules(A, dt) {
  const pt = A.eng.particles, S = A.syn, o = A.tmp;
  // incoming meteors (starfall / carpet bomb): marker ring, falling streak, then impact
  for (let i = A.meteors.length - 1; i >= 0; i--) {
    const m = A.meteors[i]; if (!m.w) {m.w = 1; A.ring(m.x, m.z, 6, 0xff9a3c, Math.max(.2, m.t), .55);}
    m.t -= dt; if (m.t > 0) {pt.spawn(m.x + rnd(-.5, .5), Math.min(22, m.t * 70), m.z, 0, -50, 0, .18, 1.5, 1, .7, .3, 0); continue;}
    A.explode(m.x, m.z, 0xffa040, 1); A.blast(m.x, m.z, 12, 22, m.dmg); A.addShake(.22); A.meteors.splice(i, 1);
  }
  // mines
  for (let i = A.MN.length - 1; i >= 0; i--) {
    const m = A.MN[i]; m.life -= dt; m.arm -= dt; let boom = false;
    if (m.arm <= 0) {for (const e of A.E) if ((e.x - m.x) ** 2 + (e.z - m.z) ** 2 < (e.r + 5.5) ** 2) {boom = true; break;} if (!boom && A.boss && !A.boss.dying && Math.hypot(A.boss.x - m.x, A.boss.z - m.z) < A.boss.cfg.coreR + 9) boom = true;}
    if (boom || m.life <= 0) {
      if (boom) {
        A.explode(m.x, m.z, 0xffb347, .9); A.blast(m.x, m.z, 11, 24, m.dmg * 1.6); A.addShake(.2);
        if (S.horizon) openHole(A, m.x, m.z, true, false);
        if (S.minefield) for (let k = 0; k < 3; k++) bullet(A, m.x, m.z, rnd(0, TAU), {spd: 34, life: 2, dmg: m.dmg * .6, hom: 8, rad: 1.2, kind: 1, c: C('#ff9a3c'), sc: [1.6, 1.6, 1.4]});
      }
      A.MN[i] = A.MN[A.MN.length - 1]; A.MN.pop();
    }
  }
  A.mnm.count = A.MN.length; A.MN.forEach((m, i) => {const armed = m.arm <= 0, s = armed ? 1 + Math.sin(A.t * 9 + i) * .15 : .6; o.position.set(m.x, -4.6, m.z); o.rotation.set(0, A.t * 2, 0); o.scale.setScalar(s); o.updateMatrix(); A.mnm.setMatrixAt(i, o.matrix); A.mnm.setColorAt(i, C(armed ? '#ff5a3a' : '#6a6a6a'));});
  A.mnm.instanceMatrix.needsUpdate = true; if (A.mnm.instanceColor) A.mnm.instanceColor.needsUpdate = true;
  // wormholes
  for (let i = A.WH.length - 1; i >= 0; i--) {
    const h = A.WH[i]; h.t += dt; const k = h.t / h.life; if (k >= 1) {A.WH.splice(i, 1); continue;}
    const R = h.r, pull = 42;
    const pullTo = (e, kk) => {const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz); if (d < R && d > .5) {const f = pull * (1 - d / R) * dt * kk; e.kx += dx / d * f * 2.2; e.kz += dz / d * f * 2.2; return d;} return 1e9;};
    h.tick -= dt; const doTick = h.tick <= 0; if (doTick) h.tick = .4;
    for (const e of A.E.slice()) {const d = pullTo(e, 1 / Math.sqrt(e.r)); if (doTick && d < 6) A.damageEnemy(e, 1.3 * A.dmgMul * (A.bld ? A.bld.dmgNow() : 1));}
    for (const a of A.AS) {const dx = h.x - a.x, dz = h.z - a.z, d = Math.hypot(dx, dz); if (d < R && d > .5) {a.vx += dx / d * pull * .4 * dt / a.r; a.vz += dz / d * pull * .4 * dt / a.r;}}
    for (let j = A.EB.length - 1; j >= 0; j--) {const b = A.EB[j], dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz); if (d < R) {b.vx += dx / (d || 1) * 60 * dt; b.vz += dz / (d || 1) * 60 * dt; if (d < 2.5) {A.EB[j] = A.EB[A.EB.length - 1]; A.EB.pop();}}}
    if (A.boss && !A.boss.dying && doTick && Math.hypot(A.boss.x - h.x, A.boss.z - h.z) < 7 + A.boss.cfg.coreR) hitBoss(A, {x: A.boss.x, z: A.boss.z, rad: 8, hit: new Set()}, 2 * A.dmgMul);
    if (h.barrage) {h.br -= dt; if (h.br <= 0) {h.br = .2; bullet(A, h.x + rnd(-2, 2), h.z + rnd(-2, 2), rnd(0, TAU), {spd: 30, life: 1.6, dmg: 2.4 * A.dmgMul * (1 + .22 * A.wlv), hom: 9, rad: 1.2, kind: 1, c: C('#ff7a5a'), sc: [1.6, 1.6, 1.4]});}}
    // swirling inflow visual
    for (let n = 0; n < (A.q.burst >= 1 ? 3 : 1); n++) {const an = rnd(0, TAU), rr = R * rnd(.6, 1.05); pt.spawn(h.x + Math.cos(an) * rr, 0, h.z + Math.sin(an) * rr, -Math.cos(an) * rr * 1.3 - Math.sin(an) * rr * .7, 0, -Math.sin(an) * rr * 1.3 + Math.cos(an) * rr * .7, .7, 1.1, .7, .45, 1, 0);}
    if (A.eng.heat && Math.random() < .5) A.eng.heat.spawn(h.x, 0, h.z, 0, 0, 0, .4, R * .7, 1, 1, 1, 0);
    if (k > .85) {/* collapse flash */ if (!h.col) {h.col = 1; A.explode(h.x, h.z, 0xb48cff, .8);}}
  }
  A.whMesh.forEach((m, i) => {const h = A.WH[i]; if (!h) {m.g.visible = false; return;} const k = h.t / h.life, s = h.r * (k < .15 ? k / .15 : k > .85 ? (1 - k) / .15 : 1) * .55; m.g.visible = true; m.g.position.set(h.x, -4.5, h.z); m.disc.scale.setScalar(s * .6); m.ring.scale.setScalar(s * 1.05); m.ring.rotation.y = A.t * 3; m.disc.material.opacity = .92;});
}
