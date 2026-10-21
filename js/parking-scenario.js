import { parkingPlan, ROADSIDE_PARKING } from './roadside-parking.js';
import { gradeParking, sweptContact, nearContact } from './parking-geometry.js';
export function createParkingScenario(lesson, { net, player, test, traffic, ui }) {
  if (!lesson.manoeuvre) return null;
  const layout = lesson.parkingLayout || ROADSIDE_PARKING;
  const plan = parkingPlan(lesson.parkingKind, layout), events = [], contacts = new Set();
  let warning = '', warningUntil = 0;
  let legIndex = 0, phase = 'prepare', travel = 0, lastDir = 0, moving = false, previous = {x:player.x,z:player.z,th:player.th}, observationStart = traffic.clock, speedTime = 0, complete = false;
  // 'D' legs are driven forward, 'R' legs backwards. With one control there is no selector to read, so
  // the direction comes from which way the car actually moved.
  const wanted = leg => leg.gear === 'R' ? -1 : 1;
  const record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  const secured = () => player.operation.parkingBrake && Math.abs(player.v) < 0.1;
  const S = { events, target: plan.legs[0].target, stop: () => ui.banner(null), result: () => {
    const grade = gradeParking(plan.target, player);
    return { ok: complete && grade.valid && secured(), why: complete && grade.valid && secured() ? 'Whole car inside target, aligned, stopped and secured after the measured manoeuvre.' : `Parking assessment: ${grade.inside ? 'inside target' : 'car extends outside target'}, angle ${grade.angleDegrees.toFixed(1)}° (allowance ${grade.tolerance}°), ${grade.stopped ? 'stopped' : 'still moving'}. Complete the driving stages, select P, apply the parking brake and switch off the engine.` };
  } };
  S.finishAttempt = () => {
    // The car starts held on the parking brake, so "parked" only means anything once it has moved off.
    if (phase === 'prepare') { warning = 'Release the parking brake and make the manoeuvre first.'; warningUntil = traffic.clock + 3; S.progress.message = warning; return false; }
    if (!secured()) { warning = 'Come to a stop and tap Park.'; warningUntil = traffic.clock + 3; S.progress.message = warning; return false; }
    if (!complete || !gradeParking(plan.target, player).valid) test.fault('D', 'Manoeuvre – accuracy', 'Parking position or manoeuvre stages did not meet the target', 'parking-accuracy', Infinity);
    record('parking-assessment', { grade: gradeParking(plan.target, player), stagesComplete: complete }); test.finish(); return true;
  };
  S.update = dt => {
    const contact = sweptContact(previous, player, layout);
    if (contact) {
      if (!contacts.has(contact)) {
        test.fault('S', 'Control – collision', contact === 'boundary' ? (layout.boundaryText || 'Left the exercise area') : (layout.obstacleText || 'Struck a parked car'), 'parking-contact:' + contact, 0);
        record('parking-contact', { object: contact, x: player.x, z: player.z }); contacts.add(contact);
      }
      player.place(previous.x, previous.z, previous.th);
    }
    for (const id of contacts) if (id !== contact && !nearContact(player, layout, id)) contacts.delete(id);
    const displacement = Math.hypot(player.x - previous.x, player.z - previous.z);
    previous = { x: player.x, z: player.z, th: player.th };
    const leg = plan.legs[Math.min(legIndex, plan.legs.length - 1)], speed = Math.abs(player.v), op = player.operation;
    if (phase === 'prepare' && !op.parkingBrake) phase = 'drive';
    if (speed > 0.1) {
      const moved = Math.sign(player.v) || 1;
      if (!moving) { moving = true; record('parking-move', { leg: legIndex, direction: moved < 0 ? 'reverse' : 'forward' }); }
      const recent = player.observations.some(e => e.at >= observationStart && traffic.clock - e.at <= 10);
      if (!recent) test.fault('D', 'Move off – observation inputs', 'No recent observation input during the manoeuvre', 'parking-observe', 10);
      lastDir = moved; if (moved === wanted(leg)) travel += displacement;
    }
    speedTime = speed > 2.2 ? speedTime + dt : 0;
    if (speedTime > 0.7) test.fault('D', 'Control – manoeuvre speed', 'Manoeuvre exceeded the 5 mph training cap', 'parking-speed', 8);
    const grade = gradeParking(leg.target, player);
    if (phase === 'drive' && grade.valid && travel >= leg.minTravel && lastDir === wanted(leg)) {
      record('parking-leg-complete', { leg: legIndex, gear: leg.gear, travel, grade });
      legIndex++;
      if (legIndex === plan.legs.length) { complete = true; phase = 'secure'; }
      // The brake is never re-applied between legs: one release covers the whole manoeuvre, so the
      // look-round window keeps rolling instead of restarting and marking the learner straight away.
      else { phase = 'drive'; travel = 0; moving = false; lastDir = 0; }
    }
    if (phase === 'secure' && secured()) { S.finishAttempt(); return; }
    const active = plan.legs[Math.min(legIndex, plan.legs.length - 1)];
    S.target = active.target; S.layout = layout;
    const remaining = Math.hypot(active.target.x - player.x, active.target.z - player.z);
    // No stage label: the one button names the action, and the highlighted target shows where to go.
    const short = '';
    // The brief is given at the start of the lesson and the detail comes in the feedback afterwards,
    // so the only words during the manoeuvre are the stage label and anything that has gone wrong.
    const message = traffic.clock < warningUntil ? warning : '';
    S.progress = { phase, gear: active.gear, leg: legIndex, path: active.path, target: active.target, grade: gradeParking(active.target, player), remaining, short, message };
    test.manoeuvreStatus = S.progress;
    // Keep active driving instructions in the HUD, leaving the parking view unobstructed.
    ui.banner(null);
  };
  S.update(0);
  return S;
}
