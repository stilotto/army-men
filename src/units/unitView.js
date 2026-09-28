// The 3D presence of one army man on the floor: the moulded figure, its soft
// contact shadow, and the little hops and topples kids act out.
import * as THREE from 'three';
import { getFigure } from './figure.js';
import { contactShadow } from '../scene/props.js';
import { TEAMS } from './types.js';

export const FIG_SCALE = 1.6;
const materials = {};
export function teamMaterial(team) {
  if (!materials[team]) {
    const t = TEAMS[team];
    // Soft injection-moulded plastic: a waxy sheen with just a little gleam.
    materials[team] = new THREE.MeshPhysicalMaterial({
      color: t.color,
      roughness: 0.4,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
      sheen: 0.4,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(t.sheen),
      specularIntensity: 0.6,
    });
  }
  return materials[team];
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class UnitView {
  constructor(unit, world) {
    this.unit = unit;
    this.world = world;
    const fig = getFigure(unit.def.pose);
    this.fig = fig;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.mesh = new THREE.Mesh(fig.geometry, teamMaterial(unit.team));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Army men are a touch bigger than true 1:32 so they read well from above.
    this.body.scale.setScalar(FIG_SCALE);
    this.body.add(this.mesh);
    this.root.add(this.body);
    const bb = fig.geometry.boundingBox;
    const sw = (bb.max.x - bb.min.x) * FIG_SCALE * 1.5;
    const sd = (bb.max.z - bb.min.z) * FIG_SCALE * 1.4;
    this.shadow = contactShadow(Math.max(sw, 1.6), Math.max(sd, 1.6), 0.6);
    this.shadow.position.z = ((bb.max.z + bb.min.z) / 2) * FIG_SCALE;
    this.root.add(this.shadow);
    // Invisible fat cylinder that makes the figure easy to click.
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 3.6, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = 1.8;
    hit.userData.unit = unit;
    this.hit = hit;
    this.root.add(hit);
    this.root.userData.unit = unit;
    this.anims = [];
    world.scene.add(this.root);
    this.place(unit.c, unit.r);
    this.setFacing(unit.team === 'green' ? Math.PI : 0, true);
  }

  place(c, r) {
    const p = this.world.tileCenter(c, r);
    this.root.position.set(p.x, 0, p.z);
  }

  setFacing(yaw, instant = false) {
    this.targetYaw = yaw;
    if (instant) this.root.rotation.y = yaw;
  }

  faceToward(p) {
    const d = new THREE.Vector3().subVectors(p, this.root.position);
    const yaw = Math.atan2(d.x, d.z);
    let cur = this.root.rotation.y;
    let delta = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
    this.targetYaw = cur + delta;
  }

  worldMuzzle() {
    this.root.updateMatrixWorld(true);
    return this.body.localToWorld(this.fig.muzzle.clone());
  }

  worldTop() {
    return this.root.position.clone().add(new THREE.Vector3(0, this.fig.top * FIG_SCALE, 0));
  }

  update(dt) {
    if (this.targetYaw !== undefined && !this.fallen) {
      const k = 1 - Math.exp(-dt * 10);
      this.root.rotation.y += (this.targetYaw - this.root.rotation.y) * k;
    }
    for (const a of [...this.anims]) {
      a.t += dt;
      const done = a.step(Math.min(1, a.t / a.dur));
      if (a.t >= a.dur || done) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.resolve();
      }
    }
  }

  animate(dur, step) {
    return new Promise((resolve) => this.anims.push({ t: 0, dur, step, resolve }));
  }

  /** Hop tile-to-tile along a path, the way a kid taps a figure across the floor. */
  async moveAlong(path, sound) {
    for (const [c, r] of path) {
      const from = this.root.position.clone();
      const to = this.world.tileCenter(c, r);
      this.faceToward(to);
      if (sound) sound('lift');
      await this.animate(0.28, (t) => {
        const e = ease(t);
        this.root.position.lerpVectors(from, to, e);
        this.body.position.y = Math.sin(Math.PI * t) * 2.2;
        this.body.rotation.x = Math.sin(Math.PI * t) * 0.18;
        this.shadow.material.opacity = 0.6 - Math.sin(Math.PI * t) * 0.35;
        this.shadow.scale.setScalar(1 + Math.sin(Math.PI * t) * 0.3);
      });
      this.body.position.y = 0;
      this.body.rotation.x = 0;
      if (sound) sound('tap');
      await this.animate(0.08, (t) => {
        this.body.scale.set(FIG_SCALE * (1 + 0.04 * Math.sin(Math.PI * t)), FIG_SCALE * (1 - 0.05 * Math.sin(Math.PI * t)), FIG_SCALE);
      });
      this.body.scale.setScalar(FIG_SCALE);
    }
  }

  /** Recoil jolt when firing. */
  async recoil(amount = 0.25) {
    await this.animate(0.18, (t) => {
      this.body.position.z = -Math.sin(Math.PI * t) * amount * (1 - t);
      this.body.rotation.x = -Math.sin(Math.PI * t) * 0.05;
    });
    this.body.position.z = 0;
    this.body.rotation.x = 0;
  }

  /** Tip over away from the attacker and settle on the floor. */
  async knockDown(fromPos) {
    this.fallen = true;
    const away = new THREE.Vector3().subVectors(this.root.position, fromPos).setY(0);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    const axis = new THREE.Vector3(away.z, 0, -away.x).normalize();
    // Pivot on the edge of the base in the fall direction.
    const pivot = new THREE.Group();
    pivot.position.copy(this.root.position).addScaledVector(away, 0.55);
    this.world.scene.add(pivot);
    pivot.attach(this.body);
    const startQ = pivot.quaternion.clone();
    const endAngle = Math.PI / 2 - 0.08 + (Math.random() - 0.5) * 0.25;
    const slideDist = 0.8 + Math.random() * 1.4;
    const startPos = pivot.position.clone();
    this.shadow.visible = false;
    await this.animate(0.55, (t) => {
      // Accelerating fall, then a small bounce.
      let a;
      if (t < 0.7) a = Math.pow(t / 0.7, 2) * endAngle;
      else a = endAngle - Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.12;
      pivot.quaternion.copy(startQ).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
      pivot.position.copy(startPos).addScaledVector(away, slideDist * ease(t));
    });
    // Lift so nothing sinks into the linoleum.
    const box = new THREE.Box3().setFromObject(this.body);
    pivot.position.y += Math.max(0, -box.min.y) + 0.01;
    this.pivot = pivot;
    this.hit.visible = false;
    this.root.remove(this.hit);
  }

  dispose() {
    this.world.scene.remove(this.root);
    if (this.pivot) this.world.scene.remove(this.pivot);
  }
}
