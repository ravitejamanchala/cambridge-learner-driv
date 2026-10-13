export function createControlScenario(lesson, { player, test, traffic, ui }) {
  const kind = lesson.scenario;
  if (!['automatic-drive', 'automatic-reverse', 'steering'].includes(kind)) return null;
  const start = { x: player.x, z: player.z, th: player.th, at: traffic.clock };
  let phase = 'prepare', achieved = false, left = 0, right = 0, overspeed = 0, moved = false, observationOK = true;
  const events = [], record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  const S = { events, stop: () => ui.banner(null), progress: { phase }, result: () => ({
    ok: kind === 'steering' ? left >= 0.8 && right >= 0.8 && !test.rerouted : achieved && phase === 'complete' && observationOK,
    why: kind === 'steering' ? `Left steering ${left.toFixed(1)} s; right steering ${right.toFixed(1)} s. Follow the whole route without rerouting.` : achieved && phase === 'complete' && observationOK ? 'Distance, selector, stopping and securing objectives completed.' : 'Use the correct selector, make the observation input, travel the target distance, stop, then select P and apply the parking brake.'
  }) };
  S.update = dt => {
    const speed = Math.abs(player.v), op = player.operation;
    let message;
    if (kind === 'steering') {
      phase = 'drive';
      if (player.delta > 0.01 && speed > 1) left += dt;
      if (player.delta < -0.01 && speed > 1) right += dt;
      overspeed = speed * 2.23694 > 15 ? overspeed + dt : 0;
      if (overspeed > 1.5) test.fault('D', 'Control – training speed', 'Exceeded this steering exercise’s 15 mph cap', 'steering-speed', 10);
      message = 'Follow the bends, stay in your lane and keep below 15 mph.';
    } else {
      const reverse = kind === 'automatic-reverse', desired = reverse ? 'R' : 'D', target = reverse ? 6 : 50;
      const forward = (player.x - start.x) * -Math.sin(start.th) + (player.z - start.z) * -Math.cos(start.th);
      const distance = reverse ? -forward : forward;
      if (!moved && speed > 0.3) {
        moved = true; observationOK = player.observations.some(e => e.at >= start.at && traffic.clock - e.at < 10);
        if (!observationOK) test.fault('D', 'Move off – control inputs', 'Moved without a recent observation input', 'automatic-observe', Infinity);
        record('automatic-move', { gear: op.gear });
      }
      if (phase === 'prepare' && op.gear === desired && !op.parkingBrake) phase = 'drive';
      if (phase === 'drive' && distance >= target && op.gear === desired) { achieved = true; phase = 'stop'; record('distance-target', { distance, target, gear: op.gear }); }
      if (phase === 'stop' && speed < 0.1) phase = 'secure';
      if (phase === 'secure' && op.gear === 'P' && op.parkingBrake && speed < 0.1) { phase = 'complete'; record('vehicle-secured'); test.finish(); return; }
      if (reverse && speed > 1.8) test.fault('D', 'Control – reversing speed', 'Reversed faster than the exercise’s walking-pace limit', 'reverse-speed', 10);
      if (phase === 'prepare') message = `Hold brake (S), select ${desired}, check round (B), then release the parking brake (P).`;
      else if (phase === 'drive') message = `${reverse ? 'Reverse at walking pace' : 'Drive forward'}: ${Math.max(0, target - distance).toFixed(1)} metres remaining.`;
      else if (phase === 'stop') message = 'Target reached. Brake to a complete stop.';
      else message = 'Keep the brake pressed, select P, then apply the parking brake.';
    }
    S.progress = { phase, achieved, message }; ui.banner(message, 'info');
  };
  return S;
}
