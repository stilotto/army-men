// Pure game rules: movement, line of sight, cover and to-hit numbers.
// Units are plain objects: { id, type, def, team, c, r, alive, moved, fired }.

export const key = (c, r) => `${c},${r}`;
export const dist = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

export class Board {
  constructor(def, terrain) {
    this.cols = def.board.cols;
    this.rows = def.board.rows;
    this.terrain = new Map();
    for (const t of terrain) for (const [c, r] of t.tiles) this.terrain.set(key(c, r), t);
  }

  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  terrainAt(c, r) {
    return this.terrain.get(key(c, r));
  }
}

export function unitAt(units, c, r) {
  return units.find((u) => u.alive && u.c === c && u.r === r);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Tiles a unit can end its move on, with the path to each. */
export function reachable(board, units, u) {
  const out = new Map();
  if (u.moved || u.fired) return out;
  const start = key(u.c, u.r);
  const seen = new Map([[start, { c: u.c, r: u.r, path: [] }]]);
  let frontier = [{ c: u.c, r: u.r, path: [] }];
  for (let step = 0; step < u.def.move; step++) {
    const next = [];
    for (const n of frontier) {
      for (const [dc, dr] of DIRS) {
        const c = n.c + dc;
        const r = n.r + dr;
        const k = key(c, r);
        if (!board.inside(c, r) || seen.has(k) || board.terrainAt(c, r)) continue;
        // No squeezing diagonally between two pieces of terrain.
        if (dc && dr && board.terrainAt(n.c + dc, n.r) && board.terrainAt(n.c, n.r + dr)) continue;
        const occ = unitAt(units, c, r);
        if (occ && occ.team !== u.team) continue;
        const node = { c, r, path: [...n.path, [c, r]] };
        seen.set(k, node);
        next.push(node);
        if (!occ) out.set(k, node);
      }
    }
    frontier = next;
  }
  return out;
}

/** True when nothing tall stands between the two tiles. */
export function hasLOS(board, a, b) {
  const steps = Math.max(8, dist(a, b) * 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.c + 0.5 + (b.c - a.c) * t;
    const y = a.r + 0.5 + (b.r - a.r) * t;
    const c = Math.floor(x);
    const r = Math.floor(y);
    if ((c === a.c && r === a.r) || (c === b.c && r === b.r)) continue;
    const ter = board.terrainAt(c, r);
    if (ter && ter.blocks) return false;
  }
  return true;
}

/** Target has something to duck behind on the attacker's side. */
export function inCover(board, attacker, target) {
  const dc = Math.sign(attacker.c - target.c);
  const dr = Math.sign(attacker.r - target.r);
  const checks = [[dc, dr]];
  if (dc && dr) checks.push([dc, 0], [0, dr]);
  return checks.some(([x, y]) => {
    const t = board.terrainAt(target.c + x, target.r + y);
    return t && t.cover;
  });
}

export function officerNearby(units, u) {
  if (u.type === 'officer') return false;
  return units.some((o) => o.alive && o.team === u.team && o.type === 'officer' && dist(o, u) <= 2);
}

/** The number a die must show to hit, plus the reasons. */
export function toHit(board, units, attacker, target) {
  const d = attacker.def;
  let need = d.hit;
  const mods = [];
  if (officerNearby(units, attacker)) {
    need -= 1;
    mods.push({ text: 'Officer nearby', v: +1 });
  }
  const tough = d.explosive || d.indirect || d.ignoresCover;
  if (target.def.prone && !tough) {
    need += 1;
    mods.push({ text: 'Target lying flat', v: -1 });
  }
  if (!tough && inCover(board, attacker, target)) {
    need += 1;
    mods.push({ text: 'Target in cover', v: -1 });
  }
  if (!d.indirect && dist(attacker, target) > d.range - 1 && d.range >= 4) {
    need += 1;
    mods.push({ text: 'Long range', v: -1 });
  }
  need = Math.max(2, Math.min(6, need));
  return { need, mods };
}

export function canAttack(board, units, u) {
  if (u.fired || !u.alive) return false;
  if (u.def.heavy && u.moved) return false;
  return true;
}

/** Enemies this unit could shoot right now, with the odds. */
export function targetsFor(board, units, u, from = u) {
  if (!canAttack(board, units, u)) return [];
  const d = u.def;
  const src = { ...u, c: from.c, r: from.r };
  return units
    .filter((e) => e.alive && e.team !== u.team)
    .filter((e) => {
      const r = dist(src, e);
      if (r > d.range || r < (d.minRange || 1)) return false;
      return d.indirect || hasLOS(board, src, e);
    })
    .map((e) => {
      const { need, mods } = toHit(board, units, src, e);
      const p1 = (7 - need) / 6;
      const chance = 1 - Math.pow(1 - p1, d.dice);
      return { target: e, need, mods, chance };
    });
}

export function rollDice(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}
