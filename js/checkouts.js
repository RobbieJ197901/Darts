// Darts checkout knowledge: the standard "outs" table, a solver for when
// fewer than three darts remain, and helpers for describing darts in words.

// Preferred three-dart routes used by most players and callers.
// T = treble, D = double, Bull = 50 (the bullseye, counts as a double), 25 = outer bull.
const TABLE = {
  170: 'T20 T20 Bull', 167: 'T20 T19 Bull', 164: 'T20 T18 Bull', 161: 'T20 T17 Bull',
  160: 'T20 T20 D20', 158: 'T20 T20 D19', 157: 'T20 T19 D20', 156: 'T20 T20 D18',
  155: 'T20 T19 D19', 154: 'T20 T18 D20', 153: 'T20 T19 D18', 152: 'T20 T20 D16',
  151: 'T20 T17 D20', 150: 'T20 T18 D18', 149: 'T20 T19 D16', 148: 'T20 T16 D20',
  147: 'T20 T17 D18', 146: 'T20 T18 D16', 145: 'T20 T15 D20', 144: 'T20 T20 D12',
  143: 'T20 T17 D16', 142: 'T20 T14 D20', 141: 'T20 T19 D12', 140: 'T20 T20 D10',
  139: 'T20 T13 D20', 138: 'T20 T18 D12', 137: 'T20 T19 D10', 136: 'T20 T20 D8',
  135: 'T20 T17 D12', 134: 'T20 T14 D16', 133: 'T20 T19 D8', 132: 'T20 T16 D12',
  131: 'T20 T13 D16', 130: 'T20 T20 D5', 129: 'T19 T16 D12', 128: 'T18 T14 D16',
  127: 'T20 T17 D8', 126: 'T19 T19 D6', 125: '25 T20 D20', 124: 'T20 T16 D8',
  123: 'T19 T16 D9', 122: 'T18 T20 D4', 121: 'T20 T11 D14', 120: 'T20 20 D20',
  119: 'T19 T12 D13', 118: 'T20 18 D20', 117: 'T20 17 D20', 116: 'T20 16 D20',
  115: 'T20 15 D20', 114: 'T20 14 D20', 113: 'T20 13 D20', 112: 'T20 12 D20',
  111: 'T20 19 D16', 110: 'T20 10 D20', 109: 'T20 9 D20', 108: 'T20 16 D16',
  107: 'T19 10 D20', 106: 'T20 6 D20', 105: 'T20 5 D20', 104: 'T18 10 D20',
  103: 'T19 6 D20', 102: 'T20 10 D16', 101: 'T17 10 D20', 100: 'T20 D20',
  99: 'T19 10 D16', 98: 'T20 D19', 97: 'T19 D20', 96: 'T20 D18', 95: 'T19 D19',
  94: 'T18 D20', 93: 'T19 D18', 92: 'T20 D16', 91: 'T17 D20', 90: 'T20 D15',
  89: 'T19 D16', 88: 'T16 D20', 87: 'T17 D18', 86: 'T18 D16', 85: 'T15 D20',
  84: 'T20 D12', 83: 'T17 D16', 82: 'T14 D20', 81: 'T19 D12', 80: 'T20 D10',
  79: 'T19 D11', 78: 'T18 D12', 77: 'T19 D10', 76: 'T20 D8', 75: 'T17 D12',
  74: 'T14 D16', 73: 'T19 D8', 72: 'T16 D12', 71: 'T13 D16', 70: 'T18 D8',
  69: 'T19 D6', 68: 'T20 D4', 67: 'T17 D8', 66: 'T10 D18', 65: 'T19 D4',
  64: 'T16 D8', 63: 'T13 D12', 62: 'T10 D16', 61: 'T15 D8', 60: '20 D20',
  59: '19 D20', 58: '18 D20', 57: '17 D20', 56: '16 D20', 55: '15 D20',
  54: '14 D20', 53: '13 D20', 52: '12 D20', 51: '11 D20', 50: 'Bull',
  49: '9 D20', 48: '16 D16', 47: '15 D16', 46: '6 D20', 45: '13 D16',
  44: '12 D16', 43: '3 D20', 42: '10 D16', 41: '9 D16', 40: 'D20',
  39: '7 D16', 38: 'D19', 37: '5 D16', 36: 'D18', 35: '3 D16', 34: 'D17',
  33: '1 D16', 32: 'D16', 31: '15 D8', 30: 'D15', 29: '13 D8', 28: 'D14',
  27: '11 D8', 26: 'D13', 25: '9 D8', 24: 'D12', 23: '7 D8', 22: 'D11',
  21: '5 D8', 20: 'D10', 19: '3 D8', 18: 'D9', 17: '1 D8', 16: 'D8',
  15: '7 D4', 14: 'D7', 13: '5 D4', 12: 'D6', 11: '3 D4', 10: 'D5',
  9: '1 D4', 8: 'D4', 7: '3 D2', 6: 'D3', 5: '1 D2', 4: 'D2', 3: '1 D1', 2: 'D1',
};

// Scores of 170 or under that can't be finished in three darts.
export const BOGEY_NUMBERS = [169, 168, 166, 165, 163, 162, 159];

// Totals that are impossible with three darts.
export const IMPOSSIBLE_SCORES = [163, 166, 169, 172, 173, 175, 176, 178, 179];

export function isValidVisit(score) {
  return Number.isInteger(score) && score >= 0 && score <= 180 && !IMPOSSIBLE_SCORES.includes(score);
}

export function dartValue(d) {
  if (d === 'Bull') return 50;
  if (d === '25') return 25;
  if (d[0] === 'T') return 3 * +d.slice(1);
  if (d[0] === 'D') return 2 * +d.slice(1);
  return +d;
}

const isDouble = (d) => d === 'Bull' || d[0] === 'D';

// All single-dart options, ordered by how a player would prefer to aim for them.
const SETUP_DARTS = (() => {
  const list = [];
  for (let n = 20; n >= 1; n--) list.push('T' + n);
  list.push('25');
  for (let n = 20; n >= 1; n--) list.push(String(n));
  list.push('Bull');
  for (let n = 20; n >= 1; n--) list.push('D' + n);
  return list;
})();
const PREFERRED_DOUBLES = ['D20', 'D16', 'D8', 'D18', 'D12', 'D10', 'D4', 'D19', 'D17', 'D15', 'D14',
  'D13', 'D11', 'D9', 'D7', 'D6', 'D5', 'D3', 'D2', 'D1', 'Bull'];

function search(total, darts) {
  // Finish with a double in exactly `darts` darts or fewer, favouring fewer darts.
  for (const dbl of PREFERRED_DOUBLES) if (dartValue(dbl) === total) return [dbl];
  if (darts < 2) return null;
  // Prefer a single (easy) setup dart, then trebles, then bull.
  const setupOrder = [...SETUP_DARTS.filter((d) => /^\d+$/.test(d) && d !== '25'),
    ...SETUP_DARTS.filter((d) => d[0] === 'T'), '25', 'Bull', ...SETUP_DARTS.filter((d) => d[0] === 'D')];
  for (const dbl of PREFERRED_DOUBLES) {
    const rest = total - dartValue(dbl);
    for (const s of setupOrder) if (dartValue(s) === rest) return [s, dbl];
  }
  if (darts < 3) return null;
  for (const first of SETUP_DARTS) {
    const rest = total - dartValue(first);
    if (rest < 2) continue;
    const tail = search(rest, 2);
    if (tail) return [first, ...tail];
  }
  return null;
}

/**
 * Suggested checkout route for `remaining` with `dartsLeft` darts in hand.
 * Returns an array like ['T20', 'T20', 'Bull'], or null when there's no finish.
 */
export function checkout(remaining, dartsLeft = 3) {
  if (remaining < 2 || remaining > 170) return null;
  const preferred = TABLE[remaining];
  if (preferred) {
    const route = preferred.split(' ');
    if (route.length <= dartsLeft) return route;
  }
  return search(remaining, dartsLeft);
}

/** Fewest darts that can finish `remaining`, or Infinity. */
export function minDartsToFinish(remaining) {
  for (let n = 1; n <= 3; n++) if (checkout(remaining, n)) return n;
  return Infinity;
}

export function canCheckout(remaining) {
  return minDartsToFinish(remaining) <= 3;
}

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** How a caller would say a single dart, e.g. D20 -> "double top". */
export function sayDart(d) {
  if (d === 'Bull') return 'the bullseye';
  if (d === '25') return 'twenty-five';
  if (d === 'D20') return 'double top';
  if (d === 'D1') return 'double one';
  if (d[0] === 'T') return 'treble ' + NUMBER_WORDS[+d.slice(1)];
  if (d[0] === 'D') return 'double ' + NUMBER_WORDS[+d.slice(1)];
  return NUMBER_WORDS[+d];
}

export function sayRoute(route) {
  if (!route) return '';
  if (route.length === 1) return sayDart(route[0]);
  const words = route.map(sayDart);
  const last = words.pop();
  return words.join(', ') + ' and then ' + last;
}

/** Short on-screen label, e.g. ['T20','D20'] -> "T20 · D20". */
export function formatRoute(route) {
  return route ? route.join(' · ') : '';
}

export { TABLE as CHECKOUT_TABLE, isDouble };
