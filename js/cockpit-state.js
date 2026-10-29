// Presentation only: the cockpit never changes physics, navigation or assessment.
export function cockpitState(player, test, clock = 0) {
 const op = player.operation || {}, way = test?.ctx?.d < 30 ? test.ctx.way : null;
 const route = test?.route, instruction = route?.instructions?.[Math.min(test.step || 0, route.instructions.length - 1)];
 const distance = Math.max(0, (instruction?.s || 0) - (test?.sRoute || 0));
 const temporary = test?.restriction?.limit?.();
 let turn = instruction?.short || 'Follow the road', icon = instruction?.icon || 'straight';
 if (instruction?.final && distance > 256) { turn = 'Follow the road ahead'; icon = 'straight'; }
 if (test?.offRoute) { turn = 'Finding a new route'; icon = 'off'; }
 if (test?.parked) { turn = 'Check mirrors and blind spot'; icon = 'look'; }
 const remaining = Math.max(0, (route?.len || 0) - (test?.sRoute || 0));
 const gear = op.transmission === 'automatic' ? op.gear : player.v < -.1 ? 'R' : 'D';
 return { speed: Math.round(Math.abs(player.v || 0) * 2.23694), gear,
  engine: !op.enabled || !!op.engine, parkingBrake: !!(op.enabled && op.parkingBrake),
  beltWarning: !!(op.enabled && !op.handbrakeOnly && !op.belt), headlights: !!player.headlights,
  indicator: Math.floor(clock * 3) % 2 === 0 ? player.indicator : null,
  limit: temporary ?? way?.mph ?? null, limitEstimated: temporary == null && !!way?.assumed,
  road: way?.name || (way?.rb ? 'Roundabout' : way ? 'Unnamed road' : 'Road network'),
  turn, icon, distance, distanceText: distance < 14 ? 'Now' : distance > 1609 ? (distance / 1609.344).toFixed(1) + ' mi' : Math.round(distance * 1.09361 / 10) * 10 + ' yd',
  remaining, remainingText: (remaining / 1609.344).toFixed(1) + ' mi',
  mode: test?.experimental || test?.ungraded ? 'FREE PRACTICE' : 'LEARNER DRIVE',
  progress: route?.len ? Math.max(0, Math.min(1, (test?.sRoute || 0) / route.len)) : 0 };
}
