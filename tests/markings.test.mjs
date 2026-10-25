// Junction markings (issue #4): lane and centre lines stop at the junction and never run across it, carry
// on through bends and lane changes, and give-way lines sit at the mouth of the junction, one per approach.
// Checked on hand-built fixtures (a T-junction, a crossroads, a bend, a change of lane count) and on every
// Cambridge area the mock tests drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNet, posAt } from '../js/net.js';
import { lineDashes, isJunction, junctionBox, giveWayDist, toNode, facedNode, nodeDegree } from '../js/markings.js';
import { Builder } from '../tools/layouts.mjs';

const area = (id) => JSON.parse(fs.readFileSync(new URL(`../data/areas/${id}.json`, import.meta.url)));
// every dash end, as a point on the road
const dashPoints = (net) => net.edges.flatMap(e => lineDashes(net, e).flatMap(d => [d.s, d.s + d.len].map(s => { const p = posAt(e, s); return { x: p.x + p.tz * d.off, z: p.z - p.tx * d.off, e }; })));
// dashes inside a junction: nearer a junction node than the reach of the other roads there
function insideJunctions(net) {
  const J = []; for (let v = 0; v < net.nx.length; v++) if (isJunction(net, v) && !net.inc[v].some(o => o.e.way.rb)) J.push(v);
  const bad = [];
  for (const p of dashPoints(net)) for (const v of J) {
    const d = Math.hypot(p.x - net.nx[v], p.z - net.nz[v]); if (d > 20) continue;
    if (net.inc[v].some(o => o.e === p.e) ? d < junctionBox(net, v, p.e) : d < Math.max(...net.inc[v].map(o => o.e.way.w / 2)) - 0.2) bad.push({ v, d: +d.toFixed(1), road: p.e.way.name });
  }
  return bad;
}

function fixtures() {
  const B = new Builder('fixtures'), main = { name: 'Main Road', cls: 'secondary', w: 7.3 };
  // a T-junction: Side Street gives way to Main Road; its give-way line was put inside the junction and twice
  B.road(main, [[0, 0], [100, 0], [200, 0]]);
  B.road({ name: 'Side Street', cls: 'residential', w: 6.5 }, [[100, 0], [100, 120]]);
  B.giveWay([[100, 120], [100, 0]], 1.5); B.giveWay([[100, 120], [100, 0]], 9);
  // a crossroads with a wider road crossing
  B.road({ name: 'Cross Avenue', cls: 'primary', w: 10, lanes: 4 }, [[200, -150], [200, 0], [200, 150]]);
  B.road({ name: 'Main Road', cls: 'secondary', w: 7.3 }, [[200, 0], [320, 0]]);
  // a bend (two edges meeting at an angle) and a change from four lanes to two, both junction-free
  B.road({ name: 'Bend Road', cls: 'primary', w: 7.3 }, [[320, 0], [400, 0], [460, 60]]);
  B.road({ name: 'Wide Road', cls: 'primary', w: 13, lanes: 4 }, [[460, 60], [520, 120]]);
  B.road({ name: 'Wide Road', cls: 'primary', w: 7.3, lanes: 2 }, [[520, 120], [600, 200]]);
  return B;
}

test('fixtures: lines stop at T-junctions and crossroads, and run on through a bend and a lane change', () => {
  const net = buildNet(fixtures().toJSON()), at = (x, z) => [...net.nx].findIndex((_, v) => Math.abs(net.nx[v] - x) < 0.1 && Math.abs(net.nz[v] - z) < 0.1);
  assert.deepEqual(insideJunctions(net), [], 'lines inside a junction');
  assert.equal(nodeDegree(net, at(100, 0)), 3); assert.equal(nodeDegree(net, at(200, 0)), 4);
  // through the bend and the lane change there is a dash within one cycle either side of the node
  for (const [x, z] of [[400, 0], [520, 120]]) {
    const near = dashPoints(net).filter(p => Math.hypot(p.x - x, p.z - z) < 9.5);
    assert.ok(near.length >= 2, `the lines stop at ${x},${z}, which is not a junction`);
  }
  // the side road's two give-way lines become one, at the mouth of the junction
  const gw = net.giveways.filter(g => g.e.way.name === 'Side Street');
  assert.equal(gw.length, 1, 'one give-way line per approach');
  assert.ok(Math.abs(toNode(gw[0]) - giveWayDist(net, facedNode(gw[0]), gw[0].e)) < 0.01, `give-way ${toNode(gw[0]).toFixed(2)} m from the node`);
  // and the side road's centre line... it has none (residential), but Main Road's stops short of the side road
  const mainNearT = dashPoints(net).filter(p => p.e.way.name === 'Main Road' && Math.hypot(p.x - 100, p.z) < giveWayDist(net, at(100, 0), gw[0].e));
  assert.deepEqual(mainNearT, []);
});

for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'town', 'rbs']) test(`${id}: no lane or centre line inside a junction; give-way lines at the mouth, one per approach`, () => {
  const net = buildNet(area(id));
  const bad = insideJunctions(net);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} dash ends inside junctions`);
  const seen = new Map();
  for (const g of net.giveways) {
    const v = facedNode(g), k = g.e.id + ':' + g.dir;
    if (isJunction(net, v)) assert.ok(toNode(g) >= junctionBox(net, v, g.e) - 0.01, `${g.e.way.name}: a give-way line ${toNode(g).toFixed(1)} m from the node, inside the junction`);
    for (const h of seen.get(k) || []) assert.ok(Math.abs(h.s - g.s) >= 3, `${g.e.way.name}: two give-way lines on one approach`);
    seen.set(k, [...(seen.get(k) || []), g]);
  }
  for (const st of net.stops) if (!st.single && isJunction(net, facedNode(st))) assert.ok(toNode(st) >= junctionBox(net, facedNode(st), st.e) - 0.01, `${st.e.way.name}: a stop line inside the junction`);
});

// ---------- export and import (tools/markings.mjs) ----------
import { exportMarkings, importMarkings, edgeKey } from '../js/marking-io.js';

test('edge keys match the road inspector\'s', () => {
  const d = JSON.parse(fs.readFileSync(new URL('../data/cambridge.json', import.meta.url))), set = JSON.parse(fs.readFileSync(new URL('../data/corrections/cambridge-1.json', import.meta.url)));
  const keys = new Set(d.edges.map((_, ei) => edgeKey(d, ei))), roads = new Set([...keys].map(k => k.replace(/:[0-9a-f]{1,8}$/, '')));
  const exact = set.markings.filter(m => keys.has(m.edgeKey)).length, byRoad = set.markings.filter(m => roads.has(m.edgeKey.replace(/:[0-9a-f]{1,8}$/, ''))).length;
  assert.ok(exact > 0, 'no inspector key matched exactly');
  assert.equal(byRoad, set.markings.length, 'every marking in the correction set finds its road');
});

for (const id of ['a1', 'town', 'rbs']) test(`${id}: markings survive export and import: position, heading, direction and kind`, () => {
  const d = area(id), set = exportMarkings(d);
  assert.ok(set.markings.length > 10);
  const bare = { ...d, giveways: [], stops: [], zebras: [], keepClear: [], boxes: [] };
  const { data, report } = importMarkings(bare, JSON.parse(JSON.stringify(set)));
  assert.equal(report.unmatched.length, 0); assert.equal(report.applied, set.markings.length);
  for (const k of ['giveways', 'stops', 'zebras']) assert.deepEqual(data[k], d[k], `${k} changed in the round trip`);
  assert.deepEqual(data.keepClear || [], d.keepClear || []);
  assert.deepEqual(data.boxes || [], d.boxes || []);
  assert.deepEqual(exportMarkings(data), set, 'a second export differs');
  // and the world built from it is the same: the same lines in the same places
  const a = buildNet(d), b = buildNet(data), pos = (n) => n.giveways.map(g => [g.e.id, g.dir, +g.x.toFixed(2), +g.z.toFixed(2)]);
  assert.deepEqual(pos(b), pos(a));
});

test('direction from the heading alone, and a merge never doubles a marking', () => {
  const d = area('town'), set = exportMarkings(d);
  const noDir = { version: 1, markings: set.markings.map(({ dir, ...m }) => m) };
  const { data } = importMarkings({ ...d, giveways: [], stops: [], zebras: [], keepClear: [], boxes: [] }, noDir);
  assert.deepEqual(data.giveways, d.giveways, 'direction recovered from heading');
  const again = importMarkings(d, set, { merge: true });
  assert.equal(again.report.applied, 0); assert.equal(again.report.duplicates, set.markings.length);
  assert.deepEqual(data.boxes, d.boxes, 'the box keeps its node');
  for (const k of ['giveways', 'stops', 'zebras', 'keepClear', 'boxes']) assert.deepEqual(again.data[k], d[k]);
});

test('KEEP CLEAR is configured, never applied by rule: one in the practice town, none on the Cambridge map', () => {
  const town = buildNet(area('town'));
  assert.equal(town.keepClear.length, 1);
  const k = town.keepClear[0]; assert.equal(k.e.way.name, 'High Street'); assert.equal(k.dir, -1);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) assert.equal(buildNet(area(id)).keepClear.length, 0);
});
