// Yellow box junctions and KEEP CLEAR (issue #5): three lessons in the practice town. Each sets up the one
// situation it teaches with traffic it holds and lets go (a queue beyond the box, a stream of oncoming
// traffic, a queue beyond KEEP CLEAR), and its feedback comes from what the examiner recorded as the
// learner crossed (test.boxes.log, js/box-junction.js), so a pass says exactly what was done.
import { endNode, startNode } from './net.js';
import { boxArea, keepArea, crossing, CAR_HALF } from './box-junction.js';

const pt = (x, z, road) => ({ x, z, road });
const R174 = 'You MUST NOT enter the box until your exit road or lane is clear. However, you may enter the box and wait when you want to turn right, and are only stopped from doing so by oncoming traffic, or by other vehicles waiting to turn right.';
const LIGHT = [{ id: 'traffic', title: 'Light traffic', trafficDensity: 'light' }];

export const BOX_LESSONS = [
  { id: 'box-junction', unit: 'junctions', area: 'town', title: 'Yellow box junction', road: 'Bridge Street · Station Road crossroads',
    goal: 'Straight on over the yellow box at Station Road. Traffic is queueing beyond it: wait at the line, even on green, until there is room for your whole car on the other side.',
    steps: ['Look past the box to the road you are going into', 'No room for your car beyond the box? Wait at the line, even on green', 'Go when there is room, and cross the box without stopping'],
    rule: { n: 'Rule 174', t: R174 },
    waypoints: [pt(-250, 0, 'Bridge Street'), pt(-250, -900, 'Bridge Street')], scenario: 'box', focus: ['Response to road markings', 'Response to signals'], maxD: 2, scenarioVariants: LIGHT },
  { id: 'box-right', unit: 'junctions', area: 'town', title: 'Turning right in a yellow box', road: 'Bridge Street → Station Road',
    goal: 'Turn right into Station Road. Your exit is clear, so you may move into the box and wait there for oncoming traffic, then turn when there is a safe gap.',
    steps: ['Mirrors, signal right, and move into the right-hand lane', 'Your exit is clear: move forward into the box, to the turning point', 'Wait for a safe gap in the oncoming traffic, then turn'],
    rule: { n: 'Rule 174', t: R174 },
    waypoints: [pt(-250, 0, 'Bridge Street'), pt(0, -450, 'Station Road')], scenario: 'box-right', focus: ['Response to road markings', 'Junctions', 'Signals'], maxD: 2, scenarioVariants: LIGHT },
  { id: 'keep-clear', unit: 'junctions', area: 'town', title: 'KEEP CLEAR', road: 'High Street · Orchard Way',
    goal: 'Traffic is queueing on High Street. Stop before the KEEP CLEAR markings, not on them, so traffic can get in and out of Orchard Way.',
    steps: ['Read the road ahead: a queue, and KEEP CLEAR across the side road', 'Stop short of the markings', 'Move on when the queue does'],
    rule: { n: 'Know your traffic signs', t: 'KEEP CLEAR across a road: do not stop in the marked area, even in a queue, so that traffic can get into and out of the side road.' },
    waypoints: [pt(250, 0, 'High Street'), pt(-640, 0, 'High Street')], scenario: 'keep-clear', startAt: 125, focus: ['Response to road markings'], maxD: 2, scenarioVariants: LIGHT }
];

const SCENARIOS = new Set(['box', 'box-right', 'keep-clear']);
const GAP = 6.8; // centre to centre in a queue

export function createBoxScenario(lesson, { net, traffic, test, player }) {
  if (!SCENARIOS.has(lesson.scenario)) return null;
  const S = { ok: true, notes: [], update() {}, stop() {} }, R = test.route;
  // cars for the lesson to use: the ones furthest from the learner, out of sight
  const spare = (n) => traffic.cars.filter(c => !c.scripted).sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z)).slice(0, n);
  const front = () => ({ x: player.x - Math.sin(player.th) * CAR_HALF, z: player.z - Math.cos(player.th) * CAR_HALF, fx: -Math.sin(player.th), fz: -Math.cos(player.th) });
  // metres from the front of the car to where it would enter area A (negative once in)
  const toArea = (A) => { const f = front(); return crossing(A, f.x, f.z, f.fx, f.fz).into; };
  const still = () => Math.abs(player.v) < 0.3;
  // hold the learner's lights on green at node v while the lesson runs (the box is the lesson, not the light)
  function holdGreen(st) {
    const line = (net.stopsByEdge.get(st.e.id) || []).find(l => l.dir === st.dir); if (!line) return;
    traffic.overrides.set(line.cluster, { group: line.group, t0: Infinity });
    const stop = S.stop; S.stop = () => { traffic.overrides.delete(line.cluster); stop(); };
  }
  // the queue: n cars held still in lane 0 from `s0` metres along step `st`, one behind the other
  function queue(st, s0, n) {
    const cars = spare(n);
    cars.forEach((c, i) => { traffic.placeCar(c, st.e, st.dir, Math.min(st.e.len - 1, s0 + i * GAP), 0, 1); c.held = true; c.pinned = 120; });
    return { cars, release() { for (const c of cars) c.held = false; } };
  }
  const entryFor = (kind, node) => test.boxes.log.find(e => e.kind === kind && (node == null || e.node === node));

  if (lesson.scenario === 'box' || lesson.scenario === 'box-right') {
    const k = R.steps.findIndex((st, i) => i < R.steps.length - 1 && (net.boxes || []).some(b => b.node === endNode(st)));
    if (k < 0) return S;
    const v = endNode(R.steps[k]), A = boxArea(net, v), out = R.steps[k + 1];
    holdGreen(R.steps[k]);
    if (lesson.scenario === 'box') {
      // a queue starting a metre past the far side of the box, in the lane the learner is going into
      const far = crossing(A, net.nx[v], net.nz[v], ...dirOf(out)).out;
      let Q = null, waited = 0, inside = 0, released = false, started = null;
      S.notes.push('The lights were held on green, with traffic queueing beyond the box until you had waited for it.');
      S.update = (dt) => {
        if (!Q) Q = queue(out, far + 1 + CAR_HALF, 3);
        const d = toArea(A);
        if (started == null && d < 80) started = traffic.clock;
        if (still() && d > -0.5 && d < 15) waited += dt;
        if (still() && d <= -0.5) inside += dt;
        if (!released && (waited >= 5 || inside >= 4 || (started != null && traffic.clock - started > 45))) { released = true; Q.release(); }
        // while they wait at the line: what they are waiting for, then that it has come
        test.alert = still() && d > -0.5 && d < 15 ? (released ? { label: 'Room now: go when safe', tone: 'info' } : { label: 'Waiting: no room beyond the box', tone: 'info' }) : null;
      };
      S.result = () => {
        const e = entryFor('box', v);
        if (!e) return { ok: false, why: 'You did not reach the box junction.' };
        if (e.blocked && e.stopped) return { ok: false, why: 'You went into the box with no room beyond it and had to stop inside, blocking the junction. Wait at the line until there is room for your whole car on the other side (Rule 174).' };
        if (e.blocked) return { ok: false, why: 'You went into the box before there was room beyond it. The queue moved off in time, but you may only enter once your exit is already clear (Rule 174).' };
        if (e.stopped) return { ok: false, why: 'You stopped in the box. Cross it in one go once there is room beyond it.' };
        return { ok: true, why: e.waitedBlocked >= 1 ? `You waited ${Math.round(e.waitedBlocked)} s at the line while the road beyond the box was blocked, then crossed it without stopping.` : 'You crossed the box without stopping, with room beyond it.' };
      };
      S.stop = ((stop) => () => { Q?.release(); test.alert = null; stop(); })(S.stop);
    } else {
      // oncoming traffic: a stream coming the other way through the box as the learner reaches it
      const appr = R.steps[k], oncoming = net.inc[v].find(o => o.e !== appr.e && o.e !== out.e && o.e.way.name === appr.e.way.name);
      let sent = false;
      S.update = () => {
        if (sent || !oncoming) return;
        const d = toArea(A); if (d > 40) return;
        sent = true;
        // five cars close together (a second apart) at about 20 mph, sent from out of sight as the learner comes within 40 m, so
        // they come through the junction while the learner is at the turning point and there is a gap to wait for
        const arrive = { e: oncoming.e, dir: -oncoming.dir }, path = [arrive, ...R.steps.slice(0, k + 1).reverse().map(st => ({ e: st.e, dir: -st.dir }))];
        spare(5).forEach((c, i) => { const p = upstream(net, arrive, 60 + i * 10); traffic.placeCar(c, p.e, p.dir, p.s, 9, 0.7, [...p.path, ...path.slice(1)]); });
      };
      S.result = () => {
        const e = entryFor('box', v);
        if (!e) return { ok: false, why: 'You did not reach the box junction.' };
        if (e.blocked && e.stopped) return { ok: false, why: 'You stopped in the box with your exit blocked (Rule 174).' };
        if (e.rightTurn) return { ok: true, why: 'You waited in the box for the oncoming traffic with your exit clear, which Rule 174 allows, then turned.' };
        return { ok: true, why: e.waited >= 1 ? `You waited ${Math.round(e.waited)} s at the line for the oncoming traffic. With your exit clear you could have moved forward into the box to wait.` : 'You turned right through the box without needing to stop.' };
      };
    }
    return S;
  }

  // KEEP CLEAR: a queue starting just past the markings; once the learner has stopped short of them, a car
  // turns right out of Orchard Way into the gap they left
  const K = (net.keepClear || [])[0]; if (!K) return S;
  const A = keepArea(K, 0), v = K.dir > 0 ? K.e.b : K.e.a;
  const k = R.steps.findIndex((st, i) => i < R.steps.length - 1 && endNode(st) === v); if (k < 0) return S;
  const out = R.steps[k + 1], side = net.inc[v].find(o => o.e !== R.steps[k].e && o.e !== out.e);
  let Q = null, waited = 0, onIt = 0, released = false, started = null, gapAt = null, sideCar = null, cameOut = false;
  S.update = (dt) => {
    if (!Q) Q = queue(out, A.hl + 1 + CAR_HALF, 4);
    const d = toArea(A);
    if (started == null && d < 80) started = traffic.clock;
    if (still() && d > -0.3 && d < 15) { waited += dt; if (gapAt == null) gapAt = +d.toFixed(1); }
    if (still() && d <= -0.3) onIt += dt;
    // the payoff for leaving the gap: someone turns out of the side road into it
    if (!sideCar && side && gapAt != null && waited > 1) {
      sideCar = spare(1)[0];
      if (sideCar) { const arrive = { e: side.e, dir: -side.dir }, p = upstream(net, arrive, 22); traffic.placeCar(sideCar, p.e, p.dir, p.s, 5, 1, [...p.path, out]); }
    }
    if (sideCar && !cameOut && sideCar.e === out.e && Math.hypot(sideCar.x - A.x, sideCar.z - A.z) < A.hl + 3) cameOut = true;
    if (!released && ((waited >= 5 && (cameOut || waited >= 10)) || onIt >= 4 || (started != null && traffic.clock - started > 45))) { released = true; Q.release(); }
  };
  S.result = () => {
    const e = entryFor('keep');
    if (!e) return { ok: false, why: 'You did not reach the KEEP CLEAR markings.' };
    if (e.stopped && test.faults.some(f => f.key === 'keep0')) return { ok: false, why: 'You stopped on the KEEP CLEAR markings, blocking Orchard Way. Stop short of them, even when the queue moves up.' };
    if (gapAt == null) return { ok: true, why: 'You kept the markings clear.' };
    return { ok: true, why: `You stopped ${Math.max(0, gapAt).toFixed(1)} m short of the KEEP CLEAR and waited ${Math.round(waited)} s${cameOut ? ', and a car turned out of Orchard Way into the gap you left' : ''}.` };
  };
  S.stop = ((stop) => () => { Q?.release(); stop(); })(S.stop);
  return S;
}
// direction of travel at the start of a step, as [fx, fz]
function dirOf(st) {
  const e = st.e, i = st.dir > 0 ? 0 : e.n - 1, j = st.dir > 0 ? 1 : e.n - 2, L = Math.hypot(e.px[j] - e.px[i], e.pz[j] - e.pz[i]) || 1;
  return [(e.px[j] - e.px[i]) / L, (e.pz[j] - e.pz[i]) / L];
}
// `d` metres back from the end of step `st` (arriving at its node), along the same road: where to put a
// vehicle, and the steps it then follows to arrive
function upstream(net, st, d) {
  const path = [st]; let cur = st;
  while (d > cur.e.len - 1) {
    const v = startNode(cur), prev = net.inc[v].find(o => o.e !== cur.e && o.e.way.name === cur.e.way.name);
    if (!prev) { d = cur.e.len - 1; break; }
    d -= cur.e.len; cur = { e: prev.e, dir: -prev.dir }; path.unshift(cur);
  }
  return { e: cur.e, dir: cur.dir, s: cur.e.len - d, path };
}
