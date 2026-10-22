import {posAt} from './net.js';
// ribbon along an edge polyline, offsets o1..o2 from centreline (left positive)
export function ribbon(acc, e, o1, o2, y, s0 = 0, s1 = e.len) {
  const pts = [];
  for (let i = 0; i < e.n; i++) if (e.cum[i] > s0 && e.cum[i] < s1) pts.push(i);
  const P = [posAt(e, s0)]; for (const i of pts) { const a = posAt(e, e.cum[i] - 0.01), b = posAt(e, e.cum[i] + 0.01); P.push({ x: e.px[i], z: e.pz[i], tx: (a.tx + b.tx) / 2, tz: (a.tz + b.tz) / 2 }); }
  P.push(posAt(e, s1));
  for (let i = 0; i < P.length - 1; i++) {
    const p = P[i], q = P[i + 1];
    const pl = Math.hypot(p.tx, p.tz) || 1, ql = Math.hypot(q.tx, q.tz) || 1;
    const pnx = p.tz / pl, pnz = -p.tx / pl, qnx = q.tz / ql, qnz = -q.tx / ql;
    acc.quad(p.x + pnx * o1, p.z + pnz * o1, p.x + pnx * o2, p.z + pnz * o2, q.x + qnx * o2, q.z + qnz * o2, q.x + qnx * o1, q.z + qnz * o1, y);
  }
}

export function dash(acc, e, s, len, off, y, width = .1) {
  // Use the same bend vertices and offsets as the road surface.
  ribbon(acc, e, off - width / 2, off + width / 2, y, s, Math.min(e.len, s + len));
}

export function roadBoundsVisible(bounds,x,z,radius) {
 return Math.hypot(Math.max(bounds.min.x-x,0,x-bounds.max.x),Math.max(bounds.min.z-z,0,z-bounds.max.z)) < radius;
}
