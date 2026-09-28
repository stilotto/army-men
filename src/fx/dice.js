// Real dice thrown onto the linoleum. The outcome is decided first, then the
// tumble is choreographed so the die lands showing that number.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeDiceFace } from '../scene/textures.js';

const SIZE = 1.5;
// BoxGeometry face order: +x, -x, +y, -y, +z, -z.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
  2: new THREE.Vector3(0, 0, 1),
  5: new THREE.Vector3(0, 0, -1),
};

export class Dice {
  constructor(scene) {
    this.scene = scene;
    this.geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.16);
    this.mats = FACE_VALUES.map((v) => new THREE.MeshPhysicalMaterial({
      map: makeDiceFace(v), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08,
    }));
    this.active = [];
    this.anims = [];
  }

  update(dt) {
    for (const a of [...this.anims]) {
      a.t += dt;
      a.step(Math.min(1, a.t / a.dur));
      if (a.t >= a.dur) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.resolve();
      }
    }
  }

  run(dur, step) {
    return new Promise((resolve) => this.anims.push({ t: 0, dur, step, resolve }));
  }

  clear() {
    const old = this.active;
    this.active = [];
    if (!old.length) return;
    this.run(0.35, (t) => {
      for (const d of old) {
        d.scale.setScalar(1 - t);
        d.position.y = SIZE / 2 * (1 - t);
      }
    }).then(() => old.forEach((d) => this.scene.remove(d)));
  }

  /**
   * Throw dice so they land around `spot`, thrown from direction `fromDir`.
   * Returns once they have settled.
   */
  async roll(values, spot, fromDir, onBounce) {
    this.clear();
    const up = new THREE.Vector3(0, 1, 0);
    const throws = values.map((v, i) => {
      const mesh = new THREE.Mesh(this.geo, this.mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.active.push(mesh);
      const side = new THREE.Vector3(-fromDir.z, 0, fromDir.x);
      const end = spot.clone()
        .addScaledVector(side, (i - (values.length - 1) / 2) * 2.4 + (Math.random() - 0.5) * 0.6)
        .addScaledVector(fromDir, (Math.random() - 0.5) * 1.2);
      end.y = SIZE / 2;
      const start = end.clone().addScaledVector(fromDir, 14 + Math.random() * 4);
      start.y = 7 + Math.random() * 3;
      const finalQ = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[v], up);
      finalQ.premultiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2));
      const axis = new THREE.Vector3().crossVectors(up, fromDir).normalize()
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6)).normalize();
      const spin = (3 + Math.floor(Math.random() * 3)) * Math.PI * 2 + Math.PI / 2 * Math.floor(Math.random() * 4);
      return { mesh, start, end, finalQ, axis, spin, delay: i * 0.06 };
    });
    // Three bounces with shrinking arcs.
    const hops = [
      { a: 0, b: 0.62, h: 1 },
      { a: 0.62, b: 0.86, h: 0.28 },
      { a: 0.86, b: 1.0, h: 0.08 },
    ];
    let lastHop = -1;
    await this.run(1.25, (t) => {
      for (const d of throws) {
        const tt = Math.max(0, Math.min(1, (t - d.delay) / (1 - d.delay)));
        // Horizontal travel decelerates as the dice skid to a stop.
        const travel = 1 - Math.pow(1 - tt, 2.4);
        const p = new THREE.Vector3().lerpVectors(d.start, d.end, travel);
        let y = SIZE / 2;
        let hopIndex = 0;
        for (let k = 0; k < hops.length; k++) {
          const hp = hops[k];
          if (tt >= hp.a && tt <= hp.b) {
            const u = (tt - hp.a) / (hp.b - hp.a);
            hopIndex = k;
            if (k === 0) y = d.start.y * (1 - u) * (1 - u) + SIZE / 2 * (1 - (1 - u) * (1 - u)) + Math.sin(Math.PI * u) * 1.2;
            else y = SIZE / 2 + Math.sin(Math.PI * u) * 3 * hp.h;
          }
        }
        p.y = y;
        d.mesh.position.copy(p);
        const remaining = Math.pow(1 - tt, 1.8);
        const q = new THREE.Quaternion().setFromAxisAngle(d.axis, d.spin * remaining);
        d.mesh.quaternion.copy(d.finalQ).premultiply(q);
        if (d === throws[0] && hopIndex !== lastHop && tt > 0) {
          if (lastHop >= 0 && onBounce) onBounce(hops[hopIndex].h);
          lastHop = hopIndex;
        }
      }
    });
    if (onBounce) onBounce(0.05);
    for (const d of throws) {
      d.mesh.position.copy(d.end);
      d.mesh.quaternion.copy(d.finalQ);
    }
  }
}
