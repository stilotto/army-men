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

const comingSoon = (id, name, year, blurb, swatch) => ({ id, name, year, blurb, swatch, available: false });

export const ROOMS = [
  kitchen,
  comingSoon('bathroom', 'Upstairs Bathroom', '1974', 'Tiny pink penny tiles, a tub to fight around, and a fuzzy bath mat swamp.', ['#f3c6cf', '#ffffff', '#7fb7c9', '#c0c7cc']),
  comingSoon('gameroom', 'Basement Game Room', '1979', 'Shag carpet jungle, a ping-pong table fortress and wood paneling.', ['#8a6a2c', '#4f6b3a', '#c8542a', '#3a2a1c']),
  comingSoon('porch', 'Screened Porch', '1981', 'Painted planks with gaps to leap and a sunbeam that moves all afternoon.', ['#6b8aa0', '#d8d2c0', '#9a5a2a', '#2f4a2a']),
];

export const getRoom = (id) => ROOMS.find((r) => r.id === id) || kitchen;
