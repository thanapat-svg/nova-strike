// Twin-stick input: touch sticks, keyboard+mouse, gamepad. Outputs move/aim vectors in screen space
// (x right, y down) which the arena maps onto the world XZ plane.
export class Input {
  constructor(root) {
    this.mv = {x: 0, y: 0}; this.aim = {x: 0, y: 0}; this.aiming = false; this.fire = false; this.dashReq = false; this.bombReq = false;
    this.keys = {}; this.mouse = {x: 0, y: 0, down: false, has: false}; this.touch = {};
    this.root = root; this.zones = {l: root.querySelector('#stL'), r: root.querySelector('#stR')};
    this.sticks = {l: {id: -1, ox: 0, oy: 0, x: 0, y: 0}, r: {id: -1, ox: 0, oy: 0, x: 0, y: 0}};
    this.enabled = false;
    addEventListener('keydown', e => {this.keys[e.code] = 1; if (this.enabled && e.code === 'Space') {this.dashReq = true; e.preventDefault();} if (this.enabled && e.code === 'KeyB') this.bombReq = true;});
    addEventListener('keyup', e => {this.keys[e.code] = 0;});
    addEventListener('blur', () => {this.keys = {}; this.mouse.down = false;});
    const cv = document, ign = e => e.target.closest && e.target.closest('button,.panel,#menu,#over,#pause');
    addEventListener('mousemove', e => {this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true;});
    cv.addEventListener('mousedown', e => {if (ign(e)) return; if (e.button === 0) this.mouse.down = true; if (e.button === 2) this.dashReq = true;});
    addEventListener('mouseup', () => {this.mouse.down = false;});
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // touch sticks (pointer events on the two zones)
    for (const side of ['l', 'r']) {
      const z = this.zones[side], st = this.sticks[side], knob = z.querySelector('.knob'), base = z.querySelector('.base');
      z.addEventListener('pointerdown', e => {
        if (st.id >= 0) return; st.id = e.pointerId; z.setPointerCapture(e.pointerId);
        const r = z.getBoundingClientRect(); st.ox = e.clientX; st.oy = e.clientY; st.x = st.y = 0;
        base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; base.style.opacity = 1; knob.style.transform = 'translate(-50%,-50%)';
        e.preventDefault();
      });
      z.addEventListener('pointermove', e => {
        if (e.pointerId !== st.id) return; const R = 56;
        let dx = e.clientX - st.ox, dy = e.clientY - st.oy; const d = Math.hypot(dx, dy);
        if (d > R) {dx *= R / d; dy *= R / d;}
        st.x = dx / R; st.y = dy / R; knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
      });
      const up = e => {if (e.pointerId !== st.id) return; st.id = -1; st.x = st.y = 0; base.style.opacity = .35; knob.style.transform = 'translate(-50%,-50%)';};
      z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
    }
    root.querySelector('#btnDash').addEventListener('pointerdown', e => {this.dashReq = true; e.preventDefault(); e.stopPropagation();});
    root.querySelector('#btnBomb').addEventListener('pointerdown', e => {this.bombReq = true; e.preventDefault(); e.stopPropagation();});
  }
  reset() {this.dashReq = false; this.bombReq = false; for (const s of Object.values(this.sticks)) {s.id = -1; s.x = s.y = 0;}}
  /** poll once per frame; cx,cy = player's screen position (for mouse aim) */
  poll(cx, cy) {
    let mx = 0, my = 0, ax = 0, ay = 0, aiming = false, fire = false;
    const k = this.keys;
    mx += (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    my += (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (this.mouse.has && matchMedia('(pointer:fine)').matches) {
      ax = this.mouse.x - cx; ay = this.mouse.y - cy; const d = Math.hypot(ax, ay);
      if (d > 14) {ax /= d; ay /= d; aiming = true;} else ax = ay = 0;
      fire = this.mouse.down || !!k.KeyJ;
    }
    const L = this.sticks.l, R = this.sticks.r;
    if (L.id >= 0) {mx = L.x; my = L.y;}
    if (R.id >= 0) {const d = Math.hypot(R.x, R.y); if (d > .18) {ax = R.x / d; ay = R.y / d; aiming = true; fire = true;}}
    // gamepad
    const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[0];
    if (gp) {
      const dz = v => Math.abs(v) < .18 ? 0 : v;
      const gx = dz(gp.axes[0] || 0), gy = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      if (gx || gy) {mx = gx; my = gy;}
      if (rx || ry) {const d = Math.hypot(rx, ry); ax = rx / d; ay = ry / d; aiming = true; fire = true;}
      if (gp.buttons[0] && gp.buttons[0].pressed && !this._gA) this.dashReq = true; this._gA = gp.buttons[0] && gp.buttons[0].pressed;
      if (gp.buttons[1] && gp.buttons[1].pressed && !this._gB) this.bombReq = true; this._gB = gp.buttons[1] && gp.buttons[1].pressed;
    }
    const m = Math.hypot(mx, my); if (m > 1) {mx /= m; my /= m;}
    this.mv.x = mx; this.mv.y = my; this.aim.x = ax; this.aim.y = ay; this.aiming = aiming; this.fire = fire;
  }
}
