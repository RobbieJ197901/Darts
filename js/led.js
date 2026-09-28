// Draws numbers as red seven-segment LED digits, like the scoreboard in the photo.

const SEGMENTS = {
  a: '12,6 16,2 48,2 52,6 48,10 16,10',
  b: '53,8 57,12 57,46 53,50 49,46 49,12',
  c: '53,52 57,56 57,90 53,94 49,90 49,56',
  d: '12,96 16,92 48,92 52,96 48,100 16,100',
  e: '9,52 13,56 13,90 9,94 5,90 5,56',
  f: '9,8 13,12 13,46 9,50 5,46 5,12',
  g: '12,51 16,47 48,47 52,51 48,55 16,55',
};
const DIGITS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg',
  6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};

function digitSvg(ch) {
  const lit = DIGITS[ch] ?? '';
  const polys = Object.entries(SEGMENTS)
    .map(([k, pts]) => `<polygon points="${pts}" class="${lit.includes(k) ? 'on' : 'off'}"/>`)
    .join('');
  return `<svg class="led-digit" viewBox="0 0 62 102" aria-hidden="true">${polys}</svg>`;
}

/** Renders `value` into `el` as LED digits, right-aligned to `width` characters. */
export function renderLed(el, value, width = 3) {
  const text = String(value ?? '').slice(-width).padStart(width, ' ');
  el.innerHTML = [...text].map(digitSvg).join('');
  el.setAttribute('aria-label', String(value ?? '').trim());
  el.setAttribute('role', 'img');
}
