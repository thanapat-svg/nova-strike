// Save layer: loads the v25 save as-is and migrates it ADDITIVELY to v26.
// Nothing from v25 is ever deleted or renamed; v26 data lives under save.g3.
import {SHIPS, SHIP_IDS, PLANETS} from './data.js';

export const SAVE_KEY = 'nova_save';
export const BACKUP_KEY = 'nova_save_v25_backup';
export const VERSION = 26;

export const WEAPON_MODS = ['blaster', 'spread', 'laser', 'missile', 'wave'];

const V25_DEFAULTS = () => ({
  coins: 300, owned: ['nova'], ship: 'nova', up: {}, xp: 0, lvl: 1, endlessBest: 0, missions: [],
  daily: {last: '', streak: 0}, punlock: 1, pclear: [], pstars: [], pbest: [], charms: {}, equip: [], set: {},
  newCh: {}, story: {}, ach: {}, title: '', stat: {kills: 0}, pets: {}, pet: '', dailyCh: {k: 0}, dailyClears: 0,
  rushBest: 0, bcols: [], bcol: 'def', kfxs: [], kfx: 'def', paints: [], paint: {}, flames: [], flame: 'def'
});

export const DEFAULT_G3 = () => ({
  mig: null,            // migration receipt (null on a brand-new save)
  q: 'auto',            // graphics preset: auto|low|med|high|ultra
  hp: {},               // per-ship hardpoints {shipId:{f,l,r,b}}  (front/left/right/back)
  mods: {},             // owned weapon modules {id:count}
  conq: [],             // conquered planet indices (derived from pclear)
  planet: 0,            // planet currently selected for the arena
  best: {},             // best score per planet index
  runs: 0,
  ctrl: {sens: 1, aimAssist: true, autoFire: true, stickSide: 'auto'}
});

let raw = null;
export function loadSave() {
  let sv = null;
  try { raw = localStorage.getItem(SAVE_KEY); sv = raw ? JSON.parse(raw) : null; } catch (e) { sv = null; }
  const save = Object.assign(V25_DEFAULTS(), sv || {});
  // keep v25 sub-object defaults the old game expects
  save.set = Object.assign({q: 'auto', sens: 1.3, mute: false, fps: 0, showFps: false, music: .6, sfx: 1, vib: true, btnSide: 'auto'}, save.set || {});
  for (const k of ['charms', 'equip', 'pclear', 'newCh', 'story', 'ach', 'stat', 'pets', 'dailyCh', 'paint', 'pstars', 'pbest', 'up'])
    if (save[k] == null) save[k] = V25_DEFAULTS()[k];
  save.g3 = Object.assign(DEFAULT_G3(), save.g3 || {});
  const fromV = (sv && sv.v) || (sv ? 25 : null);
  if (sv && fromV < VERSION) migrate(save, fromV);
  save.v = VERSION;
  ensureHardpoints(save);
  return save;
}

function migrate(save, fromV) {
  // 1) one-time raw backup of the untouched v25 save (never overwritten)
  try { if (raw && !localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw); } catch (e) {}
  const g = save.g3;
  // 2) conquered planets  <- pclear[]
  g.conq = [];
  for (let i = 0; i < PLANETS.length; i++) if (save.pclear[i]) g.conq.push(i);
  g.planet = Math.min(g.planet || 0, Math.max(0, (save.punlock || 1) - 1));
  // 3) graphics preset <- v25 quality choice
  const q25 = save.set && save.set.q;
  g.q = {high: 'high', med: 'med', low: 'low', lite: 'low', auto: 'auto'}[q25] || 'auto';
  // 4) hardpoints per OWNED ship  <- startWeapon / equipped charms stay in save.equip
  for (const id of save.owned) if (SHIPS[id]) g.hp[id] = defaultHp(id);
  // 5) every weapon module is available once, so v25 players lose nothing
  for (const w of WEAPON_MODS) g.mods[w] = Math.max(g.mods[w] || 0, 1);
  g.mig = {from: fromV, to: VERSION, at: Date.now(), ships: save.owned.length, coins: save.coins, planets: g.conq.length, kills: (save.stat && save.stat.kills) || 0};
}

export function defaultHp(id) {
  const D = SHIPS[id] || SHIPS.nova;
  return {f: D.startWeapon || 'blaster', l: null, r: null, b: null};
}
function ensureHardpoints(save) {
  for (const id of save.owned) if (SHIPS[id] && !save.g3.hp[id]) save.g3.hp[id] = defaultHp(id);
  for (const w of WEAPON_MODS) save.g3.mods[w] = Math.max(save.g3.mods[w] || 0, 1);   // base modules are always owned
  // v25 Rift data (same shape as v25 so both versions can read it) + crates used by Rift clear rewards
  save.rift = Object.assign({cry: 0, best: 0, runs: 0, clears: 0, meta: {}}, save.rift || {});
  save.rift.meta = Object.assign({hp: 0, dmg: 0, reroll: 0, choice: 0, wlv: 0, cry: 0, heal: 0}, save.rift.meta || {});
  save.crates = Object.assign({sup: 0, boss: 0, nova: 0}, save.crates || {});
  // a mount may only hold a module that is owned
  for (const id in save.g3.hp) for (const m of ['f', 'l', 'r', 'b']) {const w = save.g3.hp[id][m]; if (w && !save.g3.mods[w]) save.g3.hp[id][m] = m === 'f' ? 'blaster' : null;}
  if (!SHIPS[save.ship]) save.ship = 'nova';
}

export function persist(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

export const ownedShips = save => SHIP_IDS.filter(id => save.owned.includes(id));
