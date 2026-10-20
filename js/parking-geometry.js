export const VEHICLE_ENVELOPE = { length: 4.3, width: 1.8 };
export function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
export function rectangleCorners(rect) {
  const { x, z, th = 0, width, length } = rect, rx = Math.cos(th), rz = -Math.sin(th), fx = -Math.sin(th), fz = -Math.cos(th);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([side, end]) => ({ x: x + rx * side * width / 2 + fx * end * length / 2, z: z + rz * side * width / 2 + fz * end * length / 2 }));
}
export function containsVehicle(target, pose, size = VEHICLE_ENVELOPE) {
  const rx = Math.cos(target.th), rz = -Math.sin(target.th), fx = -Math.sin(target.th), fz = -Math.cos(target.th);
  return rectangleCorners({ ...pose, ...size }).every(p => {
    const dx = p.x - target.x, dz = p.z - target.z;
    return Math.abs(dx * rx + dz * rz) <= target.width / 2 + 1e-6 && Math.abs(dx * fx + dz * fz) <= target.length / 2 + 1e-6;
  });
}
export const ANGLE_TOLERANCE = 8; // degrees off the target heading, unless the target asks for its own allowance
export function gradeParking(target, pose) {
  const inside = containsVehicle(target, pose), angleDegrees = Math.abs(wrapAngle(pose.th - target.th)) * 180 / Math.PI;
  const tolerance = target.angleTolerance ?? ANGLE_TOLERANCE, aligned = angleDegrees <= tolerance;
  return { inside, angleDegrees, tolerance, aligned, stopped: Math.abs(pose.v || 0) < 0.1, valid: inside && aligned && Math.abs(pose.v || 0) < 0.1 };
}
export function rectanglesOverlap(a, b) {
  const ap = rectangleCorners(a), bp = rectangleCorners(b);
  for (const th of [a.th || 0, b.th || 0]) for (const axis of [{x:Math.cos(th),z:-Math.sin(th)},{x:-Math.sin(th),z:-Math.cos(th)}]) {
    const av = ap.map(p => p.x * axis.x + p.z * axis.z), bv = bp.map(p => p.x * axis.x + p.z * axis.z);
    if (Math.max(...av) <= Math.min(...bv) + 1e-7 || Math.max(...bv) <= Math.min(...av) + 1e-7) return false;
  }
  return true;
}
export function sweptContact(previous, pose, layout) {
  const da = wrapAngle(pose.th - previous.th), steps = Math.max(1, Math.ceil(Math.hypot(pose.x - previous.x, pose.z - previous.z) / 0.2), Math.ceil(Math.abs(da) / 0.03));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, p = { x: previous.x + (pose.x - previous.x) * u, z: previous.z + (pose.z - previous.z) * u, th: previous.th + da * u };
    if (!containsVehicle(layout.bounds, p)) return 'boundary';
    for (const o of layout.obstacles) if (rectanglesOverlap({ ...p, ...VEHICLE_ENVELOPE }, o)) return o.id;
  }
  return null;
}

// Still touching, within `margin`. A car held against an obstacle is pushed back to the pose it had a
// frame earlier, which can be tens of centimetres clear of it, so the margin has to cover a frame of
// travel or one sustained contact is logged over and over.
export function nearContact(pose, layout, id, margin = 0.6) {
  const size = { width: VEHICLE_ENVELOPE.width + margin, length: VEHICLE_ENVELOPE.length + margin };
  if (id === 'boundary') return !containsVehicle(layout.bounds, pose, size);
  const object = layout.obstacles.find(o => o.id === id);
  return !!object && rectanglesOverlap({ ...pose, ...size }, object);
}
