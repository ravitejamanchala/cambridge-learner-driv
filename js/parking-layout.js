// Authored synthetic training geometry, in local metres; never a surveyed road or test route.
export const PARKING_LAYOUT = {
  bounds: { x: 0, z: 1, width: 30, length: 62, th: 0 },
  bay: { x: 11, z: 0, width: 2.8, length: 5.6, th: -Math.PI / 2 },
  exit: { x: 0, z: -20, width: 3.6, length: 6.5, th: 0 },
  obstacles: [-4, 4].map((z, i) => ({ id: 'parked-' + i, x: 11, z, width: 1.8, length: 4.3, th: -Math.PI / 2 })),
  aisle: [{ x: 0, z: 32, road: 'Training aisle' }, { x: 0, z: -30, road: 'Training aisle' }]
};
function arc(cx, cz, from, to) {
  return Array.from({ length: 31 }, (_, i) => { const a = from + (to - from) * i / 30; return { x: cx + 6 * Math.cos(a), z: cz + 6 * Math.sin(a) }; });
}
const forward = [{ x: 0, z: 14 }, ...arc(6, 6, Math.PI, Math.PI * 1.5), { x: 11, z: 0 }];
const reverse = [{ x: 0, z: -14 }, ...arc(6, -6, Math.PI, Math.PI / 2), { x: 11, z: 0 }];
const bay = PARKING_LAYOUT.bay;
PARKING_LAYOUT.manoeuvres = {
  'forward-bay': { start: { x: 0, z: 14, th: 0 }, legs: [{ gear: 'D', path: forward, target: bay, minTravel: 8 }], target: bay },
  'reverse-bay': { start: { x: 0, z: -14, th: 0 }, legs: [{ gear: 'R', path: reverse, target: { ...bay, th: Math.PI / 2 }, minTravel: 8 }], target: { ...bay, th: Math.PI / 2 } },
  'leave-bay': { start: { x: bay.x, z: bay.z, th: bay.th }, legs: [
    { gear: 'R', path: forward.slice().reverse(), target: { x: 0, z: 14, th: 0, width: 3.6, length: 6.5 }, minTravel: 8 },
    { gear: 'D', path: [{ x: 0, z: 14 }, { x: 0, z: -20 }], target: PARKING_LAYOUT.exit, minTravel: 12 }
  ], target: PARKING_LAYOUT.exit }
};
export function parkingPlan(kind, layout = PARKING_LAYOUT) {
  const plan = layout.manoeuvres?.[kind];
  if (!plan) throw new Error('Unknown parking manoeuvre: ' + kind);
  return plan;
}
