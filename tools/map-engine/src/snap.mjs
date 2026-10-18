import { nearest } from './net.mjs';
import { projector } from './project.mjs';
import { parseSign } from './signs.mjs';

// Reject a detection when two roads are near enough that we would be guessing which
// one it governs. Junctions are exactly where a wrong guess causes an unfair fault.
const AMBIGUOUS_M = 4;

export function snapFeatures(net, features, { maxDist = 8, radius = 25 } = {}) {
  const P = projector(net);
  const out = [], skipped = { unparsed: 0, far: 0, ambiguous: 0 };
  for (const f of features) {
    const sign = parseSign(f.value);
    if (!sign) { skipped.unparsed++; continue; }
    const [x, z] = P.toLocal(f.lon, f.lat);
    const hit = nearest(net, x, z, radius);
    if (!hit || hit.d > maxDist) { skipped.far++; continue; }
    // Second opinion: the nearest point on any OTHER way. Too close and we abstain.
    const other = nearestExcluding(net, x, z, hit.way.i, radius);
    if (other && other.d - hit.d < AMBIGUOUS_M) { skipped.ambiguous++; continue; }
    out.push({
      id: f.id, sign, wayIndex: hit.way.i, wayName: hit.way.name,
      dist: +hit.d.toFixed(2), side: hit.side, seenCount: f.seenCount ?? 1,
      lastSeen: f.lastSeen ?? null, x: +x.toFixed(1), z: +z.toFixed(1),
    });
  }
  return { snapped: out, skipped };
}

function nearestExcluding(net, x, z, wayIndex, radius) {
  // Cheap approach: widen the search, then ignore hits on the way we already chose.
  // Good enough at junction scale; the grid keeps it fast.
  let best = null;
  for (let r = 6; r <= radius; r += 6) {
    const h = nearest(net, x, z, r);
    if (h && h.way.i !== wayIndex) { best = h; break; }
  }
  return best;
}

// Which speed limits can we now state instead of assume?
export function speedFixes(net, snapped, { minSeen = 1 } = {}) {
  const byWay = new Map();
  for (const s of snapped) {
    if (s.sign.kind !== 'speed' || s.seenCount < minSeen) continue;
    const w = net.ways[s.wayIndex];
    const e = byWay.get(s.wayIndex) || { way: w, votes: new Map(), n: 0 };
    e.votes.set(s.sign.mph, (e.votes.get(s.sign.mph) || 0) + 1); e.n++;
    byWay.set(s.wayIndex, e);
  }
  const fixes = [];
  for (const [i, e] of byWay) {
    const [mph, votes] = [...e.votes].sort((a, b) => b[1] - a[1])[0];
    fixes.push({
      wayIndex: i, name: e.way.name, wasAssumed: e.way.assumed,
      oldMph: e.way.mph, newMph: mph, votes, total: e.n,
      agrees: e.way.mph === mph, conflict: !e.way.assumed && e.way.mph !== mph,
    });
  }
  return fixes;
}
