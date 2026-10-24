// Free drive: ungraded, continuous practice on the motorway circuit. Nothing is marked, nothing is
// saved to the learner's record, and the drive never ends on its own — the route rolls over to another
// lap as the car comes round. What the learner gets instead is a measured summary when they stop.
import { centreLine, circuitLength, onCarriageway } from './motorway.js';

// A lap starts and ends at the west end of the north straight on the A carriageway, with a waypoint at
// each quarter so routing can never take a short cut through a junction.
function lap(lanes) {
  const line = centreLine(), total = circuitLength();
  return [0, 0.25, 0.5, 0.75, 1].map(f => { const p = onCarriageway(line, lanes, 'A', (f % 1) * total); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), road: 'M100' }; });
}

export const FREE_DRIVES = [
  { id: 'm3', area: 'm3', lanes: 3, title: 'Motorway · three lanes', road: 'M100 · 70 mph',
    blurb: 'A 15-mile circuit with three lanes each way, gentle bends and four junctions. Drive as long as you like.' },
  { id: 'm2', area: 'm2', lanes: 2, title: 'Motorway · two lanes', road: 'M100 · 70 mph',
    blurb: 'The same circuit with two lanes each way: less room to overtake, so more planning.' },
  { id: 'm3-dusk', area: 'm3', lanes: 3, title: 'Motorway at dusk', road: 'M100 · three lanes · evening', timeOfDay: 'dusk',
    blurb: 'The three-lane circuit as the light goes: headlights on (H), lit junctions, and studs in the road.' }
].map(d => { const w = lap(d.lanes); return { ...d, lap: w, waypoints: [...w, w[1]] }; });
// `waypoints` is a lap and a quarter: the route carries on past its own start, so the examiner can step
// progress back one lap without the car ever being off the route (see test.js useLap).

export const freeDrive = (id) => FREE_DRIVES.find(d => d.id === id);

// What a free drive measured, for the summary at the end. Only things the sim recorded: distance,
// time, laps, junctions passed, and the longest stretch kept at or under the limit.
export function createFreeStats() {
  return { distance: 0, seconds: 0, laps: 0, junctions: 0, legalRun: 0, bestLegalRun: 0, topMph: 0 };
}
export function stepFreeStats(st, dt, v, mph, limit) {
  const d = Math.abs(v) * dt;
  st.distance += d; st.seconds += dt; st.topMph = Math.max(st.topMph, mph);
  if (mph <= limit + 0.5) { st.legalRun += d; st.bestLegalRun = Math.max(st.bestLegalRun, st.legalRun); } else st.legalRun = 0;
}

// The summary, one measured fact per line. Specific numbers, nothing invented, and the one honest
// caveat if the drive went over the limit — praise only counts when it can't be faked.
export function freeSummaryLines(st, minutes) {
  const mi = (m) => (m / 1609.34).toFixed(1), out = [];
  if (st.distance < 160) return ['Drive a little further for a summary: it starts counting from a tenth of a mile.'];
  const avg = st.seconds > 0 ? st.distance / st.seconds * 2.23694 : 0;
  out.push(`${mi(st.distance)} miles in ${Math.max(1, Math.round(minutes))} min, averaging ${Math.round(avg)} mph`);
  if (st.laps) out.push(`${st.laps} full lap${st.laps > 1 ? 's' : ''} of the circuit`);
  if (st.junctions) out.push(`Drove past ${st.junctions} junction${st.junctions > 1 ? 's' : ''}`);
  out.push(`Longest stretch at or under the limit: ${mi(st.bestLegalRun)} miles`);
  out.push(st.topMph > 71 ? `Top speed ${Math.round(st.topMph)} mph — over the 70 limit at some point` : `Never over the limit: top speed ${Math.round(st.topMph)} mph`);
  return out;
}
