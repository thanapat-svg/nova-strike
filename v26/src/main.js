import * as THREE from 'three';
import {SHIPS, PLANETS, SHIP_IDS} from './data.js';
import {loadSave, persist, ownedShips} from './save.js';
import {PRESETS, ORDER, resolve, detectAuto} from './quality.js';
import {Engine} from './engine.js';
import {Input} from './input.js';
import {Arena} from './arena.js';
import {buildShip} from './ships3d.js';
import * as World from './world.js';
import {spawnBoss} from './boss.js';

const $ = id => document.getElementById(id);
const save = loadSave(); persist(save);
window.__nova = {spawnBoss, save, get mode() {return mode;}};

let eng = null, arena = null, hangar = null, mode = 'menu', paused = false, last = performance.now(), clock = 0;
const input = new Input($('stage'));

function webglOK() {try {const c = document.createElement('canvas'); return !!c.getContext('webgl2');} catch (e) {return false;}}
if (!webglOK()) {$('err').style.display = 'flex';}

/* ---------------- engine (re)build on quality change ---------------- */
function qPreset() {return resolve(save.g3.q === 'auto' ? detectAuto() : save.g3.q);}
function buildEngine() {
  if (hangar) {hangar.dispose(); hangar = null;}
  if (arena) {arena.stop(); arena = null;}
  if (eng) {eng.dispose();}
  const old = $('c'), cv = document.createElement('canvas'); cv.id = 'c'; old.replaceWith(cv);
  eng = new Engine(cv, qPreset()); eng.auto = save.g3.q === 'auto'; eng.onDegrade = d => ui.toast(d === 1 ? 'AUTO: ลดเอฟเฟกต์ภาพบางส่วนเพื่อความลื่น' : 'AUTO: ปิดโพสต์โพรเซสเพื่อความลื่น');
  window.__nova.eng = eng;
  arena = new Arena(eng, save, input, ui);
  window.__nova.arena = arena;
}

/* ---------------- hangar (main menu scene) ---------------- */
class Hangar {
  constructor() {
    const q = eng.q, s = eng.scene;
    this.objs = []; this.rot = 0; this.drag = 0; this.vel = .25; this.t = 0; this.shipObj = null;
    const planet = PLANETS[save.g3.planet] || PLANETS[0];
    this.sky = this.add(World.makeSky(planet, q)); this.stars = this.add(World.makeStars(q.stars)); this.stars.material.uniforms.uPx.value = eng.dpr;
    // pedestal
    const mat = new THREE.MeshStandardMaterial({color: 0x10151c, metalness: .9, roughness: .35});
    this.ped = this.add(new THREE.Mesh(new THREE.CylinderGeometry(9, 10.5, 1.2, 48), mat)); this.ped.position.y = -4;
    const ringM = new THREE.MeshBasicMaterial({color: 0x56e0ff, transparent: true, opacity: .9, toneMapped: false});
    const r1 = this.add(new THREE.Mesh(new THREE.TorusGeometry(9.2, .09, 8, 80), ringM)); r1.rotation.x = Math.PI / 2; r1.position.y = -3.35;
    this.r2 = this.add(new THREE.Mesh(new THREE.TorusGeometry(6.2, .05, 8, 64), ringM)); this.r2.rotation.x = Math.PI / 2; this.r2.position.y = -3.3;
    // holo scan beam: a translucent disc that sweeps up and down the ship
    this.scan = this.add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, .05, 48, 1, true), new THREE.MeshBasicMaterial({color: 0x56e0ff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false})));
    this.cone = this.add(new THREE.Mesh(new THREE.CylinderGeometry(7.6, 9, 12, 40, 1, true), new THREE.MeshBasicMaterial({color: 0x56e0ff, transparent: true, opacity: .035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false}))); this.cone.position.y = 2.6;
    // maintenance drones circling the bay
    this.drones = [];
    const dg = new THREE.OctahedronGeometry(.45, 0), dm = new THREE.MeshStandardMaterial({color: 0x8fa0b0, metalness: .8, roughness: .3, emissive: 0x56e0ff, emissiveIntensity: .6});
    for (let i = 0; i < 3; i++) {const d = this.add(new THREE.Mesh(dg, dm)); this.drones.push({m: d, a: i * 2.1, r: 11 + i * 1.5, h: -1 + i * 2.2, s: .5 + i * .17});}
    this.dust = this.add(World.makeDust(q.dust)); this.dust.material.uniforms.uSp.value = 0;
    this.setShip(save.ship);
    this.ty = innerWidth < innerHeight ? -3.4 : -.8; eng.cam.position.set(0, 5, innerWidth < innerHeight ? 24 : 20); eng.cam.lookAt(0, this.ty, 0);
    this.bind();
  }
  add(o) {eng.scene.add(o); this.objs.push(o); return o;}
  setShip(id) {
    if (this.shipObj) {eng.scene.remove(this.shipObj.group); this.shipObj.dispose();}
    this.shipObj = buildShip(id, eng.q, save.paint && save.paint[id]);
    const g = this.shipObj.group, k = 2.2 / Math.max(.5, this.shipObj.radius / 3.4); g.scale.setScalar(Math.min(2.4, k)); g.position.y = -1.2;
    this.shipObj.setThrust(.35, false); eng.scene.add(g);
  }
  bind() {
    this._d = e => {if (e.target.closest && e.target.closest('button')) return; this.drag = 1; this.lx = e.clientX;};
    this._m = e => {if (this.drag) {this.rot += (e.clientX - this.lx) * .012; this.lx = e.clientX;}};
    this._u = () => {this.drag = 0;};
    addEventListener('pointerdown', this._d); addEventListener('pointermove', this._m); addEventListener('pointerup', this._u);
  }
  update(dt) {
    this.t += dt; if (!this.drag) this.rot += dt * this.vel;
    const g = this.shipObj.group; g.rotation.y = this.rot; g.position.y = -1.2 + Math.sin(this.t * 1.3) * .25; this.shipObj.body.rotation.z = Math.sin(this.t * .9) * .05;
    const u = (Math.sin(this.t * .8) * .5 + .5); this.scan.position.y = -3 + u * 8.5; this.scan.material.opacity = .15 + .35 * (1 - Math.abs(u - .5) * 1.4);
    this.r2.rotation.z = this.t * .5;
    for (const d of this.drones) {d.a += dt * d.s; d.m.position.set(Math.cos(d.a) * d.r, d.h + Math.sin(this.t * 2 + d.a) * .5, Math.sin(d.a) * d.r * .8); d.m.rotation.y += dt * 2;}
    eng.cam.position.x = Math.sin(this.t * .2) * 1.2; eng.cam.lookAt(0, this.ty, 0);
    this.sky.position.copy(eng.cam.position); this.stars.position.copy(eng.cam.position); this.sky.material.uniforms.uT.value = this.t; this.dust.material.uniforms.uC.value.set(0, 0, 0); this.dust.material.uniforms.uPx.value = eng.px;
    const P = eng.particles, en = this.shipObj.engines, c = this.shipObj.flameColor;
    if (eng.q.trail) for (const e of en) {this._v = this._v || new THREE.Vector3(); g.localToWorld(this._v.copy(e).multiplyScalar(1)); P.spawn(this._v.x, this._v.y, this._v.z, rnd(-1, 1), rnd(-.5, .5), rnd(-1, 1), .5, .8, c.r, c.g, c.b, 2);}
  }
  dispose() {
    removeEventListener('pointerdown', this._d); removeEventListener('pointermove', this._m); removeEventListener('pointerup', this._u);
    for (const o of this.objs) {eng.scene.remove(o); o.traverse(c => {c.geometry && c.geometry.dispose(); c.material && c.material.dispose && c.material.dispose();});}
    if (this.shipObj) {eng.scene.remove(this.shipObj.group); this.shipObj.dispose();}
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- UI wiring ---------------- */
let toastT = 0;
const ui = {
  toast(t) {const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 1400);},
  od(on) {document.body.classList.toggle('od', !!on);},
  hurt() {const e = $('hurt'); e.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => e.classList.remove('on')));},
  hud(h) {
    const b = $('hpb'); b.firstElementChild.style.transform = `scaleX(${Math.max(0, h.hp / h.max)})`; b.classList.toggle('low', h.hp / h.max < .3);
    $('hs').textContent = h.score.toLocaleString(); $('hw').textContent = h.wave; $('hk').textContent = h.kills; $('hco').textContent = h.coins;
    $('combo').textContent = h.combo > 2 ? 'COMBO ×' + h.combo : '';
    $('odb').firstElementChild.style.transform = `scaleX(${(h.gauge || 0) / 100})`; $('hg').textContent = h.graze || 0;
    const bb = $('bossb'); if (h.boss) {bb.classList.add('on'); $('bn').textContent = h.boss.name + ' · PHASE ' + h.boss.phase; $('bbar').firstElementChild.style.transform = `scaleX(${h.boss.hp})`; $('ba').textContent = h.boss.dying ? 'DESTROYED' : h.boss.armor > 0 ? 'ARMOR ×' + h.boss.armor + ' — BREAK TO EXPOSE CORE' : 'CORE EXPOSED';} else bb.classList.remove('on');
    $('btnDash').style.opacity = h.dash >= 1 ? 1 : .45; $('btnBomb').textContent = 'BOMB ' + h.bombs; $('btnBomb').style.display = h.bombs > 0 ? '' : 'none';
  },
  over(s) {
    save.coins += s.coins; save.stat.kills = (save.stat.kills || 0) + s.kills; save.g3.runs++;
    save.g3.best[s.planet] = Math.max(save.g3.best[s.planet] || 0, s.score);
    let conq = false;
    if (s.bosses > 0 && !save.pclear[s.planet]) {save.pclear[s.planet] = true; save.punlock = Math.max(save.punlock || 1, s.planet + 2); if (!save.g3.conq.includes(s.planet)) save.g3.conq.push(s.planet); conq = true;}
    persist(save);
    $('ot').textContent = conq ? 'PLANET CONQUERED' : 'RUN COMPLETE';
    $('og').innerHTML = `<span>SCORE</span><b>${s.score.toLocaleString()}</b><span>KILLS</span><b>${s.kills}</b><span>WAVE</span><b>${s.wave}</b><span>BOSS</span><b>${s.bosses}</b><span>GRAZE</span><b>${s.graze}</b><span>COINS</span><b>+${s.coins}</b><span>TIME</span><b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b>`;
    document.body.classList.remove('od'); setBody('over');
  }
};
function setBody(m) {
  document.body.classList.remove('menu', 'play', 'over', 'paused'); document.body.classList.add(m); if (m === 'paused') document.body.classList.add('play');
  paused = m === 'paused'; mode = m === 'paused' ? 'play' : m;
}

const owned = () => ownedShips(save);
function refreshMenu() {
  const id = save.ship, D = SHIPS[id], up = save.up || {}, list = owned(), i = list.indexOf(id);
  $('sn').textContent = D.name.toUpperCase(); $('sp').textContent = D.perk || '';
  $('ss').innerHTML = `<span>HULL <b>${D.hp + (up.hp || 0) * 20}</b></span><span>SPEED <b>${(D.spd * 100 | 0)}</b></span><span>POWER <b>${(D.dmg * 100 | 0)}</b></span><span>RATE <b>${(D.rate * 100 | 0)}</b></span>`;
  const hp = save.g3.hp[id] || {}, nm = {f: 'FRONT', l: 'LEFT', r: 'RIGHT', b: 'REAR'};
  $('shp').innerHTML = ['f', 'l', 'r', 'b'].map(k => `<span class="${hp[k] ? '' : 'em'}">${nm[k]} · ${hp[k] ? hp[k].toUpperCase() : '—'}</span>`).join('');
  $('aPrev').disabled = i <= 0; $('aNext').disabled = i >= list.length - 1;
  $('mc').textContent = save.coins.toLocaleString() + ' ◈';
  const m = save.g3.mig; $('mig').textContent = m ? `ย้ายเซฟ v${m.from} สำเร็จ · ยาน ${m.ships} · ดาวที่ยึด ${save.g3.conq.length}/${PLANETS.length} · ${m.kills.toLocaleString()} kills` : '';
  const p = PLANETS[save.g3.planet] || PLANETS[0]; $('pl').textContent = `${p.en}  ·  ${save.pclear[save.g3.planet] ? 'CONQUERED' : 'UNCONQUERED'}`;
  const c = save.g3.ctrl; $('crow').innerHTML = `<span>CAM</span>` + ['near', 'mid', 'far'].map(k => `<button class="chip ${(c.cam || 'mid') === k ? 'on' : ''}" data-c="${k}">${k.toUpperCase()}</button>`).join('') + `<button class="chip ${c.autoFire ? 'on' : ''}" data-c="af">AUTO-FIRE</button><button class="chip ${c.aimAssist ? 'on' : ''}" data-c="aa">AIM ASSIST</button>`;
  const q = save.g3.q; $('qrow').innerHTML = ['auto', ...ORDER].map(k => `<button class="chip ${q === k ? 'on' : ''}" data-q="${k}">${k === 'auto' ? 'AUTO' : PRESETS[k].name}</button>`).join('');
}
function pickShip(d) {const l = owned(), i = l.indexOf(save.ship) + d; if (l[i]) {save.ship = l[i]; persist(save); hangar.setShip(save.ship); refreshMenu();}}
function pickPlanet(d) {const max = Math.min(PLANETS.length - 1, (save.punlock || 1) - 1); save.g3.planet = Math.max(0, Math.min(max, save.g3.planet + d)); persist(save); refreshMenu();}
$('aPrev').onclick = () => pickShip(-1); $('aNext').onclick = () => pickShip(1);
$('pPrev').onclick = () => pickPlanet(-1); $('pNext').onclick = () => pickPlanet(1);
$('crow').onclick = e => {const k = e.target.dataset && e.target.dataset.c; if (!k) return; const c = save.g3.ctrl; if (k === 'af') c.autoFire = !c.autoFire; else if (k === 'aa') c.aimAssist = !c.aimAssist; else c.cam = k; persist(save); refreshMenu();};
$('qrow').onclick = e => {const k = e.target.dataset && e.target.dataset.q; if (!k) return; save.g3.q = k; persist(save); toHangar(true);};
function launch() {
  if (hangar) {hangar.dispose(); hangar = null;}
  eng.particles.points.visible = true; arena.start(save.g3.planet); setBody('play'); last = performance.now();
}
function toHangar(rebuild) {
  if (rebuild || !eng) buildEngine(); else {if (arena.state !== 'idle') arena.stop(); if (hangar) hangar.dispose();}
  hangar = new Hangar(); setBody('menu'); refreshMenu();
}
$('go').onclick = launch; $('again').onclick = () => {arena.stop(); launch();};
$('toMenu').onclick = () => {arena.stop(); toHangar(false);};
$('pauseB').onclick = () => setBody('paused'); $('resume').onclick = () => {setBody('play'); last = performance.now();};
$('quit').onclick = () => {arena.stop(); toHangar(false);};
addEventListener('keydown', e => {if (e.code === 'Escape' && mode === 'play') setBody(paused ? 'play' : 'paused');});
document.addEventListener('visibilitychange', () => {if (document.hidden && mode === 'play' && !paused) setBody('paused');});

/* ---------------- main loop ---------------- */
const fpsEl = $('fps'); let fAcc = 0, fN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!eng) return;
  let dt = (now - last) / 1000; last = now; if (dt > .25) dt = .25; clock += dt;
  if (!paused) {
    if (mode === 'play' || mode === 'over') arena.update(dt); else if (hangar) hangar.update(dt);
  }
  eng.adapt(dt); eng.render(clock);
  fAcc += dt; fN++; if (fAcc > .5) {fpsEl.textContent = (fN / fAcc | 0) + ' fps · ' + eng.q.name + ' · ×' + eng.dpr.toFixed(2); fAcc = 0; fN = 0;}
}
if (webglOK()) {
  toHangar(true);
  if (/[?&]fps/.test(location.search)) fpsEl.style.display = 'block';
  requestAnimationFrame(frame);
}
