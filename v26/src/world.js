// Space backdrop: nebula dome, stars, speed dust, holo floor grid, arena boundary.
import * as THREE from 'three';

export const ARENA_R = 130;
const rgb = a => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255);

export function makeSky(planet, q) {
  const c1 = rgb(planet.neb[0]).multiplyScalar(.7), c2 = rgb(planet.neb[1]).multiplyScalar(.7);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    defines: {OCT: q.nebOct},
    uniforms: {c1: {value: c1}, c2: {value: c2}, uT: {value: 0}},
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 c1,c2; uniform float uT;
      float h(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 d = normalize(vD); float a = 0., amp = .55; vec3 p = d*2.4 + vec3(uT*.004,0.,0.);
        for(int i=0;i<OCT;i++){ a += n(p)*amp; p *= 2.07; amp *= .5; }
        float m = smoothstep(.25,.95,a);
        vec3 col = mix(vec3(.008,.01,.02), mix(c1,c2,smoothstep(-.4,.6,d.y+a*.5)), m*.95);
        col += c2*.05*pow(max(0.,1.-abs(d.y)),4.);
        gl_FragColor = vec4(col,1.); }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

export function makeStars(n) {
  const p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - u * u), R = 800;
    p[i * 3] = Math.cos(t) * r * R; p[i * 3 + 1] = Math.abs(u) * R * .9 + 20; p[i * 3 + 2] = Math.sin(t) * r * R; s[i] = .6 + Math.random() * Math.random() * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {uPx: {value: 1}},
    vertexShader: 'attribute float aS; uniform float uPx; varying float vS; void main(){ vS=aS; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize = aS*uPx; }',
    fragmentShader: 'varying float vS; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,0.,d); gl_FragColor=vec4(vec3(.7,.8,1.)*(.5+vS*.2), a*a); }'
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -9;
  return pts;
}

/** Dust that wraps around the player, gives a strong sense of speed in free-roam. */
export function makeDust(n) {
  const B = 140, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {p[i * 3] = Math.random() * B; p[i * 3 + 1] = (Math.random() - .5) * 50; p[i * 3 + 2] = Math.random() * B;}
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uC: {value: new THREE.Vector3()}, uPx: {value: 600}, uSp: {value: 0}},
    vertexShader: `uniform vec3 uC; uniform float uPx, uSp; varying float vA;
      void main(){ vec3 p = position; float B = ${B}.;
        p.xz = mod(p.xz - uC.xz + B*.5, B) - B*.5 + uC.xz;
        vec4 mv = modelViewMatrix * vec4(p,1.); gl_Position = projectionMatrix*mv;
        vA = .25 + uSp*.5; gl_PointSize = clamp(uPx*.35/max(1.,-mv.z), 1., 5.); }`,
    fragmentShader: 'varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; gl_FragColor=vec4(.6,.85,1.,smoothstep(1.,0.,d)*vA); }'
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}

/** Holographic floor + arena boundary ring, follows the player so it is endless-looking. */
export function makeFloor(planet) {
  const col = rgb(planet.neb[1]).lerp(new THREE.Color(.2, .8, 1), .5);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uC: {value: new THREE.Vector3()}, col: {value: col}, R: {value: ARENA_R}, uT: {value: 0}},
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `varying vec3 vW; uniform vec3 uC,col; uniform float R,uT;
      float line(float v,float w){ float f = abs(fract(v-.5)-.5)/fwidth(v); return 1.-min(f/w,1.); }
      void main(){
        vec2 p = vW.xz; float g = max(line(p.x/10.,1.1), line(p.y/10.,1.1)) * .5 + max(line(p.x/50.,1.4), line(p.y/50.,1.4)) * .5;
        float dc = length(p - uC.xz), r = length(p);
        float fade = smoothstep(150.,10.,dc) * smoothstep(R+60.,R-8.,r);
        float ring = smoothstep(2.5,0.,abs(r-R)) * (.7+.3*sin(uT*3.+r)) + smoothstep(14.,0.,r-R)*step(R,r)*.18;
        float a = g*fade*.34 + ring;
        gl_FragColor = vec4(col*a*1.4, a); }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = -6; m.renderOrder = -5; m.frustumCulled = false;
  return m;
}
