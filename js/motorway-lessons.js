// Motorway lessons (issues #7, #8 and #9): keeping left, overtaking into a safe gap, following distance at
// speed, getting across in good time for an exit, joining from a slip road, traffic joining beside you,
// leaving by a slip road, and what to do when you miss your exit. They run on the motorway worlds (js/motorway.js) with
// background traffic switched off and every vehicle that matters placed by the lesson, so a drive is
// the same every time and the assessment (js/lane-discipline.js) judges the same situation.
import { MW, JUNCTIONS, centreLine, onCarriageway, junctionSpan } from './motorway.js';
import { createLaneAssessor, senseMotorway, laneName } from './lane-discipline.js';
import { buildRoute, snapWaypoint, posAt } from './net.js';

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
// where a junction's entry slip leaves its roundabout on the A side: a joining lesson starts here
function entrySlip(lanes, n) {
  const sp = junctionSpan(JUNCTIONS.find(q => q.n === n), 'A');
  const p = onCarriageway(centreLine(), lanes, 'A', sp.diverge + MW.junction.out + 2 * MW.ring, MW.sideOffset);
  return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), road: `J${n} slip road` };
}

const KEEP = { n: 'Rule 264', t: 'Keep in the left lane unless overtaking. If you are overtaking a number of slow-moving vehicles, you should return to the left lane as soon as you are safely past.' };
const OVERTAKE = { n: 'Rule 267', t: 'Check your mirrors, take time to judge the speeds correctly, and make sure the lane you will be joining is sufficiently clear ahead and behind. Take a quick sideways glance into the blind spot. Signal in plenty of time, then move out, and do not cut in on the vehicle you have overtaken.' };
const FOLLOW = { n: 'Rule 126', t: 'Allow at least a two-second gap between you and the vehicle in front on roads carrying faster-moving traffic. The gap should be at least doubled on wet roads.' };
const LEAVE = { n: 'Rule 272', t: 'Watch for the signs letting you know you are getting near your exit, move into the left-hand lane well before reaching it, signal left in good time and reduce speed on the slip road as necessary.' };
const JOIN = { n: 'Rule 259', t: 'When you join the motorway you should give priority to traffic already on the motorway, check the traffic and match your speed to fit safely into the traffic flow in the left-hand lane, not cross solid white lines that separate lanes or use the hard shoulder, and remain in the left-hand lane long enough to adjust to the speed of traffic before considering overtaking.' };
const MISSED = { n: 'Rule 263', t: 'You MUST NOT reverse, cross the central reservation, or drive against the traffic flow. If you have missed your exit, or have taken the wrong route, carry on to the next exit.' };
const FOCUS = ['Positioning – lane discipline', 'Mirrors – change direction', 'Signals – necessary', 'Following distance'];
const EXIT_FOCUS = [...FOCUS, 'Use of speed', 'Response to road markings', 'Positioning – normal driving'];
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
  { id: 'mw-join', unit: 'motorway', area: 'm3', title: 'Joining the motorway', road: 'J1 slip road → M100',
    goal: 'Join from the slip road. Traffic already on the motorway has priority: build up your speed to match it, find a gap in the left-hand lane and fit into it without making anyone brake. If the gap you were aiming for closes, let it go and take the next one.',
    steps: ['Look right early: mirror, then over your shoulder', 'Signal right and match the speed of the left-hand lane', 'Fit in without forcing anyone to brake, then stay left while you settle'],
    rule: JOIN, waypoints: [entrySlip(3, 1), M(3, 5200)], scenario: 'motorway', setup: 'join', merge: 1,
    startAt: 40, startLane: 0, startMph: 30, endAtSpeed: true, scenarioVariants: SCRIPTED, focus: [...FOCUS, 'Use of speed'], maxD: 2 },
  { id: 'mw-merging', unit: 'motorway', area: 'm3', title: 'Traffic joining from a slip road', road: 'M100 · junction 2 · three lanes',
    goal: 'Traffic will join from the slip road beside you. You have priority and do not have to move over, but you can help if it is safe: keep your speed and let them fit in behind, ease off a little to let them in ahead, or move over if the middle lane is clear.',
    steps: ['Spot the traffic on the slip road early', 'Check your mirrors before you decide: the middle lane may be busy', 'Keep your lane, ease off, or move over only into a safe gap'],
    rule: JOIN, waypoints: [M(3, 6400), M(3, 9200)], scenario: 'motorway', setup: 'merging', merge: 2,
    startAt: 500, startLane: 0, startMph: 60, endAtSpeed: true, scenarioVariants: SCRIPTED, focus: FOCUS, maxD: 2 },
  { id: 'mw-exit', unit: 'motorway', area: 'm2', title: 'Leaving the motorway', road: 'M100 → J3 Kingsmere · two lanes',
    goal: 'Leave at junction 3. Follow the signs as they count down, be in the left-hand lane in good time, and keep up with the traffic until you are on the slip road. Then slow down for its bend and the roundabout at the end.',
    steps: ['Signs at 1 mile and ½ mile, then countdown markers at 300, 200 and 100 yards', 'Mirror and signal left by the 300-yard marker; leave where the slip road starts', 'Slow down on the slip road, not before it, and give way at the roundabout'],
    rule: LEAVE, waypoints: [M(2, 12400), localRoad(2, 3)], scenario: 'motorway', setup: 'exit', exit: 3,
    startAt: 200, startLane: 0, startMph: 64, scenarioVariants: SCRIPTED, focus: EXIT_FOCUS, maxD: 2 },
  { id: 'mw-missed-exit', unit: 'motorway', area: 'm3', title: 'If you miss your exit', road: 'M100 · junction 3 · three lanes',
    goal: 'You are in the middle lane, leaving at junction 3, and the left-hand lane is a solid line of lorries. Never force your way in. If there is no safe gap in time, carry on to the next junction: never stop, reverse or cut across the hatching to get back.',
    steps: ['Look for a safe gap in the left-hand lane, but do not force one', 'If the exit goes by, let it go: there is always another junction', 'No stopping, no reversing, and no crossing the hatched area'],
    rule: MISSED, waypoints: [M(3, 13200), localRoad(3, 3)], scenario: 'motorway', setup: 'missed', exit: 3,
    startAt: 300, startLane: 1, startMph: 58, scenarioVariants: SCRIPTED, focus: EXIT_FOCUS, maxD: 2 },
];

const MPH = 0.44704;
// Scripted traffic, in route metres ahead of the learner's start (negative is behind; each lesson's
// startAt leaves room on its route for the furthest back). `main` places a vehicle that many metres
// upstream of the lesson junction's merge point on the carriageway, `slip` that many metres before the
// merge on its entry slip road. `role` names the vehicles the lesson's own result is about.
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
  // the first gap in the left-hand lane closes just as you reach it; the middle lane is busy too, so
  // nobody on the motorway could move over for you even if they wanted to
  join: [{ main: 905, lane: 0, mph: 60 }, { main: 950, lane: 0, mph: 60 }, { main: 1130, lane: 0, mph: 59 }, { main: 700, lane: 0, mph: 61 }, { main: 1330, lane: 0, mph: 60 },
    { main: 850, lane: 1, mph: 66 }, { main: 980, lane: 1, mph: 66 }, { main: 1040, lane: 1, mph: 66 }, { main: 1200, lane: 2, mph: 70 }],
  // a slower car ahead to catch before the exit, and faster traffic in the right-hand lane
  exit: [{ at: 300, lane: 0, mph: 55 }, { at: 0, lane: 1, mph: 68 }, { at: -150, lane: 1, mph: 70 }],
  // a solid line of lorries in the left-hand lane, a second apart: there is no safe gap to the exit
  missed: [-283, -255, -227, -199, -171, -143, -115, -87, -59, -31, -3, 25, 53, 81, 109].map(at => ({ at, lane: 0, mph: 56 })).concat([{ at: -100, lane: 2, mph: 70 }]),
  // two vehicles on the slip road timed to arrive as you do, and a car alongside you in the middle lane
  // that draws ahead within ten seconds or so, so moving over becomes possible (but is never required)
  merging: [{ slip: 520, mph: 48, role: 'joiner' }, { slip: 570, mph: 48, role: 'joiner' }, { at: 120, lane: 0, mph: 60 },
    { at: 0, lane: 1, mph: 66 }, { at: -250, lane: 1, mph: 68 }, { at: -120, lane: 2, mph: 70 }],
};
// the traffic wave in the following lesson: speed as a share of where each vehicle started, by time
const wave = (t) => t < 20 ? 1 : t < 40 ? 1 - (t - 20) / 20 * 0.3 : t < 70 ? 0.7 : t < 90 ? 0.7 + (t - 70) / 20 * 0.35 : 1.05;

export function createMotorwayScenario(lesson, { net, traffic, test, player }) {
  const events = [], placed = [];
  const A = createLaneAssessor({ fault: (kind, cat, text, key) => test.fault(kind, cat, text, key, 30) });
  const route = () => test.route;
  const R0 = route(), exitS = lesson.exit ? R0.stepS[R0.steps.findIndex(st => st.e.way.cls === 'motorway_link')] : null;
  let t0 = null, missed = false, tookExit = false, finished = false, continuing = false;
  let slipFast = 0, slipFlag = false; const slipBend = [];
  // the motorway is no place to pull up: these lessons end as you drive past the end of the stretch
  if (lesson.endAtSpeed) { const fin = R0.instructions.find(i => i.final); if (fin) Object.assign(fin, { icon: 'straight', text: 'Carry on: the exercise ends ahead', short: '' }); }
  // the exit: the instruction box counts down to the junction by number and destination, as signs do
  if (exitS != null) {
    const j = JUNCTIONS.find(q => q.n === lesson.exit);
    R0.instructions.push({ s: exitS, kind: 'straight', icon: 'left', text: `Leave at junction ${j.n} for ${j.to}`, short: `Junction ${j.n}`, signal: null, road: 'M100', junction: j.n, to: j.to });
    R0.instructions.sort((a, b) => (a.final ? 1 : 0) - (b.final ? 1 : 0) || a.s - b.s);
  }

  // the curve of a road at distance s along an edge: radius through points 12 m either side
  function bendRadius(e, s) {
    const a = posAt(e, Math.max(0, s - 12)), b = posAt(e, Math.min(e.len, s)), c = posAt(e, Math.min(e.len, s + 12));
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    return area2 > 1e-6 ? ab * bc * ca / (2 * area2) : 1e6;
  }
  // after a missed exit: a route on along the motorway to a kilometre past the junction, and the
  // instruction box pointing on to the next junction
  function continueToNext(nr) {
    const lanes = net.motorway.lanes, j = JUNCTIONS.find(q => q.n === lesson.exit), next = JUNCTIONS[(JUNCTIONS.indexOf(j) + 1) % JUNCTIONS.length];
    const special = JUNCTIONS.flatMap(q => { const sp = junctionSpan(q, 'A'); return [sp.diverge, sp.merge]; });
    let s = Math.ceil((junctionSpan(j, 'A').diverge + 1000) / MW.edgeLen) * MW.edgeLen; while (special.some(x => Math.abs(x - s) < 61)) s += MW.edgeLen;
    try {
      const nodes = [nr.e.a, snapWaypoint(net, M(lanes, s))], r = buildRoute(net, nodes, { name: route().name });
      const fin = r.instructions.find(i => i.final); if (fin) Object.assign(fin, { icon: 'straight', text: 'Carry on: the exercise ends ahead', short: '' });
      r.instructions.unshift({ s: Math.max(0, r.len - 60), kind: 'straight', icon: 'straight', text: `Exit missed: carry on to junction ${next.n}`, short: `Junction ${next.n}`, signal: null, road: 'M100', junction: next.n, to: next.to });
      r.instructions.sort((a, b) => (a.final ? 1 : 0) - (b.final ? 1 : 0) || a.s - b.s);
      Object.assign(test, { idx: 0, sRoute: 0, step: 0, offT: 0, offRoute: false, wpIndex: 1 }); test.setRoute(r, nodes); test.snapProgress(3000);
      continuing = true;
    } catch (_) { test.finish(); } // nowhere to go (cannot happen on the circuit): end rather than send them somewhere impossible
  }
  // the lesson junction's merge point: where its entry slip road meets the carriageway
  const mergeNode = lesson.merge ? (() => { const j = JUNCTIONS.find(q => q.n === lesson.merge), at = junctionSpan(j, 'A').merge, p = onCarriageway(centreLine(), net.motorway.lanes, 'A', at);
    let best = -1, bd = Infinity; for (const e of net.edges) if (e.way.cls === 'motorway_link') { const d = Math.hypot(net.nx[e.b] - p.x, net.nz[e.b] - p.z); if (d < bd) { bd = d; best = e.b; } } return best; })() : null;
  const slipInto = () => net.edges.find(e => e.way.cls === 'motorway_link' && e.b === mergeNode);
  // a spot on the carriageway `before` metres upstream of the merge (walking back along it)
  function upstream(before) {
    let v = mergeNode, d = before;
    for (let i = 0; i < 20; i++) { const e = net.edges.find(x => x.way.cls === 'motorway' && x.b === v); if (!e) return null; if (d <= e.len) return { e, s: e.len - d }; d -= e.len; v = e.a; }
    return null;
  }
  function placeAt(e, s, spec) {
    const free = traffic.cars.find(c => !placed.some(p => p.car === c)); if (!free) return;
    traffic.placeCar(free, e, 1, Math.max(0.5, Math.min(e.len - 1, s)), spec.mph * MPH, spec.mph / 70, null, spec.lane || 0, 'motorway');
    free.pinned = 1e9; placed.push({ car: free, spec, passed: false });
  }
  function place(spec) {
    if (spec.main != null) { const u = upstream(spec.main); if (u) placeAt(u.e, u.s, spec); return; }
    if (spec.slip != null) { const e = slipInto(); if (e && spec.slip <= e.len) placeAt(e, e.len - spec.slip, spec); return; }
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
    // distance to the exit, and past it (negative) all along the deceleration lane, where crossing the
    // hatching from the carriageway is judged
    const exitIn = exitS != null && test.sRoute < exitS + MW.junction.decel + 60 ? exitS - test.sRoute : null;
    const f = senseMotorway({ t: clock, dt, player, test, traffic, net, exitIn });
    A.step(f);
    test.laneGuide = A.guide(f);
    // traffic joining beside you: when each vehicle on the slip road reaches the motorway, is it ahead of
    // you or behind, and what did you do as it came alongside (kept your lane and speed, eased off, moved over)?
    if (lesson.setup === 'merging') {
      const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
      for (const p of placed) {
        if (p.spec.role !== 'joiner' || p.joined || !p.car.alive) continue;
        const fw = (p.car.x - player.x) * fx + (p.car.z - player.z) * fz;
        if (!p.near && p.car.e.way.cls === 'motorway_link' && p.car.e.len - p.car.s < MW.junction.accel) { p.near = { at: clock, mph: player.v / MPH, lane: Math.round(f.laneF ?? 0) }; p.minMph = player.v / MPH; }
        if (p.near) p.minMph = Math.min(p.minMph, player.v / MPH);
        if (p.car.e.way.cls === 'motorway') { p.joined = { at: clock, ahead: fw > 0, waited: Math.round(clock - (p.near?.at ?? clock)) }; p.response = Math.round(f.laneF ?? 0) > 0 || (p.near?.lane ?? 0) > 0 ? 'moved' : p.near && p.near.mph - p.minMph > 5 ? 'eased' : 'kept';
          events.push({ type: 'joined-beside', ahead: fw > 0, response: p.response, fromMph: Math.round(p.near?.mph ?? 0), toMph: Math.round(p.minMph ?? 0) }); }
      }
    }
    // the following lesson's instrument: your gap to the car ahead, in seconds, where you look for it
    if (lesson.setup === 'following') {
      const here = f.laneF == null ? -1 : Math.round(f.laneF), ahead = f.others.filter(o => o.lane === here && o.fw > 4.6 && o.fw < 200).sort((a, b) => a.fw - b.fw)[0];
      test.basicStatus = { value: ahead && f.v > 3 ? `${((ahead.fw - 4.6) / f.v).toFixed(1)} s` : '–' };
    }
    // carried on past the exit: the right thing to do (Rule 263), so the route carries on too, towards the
    // next junction, and the lesson ends a kilometre on. No impossible "turn round" instruction.
    if (exitS != null && !tookExit && !missed && nr && nr.way.cls === 'motorway' && test.offRoute) {
      missed = true; events.push({ type: 'missed-exit', at: clock }); continueToNext(nr); return;
    }
    // on the exit slip road: take its bend at a speed that suits it (Rule 272: reduce speed as necessary)
    if (tookExit && nr && nr.way.cls === 'motorway_link' && nr.s > MW.junction.decel - 40 && nr.e.len - nr.s > 40) {
      const r = bendRadius(nr.e, nr.s + 15), a = player.v * player.v / r;
      slipBend.push(r);
      slipFast = a > 3.5 ? slipFast + dt : 0;
      if (slipFast > 0.6 && !slipFlag) { slipFlag = true; const suits = Math.floor(Math.sqrt(3 * r) / MPH / 5) * 5;
        test.fault('D', 'Use of speed', `Took the bend on the slip road at ${Math.round(player.v / MPH)} mph: it suits about ${suits} mph (Rule 272)`, 'mwslipbend', 30);
        events.push({ type: 'slip-bend', mph: Math.round(player.v / MPH), suits }); }
    }
    if ((lesson.endAtSpeed || continuing) && !finished && test.sRoute > route().len - 40) { finished = true; test.finish(); }
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
    if (lesson.setup === 'join') {
      const j = A.events.find(e => e.type === 'join');
      if (!j) return { ok: false, why: 'You did not join the motorway. Build up your speed on the slip road and look for a gap in the left-hand lane.' };
      return { ok: true, why: `Joined at ${j.mph} mph${j.trafficMph ? ` into traffic doing about ${j.trafficMph} mph` : ''}${j.behindS != null ? `, ${j.behindS.toFixed(1)} s ahead of the vehicle behind` : ''}.` };
    }
    if (lesson.setup === 'merging') {
      const said = { kept: 'you kept your lane and speed', eased: 'you eased off', moved: 'you moved over' };
      const lines = events.filter(e => e.type === 'joined-beside').map(e => `one joined ${e.ahead ? 'ahead of' : 'behind'} you as ${said[e.response]}${e.response === 'eased' ? ` from ${e.fromMph} to ${e.toMph} mph` : ''}`);
      return { ok: true, why: lines.length ? `Traffic joined from the slip road: ${lines.join('; ')}. Any of those is right when it is safe.` : '' };
    }
    if (lesson.setup === 'missed') {
      if (tookExit) return { ok: true, why: 'You found a safe gap and took the exit.' };
      if (!missed) return { ok: false, why: 'The drive ended before you reached the exit.' };
      return { ok: true, why: 'There was no safe gap, so you let the exit go and carried on: exactly right. The next junction is never far away.' };
    }
    if (lesson.setup === 'exit') {
      if (missed) return { ok: false, why: 'You carried on past the exit, which was the safe thing to do once it was too late. Next time be in the left-hand lane by the 300-yard marker.' };
      if (!tookExit) return { ok: false, why: 'The drive ended before you reached the exit.' };
      const leave = A.events.find(e => e.type === 'leave'), bend = slipBend.length ? Math.floor(Math.sqrt(3 * Math.min(...slipBend)) / MPH / 5) * 5 : null;
      return { ok: true, why: `Left the motorway at ${leave ? leave.mph : '?'} mph${leave && leave.signalFor > 0 ? `, signalling ${leave.signalFor.toFixed(1)} s before` : ''}${bend ? `; the slip road's bend suits about ${bend} mph` : ''}.` };
    }
    if (lesson.setup === 'exit-prep') {
      if (missed) return { ok: false, why: 'You carried on past the exit, which was the safe thing to do once it was too late. Start moving left earlier, one lane at a time.' };
      if (!tookExit) return { ok: false, why: 'The drive ended before you reached the exit.' };
      const at = A.events.find(e => e.type === 'exit-lane');
      return { ok: true, why: `Took the exit after ${moves.length} lane change${moves.length === 1 ? '' : 's'}${at ? `, in the ${laneName(at.lane, at.lanes)} lane at the 300-yard point` : ''}.` };
    }
    return null;
  };
  Object.defineProperty(S, 'events', { get: () => events.concat(A.events) });
  return S;
}
