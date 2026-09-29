// The rest of the house, seen past the open edges of a kitchen: floors,
// walls, windows and furniture that fade into a warm haze with distance.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeWoodTexture } from './textures.js';

/**
 * Patch a material so it melts into `haze` the further it is from the
 * kitchen rectangle. strength 0..1 is how far it goes at full distance.
 */
export function hazed(mat, rect, { haze = '#2a2119', near = 10, far = 190, strength = 0.9 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = { value: new THREE.Color(haze) };
    shader.uniforms.hazeRect = { value: new THREE.Vector4(rect.x0, rect.z0, rect.x1, rect.z1) };
    shader.uniforms.hazeRange = { value: new THREE.Vector3(near, far, strength) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHazeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeWorld;\nuniform vec3 hazeColor;\nuniform vec4 hazeRect;\nuniform vec3 hazeRange;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec2 hq = max(max(hazeRect.xy - vHazeWorld.xz, vHazeWorld.xz - hazeRect.zw), 0.0);
        float hf = smoothstep(hazeRange.x, hazeRange.y, length(hq)) * hazeRange.z;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, hf);`);
  };
  mat.customProgramCacheKey = () => `haze${rect.x0},${rect.z0},${near},${far},${strength}`;
  return mat;
}

export class House {
  constructor(group, rect, wallHeight = 96) {
    this.group = group;
    this.rect = rect;
    this.H = wallHeight;
    this.mats = new Map();
  }

  mat(key, make, opts) {
    if (!this.mats.has(key)) this.mats.set(key, hazed(make(), this.rect, opts));
    return this.mats.get(key);
  }

  color(hex, rough = 0.8) {
    return this.mat(`c${hex}${rough}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  }

  add(geo, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /** A flat floor rectangle, just under the kitchen's linoleum. */
  floor(x0, z0, x1, z1, mat) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    return this.add(g, mat, (x0 + x1) / 2, -0.3, (z0 + z1) / 2);
  }

  /** Wall from a to b, facing n, with optional glowing windows [offset, width]. */
  wall([ax, az], [bx, bz], [nx, nz], mat, windows = []) {
    const w = Math.hypot(bx - ax, bz - az);
    const H = this.H;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, H);
    shape.lineTo(-w / 2, H);
    shape.closePath();
    for (const [off, ww] of windows) {
      const p = new THREE.Path();
      p.moveTo(off - ww / 2, 30);
      p.lineTo(off - ww / 2, 78);
      p.lineTo(off + ww / 2, 78);
      p.lineTo(off + ww / 2, 30);
      p.closePath();
      shape.holes.push(p);
    }
    const mesh = this.add(new THREE.ShapeGeometry(shape), mat, (ax + bx) / 2, 0, (az + bz) / 2, Math.atan2(nx, nz));
    const glass = this.mat('glass', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.2) }), { strength: 0.55 });
    const frame = this.color('#efe6d2', 0.5);
    const curtain = this.color('#c8742a', 0.9);
    for (const [off, ww] of windows) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, 48), glass);
      pane.position.set(off, 54, -1);
      mesh.add(pane);
      for (const [x, y, fw, fh] of [[0, 54, 1.5, 48], [0, 54, ww, 1.5], [0, 78, ww + 4, 2.5], [0, 30, ww + 6, 2.5]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 2), frame);
        f.position.set(off + x, y, 0.5);
        mesh.add(f);
      }
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(ww * 0.22, 56, 1.5), curtain);
        c.position.set(off + s * (ww / 2 + 1), 52, 2);
        mesh.add(c);
      }
    }
    return mesh;
  }

  box(w, h, d, mat, x, z, { y = 0, ry = 0, r = 0 } = {}) {
    const g = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = this.add(g, mat, x, y + h / 2, z, ry);
    m.castShadow = true;
    return m;
  }

  // ---------------------------------------------------------- furniture

  sofa(x, z, ry, color = '#a8561e') {
    const fab = this.color(color, 0.95);
    const g = new THREE.Group();
    const parts = [[84, 16, 34, 0, 8, 0], [84, 18, 10, 0, 22, 12], [8, 10, 34, -38, 20, 0], [8, 10, 34, 38, 20, 0]];
    for (const [w, h, d, px, py, pz] of parts) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 3), fab);
      m.position.set(px, py, pz);
      g.add(m);
    }
    for (const px of [-20, 20]) {
      const cushion = new THREE.Mesh(new RoundedBoxGeometry(38, 5, 24, 2, 2.5), fab);
      cushion.position.set(px, 18, -4);
      g.add(cushion);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
  }

  armchair(x, z, ry, color = '#6d7a32') {
    const fab = this.color(color, 0.95);
    const g = new THREE.Group();
    for (const [w, h, d, px, py, pz] of [[34, 18, 32, 0, 9, 0], [34, 20, 8, 0, 26, 12], [7, 10, 32, -14, 22, 0], [7, 10, 32, 14, 22, 0]]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 3), fab);
      m.position.set(px, py, pz);
      g.add(m);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
  }

  lamp(x, z, h = 58) {
    const brass = this.color('#b08a3e', 0.35);
    this.box(12, 1.5, 12, brass, x, z);
    this.add(new THREE.CylinderGeometry(0.6, 0.6, h, 8), brass, x, h / 2, z);
    const shade = this.mat('shade', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.7) }), { strength: 0.5 });
    this.add(new THREE.CylinderGeometry(6, 9, 11, 20, 1, true), shade, x, h + 2, z);
  }

  /** Shag carpet: a base colour with thousands of lighter and darker tufts. */
  carpet(hex) {
    return this.mat(`carpet${hex}`, () => {
      const S = 256;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const ctx = c.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, S, S);
      const base = new THREE.Color(hex);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 6000; i++) {
        const k = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.22);
        ctx.fillStyle = `#${k.getHexString()}`;
        ctx.beginPath();
        ctx.arc(rnd() * S, rnd() * S, 0.8 + rnd() * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / 12, 1 / 12);
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.6, roughness: 1 });
    });
  }

  woodTexture() {
    return this.mat('wood', () => new THREE.MeshStandardMaterial({ map: makeWoodTexture(6, '#6a4222', '#3a220f'), roughness: 0.6 }));
  }

  panelMat() {
    return this.mat('panel', () => {
      const t = makeWoodTexture(8, '#7a4f2a', '#3e2512');
      t.repeat.set(1 / 24, 1 / 96);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    });
  }
}
