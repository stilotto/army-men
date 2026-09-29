// The kid across the kitchen playing Tan: greedy but sensible. Shoots the
// best target it can, otherwise advances toward cover and a good firing spot.
import { reachable, targetsFor, dist, canAttack } from './rules.js';

const VALUE = { officer: 1.6, mg: 1.4, mortar: 1.3, bazooka: 1.2, flame: 1.2, prone: 1.0, rifle: 1.0, charger: 0.9 };
const ORDER = ['mortar', 'mg', 'prone', 'rifle', 'bazooka', 'officer', 'charger', 'flame'];

function bestShot(game, u, from) {
  const opts = targetsFor(game.board, game.units, u, from);
  let best = null;
  for (const o of opts) {
    const score = o.chance * (VALUE[o.target.type] || 1);
    if (!best || score > best.score) best = { ...o, score };
  }
  return best;
}

function nearestEnemy(game, u, at) {
  let best = Infinity;
  for (const e of game.units) if (e.alive && e.team !== u.team) best = Math.min(best, dist(at, e));
  return best;
}

function threatAt(game, u, at) {
  // How many enemies could shoot this tile next turn (rough).
  let n = 0;
  for (const e of game.units) {
    if (!e.alive || e.team === u.team) continue;
    const d = dist(at, e);
    if (d <= e.def.range + (e.def.heavy ? 0 : e.def.move)) n += 1;
  }
  return n;
}

export async function runAI(game) {
  const mine = () => game.units
    .filter((u) => u.alive && u.team === game.turn)
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

  const session = game.session;
  for (const u of mine()) {
    if (game.over || game.session !== session) return;
    if (!u.alive) continue;
    let shot = bestShot(game, u, u);
    // Heavy weapons fire from where they are; others fire if the odds are decent.
    if (shot && (u.def.heavy || shot.chance >= 0.45)) {
      await focus(game, u);
      await game.attack(u, shot);
      continue;
    }
    // Pick a tile to move to.
    const moves = [...reachable(game.board, game.units, u).values()];
    let bestMove = null;
    let bestScore = scoreTile(game, u, u, shot);
    for (const m of moves) {
      const s = scoreTile(game, u, m, bestShot(game, u, m));
      if (s > bestScore) {
        bestScore = s;
        bestMove = m;
      }
    }
    if (bestMove) {
      await focus(game, u);
      await game.move(u, bestMove);
      game.select(null);
      if (game.over) return;
    }
    if (canAttack(game.board, game.units, u)) {
      shot = bestShot(game, u, u);
      if (shot) await game.attack(u, shot);
    }
    await game.fx.wait(0.25);
  }
}

function scoreTile(game, u, at, shot) {
  let s = 0;
  if (shot) s += shot.chance * (VALUE[shot.target.type] || 1) * (u.def.heavy ? 0.6 : 2);
  const near = nearestEnemy(game, u, at);
  // Want to be inside our range, not too deep.
  s -= Math.max(0, near - u.def.range) * 0.35;
  if (u.type === 'mortar' || u.type === 'officer') s -= Math.max(0, 3 - near) * 0.4;
  // Cover is good.
  for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const t = game.board.terrainAt(at.c + dc, at.r + dr);
    if (t && t.cover) s += 0.25;
  }
  s -= threatAt(game, u, at) * 0.05;
  s += Math.random() * 0.08;
  return s;
}

async function focus(game, u) {
  if (game.rig.mode === 'adult') game.rig.focusOn(u.view.root.position);
  else game.rig.focusOn(u.view.root.position);
  u.view.root.updateMatrixWorld();
  await game.fx.wait(0.45);
}
