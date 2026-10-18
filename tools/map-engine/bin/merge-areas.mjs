#!/usr/bin/env node
// Merges the per-area map files back into one network you can drive end to end.
//
// split_areas.mjs gives every area a margin so each one is self-contained, which means
// roughly half of all edges appear in more than one file (some in five). A naive
// concatenation would double the geometry, the traffic and the examiner's fault checks,
// so edges are deduplicated by their polyline and each surviving edge keeps the features
// contributed by the single area it was taken from — signal clusters stay consistent
// that way, which they would not if two areas each described the same junction.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const [dir, out = 'merged.json'] = process.argv.slice(2);
if (!dir) { console.error('usage: merge-areas.mjs <areas-dir> [out.json]'); process.exit(1); }

const files = readdirSync(dir).filter(n => /^a\d+\.json$/.test(n))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

const names = [], nameIx = new Map(), classes = [], classIx = new Map();
const nodes = [], nodeIx = new Map(), ways = [], wayIx = new Map();
const edges = [], edgeIx = new Map(), edgeArea = [];
const stops = [], zebras = [], giveways = [], minis = [], rbs = [];
const miniSeen = new Set(), rbSeen = new Set();
let box = null, meta = null, clusterBase = 0, dupEdges = 0;

const intern = (arr, map, v) => { let i = map.get(v); if (i === undefined) { i = arr.length; arr.push(v); map.set(v, i); } return i; };
const nodeAt = (x, z) => { const k = x + ',' + z; let i = nodeIx.get(k); if (i === undefined) { i = nodes.length / 2; nodes.push(x, z); nodeIx.set(k, i); } return i; };

for (const file of files) {
  const d = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  if (!meta) meta = { version: d.version, source: d.source, origin: d.origin, kx: d.kx, kz: d.kz };
  box = box ? [Math.min(box[0], d.area.box[0]), Math.min(box[1], d.area.box[1]),
               Math.max(box[2], d.area.box[2]), Math.max(box[3], d.area.box[3])] : d.area.box.slice();

  // Way records differ only by their name and class indices, so re-intern both.
  const wayMap = d.ways.map(w => {
    const rec = [intern(names, nameIx, d.names[w[0]]), intern(classes, classIx, d.classes[w[1]]), ...w.slice(2)];
    return intern(ways, wayIx, JSON.stringify(rec));
  });

  const edgeMap = new Array(d.edges.length).fill(-1);
  d.edges.forEach(([a, b, wi, flat], i) => {
    const key = flat.join(',');                       // the polyline identifies the edge
    const hit = edgeIx.get(key);
    if (hit !== undefined) { edgeMap[i] = hit; dupEdges++; return; }
    const id = edges.length;
    edges.push([nodeAt(d.nodes[2 * a], d.nodes[2 * a + 1]), nodeAt(d.nodes[2 * b], d.nodes[2 * b + 1]), wayMap[wi], flat]);
    edgeIx.set(key, id); edgeMap[i] = id; edgeArea[id] = file;
  });

  // Only take a feature when this file also supplied the edge it sits on.
  const mine = i => edgeMap[i] >= 0 && edgeArea[edgeMap[i]] === file;
  let maxCluster = 0;
  for (const [ei, s, dir, cluster, group] of d.stops) {
    maxCluster = Math.max(maxCluster, (cluster || 0) + 1);
    if (mine(ei)) stops.push([edgeMap[ei], s, dir, (cluster || 0) + clusterBase, group]);
  }
  clusterBase += maxCluster;                           // keep junctions from different files apart
  for (const [ei, s] of d.zebras) if (mine(ei)) zebras.push([edgeMap[ei], s]);
  for (const [ei, s, dir, stop] of d.giveways) if (mine(ei)) giveways.push([edgeMap[ei], s, dir, stop]);
  for (const m of d.minis) { const k = m.join(','); if (!miniSeen.has(k)) { miniSeen.add(k); minis.push(m); } }
  for (const r of d.rbs) { const k = r.slice(0, 2).join(','); if (!rbSeen.has(k)) { rbSeen.add(k); rbs.push(r); } }
}

// ways were interned as JSON strings so identical records collapse; emit them as arrays again.
const wayRecords = ways.map(w => JSON.parse(w));
const merged = { ...meta, classes, area: { id: 'all', box }, names, ways: wayRecords, nodes, edges, stops, zebras, giveways, minis, rbs, arrows: [] };
writeFileSync(out, JSON.stringify(merged));
const assumed = wayRecords.filter(w => w[3]).length;
console.log(`${files.length} areas -> ${out}`);
console.log(`  edges    ${edges.length}  (dropped ${dupEdges} duplicates)`);
console.log(`  nodes    ${nodes.length / 2}   ways ${wayRecords.length}  (${assumed} assumed, ${Math.round(assumed * 100 / wayRecords.length)}%)`);
console.log(`  stops ${stops.length}  zebras ${zebras.length}  giveways ${giveways.length}  minis ${minis.length}  rbs ${rbs.length}`);
console.log(`  extent   ${box[2] - box[0]} x ${box[3] - box[1]} dm`);
