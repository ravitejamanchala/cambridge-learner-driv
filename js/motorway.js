// Motorway geometry shared by the layout builder (tools/layouts.mjs), free drive and the motorway lessons,
// so a waypoint written in a lesson lands exactly on a node the builder made.
//
// The motorway is a closed circuit about 24 km round: two long straights with a gentle S-bend in each,
// joined by sweeping bends of 1.6 km radius. It is built from reusable sections (straight, bend,
// junction) rather than generated as you drive, which is what keeps memory bounded on a continuous
// drive: the world is a fixed size, and the scenery around it is built ahead of you and freed behind.
//
// Coordinates are metres, x east, z south. The "A" carriageway runs clockwise (east along the north
// straight); the "B" carriageway runs anticlockwise. Traffic keeps left, so A sits outside the
// centre line and B inside it, and each carriageway's slip roads leave to its own left.

export const MW = {
  straight: 7000,       // length of each straight
  radius: 1600,         // radius of the end bends
  sBend: 60,            // lateral swing of the S-bend on each straight
  step: 20,             // spacing of points along the centre line
  laneW: 3.65,          // running lane width
  shoulder: 3.3,        // hard shoulder, nearside
  hardStrip: 1.0,       // offside hard strip next to the central reservation
  reserve: 3.0,         // central reservation between the two offside edges
  edgeLen: 400,         // carriageways are cut into edges about this long, so traffic and scenery stream
  slipW: 4.0,           // single-lane slip road
  ring: 28,             // junction roundabout radius
  sideOffset: 260,      // how far the junction roundabout sits from its carriageway
  // diverge to merge, metres along the carriageway: exit slip, roundabout, entry slip
  junction: { decel: 220, out: 380, len: 1250, accel: 220 },
  taper: 80,            // a slip road eases into or out of the left-hand lane over this length
};

// Junctions, by where they sit along the A carriageway's centre line. Each has an exit and an entry on
// both carriageways. Names are made up, so nothing reads as a real place.
export const JUNCTIONS = [
  { n: 1, at: 0.10, to: 'Fenbridge' },
  { n: 2, at: 0.26, to: 'Ashwell' },
  { n: 3, at: 0.60, to: 'Kingsmere' },
  { n: 4, at: 0.76, to: 'Harlow Cross' },
];

export const carriagewayWidth = (lanes) => lanes * MW.laneW;
// distance from the centre line to each carriageway's own centre line
export const separation = (lanes) => MW.reserve / 2 + MW.hardStrip + carriagewayWidth(lanes) / 2;

// The circuit's centre line as dense samples: { x, z, tx, tz, nx, nz, s } with (nx, nz) the left
// normal for the A direction. Clockwise from the west end of the north straight.
let LINE = null, LENGTH = 0;
export const circuitLength = () => (centreLine(), LENGTH);
export function centreLine() {
  if (LINE) return LINE; // built once: the same samples for the builder, the lessons and free drive
  const { straight: L, radius: R, sBend: A, step } = MW, pts = [];
  const push = (x, z) => pts.push({ x, z });
  // north straight, heading east: the S-bend fades in and out so it meets the bends tangentially
  for (let d = 0; d < L; d += step) { const u = d / L; push(-L / 2 + d, -R - A * Math.sin(4 * Math.PI * u) * Math.sin(Math.PI * u) ** 2); }
  // east bend, from north round to south
  for (let a = 0; a < Math.PI; a += step / R) push(L / 2 + R * Math.sin(a), -R * Math.cos(a));
  // south straight, heading west
  for (let d = 0; d < L; d += step) { const u = d / L; push(L / 2 - d, R + A * Math.sin(4 * Math.PI * u) * Math.sin(Math.PI * u) ** 2); }
  // west bend, from south round to north
  for (let a = 0; a < Math.PI; a += step / R) push(-L / 2 - R * Math.sin(a), R * Math.cos(a));
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], o = pts[(i - 1 + pts.length) % pts.length];
    if (i) s += Math.hypot(p.x - o.x, p.z - o.z);
    let tx = q.x - o.x, tz = q.z - o.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    Object.assign(p, { s, tx, tz, nx: tz, nz: -tx }); // left of travel is (tz, -tx), as everywhere in the sim
  }
  const last = pts[pts.length - 1], first = pts[0];
  LENGTH = s + Math.hypot(first.x - last.x, first.z - last.z);
  return (LINE = pts);
}

// a point on the centre line at distance s (wraps round the circuit), interpolated
export function sampleAt(line, s) {
  const total = circuitLength(); s = ((s % total) + total) % total;
  let lo = 0, hi = line.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (line[m].s <= s) lo = m; else hi = m - 1; }
  const p = line[lo], q = line[(lo + 1) % line.length], seg = (q.s || total) - p.s || 1, u = (s - p.s) / seg;
  const tx = p.tx + (q.tx - p.tx) * u, tz = p.tz + (q.tz - p.tz) * u, l = Math.hypot(tx, tz) || 1;
  return { x: p.x + (q.x - p.x) * u, z: p.z + (q.z - p.z) * u, tx: tx / l, tz: tz / l, nx: tz / l, nz: -tx / l, s };
}

// Where a carriageway is at centre-line distance s. Carriageway A travels with s, B against it; each
// sits on its own left. Returns the point and the direction of travel on that carriageway.
export function onCarriageway(line, lanes, side, s, lateral = 0) {
  const c = sampleAt(line, s), k = side === 'A' ? 1 : -1, off = separation(lanes) + lateral;
  return { x: c.x + c.nx * off * k, z: c.z + c.nz * off * k, tx: c.tx * k, tz: c.tz * k, nx: c.nx * k, nz: c.nz * k, s };
}

// Distances along the centre line for a junction on a carriageway. On B, travel runs against s, so its
// diverge comes at the higher s and its merge at the lower one.
export function junctionSpan(j, side) {
  const at = j.at * circuitLength(), J = MW.junction;
  return side === 'A' ? { diverge: at, merge: at + J.len } : { diverge: at + J.len, merge: at };
}

// Nodes a lesson can use as waypoints: the start of the circuit on each carriageway, a point before and
// after every junction, and the junction's local road. Filled in by the layout builder, which knows
// exactly where it put each node; lessons read them from here.
export const nodeAt = (line, lanes, side, s) => { const p = onCarriageway(line, lanes, side, s); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }; };
