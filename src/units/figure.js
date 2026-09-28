// Builds the plastic army-man figures procedurally. Each pose is described by
// a handful of joint targets; arms and legs are solved with two-bone IK and
// then every part is baked into one merged geometry so a figure is one mesh,
// just like the real one-piece moulded toys.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// Anatomy (inches). A classic figure is ~2.1in tall on its base.
const BASE_H = 0.08;
const THIGH = 0.45;
const SHIN = 0.43;
const UPPER_ARM = 0.33;
const FOREARM = 0.31;
const TORSO = 0.56;

class Builder {
  constructor() {
    this.parts = [];
  }

  add(geo, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    // Keep attribute sets identical for merging.
    if (!geo.index) indexify(geo);
    this.parts.push(geo);
  }

  // Tapered limb from a (radius r1) to b (radius r2) with rounded joints.
  limb(a, b, r1, r2 = r1, seg = 10) {
    const dir = V().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    const geo = new THREE.CylinderGeometry(r2, r1, len, seg, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const m = new THREE.Matrix4().compose(V().addVectors(a, b).multiplyScalar(0.5), q, V(1, 1, 1));
    this.add(geo, m);
    this.ball(a, r1, seg);
    this.ball(b, r2, seg);
  }

  ball(p, r, seg = 10, scale = V(1, 1, 1), q = new THREE.Quaternion()) {
    const geo = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3));
    this.add(geo, new THREE.Matrix4().compose(p, q, scale));
  }

  box(center, size, q = new THREE.Quaternion(), radius = 0) {
    const geo = radius > 0
      ? new RoundedBoxGeometry(size.x, size.y, size.z, 2, radius)
      : new THREE.BoxGeometry(size.x, size.y, size.z);
    this.add(geo, new THREE.Matrix4().compose(center, q, V(1, 1, 1)));
  }

  // Cylinder along a local frame axis.
  cyl(a, b, r1, r2 = r1, seg = 12, closed = true) {
    const dir = V().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r2, r1, len, seg, 1, !closed);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    this.add(geo, new THREE.Matrix4().compose(V().addVectors(a, b).multiplyScalar(0.5), q, V(1, 1, 1)));
  }

  // Run fn with a Builder whose output is transformed by the frame matrix.
  local(matrix, fn) {
    const sub = new Builder();
    fn(sub);
    for (const g of sub.parts) this.parts.push(g.applyMatrix4(matrix));
  }

  build() {
    const clean = this.parts.map((g) => {
      const keep = new THREE.BufferGeometry();
      keep.setIndex(g.index);
      keep.setAttribute('position', g.attributes.position);
      keep.setAttribute('normal', g.attributes.normal);
      return keep;
    });
    const merged = mergeGeometries(clean, false);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

function indexify(geo) {
  const n = geo.attributes.position.count;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  geo.setIndex(idx);
  return geo;
}

// Orthonormal frame with columns (left, up, forward). "left" is the figure's
// own left hand side, which keeps the basis right-handed.
function frame(origin, left, up) {
  const u = up.clone().normalize();
  const l = left.clone().sub(u.clone().multiplyScalar(left.dot(u))).normalize();
  const f = V().crossVectors(l, u);
  const m = new THREE.Matrix4().makeBasis(l, u, f);
  m.setPosition(origin);
  return { m, l, u, f, o: origin.clone() };
}

// Frame for a weapon: forward from butt to muzzle, with an up hint.
function aimFrame(from, to, upHint = UP) {
  const f = V().subVectors(to, from).normalize();
  const l = V().crossVectors(upHint, f).normalize();
  const u = V().crossVectors(f, l);
  const m = new THREE.Matrix4().makeBasis(l, u, f);
  m.setPosition(from);
  return { m, l, u, f, o: from.clone(), len: from.distanceTo(to) };
}

const at = (fr, x, y, z) => V(x, y, z).applyMatrix4(fr.m);

function solveIK(root, target, l1, l2, pole) {
  const toT = V().subVectors(target, root);
  let d = toT.length();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = toT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
  p.normalize();
  const mid = root.clone().add(dir.clone().multiplyScalar(a)).add(p.multiplyScalar(h));
  const end = root.clone().add(dir.multiplyScalar(d));
  return { mid, end };
}

// ---------------------------------------------------------------- body parts

function torso(b, pelvis, chest, left, opts = {}) {
  const fr = frame(pelvis, left, V().subVectors(chest, pelvis));
  const len = pelvis.distanceTo(chest);
  b.local(fr.m, (s) => {
    // Trunk: tapered and flattened front-to-back.
    const trunk = new THREE.CylinderGeometry(0.2, 0.16, len * 0.8, 16, 1, true);
    s.add(trunk, new THREE.Matrix4().compose(V(0, len * 0.45, 0), new THREE.Quaternion(), V(1, 1, 0.68)));
    s.ball(V(0, len * 0.84, 0), 0.2, 16, V(1.02, 0.55, 0.7)); // chest/shoulder yoke
    s.ball(V(0, len * 0.42, 0.02), 0.18, 14, V(0.95, 1.3, 0.72)); // belly
    s.ball(V(0, 0.02, 0), 0.165, 14, V(1, 0.75, 0.82)); // seat
    // Breast pockets.
    for (const x of [-0.085, 0.085]) s.box(V(x, len * 0.72, 0.125), V(0.09, 0.08, 0.02), undefined, 0.01);
    // Belt with buckle and ammo pouches.
    const belt = new THREE.TorusGeometry(0.155, 0.022, 6, 20);
    s.add(belt, new THREE.Matrix4().compose(V(0, 0.07, 0), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, 0.72, 1)));
    s.box(V(0, 0.07, 0.115), V(0.05, 0.045, 0.02));
    for (const x of [-0.1, 0.1]) s.box(V(x, 0.03, 0.1), V(0.07, 0.07, 0.05), undefined, 0.012);
    // Collar and a jacket seam down the front.
    s.cyl(V(0, len - 0.02, 0), V(0, len + 0.05, 0), 0.1, 0.075, 12);
    s.box(V(0, len * 0.55, 0.128), V(0.012, len * 0.7, 0.01));
    if (!opts.noPack) {
      s.box(V(0, len * 0.6, -0.15), V(0.24, 0.26, 0.09), undefined, 0.025);
      s.box(V(0, len * 0.3, -0.16), V(0.18, 0.06, 0.07), undefined, 0.02); // bedroll
    }
    // Canteen on the left hip.
    s.cyl(V(0.14, -0.02, -0.06), V(0.14, 0.12, -0.06), 0.05, 0.05, 10);
  });
  return fr;
}

function head(b, neckBase, headPos, left, opts = {}) {
  const fr = frame(headPos, left, V().subVectors(headPos, neckBase).lerp(UP, 0.4));
  b.limb(neckBase, headPos, 0.055, 0.055, 8);
  b.local(fr.m, (s) => {
    s.ball(V(0, 0, 0), 0.115, 14, V(0.92, 1.05, 1));
    s.ball(V(0, -0.01, 0.11), 0.022, 6); // nose
    s.box(V(0, 0.035, 0.095), V(0.12, 0.02, 0.03)); // brow
    s.ball(V(0, -0.075, 0.07), 0.05, 8, V(1.1, 0.8, 1)); // chin
    for (const x of [-0.11, 0.11]) s.ball(V(x, 0, -0.005), 0.03, 6, V(0.5, 1, 0.8)); // ears
    if (opts.cap) {
      // Officer's peaked service cap.
      s.cyl(V(0, 0.04, -0.01), V(0, 0.12, -0.01), 0.12, 0.14, 16);
      s.ball(V(0, 0.12, -0.01), 0.14, 16, V(1, 0.22, 1.08));
      const visor = new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, -Math.PI / 2, Math.PI);
      s.add(visor, new THREE.Matrix4().compose(V(0, 0.05, 0.07), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.25), V(1, 1, 0.6)));
      s.box(V(0, 0.105, 0.13), V(0.04, 0.035, 0.012)); // badge
    } else {
      // M1 steel pot with a rim and chin strap.
      const pot = new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      s.add(pot, new THREE.Matrix4().compose(V(0, 0.015, -0.005), new THREE.Quaternion(), V(1, 0.9, 1.06)));
      const rim = new THREE.TorusGeometry(0.162, 0.014, 6, 24);
      s.add(rim, new THREE.Matrix4().compose(V(0, 0.018, -0.005), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, 1.06, 1)));
      const strap = new THREE.TorusGeometry(0.12, 0.008, 4, 16, Math.PI);
      s.add(strap, new THREE.Matrix4().compose(V(0, 0.01, 0.02), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI)), V(1, 0.9, 1)));
    }
  });
  return fr;
}

function leg(b, hip, ankle, pole, footDir) {
  const { mid: knee, end } = solveIK(hip, ankle, THIGH, SHIN, pole);
  b.limb(hip, knee, 0.1, 0.082);
  b.limb(knee, end, 0.082, 0.066);
  // Gaiter ring and boot.
  const toe = end.clone().add(footDir.clone().normalize().multiplyScalar(0.19)).add(V(0, -0.03, 0));
  b.limb(end, toe, 0.062, 0.05, 8);
  b.ball(V().lerpVectors(end, toe, 0.6), 0.058, 8, V(1, 0.7, 1));
  return knee;
}

function arm(b, shoulder, hand, pole) {
  const { mid: elbow, end } = solveIK(shoulder, hand, UPPER_ARM, FOREARM, pole);
  b.limb(shoulder, elbow, 0.075, 0.064);
  b.limb(elbow, end, 0.064, 0.052);
  b.ball(end, 0.06, 8, V(1, 1.15, 1));
  return elbow;
}

function shouldersOf(fr, len) {
  return {
    L: at(fr, 0.2, len - 0.06, 0),
    R: at(fr, -0.2, len - 0.06, 0),
    hipL: at(fr, 0.09, -0.02, 0),
    hipR: at(fr, -0.09, -0.02, 0),
  };
}

function base(b, rx, rz, cz = 0) {
  const g = new THREE.CylinderGeometry(1, 1.04, BASE_H, 28);
  b.add(g, new THREE.Matrix4().compose(V(0, BASE_H / 2, cz), new THREE.Quaternion(), V(rx, 1, rz)));
}

// ------------------------------------------------------------------ weapons

function carbine(b, butt, muzzle, upHint = UP) {
  const fr = aimFrame(butt, muzzle, upHint);
  const L = fr.len;
  b.local(fr.m, (s) => {
    s.box(V(0, -0.03, 0.08), V(0.055, 0.15, 0.16), undefined, 0.02); // butt
    s.box(V(0, -0.005, 0.26), V(0.05, 0.09, 0.26), undefined, 0.015); // wrist
    s.box(V(0, 0.005, L * 0.48), V(0.06, 0.085, 0.2), undefined, 0.015); // receiver
    s.box(V(0, -0.075, L * 0.45), V(0.045, 0.11, 0.07), undefined, 0.01); // magazine
    s.box(V(0, -0.005, L * 0.7), V(0.055, 0.07, L * 0.3), undefined, 0.015); // handguard
    s.cyl(V(0, 0.01, L * 0.55), V(0, 0.01, L), 0.022, 0.02, 8); // barrel
    s.box(V(0, 0.045, L * 0.97), V(0.012, 0.035, 0.02)); // front sight
    s.cyl(V(0, 0.01, L * 0.84), V(0, 0.01, L * 0.88), 0.035, 0.035, 8); // band
    // Sling hanging loose under the rifle.
    const curve = new THREE.QuadraticBezierCurve3(V(0, -0.07, 0.15), V(0, -0.2, L * 0.45), V(0, -0.03, L * 0.82));
    s.add(new THREE.TubeGeometry(curve, 10, 0.01, 4, false));
  });
  return {
    grip: at(fr, 0, -0.06, 0.3),
    fore: at(fr, 0, -0.05, L * 0.68),
    muzzle: at(fr, 0, 0.01, L + 0.02),
    dir: fr.f.clone(),
  };
}

function bazooka(b, rear, front) {
  const fr = aimFrame(rear, front);
  const L = fr.len;
  b.local(fr.m, (s) => {
    s.cyl(V(0, 0, 0.05), V(0, 0, L), 0.07, 0.07, 16);
    s.cyl(V(0, 0, -0.04), V(0, 0, 0.1), 0.1, 0.07, 16, false); // flared rear
    s.cyl(V(0, 0, L - 0.06), V(0, 0, L + 0.02), 0.085, 0.085, 16);
    s.cyl(V(0, 0, L * 0.5), V(0, 0, L * 0.5 + 0.05), 0.085, 0.085, 16);
    s.box(V(0, -0.1, L * 0.36), V(0.04, 0.12, 0.05), undefined, 0.01); // grip
    s.box(V(0, -0.1, L * 0.52), V(0.04, 0.11, 0.05), undefined, 0.01); // fore grip
    s.box(V(0, -0.07, L * 0.22), V(0.05, 0.05, 0.16), undefined, 0.01); // shoulder rest
    s.box(V(0.08, 0.02, L * 0.62), V(0.03, 0.06, 0.06)); // sight
  });
  return {
    grip: at(fr, 0, -0.14, L * 0.36),
    fore: at(fr, 0, -0.13, L * 0.52),
    muzzle: at(fr, 0, 0, L + 0.05),
    dir: fr.f.clone(),
  };
}

function pistol(b, grip, dir) {
  const fr = aimFrame(grip, grip.clone().add(dir));
  b.local(fr.m, (s) => {
    s.box(V(0, 0.04, 0.08), V(0.035, 0.05, 0.2), undefined, 0.01);
    s.box(V(0, -0.02, 0.0), V(0.032, 0.1, 0.05), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.25), 0.01);
  });
  return { muzzle: at(fr, 0, 0.04, 0.2), dir: fr.f.clone() };
}

function binoculars(b, center, look, left) {
  const fr = aimFrame(center, center.clone().add(look), UP);
  b.local(fr.m, (s) => {
    for (const x of [-0.045, 0.045]) {
      s.cyl(V(x, 0, -0.06), V(x, 0, 0.08), 0.035, 0.042, 10);
    }
    s.box(V(0, 0, 0), V(0.06, 0.03, 0.06));
  });
}

// ------------------------------------------------------------------- poses

function standingLegs(b, sh, fr, footL, footR, dirL = V(0.2, 0, 1), dirR = V(-0.2, 0, 1)) {
  leg(b, sh.hipL, footL, V(0, 0, 1), dirL);
  leg(b, sh.hipR, footR, V(0, 0, 1), dirR);
}

function kneelingLegs(b, sh) {
  // Left knee up, right knee on the ground with the toe tucked behind.
  const ankleL = V(0.14, BASE_H + 0.07, 0.28);
  leg(b, sh.hipL, ankleL, V(0, 0.4, 1), V(0.1, 0, 1));
  const ankleR = V(-0.13, BASE_H + 0.1, -0.5);
  leg(b, sh.hipR, ankleR, V(0, -1, 0.35), V(0, -0.8, -0.4));
}

const POSES = {
  // Classic standing rifleman, rifle at the shoulder.
  rifleAim() {
    const b = new Builder();
    base(b, 0.5, 0.42);
    const pelvis = V(0, 0.93, -0.02);
    const chest = V(0.02, 0.93 + TORSO, 0.06);
    const left = V(1, 0, 0.45);
    const fr = torso(b, pelvis, chest, left);
    const sh = shouldersOf(fr, TORSO);
    standingLegs(b, sh, fr, V(0.14, BASE_H + 0.07, 0.22), V(-0.16, BASE_H + 0.07, -0.2), V(0.3, 0, 1), V(-0.6, 0, 0.8));
    const butt = V(-0.13, 1.38, 0.1);
    const muzzle = V(-0.07, 1.44, 1.3);
    const w = carbine(b, butt, muzzle);
    head(b, V().lerpVectors(chest, pelvis, -0.05), V(-0.04, 1.62, 0.1), V(1, -0.3, 0.3));
    arm(b, sh.R, w.grip, V(-1, -0.4, -0.2));
    arm(b, sh.L, w.fore, V(0.4, -1, 0));
    return { b, muzzle: w.muzzle, dir: w.dir, top: 1.8 };
  },

  // Lying flat, propped on elbows, rifle forward.
  rifleProne() {
    const b = new Builder();
    const slab = new RoundedBoxGeometry(0.78, BASE_H, 2.05, 2, 0.03);
    b.add(slab, new THREE.Matrix4().makeTranslation(0, BASE_H / 2, -0.35));
    const pelvis = V(0, BASE_H + 0.17, -0.5);
    const chest = V(0, BASE_H + 0.27, 0.05);
    const fr = torso(b, pelvis, chest, V(1, 0, 0), { noPack: false });
    const sh = shouldersOf(fr, TORSO);
    leg(b, sh.hipL, V(0.28, BASE_H + 0.12, -1.25), V(0, -1, 0), V(0.1, -0.8, -0.5));
    leg(b, sh.hipR, V(-0.22, BASE_H + 0.12, -1.3), V(0, -1, 0), V(-0.1, -0.8, -0.5));
    const butt = V(-0.12, BASE_H + 0.33, 0.08);
    const muzzle = V(-0.06, BASE_H + 0.24, 1.25);
    const w = carbine(b, butt, muzzle);
    head(b, at(fr, 0, TORSO + 0.03, 0), V(-0.02, BASE_H + 0.46, 0.18), V(1, 0, 0));
    arm(b, sh.R, w.grip, V(-0.5, -1, 0));
    arm(b, sh.L, w.fore, V(0.5, -1, 0));
    return { b, muzzle: w.muzzle, dir: w.dir, top: 0.7 };
  },

  // Standing tall, arms flung out to the sides, rifle in the right fist.
  rifleArmsOut() {
    const b = new Builder();
    base(b, 0.52, 0.42);
    const pelvis = V(0, 0.95, 0);
    const chest = V(0, 0.95 + TORSO, -0.03);
    const fr = torso(b, pelvis, chest, V(1, 0, 0));
    const sh = shouldersOf(fr, TORSO);
    standingLegs(b, sh, fr, V(0.2, BASE_H + 0.07, 0.05), V(-0.2, BASE_H + 0.07, -0.05), V(0.4, 0, 1), V(-0.4, 0, 1));
    head(b, at(fr, 0, TORSO + 0.03, 0), V(0, 1.66, 0.02), V(1, 0, 0));
    const handL = V(0.78, 1.6, 0.08);
    const handR = V(-0.78, 1.6, 0.08);
    arm(b, sh.L, handL, V(0, -0.3, -1));
    arm(b, sh.R, handR, V(0, -0.3, -1));
    // Rifle held by the wrist, pointing up and forward.
    const rdir = V(-0.2, 0.92, 0.35).normalize();
    const butt = handR.clone().add(rdir.clone().multiplyScalar(-0.3)).add(V(0, 0.06, 0));
    const w = carbine(b, butt, butt.clone().add(rdir.clone().multiplyScalar(1.15)), V(-1, 0, -0.3));
    return { b, muzzle: w.muzzle, dir: V(0, 0.2, 1).normalize(), top: 1.85 };
  },

  // Kneeling with the tube on the right shoulder.
  bazooka() {
    const b = new Builder();
    base(b, 0.55, 0.6, -0.08);
    const pelvis = V(0, 0.62, -0.12);
    const chest = V(0, 0.62 + TORSO, -0.04);
    const fr = torso(b, pelvis, chest, V(1, 0, 0.2));
    const sh = shouldersOf(fr, TORSO);
    kneelingLegs(b, sh);
    const rear = V(-0.16, 1.15, -0.6);
    const front = V(-0.16, 1.2, 0.95);
    const w = bazooka(b, rear, front);
    head(b, at(fr, 0, TORSO + 0.03, 0), V(-0.02, 1.37, 0.03), V(1, -0.2, 0));
    arm(b, sh.R, w.grip, V(-1, -0.6, -0.3));
    arm(b, sh.L, w.fore, V(0.6, -1, 0));
    return { b, muzzle: w.muzzle, dir: w.dir, top: 1.5 };
  },

  // Tripod machine gun with the gunner kneeling behind it.
  machineGun() {
    const b = new Builder();
    base(b, 0.62, 0.85, 0.12);
    const pelvis = V(0, 0.55, -0.35);
    const chest = V(0, 0.55 + TORSO, -0.12);
    const fr = torso(b, pelvis, chest, V(1, 0, 0));
    const sh = shouldersOf(fr, TORSO);
    leg(b, sh.hipL, V(0.2, BASE_H + 0.08, -0.75), V(0, -1, 0.5), V(0.1, -0.8, -0.4));
    leg(b, sh.hipR, V(-0.2, BASE_H + 0.08, -0.75), V(0, -1, 0.5), V(-0.1, -0.8, -0.4));
    head(b, at(fr, 0, TORSO + 0.03, 0), V(0, 1.2, -0.02), V(1, 0, 0));
    // Gun on a low tripod.
    const rear = V(0, 0.72, 0.12);
    const muzzle = V(0, 0.76, 1.35);
    const gf = aimFrame(rear, muzzle);
    b.local(gf.m, (s) => {
      s.box(V(0, 0, 0.18), V(0.1, 0.12, 0.34), undefined, 0.015); // receiver
      s.cyl(V(0, 0.005, 0.35), V(0, 0.005, 0.9), 0.045, 0.045, 14); // cooling jacket
      for (let i = 0; i < 6; i++) s.cyl(V(0, 0.005, 0.4 + i * 0.08), V(0, 0.005, 0.42 + i * 0.08), 0.05, 0.05, 14);
      s.cyl(V(0, 0.005, 0.9), V(0, 0.005, 1.22), 0.02, 0.02, 8); // barrel
      s.cyl(V(0, 0.005, 1.18), V(0, 0.005, 1.24), 0.035, 0.03, 10); // flash hider
      s.box(V(0, -0.07, -0.02), V(0.035, 0.1, 0.05), undefined, 0.01); // grip
      s.box(V(0.12, -0.04, 0.18), V(0.1, 0.14, 0.2), undefined, 0.012); // ammo can
      const belt = new THREE.QuadraticBezierCurve3(V(0.08, 0.02, 0.18), V(0.1, 0.1, 0.18), V(0.04, 0.03, 0.16));
      s.add(new THREE.TubeGeometry(belt, 6, 0.018, 4, false));
    });
    const pivot = at(gf, 0, -0.07, 0.3);
    b.cyl(pivot, V(0, BASE_H, 0.85), 0.022, 0.018, 6);
    b.cyl(pivot, V(0.3, BASE_H, 0.05), 0.022, 0.018, 6);
    b.cyl(pivot, V(-0.3, BASE_H, 0.05), 0.022, 0.018, 6);
    b.cyl(pivot.clone().add(V(0, -0.03, 0)), pivot.clone().add(V(0, 0.05, 0)), 0.04, 0.04, 8);
    arm(b, sh.R, at(gf, -0.01, -0.1, -0.02), V(-1, -1, 0));
    arm(b, sh.L, at(gf, 0.02, 0.06, 0.02), V(1, -0.6, 0));
    return { b, muzzle: at(gf, 0, 0.005, 1.25), dir: gf.f.clone(), top: 1.35 };
  },

  // Kneeling mortarman dropping a round down the tube.
  mortar() {
    const b = new Builder();
    base(b, 0.6, 0.72, 0.08);
    const pelvis = V(0.05, 0.62, -0.28);
    const chest = V(0.03, 0.62 + TORSO, -0.12);
    const fr = torso(b, pelvis, chest, V(1, 0, 0));
    const sh = shouldersOf(fr, TORSO);
    kneelingLegs(b, { hipL: sh.hipL, hipR: sh.hipR });
    head(b, at(fr, 0, TORSO + 0.03, 0), V(0.02, 1.36, -0.05), V(1, -0.3, 0));
    // Base plate, bipod and tube angled forward.
    b.box(V(0, BASE_H + 0.02, 0.45), V(0.46, 0.04, 0.4), new THREE.Quaternion().setFromAxisAngle(UP, 0.4), 0.015);
    const breech = V(0, BASE_H + 0.06, 0.45);
    const top = V(0, 1.02, 0.08);
    b.cyl(breech, top, 0.06, 0.055, 16);
    b.cyl(top.clone().add(V(0, -0.02, 0.01)), top.clone().add(V(0, 0.03, -0.01)), 0.07, 0.07, 16);
    const mid = V().lerpVectors(breech, top, 0.55);
    b.cyl(mid, V(0.26, BASE_H, 0.02), 0.02, 0.02, 6);
    b.cyl(mid, V(-0.26, BASE_H, 0.02), 0.02, 0.02, 6);
    b.cyl(V(0.2, 0.35, 0.05), V(-0.2, 0.35, 0.05), 0.02, 0.02, 6);
    // The round, held above the muzzle.
    const round = top.clone().add(V(0, 0.2, -0.05));
    b.cyl(round.clone().add(V(0, -0.1, 0)), round.clone().add(V(0, 0.05, 0)), 0.03, 0.05, 10);
    b.ball(round.clone().add(V(0, -0.1, 0)), 0.03, 8);
    b.cyl(round.clone().add(V(0, 0.05, 0)), round.clone().add(V(0, 0.14, 0)), 0.05, 0.02, 10);
    arm(b, sh.R, round.clone().add(V(-0.07, 0.02, 0)), V(-1, -0.2, 0));
    arm(b, sh.L, round.clone().add(V(0.07, 0.02, 0)), V(1, -0.2, 0));
    return { b, muzzle: top.clone().add(V(0, 0.05, 0)), dir: V().subVectors(top, breech).normalize(), top: 1.55 };
  },

  // Flamethrower: twin tanks on the back and the wand braced at the hip.
  flamethrower() {
    const b = new Builder();
    base(b, 0.52, 0.45);
    const pelvis = V(0, 0.9, -0.05);
    const chest = V(0, 0.9 + TORSO, 0.04);
    const fr = torso(b, pelvis, chest, V(1, 0, 0.3), { noPack: true });
    const sh = shouldersOf(fr, TORSO);
    standingLegs(b, sh, fr, V(0.18, BASE_H + 0.07, 0.25), V(-0.16, BASE_H + 0.07, -0.25), V(0.3, 0, 1), V(-0.5, 0, 0.8));
    head(b, at(fr, 0, TORSO + 0.03, 0), V(0.0, 1.61, 0.1), V(1, -0.1, 0.3));
    b.local(fr.m, (s) => {
      for (const x of [-0.09, 0.09]) {
        s.cyl(V(x, 0.05, -0.23), V(x, 0.55, -0.23), 0.085, 0.085, 14);
        s.ball(V(x, 0.55, -0.23), 0.085, 12, V(1, 0.5, 1));
        s.ball(V(x, 0.05, -0.23), 0.085, 12, V(1, 0.5, 1));
      }
      s.cyl(V(0, 0.2, -0.33), V(0, 0.45, -0.33), 0.055, 0.055, 12);
      s.box(V(0, 0.3, -0.15), V(0.3, 0.05, 0.04));
    });
    const rear = V(-0.08, 1.03, 0.1);
    const front = V(-0.02, 1.13, 1.05);
    const wf = aimFrame(rear, front);
    b.local(wf.m, (s) => {
      s.cyl(V(0, 0, 0), V(0, 0, 0.95), 0.028, 0.025, 10);
      s.cyl(V(0, 0, 0.88), V(0, 0, 0.98), 0.04, 0.035, 10);
      s.box(V(0, -0.07, 0.1), V(0.035, 0.1, 0.05), undefined, 0.01);
      s.box(V(0, -0.07, 0.5), V(0.035, 0.1, 0.05), undefined, 0.01);
      s.cyl(V(0, -0.05, 0.2), V(0, -0.05, 0.42), 0.035, 0.035, 10); // fuel valve
    });
    const hoseStart = at(fr, -0.09, 0.05, -0.23);
    const hose = new THREE.CatmullRomCurve3([hoseStart, hoseStart.clone().add(V(-0.12, -0.25, 0.1)), V(-0.2, 0.75, 0.05), rear]);
    b.add(new THREE.TubeGeometry(hose, 20, 0.025, 6, false));
    arm(b, sh.R, at(wf, 0, -0.1, 0.1), V(-1, -0.5, -0.3));
    arm(b, sh.L, at(wf, 0, -0.1, 0.5), V(0.5, -1, 0));
    return { b, muzzle: at(wf, 0, 0, 1.0), dir: wf.f.clone(), top: 1.8 };
  },

  // Officer: pistol in the right hand, field glasses up to the eyes.
  officer() {
    const b = new Builder();
    base(b, 0.52, 0.44);
    const pelvis = V(0, 0.95, 0);
    const chest = V(0, 0.95 + TORSO, 0.03);
    const fr = torso(b, pelvis, chest, V(1, 0, -0.15), { noPack: true });
    const sh = shouldersOf(fr, TORSO);
    standingLegs(b, sh, fr, V(0.16, BASE_H + 0.07, 0.14), V(-0.13, BASE_H + 0.07, -0.12), V(0.3, 0, 1), V(-0.3, 0, 1));
    const headPos = V(0.01, 1.68, 0.06);
    head(b, at(fr, 0, TORSO + 0.03, 0), headPos, V(1, 0, 0), { cap: true });
    const look = V(0, 0.05, 1).normalize();
    const glasses = headPos.clone().add(V(0, 0.0, 0.18));
    binoculars(b, glasses, look, V(1, 0, 0));
    arm(b, sh.L, glasses.clone().add(V(0.06, -0.04, 0.02)), V(1, -0.6, -0.1));
    const grip = V(-0.34, 1.3, 0.62);
    const p = pistol(b, grip, V(-0.08, 0.05, 1).normalize());
    arm(b, sh.R, grip, V(-0.6, -1, 0));
    // Map case strap across the chest and the case on the hip.
    b.local(fr.m, (s) => {
      s.box(V(0, TORSO * 0.55, 0.125), V(0.33, 0.03, 0.012), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.8));
      s.box(V(-0.17, 0.02, 0.02), V(0.04, 0.2, 0.18), undefined, 0.015);
    });
    return { b, muzzle: p.muzzle, dir: p.dir, top: 1.85 };
  },
};

const cache = new Map();

/** Returns { geometry, muzzle (local Vector3), dir, top } for a pose name. */
export function getFigure(pose) {
  if (!cache.has(pose)) {
    const fn = POSES[pose];
    if (!fn) throw new Error(`Unknown pose ${pose}`);
    const out = fn();
    cache.set(pose, { geometry: out.b.build(), muzzle: out.muzzle, dir: out.dir, top: out.top });
  }
  return cache.get(pose);
}

export const POSE_NAMES = Object.keys(POSES);
