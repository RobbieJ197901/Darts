// Match rules and scoring. Pure functions: every change returns a new state,
// so the app can keep earlier states for undo.
import { isValidVisit, canCheckout, minDartsToFinish, BOGEY_NUMBERS } from './checkouts.js';

export const START_SCORES = [501, 401, 301, 201, 101];
export const MODES = {
  solo: { label: 'Solo', players: 1 },
  two: { label: '2 players', players: 2 },
  doubles: { label: 'Doubles (4 players)', players: 4 },
  practice: { label: 'Checkout practice', players: 1 },
};
export const RECALL_LIMIT = 80;

const clone = (s) => JSON.parse(JSON.stringify(s));

export function defaultName(i) {
  return `Player ${i + 1}`;
}

/**
 * config: { start, mode, names: [], legsPerSet, setsToWin, handicaps: [] }
 * In doubles, players 1 & 3 are the home team and 2 & 4 the away team,
 * and they throw in the order 1, 2, 3, 4.
 */
export function newMatch(config, rng = Math.random) {
  const mode = MODES[config.mode] ? config.mode : 'two';
  const count = MODES[mode].players;
  const players = [];
  for (let i = 0; i < count; i++) {
    const name = (config.names?.[i] || '').trim() || defaultName(i);
    players.push({
      name, side: mode === 'doubles' ? i % 2 : i,
      scored: 0, darts: 0, legDarts: 0, lastLegDarts: null,
      tons: 0, oneEighties: 0, highestCheckout: 0,
    });
  }
  const sideCount = mode === 'doubles' ? 2 : count;
  const sides = [];
  for (let s = 0; s < sideCount; s++) {
    const members = players.map((p, i) => (p.side === s ? i : -1)).filter((i) => i >= 0);
    const name = mode === 'doubles'
      ? members.map((i) => players[i].name).join(' & ')
      : players[s].name;
    sides.push({ name, members, remaining: 0, legs: 0, sets: 0, handicap: +(config.handicaps?.[s] || 0) });
  }
  const state = {
    config: {
      start: START_SCORES.includes(+config.start) ? +config.start : 501,
      mode,
      legsPerSet: Math.max(1, +config.legsPerSet || 1),
      setsToWin: Math.max(1, +config.setsToWin || 1),
    },
    players, sides,
    turn: 0, legStarter: 0, legNumber: 1,
    winner: null,
    log: [],
    practice: mode === 'practice' ? { attempts: 0, hits: 0 } : null,
  };
  startLeg(state, rng);
  return state;
}

export function randomPracticeTarget(rng = Math.random) {
  let t;
  do t = 2 + Math.floor(rng() * 169); while (BOGEY_NUMBERS.includes(t));
  return t;
}

function startLeg(state, rng) {
  for (const side of state.sides) {
    side.remaining = state.practice ? randomPracticeTarget(rng) : Math.max(2, state.config.start - side.handicap);
  }
  for (const p of state.players) p.legDarts = 0;
  state.turn = state.legStarter;
}

export function currentPlayerIndex(state) {
  return state.turn;
}
export function currentPlayer(state) {
  return state.players[state.turn];
}
export function currentSide(state) {
  return state.sides[currentPlayer(state).side];
}

/** Checks a visit before it's submitted. */
export function assessVisit(state, score) {
  if (!isValidVisit(score)) return { kind: 'invalid', reason: score > 180 ? 'Maximum is 180' : `${score} can't be scored with three darts` };
  const rem = currentSide(state).remaining;
  if (state.practice) return { kind: score === rem ? 'checkout' : score > rem ? 'bust' : 'miss', minDarts: minDartsToFinish(rem) };
  const after = rem - score;
  if (after === 0) {
    if (!canCheckout(rem)) return { kind: 'invalid', reason: `${rem} can't be checked out` };
    return { kind: 'checkout', minDarts: minDartsToFinish(rem) };
  }
  if (after < 0 || after === 1) return { kind: 'bust' };
  return { kind: 'score' };
}

/**
 * Records a visit (the total of up to three darts).
 * dartsUsed only matters for a checkout (1, 2 or 3); otherwise a visit is 3 darts.
 * Returns { state, outcome } where outcome describes what happened for display and voice.
 */
export function submitVisit(prev, score, dartsUsed = 3, rng = Math.random) {
  if (prev.winner !== null) return { state: prev, outcome: { kind: 'invalid', reason: 'The match is over' } };
  const check = assessVisit(prev, score);
  if (check.kind === 'invalid') return { state: prev, outcome: check };
  if (check.kind === 'checkout') dartsUsed = Math.min(3, Math.max(check.minDarts, dartsUsed));
  else dartsUsed = 3;

  const state = clone(prev);
  const pIdx = state.turn;
  const player = state.players[pIdx];
  const side = state.sides[player.side];
  const before = side.remaining;
  const bust = check.kind === 'bust';
  const counted = bust ? 0 : score;
  const outcome = { kind: check.kind, score, counted, player: pIdx, before, dartsUsed };

  player.scored += state.practice ? 0 : counted;
  player.darts += dartsUsed;
  player.legDarts += dartsUsed;
  if (counted >= 100) player.tons++;
  if (counted === 180) player.oneEighties++;
  state.log.push({ player: pIdx, score, bust, checkout: check.kind === 'checkout', before });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);

  if (state.practice) {
    state.practice.attempts++;
    if (check.kind === 'checkout') {
      state.practice.hits++;
      player.highestCheckout = Math.max(player.highestCheckout, before);
    }
    outcome.target = before;
    side.remaining = randomPracticeTarget(rng);
    outcome.nextTarget = side.remaining;
    return { state, outcome };
  }

  if (check.kind === 'checkout') {
    player.highestCheckout = Math.max(player.highestCheckout, before);
    for (const p of state.players) p.lastLegDarts = p.legDarts;
    side.legs++;
    outcome.legWon = true;
    if (side.legs >= state.config.legsPerSet) {
      side.sets++;
      outcome.setWon = state.config.legsPerSet > 1 || state.config.setsToWin > 1;
      for (const s of state.sides) s.legs = 0;
      if (side.sets >= state.config.setsToWin) {
        side.remaining = 0;
        state.winner = player.side;
        outcome.matchWon = true;
        return { state, outcome };
      }
    }
    state.legNumber++;
    state.legStarter = (state.legStarter + 1) % state.players.length;
    startLeg(state, rng);
    return { state, outcome };
  }

  if (!bust) side.remaining -= score;
  state.turn = (state.turn + 1) % state.players.length;
  return { state, outcome };
}

export function stats(player) {
  const perDart = player.darts ? player.scored / player.darts : 0;
  return { perDart, threeDart: perDart * 3 };
}

/** Most recent visits first, capped at RECALL_LIMIT. */
export function recall(state) {
  return state.log.slice(-RECALL_LIMIT).reverse();
}
