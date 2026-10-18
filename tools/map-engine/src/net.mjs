// Minimal read-only loader for an area file, plus "which way is nearest to this point?".
// Deliberately mirrors js/net.js in the sim so a snap here lands where the sim thinks it is.
const CELL = 40;
const key = (cx, cz) => (cx + 4000) * 8192 + (cz + 4000);

export function buildNet(d) {
  const ways = d.ways.map((w, i) => ({
    i, name: d.names[w[0]], cls: d.classes[w[1]], mph: w[2], assumed: !!w[3],
    oneway: w[4], w: w[5], rb: !!w[6], lanes: w[7], cl: w[8] || 0, cr: w[9] || 0,
  }));
  const edges = d.edges.map(([a, b, wi, f], id) => {
    const n = f.length / 2, px = new Float64Array(n), pz = new Float64Array(n);
    for (let i = 0; i < n; i++) { px[i] = f[2 * i] / 10; pz[i] = f[2 * i + 1] / 10; }
    return { id, a, b, way: ways[wi], px, pz, n };
  });
  // Bucket every segment into 40 m cells so nearest() looks at a handful, not all 30k.
  const grid = new Map();
  for (const e of edges) for (let i = 0; i < e.n - 1; i++) {
    const x0 = Math.min(e.px[i], e.px[i + 1]) - 12, x1 = Math.max(e.px[i], e.px[i + 1]) + 12;
    const z0 = Math.min(e.pz[i], e.pz[i + 1]) - 12, z1 = Math.max(e.pz[i], e.pz[i + 1]) + 12;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([e, i]);
      }
  }
  return { origin: d.origin, kx: d.kx, kz: d.kz, ways, edges, grid, area: d.area };
}

// Closest point on the road network. Returns the way, the distance, and the local
// tangent — the tangent is what tells us which side of the road a sign sits on.
export function nearest(net, x, z, radius = 25) {
  let best = null;
  const r = Math.ceil(radius / CELL);
  const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
  for (let cx = cx0 - r; cx <= cx0 + r; cx++) for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
    const bucket = net.grid.get(key(cx, cz)); if (!bucket) continue;
    for (const [e, i] of bucket) {
      const ax = e.px[i], az = e.pz[i], bx = e.px[i + 1], bz = e.pz[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) {
        const L = Math.sqrt(L2);
        best = { d, e, way: e.way, x: qx, z: qz, tx: dx / L, tz: dz / L, seg: i, t };
      }
    }
  }
  if (best) {
    // Cross product of the way tangent with the offset: +1 is the way's left, -1 its right.
    const ox = x - best.x, oz = z - best.z;
    best.side = Math.sign(best.tx * oz - best.tz * ox) || 1;
  }
  return best && best.d <= radius ? best : null;
}
