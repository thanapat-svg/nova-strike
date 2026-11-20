// Converts the v25 2D ship outlines into real 3D hulls (extruded, bevelled, mirrored).
import * as THREE from 'three';
import {SHIPS, PAINTS} from './data.js';

export const SC = 0.07; // 2D unit -> world unit (Nova is ~4 wide, ~5 long)
const METAL = {light: [.55, .45], chrome: [.95, .2], dark: [.6, .5], black: [.35, .55]}; // [metalness, roughness]

const mirrorPoly = p => p.map(([x, y]) => [-x, y]).reverse();

function partsOf(D) {
  const o = [];
  for (const P of D.parts) {
    if (P.h) {
      const half = P.h, full = [...half, ...half.slice(1, -1).map(([x, y]) => [-x, y]).reverse()];
      o.push({poly: full, P, hull: true});
    } else if (P.s) {o.push({poly: P.s, P}); o.push({poly: mirrorPoly(P.s), P});}
    else if (P.f) o.push({poly: P.f, P});
  }
  return o;
}

function bar(a, b, w, h, mat) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || .01;
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), mat);
  m.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
  m.rotation.y = -Math.atan2(dz, dx);
  return m;
}

export function makeMaterial(color, kind, q, extra = {}) {
  const [mt, rg] = METAL[kind || 'light'];
  if (!q.pbr) return new THREE.MeshLambertMaterial({color, ...extra});
  return new THREE.MeshStandardMaterial({color, metalness: mt, roughness: rg, envMapIntensity: 1.1, ...extra});
}

/** Build a ship. Returns {group, tilt, flames[], engines[], dispose(), radius} */
export function buildShip(id, q, paintId) {
  const D = SHIPS[id] || SHIPS.nova;
  const paint = PAINTS.find(p => p.id === paintId && p.c);
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const geos = [], mats = [];
  const track = (g, m) => {geos.push(g); mats.push(m);};

  const lay = partsOf(D).sort((a, b) => (a.P.z || 0) - (b.P.z || 0));
  lay.forEach(({poly, P, hull}, i) => {
    const sh = new THREE.Shape();
    poly.forEach(([x, y], k) => k ? sh.lineTo(x * SC, y * SC) : sh.moveTo(x * SC, y * SC));
    const depth = (hull ? .62 : .3) * (1 + (P.z || 0) * .06);
    const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: true, bevelThickness: .07, bevelSize: .06, bevelSegments: q.pbr ? 2 : 1, curveSegments: 3});
    g.rotateX(Math.PI / 2);                 // shape XY -> XZ, extrusion goes down
    g.translate(0, (P.z || 0) * .12 + depth * .5, 0);
    let col = new THREE.Color(P.c || '#cccccc');
    if (paint) col.lerp(new THREE.Color(paint.c), .55);
    const mat = makeMaterial(col, P.m, q);
    const m = new THREE.Mesh(g, mat);
    body.add(m); track(g, mat);
  });

  // stripes (flat accent bars on the top surface)
  for (const s of D.stripes || []) {
    const mat = new THREE.MeshBasicMaterial({color: s.c, transparent: true, opacity: s.a || .9});
    const topY = .6;
    for (let side = 0; side < (s.mirror === false ? 1 : 2); side++) {
      const pts = s.pts.map(([x, y]) => [(side ? -x : x) * SC, y * SC]);
      for (let k = 0; k < pts.length - 1; k++) {const b = bar(pts[k], pts[k + 1], (s.w || 1.2) * SC * 1.4, .02, mat); b.position.y = Math.abs(pts[k][0] + pts[k + 1][0]) / 2 < .7 ? topY : .36; body.add(b); }
    }
    mats.push(mat);
  }
  // glow lines
  if (D.glow) {
    const gm = new THREE.MeshBasicMaterial({color: D.glowc || '#59c8ff'});
    mats.push(gm);
    for (const seg of D.glow) for (let side = 0; side < (D.glowM === false ? 1 : 2); side++) {
      const pts = seg.map(([x, y]) => [(side ? -x : x) * SC, y * SC]);
      for (let k = 0; k < pts.length - 1; k++) {const b = bar(pts[k], pts[k + 1], .09, .07, gm); b.position.y = Math.abs(pts[k][0] + pts[k + 1][0]) / 2 < .7 ? .64 : .38; body.add(b);}
    }
  }
  // cockpit canopy
  if (D.cock) {
    const [x, y, rx, ry] = D.cock;
    const g = new THREE.SphereGeometry(1, 14, 10), mat = q.pbr
      ? new THREE.MeshStandardMaterial({color: '#0a2038', metalness: .9, roughness: .08, emissive: D.glass || '#86dcff', emissiveIntensity: .25})
      : new THREE.MeshLambertMaterial({color: '#103050', emissive: '#103a5a'});
    const m = new THREE.Mesh(g, mat);
    m.scale.set(rx * SC * 1.1, rx * SC * .75, ry * SC * 1.2); m.position.set(x * SC, .62, y * SC);
    body.add(m); track(g, mat);
  }
  // engines + exhaust cones
  const flames = [], engines = [];
  const fc = new THREE.Color(D.flame || '#59c8ff');
  const flameGeo = new THREE.ConeGeometry(1, 1, 10, 1, true); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, .5); // base at origin, tip toward +Z (backwards)
  geos.push(flameGeo);
  for (const [x, y, r] of D.eng || [[0, 30, 2.5]]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * SC * 1.05, r * SC * 1.3, .5, 10), makeMaterial('#555a63', 'dark', q));
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x * SC, .3, y * SC + .1); body.add(nozzle); track(nozzle.geometry, nozzle.material);
    const fm = new THREE.MeshBasicMaterial({color: fc, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    const f = new THREE.Mesh(flameGeo, fm);
    f.position.set(x * SC, .3, y * SC + .35); f.scale.set(r * SC * 1.2, r * SC * 1.2, 1.2);
    body.add(f); flames.push({mesh: f, base: r * SC, m: fm}); mats.push(fm);
    engines.push(new THREE.Vector3(x * SC, .3, y * SC + .5));
  }
  let radius = 0;
  for (const {poly} of lay) for (const [x, y] of poly) radius = Math.max(radius, Math.hypot(x, y) * SC);
  group.userData = {id, flameColor: fc, radius};

  return {
    group, body, flames, engines, radius, flameColor: fc,
    setThrust(t, boost) { // t 0..1
      for (const f of flames) {
        const L = .45 + t * 1.5 + (boost ? 1.2 : 0);
        f.mesh.scale.set(f.base * (1.1 + t * .2), f.base * (1.1 + t * .2), L);
        f.m.opacity = .3 + t * .35;
      }
    },
    dispose() {geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());}
  };
}
