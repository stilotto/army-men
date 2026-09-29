// Renderer, lighting, post-processing and the room itself.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeLinoleumAtlas, makeWallpaperTexture, makeFlowerWallpaper, makeTapeTexture, makeRng } from './textures.js';
import { PROP_BUILDERS, contactShadow, materials } from './props.js';
import { TERRAIN } from '../rooms/index.js';

export class World {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.container = container;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2a2119');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.25, 1500);

    this.quality = 'high';
    this.setupComposer();
    window.addEventListener('resize', () => this.resize());
  }

  setupComposer() {
    const { renderer, scene, camera } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    this.bokeh = new BokehPass(scene, camera, { focus: 40, aperture: 0.0009, maxblur: 0.006 });
    this.bokeh.enabled = false;
    composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.45, 2.2);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setQuality(q) {
    this.quality = q;
    const high = q === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
    this.renderer.shadowMap.type = high ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.bloom.enabled = high;
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }

  // ------------------------------------------------------------------ room

  buildRoom(def) {
    if (this.roomGroup) {
      this.scene.remove(this.roomGroup);
    }
    const g = new THREE.Group();
    this.roomGroup = g;
    this.scene.add(g);
    this.def = def;
    const { tile } = def;
    const { x0, x1, z0, z1 } = def.room;

    const footprints = def.furnish(g) || [];
    this.buildFloor(def, footprints);
    this.buildWalls(def);
    this.buildLights(def);
    if (!def.board.play) this.buildTape(def);
    this.terrain = this.buildTerrain(def);
    this.bounds = { x0, x1, z0, z1, tile, pad: def.camPad ?? 26, solids: def.solids || [] };
    return g;
  }

  buildFloor(def, footprints) {
    const { tile, palette } = def;
    const { x0, x1, z0, z1 } = def.room;
    const cols = (x1 - x0) / tile;
    const rows = (z1 - z0) / tile;
    const atlas = makeLinoleumAtlas(palette, 7);
    const rng = makeRng(99);
    const pos = [];
    const uv = [];
    const uv1 = [];
    const idx = [];
    const rot = [[0, 0], [1, 0], [1, 1], [0, 1]];
    let v = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const dark = (i + j) % 2 === 1;
        const cell = atlas.cells[(dark ? 8 : 0) + Math.floor(rng() * 8)];
        const r = Math.floor(rng() * 4);
        const inset = 0.5 / 2048;
        const xa = x0 + i * tile;
        const za = z0 + j * tile;
        const corners = [[xa, za], [xa + tile, za], [xa + tile, za + tile], [xa, za + tile]];
        for (let k = 0; k < 4; k++) {
          const [cx, cz] = corners[k];
          pos.push(cx, 0, cz);
          const [ux, uy] = rot[(k + r) % 4];
          uv.push(cell.u + inset + ux * (cell.s - 2 * inset), 1 - (cell.v + inset + uy * (cell.s - 2 * inset)));
          uv1.push((cx - x0) / (x1 - x0), 1 - (cz - z0) / (z1 - z0));
        }
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        v += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const ao = this.floorAO(def, footprints);
    ao.channel = 1;
    const mat = new THREE.MeshPhysicalMaterial({
      map: atlas.map,
      bumpMap: atlas.bump,
      bumpScale: 0.6,
      roughnessMap: atlas.rough,
      roughness: 1,
      aoMap: ao,
      aoMapIntensity: 1,
      clearcoat: 0.35,
      clearcoatRoughness: 0.22,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.roomGroup.add(floor);
    this.floor = floor;
  }

  // A room-sized ambient-occlusion texture: dark in corners, along walls, and
  // under the toe-kicks.
  floorAO(def, footprints) {
    const { x0, x1, z0, z1 } = def.room;
    const W = 512;
    const H = Math.round((W * (z1 - z0)) / (x1 - x0));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const sx = W / (x1 - x0);
    const sz = H / (z1 - z0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.filter = 'blur(10px)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 16;
    if (!def.surroundings) ctx.strokeRect(0, 0, W, H);
    ctx.filter = 'blur(6px)';
    for (const f of footprints) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect((f.x - x0) * sx, (f.z - z0) * sz, f.w * sx, (f.d + 1) * sz);
    }
    ctx.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  buildWalls(def) {
    const { x0, x1, z0, z1 } = def.room;
    const H = def.wallHeight;
    const paper = def.wallpaper === 'flowerPower' ? makeFlowerWallpaper() : makeWallpaperTexture();
    const inches = paper.userData.inches || 24;
    const m = materials();
    // Each wall runs from a to b; n is the way its paper faces. The east wall
    // gets a real window opening, so only light through the glass reaches the floor.
    const walls = def.walls || [
      { a: [x0, z0], b: [x1, z0], n: [0, 1] },
      { a: [x0, z1], b: [x1, z1], n: [0, -1] },
      { a: [x0, z0], b: [x0, z1], n: [1, 0] },
      { a: [x1, z0], b: [x1, z1], n: [-1, 0], window: true },
    ];
    const hole = def.window;
    for (const wall of walls) {
      const [ax, az] = wall.a;
      const [bx, bz] = wall.b;
      const [nx, nz] = wall.n;
      const w = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -H / 2);
      shape.lineTo(w / 2, -H / 2);
      shape.lineTo(w / 2, H / 2);
      shape.lineTo(-w / 2, H / 2);
      shape.closePath();
      if (hole && wall.window) {
        // Local x runs along (nz, -nx) for a wall facing (nx, nz).
        const cx = (x1 - mx) * nz - (hole.z - mz) * nx;
        const cy = hole.y - H / 2;
        const p = new THREE.Path();
        p.moveTo(cx - hole.w / 2, cy - hole.h / 2);
        p.lineTo(cx - hole.w / 2, cy + hole.h / 2);
        p.lineTo(cx + hole.w / 2, cy + hole.h / 2);
        p.lineTo(cx + hole.w / 2, cy - hole.h / 2);
        p.closePath();
        shape.holes.push(p);
      }
      const geo = new THREE.ShapeGeometry(shape);
      const tex = paper.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1 / inches, 1 / inches);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(mx, H / 2, mz);
      mesh.rotation.y = Math.atan2(nx, nz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.roomGroup.add(mesh);
      // Baseboard with a little quarter-round shoe.
      const bb = new THREE.Mesh(new THREE.BoxGeometry(w, 3.5, 0.6), m.baseboard);
      bb.position.set(0, -H / 2 + 1.75, 0.3);
      mesh.add(bb);
      const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, w, 8, 1, false, 0, Math.PI / 2), m.baseboard);
      shoe.rotation.z = Math.PI / 2;
      shoe.position.set(0, -H / 2, 0.6);
      mesh.add(shoe);
    }
    // Solid space outside the kitchen gets a dark cap at wall height.
    for (const b of def.solids || []) {
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0), new THREE.MeshBasicMaterial({ color: '#2a2119' }));
      cap.rotation.x = -Math.PI / 2;
      cap.position.set((b.x0 + b.x1) / 2, H, (b.z0 + b.z1) / 2);
      this.roomGroup.add(cap);
    }
  }

  buildLights(def) {
    const g = this.roomGroup;
    const hemi = new THREE.HemisphereLight('#fff1dc', '#5a3f28', 0.55);
    g.add(hemi);

    // Overhead kitchen fixture: soft shadows straight down.
    const ceiling = new THREE.DirectionalLight('#fff4e2', 1.1);
    ceiling.position.set(-12, 110, 26);
    ceiling.target.position.set(0, 0, -4);
    ceiling.castShadow = true;
    ceiling.shadow.mapSize.set(2048, 2048);
    const sc = ceiling.shadow.camera;
    const { x0, x1, z0, z1 } = def.room;
    const hx = Math.max(95, (x1 - x0) / 2 + 6);
    const hz = Math.max(85, (z1 - z0) / 2 + 8);
    sc.left = -hx; sc.right = hx; sc.top = hz; sc.bottom = -hz; sc.near = 10; sc.far = 260;
    ceiling.shadow.bias = -0.0004;
    ceiling.shadow.normalBias = 0.02;
    ceiling.shadow.radius = 5;
    g.add(ceiling, ceiling.target);

    // Late-afternoon sun through the window, projected with a mullion cookie.
    const sun = new THREE.SpotLight(def.sun.color, 7, 0, 0.2, 0.25, 0);
    sun.position.set(...def.sun.from);
    sun.target.position.set(...def.sun.to);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.near = 60;
    sun.shadow.camera.far = 420;
    g.add(sun, sun.target);
    this.sun = sun;
    if (location.search.includes('sunonly')) {
      hemi.intensity = 0;
      ceiling.intensity = 0;
      this.scene.environmentIntensity = 0;
    }
  }

  // Masking-tape border around the play area, the way we marked it on the floor.
  buildTape(def) {
    const { cols, rows, x0, z0 } = def.board;
    const t = def.tile;
    const x1 = x0 + cols * t;
    const z1 = z0 + rows * t;
    const tex = makeTapeTexture();
    const rng = makeRng(17);
    const strips = [
      [x0 - 1.2, z0, x1 + 1.4, z0],
      [x1, z0 - 1.3, x1, z1 + 1.1],
      [x1 + 1.0, z1, x0 - 1.4, z1],
      [x0, z1 + 1.2, x0, z0 - 1.0],
    ];
    for (const [ax, az, bx, bz] of strips) {
      const len = Math.hypot(bx - ax, bz - az);
      const geo = new THREE.PlaneGeometry(1.4, len, 1, 1);
      const map = tex.clone();
      map.needsUpdate = true;
      map.repeat.set(1, len / 8);
      const mat = new THREE.MeshStandardMaterial({
        map, roughness: 0.85, transparent: true, opacity: 0.93,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(bx - ax, bz - az) + (rng() - 0.5) * 0.004;
      m.position.set((ax + bx) / 2, 0.03, (az + bz) / 2);
      m.receiveShadow = true;
      this.roomGroup.add(m);
    }
  }

  buildTerrain(def) {
    const out = [];
    for (const item of def.terrain) {
      const obj = PROP_BUILDERS[item.type]();
      const info = TERRAIN[item.type];
      const span = info.span || 1;
      const p = this.tileCenter(item.c + (span - 1) / 2, item.r);
      obj.position.copy(p);
      obj.rotation.y = item.rot || 0;
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const bb = new THREE.Box3().setFromObject(obj);
      const size = bb.getSize(new THREE.Vector3());
      const shadow = contactShadow(size.x * 1.35, size.z * 1.35, 0.55);
      shadow.position.x = p.x;
      shadow.position.z = p.z;
      this.roomGroup.add(shadow);
      this.roomGroup.add(obj);
      const tiles = [];
      for (let k = 0; k < span; k++) tiles.push([item.c + k, item.r]);
      out.push({ ...item, ...info, object: obj, tiles, height: size.y });
    }
    return out;
  }

  tileCenter(c, r) {
    const { x0, z0 } = this.def.board;
    const t = this.def.tile;
    return new THREE.Vector3(x0 + (c + 0.5) * t, 0, z0 + (r + 0.5) * t);
  }

  worldToTile(p) {
    const { x0, z0, cols, rows } = this.def.board;
    const t = this.def.tile;
    const c = Math.floor((p.x - x0) / t);
    const r = Math.floor((p.z - z0) / t);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    return { c, r };
  }

  setDepthOfField(on, focus = 40) {
    this.bokeh.enabled = on && this.quality === 'high';
    this.bokeh.uniforms.focus.value = focus;
  }
}
