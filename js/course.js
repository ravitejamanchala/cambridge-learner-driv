// The learner course: units of short lessons on real Cambridge roads, each with a goal,
// a Highway Code rule, an optional scripted event, and its own pass check.
const wp = (lat, lon, road) => ({ lat, lon, road });

export const UNITS = [
  { id: 'basics', title: 'Getting started' },
  { id: 'junctions', title: 'Junctions and traffic lights' },
  { id: 'roundabouts', title: 'Roundabouts' },
  { id: 'sharing', title: 'Sharing the road' }
];

// focus: fault categories (prefix match) that fail the lesson even once. maxD: driving faults allowed overall.
export const LESSONS = [
  { id: 'move-off', unit: 'basics', title: 'Moving off and stopping', road: 'Gresham Road · 20 mph',
    goal: 'Pull away safely, keep to the left at 20 mph, then pull up on the left at the end.',
    steps: ['Check mirrors and signal before you pull away', 'Keep about a metre from the kerb, never over the centre line', 'Slow gently and stop close to the left kerb when asked'],
    rule: { n: 'Rule 160', t: 'Keep to the left unless road signs or markings indicate otherwise.' },
    waypoints: [wp(52.2002, 0.12939, 'Gresham Road'), wp(52.1981, 0.13269, 'Gresham Road')], focus: ['Positioning', 'Control'], maxD: 2 },
  { id: 'speed', unit: 'basics', title: 'Speed limits', road: 'Histon Road · 30 then 20 mph',
    goal: 'Hold the limit. It drops from 30 to 20 mph partway along: slow down before you pass the signs.',
    steps: ['Watch for the red-ring signs and the painted 20 roundel', 'Ease off early so you are at 20 when you pass the sign', 'A limit is a maximum, not a target'],
    rule: { n: 'Rule 124', t: 'You must not exceed the maximum speed limit for the road.' },
    waypoints: [wp(52.2250, 0.1120, 'Histon Road'), wp(52.2160, 0.1158, 'Histon Road')], focus: ['Use of speed'], maxD: 2 },
  { id: 'estop', unit: 'basics', title: 'Emergency stop', road: 'Long Road · 30 mph',
    goal: 'Drive normally. When the examiner shouts STOP, brake firmly and stop as quickly and safely as you can.',
    steps: ['Keep both hands on the wheel', 'Brake promptly and firmly; do not signal', 'When stopped, check all round before moving off again'],
    rule: { n: 'Rule 126', t: 'Leave enough space between you and the vehicle in front so that you can pull up safely if it suddenly slows down or stops.' },
    waypoints: [wp(52.1810, 0.1320, 'Long Road'), wp(52.1828, 0.1222, 'Long Road')], scenario: 'estop', focus: [], maxD: 2 },

  { id: 'turn-left', unit: 'junctions', title: 'Turning left into a side road', road: 'Cherry Hinton Road → Neville Road',
    goal: 'Signal left in good time, slow down, check for cyclists on your left, then turn into Neville Road.',
    steps: ['Mirrors, signal left, then position near the left', 'Slow to walking pace for the turn', 'Watch for cyclists and pedestrians crossing the side road'],
    rule: { n: 'Rule 182', t: 'Use your mirrors and give a left-turn signal well before you turn left. Do not overtake just before you turn left.' },
    waypoints: [wp(52.18773, 0.14661, 'Cherry Hinton Road'), wp(52.1897, 0.15015, 'Neville Road')], focus: ['Signals', 'Junctions'], maxD: 2 },
  { id: 'turn-right', unit: 'junctions', title: 'Turning right into a side road', road: 'Cherry Hinton Road → Neville Road',
    goal: 'Signal right, position just left of the centre line, wait for a gap in oncoming traffic, then turn.',
    steps: ['Mirrors, signal right, move to just left of the centre', 'Give way to oncoming traffic', 'Do not cut the corner'],
    rule: { n: 'Rule 179', t: 'Well before you turn right, use your mirrors, give a right-turn signal and take up a position just left of the middle of the road.' },
    waypoints: [wp(52.18688, 0.15214, 'Cherry Hinton Road'), wp(52.1897, 0.15015, 'Neville Road')], focus: ['Signals', 'Junctions'], maxD: 2 },
  { id: 'lights', unit: 'junctions', title: 'Traffic lights', road: 'Lensfield Road → Gonville Place',
    goal: 'Go straight on at the Hills Road lights. Stop at the white line on red, and go only on green.',
    steps: ['Read the light early', 'Red and red-and-amber both mean stop', 'Stop behind the white line, not on it'],
    rule: { n: 'Rule 175', t: 'You must stop behind the white stop line across your side of the road unless the light is green.' },
    waypoints: [wp(52.1984, 0.1236, 'Lensfield Road'), wp(52.2010, 0.1294, 'Gonville Place')], focus: ['Response to signals'], maxD: 2 },
  { id: 'amber', unit: 'junctions', title: 'Stopping at amber', road: 'Lensfield Road → Gonville Place',
    goal: 'The light will change to amber as you approach. You have room to stop, so stop at the line and wait for green.',
    steps: ['Approach at a speed that lets you stop', 'Amber means stop unless you have crossed the line or it is unsafe to stop', 'Wait through red and red-and-amber; go on green'],
    rule: { n: 'Rule 175', t: 'Amber also means stop at the stop line. You may go on only if the amber appears after you have crossed the stop line or are so close that pulling up might cause an accident.' },
    waypoints: [wp(52.1984, 0.1236, 'Lensfield Road'), wp(52.2010, 0.1294, 'Gonville Place')], scenario: 'amber', focus: ['Response to signals'], maxD: 2 },

  { id: 'mini', unit: 'roundabouts', title: 'Mini-roundabout', road: "Queen's Road → Madingley Road",
    goal: 'Give way to traffic from the right, then turn left at the mini-roundabout onto Madingley Road.',
    steps: ['Slow down early; mini-roundabouts come up quickly', 'Give way to anything coming from your right', 'Go round the painted circle, not over it'],
    rule: { n: 'Rule 188', t: 'Approach mini-roundabouts in the same way as normal roundabouts. All vehicles must pass round the central markings.' },
    waypoints: [wp(52.2060, 0.1125, "Queen's Road"), wp(52.2108, 0.1080, 'Madingley Road')], focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'rb-left', unit: 'roundabouts', title: 'Roundabout: turning left (1st exit)', road: 'Perne Road roundabout',
    goal: 'Signal left on approach, stay in the left lane, give way to the right, and take the 1st exit.',
    steps: ['Signal left as you approach', 'Left-hand lane, give way to traffic from the right', 'Keep the left signal on as you leave'],
    rule: { n: 'Rule 186', t: 'When taking the first exit, unless signs or markings indicate otherwise: signal left and approach in the left-hand lane; keep to the left on the roundabout.' },
    waypoints: [wp(52.1880, 0.1530, 'Perne Road'), wp(52.1928, 0.1495, 'Radegund Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-ahead', unit: 'roundabouts', title: 'Roundabout: going ahead (2nd exit)', road: 'Perne Road roundabout',
    goal: 'No signal on approach. Give way to the right, then signal left after the exit before yours and leave at the 2nd exit.',
    steps: ['No signal on approach', 'Left lane unless markings say otherwise', 'Signal left as you pass the exit before yours'],
    rule: { n: 'Rule 186', t: 'When going straight ahead, select the appropriate lane, stay in that lane on the roundabout, and signal left after you have passed the exit before the one you want.' },
    waypoints: [wp(52.1880, 0.1530, 'Perne Road'), wp(52.1950, 0.1555, 'Perne Road')], focus: ['Junctions', 'Positioning'], maxD: 2 },
  { id: 'rb-right', unit: 'roundabouts', title: 'Roundabout: turning right (3rd exit)', road: 'Perne Road roundabout',
    goal: 'Signal right, approach in the right-hand lane, keep right on the roundabout, and take the 3rd exit.',
    steps: ['Signal right and use the right-hand lane', 'Give way to traffic from the right', 'Change to a left signal after the exit before yours'],
    rule: { n: 'Rule 186', t: 'When taking an exit to the right: signal right and approach in the right-hand lane; keep to the right on the roundabout until you need to change lanes to exit.' },
    waypoints: [wp(52.1880, 0.1530, 'Perne Road'), wp(52.1918, 0.1570, 'Birdwood Road')], focus: ['Junctions', 'Positioning'], maxD: 2 },

  { id: 'zebra', unit: 'sharing', title: 'Zebra crossings', road: "Queen's Road · 30 mph",
    goal: 'Someone will step onto the zebra crossing ahead. Slow down, stop before the crossing and let them cross.',
    steps: ['Look for flashing Belisha beacons', 'Slow down and be ready to stop for anyone waiting', 'Once someone is on the crossing you must give way'],
    rule: { n: 'Rule 195', t: 'As you approach a zebra crossing, look out for pedestrians waiting to cross and be ready to slow down or stop. You must give way when someone has moved onto a crossing.' },
    waypoints: [wp(52.2040, 0.1135, "Queen's Road"), wp(52.2095, 0.1112, "Queen's Road")], scenario: 'zebra', focus: ['Pedestrian crossings'], maxD: 2 },
  { id: 'cyclists', unit: 'sharing', title: 'Passing cyclists', road: 'Huntingdon Road · cycle lanes',
    goal: 'A cyclist is riding ahead of you. Stay out of the cycle lane and only overtake with at least 1.5 m clearance.',
    steps: ['Hang back if there is no room to pass', 'Leave at least 1.5 m at up to 30 mph', 'Do not drive in a mandatory cycle lane'],
    rule: { n: 'Rule 163', t: 'Give motorcyclists, cyclists, horse riders and horse drawn vehicles at least as much room as you would when overtaking a car; at least 1.5 metres at speeds under 30 mph.' },
    waypoints: [wp(52.2145, 0.1085, 'Huntingdon Road'), wp(52.2190, 0.1000, 'Huntingdon Road')], scenario: 'cyclist', focus: ['Clearance', 'Control – collision', 'Positioning – lane'], maxD: 2 }
];

// ---------- scripted events ----------
// deps: { net, traffic, test, player, ui: { banner(text|null, kind) } }
export function createScenario(lesson, deps) {
  const { net, traffic, test, player, ui } = deps;
  const S = { ok: true, notes: [], update() {}, stop() {} };
  const route = () => test.route;
  // first feature on the route (stop line or zebra), with its distance along the route
  function firstOnRoute(listByEdge, minS) {
    const R = route();
    for (let k = 0; k < R.steps.length; k++) {
      const st = R.steps[k], list = listByEdge.get(st.e.id); if (!list) continue;
      for (const f of list) {
        if (f.dir !== undefined && listByEdge === net.stopsByEdge && f.dir !== st.dir) continue;
        const ts = st.dir > 0 ? f.s : st.e.len - f.s, rs = R.stepS[k] + ts;
        if (rs >= minS) return { f, rs };
      }
    }
    return null;
  }

  if (lesson.scenario === 'amber') {
    const hit = firstOnRoute(net.stopsByEdge, 60);
    if (hit) {
      const st = hit.f; let fired = false, stoppedOnRed = false;
      traffic.overrides.set(st.cluster, { group: st.group, t0: Infinity }); // hold green until the trigger
      S.notes.push('The light was held on green, then changed to amber as you approached.');
      S.update = () => {
        const ahead = hit.rs - test.sRoute, v = player.v;
        const trig = Math.max(28, Math.min(55, v * v / (2 * 3.5) + 14));
        if (!fired && ahead < trig && ahead > 8 && v > 3) { fired = true; traffic.overrides.get(st.cluster).t0 = traffic.clock; }
        const L = traffic.lightState(st);
        if (fired && (L === 'R' || L === 'RA' || L === 'A') && Math.abs(v) < 0.3 && ahead > -1 && ahead < 25) stoppedOnRed = true;
      };
      S.result = () => {
        if (!fired) return { ok: false, why: 'The light never changed because you did not reach it. Drive the whole route.' };
        if (!stoppedOnRed) return { ok: false, why: 'You did not stop at the line after the light turned amber.' };
        return { ok: true, why: 'You stopped at the line on amber and waited for green.' };
      };
      S.stop = () => traffic.overrides.delete(st.cluster);
    }
  }
  if (lesson.scenario === 'zebra') {
    const hit = firstOnRoute(net.zebrasByEdge, 40);
    if (hit) {
      const z = hit.f; let fired = false, stoppedFor = false;
      z.ped.state = 'idle'; z.ped.t = 1e9; // nobody crosses until we say so
      S.update = () => {
        const ahead = hit.rs - test.sRoute;
        if (!fired && ahead < 45 && ahead > 10) { fired = true; z.ped.state = 'wait'; z.ped.t = 1.0; z.ped.p = 0; z.ped.dir = 1; }
        if (fired && z.ped.state !== 'idle' && Math.abs(player.v) < 0.5 && ahead > -1 && ahead < 25) stoppedFor = true;
        if (fired && z.ped.state === 'idle' && z.ped.t > 100) z.ped.t = 6;
      };
      S.result = () => !fired ? { ok: false, why: 'You did not reach the crossing.' }
        : stoppedFor ? { ok: true, why: 'You stopped and let the pedestrian cross.' } : { ok: false, why: 'You did not stop for the pedestrian on the crossing.' };
      S.stop = () => { z.ped.t = 4; };
    }
  }
  if (lesson.scenario === 'cyclist') {
    const R = route(); let placed = false;
    S.update = () => {
      if (placed || !traffic.bikes.length) return;
      // put a cyclist 55 m ahead on the route, riding the same way
      let s = test.sRoute + 55, k = 0; while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
      const st = R.steps[k]; traffic.placeBike(traffic.bikes[0], st.e, st.dir, Math.min(st.e.len - 2, s - R.stepS[k]), 4.4);
      placed = true;
    };
    S.result = () => ({ ok: true, why: '' });
  }
  if (lesson.scenario === 'estop') {
    let state = 'wait', t0 = 0, react = null, stopT = null;
    S.update = (dt, clock) => {
      if (state === 'wait' && test.sRoute > 180 && player.v > 6.5) { state = 'go'; t0 = clock; ui.banner('STOP!', 'stop'); }
      if (state === 'go') {
        if (react === null && player.inp && player.inp.brake > 0.05) react = clock - t0;
        if (Math.abs(player.v) < 0.3) { stopT = clock - t0; state = 'done'; ui.banner('Thank you. Move off when it is safe.', 'info'); setTimeout(() => ui.banner(null), 3500); }
      }
    };
    S.result = () => {
      if (state === 'wait') return { ok: false, why: 'The emergency stop did not happen. Drive at a normal speed (over about 15 mph).' };
      if (react === null || react > 1.5) return { ok: false, why: `You took ${react === null ? 'too long' : react.toFixed(1) + ' s'} to start braking. Aim for under 1.5 s.` };
      return { ok: true, why: `Reaction ${react.toFixed(1)} s, stopped in ${stopT.toFixed(1)} s.` };
    };
    S.stop = () => ui.banner(null);
  }
  return S;
}

export function evaluate(lesson, test, scen) {
  const reasons = [];
  const focus = test.faults.filter(f => (lesson.focus || []).some(p => f.cat.startsWith(p)));
  let pass = true;
  if (test.S > 0) { pass = false; reasons.push(`${test.S} serious fault${test.S > 1 ? 's' : ''}.`); }
  if (focus.length) { pass = false; reasons.push(`This lesson is about: ${[...new Set(focus.map(f => f.cat))].join(', ')}. ${focus[0].text}.`); }
  if (test.D > (lesson.maxD ?? 2)) { pass = false; reasons.push(`${test.D} driving faults; this lesson allows ${lesson.maxD ?? 2}.`); }
  const r = scen && scen.result ? scen.result() : null;
  if (r) { if (!r.ok) pass = false; if (r.why) reasons.push(r.why); }
  if (pass && !reasons.length) reasons.push('Clean drive with no faults in this lesson’s focus area.');
  return { pass, reasons };
}
