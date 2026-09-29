import * as THREE from 'three';
import { World } from './scene/world.js';
import { CameraRig } from './camera.js';
import { Effects } from './fx/effects.js';
import { Dice } from './fx/dice.js';
import { Sound } from './fx/audio.js';
import { Game } from './game/game.js';
import { UI } from './ui.js';
import { getRoom } from './rooms/index.js';
import { POSE_NAMES, getFigure } from './units/figure.js';

const params = new URLSearchParams(location.search);
// Test hook: ?step=0.05 advances a fixed time per frame (for slow headless GPUs).
const FIXED_STEP = parseFloat(params.get('step')) || 0;
const NO_RENDER = params.has('norender');
const stage = document.getElementById('stage');
const world = new World(stage);
const ui = new UI(world.camera);
const sound = new Sound();
const fx = new Effects(world.scene);
const dice = new Dice(world.scene);

let room = getRoom('kitchen');
world.buildRoom(room);
const rig = new CameraRig(world.camera, world.renderer.domElement, world.bounds);

function useRoom(id) {
  const next = getRoom(id);
  if (next === room && world.def === room) return;
  room = next;
  world.buildRoom(room);
  rig.bounds = world.bounds;
  rig.wallHeight = room.wallHeight;
  rig.adultDist = room.viewDist || 108;
}
const game = new Game({ world, fx, dice, sound, ui, rig });
window.__game = game;

// Warm the figure cache before the first frame so nothing hitches mid-game.
POSE_NAMES.forEach(getFigure);
game.start(room, 'ai', true);
rig.attract = true;
rig.want.dist = 135;
rig.want.pitch = 0.62;

// ------------------------------------------------------------ input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function pick(e) {
  const rect = world.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, world.camera);
  const hits = ray.intersectObjects(game.units.filter((u) => u.alive).map((u) => u.view.hit), false);
  const unit = hits.length ? hits[0].object.userData.unit : null;
  const p = new THREE.Vector3();
  const tile = ray.ray.intersectPlane(floorPlane, p) ? world.worldToTile(p) : null;
  return { unit, tile };
}

rig.onTap = (e) => {
  sound.ensure();
  const { unit, tile } = pick(e);
  game.tap(unit, tile);
};
rig.onHover = (e) => {
  if (game.over) return;
  const { unit, tile } = pick(e);
  game.hover(unit ? { c: unit.c, r: unit.r } : tile);
  world.renderer.domElement.style.cursor = unit ? 'pointer' : 'default';
};

function startTour() {
  if (rig.tour || !room.tour) return;
  sound.ensure();
  ui.setTouring(true);
  rig.startTour(room.tour, {
    onCaption: (t) => ui.tourCaption(t),
    onEnd: () => {
      ui.setTouring(false);
      // Back on the title screen the room keeps slowly turning.
      if (game.over && !document.getElementById('title').classList.contains('hidden')) rig.attract = true;
    },
  });
}

function setView(mode) {
  if (mode === 'tour') return startTour();
  if (mode === 'toggle') mode = rig.mode === 'adult' ? 'kid' : 'adult';
  const focus = game.selected ? game.selected.view.root.position : null;
  if (mode === 'kid' && !focus) {
    // Drop down behind your own lines, looking toward the enemy.
    const home = game.turn === 'tan' && game.mode === 'hotseat' ? -1 : 1;
    const [hx, hz, yaw] = room.kidHome?.[home > 0 ? 'green' : 'tan'] || [0, home * 6, home > 0 ? 0 : Math.PI];
    rig.setMode('kid', new THREE.Vector3(hx, 0, hz));
    rig.want.yaw = yaw;
    rig.unwrapYaw();
    rig.want.dist = 52;
  } else {
    rig.setMode(mode, focus);
  }
  ui.setView(mode);
}

ui.on('start', ({ room: id, mode }) => {
  sound.ensure();
  useRoom(id);
  rig.attract = false;
  rig.want.yaw = 0;
  rig.unwrapYaw();
  setView(rig.mode);
  game.start(room, mode);
});
ui.on('room', (id) => {
  // Show the picked room behind the title screen.
  useRoom(id);
  game.start(room, 'ai', true);
  rig.want.target.set(0, 0, 2);
  rig.want.dist = 135;
});
ui.on('endturn', () => {
  if (!game.busy && game.isHumanTurn()) game.endTurn();
});
ui.on('view', setView);
ui.on('stoptour', () => rig.stopTour());
ui.on('sound', () => {
  sound.muted = !sound.muted;
  ui.setSound(sound.muted);
});
ui.on('quality', () => {
  world.setQuality(world.quality === 'high' ? 'low' : 'high');
  ui.setQuality(world.quality);
});
ui.on('menu', () => {
  game.start(room, 'ai', true);
  rig.attract = true;
  rig.setMode('adult');
  rig.want.dist = 135;
  rig.want.pitch = 0.62;
  ui.showTitle(true);
});

// ------------------------------------------------------------- loop
const timer = new THREE.Timer();
let frames = 0;
function frame() {
  timer.update();
  const dt = FIXED_STEP || Math.min(timer.getDelta(), 0.05);
  rig.update(dt);
  game.update(dt);
  fx.update(dt);
  dice.update(dt);
  ui.updateLabels();
  if (rig.tour) world.setDepthOfField(true, world.camera.position.distanceTo(rig.tour.lookAt));
  else world.setDepthOfField(rig.mode === 'kid', world.camera.position.distanceTo(rig.cur.target));
  if (!NO_RENDER || frames < 3) world.render();
  frames++;
  if (frames === 3) {
    ui.loaded();
    if (params.has('autostart')) ui.emit('start', { room: params.get('room') || 'kitchen', mode: params.get('mode') || 'ai' });
    if (params.get('view')) setView(params.get('view'));
  }
  if (frames === 30) window.done = true;
  requestAnimationFrame(frame);
}
if (params.get('quality') === 'low') {
  world.setQuality('low');
  ui.setQuality('low');
}
frame();
