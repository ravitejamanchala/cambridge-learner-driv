// Motorway lane discipline (issue #7) on scripted traces: the same frames always give the same verdict,
// safe driving is never marked, and each kind of unsafe driving is marked for what it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaneAssessor, LANE } from '../js/lane-discipline.js';

const MPH = 0.44704;
// A straight road and a little kinematic world: the learner and the other vehicles move along it, and
// a script says, second by second, what the learner does.
function run({ lanes = 3, v = 30, lane = 0, others = [], script = () => ({}), seconds = 60, exitAt = null }) {
  const faults = [], A = createLaneAssessor({ fault: (kind, cat, text) => faults.push({ kind, cat, text }) });
  const me = { s: 0, v, laneF: lane, target: lane, rate: 0.6, indicator: null, looks: [] };
  const cars = others.map((o, id) => ({ id, ...o, v: o.mph * MPH }));
  const dt = 0.1;
  for (let i = 0; i <= seconds / dt; i++) {
    const t = +(i * dt).toFixed(2);
    const act = script(t, me, cars) || {};
    if (act.target !== undefined) me.target = act.target;
    if (act.v !== undefined) me.v = act.v;
    if (act.signal !== undefined) me.indicator = act.signal;
    if (act.look) me.looks.push({ view: act.look, at: t });
    const d = me.target - me.laneF; me.laneF += Math.sign(d) * Math.min(Math.abs(d), me.rate * dt);
    me.s += me.v * dt;
    for (const c of cars) { if (c.mphAt) c.v = c.mphAt(t) * MPH; c.s += c.v * dt; }
    A.step({ t, dt, v: me.v, laneF: me.laneF, lanes, indicator: me.indicator, looks: me.looks,
      others: cars.map(c => ({ id: c.id, lane: c.lane, fw: c.s - me.s, v: c.v })), exitIn: exitAt == null ? null : exitAt - me.s });
  }
  return { faults, events: A.events, stats: A.stats, me };
}
// the textbook lane change: mirror, signal, wait, move (Rule 133)
const MSM = (t, at, dir, to) => t === at ? { look: dir > 0 ? 'right' : 'left', signal: dir > 0 ? 'R' : 'L' }
  : t === +(at + 0.3).toFixed(2) ? { look: dir > 0 ? 'blindspot' : 'left-blindspot' }
  : t === +(at + 2).toFixed(2) ? { target: to } : t === +(at + 5).toFixed(2) ? { signal: null } : null;
const cats = (r) => r.faults.map(f => f.cat + ': ' + f.text);

test('a safe overtake of a slower vehicle, and back in with room, is not marked', () => {
  const r = run({ v: 70 * MPH, others: [{ lane: 0, s: 120, mph: 52 }], seconds: 60,
    script: (t, me, cars) => {
      if (t === 2) return MSM(t, 2, 1, 1); if (t > 2 && t < 8) return MSM(t, 2, 1, 1);
      const lorry = cars[0], behind = me.s - lorry.s - LANE.carLen;
      if (me.target === 1 && behind > lorry.v * 2.5 && !me.back) { me.back = t; return MSM(t, t, -1, 0); }
      if (me.back && t < me.back + 6) return MSM(t, me.back, -1, 0);
    } });
  assert.deepEqual(cats(r), []);
  const moves = r.events.filter(e => e.type === 'lane');
  assert.deepEqual(moves.map(e => [e.from, e.to]), [[0, 1], [1, 0]]);
  assert.ok(moves.every(e => e.mirror && e.blind && e.signalFor >= 1.9), JSON.stringify(moves));
  assert.ok(moves[1].behindS >= 2.4, 'moved back with a good gap to the vehicle passed');
});

test('the same trace twice gives the same result', () => {
  const trace = () => run({ v: 70 * MPH, others: [{ lane: 0, s: 60, mph: 50 }, { lane: 1, s: -40, mph: 70 }], seconds: 40,
    script: (t) => t === 3 ? { target: 1 } : t === 20 ? { target: 0 } : null });
  const a = trace(), b = trace();
  assert.deepEqual(a.faults, b.faults); assert.deepEqual(a.events, b.events);
  assert.ok(a.faults.length > 0, 'the careless trace should be marked');
});

test('moving across without a mirror check or a signal is marked for each', () => {
  const r = run({ v: 65 * MPH, others: [{ lane: 0, s: 150, mph: 50 }], seconds: 12, script: (t) => t === 1 ? { target: 1 } : null });
  assert.ok(r.faults.some(f => f.cat === 'Mirrors – change direction' && /without checking the right mirror/.test(f.text)), cats(r).join('\n'));
  assert.ok(r.faults.some(f => f.cat === 'Signals – necessary' && /without signalling/.test(f.text)), cats(r).join('\n'));
});

test('pulling out in front of faster traffic in the next lane is marked; waiting for the gap is not', () => {
  const traffic = [{ lane: 0, s: 90, mph: 50 }, { lane: 1, s: -30, mph: 72 }, { lane: 1, s: -70, mph: 72 }];
  const rushed = run({ v: 55 * MPH, others: traffic.map(o => ({ ...o })), seconds: 10, script: (t) => MSM(t, 0.5, 1, 1) });
  // by the time the car is across the line the closing traffic is either just behind or already alongside
  assert.ok(rushed.faults.some(f => f.cat === 'Mirrors – change direction' && /too small a gap|vehicle alongside/.test(f.text)), cats(rushed).join('\n'));
  const patient = run({ v: 55 * MPH, others: traffic.map(o => ({ ...o })), seconds: 30, script: (t, me, cars) => {
    const clear = cars.filter(c => c.lane === 1).every(c => c.s - me.s > 10);
    if (clear && !me.go) { me.go = t; } if (me.go) return MSM(t, me.go, 1, 1);
  } });
  assert.deepEqual(cats(patient), []);
  assert.equal(patient.events.filter(e => e.type === 'lane').length, 1);
});

test('cutting in after an overtake is marked, and so is a dangerous one as serious', () => {
  // a careless overtake: straight back across the moment the car is past, with no wait
  const cut = (gapAfter) => run({ v: 70 * MPH, others: [{ lane: 0, s: 120, mph: 50 }], seconds: 40, script: (t, me, cars) => {
    if (t < 6) return MSM(t, 0.5, 1, 1);
    if (!me.back && me.laneF === 1 && me.s - cars[0].s - LANE.carLen > gapAfter) { me.back = t; return { look: 'left', signal: 'L', target: 0 }; }
  } });
  const near = cut(5), close = cut(-2);
  assert.ok(near.faults.some(f => /Cut in/.test(f.text) && f.kind === 'D'), cats(near).join('\n'));
  assert.ok(close.faults.some(f => /Cut in/.test(f.text) && f.kind === 'S'), cats(close).join('\n'));
});

test('staying out with nothing to pass is marked once; passing a queue of slower traffic is not', () => {
  const hog = run({ v: 68 * MPH, lane: 1, others: [{ lane: 0, s: 600, mph: 60 }], seconds: 40 });
  assert.deepEqual(hog.faults.map(f => f.text.split(':')[0]), ['Stayed in the middle lane with nothing to overtake and the lane to its left clear']);
  // a line of lorries in the left-hand lane: staying out to pass them all is overtaking, not hogging
  const queue = Array.from({ length: 8 }, (_, i) => ({ lane: 0, s: 20 + i * 45, mph: 52 }));
  const passing = run({ v: 68 * MPH, lane: 1, others: queue, seconds: 40 });
  assert.deepEqual(cats(passing), []);
  assert.ok(passing.stats.justifiedTime > 30);
});

test('middle-lane hogging in three lanes: the left lane busy does not excuse the middle lane being clear', () => {
  const r = run({ v: 68 * MPH, lane: 2, others: [{ lane: 0, s: 30, mph: 68 }, { lane: 0, s: -20, mph: 68 }], seconds: 30 });
  assert.ok(r.faults.some(f => /right-hand lane with nothing to overtake/.test(f.text)), cats(r).join('\n'));
});

test('following distance: two seconds is fine, sitting close is marked, tailgating is serious', () => {
  const at = (gapS, seconds = 20) => run({ v: 60 * MPH, others: [{ lane: 0, s: 60 * MPH * gapS + LANE.carLen, mph: 60 }], seconds });
  assert.deepEqual(cats(at(2.3)), []);
  const close = at(1.5);
  assert.deepEqual(close.faults.map(f => f.cat), ['Following distance']);
  assert.ok(close.stats.under2 > 10);
  const tail = at(0.5);
  assert.ok(tail.faults.some(f => f.kind === 'S' && f.cat === 'Following distance'), cats(tail).join('\n'));
});

test('the vehicle ahead slowing down: dropping back with it is not marked', () => {
  const r = run({ v: 62 * MPH, others: [{ lane: 0, s: 62 * MPH * 2.4, mph: 62, mphAt: t => t < 10 ? 62 : t < 20 ? 62 - (t - 10) * 1.8 : 44 }], seconds: 40,
    script: (t, me, cars) => ({ v: Math.min(62 * MPH, cars[0].v * 1.0, Math.max(0, (cars[0].s - me.s - LANE.carLen) / 2.3)) }) });
  assert.deepEqual(cats(r), []);
});

test('passing on the left is marked at speed, but not in a queue', () => {
  const fast = run({ v: 66 * MPH, others: [{ lane: 1, s: 40, mph: 58 }], seconds: 20 });
  assert.ok(fast.faults.some(f => /on its left/.test(f.text)), cats(fast).join('\n'));
  const queue = run({ v: 22 * MPH, others: [{ lane: 1, s: 20, mph: 15 }], seconds: 20 });
  assert.deepEqual(cats(queue), []);
});

test('an exit: one lane at a time and in lane by 300 yards passes; a late sweep across is marked', () => {
  const good = run({ v: 65 * MPH, lane: 2, exitAt: 1400, seconds: 40, script: (t) => {
    if (t >= 2 && t < 8) return MSM(t, 2, -1, 1); if (t >= 12 && t < 18) return MSM(t, 12, -1, 0);
  } });
  assert.deepEqual(cats(good), []);
  assert.equal(good.events.find(e => e.type === 'exit-lane').lane, 0);
  const late = run({ v: 65 * MPH, lane: 2, exitAt: 700, seconds: 30, script: (t) => {
    if (t >= 14 && t < 16.5) return MSM(t, 14, -1, 1); if (t >= 16.5 && t < 22) return MSM(t, 16.5, -1, 0);
  } });
  const texts = cats(late).join('\n');
  assert.match(texts, /Swept across two lanes/);
  assert.match(texts, /still in the (middle|right-hand) lane 300 yards before the exit/);
});

test('the lane strip offers the lane you are overtaking in, and only the left lane near an exit', () => {
  const A = createLaneAssessor();
  const f = { t: 0, dt: 0.1, v: 30, laneF: 1, lanes: 3, indicator: null, looks: [], others: [{ id: 1, lane: 0, fw: 40, v: 22 }], exitIn: null };
  assert.deepEqual(A.guide(f), { lanes: 3, ok: [0, 1], here: 1 });
  assert.deepEqual(A.guide({ ...f, others: [] }), { lanes: 3, ok: [0], here: 1 });
  assert.deepEqual(A.guide({ ...f, exitIn: 800 }), { lanes: 3, ok: [0], here: 1 });
});
