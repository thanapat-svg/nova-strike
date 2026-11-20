// Nova Rift: roguelike run — 3 sectors x (4 rooms + boss), skill cards with rarity, tag-set bonuses,
// cross-line ultimates, room events (elite, mini-boss, meteor trap, dark shop, rest, treasure).
import * as THREE from 'three';
import {PLANETS} from './data.js';
import {spawnBoss} from './boss.js';
import {openHole, arcStrike, bullet} from './modules.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];

export const RTAG = {
  atk:   {n: 'จู่โจม',      en: 'ASSAULT',    c: '#ff7a5a'},
  crit:  {n: 'มือสังหาร',   en: 'ASSASSIN',   c: '#ffd166'},
  tank:  {n: 'ป้อมปราการ',  en: 'FORTRESS',   c: '#5dffb0'},
  orb:   {n: 'ธาตุเวท',     en: 'ARCANE',     c: '#c08cff'},
  blast: {n: 'ระเบิด',      en: 'DEMOLITION', c: '#ff9a3c'},
  luck:  {n: 'นักพนัน',     en: 'GAMBLER',    c: '#4fd6ff'}
};
export const RAR = ['', 'COMMON', 'RARE', 'LEGENDARY'];
export const SET_DESC = {
  atk:   {3: 'ดาเมจ +15%', 5: 'ดาเมจ +15% · ยิงเร็ว +10%'},
  crit:  {3: 'คริ +10% · แรงคริ +50%', 5: 'คริ +10% · แรงคริ +100%'},
  tank:  {3: 'HP สูงสุด +40 · ฟื้น 1.5/วิ', 5: 'รับดาเมจ -25%'},
  orb:   {3: 'พลังธาตุเวททุกชนิด +1 เลเวล', 5: 'ได้สายฟ้า + ลูกไฟเพิ่ม'},
  blast: {3: 'ศัตรูตายแล้วระเบิดลูกโซ่', 5: 'ได้ระเบิดคืน 1 ลูกทุก 30 วิ'},
  luck:  {3: 'เหรียญ +30% · ดรอปดีขึ้น', 5: 'หลบการโจมตี +15%'}
};
export const LINEFUSE = [
  {a: 'atk',  b: 'crit',  id: 'prism',   n: 'Prism Storm',        d: 'ทุก 10 วิ ยิงกระสุนเกลียว 24 นัดรอบตัว'},
  {a: 'atk',  b: 'blast', id: 'carpet',  n: 'Carpet Bomb',        d: 'ทุก 10 วิ ทิ้งระเบิดปูพรมเป็นเส้นตรงด้านหน้า'},
  {a: 'blast', b: 'orb',  id: 'barrage', n: 'Black Hole Barrage', d: 'ทุก 10 วิ เปิดรูหนอนพร้อมจรวดปูพรมกลางกลุ่มศัตรู'},
  {a: 'crit', b: 'orb',   id: 'tesla',   n: 'Tesla Storm',        d: 'ทุก 10 วิ สายฟ้าฟาด 6 จุดพร้อมกัน'},
  {a: 'tank', b: 'luck',  id: 'pulse',   n: 'Reactive Pulse',     d: 'ทุก 10 วิ คลื่นกระแทกผลักศัตรู + ฟื้น HP 8%'}
];

// perk definitions: r=rarity, m=max stacks, f(b)=stat effect applied per stack, once(A)=instant effect on pick
export const RPK = {
  pw: {n: 'พลังยิง', tag: 'atk', r: 1, m: 5, d: 'ดาเมจ +15%', f: b => {b.dmg *= 1.15;}},
  rf: {n: 'รัวไฟ', tag: 'atk', r: 1, m: 5, d: 'อัตรายิง +12%', f: b => {b.rate *= 1.12;}},
  wl: {n: 'อัปอาวุธ', tag: 'atk', r: 1, m: 4, d: 'อาวุธ +1 เลเวล ทันที', once: A => {A.wlv = Math.min(6, A.wlv + 1);}},
  pi: {n: 'กระสุนทะลวง', tag: 'atk', r: 2, m: 3, d: 'กระสุนทะลุศัตรู +1 ตัว', f: b => {b.pierce += 1;}},
  rr: {n: 'ปืนท้าย', tag: 'atk', r: 1, m: 3, d: 'ยิงไปด้านหลังเพิ่ม', f: b => {b.rear += 1;}},
  od: {n: 'เครื่องปฏิกรณ์', tag: 'atk', r: 2, m: 3, d: 'เกจ OVERDRIVE ชาร์จเร็ว +50%', f: b => {b.odm += .5;}},
  cr: {n: 'ตาเหยี่ยว', tag: 'crit', r: 1, m: 5, d: 'โอกาสคริ +8%', f: b => {b.crit += .08;}},
  cd: {n: 'คมกริบ', tag: 'crit', r: 2, m: 3, d: 'แรงคริติคอล +50%', f: b => {b.cdm += .5;}},
  bk: {n: 'โลหิตคลั่ง', tag: 'crit', r: 2, m: 3, d: 'เลือดต่ำกว่าครึ่ง ดาเมจ +25%', f: b => {b.berserk += 1;}},
  gz: {n: 'เฉียดฉิว', tag: 'crit', r: 2, m: 3, d: 'เฉียดกระสุนแล้วฟื้น HP 0.6', f: b => {b.gzh += .6;}},
  hp: {n: 'เกราะหนา', tag: 'tank', r: 1, m: 5, d: 'HP สูงสุด +25 และฟื้นทันที', once: A => {A.P.maxHp += 25; A.P.hp = Math.min(A.P.maxHp, A.P.hp + 25);}},
  rg: {n: 'ซ่อมตัวเอง', tag: 'tank', r: 2, m: 3, d: 'ฟื้น HP 1/วิ', f: b => {b.regen += 1;}},
  sh: {n: 'โล่สำรอง', tag: 'tank', r: 2, m: 3, d: 'ได้โล่กันกระแทก 1 ครั้งเป็นระยะ', f: b => {b.shieldgen += 1;}},
  vp: {n: 'เขี้ยวแวมไพร์', tag: 'tank', r: 2, m: 3, d: 'ฆ่าศัตรูแล้วฟื้น HP', f: b => {b.vamp += 1;}},
  px: {n: 'ขนนกฟีนิกซ์', tag: 'tank', r: 3, m: 1, d: 'ตายแล้วฟื้น 60% (ครั้งเดียว)', f: b => {b.phoenix = 1;}},
  or: {n: 'ลูกไฟพิทักษ์', tag: 'orb', r: 2, m: 3, d: 'ลูกไฟหมุนรอบยาน ลบกระสุน ชนศัตรูเจ็บ', f: b => {b.orbit += 1;}},
  th: {n: 'สายฟ้าพิโรธ', tag: 'orb', r: 2, m: 3, d: 'ฟ้าผ่าศัตรูเป็นระยะ', f: b => {b.thunder += 1;}},
  sf: {n: 'ดาวตก', tag: 'orb', r: 3, m: 3, d: 'ดาวตกถล่มศัตรูเป็นระยะ', f: b => {b.starfall += 1;}},
  dr: {n: 'โดรนคู่', tag: 'orb', r: 2, m: 2, d: 'ลูกไฟพิทักษ์เพิ่ม 2 ลูก', f: b => {b.orbit += 2;}},
  ch: {n: 'ระเบิดลูกโซ่', tag: 'blast', r: 2, m: 3, d: 'ศัตรูตายแล้วระเบิดใส่ตัวข้างๆ', f: b => {b.chain += 1;}},
  bm: {n: 'คลังระเบิด', tag: 'blast', r: 1, m: 3, d: 'ระเบิด +2 ลูก', once: A => {A.P.bombs = Math.min(9, A.P.bombs + 2);}},
  hl: {n: 'หลุมดำจิ๋ว', tag: 'blast', r: 3, m: 2, d: 'ปล่อยหลุมดำบดศัตรูเป็นระยะ', f: b => {b.hole += 1;}},
  lk: {n: 'ใบโคลเวอร์', tag: 'luck', r: 1, m: 3, d: 'เหรียญ +20%', f: b => {b.coin *= 1.2;}},
  sp: {n: 'เครื่องยนต์เทอร์โบ', tag: 'luck', r: 1, m: 3, d: 'ความเร็วยาน +10%', f: b => {b.spd *= 1.1;}},
  gh: {n: 'วิญญาณพราย', tag: 'luck', r: 2, m: 3, d: 'หลบการโจมตี +10%', f: b => {b.ghost += .1;}},
  mr: {n: 'กระจกสะท้อน', tag: 'luck', r: 2, m: 3, d: 'สะท้อนกระสุนที่โดนกลับไปหาศัตรู', f: b => {b.mirror += 1;}},
  tm: {n: 'นาฬิกาเวลา', tag: 'luck', r: 3, m: 2, d: 'เลือดต่ำ ศัตรูช้าลง', f: b => {b.time += 1;}}
};
export const RROOM = {
  battle:   {n: 'สนามรบ',    c: '#4fd6ff', d: 'ศัตรูทั่วไป · +1 คริสตัล'},
  elite:    {n: 'ห้องอีลิท',  c: '#ffc83d', d: 'อีลิทหลายตัว · +3 คริสตัล · พลังหายากขึ้น'},
  mini:     {n: 'มินิบอส',   c: '#ff6a8a', d: 'บอสย่อส่วน · +4 คริสตัล · พลังหายากขึ้น'},
  meteor:   {n: 'ฝนอุกกาบาต', c: '#ff9a3c', d: 'รอดจากพายุหิน 24 วิ · +2 คริสตัล'},
  rest:     {n: 'จุดพัก',     c: '#5dffb0', d: 'ซ่อมยาน ไม่มีการต่อสู้'},
  treasure: {n: 'คลังสมบัติ', c: '#e07bff', d: 'รับพลังฟรี (หายาก)'},
  shop:     {n: 'ร้านมืด',    c: '#b48cff', d: 'แลก HP สูงสุดกับพลังแรงๆ'},
  boss:     {n: 'ห้องบอส',    c: '#ff4a6a', d: 'บอสเซกเตอร์ · +6 คริสตัล'}
};
export const RMETA = {
  hp:     {n: 'โครงยานเสริม',  d: l => `เริ่มรอบด้วย HP +${l * 15}`, m: 5, c: l => 10 + l * 8},
  dmg:    {n: 'แกนพลังงาน',    d: l => `ดาเมจ +${l * 5}%`, m: 5, c: l => 12 + l * 10},
  reroll: {n: 'เครื่องสุ่มใหม่', d: l => `สุ่มการ์ดใหม่ได้ ${l} ครั้ง/รอบ`, m: 3, c: l => 20 + l * 15},
  choice: {n: 'ตัวเลือกที่ 4',  d: l => l ? 'ได้เลือกการ์ดจาก 4 ใบ' : 'ได้เลือกการ์ดจาก 4 ใบ', m: 1, c: () => 60},
  wlv:    {n: 'คลังอาวุธ',     d: l => `เริ่มด้วยอาวุธ +${l} เลเวล`, m: 2, c: l => 25 + l * 25},
  cry:    {n: 'ตัวสกัดคริสตัล', d: l => `คริสตัล +${l * 20}%`, m: 3, c: l => 30 + l * 20},
  heal:   {n: 'ชุดซ่อมสนาม',   d: l => `จุดพักฟื้นเพิ่ม +${l * 15}%`, m: 3, c: l => 20 + l * 15}
};
export const depthLabel = v => v >= 30 ? 'CLEAR' : `${Math.floor(v / 10) + 1}-${v % 10}`;

/* ---------------- build (perk-derived stats) ---------------- */
export class Build {
  constructor(A) {this.A = A; this.perks = {}; this.tags = {}; this.once = {}; this.reset();}
  reset() {
    Object.assign(this, {dmg: 1, rate: 1, crit: 0, cdm: 0, spd: 1, regen: 0, dr: 1, pierce: 0, odm: 1, coin: 1, vamp: 0, phoenix: 0, orbit: 0, thunder: 0, starfall: 0, hole: 0, chain: 0, shieldgen: 0, ghost: 0, mirror: 0, berserk: 0, rear: 0, time: 0, gzh: 0, bombRe: 0});
  }
  dmgNow() {const A = this.A; return this.dmg * (this.berserk && A.P.hp < A.P.maxHp * .5 ? 1 + .25 * this.berserk : 1);}
  apply() {
    this.reset(); const meta = this.A.save.rift.meta, tags = {}; this.dmg *= 1 + meta.dmg * .05;
    for (const id in this.perks) {const d = RPK[id]; for (let i = 0; i < this.perks[id]; i++) if (d.f) d.f(this); tags[d.tag] = (tags[d.tag] || 0) + this.perks[id];}
    this.tags = tags;
    const n = t => tags[t] || 0;
    if (n('atk') >= 3) this.dmg *= 1.15; if (n('atk') >= 5) {this.dmg *= 1.15; this.rate *= 1.1;}
    if (n('crit') >= 3) {this.crit += .1; this.cdm += .5;} if (n('crit') >= 5) {this.crit += .1; this.cdm += 1;}
    if (n('tank') >= 3) {this.regen += 1.5; if (!this.once.tank3) {this.once.tank3 = 1; this.A.P.maxHp += 40; this.A.P.hp += 40;}} if (n('tank') >= 5) this.dr = .75;
    if (n('orb') >= 3) {for (const k of ['orbit', 'thunder', 'starfall', 'hole']) if (this[k]) this[k] = Math.min(5, this[k] + 1);} if (n('orb') >= 5) {this.thunder += 1; this.orbit += 1;}
    if (n('blast') >= 3) this.chain += 1; if (n('blast') >= 5) this.bombRe = 30;
    if (n('luck') >= 3) this.coin *= 1.3; if (n('luck') >= 5) this.ghost += .15;
    this.A.coinMul = this.A.baseCoinMul * this.coin;
  }
  fusions() {return LINEFUSE.filter(f => (this.tags[f.a] || 0) >= 3 && (this.tags[f.b] || 0) >= 3);}
}

/* ---------------- run director ---------------- */
export class RiftRun {
  constructor(A) {
    this.A = A; const meta = A.save.rift.meta;
    this.sec = 0; this.room = 0; this.type = ''; this.cry = 0; this.rr = meta.reroll; this.state = 'idle'; this.toSpawn = 0; this.spawnT = 0; this.eliteN = 0; this.timer = 0; this.lbl = '';
    this.pl = [pick([0, 1, 2, 3]), pick([4, 5, 6, 7]), pick([8, 9, 10, 11])]; this.ultT = 8; this.orbA = 0; this.thT = 4; this.sfT = 6; this.hlT = 9; this.shT = 8; this.bombT = 30; this.met = []; this.won = false; this.hit = false;
  }
  get depth() {return this.sec * 10 + this.room;}
  begin() {
    const A = this.A, M = A.save.rift.meta, P = A.P;
    P.maxHp += M.hp * 15; P.hp = P.maxHp; A.wlv = Math.min(6, A.wlv + M.wlv);
    A.baseCoinMul = A.coinMul; A.bld.apply(); this.enter('battle', true);
  }
  enter(type, first) {
    const A = this.A; this.room++; this.type = type; this.state = 'room'; this.hit = false; A.state = 'play';
    const L = this.L = 2 + this.sec * 5 + this.room * 1.1; A.wave = Math.max(1, Math.round(L / 1.7));
    A.EB.length = 0; A.ui.pickHide && A.ui.pickHide();
    const planet = PLANETS[A.pIdx];
    if (type === 'rest') {
      const h = .35 + A.save.rift.meta.heal * .15; A.P.hp = Math.min(A.P.maxHp, A.P.hp + A.P.maxHp * h); A.P.shieldOn = true;
      A.ui.toast('REST · ซ่อมยาน +' + Math.round(h * 100) + '%'); A.ring(A.P.p.x, A.P.p.z, 24, 0x5dffb0, .8, .9); this.state = 'wait'; this.timer = 1.6; return;
    }
    if (type === 'treasure') {A.ui.toast('TREASURE'); this.state = 'wait'; this.timer = 1.2; return;}
    if (type === 'shop') {A.ui.toast('DARK SHOP'); this.state = 'wait'; this.timer = 1; return;}
    if (type === 'boss') {
      const ks = ['mothership', 'dreadnought', 'warden', 'hive', 'reaper'], kind = this.sec === 2 ? 'reaper' : (ks.includes(planet.boss) ? planet.boss : pick(ks));
      this.state = 'boss'; A.bossDead = null; const B = spawnBoss(A, kind); B.max = B.hp *= (this.sec + 1) * .8 + .4; return;
    }
    if (type === 'mini') {
      const ks = ['mothership', 'dreadnought', 'warden', 'hive', 'reaper']; this.state = 'boss'; A.bossDead = null; const B = spawnBoss(A, pick(ks)); B.max = B.hp *= .42; B.mini = true;
      for (const p of B.parts) p.hp *= .6; A.ui.toast('MINI-BOSS · ' + B.cfg.name); return;
    }
    if (type === 'meteor') {this.timer = 24; this.toSpawn = 4; this.spawnT = 2; A.ui.toast('METEOR STORM · SURVIVE'); return;}
    this.toSpawn = Math.round((8 + Math.floor(Math.min(L, 18) * 1.2)) * (type === 'elite' ? .75 : 1)); this.spawnT = 1.2; this.eliteN = type === 'elite' ? 3 + this.sec : 0;
    A.ui.toast(`ROOM ${this.sec + 1}-${this.room} · ${RROOM[type].n}`);
  }
  // called every frame while in 'play'
  tick(dt) {
    const A = this.A, P = A.P;
    this.systems(dt);
    if (this.state === 'wait') {this.timer -= dt; if (this.timer <= 0) this.cleared(); return;}
    if (this.state === 'boss') {if (!A.boss && A.bossDead) {A.bossDead = null; this.cry += this.type === 'boss' ? 6 : 4; this.cleared();} return;}
    if (this.type === 'meteor') {
      this.timer -= dt; this.mt = (this.mt || 0) - dt;
      if (this.mt <= 0) {this.mt = .45 - this.sec * .04; const a = rnd(0, TAU), d = A.vr * 1.5, tx = P.p.x + rnd(-14, 14), tz = P.p.z + rnd(-14, 14), x = P.p.x + Math.cos(a) * d, z = P.p.z + Math.sin(a) * d, sp = rnd(20, 34), an = Math.atan2(tz - z, tx - x); if (Math.hypot(x, z) < 124) A.spawnRock(x, z, rnd(1.8, 3.8), Math.cos(an) * sp, Math.sin(an) * sp);}
    }
    if (this.toSpawn > 0) {
      this.spawnT -= dt; const cap = Math.min(10 + this.L * .9, A.q.id === 'low' ? 20 : 34);
      if (this.spawnT <= 0 && A.E.length < cap) {
        this.spawnT = Math.max(.35, 1.3 - this.L * .03); const pool = []; for (const k of ['drone', 'dasher', 'gunner', 'brute']) if (A.wave >= {drone: 0, dasher: 2, gunner: 3, brute: 5}[k]) pool.push(k);
        const w = {drone: 6, dasher: 3, gunner: 2.4, brute: .9}; let tot = 0; for (const k of pool) tot += w[k]; let r = Math.random() * tot, t = pool[0]; for (const k of pool) {r -= w[k]; if (r <= 0) {t = k; break;}}
        const el = this.eliteN > 0; if (el) this.eliteN--; A.spawnEnemy(t, undefined, undefined, el); this.toSpawn--;
      }
    }
    const done = this.type === 'meteor' ? this.timer <= 0 : (this.toSpawn <= 0 && A.E.length === 0);
    if (done) {this.cry += {battle: 1, elite: 3, meteor: 2}[this.type] || 1; if (this.type === 'meteor' && !this.hit) this.cry += 1; this.state = 'wait'; this.timer = .9; A.ui.toast('ROOM CLEAR'); A.ring(P.p.x, P.p.z, 30, 0x56e0ff, .7, .8);}
  }
  cleared() {
    const A = this.A, was = this.type; this.state = 'pick'; A.state = 'pick'; this.lbl = was === 'boss' ? `SECTOR ${this.sec + 1} CLEAR` : was === 'treasure' ? 'TREASURE' : `ROOM ${this.sec + 1}-${this.room} CLEAR`;
    if (was === 'boss') {
      this.sec++; if (this.sec > 2) {this.won = true; A.finish(true); return;}
      this.room = 0; A.retheme(this.pl[this.sec]); A.P.hp = Math.min(A.P.maxHp, A.P.hp + A.P.maxHp * .3); A.ui.toast('SECTOR ' + (this.sec + 1) + ' · +30% HP');
    }
    if (was === 'rest') return this.path();
    if (was === 'shop') return this.shop();
    this.cards(was === 'elite' || was === 'boss' || was === 'treasure' || was === 'mini' ? 1 : 0, () => this.path());
  }
  /* ---- card picking ---- */
  roll(boost) {
    const A = this.A, N = 3 + A.save.rift.meta.choice, pool = Object.keys(RPK).filter(k => (A.bld.perks[k] || 0) < RPK[k].m), out = [];
    while (out.length < N && pool.length) {
      let tot = 0; const w = pool.map(k => {const r = RPK[k].r, v = r === 1 ? 10 : r === 2 ? 5 + boost * 4 : 1.6 + boost * 3; tot += v; return v;});
      let x = Math.random() * tot, i = 0; for (; i < pool.length - 1; i++) {x -= w[i]; if (x <= 0) break;} out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }
  cardData(k) {const d = RPK[k], t = RTAG[d.tag], n = this.A.bld.perks[k] || 0, tn = this.A.bld.tags[d.tag] || 0; return {k, rar: d.r, name: d.n, desc: d.d, tag: t.en, tc: t.c, tn, tnext: tn < 3 ? 3 : tn < 5 ? 5 : 0, lvl: n, max: d.m};}
  take(k) {
    const A = this.A, d = RPK[k], pre = Object.assign({}, A.bld.tags); A.bld.perks[k] = (A.bld.perks[k] || 0) + 1; if (d.once) d.once(A); A.bld.apply();
    for (const t in A.bld.tags) for (const lv of [3, 5]) if ((pre[t] || 0) < lv && A.bld.tags[t] >= lv) A.ui.toast(`${RTAG[t].en} SET ${lv}: ${SET_DESC[t][lv]}`);
    const hadF = this.fusSeen || (this.fusSeen = {}); for (const f of A.bld.fusions()) if (!hadF[f.id]) {hadF[f.id] = 1; A.ui.toast('FUSION · ' + f.n); A.shockwave(A.P.p.x, A.P.p.z); A.addShake(.6);}
    A.ui.popText && A.ui.popText(d.n);
  }
  cards(boost, after) {
    const A = this.A, ks = this.roll(boost); if (!ks.length) return after();
    A.ui.pick({title: 'เลือกพลัง 1 อย่าง', sub: this.lbl, cards: ks.map(k => this.cardData(k)), reroll: this.rr, skip: '+2 ◈', foot: this.synHtml(), cry: this.cry}, (r) => {
      if (r === 're') {this.rr--; return this.cards(boost, after);} if (r === 'skip') {this.cry += 2; return after();}
      this.take(ks[r]); after();
    });
  }
  synHtml() {
    const t = this.A.bld.tags, f = this.A.bld.fusions();
    return Object.keys(t).map(k => `<span class="${t[k] >= 3 ? 'on' : ''}" style="--tc:${RTAG[k].c}">${RTAG[k].en} ${t[k]}</span>`).join('') + f.map(x => `<span class="on fu">★ ${x.n}</span>`).join('');
  }
  /* ---- path (doors) ---- */
  path() {
    const A = this.A; let opts;
    if (this.room >= 4) opts = ['boss']; else {
      const pool = ['battle', 'battle', 'battle', 'elite', 'elite']; if (this.room >= 1) pool.push('rest', 'treasure', 'meteor'); if (this.room >= 2) pool.push('mini', 'shop');
      opts = []; while (opts.length < 2) {const t = pick(pool); if (!opts.includes(t)) opts.push(t);}
    }
    A.ui.pick({title: opts[0] === 'boss' ? 'ห้องบอส' : 'เลือกเส้นทาง', sub: `SECTOR ${this.sec + 1} · ห้อง ${this.room}/4 · ◈ ${this.cry}`, doors: opts.map(t => ({t, name: RROOM[t].n, desc: RROOM[t].d, c: RROOM[t].c})), foot: this.synHtml()}, r => this.enter(opts[r]));
  }
  /* ---- dark shop: trade max HP for a strong card ---- */
  shop() {
    const A = this.A, ks = Object.keys(RPK).filter(k => RPK[k].r >= 2 && (A.bld.perks[k] || 0) < RPK[k].m).sort(() => Math.random() - .5).slice(0, 3);
    if (!ks.length) return this.path();
    const cost = Math.round(A.P.maxHp * .2), can = A.P.maxHp - cost >= 40;
    A.ui.pick({title: 'ร้านมืด', sub: can ? `แลก HP สูงสุด -${cost} กับพลังแรงๆ` : 'HP ไม่พอจะแลก', cards: ks.map(k => Object.assign(this.cardData(k), {cost: '-' + cost + ' HP'})), leave: 'ออกจากร้าน', foot: this.synHtml(), disabled: !can}, r => {
      if (r === 'leave') return this.path();
      A.P.maxHp -= cost; A.P.hp = Math.min(A.P.hp, A.P.maxHp); this.take(ks[r]); A.ring(A.P.p.x, A.P.p.z, 20, 0xff3a5a, .6, .9); this.path();
    });
  }
  /* ---- passive perk systems ---- */
  systems(dt) {
    const A = this.A, b = A.bld, P = A.P, pt = A.eng.particles; if (A.state !== 'play') return;
    if (b.regen) P.hp = Math.min(P.maxHp, P.hp + b.regen * dt);
    if (b.shieldgen) {this.shT -= dt; if (this.shT <= 0 && !P.shieldOn) {P.shieldOn = true; this.shT = Math.max(5, 15 - 3 * b.shieldgen);}}
    if (b.bombRe) {this.bombT -= dt; if (this.bombT <= 0) {this.bombT = b.bombRe; if (P.bombs < 9) {P.bombs++; A.ui.toast('+1 BOMB');}}}
    // orbiting fireballs
    if (b.orbit) {
      const n = b.orbit + 1; this.orbA += dt * 2.4; this.og = (this.og || 0) - dt;
      for (let i = 0; i < n; i++) {
        const a = this.orbA + i * TAU / n, x = P.p.x + Math.cos(a) * 6.5, z = P.p.z + Math.sin(a) * 6.5;
        pt.spawn(x, 0, z, 0, 0, 0, .25, 2.3, 1, .6, .2, 0); pt.spawn(x, 0, z, rnd(-3, 3), 0, rnd(-3, 3), .3, 1.4, 1, .9, .5, 2);
        for (let j = A.EB.length - 1; j >= 0; j--) if ((A.EB[j].x - x) ** 2 + (A.EB[j].z - z) ** 2 < 6) {A.EB[j] = A.EB[A.EB.length - 1]; A.EB.pop();}
        if (this.og <= 0) for (const e of A.E.slice()) if ((e.x - x) ** 2 + (e.z - z) ** 2 < (e.r + 1.6) ** 2) A.damageEnemy(e, 1.6 * A.dmgMul * b.dmgNow());
      }
      if (this.og <= 0) this.og = .35;
    }
    if (b.thunder) {this.thT -= dt; if (this.thT <= 0) {this.thT = Math.max(1.2, 4.6 - .7 * b.thunder); const e = this.rndEnemy(); if (e) {arcStrike(A, e.x, e.z, 0, 30, 1 + b.thunder, 3.5 * A.dmgMul * b.dmgNow()); A.ring(e.x, e.z, 8, 0x9fe0ff, .3, .8);}}}
    if (b.starfall) {this.sfT -= dt; if (this.sfT <= 0) {this.sfT = Math.max(2.5, 7.5 - b.starfall); for (let i = 0; i < 2 + b.starfall; i++) {const e = this.rndEnemy(); if (e) A.meteors.push({x: e.x + rnd(-3, 3), z: e.z + rnd(-3, 3), t: .7, dmg: 5 * A.dmgMul * b.dmgNow()});}}}
    if (b.hole) {this.hlT -= dt; if (this.hlT <= 0) {this.hlT = Math.max(5, 13 - 2.5 * b.hole); const e = A.nearest(P.p.x, P.p.z, A.vr * 1.1); if (e) openHole(A, e.x, e.z, false, false);}}
    // cross-line ultimates
    const fu = b.fusions(); if (fu.length) {
      this.ultT -= dt; if (this.ultT <= 0 && (A.E.length || A.boss)) {
        this.ultT = 10; const f = fu[this.ui = ((this.ui || 0) + 1) % fu.length]; A.ui.toast('★ ' + f.n.toUpperCase()); this.ultimate(f.id);
      }
    }
  }
  rndEnemy() {const A = this.A; if (!A.E.length) return A.boss && !A.boss.dying ? {x: A.boss.x, z: A.boss.z} : null; return A.E[Math.random() * A.E.length | 0];}
  ultimate(id) {
    const A = this.A, P = A.P, dmg = 3 * A.dmgMul * A.bld.dmgNow() * (1 + .22 * A.wlv), C = c => new THREE.Color(c);
    A.shockwave(P.p.x, P.p.z); A.addShake(.5);
    if (id === 'prism') for (let i = 0; i < 24; i++) bullet(A, P.p.x, P.p.z, i * TAU / 24 + this.orbA, {spd: 50 + (i % 3) * 8, life: 1.3, dmg: dmg * .8, pierce: 3, rad: 1, c: C(['#ff6a6a', '#ffd86a', '#7dff8a', '#6ad8ff', '#c08cff'][i % 5]), sc: [1, 1, 2.4]});
    else if (id === 'carpet') for (let i = 0; i < 8; i++) A.meteors.push({x: P.p.x + P.h.x * (10 + i * 7) + rnd(-2, 2), z: P.p.z + P.h.y * (10 + i * 7) + rnd(-2, 2), t: .25 + i * .12, dmg: dmg * 1.5});
    else if (id === 'barrage') {const e = A.nearest(P.p.x, P.p.z, A.vr * 1.2); if (e) openHole(A, e.x, e.z, false, true);}
    else if (id === 'tesla') for (let i = 0; i < 6; i++) {const e = this.rndEnemy(); if (e) arcStrike(A, e.x, e.z, 0, 20, 2, dmg);}
    else if (id === 'pulse') {A.ring(P.p.x, P.p.z, 50, 0x5dffb0, .7, .9); A.blast(P.p.x, P.p.z, 42, 55, 4 * A.dmgMul); P.hp = Math.min(P.maxHp, P.hp + P.maxHp * .08);}
  }
  hudLabel() {const t = RROOM[this.type] ? RROOM[this.type].n : ''; return `${this.sec + 1}-${this.room} ${t}` + (this.type === 'meteor' && this.timer > 0 ? ` ${Math.ceil(this.timer)}s` : '') + ` · ◈${this.cry}`;}
  summary() {return {depth: this.won ? 30 : this.depth, cry: this.cry, won: this.won};}
}

export function riftEnd(save, run) {
  const R = save.rift, M = R.meta; const c = Math.round((run.cry + (run.won ? 15 : 0)) * (1 + M.cry * .2));
  R.cry += c; R.runs++; if (run.won) {R.clears++; save.crates = save.crates || {}; save.crates.nova = (save.crates.nova || 0) + 1;} const d = run.won ? 30 : run.depth; if (d > R.best) R.best = d;
  return c;
}
