import { along } from './net.js';
import { QUIZZES } from './quiz.js';
// The learner course: units of short lessons on real Cambridge roads, each with a goal,
// a Highway Code rule, an optional scripted event, and its own pass check.
const wp = (lat, lon, road) => ({ lat, lon, road });

export const UNITS = [
  { id: 'basics', title: 'Getting started' },
  { id: 'junctions', title: 'Junctions and traffic lights' },
  { id: 'roundabouts', title: 'Roundabouts' },
  { id: 'sharing', title: 'Sharing the road' },
  { id: 'faster', title: 'Faster roads' },
  { id: 'theory', title: 'Theory and show me, tell me' }
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
    rule: { n: 'Rule 175', t: 'Amber also means stop at the stop line. You may go on only if the amber appears after you have crossed the stop line or are so close that pulling up might cause a collision.' },
    waypoints: [wp(52.1984, 0.1236, 'Lensfield Road'), wp(52.2010, 0.1294, 'Gonville Place')], scenario: 'amber', focus: ['Response to signals'], maxD: 2 },

  { id: 'emerge-left', unit: 'junctions', title: 'Emerging left from a side road', road: 'Herbert Street → Milton Road',
    goal: 'At the end of Herbert Street, give way to traffic on Milton Road, then turn left when there is a safe gap. A car will be coming from your right.',
    steps: ['Signal left and slow down early', 'Creep up to the give-way line and look right, left, right', 'Only pull out when the gap is big enough that nobody has to slow down for you'],
    rule: { n: 'Rule 170', t: 'Watch out for traffic coming from either direction, and do not join a road until there is a gap large enough for you to do so safely.' },
    waypoints: [wp(52.21594, 0.12764, 'Herbert Street'), wp(52.2168, 0.12675, 'Milton Road')], scenario: 'yield', yieldAny: true, focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'emerge-right', unit: 'junctions', title: 'Emerging right from a side road', road: 'Hurst Park Avenue → Milton Road',
    goal: 'Turn right out of Hurst Park Avenue onto busy Milton Road. You need a gap in both directions.',
    steps: ['Signal right, position just left of the middle of your road', 'Give way at the line; look right, left, right', 'Go when both lanes are clear, and do not cut the corner'],
    rule: { n: 'Rule 172', t: 'The approach to a junction may have a give-way sign or a triangle marked on the road. You must give way to traffic on the main road when emerging from a junction with broken white lines across the road.' },
    waypoints: [wp(52.22117, 0.12697, 'Hurst Park Avenue'), wp(52.2168, 0.12675, 'Milton Road')], scenario: 'yield', yieldAny: true, focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'right-lights', unit: 'junctions', title: 'Turning right at traffic lights', road: 'Lensfield Road → Hills Road',
    goal: 'Turn right at the Catholic Church lights. Get in the right lane, go on green, and give way to oncoming traffic before you turn.',
    steps: ['Mirrors, signal right, and move into the right-hand lane early', 'On green, move forward to the turning point if it is clear', 'Wait for a safe gap in oncoming traffic, then turn'],
    rule: { n: 'Rule 180', t: 'Wait until there is a safe gap between you and any oncoming vehicle. Watch out for cyclists, motorcyclists and pedestrians.' },
    waypoints: [wp(52.1981, 0.12381, 'Lensfield Road'), wp(52.19611, 0.13027, 'Hills Road')], focus: ['Response to signals', 'Signals', 'Junctions'], maxD: 2 },

  { id: 'mini', unit: 'roundabouts', title: 'Mini-roundabout', road: "Queen's Road → Madingley Road",
    goal: 'Give way to traffic from the right, then turn left at the mini-roundabout onto Madingley Road.',
    steps: ['Slow down early; mini-roundabouts come up quickly', 'Give way to anything coming from your right', 'Go round the painted circle, not over it'],
    rule: { n: 'Rule 188', t: 'Approach mini-roundabouts in the same way as normal roundabouts. All vehicles must pass round the central markings.' },
    waypoints: [wp(52.2060, 0.1125, "Queen's Road"), wp(52.2108, 0.1080, 'Madingley Road')], focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'rb-left', unit: 'roundabouts', title: 'Roundabout: turning left (1st exit)', road: 'Perne Road roundabout',
    goal: 'Signal left on approach, stay in the left lane, give way to the right, and take the 1st exit.',
    steps: ['Signal left as you approach', 'Left-hand lane, give way to traffic from the right', 'Keep the left signal on as you leave'],
    rule: { n: 'Rule 186', t: 'When taking the first exit, unless signs or markings indicate otherwise: signal left and approach in the left-hand lane; keep to the left on the roundabout.' },
    waypoints: [wp(52.18985, 0.15368, 'Perne Road'), wp(52.1928, 0.1495, 'Radegund Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-ahead', unit: 'roundabouts', title: 'Roundabout: going ahead (2nd exit)', road: 'Perne Road roundabout',
    goal: 'No signal on approach. Give way to the right, then signal left after the exit before yours and leave at the 2nd exit.',
    steps: ['No signal on approach', 'Left lane unless markings say otherwise', 'Signal left as you pass the exit before yours'],
    rule: { n: 'Rule 186', t: 'When going straight ahead, select the appropriate lane, stay in that lane on the roundabout, and signal left after you have passed the exit before the one you want.' },
    waypoints: [wp(52.18985, 0.15368, 'Perne Road'), wp(52.1950, 0.1555, 'Perne Road')], focus: ['Junctions', 'Positioning'], maxD: 2 },
  { id: 'rb-right', unit: 'roundabouts', title: 'Roundabout: turning right (3rd exit)', road: 'Perne Road roundabout',
    goal: 'Signal right, approach in the right-hand lane, keep right on the roundabout, and take the 3rd exit.',
    steps: ['Signal right and use the right-hand lane', 'Give way to traffic from the right', 'Change to a left signal after the exit before yours'],
    rule: { n: 'Rule 186', t: 'When taking an exit to the right: signal right and approach in the right-hand lane; keep to the right on the roundabout until you need to change lanes to exit.' },
    waypoints: [wp(52.18985, 0.15368, 'Perne Road'), wp(52.1918, 0.1570, 'Birdwood Road')], focus: ['Junctions', 'Positioning'], maxD: 2 },

  { id: 'rb-big', unit: 'roundabouts', title: 'Big roundabout: right-hand lane', road: 'Elizabeth Way → High Street, Chesterton',
    goal: 'A two-lane roundabout at the end of Elizabeth Way bridge. Right-hand lane, 3rd exit, and keep your lane all the way round.',
    steps: ['Right-hand lane on the approach, signal right', 'Give way to traffic from the right; watch for cyclists', 'Signal left after the 2nd exit and leave without cutting across the lane'],
    rule: { n: 'Rule 186', t: 'Signal right and approach in the right-hand lane; keep to the right on the roundabout until you need to change lanes to exit.' },
    waypoints: [wp(52.21383, 0.13653, 'Elizabeth Way'), wp(52.21728, 0.13868, 'High Street')], focus: ['Junctions', 'Positioning'], maxD: 2 },

  { id: 'zebra', unit: 'sharing', title: 'Zebra crossings', road: "Queen's Road · 30 mph",
    goal: 'Someone will step onto the zebra crossing ahead. Slow down, stop before the crossing and let them cross.',
    steps: ['Look for flashing Belisha beacons', 'Slow down and be ready to stop for anyone waiting', 'Once someone is on the crossing you must give way'],
    rule: { n: 'Rule 195', t: 'Look out for pedestrians waiting to cross and be ready to slow down or stop. You should give way to people waiting to cross, and you must give way once someone has moved onto the crossing.' },
    waypoints: [wp(52.2040, 0.1135, "Queen's Road"), wp(52.2095, 0.1112, "Queen's Road")], scenario: 'zebra', focus: ['Pedestrian crossings'], maxD: 2 },
  { id: 'cyclists', unit: 'sharing', title: 'Passing cyclists', road: 'Huntingdon Road · cycle lanes',
    goal: 'A cyclist is riding ahead of you. Stay out of the cycle lane and only overtake with at least 1.5 m clearance.',
    steps: ['Hang back if there is no room to pass', 'Leave at least 1.5 m at up to 30 mph', 'Do not drive in a mandatory cycle lane'],
    rule: { n: 'Rule 163', t: 'Give cyclists at least as much room as you would a car when overtaking. As a guide, leave at least 1.5 metres at speeds up to 30 mph, and more at higher speeds.' },
    waypoints: [wp(52.2145, 0.1085, 'Huntingdon Road'), wp(52.2190, 0.1000, 'Huntingdon Road')], scenario: 'cyclist', focus: ['Clearance', 'Control – collision', 'Positioning – lane'], maxD: 2 },
  { id: 'ped-crossing', unit: 'sharing', title: 'Pedestrian light crossing', road: 'Hills Road · puffin crossings',
    goal: 'Someone presses the button as you approach. The light will turn red: stop at the line and wait until it is green again.',
    steps: ['Watch for people waiting at the crossing', 'Stop at the white line on red', 'Do not wave pedestrians across, and go only on green'],
    rule: { n: 'Rule 199', t: 'Puffin crossings have no flashing amber: the lights follow the same sequence as traffic lights. You must stop at the line on red and wait for green.' },
    waypoints: [wp(52.19338, 0.13292, 'Hills Road'), wp(52.19819, 0.12839, 'Hills Road')], scenario: 'crossing', focus: ['Response to signals'], maxD: 2 },
  { id: 'cycle-left', unit: 'sharing', title: 'Turning left across a cycle lane', road: 'Histon Road → Linden Close',
    goal: 'Histon Road has a cycle lane. A cyclist is riding in it: let them go past before you turn left across the lane.',
    steps: ['Check your left mirror and blind spot before signalling', 'Do not overtake a cyclist just before you turn left', 'Wait for them to pass the side road, then turn'],
    rule: { n: 'Rule 183 and H3', t: 'When turning, give way to vehicles using a cycle lane, cycle track or bus lane from either direction (Rule 183). Do not cut across cyclists going ahead when you turn into or out of a junction (H3).' },
    waypoints: [wp(52.221, 0.112, 'Histon Road'), wp(52.21742, 0.11341, 'Linden Close')], scenario: 'cyclist', focus: ['Clearance', 'Control – collision', 'Signals'], maxD: 2 },

  { id: 'follow', unit: 'faster', title: 'Two-second rule', road: 'Madingley Road · 30–40 mph',
    goal: 'Follow the car in front all the way along Madingley Road. Keep at least a two-second gap; more in the wet.',
    steps: ['Pick a fixed point; when the car ahead passes it, say "only a fool breaks the two-second rule"', 'If you pass the point before you finish, drop back', 'Never sit close behind to make someone speed up'],
    rule: { n: 'Rule 126', t: 'Allow at least a two-second gap between you and the vehicle in front on high-speed roads and in tunnels. The gap should be at least doubled on wet roads.' },
    waypoints: [wp(52.21353, 0.08511, 'Madingley Road'), wp(52.21137, 0.10342, 'Madingley Road')], scenario: 'follow', focus: ['Use of speed'], maxD: 2 },
  { id: 'country', unit: 'faster', title: 'Country road at 60', road: 'Grantchester Road · national limit',
    goal: 'A narrow country road where the national speed limit (60 mph) applies. 60 is the most you may do, not a speed to aim for: slow for bends you cannot see round.',
    steps: ['The white sign with a black stripe means 60 on a road like this', 'Slow down before bends, not in them', 'Keep left: oncoming traffic may be close to the middle'],
    rule: { n: 'Rule 154', t: 'Take extra care on country roads and reduce your speed at approaches to bends, which can be sharper than they appear.' },
    waypoints: [wp(52.19182, 0.09958, 'Grantchester Road'), wp(52.18441, 0.09499, 'Grantchester Road')], focus: ['Use of speed', 'Positioning'], maxD: 2 },
  { id: 'dual', unit: 'faster', title: 'Dual carriageway at 70', road: 'Babraham Road · dual carriageway',
    goal: 'Build up to a safe speed and stay in the left-hand lane. Use the right-hand lane only to overtake, then move back.',
    steps: ['Get up to the speed of the traffic, up to the 70 mph limit', 'Keep left unless overtaking', 'Leave a two-second gap; check mirrors before changing lanes'],
    rule: { n: 'Rule 137', t: 'On a two-lane dual carriageway you should stay in the left-hand lane. Use the right-hand lane for overtaking or turning right.' },
    waypoints: [wp(52.15917, 0.17472, 'Babraham Road'), wp(52.15112, 0.18971, 'Babraham Road')], focus: ['Use of speed', 'Positioning'], maxD: 2 }
];
LESSONS.push(...QUIZZES); // theory modules: quizzes, no driving (see quiz.js)

// ---------- scripted events ----------
// deps: { net, traffic, test, player, ui: { banner(text|null, kind) } }
export function createScenario(lesson, deps) {
  const { net, traffic, test, player, ui } = deps;
  const S = { ok: true, notes: [], update() {}, stop() {} };
  const route = () => test.route;
  // first feature on the route (stop line or zebra), with its distance along the route
  function firstOnRoute(listByEdge, minS, ok) {
    const R = route();
    for (let k = 0; k < R.steps.length; k++) {
      const st = R.steps[k], list = listByEdge.get(st.e.id); if (!list) continue;
      for (const f of list) {
        if (ok && !ok(f)) continue;
        if (f.dir !== undefined && listByEdge === net.stopsByEdge && f.dir !== st.dir) continue;
        const ts = st.dir > 0 ? f.s : st.e.len - f.s, rs = R.stepS[k] + ts;
        if (rs >= minS) return { f, rs };
      }
    }
    return null;
  }

  if (lesson.scenario === 'amber' || lesson.scenario === 'crossing') {
    const hit = firstOnRoute(net.stopsByEdge, 60, lesson.scenario === 'crossing' ? (f => f.single) : null);
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
        if (!stoppedOnRed) return { ok: false, why: lesson.scenario === 'crossing' ? 'You did not stop at the crossing when the light changed.' : 'You did not stop at the line after the light turned amber.' };
        return { ok: true, why: lesson.scenario === 'crossing' ? 'You stopped at the crossing and waited for green.' : 'You stopped at the line on amber and waited for green.' };
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
    // turn lessons wait until the learner is near the turn, so the cyclist is beside them as they get there
    const turn = lesson.id === 'cycle-left' ? R.instructions.find(i => i.kind === 'left') : null;
    let bike = null, hooked = false, judged = false;
    S.update = () => {
      // left hook: as the learner reaches the turn, was the cyclist alongside or just behind them?
      if (turn && bike && !judged && test.sRoute >= turn.s - 2) {
        judged = true;
        const fx = -Math.sin(player.th), fz = -Math.cos(player.th), dx = bike.x - player.x, dz = bike.z - player.z, fw = dx * fx + dz * fz;
        if (bike.alive && fw > -14 && fw < 4 && Math.abs(dx * fz - dz * fx) < 4 && Math.abs(player.v) > 0.5) hooked = true;
      }
      if (placed || !traffic.bikes.length) return;
      if (turn && turn.s - test.sRoute > 95) return;
      // put a cyclist ahead on the route, riding the same way
      let s = test.sRoute + (turn ? 24 : 55), k = 0; while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
      const st = R.steps[k]; bike = traffic.bikes[0]; traffic.placeBike(bike, st.e, st.dir, Math.min(st.e.len - 2, s - R.stepS[k]), 4.4);
      placed = true;
    };
    S.result = () => !placed ? { ok: false, why: 'The cyclist never appeared: drive the whole route.' }
      : hooked ? { ok: false, why: 'You turned left across the cyclist. Wait for them to pass the junction first (H3).' }
      : { ok: true, why: turn ? 'You let the cyclist go before turning.' : '' };
  }
  // puzzles: send a car (or cyclist) at the junction from the learner's right, timed to arrive with them
  if (lesson.scenario === 'yield') {
    const R = route(), js = R.instructions.filter(i => i.node !== undefined && i.approach && (i.kind === 'rb' || i.mini || i.double || lesson.yieldAny));
    const ins = js[lesson.yieldAt || 0]; let placed = false, sent = false;
    if (ins) S.update = () => {
      if (placed) return;
      const ahead = ins.s - test.sRoute; if (ahead > 48 || ahead < 14) return;
      placed = true;
      const v = ins.node, x = net.nx[v], z = net.nz[v], a = ins.approach, t = along(a.e, a.e.len - 1, a.dir), rx = -t.tz, rz = t.tx;
      let best = null, bs = 0.2;
      for (const o of net.inc[v]) {
        const arr = -o.dir; if (o.e === a.e || (o.e.way.oneway && arr !== 1)) continue;
        if ((ins.kind === 'rb') !== o.e.way.rb) continue;
        const f = along(o.e, Math.max(0, o.e.len - 20), arr), dx = f.x - x, dz = f.z - z, L = Math.hypot(dx, dz) || 1, sc = (dx * rx + dz * rz) / L;
        if (sc > bs) { bs = sc; best = { e: o.e, dir: arr }; }
      }
      if (!best) return;
      const bike = lesson.yieldWith === 'bike', pool = (bike ? traffic.bikes : traffic.cars).slice();
      pool.sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
      const ag = pool[0]; if (!ag) return;
      const d = Math.min(best.e.len - 1, bike ? 18 : 26), tL = ahead / Math.max(player.v, 4);
      const speed = Math.max(bike ? 3 : 3.5, Math.min(bike ? 6 : 9, d / tL));
      (bike ? traffic.placeBike : traffic.placeCar)(ag, best.e, best.dir, best.e.len - d, speed); sent = true;
    };
    S.result = () => !placed ? { ok: false, why: 'You did not reach the junction.' } : { ok: true, why: sent ? '' : '' };
  }
  // two-second rule: a car drives ahead of the learner; time spent closer than 2 s fails the lesson
  if (lesson.scenario === 'follow') {
    let placed = false, close = 0, total = 0, lead = null;
    S.update = (dt) => {
      if (!placed && test.sRoute > 30) {
        const R = route(); let s = test.sRoute + 40, k = 0; while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
        const st = R.steps[k], pool = traffic.cars.slice().sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
        lead = pool[0]; if (lead) traffic.placeCar(lead, st.e, st.dir, Math.min(st.e.len - 2, s - R.stepS[k]), 8, 0.72, R.steps); placed = true; // lead car follows the route a bit under the limit, so you catch up
      }
      if (!lead || !lead.alive || player.v < 6) return;
      const fx = -Math.sin(player.th), fz = -Math.cos(player.th), dx = lead.x - player.x, dz = lead.z - player.z, fw = dx * fx + dz * fz;
      if (fw < 2 || fw > 80 || Math.abs(dx * fz - dz * fx) > 2.5) return;
      total += dt; if ((fw - 4.3) / player.v < 2) close += dt;
    };
    S.result = () => !placed ? { ok: false, why: 'The drive ended before the car ahead appeared.' }
      : close > 4 ? { ok: false, why: `You were closer than two seconds for ${Math.round(close)} s. Drop back further.` }
      : { ok: true, why: total > 5 ? 'You kept a safe two-second gap.' : '' };
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
  if (focus.length) { pass = false; reasons.push(`This drive is about: ${[...new Set(focus.map(f => f.cat))].join(', ')}. ${focus[0].text}.`); }
  if (test.D > (lesson.maxD ?? 2)) { pass = false; reasons.push(`${test.D} driving faults; this drive allows ${lesson.maxD ?? 2}.`); }
  const r = scen && scen.result ? scen.result() : null;
  if (r) { if (!r.ok) pass = false; if (r.why) reasons.push(r.why); }
  // always say what the faults were, not just how many
  const others = test.faults.filter(f => !focus.includes(f));
  if (others.length) reasons.push(`Also marked: ${others.slice(0, 4).map(f => `${f.text} (${f.kind === 'S' ? 'serious' : 'driving fault'})`).join('; ')}${others.length > 4 ? '; …' : ''}.`);
  if (pass && test.faults.length === 0 && !(r && r.why)) reasons.push('Clean drive: no faults recorded.');
  return { pass, reasons };
}
