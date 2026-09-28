// Turn-based play: selecting figures, moving, rolling to hit, and acting out
// the fight with dice, noise and knocked-over soldiers.
import * as THREE from 'three';
import { UNIT_TYPES, LINEUP, TEAMS } from '../units/types.js';
import { UnitView } from '../units/unitView.js';
import { Board, reachable, targetsFor, rollDice, dist, key, unitAt, canAttack } from './rules.js';
import { makeTileHighlight, makeRingTexture } from '../scene/textures.js';
import { runAI } from './ai.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sleep = (fx, s) => fx.wait(s);

export class Game {
  constructor({ world, fx, dice, sound, ui, rig }) {
    Object.assign(this, { world, fx, dice, sound, ui, rig });
    this.units = [];
    this.busy = false;
    this.selected = null;
    this.options = { moves: new Map(), targets: [] };
    this.makeOverlays();
  }

  makeOverlays() {
    const scene = this.world.scene;
    const tileMat = new THREE.MeshBasicMaterial({
      map: makeTileHighlight(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    const geo = new THREE.PlaneGeometry(8, 8);
    geo.rotateX(-Math.PI / 2);
    this.tiles = new THREE.InstancedMesh(geo, tileMat, 128);
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tiles.count = 0;
    this.tiles.renderOrder = 4;
    this.tiles.frustumCulled = false;
    scene.add(this.tiles);

    const ringTex = makeRingTexture();
    const ringGeo = new THREE.PlaneGeometry(6, 6);
    ringGeo.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.5, 0.9),
    }));
    this.selRing.visible = false;
    this.selRing.renderOrder = 5;
    this.selRing.position.y = 0.06;
    scene.add(this.selRing);

    this.targetRings = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 0.35, 0.25),
      }));
      m.visible = false;
      m.renderOrder = 5;
      m.position.y = 0.07;
      scene.add(m);
      this.targetRings.push(m);
    }
    this.hoverTile = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tileMat.map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.5, 0.5, 0.45),
      polygonOffset: true, polygonOffsetFactor: -4,
    }));
    this.hoverTile.visible = false;
    this.hoverTile.renderOrder = 4;
    scene.add(this.hoverTile);
    // Small pips under figures that still have orders this turn.
    this.readyMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  // ---------------------------------------------------------------- setup

  start(roomDef, mode, demo = false) {
    this.clear();
    this.mode = mode; // 'ai' or 'hotseat'
    this.board = new Board(roomDef, this.world.terrain);
    let id = 0;
    for (const team of ['tan', 'green']) {
      for (const l of LINEUP) {
        // Tan deploys on the north rows (0-1), green on the south rows (7-8).
        const r = team === 'tan' ? l.r : roomDef.board.rows - 1 - l.r;
        const c = team === 'tan' ? roomDef.board.cols - 1 - l.c : l.c;
        const u = {
          id: id++, type: l.type, def: UNIT_TYPES[l.type], team, c, r, alive: true, moved: false, fired: false,
        };
        u.view = new UnitView(u, this.world);
        const ready = new THREE.Mesh(this.selRing.geometry, this.readyMat.clone());
        ready.material.color = new THREE.Color(TEAMS[team].ui).multiplyScalar(0.9);
        ready.scale.setScalar(0.62);
        ready.position.y = 0.05;
        ready.renderOrder = 4;
        ready.visible = false;
        u.view.root.add(ready);
        u.ready = ready;
        this.units.push(u);
      }
    }
    this.turn = 'green';
    this.round = 1;
    this.over = demo;
    if (demo) return;
    this.ui.onGameStart(this);
    this.beginTurn();
  }

  clear() {
    for (const u of this.units) u.view.dispose();
    this.units = [];
    this.selected = null;
    this.dice.clear();
    this.clearHighlights();
  }

  isHumanTurn() {
    return !this.over && (this.mode === 'hotseat' || this.turn === 'green');
  }

  beginTurn() {
    for (const u of this.units) {
      u.moved = false;
      u.fired = false;
    }
    this.select(null);
    this.sound.play('turn');
    this.ui.turnBanner(this.turn, this.round);
    this.refreshReady();
    this.ui.update(this);
    if (!this.isHumanTurn() && !this.over) {
      this.busy = true;
      this.ui.update(this);
      setTimeout(() => runAI(this).then(() => {
        this.busy = false;
        if (!this.over) this.endTurn();
      }), 1300);
    }
  }

  endTurn() {
    if (this.over) return;
    this.dice.clear();
    this.turn = this.turn === 'green' ? 'tan' : 'green';
    if (this.turn === 'green') this.round++;
    this.beginTurn();
  }

  refreshReady() {
    for (const u of this.units) {
      const hasOrders = u.alive && u.team === this.turn && (!u.moved || canAttack(this.board, this.units, u)) && !u.fired;
      u.ready.visible = hasOrders && u !== this.selected;
    }
  }

  unitsLeft(team) {
    return this.units.filter((u) => u.alive && u.team === team).length;
  }

  anyOrdersLeft() {
    return this.units.some((u) => u.alive && u.team === this.turn && !u.fired && (!u.moved || canAttack(this.board, this.units, u)));
  }

  // ------------------------------------------------------------ selection

  select(u) {
    this.selected = u;
    this.clearHighlights();
    if (u) {
      this.sound.play('select');
      this.options.moves = u.team === this.turn ? reachable(this.board, this.units, u) : new Map();
      this.options.targets = u.team === this.turn ? targetsFor(this.board, this.units, u) : [];
      this.showHighlights(u);
      if (this.rig.mode === 'kid') this.rig.focusOn(u.view.root.position);
    }
    this.refreshReady();
    this.ui.update(this);
  }

  clearHighlights() {
    this.tiles.count = 0;
    this.selRing.visible = false;
    for (const r of this.targetRings) r.visible = false;
    this.options = { moves: new Map(), targets: [] };
    this.ui?.setTargetLabels([]);
  }

  showHighlights(u) {
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let i = 0;
    for (const n of this.options.moves.values()) {
      const p = this.world.tileCenter(n.c, n.r);
      m.makeTranslation(p.x, 0.05, p.z);
      this.tiles.setMatrixAt(i, m);
      col.setRGB(0.35, 0.72, 1.0).multiplyScalar(0.9);
      this.tiles.setColorAt(i, col);
      i++;
    }
    this.tiles.count = i;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.selRing.visible = true;
    this.selRing.material.color.set(TEAMS[u.team].ui).multiplyScalar(2.2);
    this.options.targets.forEach((t, k) => {
      const ring = this.targetRings[k];
      if (!ring) return;
      ring.visible = true;
      ring.position.x = t.target.view.root.position.x;
      ring.position.z = t.target.view.root.position.z;
    });
    this.ui.setTargetLabels(this.options.targets);
  }

  hover(tile) {
    if (!tile || this.busy || !this.isHumanTurn()) {
      this.hoverTile.visible = false;
      return;
    }
    const p = this.world.tileCenter(tile.c, tile.r);
    this.hoverTile.position.set(p.x, 0.045, p.z);
    this.hoverTile.visible = true;
  }

  /** Input from a tap: either a unit or a floor tile. */
  async tap(unit, tile) {
    if (this.busy || this.over) return;
    if (!this.isHumanTurn()) return;
    const sel = this.selected;
    if (unit && sel && unit.team !== sel.team && sel.team === this.turn) {
      const opt = this.options.targets.find((t) => t.target === unit);
      if (opt) return this.attack(sel, opt);
      this.ui.toast(this.whyNot(sel, unit), 'warn');
      return;
    }
    if (unit) {
      this.select(unit === sel ? null : unit);
      return;
    }
    if (tile && sel && sel.team === this.turn) {
      const n = this.options.moves.get(key(tile.c, tile.r));
      if (n) return this.move(sel, n);
    }
    if (tile) {
      const u = unitAt(this.units, tile.c, tile.r);
      if (u) return this.select(u === sel ? null : u);
    }
    this.select(null);
  }

  whyNot(att, target) {
    if (att.fired) return `${att.def.name} already fired this turn.`;
    if (att.def.heavy && att.moved) return `${att.def.name} can’t move and fire in one turn.`;
    const d = dist(att, target);
    if (d > att.def.range) return `Out of range (${d} tiles, range ${att.def.range}).`;
    if (att.def.minRange && d < att.def.minRange) return 'Too close for the mortar!';
    return 'Can’t see them from here — something’s in the way.';
  }

  async move(u, node) {
    this.busy = true;
    this.clearHighlights();
    this.selRing.visible = false;
    this.ui.update(this);
    await u.view.moveAlong(node.path, (s) => this.sound.play(s));
    u.c = node.c;
    u.r = node.r;
    u.moved = true;
    this.busy = false;
    // Stay selected so the figure can still shoot after moving.
    if (canAttack(this.board, this.units, u) && targetsFor(this.board, this.units, u).length) this.select(u);
    else this.select(null);
    this.afterAction();
  }

  afterAction() {
    this.refreshReady();
    this.ui.update(this);
    if (this.isHumanTurn() && !this.anyOrdersLeft()) this.ui.nudgeEndTurn();
  }

  // --------------------------------------------------------------- combat

  async attack(att, opt) {
    const tgt = opt.target;
    const d = att.def;
    this.busy = true;
    this.clearHighlights();
    this.selected = null;
    this.ui.update(this);
    att.view.faceToward(tgt.view.root.position);

    const a = att.view.root.position;
    const b = tgt.view.root.position;
    // Lean in on the action; the grown-up view steps back afterwards.
    const prevDist = this.rig.want.dist;
    if (this.rig.mode === 'kid') this.rig.lookAcross(a, b, Math.max(26, a.distanceTo(b) * 0.9 + 14));
    else this.rig.focusOn(V().lerpVectors(a, b, 0.5), THREE.MathUtils.clamp(a.distanceTo(b) * 0.9 + 34, 50, prevDist));
    await sleep(this.fx, 0.35);

    // Roll the dice right there on the floor.
    const values = rollDice(d.dice);
    const hits = values.filter((v) => v >= opt.need).length;
    const cam = this.world.camera.position;
    const side = V(-(b.z - a.z), 0, b.x - a.x).normalize();
    if (side.dot(V(cam.x - a.x, 0, cam.z - a.z)) < 0) side.negate();
    const spot = a.clone().addScaledVector(side, 5).addScaledVector(V().subVectors(b, a).normalize(), 2);
    const fromDir = V(cam.x - spot.x, 0, cam.z - spot.z).normalize();
    this.ui.showRoll(att, tgt, opt, null);
    await this.dice.roll(values, spot, fromDir, (h) => this.sound.play('dice', { h }));
    this.ui.showRoll(att, tgt, opt, values);
    await sleep(this.fx, 0.55);

    att.fired = true;
    const knocked = hits > 0;
    await this.actOut(att, tgt, knocked);
    if (knocked) {
      this.knock(tgt, a);
      this.ui.toast(`${TEAMS[tgt.team].name.split(' ')[0]} ${tgt.def.name} knocked over!`, 'hit');
    } else {
      this.ui.toast('Missed!', 'miss');
    }
    if (d.blast) await this.blast(att, tgt, knocked);
    await sleep(this.fx, knocked ? 0.8 : 0.4);
    if (this.rig.mode === 'adult') this.rig.want.dist = prevDist;
    this.busy = false;
    this.checkWin();
    this.afterAction();
  }

  knock(u, fromPos) {
    u.alive = false;
    u.ready.visible = false;
    this.sound.play('topple');
    u.view.knockDown(fromPos);
    this.ui.update(this);
  }

  async blast(att, tgt, landedOnTarget) {
    // Everyone next to the impact rolls: a 5 or 6 and they go over too.
    const center = landedOnTarget ? tgt : this.lastImpactTile;
    if (!center) return;
    const victims = this.units.filter((u) => u.alive && u !== tgt && dist(u, center) <= 1);
    for (const v of victims) {
      const [roll] = rollDice(1);
      if (roll >= 5) {
        this.knock(v, this.world.tileCenter(center.c, center.r));
        this.ui.toast(`Blast! ${v.def.name} rolled ${roll} and toppled.`, 'hit');
      } else {
        this.ui.toast(`${v.def.name} rolled ${roll} — still standing.`, 'miss');
      }
      await sleep(this.fx, 0.35);
    }
  }

  /** The animated part: muzzle flash, tracers, rockets, flames... */
  async actOut(att, tgt, hit) {
    const fx = this.fx;
    const muzzle = att.view.worldMuzzle();
    const body = tgt.view.root.position.clone().setY(tgt.def.prone ? 0.8 : 1.6);
    const missPoint = () => {
      const off = V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 2.5);
      return tgt.view.root.position.clone().add(off).setY(0.1);
    };
    const dir = V().subVectors(body, muzzle).normalize();
    switch (att.def.weapon) {
      case 'rifle':
      case 'pistol': {
        this.sound.play(att.def.weapon === 'pistol' ? 'pistol' : 'rifle');
        fx.muzzleFlash(muzzle, dir, att.def.weapon === 'pistol' ? 0.6 : 1);
        att.view.recoil(0.3);
        const to = hit ? body : missPoint();
        await fx.tracer(muzzle, to);
        fx.impactDust(to, hit ? 0.6 : 1);
        if (!hit) this.sound.play('ricochet');
        break;
      }
      case 'mg': {
        this.sound.play('mg');
        const shots = [];
        for (let i = 0; i < 6; i++) {
          const s = (async () => {
            await fx.wait(i * 0.085);
            fx.muzzleFlash(muzzle, dir, 0.8);
            att.view.recoil(0.12);
            const to = hit && i >= 3 ? body.clone().add(V((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0)) : missPoint();
            await fx.tracer(muzzle, to, 110);
            fx.impactDust(to, 0.5);
          })();
          shots.push(s);
        }
        await Promise.all(shots);
        break;
      }
      case 'bazooka': {
        this.sound.play('bazooka');
        fx.muzzleFlash(muzzle, dir, 1.3);
        const back = att.view.root.position.clone().add(dir.clone().multiplyScalar(-2.2)).setY(1.8);
        for (let i = 0; i < 10; i++) {
          fx.emit({
            pos: back, vel: dir.clone().multiplyScalar(-6 - Math.random() * 6).add(V(Math.random() - 0.5, Math.random(), Math.random() - 0.5)),
            color: new THREE.Color(0.8, 0.78, 0.74), alpha: 0.55, size0: 1, size1: 4, life: 1.6, drag: 2,
          });
        }
        att.view.recoil(0.4);
        const to = hit ? body.clone().setY(1) : missPoint();
        await fx.rocket(muzzle, to);
        fx.explosion(to, 0.75);
        this.sound.play('boom', { size: 0.8 });
        break;
      }
      case 'mortar': {
        this.sound.play('mortar');
        fx.muzzleFlash(muzzle, V(0, 1, 0), 1.2);
        att.view.recoil(0.15);
        let to;
        if (hit) {
          to = tgt.view.root.position.clone().setY(0.2);
          this.lastImpactTile = { c: tgt.c, r: tgt.r };
        } else {
          // Scatter one tile in a random direction.
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
            .map(([dc, dr]) => ({ c: tgt.c + dc, r: tgt.r + dr }))
            .filter((t) => this.board.inside(t.c, t.r));
          const land = opts[Math.floor(Math.random() * opts.length)] || tgt;
          this.lastImpactTile = land;
          to = this.world.tileCenter(land.c, land.r).setY(0.2);
        }
        const focus = to.clone();
        if (this.rig.mode === 'adult') this.rig.focusOn(focus);
        await fx.shell(muzzle, to);
        fx.explosion(to, 1.15);
        this.sound.play('boom', { size: 1.2 });
        break;
      }
      case 'flame': {
        this.sound.play('flame');
        att.view.recoil(0.1);
        const to = hit ? body.clone().setY(1) : missPoint().setY(0.6);
        await fx.flame(muzzle, to, 1.1);
        break;
      }
      default:
        break;
    }
  }

  checkWin() {
    const g = this.unitsLeft('green');
    const t = this.unitsLeft('tan');
    if (g && t) return;
    this.over = true;
    const winner = g ? 'green' : 'tan';
    this.ui.gameOver(winner, this);
  }

  update(dt) {
    for (const u of this.units) u.view.update(dt);
    if (this.selRing.visible && this.selected) {
      this.selRing.position.x = this.selected.view.root.position.x;
      this.selRing.position.z = this.selected.view.root.position.z;
      this.selRing.rotation.y += dt * 0.8;
    }
    const pulse = 0.75 + Math.sin(performance.now() * 0.005) * 0.25;
    for (const r of this.targetRings) {
      if (r.visible) {
        r.rotation.y -= dt * 1.2;
        r.scale.setScalar(0.85 + pulse * 0.2);
      }
    }
    this.readyMat.opacity = pulse;
    for (const u of this.units) if (u.ready.visible) u.ready.material.opacity = 0.45 + pulse * 0.4;
  }
}
