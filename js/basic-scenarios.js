// Objectives use only captured controls, speed, route distance and position.
export function createBasicScenario(lesson, { player, test, traffic, ui }) {
  const kind = lesson.scenario, known = ['cockpit', 'engine', 'mirrors', 'controlled-stop', 'accel-decel'];
  if (!known.includes(kind)) return null;
  let passed = false, failed = false, started = false, held = 0, promptedAt = null, maxTravel = 0;
  const start = { x: player.x, z: player.z }, startClock = traffic.clock;
  const checks = ['interior', 'right', 'blindspot'];
  const observed = (after, before = Infinity) => checks.every(view => player.observations.some(e => e.view === view && e.at >= after && e.at <= before));
  let movedAt = null;
  const events = [];
  const record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  const S = { events, notes: [], stop: () => ui.banner(null), result: () => ({ ok: passed && !failed,
    why: passed && !failed ? 'All measured control objectives completed.' : 'Complete every control objective and finish without the recorded control errors.' }) };
  S.update = dt => {
    maxTravel = Math.max(maxTravel, Math.hypot(player.x - start.x, player.z - start.z));
    const v = Math.abs(player.v), mph = v * 2.23694, op = player.operation;
    let message;
    if (kind === 'cockpit' || kind === 'engine') {
      if (maxTravel > 1) failed = true;
      const prepared = op.doorClosed && op.seatSet && op.mirrorsSet && op.belt;
      const engineEvents = op.events.filter(e => e.action === 'engine');
      const secure = prepared && op.parkingBrake && !op.engine && v < 0.3;
      passed = secure && (kind === 'cockpit' || (engineEvents.some(e => e.value) && engineEvents.at(-1)?.value === false));
      message = kind === 'cockpit' ? 'Prepare the cockpit: door, seat, mirrors and belt. Keep engine off and parking brake on.' : 'Prepare cockpit → engine on → engine off. Keep parking brake on.';
      if (passed && !failed) { record('controls-complete'); test.finish(); return; }
    } else if (kind === 'mirrors') {
      if (movedAt === null && v > 0.8) {
        movedAt = traffic.clock; record('move-off', { views: player.observations.map(e => e.view) });
        if (!observed(startClock, movedAt)) { failed = true; test.fault('D', 'Move off – inputs', 'Moved before completing the three observation inputs', 'mirror-start', Infinity); }
      }
      passed = movedAt !== null && observed(movedAt + 1) && test.sRoute > test.route.len - 50;
      message = movedAt === null ? 'Select Interior, Right and Blind spot before moving.' : 'Repeat Interior, Right and Blind spot before pulling up.';
    } else if (kind === 'controlled-stop') {
      if (!started && test.sRoute > 45 && mph >= 10 && mph <= 15) { started = true; promptedAt = test.sRoute; record('stop-prompt', { routeDistance: promptedAt, speed: v }); }
      if (started && !passed && !failed) {
        if (test.sRoute - promptedAt > 30) { failed = true; test.fault('D', 'Control – stopping', 'Did not stop within 30 metres of the prompt', 'controlled-stop', Infinity); }
        else if (v < 0.3 && player.inp?.brake > 0.05) { passed = true; test.parked = true; record('controlled-stop', { distance: test.sRoute - promptedAt }); }
      }
      message = !started ? 'Reach 10–15 mph on this straight.' : passed ? 'Stopped in the target distance. Check round (B), then continue.' : failed ? 'Stop target missed. Finish the route and retry.' : `Brake to stop: ${Math.max(0, Math.round(30 - test.sRoute + promptedAt))} metres left.`;
    } else {
      if (!started) { held = mph >= 10 && mph <= 15 ? held + dt : 0; if (held >= 3) { started = true; promptedAt = traffic.clock; record('speed-held', { seconds: held, mph }); } }
      if (started && !passed && traffic.clock > promptedAt && mph < 8 && !player.inp?.throttle) { passed = true; record('speed-reduced', { mph }); }
      message = passed ? 'Speed reduced. Continue to the finish.' : started ? 'Release accelerator and slow below 8 mph.' : `Hold 10–15 mph: ${Math.min(3, held).toFixed(1)} / 3 seconds.`;
    }
    ui.banner(message, 'info');
    S.progress = { complete: passed && !failed, failed, message };
  };
  return S;
}
