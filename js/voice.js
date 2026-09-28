// The announcer: a loud, cheerful London-style darts caller using the
// device's built-in speech (Web Speech API). No recordings, no internet needed.
import { checkout, sayRoute } from './checkouts.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

let voice = null;
function chooseVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  // British English voices first ("Daniel" on iPad is the best fit).
  const gb = voices.filter((v) => /en[-_]GB/i.test(v.lang));
  voice = gb.find((v) => /daniel/i.test(v.name)) || gb.find((v) => !/female|kate|serena|stephanie/i.test(v.name))
    || gb[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  chooseVoice();
  window.speechSynthesis.onvoiceschanged = chooseVoice;
}

export const voiceAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Speaks each line in turn. Lines ending in "!" are delivered with extra oomph. */
export function say(lines) {
  if (!voiceAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  for (const line of [].concat(lines).filter(Boolean)) {
    const u = new SpeechSynthesisUtterance(line);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    u.volume = 1;
    const shout = /!$/.test(line);
    u.rate = shout ? 1.08 : 1.02;
    u.pitch = shout ? 1.35 : 1.15;
    synth.speak(u);
  }
}

/** iPad only allows speech after a tap, so the first tap primes it silently. */
export function unlockSpeech() {
  if (!voiceAvailable()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

function scoreCall(score) {
  if (score === 180) return pick([
    'One hundred and eightyyyy!',
    'One hundred and eighty! Get in there my son!',
    'One hundred and eighty! Cor blimey, what a visit!',
  ]);
  if (score === 0) return pick(['No score!', 'No score! Leave it out!', 'Nothing! Not a sausage!']);
  if (score === 26) return pick(['Twenty-six. Bed and breakfast!', 'Bed and breakfast! Twenty-six.']);
  if (score === 100) return pick(['Ton!', 'A ton! Lovely jubbly!', 'One hundred!']);
  if (score >= 140) return pick([`${score}! Get in!`, `${score}! Oh, that's tasty!`, `${score}! Beautiful darts!`]);
  if (score > 100) return pick([`${score}!`, `${score}! Lovely stuff!`, `${score}! Smashing!`]);
  if (score >= 60) return pick([`${score}.`, `${score}. Nice one.`, `${score}.`]);
  return `${score}.`;
}

/**
 * Lines to announce after a visit.
 * outcome: from submitVisit. next: { name, remaining } for whoever throws next (if the leg carries on).
 */
export function announcement(outcome, playerName, next, opts = {}) {
  const lines = [];
  if (outcome.kind === 'bust') {
    lines.push(pick([`Bust! No score!`, `Oh dear, bust! No score, ${playerName}!`, `Bust! Unlucky, my old son!`]));
  } else if (outcome.kind === 'checkout' && outcome.target !== undefined) {
    lines.push(pick([`Checked out! ${outcome.target}! Lovely!`, `Game shot! Get in there!`]));
  } else if (outcome.kind === 'miss') {
    lines.push(`${outcome.score}. Not this time, ${playerName}.`);
  } else if (outcome.kind === 'checkout') {
    if (outcome.before === 170) lines.push('The big fish! One hundred and seventy checkout!');
    else if (outcome.before === 40) lines.push('Double top! Game shot!');
    else if (outcome.before === 50) lines.push('Bullseye! What a way to finish!');
    lines.push(outcome.matchWon
      ? `Game shot, and the match, ${playerName}! Absolutely blinding!`
      : outcome.setWon
        ? `Game shot, and the set! Well done ${playerName}!`
        : `Game shot, and the leg! ${outcome.before} checkout! Take a bow, ${playerName}!`);
  } else {
    lines.push(scoreCall(outcome.score));
  }

  if (next && !outcome.matchWon) {
    const route = checkout(next.remaining);
    if (outcome.legWon) {
      lines.push(`${next.name} to throw first. Game on!`);
    } else if (outcome.target !== undefined) {
      lines.push(`${next.name}, your next target is ${next.remaining}.`);
      if (opts.help && route) lines.push(`That's ${sayRoute(route)}.`);
    } else if (route) {
      lines.push(`${next.name}, you require ${next.remaining}.`);
      if (opts.help) lines.push(`That's ${sayRoute(route)}!`);
    } else {
      lines.push(`${next.name}, you've got ${next.remaining} left. Come on!`);
    }
  }
  return lines;
}
