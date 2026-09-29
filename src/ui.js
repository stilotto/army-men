// DOM overlay: title screen, HUD, unit card, dice readout, labels and toasts.
import * as THREE from 'three';
import { ROOMS } from './rooms/index.js';
import { TEAMS } from './units/types.js';

const $ = (s) => document.querySelector(s);

const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function dieEl(v, cls = '') {
  const d = document.createElement('div');
  d.className = `pip-die ${cls} ${v === 1 ? 'one' : ''}`;
  for (let i = 0; i < 9; i++) {
    const p = document.createElement('i');
    if (v && PIPS[v].includes(i)) p.className = 'on';
    d.appendChild(p);
  }
  return d;
}

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.roomId = 'kitchen';
    this.mode = 'ai';
    this.labels = [];
    this.handlers = {};
    this.buildRooms();
    $('#mode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.mode = b.dataset.mode;
      document.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#start').addEventListener('click', () => this.emit('start', { room: this.roomId, mode: this.mode }));
    $('#howto').addEventListener('click', () => this.showHelp(true));
    $('#help').addEventListener('click', () => this.showHelp(true));
    $('#closehelp').addEventListener('click', () => this.showHelp(false));
    $('#helpbox').addEventListener('click', (e) => { if (e.target.id === 'helpbox') this.showHelp(false); });
    $('#endturn').addEventListener('click', () => this.emit('endturn'));
    $('#views').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.emit('view', b.dataset.view);
    });
    $('#sound').addEventListener('click', () => this.emit('sound'));
    $('#quality').addEventListener('click', () => this.emit('quality'));
    $('#menu').addEventListener('click', () => this.emit('menu'));
    $('#again').addEventListener('click', () => this.emit('start', { room: this.roomId, mode: this.mode }));
    $('#tomenu').addEventListener('click', () => this.emit('menu'));
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.emit('view', 'adult');
      if (e.key === '2') this.emit('view', 'kid');
      if (e.key === 'v') this.emit('view', 'toggle');
      if (e.key === 'Enter') this.emit('endturn');
      if (e.key === 'Escape') this.showHelp(false);
    });
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name, arg) {
    if (this.handlers[name]) this.handlers[name](arg);
  }

  buildRooms() {
    const wrap = $('#rooms');
    for (const r of ROOMS) {
      const b = document.createElement('button');
      b.className = `room ${r.available ? '' : 'locked'} ${r.id === this.roomId ? 'on' : ''}`;
      b.innerHTML = `<span class="sw">${r.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <b>${r.name}</b><small>${r.year} &middot; ${r.blurb}</small>${r.available ? '' : '<span class="soon">COMING SOON</span>'}`;
      b.addEventListener('click', () => {
        if (!r.available) {
          this.toast(`${r.name} is still being cleaned up. Coming soon!`, 'warn');
          return;
        }
        this.roomId = r.id;
        wrap.querySelectorAll('.room').forEach((x) => x.classList.toggle('on', x === b));
        this.emit('room', r.id);
      });
      wrap.appendChild(b);
    }
  }

  loaded() {
    $('#loading').classList.add('hidden');
    this.showTitle(true);
  }

  showTitle(on) {
    $('#title').classList.toggle('hidden', !on);
    $('#hud').classList.toggle('hidden', on);
    $('#over').classList.add('hidden');
  }

  showHelp(on) {
    $('#helpbox').classList.toggle('hidden', !on);
  }

  setView(mode) {
    this.view = mode;
    document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === mode));
    if (this.game) this.update(this.game);
  }

  setSound(muted) {
    $('#sound').innerHTML = muted ? '&#x1F507;' : '&#x1F50A;';
  }

  setQuality(q) {
    $('#quality').textContent = q === 'high' ? 'HQ' : 'LQ';
  }

  hint(text) {
    $('#hint').textContent = text || '';
  }

  onGameStart(game) {
    this.game = game;
    this.showTitle(false);
    $('#roll').classList.add('hidden');
    $('#toasts').innerHTML = '';
  }

  turnBanner(team, round) {
    const b = $('#banner');
    b.textContent = `${TEAMS[team].name}’s turn`;
    b.style.color = team === 'green' ? '#cfe8a0' : '#f3dcae';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    $('#endturn').classList.remove('nudge');
  }

  nudgeEndTurn() {
    $('#endturn').classList.add('nudge');
  }

  update(game) {
    const t = TEAMS[game.turn];
    $('#turn .dot').style.background = t.ui;
    const who = game.mode === 'ai' ? (game.turn === 'green' ? 'You' : 'Computer') : (game.turn === 'green' ? 'Player 1' : 'Player 2');
    $('#turn .label').innerHTML = `${t.name} <span class="sub">${who} &middot; round ${game.round}</span>`;
    $('#score').innerHTML = `<span class="g">Green ${game.unitsLeft('green')}</span> standing &middot; <span class="t">Tan ${game.unitsLeft('tan')}</span> standing`;
    $('#endturn').disabled = game.busy || !game.isHumanTurn();
    if (!game.over && !game.isHumanTurn()) this.hint('Tan is making its moves\u2026');
    else if (this.view === 'kid') this.hint('Down on the floor! Drag to look around, scroll to crawl closer.');
    else this.hint(`Tap a ${game.turn} soldier to give it orders.`);

    const u = game.selected;
    const card = $('#card');
    if (!u) {
      card.classList.add('hidden');
    } else {
      card.classList.remove('hidden');
      card.style.borderLeftColor = TEAMS[u.team].ui;
      card.querySelector('.swatch').style.cssText = `width:12px;height:12px;border-radius:50%;background:${TEAMS[u.team].ui}`;
      card.querySelector('.name').textContent = u.def.name;
      let status = '';
      if (u.team !== game.turn) status = 'enemy';
      else if (u.fired) status = 'done';
      else if (u.moved) status = u.def.heavy ? 'moved (can’t fire)' : 'moved — can still fire';
      else status = 'ready';
      card.querySelector('.status').textContent = status;
      const range = u.def.minRange ? `${u.def.minRange}-${u.def.range}` : u.def.range;
      card.querySelector('.stats').innerHTML = `<span>Move<b>${u.def.move}</b></span><span>Range<b>${range}</b></span><span>Dice<b>${u.def.dice}</b></span><span>Hits on<b>${u.def.hit}+</b></span>`;
      card.querySelector('.blurb').textContent = u.def.blurb;
    }
  }

  setTargetLabels(targets) {
    const wrap = $('#labels');
    wrap.innerHTML = '';
    this.labels = targets.map((t) => {
      const el = document.createElement('div');
      el.className = 'tlabel';
      const pct = Math.round(t.chance * 100);
      el.innerHTML = `${t.need}+ <small>${pct}%</small>`;
      wrap.appendChild(el);
      return { el, unit: t.target };
    });
  }

  updateLabels() {
    if (!this.labels.length) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.unit.view.worldTop()).add(new THREE.Vector3(0, 1.2, 0)).project(this.camera);
      const vis = v.z < 1;
      l.el.style.display = vis ? '' : 'none';
      l.el.style.left = `${((v.x + 1) / 2) * w}px`;
      l.el.style.top = `${((1 - v.y) / 2) * h}px`;
    }
  }

  showRoll(att, tgt, opt, values) {
    const box = $('#roll');
    box.classList.remove('hidden');
    box.querySelector('.roll-title').textContent = `${att.def.name} → ${tgt.def.name}: need ${opt.need}+`;
    const dice = box.querySelector('.roll-dice');
    dice.innerHTML = '';
    for (let i = 0; i < att.def.dice; i++) {
      if (!values) dice.appendChild(dieEl(1 + Math.floor(Math.random() * 6), 'rolling'));
      else dice.appendChild(dieEl(values[i], values[i] >= opt.need ? 'hit' : 'miss'));
    }
    const mods = box.querySelector('.roll-mods');
    mods.innerHTML = opt.mods.length
      ? opt.mods.map((m) => `<span class="${m.v > 0 ? 'plus' : 'minus'}">${m.v > 0 ? '+1' : '−1'} ${m.text}</span>`).join(' &middot; ')
      : '&nbsp;';
    clearTimeout(this.rollTimer);
    if (values) this.rollTimer = setTimeout(() => box.classList.add('hidden'), 4200);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  gameOver(winner, game) {
    setTimeout(() => {
      $('#over').classList.remove('hidden');
      $('#over-title').textContent = `${TEAMS[winner].name} wins!`;
      const human = game.mode === 'ai' ? (winner === 'green' ? 'You knocked over every last one of them.' : 'Your brother wins this time. Rematch?') : `${TEAMS[winner].name} holds the kitchen.`;
      $('#over-text').textContent = `${human} (${game.round} rounds)`;
    }, 1600);
  }
}
