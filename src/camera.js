// Two ways to look at the floor:
//  - "adult": standing over the game, looking down.
//  - "kid":   lying on your belly, eyes about a foot off the linoleum.
// Drag to turn, right-drag / two fingers to slide, wheel / pinch to zoom.
import * as THREE from 'three';

const KID_EYE = 12;

export class CameraRig {
  constructor(camera, dom, bounds) {
    this.camera = camera;
    this.dom = dom;
    this.bounds = bounds;
    this.wallHeight = 96;
    this.adultDist = 108;
    this.mode = 'adult';
    // Desired and current state; current eases toward desired each frame.
    this.want = { target: new THREE.Vector3(0, 0, 2), yaw: 0, pitch: 0.82, dist: 108 };
    this.cur = { target: this.want.target.clone(), yaw: 0, pitch: 0.82, dist: 108 };
    this.pointers = new Map();
    this.dragged = 0;
    this.onTap = null;
    this.onHover = null;
    this.attract = false;
    this.bind();
  }

  setMode(mode, focus) {
    this.mode = mode;
    const w = this.want;
    if (mode === 'kid') {
      w.dist = 46;
      if (focus) w.target.set(focus.x, 1.2, focus.z);
      else w.target.y = 1.2;
    } else {
      w.dist = this.adultDist;
      w.pitch = 0.82;
      w.target.y = 0;
      if (!focus) w.target.set(0, 0, 2);
    }
  }

  /** Face the camera from `from` toward `to` (used for the kid action cam). */
  lookAcross(from, to, dist) {
    const w = this.want;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    w.yaw = Math.atan2(-dx, -dz);
    w.target.set((from.x + to.x) / 2, this.mode === 'kid' ? 1.2 : 0, (from.z + to.z) / 2);
    if (dist) w.dist = dist;
    this.unwrapYaw();
  }

  focusOn(p, dist) {
    this.want.target.x = p.x;
    this.want.target.z = p.z;
    if (dist) this.want.dist = dist;
  }

  unwrapYaw() {
    const d = this.want.yaw - this.cur.yaw;
    this.want.yaw = this.cur.yaw + Math.atan2(Math.sin(d), Math.cos(d));
  }

  limits() {
    return this.mode === 'kid'
      ? { minDist: 14, maxDist: 110 }
      : { minDist: 40, maxDist: 190, minPitch: 0.45, maxPitch: 1.45 };
  }

  update(dt) {
    const w = this.want;
    const c = this.cur;
    const lim = this.limits();
    if (this.attract) w.yaw += dt * 0.06;
    w.dist = THREE.MathUtils.clamp(w.dist, lim.minDist, lim.maxDist);
    if (this.mode === 'adult') w.pitch = THREE.MathUtils.clamp(w.pitch, lim.minPitch, lim.maxPitch);
    const b = this.bounds;
    w.target.x = THREE.MathUtils.clamp(w.target.x, b.x0 + 10, b.x1 - 10);
    w.target.z = THREE.MathUtils.clamp(w.target.z, b.z0 + b.pad, b.z1 - 10);

    const k = 1 - Math.exp(-dt * 5);
    c.target.lerp(w.target, k);
    c.yaw += (w.yaw - c.yaw) * k;
    c.dist += (w.dist - c.dist) * k;
    // In kid mode the eye height is fixed, so pitch follows distance.
    const wantPitch = this.mode === 'kid' ? Math.asin(THREE.MathUtils.clamp((KID_EYE - c.target.y) / c.dist, 0.02, 0.9)) : w.pitch;
    c.pitch += (wantPitch - c.pitch) * k;

    const cp = Math.cos(c.pitch);
    const pos = new THREE.Vector3(
      c.target.x + c.dist * cp * Math.sin(c.yaw),
      c.target.y + c.dist * Math.sin(c.pitch),
      c.target.z + c.dist * cp * Math.cos(c.yaw),
    );
    // Keep the eye inside the room so walls never swallow the view.
    pos.x = THREE.MathUtils.clamp(pos.x, b.x0 + 3, b.x1 - 3);
    pos.z = THREE.MathUtils.clamp(pos.z, b.z0 + b.pad, b.z1 - 3);
    // Low down, never end up inside the solid parts of the house.
    for (const s of b.solids) {
      if (pos.y > this.wallHeight || pos.x < s.x0 - 3 || pos.x > s.x1 + 3 || pos.z < s.z0 - 3 || pos.z > s.z1 + 3) continue;
      const out = [[s.x0 - 3 - pos.x, 0], [s.x1 + 3 - pos.x, 0], [0, s.z0 - 3 - pos.z], [0, s.z1 + 3 - pos.z]]
        .sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]))[0];
      pos.x += out[0];
      pos.z += out[1];
    }
    this.camera.position.copy(pos);
    const look = c.target.clone();
    if (this.mode === 'kid') look.y += 1.5;
    this.camera.lookAt(look);
  }

  // ------------------------------------------------------------ input

  bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
      if (this.pointers.size === 1) this.dragged = 0;
      this.attract = false;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (this.onHover && e.pointerType === 'mouse') this.onHover(e);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      this.dragged += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 2) {
        this.pinch(e.pointerId, e.clientX, e.clientY);
      } else if (p.button === 2 || p.shift) {
        this.pan(dx, dy);
      } else {
        this.want.yaw -= dx * 0.006;
        if (this.mode === 'adult') this.want.pitch += dy * 0.004;
        else this.want.dist *= 1 + dy * 0.004;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (p && this.dragged < 8 && this.pointers.size === 0 && this.onTap && p.button === 0) this.onTap(e);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.want.dist *= Math.exp(e.deltaY * 0.001);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const step = 6;
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.pan(0, step * 6);
      if (k === 's' || k === 'arrowdown') this.pan(0, -step * 6);
      if (k === 'a' || k === 'arrowleft') this.pan(step * 6, 0);
      if (k === 'd' || k === 'arrowright') this.pan(-step * 6, 0);
      if (k === 'q') this.want.yaw += 0.25;
      if (k === 'e') this.want.yaw -= 0.25;
      if (k === '=' || k === '+') this.want.dist *= 0.85;
      if (k === '-') this.want.dist *= 1.15;
    });
  }

  pan(dx, dy) {
    const s = this.cur.dist * 0.0022;
    const yaw = this.cur.yaw;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.want.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
  }

  pinch(id, x, y) {
    const pts = [...this.pointers.entries()];
    const [a, b] = pts.map(([pid, p]) => (pid === id ? { x, y } : p));
    const [pa, pb] = pts.map(([, p]) => p);
    const before = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    if (before > 0) this.want.dist *= before / after;
    const mx = (a.x + b.x) / 2 - (pa.x + pb.x) / 2;
    const my = (a.y + b.y) / 2 - (pa.y + pb.y) / 2;
    this.pan(mx, my);
  }
}
