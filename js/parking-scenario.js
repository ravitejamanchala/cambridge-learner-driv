import { parkingPlan, ROADSIDE_PARKING } from './roadside-parking.js';
import { gradeParking, sweptContact, nearContact } from './parking-geometry.js';
export function createParkingScenario(lesson, { net, player, test, traffic, ui }) {
  if (!lesson.manoeuvre) return null;
  const layout = lesson.parkingLayout || ROADSIDE_PARKING;
  const plan = parkingPlan(lesson.parkingKind, layout), events = [], contacts = new Set();
  let warning = '', warningUntil = 0;
  let legIndex = 0, phase = 'prepare', travel = 0, lastGear = null, moving = false, previous = {x:player.x,z:player.z,th:player.th}, observationStart = traffic.clock, speedTime = 0, complete = false;
  const record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  const secured = () => player.operation.gear === 'P' && player.operation.parkingBrake && !player.operation.engine && Math.abs(player.v) < 0.1;
  const S = { events, target: plan.legs[0].target, stop: () => ui.banner(null), result: () => {
    const grade = gradeParking(plan.target, player);
    return { ok: complete && grade.valid && secured(), why: complete && grade.valid && secured() ? 'Whole car inside target, aligned, stopped and secured after the measured manoeuvre.' : `Parking assessment: ${grade.inside ? 'inside target' : 'car extends outside target'}, angle ${grade.angleDegrees.toFixed(1)}° (allowance ${grade.tolerance}°), ${grade.stopped ? 'stopped' : 'still moving'}. Complete the driving stages, select P, apply the parking brake and switch off the engine.` };
  } };
  S.finishAttempt = () => {
    if (!secured()) { warning = 'Stop, select P, apply the parking brake and switch off the engine before assessment.'; warningUntil = traffic.clock + 3; S.progress.message = warning; return false; }
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
    if (phase === 'prepare' && op.gear === leg.gear && !op.parkingBrake) phase = 'drive';
    if (speed > 0.1) {
      if (!moving) { moving = true; record('parking-move', { leg: legIndex, gear: op.gear }); }
      const recent = player.observations.some(e => e.at >= observationStart && traffic.clock - e.at <= 10);
      if (!recent) test.fault('D', 'Move off – observation inputs', 'No recent observation input during the manoeuvre', 'parking-observe', 10);
      lastGear = op.gear; if (op.gear === leg.gear) travel += displacement;
    }
    speedTime = speed > 2.2 ? speedTime + dt : 0;
    if (speedTime > 0.7) test.fault('D', 'Control – manoeuvre speed', 'Manoeuvre exceeded the 5 mph training cap', 'parking-speed', 8);
    const grade = gradeParking(leg.target, player);
    if (phase === 'drive' && grade.valid && travel >= leg.minTravel && lastGear === leg.gear) {
      record('parking-leg-complete', { leg: legIndex, gear: leg.gear, travel, grade });
      legIndex++;
      if (legIndex === plan.legs.length) { complete = true; phase = 'secure'; }
      else { phase = 'prepare'; travel = 0; moving = false; lastGear = null; observationStart = traffic.clock; }
    }
    if (phase === 'secure' && secured()) { S.finishAttempt(); return; }
    const active = plan.legs[Math.min(legIndex, plan.legs.length - 1)];
    S.target = active.target; S.layout = layout;
    const remaining = Math.hypot(active.target.x - player.x, active.target.z - player.z);
    const short = phase === 'prepare' ? `Prepare · ${active.gear} · B` : phase === 'secure' ? 'P · parking brake · engine off' : lesson.parkingKind === 'parallel-park' ? (legIndex === 0 ? 'Pull up alongside the front car' : 'Reverse into the space') : `${active.gear === 'R' ? 'Reverse' : 'Drive'} into the highlighted bay`;
    let message = phase === 'secure' ? 'Stop straight inside the target; select P, apply the parking brake and switch off the engine.' : phase === 'prepare' ? `Hold the footbrake, select ${active.gear}, check round (B) and release the parking brake.` : short + '. Keep at walking pace and record observation inputs (B).';
    if (traffic.clock < warningUntil) message = warning;
    S.progress = { phase, gear: active.gear, leg: legIndex, path: active.path, target: active.target, grade: gradeParking(active.target, player), remaining, short, message };
    test.manoeuvreStatus = S.progress;
    // Keep active driving instructions in the HUD, leaving the parking view unobstructed.
    ui.banner(null);
  };
  S.update(0);
  return S;
}
