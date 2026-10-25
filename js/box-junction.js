// Yellow box junctions and KEEP CLEAR (issue #5): where each one is, whether a vehicle is in it, whether the
// way out is clear, and what the examiner makes of stopping in one. The scenery, the other traffic, the
// examiner and the lessons all read these, so the area a learner sees painted is the area they are judged on.
//
// Rule 174: you MUST NOT enter the box until your exit road or lane is clear. You may enter it and wait when
// you want to turn right and are stopped only by oncoming traffic, or by other vehicles waiting to turn right.
// KEEP CLEAR (diagram 1026) is advisory: leave it clear when traffic queues, so others can get in and out.
import { along, laneInfo } from './net.js';

export const CAR_HALF = 2.15; // half a car's length: its front and back from where it is
const ROOM = 7; // the space needed beyond an area for a car to stop clear of it
const SLOW = 2; // m/s: a vehicle going no faster than this is queueing, not driving away

// The box at node v: a rectangle over the crossing of the carriageways, lined up with the first road at the
// node: as long as the crossing road is wide and as wide as this road is (both from kerb to kerb).
export function boxArea(net, v, id = 0) {
  const out = net.inc[v].map(o => ({ t: along(o.e, 0.5, o.dir), w: o.e.way.w }));
  if (out.length < 3) return null;
  const a = out[0].t, side = (o) => Math.abs(o.t.tx * a.tx + o.t.tz * a.tz) > 0.7;
  const hw = Math.max(...out.filter(side).map(o => o.w / 2)), cross = out.filter(o => !side(o));
  if (!cross.length) return null;
  return { kind: 'box', id, node: v, x: net.nx[v], z: net.nz[v], ax: a.tx, az: a.tz, hl: Math.max(...cross.map(o => o.w / 2)), hw };
}
// KEEP CLEAR: the lanes of one direction, `len` long, centred where the marking is
export function keepArea(k, id = 0) {
  const L = laneInfo(k.e, k.dir), off = (L.outer + L.inner) / 2;
  return { kind: 'keep', id, x: k.x + k.tz * off, z: k.z - k.tx * off, ax: k.tx, az: k.tz, hl: k.len / 2, hw: (L.outer - L.inner) / 2 };
}
export function clearAreas(net) {
  return [...(net.boxes || []).map((b, i) => boxArea(net, b.node, i)).filter(Boolean), ...(net.keepClear || []).map((k, i) => keepArea(k, i))];
}
// a point's place in an area's frame: u along its axis, w across it
const local = (A, x, z) => { const dx = x - A.x, dz = z - A.z; return { u: dx * A.ax + dz * A.az, w: dx * A.az - dz * A.ax }; };
export const inArea = (A, x, z, pad = 0) => { const p = local(A, x, z); return Math.abs(p.u) <= A.hl + pad && Math.abs(p.w) <= A.hw + pad; };
// any part of a vehicle (front, middle or back) inside the area
export function vehicleIn(A, x, z, th) {
  const fx = -Math.sin(th), fz = -Math.cos(th);
  return [-CAR_HALF, 0, CAR_HALF].some(d => inArea(A, x + fx * d, z + fz * d));
}
// how far a vehicle heading (fx, fz) from (x, z) travels before it is inside the area, and how far before it
// is out the other side (Infinity if its line misses the area)
export function crossing(A, x, z, fx, fz) {
  const p = local(A, x, z), du = fx * A.ax + fz * A.az, dw = fx * A.az - fz * A.ax;
  let t0 = -Infinity, t1 = Infinity;
  for (const [q, d, h] of [[p.u, du, A.hl], [p.w, dw, A.hw]]) {
    if (Math.abs(d) < 1e-6) { if (Math.abs(q) > h) return { into: Infinity, out: Infinity }; continue; }
    const a = (-h - q) / d, b = (h - q) / d; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 > t1 ? { into: Infinity, out: Infinity } : { into: t0, out: t1 };
}
// Is there room on the far side? Along the line from (x, z) heading (fx, fz): a vehicle going the same way
// and queueing, at most `room` metres past where the line leaves the area, means there is not. Vehicles
// still in the area ahead count too: they have not cleared it yet. `lo` and `hi` bound how far to the left
// of the line (negative: to its right) a vehicle may be and still be in the way: a lane either side of a car
// on the line, or the whole of the near side of an exit road for a line drawn down its middle.
export function exitBlocked(A, x, z, fx, fz, others, { room = ROOM, lo = -1.8, hi = 1.8 } = {}) {
  const c = crossing(A, x, z, fx, fz); if (!Number.isFinite(c.out)) return null;
  for (const o of others) {
    if (o.alive === false) continue;
    const ofx = -Math.sin(o.th || 0), ofz = -Math.cos(o.th || 0); if (ofx * fx + ofz * fz < 0.5) continue;
    const rx = o.x - x, rz = o.z - z, fw = rx * fx + rz * fz, left = rx * fz - rz * fx;
    if (left < lo || left > hi || fw < Math.max(1, c.into) || fw - CAR_HALF > c.out + room) continue;
    if (Math.abs(o.v || 0) <= SLOW) return o;
  }
  return null;
}
// the way out of a box for a vehicle going from edge `e` onto `next` at node v: a line down the middle of the
// exit road, and everything on its near side
export function exitLine(net, v, next) {
  const t = along(next.e, 0.5, next.dir);
  return { x: net.nx[v], z: net.nz[v], fx: t.tx, fz: t.tz, lo: -0.8, hi: laneInfo(next.e, next.dir).outer + 0.5 };
}

// The examiner's part. Stopping inside a box with the way out blocked by traffic is a serious fault: the
// learner went in before there was room. Waiting inside to turn right, held only by oncoming traffic, is
// allowed and noted. Stopping on KEEP CLEAR behind a queue is a driving fault. Each area is judged once per
// stop, and the record of every crossing is kept for the lesson feedback.
export function createClearJudge({ net, test, traffic, player }) {
  const areas = clearAreas(net), state = new Map(), log = [];
  const others = () => traffic.cars.concat(traffic.bikes).filter(o => o.alive && o.mesh?.visible !== false);
  const turnAt = (node) => test.route?.instructions?.find(i => i.node === node)?.kind;
  // a box's exit on the learner's route: the road the route takes away from its node
  function routeExit(A) {
    const R = test.route; if (!R || A.kind !== 'box') return null;
    for (let k = 0; k < R.steps.length - 1; k++) { const st = R.steps[k]; if ((st.dir > 0 ? st.e.b : st.e.a) === A.node) return exitLine(net, A.node, R.steps[k + 1]); }
    return null;
  }
  // is the way out blocked, for the learner where they are now? Along the route's exit road at a box, or
  // straight on along their lane (KEEP CLEAR, or a box off the route)
  function blocked(A, room) {
    const L = routeExit(A), o = others();
    if (L) return exitBlocked(A, L.x, L.z, L.fx, L.fz, o, { room, lo: L.lo, hi: L.hi });
    return exitBlocked(A, player.x, player.z, -Math.sin(player.th), -Math.cos(player.th), o, { room });
  }
  function update(dt) {
    if (!test.running || !areas.length) return;
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), still = Math.abs(player.v) < 0.3;
    for (const A of areas) {
      if (Math.hypot(A.x - player.x, A.z - player.z) > 60) { state.delete(A); continue; }
      let s = state.get(A); if (!s) state.set(A, s = { stopT: 0, waitT: 0, waitBlocked: 0, judged: false, entry: null });
      const inside = vehicleIn(A, player.x, player.z, player.th);
      const c = crossing(A, player.x + fx * CAR_HALF, player.z + fz * CAR_HALF, fx, fz);
      // waiting before it: stopped with the front of the car within 15 m of the edge
      if (!inside && still && c.into > -0.5 && c.into < 15) {
        s.waitT += dt; if (blocked(A)) s.waitBlocked += dt;
      }
      if (inside && !s.entry) {
        s.entry = { kind: A.kind, id: A.id, node: A.node, blocked: !!blocked(A), waited: +s.waitT.toFixed(1), waitedBlocked: +s.waitBlocked.toFixed(1), stopped: false, rightTurn: false, at: traffic.clock };
        log.push(s.entry);
      }
      if (!inside) { if (s.entry && c.into > 0) { s.entry = null; s.waitT = s.waitBlocked = 0; } s.stopT = 0; s.judged = false; continue; }
      s.stopT = still ? s.stopT + dt : 0;
      if (s.stopT < 1 || s.judged) continue;
      s.judged = true; s.entry.stopped = true;
      const held = blocked(A, 2);
      if (A.kind === 'box') {
        if (held) test.fault('S', 'Response to road markings', 'Stopped in a yellow box junction with your exit blocked: wait before the box until there is room on the other side (Rule 174)', 'box' + A.id, 60);
        else if (turnAt(A.node) === 'right') s.entry.rightTurn = true;
      } else if (held) test.fault('D', 'Response to road markings', 'Stopped on the KEEP CLEAR markings behind a queue: stop short of them so traffic can get in and out', 'keep' + A.id, 60);
    }
  }
  // `blocked(A)`: is the way out of A blocked for the learner where they are now (the Bot lab reads this too)
  return { areas, log, update, blocked, reset() { state.clear(); log.length = 0; } };
}
