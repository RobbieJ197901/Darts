// Screen wiring: setup form, scoreboard, keypad, pop-ups and saving.
import {
  newMatch, submitVisit, assessVisit, currentPlayer, currentSide, stats, recall, MODES, defaultName,
} from './game.js';
import { checkout, formatRoute, CHECKOUT_TABLE, BOGEY_NUMBERS } from './checkouts.js';
import { renderLed } from './led.js';
import { say, announcement, unlockSpeech, voiceAvailable } from './voice.js';
import { cameraSupported, cameraOn, startCamera, stopCamera, grabReplay } from './replay.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Saving (best effort: private browsing may block storage) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

const DEFAULT_SETTINGS = {
  mode: 'two', start: 501, names: ['', '', '', ''], legsPerSet: 3, setsToWin: 1,
  handicaps: [0, 0], help: true, voice: true,
  camera: false, autoReplay: true,
};
let settings = { ...DEFAULT_SETTINGS, ...store.get('darts.settings', {}) };
const saveSettings = () => store.set('darts.settings', settings);

let state = null;
let undoStack = [];
let lastScore = null;
let entry = '';
let pending = []; // darts added one at a time with ADD
let addMode = false;

function saveMatch() {
  store.set('darts.match', { state, undo: undoStack.slice(-60), lastScore });
}

// ---------- Background image ----------
function applyBackground() {
  let url = null;
  try { url = localStorage.getItem('darts.bg'); } catch { /* ignore */ }
  document.documentElement.style.setProperty('--bg-image', url ? `url("${url}")` : 'none');
}

function loadBackground(file) {
  if (!file) return;
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1920;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(objectUrl);
    let data = canvas.toDataURL('image/jpeg', 0.82);
    try {
      localStorage.setItem('darts.bg', data);
    } catch {
      data = canvas.toDataURL('image/jpeg', 0.5);
      try { localStorage.setItem('darts.bg', data); } catch {
        document.documentElement.style.setProperty('--bg-image', `url("${data}")`);
        toast('Background set, but it is too big to remember next time');
        return;
      }
    }
    applyBackground();
    toast('Background updated', true);
  };
  img.onerror = () => toast("Couldn't open that picture");
  img.src = objectUrl;
}

// ---------- Emblem dartboard ----------
function drawEmblem() {
  const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const cx = 50, cy = 50;
  const pt = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  const wedge = (r1, r2, a1, a2, fill) =>
    `<path fill="${fill}" d="M${pt(r1, a1)} L${pt(r2, a1)} A${r2},${r2} 0 0 1 ${pt(r2, a2)} L${pt(r1, a2)} A${r1},${r1} 0 0 0 ${pt(r1, a1)}Z"/>`;
  let svg = '<circle cx="50" cy="50" r="50" fill="#111"/>';
  order.forEach((n, i) => {
    const a1 = ((i - 0.5) * Math.PI) / 10, a2 = ((i + 0.5) * Math.PI) / 10;
    const dark = i % 2 === 0;
    const single = dark ? '#161616' : '#efe3c2';
    const ring = dark ? '#d8242b' : '#138a3f';
    svg += wedge(4, 22, a1, a2, single) + wedge(22, 25, a1, a2, ring) + wedge(25, 34, a1, a2, single) + wedge(34, 37, a1, a2, ring);
    const [x, y] = pt(43.5, i * Math.PI / 10).split(',');
    svg += `<text x="${x}" y="${y}" fill="#fff" font-size="6.5" font-family="Arial" font-weight="700" text-anchor="middle" dominant-baseline="central">${n}</text>`;
  });
  svg += '<circle cx="50" cy="50" r="4" fill="#138a3f"/><circle cx="50" cy="50" r="1.8" fill="#d8242b"/>';
  $('#emblem-board').innerHTML = svg;
}

// ---------- Setup screen ----------
const setupForm = $('#setup-form');

function renderSetupFields() {
  const mode = setupForm.mode.value;
  const count = MODES[mode].players;
  const labels = mode === 'doubles' ? ['Home player 1', 'Away player 1', 'Home player 2', 'Away player 2'] : ['Player 1', 'Player 2'];
  const names = $('#names');
  const current = $$('input', names).map((i) => i.value);
  names.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = labels[i];
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = defaultName(i);
    input.value = current[i] ?? settings.names[i] ?? '';
    input.dataset.index = i;
    label.append(input);
    names.append(label);
  }
  const practice = mode === 'practice';
  $('#start-field').hidden = practice;
  $('#match-field').hidden = practice;
  const sides = mode === 'doubles' ? 2 : count;
  const hc = $('#match-row');
  $$('.hc-field', hc).forEach((el) => el.remove());
  for (let s = 0; s < sides && !practice; s++) {
    const who = mode === 'doubles' ? (s === 0 ? 'Home team' : 'Away team') : `Player ${s + 1}`;
    const label = document.createElement('label');
    label.className = 'field hc-field';
    label.textContent = `Handicap: ${who}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = 0;
    input.max = 400;
    input.step = 1;
    input.value = settings.handicaps[s] || 0;
    input.dataset.hc = s;
    label.append(input);
    hc.append(label);
  }
}

function fillSetup() {
  setupForm.mode.value = settings.mode;
  setupForm.start.value = String(settings.start);
  setupForm.legsPerSet.value = String(settings.legsPerSet);
  setupForm.setsToWin.value = String(settings.setsToWin);
  setupForm.help.checked = settings.help;
  setupForm.voice.checked = settings.voice;
  setupForm.camera.checked = settings.camera;
  setupForm.autoReplay.checked = settings.autoReplay;
  $('#camera-options').hidden = !cameraSupported();
  $$('#names input').forEach((i) => i.remove());
  renderSetupFields();
}

function readSetup() {
  const names = [...settings.names];
  $$('#names input').forEach((i) => { names[+i.dataset.index] = i.value.trim(); });
  const handicaps = [0, 0];
  $$('#match-row [data-hc]').forEach((i) => { handicaps[+i.dataset.hc] = Math.max(0, Math.min(400, Math.floor(+i.value || 0))); });
  settings = {
    ...settings,
    mode: setupForm.mode.value,
    start: +setupForm.start.value,
    names,
    legsPerSet: +setupForm.legsPerSet.value,
    setsToWin: +setupForm.setsToWin.value,
    handicaps,
    help: setupForm.help.checked,
    voice: setupForm.voice.checked,
    camera: setupForm.camera.checked,
    autoReplay: setupForm.autoReplay.checked,
  };
  saveSettings();
}

function showSetup() {
  fillSetup();
  $('#resume').hidden = !state || state.winner !== null;
  $('#game').hidden = true;
  $('#setup').hidden = false;
}

function startMatch() {
  state = newMatch(settings);
  undoStack = [];
  lastScore = null;
  clearEntry();
  saveMatch();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  syncCamera();
  render();
  if (settings.voice) {
    const p = currentPlayer(state);
    const side = currentSide(state);
    say(state.practice
      ? [`Checkout practice! ${p.name}, your first target is ${side.remaining}.`]
      : [`Game on! ${state.config.start}. ${p.name} to throw first!`]);
  }
}

// ---------- Scoreboard ----------
const board = $('.board');

function pendingSum() {
  return pending.reduce((a, b) => a + b, 0);
}

function render() {
  if (!state) return;
  const solo = state.sides.length === 1;
  board.classList.toggle('solo', solo);
  $$('.team-label')[0].textContent = solo ? (state.practice ? 'TARGET' : 'PLAYER') : 'HOME';
  const activeSide = currentPlayer(state).side;

  $$('.side').forEach((el) => {
    const s = +el.dataset.side;
    const side = state.sides[s];
    if (!side) return;
    el.classList.toggle('active', s === activeSide && state.winner === null);
    renderLed($('[data-led="legs"]', el), side.legs, 1);
    renderLed($('[data-led="sets"]', el), side.sets, 1);
    renderLed($('[data-led="score"]', el), side.remaining, 3);
    $('.team-name', el).textContent = side.name;
    const members = $('.members', el);
    if (side.members.length > 1) {
      members.innerHTML = '';
      side.members.forEach((pi, k) => {
        if (k) members.append(' · ');
        const span = document.createElement(pi === state.turn ? 'b' : 'span');
        span.textContent = state.players[pi].name;
        members.append(span);
      });
    } else {
      members.textContent = '';
    }
    const hint = $('.side-hint', el);
    if (state.practice) {
      hint.textContent = `Checked out ${state.practice.hits} of ${state.practice.attempts}`;
    } else {
      const route = settings.help && s !== activeSide ? checkout(side.remaining) : null;
      hint.textContent = route ? formatRoute(route) : '';
    }
    $('.enter', el).disabled = state.winner !== null;
  });

  // Centre display: what's being typed, else the running ADD total, else the last score (dimmed).
  const entryLed = $('#entry');
  const typing = entry !== '';
  const running = pending.length ? pendingSum() + (typing ? +entry : 0) : null;
  entryLed.classList.toggle('dim', !typing && !pending.length);
  renderLed(entryLed, typing && !pending.length ? entry : running ?? lastScore ?? '', 3);
  $('#pending').textContent = pending.length
    ? `${pending.join(' + ')}${typing ? ' + ' + entry : ''} (${pending.length + (typing ? 1 : 0)} of 3 darts)`
    : addMode ? 'Adding dart by dart' : '';

  const hint = $('#checkout-hint');
  hint.textContent = '';
  if (settings.help && state.winner === null) {
    const remaining = currentSide(state).remaining - pendingSum();
    const dartsLeft = 3 - pending.length;
    const route = dartsLeft > 0 ? checkout(remaining, dartsLeft) : null;
    if (route) hint.textContent = `${remaining}: ${formatRoute(route)}`;
    else if (remaining <= 170 && remaining > 1 && BOGEY_NUMBERS.includes(remaining)) hint.textContent = `${remaining}: no out, set up`;
  }

  $('[data-action="add"]').classList.toggle('on', addMode);
  $('#toggle-help').setAttribute('aria-pressed', String(settings.help));
  $('#toggle-voice').setAttribute('aria-pressed', String(settings.voice));
  $('#toggle-voice').hidden = !voiceAvailable();
  $('#toggle-camera').hidden = !cameraSupported();
  $('#toggle-camera').setAttribute('aria-pressed', String(cameraOn()));
  $('#replay-btn').hidden = !cameraOn();
}

function clearEntry() {
  entry = '';
  pending = [];
  addMode = false;
}

let toastTimer;
function toast(msg, good = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('good', good);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function reject(msg) {
  toast(msg);
  board.classList.remove('shake');
  void board.offsetWidth;
  board.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(80);
}

function celebrate(text, sub = '') {
  const layer = $('#celebrate');
  layer.innerHTML = '';
  const burst = document.createElement('div');
  burst.className = text.length <= 4 ? 'burst huge' : 'burst';
  burst.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  layer.append(burst);
  const colours = ['#ff3b1f', '#ffd23f', '#1fa24a', '#ffffff', '#5fe07f'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colours[i % colours.length];
    c.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    layer.append(c);
  }
  board.classList.remove('flash');
  void board.offsetWidth;
  board.classList.add('flash');
  setTimeout(() => { layer.innerHTML = ''; board.classList.remove('flash'); }, 4200);
}

// ---------- Scoring ----------
const VALID_DARTS = new Set([0, 25, 50]);
for (let n = 1; n <= 20; n++) [n, 2 * n, 3 * n].forEach((v) => VALID_DARTS.add(v));

function pressKey(d) {
  if (!state || state.winner !== null) return;
  if (entry === '0') entry = '';
  if (entry.length >= 3) return reject('Three digits max');
  const next = entry + d;
  const oneDart = addMode || pending.length > 0;
  if (+next > (oneDart ? 60 : 180)) return reject(oneDart ? 'One dart scores 60 at most' : 'Maximum is 180');
  entry = next;
  render();
}

function clearKey() {
  if (entry) entry = entry.slice(0, -1);
  else if (pending.length) pending.pop();
  else if (addMode) addMode = false;
  render();
}

function addDart() {
  if (!state || state.winner !== null) return;
  if (!entry) {
    addMode = !addMode;
    if (!addMode) pending = [];
    toast(addMode ? 'Enter each dart, then press ADD. ENTER when done.' : 'Adding dart by dart is off', true);
    render();
    return;
  }
  const v = +entry;
  if (!VALID_DARTS.has(v)) return reject(`${v} can't be scored with one dart`);
  if (pending.length >= 3) return reject('Three darts already added, press ENTER');
  pending.push(v);
  entry = '';
  addMode = true;
  if (v === 50) {
    celebrate('BULLSEYE!');
    if (settings.voice) say('Bullseye!');
  }
  const remaining = currentSide(state).remaining;
  const sum = pendingSum();
  if (sum === remaining && !state.practice) {
    // Checkout on this dart: finish straight away if it's valid.
    enter();
    return;
  }
  if (pending.length === 3 || (sum > remaining - 2 && !state.practice)) {
    enter();
    return;
  }
  render();
}

function enter() {
  if (!state || state.winner !== null) return;
  if (entry === '' && !pending.length) return reject('Type a score first (0 for no score)');
  let darts = null;
  let total = +entry;
  if (pending.length) {
    const all = [...pending];
    if (entry !== '') {
      const v = +entry;
      if (!VALID_DARTS.has(v)) return reject(`${v} can't be scored with one dart`);
      if (all.length >= 3) return reject('Only three darts per turn');
      all.push(v);
    }
    darts = all.length;
    total = all.reduce((a, b) => a + b, 0);
  }
  const check = assessVisit(state, total);
  if (check.kind === 'invalid') return reject(check.reason);
  if (check.kind === 'checkout' && !state.practice) {
    if (darts !== null) {
      if (darts < check.minDarts) return reject(`${total} can't be finished in ${darts} dart${darts > 1 ? 's' : ''}`);
      return commit(total, darts);
    }
    if (check.minDarts < 3) return askDarts(total, check.minDarts);
  }
  commit(total, darts ?? 3);
}

function askDarts(total, minDarts) {
  const dlg = $('#dlg-darts');
  $$('[data-darts]', dlg).forEach((b) => {
    b.disabled = +b.dataset.darts < minDarts;
    b.onclick = () => { dlg.close(); commit(total, +b.dataset.darts); };
  });
  dlg.showModal();
}

function commit(total, darts) {
  const before = state;
  const { state: next, outcome } = submitVisit(state, total, darts);
  if (outcome.kind === 'invalid') return reject(outcome.reason);
  undoStack.push(before);
  if (undoStack.length > 200) undoStack.shift();
  state = next;
  lastScore = outcome.counted;
  clearEntry();
  addMode = false;
  saveMatch();
  render();

  const player = before.players[outcome.player];
  if (outcome.kind === 'bust') toast(`Bust! ${player.name} scores nothing`);

  // Celebrations
  if (!state.practice) {
    if (outcome.matchWon) celebrate('GAME SHOT!', 'and the match');
    else if (outcome.kind === 'checkout' && outcome.before === 170) celebrate('BIG FISH!', '170 checkout');
    else if (outcome.kind === 'checkout' && outcome.before === 40) celebrate('DOUBLE TOP!', 'game shot');
    else if (outcome.kind === 'checkout' && outcome.before === 50) celebrate('BULLSEYE!', 'game shot');
    else if (outcome.score === 180) celebrate('180!');
    else if (outcome.legWon) celebrate('GAME SHOT!', outcome.setWon ? 'and the set' : 'and the leg');
  } else if (outcome.kind === 'checkout') {
    celebrate('CHECKED OUT!', String(outcome.target));
  } else if (outcome.score === 180) {
    celebrate('180!');
  }

  if (outcome.legWon && !outcome.matchWon) {
    toast(`${player.name} wins the ${outcome.setWon ? 'set' : 'leg'}! ${currentPlayer(state).name} throws first`, true);
  }

  if (settings.voice) {
    const nextPlayer = state.winner === null ? { name: currentPlayer(state).name, remaining: currentSide(state).remaining } : null;
    say(announcement(outcome, player.name, nextPlayer, { help: settings.help }));
  }

  const big = outcome.score === 180 || outcome.legWon || (state.practice && outcome.kind === 'checkout');
  if (big && settings.autoReplay && cameraOn()) autoReplay(outcome.matchWon);
  else if (outcome.matchWon) setTimeout(showWinner, 1800);
}

// ---------- Camera replay ----------
async function syncCamera() {
  const preview = $('#cam-preview');
  if (settings.camera && cameraSupported() && !cameraOn()) {
    try {
      await startCamera('user', preview);
      preview.hidden = false;
    } catch (err) {
      settings.camera = false;
      saveSettings();
      toast(err?.name === 'NotAllowedError'
        ? 'Camera blocked. Allow it in Settings › Safari › Camera.'
        : "Couldn't start the camera");
    }
  } else if (!settings.camera && cameraOn()) {
    stopCamera(preview);
    preview.hidden = true;
  }
  render();
}

let replayClips = [];
let replayIndex = 0;
let replayUrls = [];
let afterReplay = null;

async function showReplay(then = null) {
  const clips = await grabReplay();
  if (!clips.length) {
    toast('Nothing recorded yet');
    then?.();
    return;
  }
  replayUrls.forEach((u) => URL.revokeObjectURL(u));
  replayUrls = clips.map((c) => URL.createObjectURL(c));
  replayClips = replayUrls;
  afterReplay = then;
  $('#replay').hidden = false;
  playClip(0);
}

function playClip(i) {
  const video = $('#replay-video');
  replayIndex = i;
  video.src = replayClips[i];
  video.playbackRate = $('#replay-slow').classList.contains('on') ? 0.5 : 1;
  video.onloadedmetadata = () => {
    // With two clips, skip into the older one so the replay is about 15 seconds long.
    if (i === 0 && replayClips.length > 1 && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, video.duration - 6);
    }
  };
  video.onended = () => {
    if (replayIndex + 1 < replayClips.length) playClip(replayIndex + 1);
  };
  video.play().catch(() => {});
}

function closeReplay() {
  const video = $('#replay-video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  $('#replay').hidden = true;
  const then = afterReplay;
  afterReplay = null;
  then?.();
}

function autoReplay(matchWon) {
  // Let the celebration and the announcer finish first.
  const started = Date.now();
  const wait = () => {
    const talking = window.speechSynthesis?.speaking;
    if ((talking && Date.now() - started < 9000) || Date.now() - started < 2500) return setTimeout(wait, 300);
    showReplay(matchWon ? showWinner : null);
  };
  setTimeout(wait, 300);
}

function undo() {
  if (entry || pending.length) {
    clearEntry();
    addMode = false;
    render();
    toast('Entry cleared', true);
    return;
  }
  const prev = undoStack.pop();
  if (!prev) return reject('Nothing to undo');
  const undone = state.log[state.log.length - 1];
  state = prev;
  const last = state.log[state.log.length - 1];
  lastScore = last ? (last.bust ? 0 : last.score) : null;
  saveMatch();
  render();
  if (undone) toast(`Removed ${state.players[undone.player].name}'s ${undone.score}. Enter the right score.`, true);
  if ($('#dlg-winner').open) $('#dlg-winner').close();
}

// ---------- Pop-ups ----------
function openInfo(title, html) {
  $('#info-title').textContent = title;
  $('#info-body').innerHTML = html;
  $('#dlg-info').showModal();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showAverages() {
  const rows = [
    ['3-dart average', (p) => stats(p).threeDart.toFixed(1)],
    ['Per dart', (p) => stats(p).perDart.toFixed(1)],
    ['Darts this leg', (p) => p.legDarts],
    ['Darts last leg', (p) => p.lastLegDarts ?? '–'],
    ['Scores of 100+', (p) => p.tons],
    ['180s', (p) => p.oneEighties],
    ['Best checkout', (p) => p.highestCheckout || '–'],
  ];
  const head = state.players.map((p, i) => `<th class="${i === state.turn ? 'now' : ''}">${esc(p.name)}</th>`).join('');
  const body = rows.map(([label, fn]) => `<tr><th>${label}</th>${state.players.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`).join('');
  let html = `<div class="table-scroll"><table class="stats-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  if (state.practice) html = `<p class="big-note">Checked out ${state.practice.hits} of ${state.practice.attempts} targets.</p>` + html;
  openInfo('Averages', html);
}

function showRecall() {
  const items = recall(state);
  if (!items.length) return openInfo('Last scores', '<p>No scores yet.</p>');
  const html = `<p>Newest first, last ${items.length} of up to 80 scores.</p><div class="recall-list">${items.map((v) =>
    `<div class="${v.bust ? 'bust' : v.checkout ? 'out' : ''}"><span class="n">${esc(state.players[v.player].name)}</span><span class="s">${v.score}${v.checkout ? ' ✓' : ''}</span></div>`,
  ).join('')}</div>`;
  openInfo('Last scores', html);
}

function showOuts() {
  const html = `<p>The standard three-dart finishes. Bull is the bullseye (50), 25 is the outer bull.
    No three-dart finish for ${BOGEY_NUMBERS.slice().reverse().join(', ')}.</p><div class="outs-grid">${
    Object.keys(CHECKOUT_TABLE).map(Number).sort((a, b) => b - a)
      .map((n) => `<div><b>${n}</b><span>${CHECKOUT_TABLE[n].split(' ').join(' · ')}</span></div>`).join('')}</div>`;
  openInfo('Checkout table', html);
}

function showHandicap() {
  if (state.practice) return reject('No handicaps in checkout practice');
  const html = `<p>Points taken off the starting score. Changes apply from the next leg.</p><div class="hc-grid">${
    state.sides.map((s, i) => `<label class="field">${esc(s.name)}<input type="number" inputmode="numeric" min="0" max="400" value="${s.handicap}" data-hc="${i}"></label>`).join('')
  }</div>`;
  openInfo('Handicap', html);
  $('#dlg-info').addEventListener('close', () => {
    const inputs = $$('#info-body [data-hc]');
    if (!inputs.length) return;
    const next = JSON.parse(JSON.stringify(state));
    inputs.forEach((i) => {
      const v = Math.max(0, Math.min(400, Math.floor(+i.value || 0)));
      next.sides[+i.dataset.hc].handicap = v;
      settings.handicaps[+i.dataset.hc] = v;
    });
    state = next;
    saveSettings();
    saveMatch();
  }, { once: true });
}

function showWinner() {
  const side = state.sides[state.winner];
  $('#winner-title').textContent = `${side.name} wins!`;
  const summary = state.sides.map((s) => `${s.name}: ${s.sets} set${s.sets === 1 ? '' : 's'}`).join(' · ');
  const avgs = state.players.map((p) => `${p.name} averaged ${stats(p).threeDart.toFixed(1)}`).join(', ');
  $('#winner-body').textContent = `${summary}. ${avgs}.`;
  $('#dlg-winner').showModal();
}

function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && !window.matchMedia('(display-mode: standalone)').matches
    && !navigator.standalone;
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

function menuAction(name) {
  $$('dialog[open]').forEach((d) => d.close());
  if (name === 'rematch') startMatch();
  else if (name === 'setup') showSetup();
  else if (name === 'outs') showOuts();
  else if (name === 'quit') $('#dlg-quit').showModal();
  else if (name === 'settings') { fillSetup(); $('#dlg-settings').showModal(); }
  else if (name === 'undo') undo();
  else if (name === 'fullscreen') toggleFullscreen();
}

// ---------- Events ----------
function bind() {
  let unlocked = false;
  document.addEventListener('pointerdown', () => {
    if (!unlocked) { unlocked = true; unlockSpeech(); }
  }, { capture: true });

  $('#keypad').addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]');
    if (key) pressKey(key.dataset.key);
  });
  board.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const actions = {
      enter, clear: clearKey, add: addDart, undo,
      average: showAverages, recall: showRecall, handicap: showHandicap,
      mode: () => { $('#menu-fullscreen').hidden = !fullscreenSupported(); $('#dlg-mode').showModal(); },
    };
    actions[btn.dataset.action]?.();
  });
  $('#toggle-help').addEventListener('click', () => { settings.help = !settings.help; saveSettings(); render(); });
  $('#toggle-camera').addEventListener('click', () => {
    settings.camera = !cameraOn();
    saveSettings();
    syncCamera();
    toast(settings.camera ? 'Camera on: tap REPLAY to see the last shot' : 'Camera off', true);
  });
  $('#replay-btn').addEventListener('click', () => showReplay());
  $('#replay-close').addEventListener('click', closeReplay);
  $('#replay-again').addEventListener('click', () => playClip(0));
  $('#replay-slow').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('on');
    $('#replay-video').playbackRate = e.currentTarget.classList.contains('on') ? 0.5 : 1;
  });
  $('#toggle-voice').addEventListener('click', () => {
    settings.voice = !settings.voice;
    saveSettings();
    render();
    if (settings.voice) say("Voice on! Let's play darts!");
    else window.speechSynthesis?.cancel();
  });

  $$('[data-menu]').forEach((b) => b.addEventListener('click', () => menuAction(b.dataset.menu)));
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d && d.id !== 'dlg-winner') d.close(); }));

  $('#bg-file').addEventListener('change', (e) => { loadBackground(e.target.files[0]); e.target.value = ''; });
  $('#quit-yes').addEventListener('click', () => {
    $('#dlg-quit').close();
    window.speechSynthesis?.cancel();
    state = null;
    undoStack = [];
    lastScore = null;
    clearEntry();
    store.remove('darts.match');
    showSetup();
  });
  $('#open-settings').addEventListener('click', () => $('#dlg-settings').showModal());
  $('#dlg-settings').addEventListener('close', () => {
    readSetup();
    if (!$('#game').hidden) syncCamera();
    render();
  });
  $('#bg-clear').addEventListener('click', () => { store.remove('darts.bg'); applyBackground(); toast('Default background', true); });

  setupForm.addEventListener('change', (e) => {
    if (e.target.name === 'mode') {
      // Keep typed names when switching modes.
      $$('#names input').forEach((i) => { settings.names[+i.dataset.index] = i.value.trim(); });
      renderSetupFields();
    }
  });
  setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    readSetup();
    unlockSpeech();
    startMatch();
  });
  $('#resume').addEventListener('click', () => {
    readSetup();
    $('#setup').hidden = true;
    $('#game').hidden = false;
    syncCamera();
  });

  // Physical keyboard, handy on a PC or an iPad keyboard.
  document.addEventListener('keydown', (e) => {
    if ($('#game').hidden || !$('#replay').hidden || document.querySelector('dialog[open]')) return;
    if (/^\d$/.test(e.key)) pressKey(e.key);
    else if (e.key === 'Enter') enter();
    else if (e.key === 'Backspace') clearKey();
    else if (e.key === '+') addDart();
    else if (e.key.toLowerCase() === 'u') undo();
    else return;
    e.preventDefault();
  });
}

// ---------- Start up ----------
function init() {
  drawEmblem();
  applyBackground();
  bind();
  const saved = store.get('darts.match', null);
  if (saved?.state?.players && saved.state.winner === null) {
    state = saved.state;
    undoStack = saved.undo || [];
    lastScore = saved.lastScore ?? null;
    $('#setup').hidden = true;
    $('#game').hidden = false;
    render();
    if (settings.camera) syncCamera();
  } else {
    showSetup();
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
