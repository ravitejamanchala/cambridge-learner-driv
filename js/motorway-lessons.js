// Motorway lessons (issue #7): keeping left, overtaking into a safe gap, following distance at speed,
// and getting across in good time for an exit. They run on the motorway worlds (js/motorway.js) with
// background traffic switched off and every vehicle that matters placed by the lesson, so a drive is
// the same every time and the assessment (js/lane-discipline.js) judges the same situation.
import { MW, JUNCTIONS, centreLine, onCarriageway, junctionSpan } from './motorway.js';
import { createLaneAssessor, senseMotorway, laneName } from './lane-discipline.js';

// a node on the A carriageway at centre-line distance s (always a multiple of 400 m, where the layout
// cuts the carriageway, so the waypoint lands exactly on a node of the right carriageway)
const M = (lanes, s) => { const p = onCarriageway(centreLine(), lanes, 'A', s); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), road: 'M100' }; };
// the far end of a junction's local road on the A side, where an exit lesson finishes
function localRoad(lanes, n) {
  const j = JUNCTIONS.find(q => q.n === n), sp = junctionSpan(j, 'A');
  const p = onCarriageway(centreLine(), lanes, 'A', sp.diverge + MW.junction.out + MW.ring, MW.sideOffset + 640);
  return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), road: `A${n}01 to ${j.to}` };
}
export const exitDiverge = (n) => junctionSpan(JUNCTIONS.find(q => q.n === n), 'A').diverge;

const KEEP = { n: 'Rule 264', t: 'Keep in the left lane unless overtaking. If you are overtaking a number of slow-moving vehicles, you should return to the left lane as soon as you are safely past.' };
const OVERTAKE = { n: 'Rule 267', t: 'Check your mirrors, take time to judge the speeds correctly, and make sure the lane you will be joining is sufficiently clear ahead and behind. Take a quick sideways glance into the blind spot. Signal in plenty of time, then move out, and do not cut in on the vehicle you have overtaken.' };
const FOLLOW = { n: 'Rule 126', t: 'Allow at least a two-second gap between you and the vehicle in front on roads carrying faster-moving traffic. The gap should be at least doubled on wet roads.' };
const LEAVE = { n: 'Rule 272', t: 'Watch for the signs letting you know you are getting near your exit, move into the left-hand lane well before reaching it, signal left in good time and reduce speed on the slip road as necessary.' };
const FOCUS = ['Positioning – lane discipline', 'Mirrors – change direction', 'Signals – necessary', 'Following distance'];
// background traffic off: every vehicle that matters is placed by the lesson, so each run is the same
const SCRIPTED = [{ id: 'scripted', title: 'The lesson\'s own traffic', trafficDensity: 'none' }];

export const MOTORWAY_LESSONS = [
  { id: 'mw-keep-left', unit: 'motorway', area: 'm3', title: 'Keep left, overtake, move back', road: 'M100 · three lanes · 70 mph',
    goal: 'Cruise in the left-hand lane. Overtake the slower vehicles you catch up with, then move back left once you are safely past, even if there is more traffic a long way ahead.',
    steps: ['Mirrors, signal, a glance over your shoulder, then move out', 'Pull out into a gap nobody has to brake for', 'Back left when the vehicle you passed is well behind; never cut in'],
    rule: KEEP, waypoints: [M(3, 8000), M(3, 12800)], scenario: 'motorway', setup: 'keep-left',
    startAt: 450, startLane: 0, startMph: 60, endAtSpeed: true, scenarioVariants: SCRIPTED, focus: FOCUS, maxD: 2 },
  { id: 'mw-busy-lane', unit: 'motorway', area: 'm2', title: 'Overtaking when the next lane is busy', road: 'M100 · two lanes · 70 mph',
    goal: 'A slow lorry ahead, and faster traffic streaming past in the right-hand lane. Wait behind the lorry until there is a real gap, then overtake.',
    steps: ['Drop back to two seconds behind the lorry while you wait', 'Judge the speed of what is coming up behind: it closes fast', 'Move out only into a gap nobody has to brake for'],
    rule: OVERTAKE, waypoints: [M(2, 8000), M(2, 11200)], scenario: 'motorway', setup: 'busy-lane',
    startAt: 560, startLane: 0, startMph: 55, endAtSpeed: true, scenarioVariants: SCRIPTED, focus: FOCUS, maxD: 2 },
  { id: 'mw-following', unit: 'motorway', area: 'm3', title: 'Following distance at 70', road: 'M100 · three lanes · traffic building',
    goal: 'Follow the traffic in the left-hand lane as it slows down and speeds up again. Keep at least a two-second gap the whole way. 70 is the most you may do, not a speed to aim for.',
    steps: ['Count two seconds behind the car in front, every time it changes speed', 'Ease off early as the traffic slows; do not wait to brake', 'Do not dive into the next lane to keep your speed up'],
    rule: FOLLOW, waypoints: [M(3, 8000), M(3, 12000)], scenario: 'motorway', setup: 'following',
    startAt: 130, startLane: 0, startMph: 58, endAtSpeed: true, scenarioVariants: SCRIPTED, focus: FOCUS, maxD: 2 },
  { id: 'mw-exit-prep', unit: 'motorway', area: 'm3', title: 'Getting into lane for your exit', road: 'M100 → J2 Ashwell',
    goal: 'You are in the right-hand lane and leaving at junction 2. Move across one lane at a time, in gaps in the traffic, and be in the left-hand lane well before the exit.',
    steps: ['Start moving left early: there is traffic in both lanes', 'One lane at a time: settle, then mirrors and signal again', 'In the left-hand lane by the 300-yard marker, then follow the slip road'],
    rule: LEAVE, waypoints: [M(3, 4000), localRoad(3, 2)], scenario: 'motorway', setup: 'exit-prep', exit: 2,
    startAt: 320, startLane: 2, startMph: 64, scenarioVariants: SCRIPTED, focus: FOCUS, maxD: 2 },
];

const MPH = 0.44704;
// Scripted traffic, in route metres ahead of the learner's start (negative is behind; each lesson's
// startAt leaves room on its route for the furthest back). `role` names the vehicles the lesson's own
// result is about.
export const SETUPS = {
  'keep-left': [{ at: 260, lane: 0, mph: 50, role: 'slow' }, { at: 650, lane: 0, mph: 53, role: 'slow' }, { at: -150, lane: 1, mph: 69 }, { at: -420, lane: 2, mph: 70 }],
  'busy-lane': [{ at: 170, lane: 0, mph: 48, role: 'slow' },
    { at: -40, lane: 1, mph: 66 }, { at: -80, lane: 1, mph: 66 }, { at: -125, lane: 1, mph: 66 }, { at: -175, lane: 1, mph: 66 }, { at: -230, lane: 1, mph: 66 }, { at: -520, lane: 1, mph: 70 }],
  // the lead car and the lanes beside you all slow together, as traffic does when it builds up
  following: [{ at: 75, lane: 0, mph: 60, role: 'lead', wave: 1 }, { at: 160, lane: 0, mph: 60, wave: 1 },
    { at: 20, lane: 1, mph: 62, wave: 1 }, { at: -30, lane: 1, mph: 62, wave: 1 }, { at: 90, lane: 1, mph: 62, wave: 1 }, { at: -80, lane: 1, mph: 62, wave: 1 },
    { at: 60, lane: 2, mph: 66, wave: 1 }, { at: -60, lane: 2, mph: 66, wave: 1 }],
  'exit-prep': [{ at: 25, lane: 1, mph: 62 }, { at: -110, lane: 1, mph: 62 }, { at: 200, lane: 1, mph: 61 }, { at: -280, lane: 1, mph: 64 },
    { at: 40, lane: 0, mph: 56 }, { at: 260, lane: 0, mph: 56 }, { at: -120, lane: 0, mph: 57 }, { at: 520, lane: 0, mph: 55 }],
};
// the traffic wave in the following lesson: speed as a share of where each vehicle started, by time
const wave = (t) => t < 20 ? 1 : t < 40 ? 1 - (t - 20) / 20 * 0.3 : t < 70 ? 0.7 : t < 90 ? 0.7 + (t - 70) / 20 * 0.35 : 1.05;

export function createMotorwayScenario(lesson, { traffic, test, player }) {
  const events = [], placed = [];
  const A = createLaneAssessor({ fault: (kind, cat, text, key) => test.fault(kind, cat, text, key, 30) });
  const route = () => test.route;
  const R0 = route(), exitS = lesson.exit ? R0.stepS[R0.steps.findIndex(st => st.e.way.cls === 'motorway_link')] : null;
  let t0 = null, missed = false, tookExit = false, finished = false;
  // the motorway is no place to pull up: these lessons end as you drive past the end of the stretch
  if (lesson.endAtSpeed) { const fin = R0.instructions.find(i => i.final); if (fin) Object.assign(fin, { icon: 'straight', text: 'Carry on: the exercise ends ahead', short: '' }); }
  // the exit: the instruction box counts down to the junction by number and destination, as signs do
  if (exitS != null) {
    const j = JUNCTIONS.find(q => q.n === lesson.exit);
    R0.instructions.push({ s: exitS, kind: 'straight', icon: 'left', text: `Leave at junction ${j.n} for ${j.to}`, short: `Junction ${j.n}`, signal: null, road: 'M100', junction: j.n, to: j.to });
    R0.instructions.sort((a, b) => (a.final ? 1 : 0) - (b.final ? 1 : 0) || a.s - b.s);
  }

  function place(spec) {
    const R = route(), s = test.sRoute + spec.at; let k = 0;
    if (s < 1 || s > R.len - 5) return; // off the route: tests/motorway.test.mjs checks no lesson does this
    while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
    const st = R.steps[k], free = traffic.cars.find(c => !placed.some(p => p.car === c));
    if (!free) return;
    traffic.placeCar(free, st.e, st.dir, Math.min(st.e.len - 1, s - R.stepS[k]), spec.mph * MPH, spec.mph / 70, null, spec.lane, 'motorway');
    free.pinned = 1e9; // stays with the lesson, wherever it gets to
    placed.push({ car: free, spec, passed: false });
  }
  const S = { notes: [], laneStats: A.stats, lane: A };
  S.update = (dt, clock) => {
    if (!test.running) return;
    if (t0 === null) { t0 = clock; for (const spec of SETUPS[lesson.setup] || []) place(spec); }
    const t = clock - t0;
    for (const p of placed) {
      if (p.spec.wave) p.car.cruise = p.spec.mph / 70 * wave(t);
      const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
      if (p.car.alive && (p.car.x - player.x) * fx + (p.car.z - player.z) * fz < -8) p.passed = true;
    }
    const nr = test.ctx;
    if (exitS != null && nr && nr.way.cls === 'motorway_link' && test.sRoute > exitS) tookExit = true;
    const f = senseMotorway({ t: clock, dt, player, test, traffic, exitIn: exitS != null && !tookExit ? exitS - test.sRoute : null });
    A.step(f);
    test.laneGuide = A.guide(f);
    // the following lesson's instrument: your gap to the car ahead, in seconds, where you look for it
    if (lesson.setup === 'following') {
      const here = f.laneF == null ? -1 : Math.round(f.laneF), ahead = f.others.filter(o => o.lane === here && o.fw > 4.6 && o.fw < 200).sort((a, b) => a.fw - b.fw)[0];
      test.basicStatus = { value: ahead && f.v > 3 ? `${((ahead.fw - 4.6) / f.v).toFixed(1)} s` : '–' };
    }
    // carried on past the exit: the lesson is over (what to do after a missed exit is in the exits lesson)
    if (exitS != null && !tookExit && !missed && nr && nr.way.cls === 'motorway' && test.offRoute) {
      missed = true; events.push({ type: 'missed-exit', at: clock }); test.finish(); return;
    }
    if (lesson.endAtSpeed && !finished && test.sRoute > route().len - 40) { finished = true; test.finish(); }
  };
  S.stop = () => { test.laneGuide = null; test.basicStatus = null; for (const p of placed) Object.assign(p.car, { pinned: 0, scripted: false, keepTo: null }); };

  // what the lesson itself asked for, measured; faults are judged by evaluate() as for every lesson
  S.result = () => {
    const moves = A.events.filter(e => e.type === 'lane'), st = A.stats, roles = (r) => placed.filter(p => p.spec.role === r);
    if (lesson.setup === 'keep-left' || lesson.setup === 'busy-lane') {
      const slow = roles('slow'), passed = slow.filter(p => p.passed).length;
      if (!passed) return { ok: false, why: `You did not overtake the ${lesson.setup === 'busy-lane' ? 'lorry' : 'slower vehicle'} ahead. Overtaking is part of this lesson: wait for a safe gap, then go.` };
      return { ok: true, why: `Overtook ${passed} of ${slow.length} slower vehicle${slow.length > 1 ? 's' : ''} in ${moves.length} lane change${moves.length === 1 ? '' : 's'}.` };
    }
    if (lesson.setup === 'following') {
      if (st.measured < 20) return { ok: false, why: 'You were not following the traffic for long enough to measure your gap: stay in the left-hand lane behind the car ahead.' };
      const share = Math.round(100 * (1 - st.under2 / st.measured));
      if (st.under2 > 6) return { ok: false, why: `Under two seconds behind the car ahead for ${Math.round(st.under2)} s of ${Math.round(st.measured)} s (closest ${st.minGap.toFixed(1)} s). Ease off earlier as the traffic slows.` };
      return { ok: true, why: `At least two seconds behind for ${share}% of ${Math.round(st.measured)} s of following; the closest you came was ${st.minGap.toFixed(1)} s.` };
    }
    if (lesson.setup === 'exit-prep') {
      if (missed) return { ok: false, why: 'You carried on past the exit. Start moving left earlier, one lane at a time.' };
      if (!tookExit) return { ok: false, why: 'The drive ended before you reached the exit.' };
      const at = A.events.find(e => e.type === 'exit-lane');
      return { ok: true, why: `Took the exit after ${moves.length} lane change${moves.length === 1 ? '' : 's'}${at ? `, in the ${laneName(at.lane, at.lanes)} lane at the 300-yard point` : ''}.` };
    }
    return null;
  };
  Object.defineProperty(S, 'events', { get: () => events.concat(A.events) });
  return S;
}
