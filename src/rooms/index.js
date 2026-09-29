// Battlefields. Each room describes its floor, its furniture and the stuff
// lying around that becomes terrain. New rooms plug in here.
import * as P from '../scene/props.js';

export const TERRAIN = {
  cereal: { name: 'Cereal box', blocks: true, cover: true },
  can: { name: 'Soup can', blocks: true, cover: true },
  mug: { name: 'Coffee mug', blocks: true, cover: true },
  block: { name: 'Toy block', blocks: true, cover: true },
  sponge: { name: 'Sponge', blocks: false, cover: true },
  spoon: { name: 'Wooden spoon', blocks: false, cover: true, span: 2 },
};

const kitchen = {
  id: 'kitchen',
  name: 'Mom’s Kitchen',
  year: '1977',
  available: true,
  blurb: 'Speckled 8″ linoleum, an avocado fridge, and a box of cereal someone left out.',
  tile: 8,
  room: { x0: -88, x1: 88, z0: -72, z1: 80 },
  wallHeight: 96,
  board: { cols: 12, rows: 9, x0: -48, z0: -40 },
  palette: {
    light: {
      base: '#e7dcc2',
      mottle: 0.16,
      streakA: '#c9b692',
      streakB: '#fff8e6',
      speckles: ['#8b7a5c', '#5e5040', '#b6a27c', '#fffaf0', '#a8472e'],
      grime: 'rgba(90,70,40,0.22)',
      roughness: 0.32,
    },
    dark: {
      base: '#84503f',
      mottle: 0.22,
      streakA: '#6e3624',
      streakB: '#b36a4a',
      speckles: ['#e2c9a0', '#4a2418', '#c07a55', '#2d1a12'],
      grime: 'rgba(40,20,10,0.3)',
      roughness: 0.36,
    },
  },
  swatch: ['#e7dcc2', '#8d4c34', '#6d7a32', '#d98b2b'],
  // Board coordinates: c = column (0..11, west to east), r = row (0..8, north to south).
  terrain: [
    { type: 'cereal', c: 2, r: 4, rot: 0.25 },
    { type: 'can', c: 9, r: 4, rot: 0 },
    { type: 'mug', c: 6, r: 3, rot: 2.2 },
    { type: 'block', c: 5, r: 5, rot: 0.4 },
    { type: 'sponge', c: 3, r: 2, rot: 0.1 },
    { type: 'sponge', c: 8, r: 6, rot: -0.3 },
    { type: 'spoon', c: 9, r: 2, rot: 0 },
    { type: 'spoon', c: 1, r: 6, rot: 0 },
  ],
  window: { z: -4, y: 60, w: 34, h: 40 },
  sun: { from: [240, 194, -14], to: [16, 0, -2], color: '#ffd29a' },
  furnish(group) {
    const { x0, x1, z0 } = this.room;
    const fridge = P.refrigerator();
    fridge.position.set(x0 + 15.5, 0, z0 + 14);
    group.add(fridge);

    const run1 = P.cabinetRun(48, { doors: 2, sink: true });
    run1.position.set(-33, 0, z0 + 12);
    group.add(run1);

    const range = P.stove();
    range.position.set(6, 0, z0 + 13);
    group.add(range);

    const run2 = P.cabinetRun(x1 - 22, { doors: 4 });
    run2.position.set((22 + x1) / 2, 0, z0 + 12);
    group.add(run2);

    for (const [x, w, d] of [[-33, 48, 2], [(22 + x1) / 2, x1 - 22, 4]]) {
      const up = P.upperCabinets(w, { doors: d });
      up.position.set(x, 54, z0 + 6);
      group.add(up);
    }
    const hood = P.upperCabinets(30, { doors: 1, height: 18 });
    hood.position.set(6, 66, z0 + 6);
    group.add(hood);

    const table = P.dinette();
    table.position.set(-66, 0, 58);
    group.add(table);

    const win = P.windowUnit(34, 40);
    win.rotation.y = -Math.PI / 2;
    win.position.set(x1 - 0.2, 60, -4);
    group.add(win);
    return [
      // Footprints on the floor that should be darkened (ambient occlusion).
      { x: x0, z: z0, w: 31, d: 28.5, soft: 5 },
      { x: -57, z: z0, w: 48, d: 21.5, soft: 4 },
      { x: -9, z: z0, w: 30, d: 26, soft: 4 },
      { x: 22, z: z0, w: x1 - 22, d: 21.5, soft: 4 },
    ];
  },
};

// Stilotto's galley kitchen: a band of floor along the top wall, a long aisle
// between the appliance wall and the sink counter, and a bottom area with the
// kitchen table. Only the linoleum between them is in play.
// Room coordinates are inches from the room centre; x runs west to east.
const STILOTTO_PLAY = [
  // c: 0         1111
  //    0123456789 01234
  '............###', // r0  top band
  '............###',
  '............###',
  '#######.....###', // r3  aisle: fridge / counter / range / counter | counters & sink
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###',
  '#######.....###', // r12 end of the sink counter
  '#######........',
  '#######........',
  '####......ttttt', // r15 bottom area; t = under the kitchen table
  '####......ttttt',
  '####......ttttt',
  '####......ttttt',
  '####...........',
  '####...........', // r20
];

const stilotto = {
  id: 'stilotto',
  name: 'Stilotto’s Kitchen',
  year: '1977',
  available: true,
  blurb: 'White flecked linoleum, a long aisle past the fridge and the sink, and flower-power wallpaper.',
  tile: 8,
  room: { x0: -60, x1: 60, z0: -84, z1: 84 },
  wallHeight: 96,
  // How close the camera may get to the north wall (no cabinets there).
  camPad: 4,
  board: { cols: 15, rows: 21, x0: -60, z0: -84, play: STILOTTO_PLAY },
  // Starting tiles [c, r], in LINEUP order. Tan holds the top band, Green the table end.
  deploy: {
    tan: [[1, 0], [4, 0], [9, 0], [11, 2], [3, 1], [7, 2], [6, 1], [8, 2], [10, 1]],
    green: [[5, 20], [7, 19], [9, 20], [12, 20], [4, 17], [8, 17], [6, 17], [9, 18], [11, 19]],
  },
  // Kid's-eye starting spot for each side: [x, z, yaw].
  kidHome: { green: [4, 52, 0], tan: [-8, -62, Math.PI] },
  viewDist: 150,
  wallpaper: 'flowerPower',
  palette: {
    light: {
      base: '#f5f4f0',
      mottle: 0.07,
      streakA: '#deddd8',
      streakB: '#ffffff',
      speckles: ['#8c8c8a', '#6a6a69', '#a8a8a5', '#c2c2bf', '#4a4a4a'],
      grime: 'rgba(80,78,72,0.12)',
      roughness: 0.3,
    },
    dark: {
      base: '#ebeae5',
      mottle: 0.09,
      streakA: '#d6d5d0',
      streakB: '#fbfbf8',
      speckles: ['#7d7d7b', '#5c5c5b', '#9d9d9a', '#b8b8b5', '#444'],
      grime: 'rgba(80,78,72,0.14)',
      roughness: 0.32,
    },
  },
  swatch: ['#f5f4f0', '#e07a1f', '#f2b632', '#4a2614'],
  terrain: [
    { type: 'spoon', c: 1, r: 2, rot: 0 },
    { type: 'mug', c: 10, r: 4, rot: 1.2 },
    { type: 'cereal', c: 9, r: 7, rot: 0.3 },
    { type: 'block', c: 7, r: 9, rot: 0.5 },
    { type: 'sponge', c: 11, r: 9, rot: -0.2 },
    { type: 'can', c: 8, r: 11, rot: 0 },
    { type: 'spoon', c: 12, r: 14, rot: 0 },
    { type: 'sponge', c: 6, r: 16, rot: 0.3 },
  ],
  // Window over the sink in the east wall.
  window: { z: -28, y: 60, w: 30, h: 36 },
  sun: { from: [210, 224, -78], to: [0, 0, -8], color: '#ffd29a' },
  // Solid, non-kitchen space: the hallway and closet behind the appliance wall.
  solids: [{ x0: -60, x1: -28, z0: -60, z1: 84 }],
  // Wall segments: a and b are ends, n is the direction the paper faces.
  walls: [
    { a: [-60, -84], b: [60, -84], n: [0, 1] },
    { a: [-60, 84], b: [60, 84], n: [0, -1] },
    { a: [-60, -84], b: [-60, 84], n: [1, 0] },
    { a: [60, -84], b: [60, 84], n: [-1, 0], window: true },
    { a: [-60, -60], b: [-28, -60], n: [0, -1] }, // hallway wall with the bedroom door
    { a: [-28, -60], b: [-28, 84], n: [1, 0] }, // appliance wall, then closet wall
  ],
  furnish(group) {
    const X = (x) => x - 60; // sketch inches -> room coordinates
    const Z = (z) => z - 84;
    const face = { east: Math.PI / 2, west: -Math.PI / 2, south: 0, north: Math.PI };

    // Appliance wall (fronts at x = 56): fridge, counter, range, counter.
    const fridge = P.refrigerator();
    fridge.rotation.y = face.east;
    fridge.position.set(X(40), 0, Z(39));
    group.add(fridge);
    const c1 = P.cabinetRun(16, { doors: 1 });
    c1.rotation.y = face.east;
    c1.position.set(X(44), 0, Z(62));
    group.add(c1);
    const range = P.stove();
    range.rotation.y = face.east;
    range.position.set(X(43), 0, Z(85));
    group.add(range);
    const c2 = P.cabinetRun(20, { doors: 1 });
    c2.rotation.y = face.east;
    c2.position.set(X(44), 0, Z(110));
    group.add(c2);
    for (const [z, w, y, h] of [[39, 30, 70, 18], [62, 16, 54, 30], [85, 30, 66, 18], [110, 20, 54, 30]]) {
      const up = P.upperCabinets(w, { doors: w > 20 ? 2 : 1, height: h });
      up.rotation.y = face.east;
      up.position.set(X(38), y, Z(z));
      group.add(up);
    }

    // Sink wall (fronts at x = 96): counter, sink under the window, counter.
    for (const [z, w, opts] of [[20, 40, { doors: 2 }], [56, 32, { doors: 2, sink: true }], [88, 32, { doors: 2 }]]) {
      const run = P.cabinetRun(w, opts);
      run.rotation.y = face.west;
      run.position.set(X(108), 0, Z(z));
      group.add(run);
    }
    for (const [z, w] of [[20, 40], [88, 32]]) {
      const up = P.upperCabinets(w, { doors: 2 });
      up.rotation.y = face.west;
      up.position.set(X(114), 54, Z(z));
      group.add(up);
    }
    const win = P.windowUnit(30, 36);
    win.rotation.y = face.west;
    win.position.set(this.room.x1 - 0.2, 60, this.window.z);
    group.add(win);

    // Doors: bedroom off the top band, closet off the table end.
    const br = P.door(26, 80);
    br.rotation.y = face.north;
    br.position.set(X(16), 0, Z(24));
    group.add(br);
    const closet = P.door(28, 80);
    closet.rotation.y = face.east;
    closet.position.set(X(32), 0, Z(140));
    group.add(closet);

    // Kitchen table against the east wall with two chairs tucked in.
    const table = P.kitchenTable(32, 26);
    table.position.set(X(104), 0, Z(134));
    group.add(table);

    return [
      { x: X(0), z: Z(24), w: 32, d: 144, soft: 5 },
      { x: X(24), z: Z(24), w: 32, d: 96, soft: 4 },
      { x: X(96), z: Z(0), w: 24, d: 104, soft: 4 },
    ];
  },
};

const comingSoon = (id, name, year, blurb, swatch) => ({ id, name, year, blurb, swatch, available: false });

export const ROOMS = [
  kitchen,
  stilotto,
  comingSoon('bathroom', 'Upstairs Bathroom', '1974', 'Tiny pink penny tiles, a tub to fight around, and a fuzzy bath mat swamp.', ['#f3c6cf', '#ffffff', '#7fb7c9', '#c0c7cc']),
  comingSoon('gameroom', 'Basement Game Room', '1979', 'Shag carpet jungle, a ping-pong table fortress and wood paneling.', ['#8a6a2c', '#4f6b3a', '#c8542a', '#3a2a1c']),
  comingSoon('porch', 'Screened Porch', '1981', 'Painted planks with gaps to leap and a sunbeam that moves all afternoon.', ['#6b8aa0', '#d8d2c0', '#9a5a2a', '#2f4a2a']),
];

export const getRoom = (id) => ROOMS.find((r) => r.id === id) || kitchen;
