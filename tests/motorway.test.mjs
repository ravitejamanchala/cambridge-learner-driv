// The motorway worlds (issue #6): geometry of the circuit, the committed area files, and the free-drive
// summary, which must only ever report what was measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNet, buildRoute, snapWaypoint, paved } from '../js/net.js';
import { MW, JUNCTIONS, centreLine, circuitLength, onCarriageway, separation } from '../js/motorway.js';
import { FREE_DRIVES, createFreeStats, stepFreeStats, freeSummaryLines } from '../js/free-drive.js';
import { buildLayout } from '../tools/layouts.mjs';

const area = (id) => JSON.parse(fs.readFileSync(`data/areas/${id}.json`, 'utf8'));

test('the circuit is a closed loop with no corner tighter than a motorway allows', () => {
  const line = centreLine(), n = line.length;
  assert.ok(Math.abs(circuitLength() - 24069) < 50, `circuit is ${circuitLength()} m`);
  const a = line[0], b = line[n - 1];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < MW.step * 1.5, 'the centre line does not close');
  // tightest radius from three points 60 m apart
  let tight = Infinity;
  for (let i = 0; i < n; i += 1) {
    const p = line[i], q = line[(i + 3) % n], r = line[(i + 6) % n];
    const ab = Math.hypot(q.x - p.x, q.z - p.z), bc = Math.hypot(r.x - q.x, r.z - q.z), ca = Math.hypot(p.x - r.x, p.z - r.z);
    const area2 = Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    if (area2 > 1e-6) tight = Math.min(tight, ab * bc * ca / (2 * area2));
  }
  assert.ok(tight > 720, `a bend of radius ${Math.round(tight)} m is too tight for 70 mph`);
});

test('the two carriageways sit either side of the central reservation', () => {
  const line = centreLine();
  for (const lanes of [2, 3]) for (const s of [0, 3000, 9000, 15000]) {
    const a = onCarriageway(line, lanes, 'A', s), b = onCarriageway(line, lanes, 'B', s);
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 2 * separation(lanes)) < 0.5, `${lanes} lanes at ${s} m`);
  }
});

for (const id of ['m2', 'm3']) test(`${id}: the committed area matches the layout and has every junction`, () => {
  const lanes = +id[1], d = area(id);
  assert.deepEqual(d, JSON.parse(JSON.stringify(buildLayout(id))), 'data/areas is stale: run node tools/split_areas.mjs');
  const net = buildNet(d), mw = net.edges.filter(e => e.way.cls === 'motorway');
  assert.ok(mw.every(e => e.way.lanes === lanes && e.way.oneway && e.way.mph === 70), 'a carriageway has the wrong lanes or limit');
  assert.ok(mw.every(e => e.way.hs > 3), 'a carriageway has no hard shoulder');
  assert.ok(mw.every(e => paved(e.way) === e.way.w / 2 + e.way.hs), 'paved width ignores the hard shoulder');
  assert.ok(net.edges.every(e => e.len > 5), 'an edge too short to mark');
  // one exit slip and one entry slip per junction and carriageway
  const touches = (n) => net.out[n].some(o => o.e.way.cls === 'motorway');
  const exits = net.edges.filter(e => e.way.cls === 'motorway_link' && touches(e.a)), entries = net.edges.filter(e => e.way.cls === 'motorway_link' && touches(e.b));
  assert.equal(exits.length, JUNCTIONS.length * 2); assert.equal(entries.length, JUNCTIONS.length * 2);
  assert.equal(net.mwSigns.length, JUNCTIONS.length * 2, 'every exit needs its advance sign');
  assert.ok(net.barriers.length > 0, 'no central reservation barrier');
});

for (const d of FREE_DRIVES) test(`${d.id}: a lap of free drive routes right round on the motorway`, () => {
  const net = buildNet(area(d.area));
  const nodes = d.waypoints.map(w => snapWaypoint(net, w));
  const r = buildRoute(net, nodes);
  assert.ok(r.len > circuitLength() * 1.2 && r.len < circuitLength() * 1.35, `route is ${Math.round(r.len)} m`);
  assert.ok(r.steps.every(st => st.e.way.cls === 'motorway'), 'the lap leaves the motorway');
});

test('free-drive summary: measured, and honest about speed', () => {
  const st = createFreeStats();
  for (let i = 0; i < 20 * 120; i++) stepFreeStats(st, 0.05, 30, 67, 70); // 2 min at 67 mph
  for (let i = 0; i < 20 * 10; i++) stepFreeStats(st, 0.05, 34, 76, 70); // 10 s at 76 mph
  for (let i = 0; i < 20 * 30; i++) stepFreeStats(st, 0.05, 30, 67, 70);
  const lines = freeSummaryLines(st, st.seconds / 60);
  assert.match(lines[0], /^3\.\d miles in 3 min, averaging 6\d mph$/);
  assert.ok(lines.some(l => /Longest stretch at or under the limit: 2\.2 miles/.test(l)), lines.join(' | '));
  assert.ok(lines.some(l => /^Over the limit for 10 s, at worst 76 mph in a 70 limit; top speed 76 mph$/.test(l)), 'an over-limit drive must say so: ' + lines.join(' | '));
  assert.ok(!lines.some(l => /Never over the limit/.test(l)));
  assert.deepEqual(freeSummaryLines(createFreeStats(), 0).length, 1, 'too short a drive gets no figures');
});
test('free-drive summary: speeding under a lower limit is not "never over the limit"', () => {
  const st = createFreeStats();
  for (let i = 0; i < 20 * 120; i++) stepFreeStats(st, 0.05, 30, 67, 70); // 2 min at 67 on the motorway
  for (let i = 0; i < 20 * 8; i++) stepFreeStats(st, 0.05, 25, 55, 40);   // 8 s at 55 mph on a 40 mph roundabout road
  const lines = freeSummaryLines(st, st.seconds / 60);
  assert.ok(!lines.some(l => /Never over the limit/.test(l)), lines.join(' | '));
  assert.ok(lines.some(l => /Over the limit for 8 s, at worst 55 mph in a 40 limit/.test(l)), lines.join(' | '));
  const ok = createFreeStats();
  for (let i = 0; i < 20 * 120; i++) stepFreeStats(ok, 0.05, 30, 67, 70);
  for (let i = 0; i < 20 * 8; i++) stepFreeStats(ok, 0.05, 17, 38, 40);
  assert.ok(freeSummaryLines(ok, ok.seconds / 60).some(l => /^Never over the limit: top speed 67 mph$/.test(l)));
});
