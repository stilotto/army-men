// Procedural canvas textures: linoleum, wood grain, wallpaper, tape, dice,
// particle sprites. Everything is generated at load so the game ships with
// no image assets.
import * as THREE from 'three';

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Small tileable value-noise field rendered to a canvas, used for mottling.
function noiseCanvas(size, rng, octaves = 4, tint = [0, 0, 0]) {
  const grid = [];
  const base = 4;
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    grid.push({ n, g });
  }
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let tot = 0;
      for (const { n, g } of grid) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const x1 = (x0 + 1) % n;
        const y1 = (y0 + 1) % n;
        const a = g[y0 * n + x0];
        const b = g[y0 * n + x1];
        const cc = g[y1 * n + x0];
        const d = g[y1 * n + x1];
        v += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty);
        tot += amp;
        amp *= 0.5;
      }
      v /= tot;
      const i = (y * size + x) * 4;
      img.data[i] = tint[0];
      img.data[i + 1] = tint[1];
      img.data[i + 2] = tint[2];
      img.data[i + 3] = Math.max(0, Math.min(255, (v - 0.35) * 2.2 * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Linoleum tile atlas. Returns { map, bumpRough, cells } where the atlas is a
 * 4x4 grid of tile variants: cells[0..7] light, cells[8..15] dark.
 */
export function makeLinoleumAtlas(palette, seed = 7) {
  const rng = makeRng(seed);
  const CELL = 512;
  const N = 4;
  const SIZE = CELL * N;
  const color = canvas(SIZE);
  const cx = color.getContext('2d');
  const height = canvas(SIZE);
  const hx = height.getContext('2d');
  const rough = canvas(SIZE);
  const rx = rough.getContext('2d');

  const mottles = [0, 1, 2].map(() => noiseCanvas(128, rng, 4, [0, 0, 0]));
  const lightMottle = [0, 1].map(() => noiseCanvas(128, rng, 4, [255, 250, 235]));
  const cells = [];

  for (let idx = 0; idx < N * N; idx++) {
    const dark = idx >= 8;
    const p = dark ? palette.dark : palette.light;
    const ox = (idx % N) * CELL;
    const oy = Math.floor(idx / N) * CELL;
    cells.push({ u: ox / SIZE, v: oy / SIZE, s: CELL / SIZE, dark });

    cx.save();
    cx.beginPath();
    cx.rect(ox, oy, CELL, CELL);
    cx.clip();
    // Base with a very slight per-tile hue drift (dye lots never match).
    const drift = (rng() - 0.5) * 10;
    cx.fillStyle = shade(p.base, drift);
    cx.fillRect(ox, oy, CELL, CELL);

    // Mottled marbling: scaled-up noise, rotated per variant.
    cx.save();
    cx.translate(ox + CELL / 2, oy + CELL / 2);
    cx.rotate(rng() * Math.PI * 2);
    cx.globalAlpha = p.mottle;
    cx.drawImage(mottles[idx % 3], -CELL, -CELL, CELL * 2, CELL * 2);
    cx.globalAlpha = p.mottle * 0.8;
    cx.drawImage(lightMottle[idx % 2], -CELL * 0.8, -CELL * 0.8, CELL * 1.6, CELL * 1.6);
    cx.restore();

    // Directional marble streaks, softly blurred.
    cx.save();
    cx.filter = 'blur(5px)';
    const ang = rng() * Math.PI;
    for (let i = 0; i < 9; i++) {
      cx.strokeStyle = rng() < 0.5 ? p.streakA : p.streakB;
      cx.globalAlpha = 0.18 + rng() * 0.2;
      cx.lineWidth = 3 + rng() * 14;
      cx.beginPath();
      const sx = ox + rng() * CELL;
      const sy = oy + rng() * CELL;
      const len = CELL * (0.4 + rng() * 0.8);
      const dx = Math.cos(ang) * len;
      const dy = Math.sin(ang) * len;
      cx.moveTo(sx - dx / 2, sy - dy / 2);
      cx.bezierCurveTo(
        sx - dx / 6 + (rng() - 0.5) * 120, sy - dy / 6 + (rng() - 0.5) * 120,
        sx + dx / 6 + (rng() - 0.5) * 120, sy + dy / 6 + (rng() - 0.5) * 120,
        sx + dx / 2, sy + dy / 2);
      cx.stroke();
    }
    cx.restore();

    // Speckles (the chips pressed into cheap linoleum).
    for (let i = 0; i < 2600; i++) {
      const col = p.speckles[Math.floor(rng() * p.speckles.length)];
      cx.fillStyle = col;
      cx.globalAlpha = 0.35 + rng() * 0.6;
      const r = rng() < 0.93 ? 0.6 + rng() * 1.4 : 1.8 + rng() * 2.6;
      cx.beginPath();
      cx.ellipse(ox + rng() * CELL, oy + rng() * CELL, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;

    // Scuffs: dark curved heel marks, only on some tiles.
    const scuffs = rng() < 0.45 ? 1 + Math.floor(rng() * 3) : 0;
    for (let i = 0; i < scuffs; i++) {
      cx.strokeStyle = 'rgba(30,22,18,0.22)';
      cx.lineWidth = 1 + rng() * 3;
      cx.beginPath();
      const r = 20 + rng() * 60;
      cx.arc(ox + rng() * CELL, oy + rng() * CELL, r, rng() * 6, rng() * 6 + 0.4 + rng());
      cx.stroke();
    }
    // Fine scratches, lighter than the surface.
    for (let i = 0; i < 18; i++) {
      cx.strokeStyle = `rgba(255,250,240,${0.05 + rng() * 0.12})`;
      cx.lineWidth = 0.6 + rng() * 0.8;
      cx.beginPath();
      const sx = ox + rng() * CELL;
      const sy = oy + rng() * CELL;
      const a = rng() * 6.28;
      const l = 10 + rng() * 90;
      cx.moveTo(sx, sy);
      cx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
      cx.stroke();
    }

    // Grime collects toward the seams.
    const g = 34;
    const grime = p.grime;
    const edges = [
      [ox, oy, CELL, g, 0, 1],
      [ox, oy + CELL - g, CELL, g, 0, -1],
      [ox, oy, g, CELL, 1, 0],
      [ox + CELL - g, oy, g, CELL, -1, 0],
    ];
    for (const [x, y, w, h, dx, dy] of edges) {
      const grad = dx
        ? cx.createLinearGradient(dx > 0 ? x : x + w, 0, dx > 0 ? x + w : x, 0)
        : cx.createLinearGradient(0, dy > 0 ? y : y + h, 0, dy > 0 ? y + h : y);
      grad.addColorStop(0, grime);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = grad;
      cx.fillRect(x, y, w, h);
    }
    // Seam line + bevel highlight.
    cx.strokeStyle = 'rgba(25,18,12,0.85)';
    cx.lineWidth = 4;
    cx.strokeRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
    cx.strokeStyle = 'rgba(255,248,230,0.18)';
    cx.lineWidth = 2;
    cx.strokeRect(ox + 5, oy + 5, CELL - 10, CELL - 10);
    cx.restore();

    // Height: flat surface, seams sunk, very slight bumpy noise.
    hx.save();
    hx.fillStyle = '#808080';
    hx.fillRect(ox, oy, CELL, CELL);
    hx.globalAlpha = 0.12;
    hx.drawImage(mottles[(idx + 1) % 3], ox, oy, CELL, CELL);
    hx.globalAlpha = 1;
    hx.fillStyle = '#6a6a6a';
    for (let i = 0; i < 500; i++) {
      hx.fillRect(ox + rng() * CELL, oy + rng() * CELL, 1.5, 1.5);
    }
    hx.strokeStyle = '#000';
    hx.lineWidth = 6;
    hx.strokeRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
    hx.strokeStyle = '#505050';
    hx.lineWidth = 4;
    hx.strokeRect(ox + 5, oy + 5, CELL - 10, CELL - 10);
    hx.restore();

    // Roughness: waxed and fairly glossy, duller where worn or in seams.
    rx.save();
    rx.fillStyle = gray(p.roughness * 255);
    rx.fillRect(ox, oy, CELL, CELL);
    rx.globalAlpha = 0.5;
    rx.drawImage(noiseCanvas(64, rng, 3, [255, 255, 255]), ox, oy, CELL, CELL);
    rx.globalAlpha = 1;
    rx.strokeStyle = gray(235);
    rx.lineWidth = 10;
    rx.strokeRect(ox, oy, CELL, CELL);
    rx.restore();
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(height);
  const roughTex = new THREE.CanvasTexture(rough);
  for (const t of [map, bump, roughTex]) {
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { map, bump, rough: roughTex, cells };
}

function gray(v) {
  const c = Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${c},${c},${c})`;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt / 255);
  return `#${c.getHexString()}`;
}

export function makeWoodTexture(seed = 3, base = '#7a4a26', dark = '#4a2a14') {
  const rng = makeRng(seed);
  const W = 512;
  const H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // Long grain lines with gentle waviness and cathedral arches.
  for (let i = 0; i < 140; i++) {
    const x0 = rng() * W;
    const amp = 4 + rng() * 18;
    const freq = 0.002 + rng() * 0.006;
    const ph = rng() * 6.28;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.08 + rng() * 0.25;
    ctx.lineWidth = 0.6 + rng() * 2.4;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 8) {
      const x = x0 + Math.sin(y * freq + ph) * amp + Math.sin(y * 0.03 + ph) * 1.2;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.drawImage(noiseCanvas(64, rng, 3, [40, 20, 8]), 0, 0, W, H);
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 1970s kitchen wallpaper: interlocking circles and stylised daisies.
export function makeWallpaperTexture(seed = 11) {
  const rng = makeRng(seed);
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe2c2';
  ctx.fillRect(0, 0, S, S);
  const cols = ['#d17a2a', '#b85a1e', '#8a6a1a', '#6f7a2a'];
  const step = S / 4;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const px = x * step + (y % 2 ? step / 2 : 0);
      const py = y * step;
      for (const [dx, dy] of [[0, 0], [-S, 0], [0, -S], [-S, -S]]) {
        drawDaisy(ctx, px + dx, py + dy, step * 0.42, cols[(x + y) % cols.length]);
      }
    }
  }
  ctx.globalAlpha = 0.18;
  ctx.drawImage(noiseCanvas(64, rng, 3, [120, 90, 50]), 0, 0, S, S);
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Flower-power wallpaper: orange, yellow and brown blooms packed onto a
// chocolate ground. `inches` is how much wall one repeat covers.
export function makeFlowerWallpaper(seed = 23) {
  const rng = makeRng(seed);
  const S = 1024;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a1c0c';
  ctx.fillRect(0, 0, S, S);
  const kinds = [bigBloom, bigBloom, petalFlower, petalFlower, sunburst, daisy];
  // Jittered grid so blooms pack edge to edge the way the real paper does.
  const N = 6;
  const cell = S / N;
  const spots = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const big = kind === bigBloom;
      spots.push({
        x: (i + 0.5 + (j % 2) * 0.5 + (rng() - 0.5) * 0.3) * cell,
        y: (j + 0.5 + (rng() - 0.5) * 0.3) * cell,
        r: cell * (big ? 0.62 : 0.4 + rng() * 0.16),
        kind, big, a: rng() * Math.PI,
      });
    }
  }
  // Small fillers in the gaps.
  for (let k = 0; k < 40; k++) {
    spots.push({ x: rng() * S, y: rng() * S, r: 14 + rng() * 16, kind: rng() < 0.5 ? daisy : tinyFlower, a: rng() * 3 });
  }
  // Big ones first so smaller blooms overlap them.
  spots.sort((p, q) => q.r - p.r);
  for (const f of spots) {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const x = f.x + dx;
        const y = f.y + dy;
        if (x < -f.r * 1.2 || y < -f.r * 1.2 || x > S + f.r * 1.2 || y > S + f.r * 1.2) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(f.a);
        f.kind(ctx, f.r, rng);
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 0.12;
  ctx.drawImage(noiseCanvas(64, rng, 3, [40, 20, 5]), 0, 0, S, S);
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.inches = 30;
  return t;
}

function petals(ctx, n, r, w, col, inner = 0) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i / n) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(inner + (r - inner) / 2, 0, (r - inner) / 2, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function disc(ctx, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

function scallop(ctx, n, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.3, 0, Math.PI * 2);
  }
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
}

// Layered brown/orange bloom with a yellow heart.
function bigBloom(ctx, r) {
  scallop(ctx, 10, r, '#5c3219');
  scallop(ctx, 10, r * 0.86, '#7a4524');
  ctx.save();
  ctx.rotate(Math.PI / 8);
  scallop(ctx, 8, r * 0.64, '#c8641c');
  ctx.restore();
  scallop(ctx, 8, r * 0.46, '#ef9a2a');
  disc(ctx, r * 0.24, '#f7c843');
  petals(ctx, 8, r * 0.2, r * 0.05, '#fff1c4', r * 0.06);
  disc(ctx, r * 0.07, '#8a4a18');
}

// Round-petalled flower in orange with a cream ring and dotted centre.
function petalFlower(ctx, r, rng) {
  const hot = rng() < 0.5;
  petals(ctx, 6, r, r * 0.34, hot ? '#e8661e' : '#f0a02a');
  petals(ctx, 6, r * 0.9, r * 0.24, hot ? '#f28a2e' : '#f7c843');
  disc(ctx, r * 0.4, '#fff0cc');
  disc(ctx, r * 0.3, '#e27a22');
  disc(ctx, r * 0.18, '#6e3616');
  ctx.fillStyle = '#f7c843';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Thin pointed petals, like a marigold seen from above.
function sunburst(ctx, r, rng) {
  const cols = rng() < 0.5 ? ['#e8801e', '#f7c843'] : ['#f2b632', '#fbe07a'];
  petals(ctx, 24, r, r * 0.08, cols[0]);
  ctx.save();
  ctx.rotate(Math.PI / 24);
  petals(ctx, 24, r * 0.78, r * 0.06, cols[1]);
  ctx.restore();
  disc(ctx, r * 0.26, '#c8641c');
  disc(ctx, r * 0.15, '#7a3a14');
}

function daisy(ctx, r) {
  petals(ctx, 8, r, r * 0.22, '#fbecc8');
  disc(ctx, r * 0.32, '#f0a02a');
  disc(ctx, r * 0.14, '#8a4a18');
}

function tinyFlower(ctx, r) {
  petals(ctx, 5, r, r * 0.3, '#f7c843');
  disc(ctx, r * 0.3, '#e8661e');
}

function drawDaisy(ctx, x, y, r, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe2c2';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(r * 0.4, 0, r * 0.26, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#5a3a14';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function makeTapeTexture(seed = 5) {
  const rng = makeRng(seed);
  const c = canvas(64, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e4d3a4';
  ctx.fillRect(0, 0, 64, 512);
  // Crepe wrinkles run across the tape.
  for (let y = 0; y < 512; y += 1 + rng() * 3) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120,100,60,0.10)' : 'rgba(255,250,230,0.12)';
    ctx.fillRect(0, y, 64, 1);
  }
  ctx.fillStyle = 'rgba(90,70,40,0.25)';
  ctx.fillRect(0, 0, 2, 512);
  ctx.fillRect(62, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Window cookie for the spot light: a four-pane sash window with a curtain edge.
export function makeWindowCookie() {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = '#fff4dc';
  const m = 90;
  const bar = 16;
  const w = (S - 2 * m - bar) / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillRect(m + i * (w + bar), m + j * (w + bar), w, w);
    }
  }
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeDiceFace(n) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(0, 0, S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(120,100,70,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const pip = (x, y) => {
    ctx.fillStyle = n === 1 ? '#b3121a' : '#141414';
    ctx.beginPath();
    ctx.arc(x * S, y * S, n === 1 ? S * 0.13 : S * 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(x * S - 3, y * S - 3, S * 0.03, 0, Math.PI * 2);
    ctx.fill();
  };
  const L = 0.27;
  const M = 0.5;
  const R = 0.73;
  const layouts = {
    1: [[M, M]],
    2: [[L, L], [R, R]],
    3: [[L, L], [M, M], [R, R]],
    4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [M, M], [L, R], [R, R]],
    6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]],
  };
  layouts[n].forEach(([x, y]) => pip(x, y));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeSoftSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSmokeSprite(seed = 21) {
  const rng = makeRng(seed);
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = S / 2 + (rng() - 0.5) * S * 0.4;
    const y = S / 2 + (rng() - 0.5) * S * 0.4;
    const r = S * (0.12 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Rounded-square outline with a soft glow, used for tile highlights.
export function makeTileHighlight() {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const pad = 22;
  const r = 34;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(pad, pad, S - pad * 2, S - pad * 2, r);
  };
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  path();
  ctx.fill();
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 7;
  path();
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeRingTexture() {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  // Tick marks like a gun sight.
  ctx.lineWidth = 8;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.28, S / 2 + Math.sin(a) * S * 0.28);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.46, S / 2 + Math.sin(a) * S * 0.46);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeScorchTexture(seed = 31) {
  const rng = makeRng(seed);
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const a = rng() * 6.28;
    const d = rng() * S * 0.22;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    const r = S * (0.08 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,14,10,0.35)');
    g.addColorStop(1, 'rgba(20,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
