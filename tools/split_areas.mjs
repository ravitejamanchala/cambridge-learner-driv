// Builds every map area the sim can load, and the index that says which drive uses which area.
//  - Mock tests run on real Cambridge roads: the full road network is cut into small areas, one per group
//    of nearby routes, so the sim only downloads the part of the city a test uses.
//  - Lessons and puzzles run on purpose-built practice layouts (tools/layouts.mjs), named by their `area`.
//
//   node tools/split_areas.mjs            (run from the project root after editing routes, lessons, puzzles or layouts)
//
// Reads data/cambridge.json (the full OpenStreetMap build), writes data/areas/<id>.json and data/areas/index.json.
// Cambridge areas keep the full map's origin, so waypoints (lat/lon) work the same in every area.
import fs from 'fs';
import path from 'path';
import { buildNet, buildRoute, snapWaypoint } from '../js/net.js';
import { ROUTES } from '../js/config.js';
import { LESSONS } from '../js/course.js';
import { PUZZLES } from '../js/puzzles.js';
import { buildLayout, LAYOUTS } from './layouts.mjs';

const SRC = 'data/cambridge.json', OUT = 'data/areas';
const MARGIN = 650;        // metres of surrounding streets kept round each route (fog hides what is beyond)
const MAX_AREA = 9e6;      // don't merge groups into areas bigger than ~9 km²
const full = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const net = buildNet(full);

const plans = ROUTES.map(r => ({ key: 'route:' + r.id, name: r.name, wps: r.waypoints }));
const practice = [
  ...LESSONS.filter(l => l.waypoints).map(l => ({ key: 'lesson:' + l.id, name: l.title, wps: l.waypoints, area: l.area })),
  ...PUZZLES.map(p => ({ key: 'puzzle:' + p.id, name: p.title, wps: p.waypoints, area: p.area }))
];
for (const p of plans) {
  const r = buildRoute(net, p.wps.map(w => snapWaypoint(net, w)));
  p.route = r; p.used = new Set(r.steps.map(s => s.e.id));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < r.xs.length; i++) { x0 = Math.min(x0, r.xs[i]); x1 = Math.max(x1, r.xs[i]); z0 = Math.min(z0, r.zs[i]); z1 = Math.max(z1, r.zs[i]); }
  p.box = [x0 - MARGIN, z0 - MARGIN, x1 + MARGIN, z1 + MARGIN];
}

// group drives whose boxes overlap into shared areas
const size = b => (b[2] - b[0]) * (b[3] - b[1]);
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
let groups = plans.map(p => ({ box: p.box, plans: [p] }));
for (let changed = true; changed;) {
  changed = false;
  for (let i = 0; i < groups.length && !changed; i++) for (let j = i + 1; j < groups.length && !changed; j++) {
    const u = union(groups[i].box, groups[j].box);
    if (size(u) <= MAX_AREA && size(u) < size(groups[i].box) + size(groups[j].box)) {
      groups[i] = { box: u, plans: groups[i].plans.concat(groups[j].plans) }; groups.splice(j, 1); changed = true;
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));
const index = { version: 1, source: SRC, areas: [], plans: {} };
const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

groups.forEach((g, gi) => {
  const id = 'a' + (gi + 1), b = g.box, used = new Set(g.plans.flatMap(p => [...p.used]));
  // keep edges that touch the box; drop fast trunk roads that only pass over or under it (A14 flyovers)
  const keepE = [], rbNodes = new Set();
  full.edges.forEach(ed => { if (full.ways[ed[2]][6]) { rbNodes.add(ed[0]); rbNodes.add(ed[1]); } });
  full.edges.forEach((ed, ei) => {
    const f = ed[3]; let inside = false;
    for (let k = 0; k < f.length && !inside; k += 2) inside = inBox(b, f[k] / 10, f[k + 1] / 10);
    if (!inside) return;
    const w = full.ways[ed[2]], cls = full.classes[w[1]];
    // keep slip roads that join a roundabout, so exit counts stay right (Histon / Milton interchanges)
    if (!used.has(ei) && /^(motorway|trunk)/.test(cls) && w[2] >= 60 && !w[6] && !rbNodes.has(ed[0]) && !rbNodes.has(ed[1])) return;
    keepE.push(ei);
  });
  const nodeMap = new Map(), wayMap = new Map(), nameMap = new Map(), edgeMap = new Map();
  const nodes = [], ways = [], names = [], edges = [];
  const mapNode = v => { if (!nodeMap.has(v)) { nodeMap.set(v, nodes.length / 2); nodes.push(full.nodes[2 * v], full.nodes[2 * v + 1]); } return nodeMap.get(v); };
  const mapName = n => { if (!nameMap.has(n)) { nameMap.set(n, names.length); names.push(full.names[n]); } return nameMap.get(n); };
  const mapWay = wi => { if (!wayMap.has(wi)) { const w = full.ways[wi].slice(); w[0] = mapName(w[0]); wayMap.set(wi, ways.length); ways.push(w); } return wayMap.get(wi); };
  for (const ei of keepE) { const [a, bb, wi, f] = full.edges[ei]; edgeMap.set(ei, edges.length); edges.push([mapNode(a), mapNode(bb), mapWay(wi), f]); }
  const remap = (list) => list.filter(it => edgeMap.has(it[0])).map(it => [edgeMap.get(it[0]), ...it.slice(1)]);
  const area = {
    version: full.version, source: full.source, origin: full.origin, kx: full.kx, kz: full.kz, classes: full.classes,
    area: { id, box: b.map(Math.round) }, names, ways, nodes, edges,
    stops: remap(full.stops), zebras: remap(full.zebras), giveways: remap(full.giveways),
    minis: full.minis.filter(([x, z]) => inBox(b, x / 10, z / 10)), rbs: full.rbs.filter(([x, z]) => inBox(b, x / 10, z / 10))
  };
  const file = id + '.json', txt = JSON.stringify(area);
  fs.writeFileSync(path.join(OUT, file), txt);
  // check every drive in this area still routes the same way on the cut-down map
  const sub = buildNet(area);
  for (const p of g.plans) {
    const r = buildRoute(sub, p.wps.map(w => snapWaypoint(sub, w)));
    const txt = (x) => x.instructions.map(i => i.text).join('|');
    const ok = Math.abs(r.len - p.route.len) < 2 && txt(r) === txt(p.route); // same route and the same examiner instructions
    if (!ok) console.warn(`  ! ${p.key}: route differs on area map (${Math.round(r.len)} m vs ${Math.round(p.route.len)} m)`);
    index.plans[p.key] = { area: id, len: Math.round(r.len), n: r.instructions.length, first: r.instructions[0].text };
  }
  index.areas.push({ id, file, kb: Math.round(txt.length / 1024), edges: edges.length, plans: g.plans.map(p => p.key) });
  console.log(`${id}: ${Math.round(txt.length / 1024)} KB, ${edges.length} edges, ${g.plans.map(p => p.key).join(', ')}`);
});
// practice layouts: every lesson and puzzle names its layout
for (const id of Object.keys(LAYOUTS)) {
  const area = buildLayout(id), sub = buildNet(area), mine = practice.filter(p => p.area === id), file = id + '.json', txt = JSON.stringify(area);
  fs.writeFileSync(path.join(OUT, file), txt);
  for (const p of mine) {
    const r = buildRoute(sub, p.wps.map(w => snapWaypoint(sub, w)));
    const f = r.instructions.find(i => !i.final), s0 = f ? Math.max(0, f.s - 137) : 0; // drives start 150 yards before the first junction (main.js)
    index.plans[p.key] = { area: id, len: Math.round(r.len - s0), n: r.instructions.length, first: r.instructions[0].text };
    if (process.argv.includes('-v')) console.log(`  ${p.key} ${Math.round(r.len)} m\n${r.instructions.map(i => `     ${Math.round(i.s)}  ${i.text}${i.signal ? '  [signal ' + i.signal + ']' : ''}`).join('\n')}`);
  }
  index.areas.push({ id, file, kb: Math.round(txt.length / 1024), edges: area.edges.length, plans: mine.map(p => p.key) });
  console.log(`${id}: practice layout, ${Math.round(txt.length / 1024)} KB, ${area.edges.length} edges, ${mine.length} drives`);
}
const missing = practice.filter(p => !index.plans[p.key]); if (missing.length) throw new Error('No practice layout for ' + missing.map(p => p.key).join(', '));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`${groups.length} areas from ${plans.length} drives (full map ${Math.round(fs.statSync(SRC).size / 1024)} KB).`);
