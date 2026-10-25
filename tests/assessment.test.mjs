// Marking modes (js/assessment.js): what each allows, the stars a pass earns, and that the stored record
// keeps the best stars and honours passes from before modes existed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeLesson, judgeMock, starsOf, modeOf, MODES } from '../js/assessment.js';

const D = (n, cat = 'Signals – necessary') => Array.from({ length: n }, () => ({ kind: 'D', cat, text: 'x' }));
const S = (cat = 'Mirrors – change direction') => ({ kind: 'S', cat, text: 'x' });
const lesson = (mode, faults, { maxD = 2, focus = [], objective = { ok: true } } = {}) =>
  judgeLesson(mode, { D: faults.filter(f => f.kind === 'D').length, S: faults.filter(f => f.kind === 'S').length, faults, focus: faults.filter(f => focus.some(p => f.cat.startsWith(p))), maxD, objective });

test('Hard is today\'s standard; Medium and Easy allow more driving faults', () => {
  assert.equal(lesson('hard', D(2)).pass, true); assert.equal(lesson('hard', D(3)).pass, false);
  assert.equal(lesson('medium', D(5)).pass, true); assert.equal(lesson('medium', D(6)).pass, false);
  assert.equal(lesson('easy', D(8)).pass, true); assert.equal(lesson('easy', D(9)).pass, false);
  assert.equal(modeOf(undefined).id, 'hard', 'no mode means the standard it always was');
});
test('stars: one for Easy, two for Medium, three for Hard, none for a fail', () => {
  assert.deepEqual(['easy', 'medium', 'hard'].map(m => lesson(m, []).stars), [1, 2, 3]);
  assert.equal(lesson('easy', D(20)).stars, 0);
});
test('serious faults: none on Medium or Hard; Easy forgives one, never a collision', () => {
  assert.equal(lesson('hard', [S()]).pass, false); assert.equal(lesson('medium', [S()]).pass, false);
  assert.equal(lesson('easy', [S()]).pass, true); assert.equal(lesson('easy', [S(), S()]).pass, false);
  assert.equal(lesson('easy', [S('Control – collision')]).pass, false);
});
test('the lesson\'s own subject and objective', () => {
  const focus = ['Junctions – observation'], j = D(1, 'Junctions – observation');
  assert.equal(lesson('hard', j, { focus }).pass, false, 'Hard: any fault in what the lesson is about fails it');
  assert.equal(lesson('medium', j, { focus }).pass, true); assert.equal(lesson('medium', D(2, 'Junctions – observation'), { focus }).pass, false);
  assert.equal(lesson('easy', D(3, 'Junctions – observation'), { focus }).pass, true);
  for (const m of Object.keys(MODES)) assert.equal(lesson(m, [], { objective: { ok: false } }).pass, false, `${m}: the lesson's goal is always required`);
});
test('mock tests: Hard is the real test', () => {
  const mock = (m, d, s = []) => judgeMock(m, { D: d, S: s.length, faults: s });
  assert.equal(mock('hard', 15).pass, true); assert.equal(mock('hard', 16).pass, false); assert.equal(mock('hard', 0, [S()]).pass, false);
  assert.equal(mock('medium', 20).pass, true); assert.equal(mock('medium', 21).pass, false);
  assert.equal(mock('easy', 25, [S()]).pass, true); assert.equal(mock('easy', 0, [S('Control – collision')]).collision, true);
});
test('stored stars: the best kept; passes from before modes keep what they were worth', () => {
  assert.equal(starsOf({ passed: true, bestStars: 2 }), 2);
  assert.equal(starsOf({ passed: true, bestD: 2 }), 3, 'a lesson passed before modes met today\'s standard, Hard');
  assert.equal(starsOf({ passed: true, bestD: 1 }, 'puzzle'), 2, 'a puzzle keeps the stars it had');
  assert.equal(starsOf({ passed: false, bestStars: 3 }), 0); assert.equal(starsOf(null), 0);
});
