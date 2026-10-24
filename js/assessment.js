// How strictly a drive is judged: Easy, Medium or Hard, chosen before the drive and fixed for it. A pass
// earns one, two or three stars. Hard is today's standard everywhere, and for a mock test it is the real
// test's: 15 or fewer driving faults and no serious ones. The easier modes allow more, but never a
// collision, and never without doing what the lesson asks; the result always says which mode it was.
//
// The mode is read from the drive (test.marking), set when it starts, so changing it afterwards cannot turn
// a fail into a pass.
import { MARKING } from './config.js';

export const MODES = {
  easy: { id: 'easy', title: 'Easy', stars: 1, extraD: 6, serious: 1, focusD: Infinity, mock: { maxD: 25, maxS: 1 },
    blurb: 'More driving faults allowed and one serious fault forgiven, never a collision.' },
  medium: { id: 'medium', title: 'Medium', stars: 2, extraD: 3, serious: 0, focusD: 1, mock: { maxD: 20, maxS: 0 },
    blurb: 'A few more driving faults allowed, no serious faults.' },
  hard: { id: 'hard', title: 'Hard', stars: 3, extraD: 0, serious: 0, focusD: 0, mock: { maxD: MARKING.maxDrivingFaults, maxS: 0 },
    blurb: 'The real test\'s standard.' },
};
export const MODE_IDS = ['easy', 'medium', 'hard'];
export const DEFAULT_MODE = 'medium';
export const modeOf = (id) => MODES[id] || MODES.hard;
// the learner's choice, kept between drives (not part of the learner record: it is how they want to be
// judged next, not something they earned)
const KEY = 'cambridge-learner-drive.mode';
export function getMode() { try { const m = localStorage.getItem(KEY); return MODES[m] ? m : DEFAULT_MODE; } catch (_) { return DEFAULT_MODE; } }
export function setMode(id) { if (!MODES[id]) return; try { localStorage.setItem(KEY, id); } catch (_) {} }
const collided = (faults) => faults.some(f => f.kind === 'S' && /collision/i.test(f.cat));

// a lesson or puzzle: the faults it is about (focus), the driving faults it allows, and its own objective
export function judgeLesson(modeId, { D, S, faults, focus, maxD, objective }) {
  const m = modeOf(modeId), why = []; let pass = true;
  if (S > m.serious || (S && collided(faults))) { pass = false; why.push(`${S} serious fault${S > 1 ? 's' : ''}${m.serious ? `; ${m.title} forgives one, but never a collision` : ''}.`); }
  const focusS = focus.filter(f => f.kind === 'S').length, focusD = focus.length - focusS;
  if (focus.length && (focusS || focusD > m.focusD) && m.focusD !== Infinity) { pass = false; why.push(`This drive is about: ${[...new Set(focus.map(f => f.cat))].join(', ')}. ${focus[0].text}.`); }
  const allowD = maxD + m.extraD;
  if (D > allowD) { pass = false; why.push(`${D} driving faults; ${m.title} allows ${allowD} on this drive.`); }
  if (objective && !objective.ok) pass = false;
  return { pass, why, stars: pass ? m.stars : 0, mode: m.id };
}

// a mock test
export function judgeMock(modeId, { D, S, faults }) {
  const m = modeOf(modeId), collision = !!(S && collided(faults)), pass = D <= m.mock.maxD && S <= m.mock.maxS && !collision;
  return { pass, stars: pass ? m.stars : 0, mode: m.id, maxD: m.mock.maxD, maxS: m.mock.maxS, collision };
}

// stars for a stored lesson or puzzle record: the best earned, or for a pass from before modes existed, what
// it was worth then (puzzles kept their stars for a clean drive; a lesson pass met today's standard, Hard)
export function starsOf(L, kind = 'lesson') {
  if (!L || !L.passed) return 0;
  if (Number.isFinite(L.bestStars)) return L.bestStars;
  return kind === 'puzzle' ? (L.bestD === 0 ? 3 : L.bestD <= 1 ? 2 : 1) : 3;
}
