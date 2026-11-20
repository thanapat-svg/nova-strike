import * as THREE from 'three';
import {SHIPS, PLANETS, SHIP_IDS} from './data.js';
import {loadSave, persist, ownedShips, defaultHp} from './save.js';
import {PRESETS, ORDER, resolve, detectAuto} from './quality.js';
import {Engine} from './engine.js';
import {Input} from './input.js';
import {Arena} from './arena.js';
import {buildShip} from './ships3d.js';
import * as World from './world.js';
import {spawnBoss} from './boss.js';
import {MODS, MOD_IDS, MOUNTS, SYNS, FAM, activeSyn} from './modules.js';
import {RMETA, RAR, depthLabel, riftEnd} from './rift.js';

const $ = id => document.getElementById(id);
const save = loadSave(); persist(save);
window.__nova = {spawnBoss, save, ui: null, get mode() {return mode;}, launch: m => launch(m), refresh: () => refreshMenu()};

let eng = null, arena = null, hangar = null, mode = 'menu', paused = false, last = performance.now(), clock = 0, lastMode = 'sortie', aSel = 'f';
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
    $('hs').textContent = h.score.toLocaleString(); $('hw').textContent = h.rl || h.wave; $('hwl').textContent = h.rl ? 'RIFT' : 'WAVE'; $('hk').textContent = h.kills; $('hco').textContent = h.coins;
    $('combo').textContent = h.combo > 2 ? 'COMBO ×' + h.combo : '';
    $('odb').firstElementChild.style.transform = `scaleX(${(h.gauge || 0) / 100})`; $('hg').textContent = h.graze || 0;
    const bb = $('bossb'); if (h.boss) {bb.classList.add('on'); $('bn').textContent = h.boss.name + ' · PHASE ' + h.boss.phase; $('bbar').firstElementChild.style.transform = `scaleX(${h.boss.hp})`; $('ba').textContent = h.boss.dying ? 'DESTROYED' : h.boss.armor > 0 ? 'ARMOR ×' + h.boss.armor + ' — BREAK TO EXPOSE CORE' : 'CORE EXPOSED';} else bb.classList.remove('on');
    $('btnDash').style.opacity = h.dash >= 1 ? 1 : .45; $('btnBomb').textContent = 'BOMB ' + h.bombs; $('btnBomb').style.display = h.bombs > 0 ? '' : 'none';
  },
  over(s) {
    save.coins += s.coins; save.stat.kills = (save.stat.kills || 0) + s.kills; save.g3.runs++;
    const T = Math.floor(s.time / 60) + ':' + String(Math.floor(s.time % 60)).padStart(2, '0'), row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    if (s.rift) {
      const c = riftEnd(save, s.rift); persist(save);
      $('ot').textContent = s.rift.won ? 'RIFT CLEARED' : 'RIFT FAILED';
      $('og').innerHTML = row('DEPTH', depthLabel(s.rift.won ? 30 : s.rift.depth)) + row('BEST', depthLabel(save.rift.best)) + row('CRYSTALS', '+' + c + ' ◆') + row('KILLS', s.kills) + row('BOSS', s.bosses) + row('COINS', '+' + s.coins) + row('TIME', T);
    } else {
      save.g3.best[s.planet] = Math.max(save.g3.best[s.planet] || 0, s.score);
      let conq = false;
      if (s.bosses > 0 && !save.pclear[s.planet]) {save.pclear[s.planet] = true; save.punlock = Math.max(save.punlock || 1, s.planet + 2); if (!save.g3.conq.includes(s.planet)) save.g3.conq.push(s.planet); conq = true;}
      persist(save);
      $('ot').textContent = conq ? 'PLANET CONQUERED' : 'RUN COMPLETE';
      $('og').innerHTML = row('SCORE', s.score.toLocaleString()) + row('KILLS', s.kills) + row('WAVE', s.wave) + row('BOSS', s.bosses) + row('GRAZE', s.graze) + row('COINS', '+' + s.coins) + row('TIME', T);
    }
    document.body.classList.remove('od', 'picking'); setBody('over');
  },
  pick(s, cb) {
    input.reset();
    $('pt').textContent = s.title; $('ps').textContent = s.sub || '';
    $('pbody').innerHTML = s.cards ? s.cards.map((c, i) => `<button class="pc r${c.rar}" data-i="${i}" style="--tc:${c.tc}"${s.disabled ? ' disabled' : ''}><span class="rar">${RAR[c.rar]}</span><b>${c.name}</b><small>${c.desc}</small><span class="tg">${c.tag} ${c.tn}${c.tnext ? '/' + c.tnext : ''}</span><span class="lv">${'●'.repeat(c.lvl)}${'○'.repeat(Math.max(0, c.max - c.lvl))}</span>${c.cost ? `<em>${c.cost}</em>` : ''}</button>`).join('')
      : s.doors.map((d, i) => `<button class="pc door" data-i="${i}" style="--tc:${d.c}"><b>${d.name}</b><small>${d.desc}</small></button>`).join('');
    $('pfoot').innerHTML = s.foot || '';
    $('pbtn').innerHTML = (s.reroll > 0 ? `<button class="chip" data-a="re">สุ่มใหม่ ×${s.reroll}</button>` : '') + (s.skip ? `<button class="chip" data-a="skip">ข้าม ${s.skip}</button>` : '') + (s.leave ? `<button class="chip" data-a="leave">${s.leave}</button>` : '');
    const el = $('pick'), t0 = performance.now();
    el.onclick = e => {
      const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled || performance.now() - t0 < 380) return;
      const r = b.dataset.a || +b.dataset.i; el.onclick = null; document.body.classList.remove('picking'); cb(r);
    };
    document.body.classList.add('picking');
  },
  pickHide() {document.body.classList.remove('picking');}
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
  $('bRift').textContent = save.g3.conq.length >= 3 ? 'RIFT · ' + save.rift.cry + ' ◆' : 'RIFT 🔒';
  const q = save.g3.q; $('qrow').innerHTML = ['auto', ...ORDER].map(k => `<button class="chip ${q === k ? 'on' : ''}" data-q="${k}">${k === 'auto' ? 'AUTO' : PRESETS[k].name}</button>`).join('');
}
/* ---------------- armory (hardpoint editor) ---------------- */
function ask(name, cost, bal, yes) {
  $('dN').textContent = name; $('dC').textContent = cost; $('dB').textContent = bal; const d = $('dlg'); d.classList.add('on');
  $('dNo').onclick = () => d.classList.remove('on'); $('dYes').onclick = () => {d.classList.remove('on'); yes();};
}
function myHp() {return save.g3.hp[save.ship] || (save.g3.hp[save.ship] = defaultHp(save.ship));}
function renderArmory() {
  const D = SHIPS[save.ship], hp = myHp(), syn = activeSyn(hp);
  $('aShip').textContent = D.name.toUpperCase() + ' · HARDPOINT LOADOUT'; $('aCoin').textContent = save.coins.toLocaleString() + ' ◈';
  $('aSlots').innerHTML = MOUNTS.map(([k, n]) => `<button class="slot s-${k} ${aSel === k ? 'sel' : ''}" data-k="${k}"><small>${n}</small><b>${hp[k] ? MODS[hp[k]].n : '— ว่าง —'}</b></button>`).join('') + `<div class="slot s-s">${D.name}</div>`;
  $('aMods').innerHTML = MOD_IDS.map(m => {
    const M = MODS[m], own = (save.g3.mods[m] || 0) > 0, here = hp[aSel] === m;
    return `<button class="mod ${own ? '' : 'lk'} ${here ? 'cur' : ''}" data-m="${m}" style="--fc:${FAM[M.fam].c}"><small>${FAM[M.fam].n}</small><b>${M.n}</b><span>${M.d}</span><em>${here ? '✓ ติดตั้งอยู่ในช่องนี้' : own ? 'แตะเพื่อติดตั้ง' : 'ซื้อ ' + M.price.toLocaleString() + ' ◈'}</em></button>`;
  }).join('') + `<button class="mod clr" data-m="">ถอดโมดูลออกจากช่องนี้</button>`;
  const twins = Object.values(syn).filter(s => s.id.startsWith('twin:')), recipes = SYNS.slice().sort((a, b) => (syn[b.id] ? 1 : 0) - (syn[a.id] ? 1 : 0));
  $('aSyn').innerHTML = twins.map(s => `<div class="syn on" style="--fc:${s.c}"><b>${s.n}</b><span>${s.d}</span></div>`).join('')
    + recipes.map(s => `<div class="syn ${syn[s.id] ? 'on' : ''}" style="--fc:${s.c}"><b>${MODS[s.a].n} + ${MODS[s.b].n}</b><i>→ ${s.n}</i><span>${s.d}</span></div>`).join('')
    + `<div class="syn" style="--fc:#fff"><b>TWIN-LINK</b><span>ติดโมดูลเดียวกัน 2 ช่อง → ยิงเร็วขึ้น +25%</span></div>`;
}
function openArmory() {document.body.classList.add('armory'); renderArmory();}
function closeArmory() {document.body.classList.remove('armory'); refreshMenu();}
$('bArm').onclick = openArmory; $('aClose').onclick = closeArmory;
$('aSlots').onclick = e => {const b = e.target.closest('.slot'); if (!b || !b.dataset.k) return; aSel = b.dataset.k; renderArmory();};
$('aMods').onclick = e => {
  const b = e.target.closest('.mod'); if (!b) return; const m = b.dataset.m, hp = myHp();
  if (m === '') {if (!hp[aSel]) return; if (MOUNTS.filter(([k]) => hp[k]).length <= 1) {ui.toast('ต้องมีโมดูลอย่างน้อย 1 ช่อง'); return;} hp[aSel] = null; persist(save); renderArmory(); return;}
  const M = MODS[m];
  if (!(save.g3.mods[m] > 0)) {
    if (save.coins < M.price) {ui.toast('เหรียญไม่พอ ต้องใช้ ' + M.price.toLocaleString() + ' ◈'); return;}
    ask(M.n + ' · ' + M.d, M.price.toLocaleString() + ' ◈', 'คงเหลือหลังซื้อ ' + (save.coins - M.price).toLocaleString() + ' ◈', () => {if (save.coins < M.price) return; save.coins -= M.price; save.g3.mods[m] = 1; hp[aSel] = m; persist(save); renderArmory();});
    return;
  }
  const before = Object.keys(activeSyn(hp)).length; hp[aSel] = m; persist(save); renderArmory();
  const act = activeSyn(hp), nw = Object.values(act).filter(s => !s.id.startsWith('twin:'))[0]; if (Object.keys(act).length > before && nw) ui.toast('FUSION · ' + nw.n);
};
/* ---------------- rift menu ---------------- */
function renderRift() {
  const R = save.rift, M = R.meta, ok = save.g3.conq.length >= 3;
  $('rCry').textContent = R.cry + ' ◆'; $('rInfo').textContent = `BEST ${R.best ? depthLabel(R.best) : '—'}  ·  RUNS ${R.runs}  ·  CLEARS ${R.clears}`;
  $('rGo').disabled = !ok; $('rGo').textContent = ok ? 'ENTER RIFT' : `ยึดดาวให้ครบ 3 ดวง (${save.g3.conq.length}/3)`;
  $('rMeta').innerHTML = Object.keys(RMETA).map(k => {
    const m = RMETA[k], l = M[k], mx = l >= m.m, a = m.d(l), b = mx ? '' : m.d(l + 1);
    return `<div class="rm"><div><b>${m.n}</b><small>${a}${b && b !== a ? ' → ' + b : ''}</small><i>${'●'.repeat(l)}${'○'.repeat(m.m - l)}</i></div><button class="chip" data-k="${k}" ${mx ? 'disabled' : ''}>${mx ? 'MAX' : m.c(l) + ' ◆'}</button></div>`;
  }).join('');
}
$('bRift').onclick = () => {document.body.classList.add('riftm'); renderRift();};
$('rClose').onclick = () => {document.body.classList.remove('riftm'); refreshMenu();};
$('rMeta').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; const k = b.dataset.k, m = RMETA[k], R = save.rift, l = R.meta[k], cost = m.c(l);
  if (R.cry < cost) {ui.toast('คริสตัลไม่พอ ต้องใช้ ' + cost + ' ◆'); return;}
  ask(m.n + ' → LV' + (l + 1), cost + ' ◆', 'คริสตัลคงเหลือหลังซื้อ ' + (R.cry - cost) + ' ◆', () => {if (R.cry < cost) return; R.cry -= cost; R.meta[k]++; persist(save); renderRift();});
};
$('rGo').onclick = () => {document.body.classList.remove('riftm'); launch('rift');};
function pickShip(d) {const l = owned(), i = l.indexOf(save.ship) + d; if (l[i]) {save.ship = l[i]; persist(save); hangar.setShip(save.ship); refreshMenu(); if (document.body.classList.contains('armory')) renderArmory();}}
function pickPlanet(d) {const max = Math.min(PLANETS.length - 1, (save.punlock || 1) - 1); save.g3.planet = Math.max(0, Math.min(max, save.g3.planet + d)); persist(save); refreshMenu();}
$('aPrev').onclick = () => pickShip(-1); $('aNext').onclick = () => pickShip(1);
$('pPrev').onclick = () => pickPlanet(-1); $('pNext').onclick = () => pickPlanet(1);
$('crow').onclick = e => {const k = e.target.dataset && e.target.dataset.c; if (!k) return; const c = save.g3.ctrl; if (k === 'af') c.autoFire = !c.autoFire; else if (k === 'aa') c.aimAssist = !c.aimAssist; else c.cam = k; persist(save); refreshMenu();};
$('qrow').onclick = e => {const k = e.target.dataset && e.target.dataset.q; if (!k) return; save.g3.q = k; persist(save); toHangar(true);};
function launch(m = 'sortie') {
  if (hangar) {hangar.dispose(); hangar = null;}
  lastMode = m; document.body.classList.remove('armory', 'riftm', 'picking');
  eng.particles.points.visible = true; arena.start(save.g3.planet, m); setBody('play'); last = performance.now();
}
function toHangar(rebuild) {
  if (rebuild || !eng) buildEngine(); else {if (arena.state !== 'idle') arena.stop(); if (hangar) hangar.dispose();}
  hangar = new Hangar(); setBody('menu'); refreshMenu();
}
$('go').onclick = () => launch('sortie'); $('again').onclick = () => {arena.stop(); launch(lastMode);};
$('toMenu').onclick = () => {arena.stop(); toHangar(false);};
$('pauseB').onclick = () => setBody('paused'); $('resume').onclick = () => {setBody('play'); last = performance.now();};
$('quit').onclick = () => {if (arena.rift && arena.state !== 'over' && arena.state !== 'idle') {arena.state = 'over'; ui.over(arena.summary()); return;} arena.stop(); toHangar(false);};
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
