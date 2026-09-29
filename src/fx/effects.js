// Combat effects: muzzle flashes, tracers, rockets, mortar arcs, flame jets,
// explosions, dust and scorch marks. HDR colours feed the bloom pass.
import * as THREE from 'three';
import { makeSoftSprite, makeSmokeSprite, makeScorchTexture } from '../scene/textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tex = {
      glow: makeSoftSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      smoke: makeSmokeSprite(),
      scorch: makeScorchTexture(),
    };
    this.particles = [];
    this.pool = [];
    this.movers = [];
    this.decals = [];
    // Flash lights live in the scene permanently to avoid shader recompiles.
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight('#ffb35a', 0, 40, 1.6);
      scene.add(l);
      return { light: l, t: 0, dur: 1, peak: 0 };
    });
    this.lightIdx = 0;
  }

  sprite(additive) {
    let s = this.pool.find((p) => !p.visible && p.userData.additive === additive);
    if (!s) {
      const mat = new THREE.SpriteMaterial({
        map: additive ? this.tex.glow : this.tex.smoke,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      s = new THREE.Sprite(mat);
      s.userData.additive = additive;
      this.pool.push(s);
      this.scene.add(s);
    }
    s.visible = true;
    return s;
  }

  emit(o) {
    const s = this.sprite(!!o.additive);
    s.position.copy(o.pos);
    s.material.color.copy(o.color || new THREE.Color(1, 1, 1));
    s.material.rotation = rand(0, Math.PI * 2);
    s.renderOrder = o.additive ? 3 : 2;
    this.particles.push({
      s,
      vel: o.vel || V(),
      life: 0,
      max: o.life || 1,
      size0: o.size0 ?? 1,
      size1: o.size1 ?? 2,
      alpha: o.alpha ?? 1,
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 1.5,
      color0: (o.color || new THREE.Color(1, 1, 1)).clone(),
      color1: o.color1 ? o.color1.clone() : null,
      spin: rand(-1, 1) * (o.spin ?? 0.5),
      fadeIn: o.fadeIn ?? 0.05,
    });
  }

  flash(pos, color = '#ffb35a', peak = 60, dur = 0.12) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.light.position.copy(pos);
    L.light.color.set(color);
    L.t = 0;
    L.dur = dur;
    L.peak = peak;
  }

  update(dt) {
    for (const L of this.lights) {
      L.t += dt;
      L.light.intensity = L.t < L.dur ? L.peak * (1 - L.t / L.dur) : 0;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        p.s.visible = false;
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      if (p.s.position.y < 0.05) {
        p.s.position.y = 0.05;
        p.vel.y *= -0.3;
      }
      const size = p.size0 + (p.size1 - p.size0) * (1 - Math.pow(1 - t, 2));
      p.s.scale.set(size, size, 1);
      const fade = t < p.fadeIn ? t / p.fadeIn : 1 - (t - p.fadeIn) / (1 - p.fadeIn);
      p.s.material.opacity = p.alpha * Math.max(0, fade);
      p.s.material.rotation += p.spin * dt;
      if (p.color1) p.s.material.color.copy(p.color0).lerp(p.color1, t);
    }
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i];
      m.t += dt;
      if (m.step(Math.min(1, m.t / m.dur), dt) === true || m.t >= m.dur) {
        this.movers.splice(i, 1);
        m.resolve();
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      const f = Math.min(1, d.t / 0.25) * (d.t > d.life - 4 ? Math.max(0, (d.life - d.t) / 4) : 1);
      d.mesh.material.opacity = d.opacity * f;
      if (d.t > d.life) {
        this.scene.remove(d.mesh);
        this.decals.splice(i, 1);
      }
    }
  }

  run(dur, step) {
    return new Promise((resolve) => this.movers.push({ t: 0, dur, step, resolve }));
  }

  wait(s) {
    return this.run(s, () => {});
  }

  // --------------------------------------------------------------- weapons

  muzzleFlash(pos, dir, scale = 1) {
    this.flash(pos, '#ffbd6a', 45 * scale, 0.09);
    this.emit({ pos, additive: true, color: new THREE.Color(7, 4.5, 1.8), size0: 1.2 * scale, size1: 0.5 * scale, life: 0.08 });
    for (let i = 0; i < 3; i++) {
      this.emit({ pos: pos.clone().addScaledVector(dir, 0.3 + i * 0.3), additive: true, color: new THREE.Color(5, 2.6, 0.8), size0: 0.7 * scale, size1: 0.2, life: 0.07, vel: dir.clone().multiplyScalar(8) });
    }
    for (let i = 0; i < 4; i++) {
      this.emit({
        pos: pos.clone(),
        vel: dir.clone().multiplyScalar(rand(2, 5)).add(V(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1))),
        color: new THREE.Color(0.75, 0.72, 0.68), alpha: 0.35, size0: 0.4, size1: 2.2 * scale, life: rand(0.8, 1.4), drag: 2.5,
      });
    }
  }

  tracer(from, to, speed = 90) {
    const dir = V().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    this.scene.add(m);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir.clone().normalize());
    m.quaternion.copy(q);
    return this.run(len / speed, (t) => {
      m.position.lerpVectors(from, to, t);
    }).then(() => {
      this.scene.remove(m);
      geo.dispose();
    });
  }

  impactDust(pos, amount = 1) {
    for (let i = 0; i < 6 * amount; i++) {
      this.emit({
        pos: pos.clone().add(V(rand(-0.3, 0.3), 0.2, rand(-0.3, 0.3))),
        vel: V(rand(-4, 4), rand(3, 8), rand(-4, 4)),
        color: new THREE.Color(0.8, 0.74, 0.62), alpha: 0.5, size0: 0.4, size1: 2.4, life: rand(0.7, 1.3), gravity: 6, drag: 2.2,
      });
    }
    this.emit({ pos: pos.clone().setY(0.4), additive: true, color: new THREE.Color(4, 3, 1.5), size0: 0.8, size1: 0.1, life: 0.1 });
  }

  explosion(pos, size = 1) {
    this.flash(pos.clone().setY(3), '#ff9a3c', 220 * size, 0.35);
    this.emit({ pos: pos.clone().setY(1.5), additive: true, color: new THREE.Color(8, 5, 2), size0: 4 * size, size1: 9 * size, life: 0.18 });
    for (let i = 0; i < 18 * size; i++) {
      const v = V(rand(-1, 1), rand(0.3, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(6, 16) * size);
      this.emit({
        pos: pos.clone().setY(0.8), vel: v, additive: true,
        color: new THREE.Color(6, 2.8, 0.7), color1: new THREE.Color(0.8, 0.2, 0.05),
        size0: 2.2 * size, size1: 0.8, life: rand(0.25, 0.55), drag: 4,
      });
    }
    for (let i = 0; i < 24 * size; i++) {
      const v = V(rand(-1, 1), rand(0.6, 2.2), rand(-1, 1)).normalize().multiplyScalar(rand(4, 11) * size);
      this.emit({
        pos: pos.clone().setY(1), vel: v, color: new THREE.Color(0.22, 0.2, 0.18), color1: new THREE.Color(0.66, 0.64, 0.6),
        alpha: 0.7, size0: 2.5 * size, size1: rand(8, 12) * size, life: rand(2, 3.4), drag: 1.6, gravity: -1.5, fadeIn: 0.08, spin: 0.3,
      });
    }
    // Debris specks.
    for (let i = 0; i < 12 * size; i++) {
      this.emit({
        pos: pos.clone().setY(0.5), vel: V(rand(-10, 10), rand(8, 18), rand(-10, 10)),
        color: new THREE.Color(0.15, 0.12, 0.1), alpha: 0.9, size0: 0.35, size1: 0.25, life: rand(0.8, 1.3), gravity: 40, drag: 0.4,
      });
    }
    // Ground shock ring of dust.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.emit({
        pos: pos.clone().setY(0.4), vel: V(Math.cos(a) * 14 * size, 0.5, Math.sin(a) * 14 * size),
        color: new THREE.Color(0.78, 0.72, 0.6), alpha: 0.45, size0: 1, size1: 4 * size, life: 1.1, drag: 3.2,
      });
    }
    this.scorch(pos, 7 * size);
  }

  scorch(pos, size, life = 25) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.scorch, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.position.set(pos.x, 0.04, pos.z);
    m.renderOrder = 1;
    this.scene.add(m);
    this.decals.push({ mesh: m, t: 0, life, opacity: 0.8 });
  }

  /** A bazooka rocket with a smoke trail. */
  async rocket(from, to) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), new THREE.MeshStandardMaterial({ color: '#4a4a3a', metalness: 0.4, roughness: 0.5 }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 10), body.material);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.6;
    g.add(nose);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: new THREE.Color(8, 4, 1.4), blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.setScalar(1.1);
    flame.position.z = -0.6;
    g.add(flame);
    g.position.copy(from);
    g.lookAt(to);
    this.scene.add(g);
    const dist = from.distanceTo(to);
    let acc = 0;
    await this.run(dist / 45, (t, dt) => {
      g.position.lerpVectors(from, to, t * t * 0.4 + t * 0.6);
      acc += dt;
      while (acc > 0.012) {
        acc -= 0.012;
        this.emit({
          pos: g.position.clone(), vel: V(rand(-0.5, 0.5), rand(0.2, 1), rand(-0.5, 0.5)),
          color: new THREE.Color(0.85, 0.83, 0.8), alpha: 0.5, size0: 0.5, size1: 2.2, life: rand(1, 1.8), drag: 1,
        });
      }
    });
    this.scene.remove(g);
  }

  /** A mortar round lobbed high over the furniture. */
  async shell(from, to) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#333' }));
    m.scale.set(1, 1, 1.8);
    this.scene.add(m);
    const peak = 26 + from.distanceTo(to) * 0.2;
    let prev = from.clone();
    let acc = 0;
    await this.run(1.35, (t, dt) => {
      const p = V().lerpVectors(from, to, t);
      p.y = from.y * (1 - t) + to.y * t + Math.sin(Math.PI * t) * peak;
      m.position.copy(p);
      m.lookAt(p.clone().add(p.clone().sub(prev)));
      prev = p;
      acc += dt;
      while (acc > 0.03) {
        acc -= 0.03;
        this.emit({ pos: p.clone(), color: new THREE.Color(0.8, 0.8, 0.8), alpha: 0.25, size0: 0.3, size1: 1.2, life: 0.7 });
      }
    });
    this.scene.remove(m);
  }

  /** Flamethrower jet from the nozzle toward (and slightly past) the target. */
  async flame(from, to, dur = 1.1) {
    const dir = V().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    let acc = 0;
    await this.run(dur, (t, dt) => {
      acc += dt;
      this.flash(from.clone().addScaledVector(dir, len * 0.6).setY(2), '#ff7a1a', 22 + Math.random() * 10, 0.08);
      while (acc > 0.012) {
        acc -= 0.012;
        const speed = len * rand(1.6, 2.1);
        const spread = V(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).multiplyScalar(len * 0.12);
        this.emit({
          pos: from.clone(), vel: dir.clone().multiplyScalar(speed).add(spread), additive: true,
          color: new THREE.Color(2.2, 0.85, 0.18), color1: new THREE.Color(0.5, 0.08, 0.01),
          size0: 0.3, size1: rand(2.2, 4), life: rand(0.35, 0.6), drag: 2.4, gravity: -6, alpha: 0.8,
        });
        if (Math.random() < 0.3) {
          this.emit({
            pos: from.clone().addScaledVector(dir, len * rand(0.6, 1)), vel: V(rand(-1, 1), rand(3, 6), rand(-1, 1)),
            color: new THREE.Color(0.18, 0.15, 0.13), alpha: 0.5, size0: 1.5, size1: 5, life: rand(1.2, 2), drag: 1.2, fadeIn: 0.2,
          });
        }
      }
    });
    this.scorch(to, 6);
  }
}
