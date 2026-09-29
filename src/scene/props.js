// Kitchen furniture and the everyday stuff that becomes terrain on the floor.
// All dimensions are in inches.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeRng, makeWoodTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function box(w, h, d, mat, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  return mesh(g, mat);
}

function labelCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Shared materials, created lazily so textures are only built once.
let M = null;
export function materials() {
  if (M) return M;
  const oak = makeWoodTexture(3, '#8a5a30', '#4d2d14');
  const oakDoor = makeWoodTexture(4, '#83532b', '#4a2a12');
  const spoonWood = makeWoodTexture(9, '#c99a62', '#8a5f35');
  M = {
    cabinet: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.55, color: '#ffffff' }),
    door: new THREE.MeshStandardMaterial({ map: oakDoor, roughness: 0.45, color: '#f2e6da' }),
    toeKick: new THREE.MeshStandardMaterial({ color: '#1d130c', roughness: 0.9 }),
    counter: new THREE.MeshPhysicalMaterial({ color: '#d98b2b', roughness: 0.35, clearcoat: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e8e8ea', metalness: 1, roughness: 0.12 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a45a', metalness: 1, roughness: 0.25 }),
    avocado: new THREE.MeshPhysicalMaterial({ color: '#6d7a32', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    enamel: new THREE.MeshPhysicalMaterial({ color: '#f1ede2', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    darkGlass: new THREE.MeshPhysicalMaterial({ color: '#0d0b0a', roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    black: new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.6 }),
    baseboard: new THREE.MeshStandardMaterial({ map: oak, color: '#d8c4b0', roughness: 0.5 }),
    spoon: new THREE.MeshStandardMaterial({ map: spoonWood, roughness: 0.62 }),
    vinyl: new THREE.MeshPhysicalMaterial({ color: '#b23a1c', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    tabletop: new THREE.MeshPhysicalMaterial({ color: '#f2e8d2', roughness: 0.3, clearcoat: 0.7 }),
  };
  return M;
}

// --------------------------------------------------------------- furniture

/** Base cabinet run with toe-kick, doors, drawers and a laminate top. */
export function cabinetRun(width, { depth = 24, height = 34.5, doors = 2, sink = false } = {}) {
  const m = materials();
  const g = new THREE.Group();
  const kick = 4;
  const kickDepth = 3;
  const carcass = box(width, height - kick, depth - 0.75, m.cabinet);
  carcass.position.set(0, kick + (height - kick) / 2, -(0.75) / 2);
  g.add(carcass);
  const toe = box(width, kick, depth - kickDepth, m.toeKick);
  toe.position.set(0, kick / 2, -kickDepth / 2);
  g.add(toe);
  // Countertop with an aluminium edge band and a backsplash.
  const top = box(width + 0.5, 1.5, depth + 1, m.counter, 0.2);
  top.position.set(0, height + 0.75, 0.5);
  g.add(top);
  const band = box(width + 0.6, 1.1, 0.12, m.chrome);
  band.position.set(0, height + 0.75, depth / 2 + 1.02);
  g.add(band);
  const splash = box(width + 0.5, 4, 0.75, m.counter, 0.15);
  splash.position.set(0, height + 3.5, -depth / 2 + 0.4);
  g.add(splash);

  const front = depth / 2;
  const drawerH = 5.5;
  const doorH = height - kick - drawerH - 1.5;
  const each = width / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -width / 2 + each * (i + 0.5);
    const door = box(each - 0.5, doorH, 0.75, m.door, 0.12);
    door.position.set(cx, kick + 0.4 + doorH / 2, front);
    g.add(door);
    // Raised panel frame on each door.
    const inset = box(each - 5, doorH - 5, 0.3, m.door, 0.1);
    inset.position.set(cx, kick + 0.4 + doorH / 2, front + 0.45);
    g.add(inset);
    const drawer = box(each - 0.5, drawerH, 0.75, m.door, 0.12);
    drawer.position.set(cx, height - drawerH / 2 - 0.4, front);
    g.add(drawer);
    for (const [x, y] of [[cx + (i % 2 ? -1 : 1) * (each / 2 - 2.5), kick + doorH - 2.5], [cx, height - drawerH / 2 - 0.4]]) {
      const knob = mesh(new THREE.SphereGeometry(0.55, 16, 12), m.brass);
      knob.scale.set(1, 1, 0.8);
      knob.position.set(x, y, front + 0.9);
      g.add(knob);
      const stem = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 10), m.brass);
      stem.rotation.x = Math.PI / 2;
      stem.position.set(x, y, front + 0.55);
      g.add(stem);
    }
  }
  if (sink) {
    const basin = box(24, 0.4, 16, m.chrome, 0.1);
    basin.position.set(0, height + 1.55, 0.5);
    g.add(basin);
    const spout = new THREE.Group();
    const neck = mesh(new THREE.TorusGeometry(3.5, 0.45, 12, 24, Math.PI), m.chrome);
    neck.position.set(0, 4.5, 0);
    spout.add(neck);
    const post = mesh(new THREE.CylinderGeometry(0.6, 0.8, 4.5, 16), m.chrome);
    post.position.set(-3.5, 2.25, 0);
    spout.add(post);
    spout.rotation.y = Math.PI / 2;
    spout.position.set(0, height + 1.5, -8.5);
    g.add(spout);
  }
  return g;
}

export function upperCabinets(width, { depth = 12, height = 30, doors = 2 } = {}) {
  const m = materials();
  const g = new THREE.Group();
  const body = box(width, height, depth - 0.75, m.cabinet);
  body.position.set(0, height / 2, -0.375);
  g.add(body);
  const each = width / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -width / 2 + each * (i + 0.5);
    const door = box(each - 0.5, height - 0.8, 0.75, m.door, 0.12);
    door.position.set(cx, height / 2, depth / 2);
    g.add(door);
    const inset = box(each - 5, height - 6, 0.3, m.door, 0.1);
    inset.position.set(cx, height / 2, depth / 2 + 0.45);
    g.add(inset);
    const knob = mesh(new THREE.SphereGeometry(0.55, 14, 10), m.brass);
    knob.position.set(cx + (i % 2 ? -1 : 1) * (each / 2 - 2.5), 3, depth / 2 + 0.9);
    g.add(knob);
  }
  return g;
}

export function refrigerator() {
  const m = materials();
  const g = new THREE.Group();
  const W = 30;
  const H = 66;
  const D = 28;
  const body = box(W, H - 3, D, m.avocado, 1.2);
  body.position.set(0, 3 + (H - 3) / 2, 0);
  g.add(body);
  const grille = box(W - 2, 3, 1, m.black, 0.2);
  grille.position.set(0, 1.5, D / 2 - 1.5);
  g.add(grille);
  for (let i = 0; i < 7; i++) {
    const slot = box(W - 6, 0.25, 0.3, m.chrome);
    slot.position.set(0, 0.6 + i * 0.35, D / 2 - 0.9);
    g.add(slot);
  }
  // Door seams (freezer on top) and long chrome handles.
  const seam = box(W - 0.4, 0.35, 0.4, m.black);
  seam.position.set(0, 46, D / 2 + 0.05);
  g.add(seam);
  for (const [y0, y1] of [[48, 62], [18, 43]]) {
    const len = y1 - y0;
    const bar = mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 16), m.chrome);
    bar.position.set(-W / 2 + 3, (y0 + y1) / 2, D / 2 + 2.2);
    g.add(bar);
    for (const y of [y0 + 0.8, y1 - 0.8]) {
      const foot = box(1.2, 1.2, 2.2, m.chrome, 0.3);
      foot.position.set(-W / 2 + 3, y, D / 2 + 1.1);
      g.add(foot);
    }
  }
  const badge = box(4.5, 0.8, 0.2, m.chrome, 0.1);
  badge.position.set(W / 2 - 5, 44, D / 2 + 0.15);
  g.add(badge);
  return g;
}

export function stove() {
  const m = materials();
  const g = new THREE.Group();
  const W = 30;
  const H = 36;
  const D = 26;
  const body = box(W, H - 4, D, m.enamel, 0.6);
  body.position.set(0, 4 + (H - 4) / 2, 0);
  g.add(body);
  const kick = box(W - 1, 4, D - 3, m.black);
  kick.position.set(0, 2, -1.5);
  g.add(kick);
  // Oven door with a smoky window and a chrome handle bar.
  const door = box(W - 2, 20, 1.2, m.enamel, 0.5);
  door.position.set(0, 16, D / 2 + 0.4);
  g.add(door);
  const glass = box(W - 10, 9, 0.2, m.darkGlass, 0.1);
  glass.position.set(0, 16, D / 2 + 1.05);
  g.add(glass);
  const handle = mesh(new THREE.CylinderGeometry(0.5, 0.5, W - 6, 16), m.chrome);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 24.5, D / 2 + 2.6);
  g.add(handle);
  for (const x of [-(W - 6) / 2, (W - 6) / 2]) {
    const post = box(0.9, 0.9, 2, m.chrome, 0.2);
    post.position.set(x, 24.5, D / 2 + 1.6);
    g.add(post);
  }
  const drawer = box(W - 2, 5, 1, m.enamel, 0.4);
  drawer.position.set(0, 6.5, D / 2 + 0.3);
  g.add(drawer);
  // Cooktop coils.
  const coil = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.4, metalness: 0.6 });
  for (const [x, z, r] of [[-7, -5, 3.6], [7, -5, 2.8], [-7, 6, 2.8], [7, 6, 3.6]]) {
    const pan = mesh(new THREE.CylinderGeometry(r + 1, r + 0.6, 0.3, 24), m.chrome);
    pan.position.set(x, H + 0.1, z);
    g.add(pan);
    for (let k = 1; k <= 3; k++) {
      const t = mesh(new THREE.TorusGeometry((r * k) / 3, 0.22, 6, 28), coil);
      t.rotation.x = Math.PI / 2;
      t.position.set(x, H + 0.4, z);
      g.add(t);
    }
  }
  // Back guard with knobs.
  const guard = box(W, 7, 3, m.enamel, 0.5);
  guard.position.set(0, H + 3.5, -D / 2 + 1.5);
  g.add(guard);
  for (let i = 0; i < 4; i++) {
    const knob = mesh(new THREE.CylinderGeometry(0.9, 1, 1.1, 20), m.black);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-9 + i * 6, H + 3.5, -D / 2 + 3.4);
    g.add(knob);
  }
  return g;
}

/** Chrome-and-vinyl dinette: round table on a tulip base and two chairs. */
export function dinette() {
  const m = materials();
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(20, 20, 1.2, 64), m.tabletop);
  top.position.y = 29;
  g.add(top);
  const edge = mesh(new THREE.CylinderGeometry(20.15, 20.15, 1.3, 64, 1, true), m.chrome);
  edge.position.y = 29;
  g.add(edge);
  const stem = mesh(new THREE.CylinderGeometry(1.4, 1.8, 28, 24), m.chrome);
  stem.position.y = 14.5;
  g.add(stem);
  const foot = mesh(new THREE.CylinderGeometry(3, 11, 1.5, 48), m.chrome);
  foot.position.y = 0.75;
  g.add(foot);
  for (const [x, z, ry] of [[-2, -23, 0], [22, -2, -Math.PI / 2]]) {
    const chair = new THREE.Group();
    const seat = box(16, 3, 16, m.vinyl, 1.2);
    seat.position.y = 18;
    chair.add(seat);
    const back = box(15, 9, 2.5, m.vinyl, 1);
    back.position.set(0, 30, -8);
    chair.add(back);
    for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      const legM = mesh(new THREE.CylinderGeometry(0.45, 0.45, 16.5, 12), m.chrome);
      legM.position.set(lx, 8.25, lz);
      chair.add(legM);
      const cap = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12), m.black);
      cap.position.set(lx, 0.15, lz);
      chair.add(cap);
    }
    for (const lx of [-7, 7]) {
      const upright = mesh(new THREE.CylinderGeometry(0.45, 0.45, 14, 12), m.chrome);
      upright.position.set(lx, 25, -8);
      chair.add(upright);
    }
    chair.position.set(x, 0, z);
    chair.rotation.y = ry;
    g.add(chair);
  }
  return g;
}

/** Rectangular kitchen table with chrome legs and two vinyl chairs tucked in. */
export function kitchenTable(w = 32, d = 26) {
  const m = materials();
  const g = new THREE.Group();
  const band = box(w + 0.2, 1.4, d + 0.2, m.chrome, 0.2);
  band.position.y = 28.9;
  g.add(band);
  const top = box(w, 1.2, d, m.tabletop, 0.3);
  top.position.y = 29.2;
  g.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.6, 0.6, 28.4, 14), m.chrome);
    leg.position.set(x * (w / 2 - 2), 14.2, z * (d / 2 - 2));
    g.add(leg);
    const cap = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 14), m.black);
    cap.position.set(x * (w / 2 - 2), 0.2, z * (d / 2 - 2));
    g.add(cap);
  }
  // West chair and south chair, pushed in under the top.
  for (const [x, z, ry] of [[-w / 2 + 4, 0, -Math.PI / 2], [0, d / 2 - 5, 0]]) {
    const chair = vinylChair();
    chair.position.set(x, 0, z);
    chair.rotation.y = ry;
    g.add(chair);
  }
  return g;
}

function vinylChair() {
  const m = materials();
  const chair = new THREE.Group();
  const seat = box(16, 3, 16, m.vinyl, 1.2);
  seat.position.y = 18;
  chair.add(seat);
  const back = box(15, 9, 2.5, m.vinyl, 1);
  back.position.set(0, 30, 8);
  chair.add(back);
  for (const [lx, lz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    const legM = mesh(new THREE.CylinderGeometry(0.45, 0.45, 16.5, 12), m.chrome);
    legM.position.set(lx, 8.25, lz);
    chair.add(legM);
  }
  for (const lx of [-7, 7]) {
    const upright = mesh(new THREE.CylinderGeometry(0.45, 0.45, 14, 12), m.chrome);
    upright.position.set(lx, 25, 8);
    chair.add(upright);
  }
  return chair;
}

/** A closed interior door in its casing, facing +z, bottom at y = 0. */
export function door(w = 28, h = 80) {
  const m = materials();
  const g = new THREE.Group();
  const slab = box(w, h, 1.4, m.door, 0.15);
  slab.position.set(0, h / 2, 0.7);
  g.add(slab);
  // Six-panel look: raised panels in two columns.
  for (const [py, ph] of [[h * 0.82, h * 0.2], [h * 0.5, h * 0.3], [h * 0.16, h * 0.22]]) {
    for (const px of [-w / 4, w / 4]) {
      const panel = box(w / 2 - 4, ph, 0.4, m.door, 0.12);
      panel.position.set(px, py, 1.5);
      g.add(panel);
    }
  }
  const t = 2.5;
  for (const [x, y, cw, ch] of [[-(w + t) / 2, (h + t) / 2, t, h + t], [(w + t) / 2, (h + t) / 2, t, h + t], [0, h + t / 2, w + t * 2, t]]) {
    const casing = box(cw, ch, 1, m.baseboard, 0.2);
    casing.position.set(x, y, 0.5);
    g.add(casing);
  }
  const knob = mesh(new THREE.SphereGeometry(1.1, 18, 12), m.brass);
  knob.position.set(w / 2 - 3, 36, 2.4);
  g.add(knob);
  const rose = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 18), m.brass);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(w / 2 - 3, 36, 1.6);
  g.add(rose);
  return g;
}

export function windowUnit(w = 36, h = 38) {
  const m = materials();
  const g = new THREE.Group();
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4) });
  const glass = mesh(new THREE.PlaneGeometry(w, h), glassMat, { cast: false, receive: false });
  g.add(glass);
  const frameMat = m.enamel;
  const t = 2.2;
  for (const [x, y, fw, fh] of [
    [0, h / 2, w + t * 2, t], [0, -h / 2, w + t * 2, t],
    [-w / 2, 0, t, h], [w / 2, 0, t, h], [0, 0, w, 1.4], [0, 0, 1.4, h],
  ]) {
    const f = box(fw, fh, 1.5, frameMat, 0.2);
    f.position.set(x, y, 0.5);
    g.add(f);
  }
  const sill = box(w + 8, 1.2, 5, frameMat, 0.3);
  sill.position.set(0, -h / 2 - 1.6, 2.2);
  g.add(sill);
  // Gingham cafe curtains on a brass rod.
  const ging = labelCanvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#f6efe2';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(200,60,40,0.55)';
    for (let i = 0; i < W; i += 32) {
      ctx.fillRect(i, 0, 16, H);
      ctx.fillRect(0, i, W, 16);
    }
  });
  ging.wrapS = ging.wrapT = THREE.RepeatWrapping;
  ging.repeat.set(3, 3);
  const cur = new THREE.MeshStandardMaterial({ map: ging, roughness: 0.9, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(w * 0.32, h * 0.55, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.3) * 0.8);
    geo.computeVertexNormals();
    const c = mesh(geo, cur, { cast: false });
    c.position.set(side * w * 0.36, -h * 0.2, 2.6);
    g.add(c);
  }
  const rod = mesh(new THREE.CylinderGeometry(0.3, 0.3, w + 4, 10), m.brass);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, h * 0.08, 2.6);
  g.add(rod);
  return g;
}

// ----------------------------------------------------------------- terrain

export function cerealBox() {
  const front = labelCanvas(512, 768, (c, W, H) => {
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffcf2e');
    grad.addColorStop(1, '#f39a16');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    // Sunburst.
    c.save();
    c.translate(W / 2, H * 0.62);
    for (let i = 0; i < 24; i++) {
      c.rotate(Math.PI / 12);
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(255,120,0,0.12)';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-40, -600);
      c.lineTo(40, -600);
      c.fill();
    }
    c.restore();
    c.fillStyle = '#d7261e';
    c.font = 'bold 118px "Arial Black", Impact, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 14;
    c.strokeStyle = '#fff';
    c.strokeText('SUGAR', W / 2, 150);
    c.fillText('SUGAR', W / 2, 150);
    c.fillStyle = '#1d4fa8';
    c.strokeText('STARS', W / 2, 270);
    c.fillText('STARS', W / 2, 270);
    // Bowl of stars.
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(W / 2, H * 0.72, 190, 70, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = '#2c6fd6';
    c.beginPath();
    c.ellipse(W / 2, H * 0.72, 190, 40, 0, 0, Math.PI * 2);
    c.fill();
    const rng = makeRng(4);
    for (let i = 0; i < 28; i++) {
      star(c, W / 2 + (rng() - 0.5) * 330, H * 0.7 + (rng() - 0.8) * 60, 16 + rng() * 10, '#ffd64a');
    }
    c.fillStyle = '#d7261e';
    c.beginPath();
    c.arc(W - 90, 360, 70, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 30px sans-serif';
    c.fillText('FREE', W - 90, 350);
    c.fillText('TOY!', W - 90, 385);
    c.fillStyle = '#6a2a00';
    c.font = 'bold 26px sans-serif';
    c.fillText('NET WT 12 OZ', W / 2, H - 30);
  });
  const side = labelCanvas(128, 768, (c, W, H) => {
    c.fillStyle = '#f5b224';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff';
    c.fillRect(10, 200, W - 20, 400);
    c.fillStyle = '#333';
    for (let y = 220; y < 590; y += 16) c.fillRect(16, y, 40 + ((y * 7) % 50), 5);
  });
  const top = new THREE.MeshStandardMaterial({ color: '#f0a81e', roughness: 0.7 });
  const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.65 });
  const frontM = new THREE.MeshStandardMaterial({ map: front, roughness: 0.55 });
  const b = mesh(new THREE.BoxGeometry(7.5, 11, 2.6), [sideM, sideM, top, top, frontM, frontM]);
  b.position.y = 5.5;
  const g = new THREE.Group();
  g.add(b);
  // A few spilled O's.
  const oMat = new THREE.MeshStandardMaterial({ color: '#d9a44e', roughness: 0.8 });
  const rng = makeRng(8);
  for (let i = 0; i < 9; i++) {
    const o = mesh(new THREE.TorusGeometry(0.22, 0.1, 8, 14), oMat);
    o.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.4;
    o.position.set(-3 + rng() * 7, 0.1, 2.2 + rng() * 2.4);
    g.add(o);
  }
  return g;
}

function star(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.fill();
}

export function soupCan() {
  const label = labelCanvas(1024, 256, (c, W, H) => {
    c.fillStyle = '#f3ead2';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#1e5b3a';
    c.fillRect(0, 0, W, H * 0.45);
    c.fillStyle = '#c9a44a';
    c.fillRect(0, H * 0.45, W, 8);
    c.textAlign = 'center';
    for (const x of [W * 0.25, W * 0.75]) {
      c.fillStyle = '#f7e7b0';
      c.font = 'italic bold 56px Georgia, serif';
      c.fillText('Grandma’s', x, 80);
      c.fillStyle = '#1e5b3a';
      c.font = 'bold 64px Georgia, serif';
      c.fillText('BEAN', x, 170);
      c.font = 'bold 34px Georgia, serif';
      c.fillText('& BACON SOUP', x, 215);
    }
  });
  const g = new THREE.Group();
  const tin = new THREE.MeshStandardMaterial({ color: '#cfd2d6', metalness: 1, roughness: 0.25 });
  const side = mesh(new THREE.CylinderGeometry(1.32, 1.32, 3.6, 48, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }));
  side.position.y = 2.05;
  g.add(side);
  for (const y of [0.12, 3.98]) {
    const rim = mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.24, 48), tin);
    rim.position.y = y;
    g.add(rim);
  }
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(1.0 - i * 0.28, 0.03, 6, 40), tin);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.1;
    g.add(ring);
  }
  return g;
}

export function coffeeMug() {
  const glaze = new THREE.MeshPhysicalMaterial({ color: '#8a4a1c', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  const inside = new THREE.MeshPhysicalMaterial({ color: '#efe4cc', roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
  const pts = [
    [0, 0.05], [1.5, 0], [1.65, 0.15], [1.7, 1.5], [1.72, 3.6], [1.75, 3.85], [1.62, 3.9], [1.55, 3.6], [1.52, 0.4], [0, 0.35],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  const body = mesh(new THREE.LatheGeometry(pts, 48), glaze);
  g.add(body);
  const lining = mesh(new THREE.CylinderGeometry(1.53, 1.5, 3.3, 48, 1, true), inside);
  lining.position.y = 2.0;
  g.add(lining);
  const coffee = mesh(new THREE.CircleGeometry(1.52, 40), new THREE.MeshPhysicalMaterial({ color: '#2a150a', roughness: 0.05, clearcoat: 1 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 2.9;
  g.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(1.0, 0.24, 12, 24, Math.PI * 1.2), glaze);
  handle.rotation.z = -Math.PI * 0.6;
  handle.scale.set(0.9, 1.1, 1);
  handle.position.set(1.7, 2.0, 0);
  g.add(handle);
  return g;
}

export function toyBlock() {
  const faces = ['A', 'B', 'C', '7', '★', 'Z'].map((ch, i) => {
    const cols = ['#c8302a', '#2a62c8', '#2e9a3e', '#e2a21c', '#8a3ab8', '#e0662a'];
    return new THREE.MeshStandardMaterial({
      roughness: 0.6,
      map: labelCanvas(256, 256, (c, W, H) => {
        c.fillStyle = '#e8cf9e';
        c.fillRect(0, 0, W, H);
        c.strokeStyle = cols[i];
        c.lineWidth = 16;
        c.strokeRect(22, 22, W - 44, H - 44);
        c.fillStyle = cols[i];
        c.font = 'bold 160px Georgia, serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(ch, W / 2, H / 2 + 10);
      }),
    });
  });
  const b = mesh(new RoundedBoxGeometry(2.5, 2.5, 2.5, 3, 0.15), faces);
  b.position.y = 1.25;
  const g = new THREE.Group();
  g.add(b);
  return g;
}

export function sponge() {
  const g = new THREE.Group();
  const pores = labelCanvas(256, 256, (c, W, H) => {
    c.fillStyle = '#f2cf45';
    c.fillRect(0, 0, W, H);
    const rng = makeRng(12);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(150,110,20,${0.2 + rng() * 0.4})`;
      c.beginPath();
      c.arc(rng() * W, rng() * H, 1 + rng() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  const y = mesh(new RoundedBoxGeometry(4.4, 1.0, 2.9, 3, 0.25), new THREE.MeshStandardMaterial({ map: pores, bumpMap: pores, bumpScale: 2, roughness: 0.95 }));
  y.position.y = 0.5;
  g.add(y);
  const scrub = mesh(new RoundedBoxGeometry(4.4, 0.3, 2.9, 2, 0.1), new THREE.MeshStandardMaterial({ color: '#2f7a3a', roughness: 1 }));
  scrub.position.y = 1.15;
  g.add(scrub);
  return g;
}

export function woodenSpoon() {
  const m = materials();
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.28, 0.4, 10, 16), m.spoon);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-2, 0.4, 0);
  g.add(handle);
  const bowl = mesh(new THREE.SphereGeometry(1.2, 24, 16), m.spoon);
  bowl.scale.set(1.5, 0.35, 1);
  bowl.position.set(4.4, 0.45, 0);
  g.add(bowl);
  return g;
}

/** Soft dark decal used for contact shadows beneath things. */
let blobTex = null;
export function contactShadow(w, d, opacity = 0.5) {
  if (!blobTex) {
    blobTex = labelCanvas(128, 128, (c, W, H) => {
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    });
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, color: '#000' }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

export const PROP_BUILDERS = {
  cereal: cerealBox,
  can: soupCan,
  mug: coffeeMug,
  block: toyBlock,
  sponge,
  spoon: woodenSpoon,
};
