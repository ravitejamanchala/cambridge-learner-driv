import { PARKING_LESSONS } from './parking-lessons.js';
import { createParkingScenario } from './parking-scenario.js';
import { along } from './net.js';
import { QUIZZES } from './quiz.js';
import { enrichLesson } from './curriculum.js';
import { BASIC_LESSONS } from './basic-lessons.js';
import { createControlScenario } from './control-scenarios.js';
import { createBasicScenario } from './basic-scenarios.js';
import { createEmergencyEvent } from './emergency.js';
// The learner course: units of short lessons on practice layouts built to teach one thing each
// (tools/layouts.mjs). Each has a goal, a Highway Code rule, an optional scripted event, and its own pass check.
// `area` names the practice layout; waypoints are x/z metres on it, snapped to the nearest junction on the named road.
const pt = (x, z, road) => ({ x, z, road });

export const UNITS = [
  { id: 'basics', title: 'Getting started' },
  { id: 'junctions', title: 'Junctions, lights and lanes' },
  { id: 'roundabouts', title: 'Roundabouts' },
  { id: 'sharing', title: 'Sharing the road' },
  { id: 'faster', title: 'Faster roads' },
  { id: 'parking', title: 'Manoeuvres and parking' },
  { id: 'theory', title: 'Theory and show me, tell me' }
];

// focus: fault categories (prefix match) that fail the lesson even once. maxD: driving faults allowed overall.
export const LESSONS = [
  { id: 'move-off', unit: 'basics', area: 'town', title: 'Moving off and stopping', road: 'Elm Road · 20 mph',
    goal: 'You are parked on the left. A car is coming up behind you: let it pass, then check your mirrors and blind spot, signal and move off. Pull up on the left at the end.',
    steps: ['Look round first: press B (or the eye button) to check mirrors and over your right shoulder', 'Let the car behind go past; signal right if anyone could benefit', 'Keep about a metre from the kerb; stop close to the left kerb when asked'],
    rule: { n: 'Rule 159', t: 'Before moving off you should use all mirrors to check the road is clear, look round to check the blind spots, and signal if necessary before moving out.' },
    waypoints: [pt(-640, 350, 'Elm Road'), pt(-330, 350, 'Elm Road')], scenario: 'moveoff', focus: ['Move off', 'Positioning', 'Control'], maxD: 2 },
  { id: 'speed', unit: 'basics', area: 'town', title: 'Speed limits', road: 'Bridge Street · 30 then 20 mph',
    goal: 'Hold the limit. It drops from 30 to 20 mph partway along: slow down before you pass the signs.',
    steps: ['Watch for the red-ring signs and the painted 20 roundel', 'Ease off early so you are at 20 when you pass the sign', 'A limit is a maximum, not a target'],
    rule: { n: 'Rule 124', t: 'You must not exceed the maximum speed limit for the road.' },
    waypoints: [pt(-250, 40, 'Bridge Street'), pt(-250, 540, 'Bridge Street')], focus: ['Use of speed'], maxD: 2 },
  { id: 'estop', unit: 'basics', area: 'town', title: 'Emergency stop', road: 'Moor Road · 30 mph',
    goal: 'Drive normally. When the examiner shouts STOP, brake firmly and stop as quickly and safely as you can. Then look round and move off again.',
    steps: ['Keep both hands on the wheel', 'Brake promptly and firmly; do not signal', 'When stopped, check all round (B) before moving off again'],
    rule: { n: 'Rule 126', t: 'Leave enough space between you and the vehicle in front so that you can pull up safely if it suddenly slows down or stops.' },
    waypoints: [pt(-640, 600, 'Moor Road'), pt(560, 600, 'Moor Road')], scenario: 'estop', focus: ['Move off'], maxD: 2 },

  { id: 'turn-left', unit: 'junctions', area: 'town', title: 'Turning left into a side road', road: 'High Street → Orchard Way',
    goal: 'Signal left in good time, slow down, check for cyclists on your left, then turn into Orchard Way.',
    steps: ['Mirrors, signal left, then position near the left', 'Slow to walking pace for the turn', 'Watch for cyclists and pedestrians crossing the side road'],
    rule: { n: 'Rule 182', t: 'Use your mirrors and give a left-turn signal well before you turn left. Do not overtake just before you turn left.' },
    waypoints: [pt(-180, 0, 'High Street'), pt(0, -220, 'Orchard Way')], focus: ['Signals', 'Junctions'], maxD: 2 },
  { id: 'turn-right', unit: 'junctions', area: 'town', title: 'Turning right into a side road', road: 'High Street → Orchard Way',
    goal: 'Signal right, position just left of the centre line, wait for a gap in oncoming traffic, then turn.',
    steps: ['Mirrors, signal right, move to just left of the centre', 'Give way to oncoming traffic', 'Do not cut the corner'],
    rule: { n: 'Rule 179', t: 'Well before you turn right, use your mirrors, give a right-turn signal and take up a position just left of the middle of the road.' },
    waypoints: [pt(200, 0, 'High Street'), pt(0, -220, 'Orchard Way')], focus: ['Signals', 'Junctions'], maxD: 2 },
  { id: 'lights', unit: 'junctions', area: 'town', title: 'Traffic lights', road: 'High Street · Bridge Street lights',
    goal: 'Go straight on at the Bridge Street lights. Stop at the white line on red, and go only on green.',
    steps: ['Read the light early', 'Red and red-and-amber both mean stop', 'Stop behind the white line, not on it'],
    rule: { n: 'Rule 175', t: 'You must stop behind the white stop line across your side of the road unless the light is green.' },
    waypoints: [pt(-640, 0, 'High Street'), pt(-80, 0, 'High Street')], focus: ['Response to signals'], maxD: 2 },
  { id: 'amber', unit: 'junctions', area: 'town', title: 'Stopping at amber', road: 'High Street · Bridge Street lights',
    goal: 'The light will change to amber as you approach. You have room to stop, so stop at the line and wait for green.',
    steps: ['Approach at a speed that lets you stop', 'Amber means stop unless you have crossed the line or it is unsafe to stop', 'Wait through red and red-and-amber; go on green'],
    rule: { n: 'Rule 175', t: 'Amber also means stop at the stop line. You may go on only if the amber appears after you have crossed the stop line or are so close that pulling up might cause a collision.' },
    waypoints: [pt(-640, 0, 'High Street'), pt(-80, 0, 'High Street')], scenario: 'amber', focus: ['Response to signals'], maxD: 2 },
  { id: 'emerge-left', unit: 'junctions', area: 'town', title: 'Emerging left from a side road', road: 'Orchard Way → High Street',
    goal: 'At the end of Orchard Way, give way to traffic on High Street, then turn left when there is a safe gap. A car will be coming from your right.',
    steps: ['Signal left and slow down early', 'Creep up to the give-way line and look right, left, right', 'Only pull out when the gap is big enough that nobody has to slow down for you'],
    rule: { n: 'Rule 170', t: 'Watch out for traffic coming from either direction, and do not join a road until there is a gap large enough for you to do so safely.' },
    waypoints: [pt(0, -220, 'Orchard Way'), pt(200, 0, 'High Street')], scenario: 'yield', yieldAny: true, focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'emerge-right', unit: 'junctions', area: 'town', title: 'Emerging right from a side road', road: 'Orchard Way → High Street',
    goal: 'Turn right out of Orchard Way onto High Street. You need a gap in both directions.',
    steps: ['Signal right, position just left of the middle of your road', 'Give way at the line; look right, left, right', 'Go when both lanes are clear, and do not cut the corner'],
    rule: { n: 'Rule 172', t: 'The approach to a junction may have a give-way sign or a triangle marked on the road. You must give way to traffic on the main road when emerging from a junction with broken white lines across the road.' },
    waypoints: [pt(0, -220, 'Orchard Way'), pt(-180, 0, 'High Street')], scenario: 'yield', yieldAny: true, focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'lane-choice', unit: 'junctions', area: 'town', title: 'Choosing your lane', road: 'Station Road · two lanes each way',
    goal: 'Straight on at two sets of lights. Read the arrows on the road: at the first, straight on is from the LEFT lane; at the second, the left lane is for turning left only, so straight on is from the RIGHT lane.',
    steps: ['Read the lane arrows early, before the lane lines turn solid', 'Mirrors, signal, then move across in good time; never at the last moment', 'Stay in your lane through the junction, then move back left when it is clear'],
    rule: { n: 'Rule 133', t: 'If you need to change lane, first use your mirrors and if necessary take a quick sideways glance to check the blind spot. Make sure you will not force another road user to change course or speed, and signal before moving over.' },
    waypoints: [pt(-640, -450, 'Station Road'), pt(640, -450, 'Station Road')], focus: ['Positioning – lane', 'Response to signals'], maxD: 2 },
  { id: 'right-lights', unit: 'junctions', area: 'town', title: 'Turning right at traffic lights', road: 'Bridge Street → High Street',
    goal: 'Turn right at the High Street lights. Get in the right-hand lane, go on green, and give way to oncoming traffic before you turn.',
    steps: ['Mirrors, signal right, and move into the right-hand lane early', 'On green, move forward to the turning point if it is clear', 'Wait for a safe gap in oncoming traffic, then turn'],
    rule: { n: 'Rule 180', t: 'Wait until there is a safe gap between you and any oncoming vehicle. Watch out for cyclists, motorcyclists and pedestrians.' },
    waypoints: [pt(-250, -380, 'Bridge Street'), pt(-640, 0, 'High Street')], focus: ['Response to signals', 'Signals', 'Junctions', 'Positioning – lane'], maxD: 2 },

  { id: 'mini', unit: 'roundabouts', area: 'rbs', title: 'Mini-roundabout', road: 'Queens Road → Ring Road',
    goal: 'Give way to traffic from the right, then turn left at the mini-roundabout onto Ring Road.',
    steps: ['Slow down early; mini-roundabouts come up quickly', 'Give way to anything coming from your right', 'Go round the painted circle, not over it'],
    rule: { n: 'Rule 188', t: 'Approach mini-roundabouts in the same way as normal roundabouts. All vehicles must pass round the central markings.' },
    waypoints: [pt(-200, 380, 'Queens Road'), pt(-450, 0, 'Ring Road')], focus: ['Junctions', 'Signals'], maxD: 2 },
  { id: 'rb-left', unit: 'roundabouts', area: 'rbs', title: 'Roundabout: turning left (1st exit)', road: 'Ring Road → North Road',
    goal: 'Signal left on approach, stay on the left, give way to the right, and take the 1st exit.',
    steps: ['Signal left as you approach', 'Give way to traffic from the right', 'Keep the left signal on as you leave'],
    rule: { n: 'Rule 186', t: 'When taking the first exit, unless signs or markings indicate otherwise: signal left and approach in the left-hand lane; keep to the left on the roundabout.' },
    waypoints: [pt(-120, 0, 'Ring Road'), pt(300, -350, 'North Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-ahead', unit: 'roundabouts', area: 'rbs', title: 'Roundabout: going ahead (2nd exit)', road: 'Ring Road roundabout',
    goal: 'No signal on approach. Give way to the right, then signal left as soon as you pass the exit before yours (the 1st), and leave at the 2nd exit.',
    steps: ['No signal on approach', 'Give way to traffic from the right', 'Signal left once you pass the 1st exit'],
    rule: { n: 'Rule 186', t: 'When going straight ahead, select the appropriate lane, stay in that lane on the roundabout, and signal left after you have passed the exit before the one you want.' },
    waypoints: [pt(-120, 0, 'Ring Road'), pt(700, 0, 'Ring Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-right', unit: 'roundabouts', area: 'rbs', title: 'Roundabout: turning right (3rd exit)', road: 'Ring Road → South Road',
    goal: 'Signal right, keep right on the roundabout, then signal left once you pass the 2nd exit, and take the 3rd.',
    steps: ['Signal right on approach', 'Give way to traffic from the right', 'Change to a left signal after the exit before yours'],
    rule: { n: 'Rule 186', t: 'When taking an exit to the right: signal right and approach in the right-hand lane; keep to the right on the roundabout until you need to change lanes to exit; signal left after you have passed the exit before the one you want.' },
    waypoints: [pt(-120, 0, 'Ring Road'), pt(300, 350, 'South Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-big', unit: 'roundabouts', area: 'rbs', title: 'Two-lane roundabout: right-hand lane', road: 'Ring Road → Newmarket Road',
    goal: 'A two-lane roundabout. Right-hand lane for the 3rd exit, keep your lane all the way round, and signal left after the 2nd exit.',
    steps: ['Right-hand lane on the approach, signal right', 'Give way to traffic from the right', 'Signal left after the 2nd exit and leave without cutting across the lane'],
    rule: { n: 'Rule 186', t: 'Signal right and approach in the right-hand lane; keep to the right on the roundabout until you need to change lanes to exit.' },
    waypoints: [pt(700, 0, 'Ring Road'), pt(900, 380, 'Newmarket Road')], focus: ['Junctions', 'Positioning', 'Signals'], maxD: 2 },
  { id: 'rb-lights', unit: 'roundabouts', area: 'rbs', title: 'Roundabout with traffic lights', road: 'Ring Road · lights on the ring',
    goal: 'Straight on at a big roundabout with traffic lights. The arrows say the left lane is for the 1st exit only, so straight on is from the RIGHT lane. Stop at every red, on the way in and on the ring.',
    steps: ['Read the arrows: left lane left only, right lane ahead and right', 'Obey the lights on the ring as well as on the approach', 'Signal left after the 1st exit and leave in your lane'],
    rule: { n: 'Rule 185', t: 'When reaching the roundabout you should give priority to traffic approaching from your right, unless directed otherwise by signs, road markings or traffic lights.' },
    waypoints: [pt(1150, 0, 'Ring Road'), pt(2400, 0, 'Ring Road')], focus: ['Response to signals', 'Positioning – lane', 'Signals'], maxD: 2 },
  { id: 'dutch', unit: 'roundabouts', area: 'rbs', title: 'Dutch-style roundabout', road: 'Ring Road · cycle ring',
    goal: 'Cyclists ride round the outside ring and have priority where you cross it, going in and coming out. Go straight on (2nd exit).',
    steps: ['Slow right down before the red cycle crossing', 'Give way to cyclists on the ring and people on the zebra', 'Then give way to traffic from the right; check the cycle ring again as you leave'],
    rule: { n: 'Rule H3 and 186', t: 'Give way to cyclists using the roundabout. Do not cut across cyclists when you turn into or out of a junction.' },
    waypoints: [pt(-450, 0, 'Ring Road'), pt(-1080, 0, 'Ring Road')], scenario: 'yield', yieldAt: 0, yieldWith: 'bike', focus: ['Junctions', 'Clearance', 'Pedestrian'], maxD: 2 },

  { id: 'zebra', unit: 'sharing', area: 'town', title: 'Zebra crossings', road: 'High Street · 30 mph',
    goal: 'Someone will step onto the zebra crossing ahead. Slow down, stop before the crossing and let them cross.',
    steps: ['Look for flashing Belisha beacons', 'Slow down and be ready to stop for anyone waiting', 'Once someone is on the crossing you must give way'],
    rule: { n: 'Rule 195', t: 'Look out for pedestrians waiting to cross and be ready to slow down or stop. You should give way to people waiting to cross, and you must give way once someone has moved onto the crossing.' },
    waypoints: [pt(-80, 0, 'High Street'), pt(600, 0, 'High Street')], scenario: 'zebra', focus: ['Pedestrian crossings'], maxD: 2 },
  { id: 'cyclists', unit: 'sharing', area: 'town', title: 'Passing cyclists', road: 'Bridge Street · cycle lanes',
    goal: 'A cyclist is riding ahead of you. Stay out of the cycle lane and only overtake with at least 1.5 m clearance.',
    steps: ['Hang back if there is no room to pass', 'Leave at least 1.5 m at up to 30 mph', 'Do not drive in a mandatory cycle lane'],
    rule: { n: 'Rule 163', t: 'Give cyclists at least as much room as you would a car when overtaking. As a guide, leave at least 1.5 metres at speeds up to 30 mph, and more at higher speeds.' },
    waypoints: [pt(-250, -500, 'Bridge Street'), pt(-250, -900, 'Bridge Street')], scenario: 'cyclist', focus: ['Clearance', 'Control – collision', 'Positioning – lane'], maxD: 2 },
  { id: 'ped-crossing', unit: 'sharing', area: 'town', title: 'Pedestrian light crossing', road: 'Park Road · puffin crossing',
    goal: 'Someone presses the button as you approach. The light turns red and they cross: stop at the line and wait until it is green again.',
    steps: ['Watch for people waiting at the crossing', 'Stop at the white line on red', 'Do not wave pedestrians across, and go only on green'],
    rule: { n: 'Rule 199', t: 'Puffin crossings have no flashing amber: the lights follow the same sequence as traffic lights. You must stop at the line on red and wait for green.' },
    waypoints: [pt(250, -400, 'Park Road'), pt(250, -60, 'Park Road')], scenario: 'crossing', focus: ['Response to signals', 'Pedestrian'], maxD: 2 },
  { id: 'cycle-left', unit: 'sharing', area: 'town', title: 'Turning left across a cycle lane', road: 'Bridge Street → Linden Close',
    goal: 'Bridge Street has a cycle lane. A cyclist is riding in it: let them go past before you turn left across the lane.',
    steps: ['Check your left mirror and blind spot before signalling', 'Do not overtake a cyclist just before you turn left', 'Wait for them to pass the side road, then turn'],
    rule: { n: 'Rule 183 and H3', t: 'When turning, give way to vehicles using a cycle lane, cycle track or bus lane from either direction (Rule 183). Do not cut across cyclists going ahead when you turn into or out of a junction (H3).' },
    waypoints: [pt(-250, -500, 'Bridge Street'), pt(-450, -700, 'Linden Close')], scenario: 'cyclist', focus: ['Clearance', 'Control – collision', 'Signals'], maxD: 2 },
  { id: 'blue-light', unit: 'sharing', area: 'town', title: 'Blue light vehicle', road: 'Moor Road · 30 mph',
    goal: 'Drive along Moor Road. An emergency vehicle will come up behind you with its blue lights on: let it past. Slow right down and pull in on the left where there is room.',
    steps: ['Watch your mirrors: you will usually see the blue lights before you hear anything', 'Slow down and move over to the left where there is room for it to pass', 'Do not brake harshly, mount the kerb, or stop on a crossing or in a junction'],
    rule: { n: 'Rule 219', t: 'Look and listen for ambulances, fire engines, police, doctors or other emergency vehicles using flashing blue lights, headlights or sirens. When one approaches, do not panic. Consider the route of such a vehicle and take appropriate action to let it pass, while complying with all traffic signs. If necessary, pull to the side of the road and stop, but do not endanger other road users, mount the kerb, or brake harshly or stop suddenly.' },
    waypoints: [pt(-640, 600, 'Moor Road'), pt(560, 600, 'Moor Road')], scenario: 'blue-light', focus: ['Emergency vehicle'], maxD: 2 },

  { id: 'follow', unit: 'faster', area: 'roads', title: 'Two-second rule', road: 'Long Lane · 40 mph',
    goal: 'Follow the car in front all the way along Long Lane. Keep at least a two-second gap; more in the wet.',
    steps: ['Pick a fixed point; when the car ahead passes it, say "only a fool breaks the two-second rule"', 'If you pass the point before you finish, drop back', 'Never sit close behind to make someone speed up'],
    rule: { n: 'Rule 126', t: 'Allow at least a two-second gap between you and the vehicle in front on high-speed roads and in tunnels. The gap should be at least doubled on wet roads.' },
    waypoints: [pt(-900, -50, 'Long Lane'), pt(-900, -1550, 'Long Lane')], scenario: 'follow', focus: ['Use of speed'], maxD: 2 },
  { id: 'country', unit: 'faster', area: 'roads', title: 'Country road at 60', road: 'Grantchester Lane · national limit',
    goal: 'A narrow country lane where the national speed limit (60 mph) applies. 60 is the most you may do, not a speed to aim for: slow for bends you cannot see round.',
    steps: ['The white sign with a black stripe means 60 on a road like this', 'Slow down before bends, not in them', 'Keep left: oncoming traffic may be close to the middle'],
    rule: { n: 'Rule 154', t: 'Take extra care on country roads and reduce your speed at approaches to bends, which can be sharper than they appear.' },
    waypoints: [pt(3500, 48, 'Grantchester Lane'), pt(3500, 1650, 'Grantchester Lane')], focus: ['Use of speed', 'Positioning'], maxD: 2 },
  { id: 'dual', unit: 'faster', area: 'roads', title: 'Dual carriageway at 70', road: 'Babraham Road · dual carriageway',
    goal: 'Build up to a safe speed and stay in the left-hand lane. Use the right-hand lane only to overtake, then move back.',
    steps: ['Get up to the speed of the traffic, up to the 70 mph limit', 'Keep left unless overtaking', 'Leave a two-second gap; check mirrors before changing lanes'],
    rule: { n: 'Rule 137', t: 'On a two-lane dual carriageway you should stay in the left-hand lane. Use the right-hand lane for overtaking or turning right.' },
    waypoints: [pt(-700, 0, 'Babraham Road'), pt(3300, 0, 'Babraham Road')], focus: ['Use of speed', 'Positioning'], maxD: 2 }
];
LESSONS.unshift(...BASIC_LESSONS);
LESSONS.push(...PARKING_LESSONS, ...QUIZZES);
for (let i = 0; i < LESSONS.length; i++) LESSONS[i] = enrichLesson(LESSONS[i]); // theory modules: quizzes, no driving (see quiz.js)

// ---------- scripted events ----------
// deps: { net, traffic, test, player, ui: { banner(text|null, kind) } }
export function createScenario(lesson, deps) {
  const parking = createParkingScenario(lesson, deps);
  if (parking) return parking;
  const control = createControlScenario(lesson, deps);
  if (control) return control;
  const basic = createBasicScenario(lesson, deps);
  if (basic) return basic;
  const { net, traffic, test, player, ui } = deps;
  // blue light vehicle: the same event the mock tests use, triggered earlier on a short lesson route
  if (lesson.scenario === 'blue-light') return createEmergencyEvent({ ...deps, trigger: 60 });
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
    // Dutch-style roundabout: time a cyclist on the cycle ring to reach your crossing point when you do
    const ring = lesson.yieldWith === 'bike' && ins && net.cycleRings.find(r => r.crossings.some(c => c.e === ins.approach.e));
    if (ring) {
      const c = ring.crossings.find(q => q.e === ins.approach.e), a = ins.approach, sCross = ins.s - (a.e.len - (a.dir > 0 ? c.s : a.e.len - c.s));
      S.update = () => {
        if (placed) return; const ahead = sCross - test.sRoute; if (ahead > 60 || ahead < 18) return;
        placed = true; const speed = 4.6, tL = ahead / Math.max(player.v, 3.5);
        sent = !!traffic.placeRingBike(ring, c.ang - Math.min(Math.PI * 0.9, speed * tL / ring.r), speed);
      };
    } else if (ins) S.update = () => {
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
  // moving off: a car comes up from behind just as the lesson starts; wait for it, look round, then go
  if (lesson.scenario === 'moveoff') {
    const R = route(), st0 = R.steps[0], v0 = st0.dir > 0 ? st0.e.a : st0.e.b; let car = null, passed = false;
    const t0 = along(st0.e, 1, st0.dir);
    let best = null, bs = 0.6;
    for (const o of net.inc[v0]) {
      const arr = -o.dir; if (o.e === st0.e || (o.e.way.oneway && arr !== 1)) continue;
      const q = along(o.e, o.e.len - 1, arr), sc = q.tx * t0.tx + q.tz * t0.tz; if (sc > bs) { bs = sc; best = { e: o.e, dir: arr }; }
    }
    S.update = () => {
      if (!car && best) {
        const pool = traffic.cars.slice().sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
        car = pool[0]; if (car) traffic.placeCar(car, best.e, best.dir, Math.max(1, best.e.len - 45), 8.5, 1, [best, ...R.steps]);
      }
      if (car && !passed) { const fx = -Math.sin(player.th), fz = -Math.cos(player.th); if ((car.x - player.x) * fx + (car.z - player.z) * fz > 6) passed = true; }
    };
    S.result = () => ({ ok: true, why: passed && !test.faults.some(f => f.cat.startsWith('Move off')) ? 'You let the car pass, looked round and moved off safely.' : '' });
  }
  if (lesson.scenario === 'estop') {
    let state = 'wait', t0 = 0, react = null, stopT = null;
    S.update = (dt, clock) => {
      if (state === 'wait' && test.sRoute > 180 && player.v > 6.5) { state = 'go'; t0 = clock; ui.banner('STOP!', 'stop'); }
      if (state === 'go') {
        if (react === null && player.inp && player.inp.brake > 0.05) react = clock - t0;
        if (Math.abs(player.v) < 0.3) { stopT = clock - t0; state = 'done'; test.parked = true; ui.banner('Thank you. Look round (B), then move off when it is safe.', 'info'); setTimeout(() => ui.banner(null), 4000); }
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
  if (test.hits && test.hits.length) reasons.push(`Other road users ran into you ${test.hits.length === 1 ? 'once' : test.hits.length + ' times'}. Not marked as your fault.`);
  if (pass && test.faults.length === 0 && !(r && r.why)) reasons.push('Clean drive: no faults recorded.');
  return { pass, reasons };
}
