import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, submitVisit, assessVisit, recall, stats } from '../js/game.js';
import { checkout, CHECKOUT_TABLE, dartValue, isDouble, BOGEY_NUMBERS, sayRoute, minDartsToFinish } from '../js/checkouts.js';

const play = (state, ...scores) => {
  for (const s of scores) state = submitVisit(state, s).state;
  return state;
};

test('every table route adds up and finishes on a double', () => {
  for (const [total, route] of Object.entries(CHECKOUT_TABLE)) {
    const darts = route.split(' ');
    assert.equal(darts.reduce((a, d) => a + dartValue(d), 0), +total, route);
    assert.ok(isDouble(darts.at(-1)), route);
  }
  for (let n = 2; n <= 170; n++) assert.equal(!!checkout(n), !BOGEY_NUMBERS.includes(n), String(n));
});

test('checkouts respect darts in hand', () => {
  assert.deepEqual(checkout(57), ['17', 'D20']);
  assert.equal(sayRoute(checkout(57)), 'seventeen and then double top');
  assert.equal(checkout(170, 2), null);
  assert.deepEqual(checkout(40, 1), ['D20']);
  assert.equal(minDartsToFinish(99), 3);
  assert.equal(minDartsToFinish(100), 2);
});

test('scores subtract and turns alternate', () => {
  let s = newMatch({ start: 501, mode: 'two', names: ['Rob', ''] });
  assert.equal(s.players[1].name, 'Player 2');
  s = play(s, 180, 60);
  assert.equal(s.sides[0].remaining, 321);
  assert.equal(s.sides[1].remaining, 441);
  assert.equal(s.turn, 0);
});

test('impossible scores are rejected', () => {
  const s = newMatch({ start: 501, mode: 'two' });
  for (const bad of [181, 179, 163]) assert.equal(assessVisit(s, bad).kind, 'invalid');
});

test('busts score nothing, leaving 1 is a bust', () => {
  let s = newMatch({ start: 101, mode: 'two' });
  s = play(s, 60, 0); // Player 1 on 41
  const r = submitVisit(s, 40);
  assert.equal(r.outcome.kind, 'bust');
  assert.equal(r.state.sides[0].remaining, 41);
  assert.equal(submitVisit(s, 45).outcome.kind, 'bust');
});

test('bogey numbers cannot be checked out', () => {
  let s = newMatch({ start: 301, mode: 'solo' });
  s = play(s, 132); // 169 left
  assert.equal(assessVisit(s, 169).kind, 'invalid');
});

test('legs, sets and match win', () => {
  let s = newMatch({ start: 101, mode: 'two', legsPerSet: 2, setsToWin: 1 });
  let r = submitVisit(s, 101, 2);
  assert.ok(r.outcome.legWon);
  s = r.state;
  assert.equal(s.sides[0].legs, 1);
  assert.equal(s.players[0].lastLegDarts, 2);
  assert.equal(s.turn, 1, 'player 2 starts the next leg');
  assert.equal(s.sides[0].remaining, 101);
  s = play(s, 0); // P2 misses
  r = submitVisit(s, 101, 3);
  assert.ok(r.outcome.matchWon);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.sides[0].sets, 1);
});

test('doubles share a team score and rotate four players', () => {
  let s = newMatch({ start: 501, mode: 'doubles', names: ['A', 'B', 'C', 'D'] });
  assert.equal(s.sides[0].name, 'A & C');
  s = play(s, 100, 50, 60);
  assert.equal(s.sides[0].remaining, 341);
  assert.equal(s.sides[1].remaining, 451);
  assert.equal(s.turn, 3);
});

test('handicap lowers the starting score', () => {
  const s = newMatch({ start: 501, mode: 'two', handicaps: [0, 100] });
  assert.equal(s.sides[1].remaining, 401);
});

test('averages and recall', () => {
  let s = newMatch({ start: 501, mode: 'solo' });
  s = play(s, 60, 100, 140);
  assert.equal(stats(s.players[0]).threeDart, 100);
  assert.equal(recall(s)[0].score, 140);
});

test('checkout practice gives a new target each visit', () => {
  let s = newMatch({ start: 501, mode: 'practice' }, () => 0.3);
  const target = s.sides[0].remaining;
  const r = submitVisit(s, target, 3, () => 0.5);
  assert.equal(r.outcome.kind, 'checkout');
  assert.equal(r.state.practice.hits, 1);
  assert.notEqual(r.state.sides[0].remaining, target);
});
