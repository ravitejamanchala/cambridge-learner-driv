// Road markings in and out of a map file (issue #4), in the format the road inspector writes
// (data/corrections): one entry per marking, tied to its road by an edge key, with its position along the
// road, the way it faces and what it is. Works on the raw map JSON (data/cambridge.json, an area, or a
// practice layout), so `tools/markings.mjs` can export a map's markings, a person can adjust them, and
// importing the file puts them back exactly.
//
//   giveway     a give-way line           giveways  [edge, s, dir, 0]
//   stop        a surveyed stop line      giveways  [edge, s, dir, 1]
//   signal-stop a traffic-light stop line stops     [edge, s, dir, cluster, group]
//   zebra       a zebra crossing          zebras    [edge, s]
//   keepclear   KEEP CLEAR in the lanes   keepClear [edge, s, dir, len]
//
// s is metres along the edge in its own direction; dir is +1 travelling with the edge, -1 against it.
// heading is the compass bearing of travel there (degrees, north 0, east 90), carried for people and
// tools reading the file: on import, dir is taken from it when a marking has no dir of its own.

// FNV-1a over the edge's polyline, as the inspector keys edges
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }; // unpadded, as the inspector writes it
const roadOf = (d, ei) => { const [, , wi, f] = d.edges[ei], w = d.ways[wi]; return `${d.names[w[0]]}:${d.classes[w[1]]}|${f[0]},${f[1]}:${f[f.length - 2]},${f[f.length - 1]}`; };
export const edgeKey = (d, ei) => `${roadOf(d, ei)}:${fnv(JSON.stringify(d.edges[ei][3]))}`;

// position and direction at s metres along edge ei of raw map data (decimetre polyline)
function pointAt(d, ei, s) {
  const f = d.edges[ei][3]; let run = 0;
  for (let i = 0; i + 3 < f.length; i += 2) {
    const dx = (f[i + 2] - f[i]) / 10, dz = (f[i + 3] - f[i + 1]) / 10, L = Math.hypot(dx, dz);
    if (run + L >= s || i + 4 >= f.length) { const u = L ? Math.min(1, (s - run) / L) : 0; return { x: f[i] / 10 + dx * u, z: f[i + 1] / 10 + dz * u, tx: dx / (L || 1), tz: dz / (L || 1) }; }
    run += L;
  }
  return { x: f[0] / 10, z: f[1] / 10, tx: 1, tz: 0 };
}
const edgeLen = (d, ei) => { const f = d.edges[ei][3]; let L = 0; for (let i = 0; i + 3 < f.length; i += 2) L += Math.hypot(f[i + 2] - f[i], f[i + 3] - f[i + 1]) / 10; return L; };
const bearing = (d, ei, s, dir) => { const p = pointAt(d, ei, s), b = Math.atan2(p.tx * dir, -p.tz * dir) * 180 / Math.PI; return +((b + 360) % 360).toFixed(1); };
const r2 = (v) => +v.toFixed(2);

export function exportMarkings(d) {
  const out = [], put = (type, ei, sDm, dir, extra = {}) => { const s = sDm / 10; out.push({ edgeKey: edgeKey(d, ei), type, s: r2(s), dir, heading: bearing(d, ei, s, dir), ...extra }); };
  for (const [ei, s, dir, stop] of d.giveways || []) put(stop ? 'stop' : 'giveway', ei, s, dir);
  for (const [ei, s, dir, cluster, group] of d.stops || []) put('signal-stop', ei, s, dir, { cluster, group });
  for (const [ei, s] of d.zebras || []) put('zebra', ei, s, 1);
  for (const [ei, s, dir, len] of d.keepClear || []) put('keepclear', ei, s, dir, { length: r2((len || 100) / 10) });
  return { version: 1, markings: out };
}

// Put a set of markings into map data, returning new data and what happened. By default the set replaces
// every kind of marking it contains. With { merge: true } it adds to what is there, skipping any marking
// within 12 m of one the map already has: a line beside a line (give-way, stop or traffic-light stop line,
// facing the same way), a crossing beside a crossing. A second line beside the first would have a learner
// marked twice. Edges are matched by key; an edge whose shape has since been corrected keeps its name,
// class and end points, and is matched by those.
// a marking of the same family within 12 m of edge ei at s, facing within 60 degrees of dir
function nearby(d, type, ei, s, dir) {
  const p = pointAt(d, ei, s), fam = type === 'zebra' ? ['zebras'] : type === 'keepclear' ? ['keepClear'] : ['giveways', 'stops'];
  return fam.some(k => (d[k] || []).some(r => { const q = pointAt(d, r[0], r[1] / 10);
    if (Math.hypot(q.x - p.x, q.z - p.z) >= 12) return false;
    return k === 'zebras' || (q.tx * (r[2] || 1)) * (p.tx * dir) + (q.tz * (r[2] || 1)) * (p.tz * dir) > 0.5; }));
}
export function importMarkings(d, set, { merge = false } = {}) {
  const byKey = new Map(), byRoad = new Map();
  d.edges.forEach((_, ei) => { byKey.set(edgeKey(d, ei), ei); byRoad.set(roadOf(d, ei), ei); });
  const LIST = { giveway: 'giveways', stop: 'giveways', 'signal-stop': 'stops', zebra: 'zebras', keepclear: 'keepClear' };
  const next = { ...d }, report = { applied: 0, unmatched: [], duplicates: 0 };
  const kinds = new Set(set.markings.map(m => LIST[m.type]).filter(Boolean));
  for (const k of kinds) next[k] = merge ? [...(d[k] || [])] : [];
  for (const m of set.markings) {
    const list = LIST[m.type]; if (!list) { report.unmatched.push({ ...m, why: 'unknown type' }); continue; }
    const ei = byKey.get(m.edgeKey) ?? byRoad.get(m.edgeKey.replace(/:[0-9a-f]{1,8}$/, ''));
    if (ei === undefined) { report.unmatched.push({ ...m, why: 'no such road' }); continue; }
    const len = edgeLen(d, ei), s = Math.max(0, Math.min(len, m.s));
    let dir = m.dir;
    if (dir !== 1 && dir !== -1) {
      if (typeof m.heading === 'number') { const p = pointAt(d, ei, s), h = m.heading * Math.PI / 180; dir = p.tx * Math.sin(h) - p.tz * Math.cos(h) >= 0 ? 1 : -1; }
      else dir = s < len / 2 ? -1 : 1; // no direction given: facing the nearer end, the junction it serves
    }
    const sDm = Math.round(s * 10);
    const row = m.type === 'zebra' ? [ei, sDm] : m.type === 'keepclear' ? [ei, sDm, dir, Math.round((m.length || 10) * 10)]
      : m.type === 'signal-stop' ? [ei, sDm, dir, m.cluster ?? 0, m.group ?? 0] : [ei, sDm, dir, m.type === 'stop' ? 1 : 0];
    const twin = merge ? nearby(next, m.type, ei, s, dir) : next[list].find(r => r[0] === ei && Math.abs(r[1] - sDm) < 5 && (m.type === 'zebra' || r[2] === dir) && (list !== 'giveways' || !!r[3] === (m.type === 'stop')));
    if (twin) { report.duplicates++; continue; }
    next[list].push(row); report.applied++;
  }
  return { data: next, report };
}
