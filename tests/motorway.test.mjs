// The motorway worlds (issue #6): geometry of the circuit, the committed area files, and the free-drive
// summary, which must only ever report what was measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNet, buildRoute, snapWaypoint, paved, nearestWhere, posAt } from '../js/net.js';
import { MW, JUNCTIONS, centreLine, circuitLength, onCarriageway, separation, junctionSpan } from '../js/motorway.js';
import { FREE_DRIVES, createFreeStats, stepFreeStats, freeSummaryLines } from '../js/free-drive.js';
import { buildLayout } from '../tools/layouts.mjs';
import { MOTORWAY_LESSONS, SETUPS } from '../js/motorway-lessons.js';

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
  // every exit: advance signs at 1 mile and ½ mile, countdown markers at 300, 200 and 100 yards, and the
  // final sign at the slip road, each on the nearside verge at that distance before the diverge (#9)
  const want = [...MW.advance.map(a => a.at), ...MW.countdown.map(c => c.at), 30];
  assert.equal(net.mwSigns.length, JUNCTIONS.length * 2 * want.length);
  for (const side of ['A', 'B']) for (const j of JUNCTIONS) {
    const sp = junctionSpan(j, side), k = side === 'A' ? 1 : -1;
    for (const before of want) {
      const sg = net.mwSigns.find(x => x.j === j.n && x.before === before && Math.hypot(x.x - onCarriageway(centreLine(), lanes, side, sp.diverge - before * k).x, x.z - onCarriageway(centreLine(), lanes, side, sp.diverge - before * k).z) < 20);
      assert.ok(sg, `${side} J${j.n}: no sign ${before} m before the exit`);
      const p = onCarriageway(centreLine(), lanes, side, sp.diverge - before * k);
      assert.ok(Math.abs(Math.hypot(sg.x - p.x, sg.z - p.z) - (lanes * MW.laneW / 2 + MW.shoulder + 2.2)) < 0.2, `${side} J${j.n} ${before} m: not on the nearside verge`);
      assert.equal(sg.kind, before === 30 ? 'exit' : MW.countdown.some(c => c.at === before) ? 'count' : 'advance');
    }
  }
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

for (const l of MOTORWAY_LESSONS) test(`${l.id}: every scripted vehicle is placed on the lesson's route`, () => {
  const net = buildNet(area(l.area)), r = buildRoute(net, l.waypoints.map(w => snapWaypoint(net, w)));
  for (const v of SETUPS[l.setup].filter(v => v.at != null)) { const s = l.startAt + v.at; assert.ok(s >= 1 && s <= r.len - 5, `${l.setup}: a vehicle at ${v.at} m lands at ${s} m of ${Math.round(r.len)}`); }
  // vehicles placed by the junction's merge point: on its slip road, or on the carriageway upstream of it
  if (SETUPS[l.setup].some(v => v.main != null || v.slip != null)) {
    assert.ok(l.merge, `${l.id} places traffic by a merge point but names no junction`);
    const at = junctionSpan(JUNCTIONS.find(j => j.n === l.merge), 'A'), slip = net.edges.find(e => e.way.cls === 'motorway_link' && net.out[e.b].some(o => o.e.way.cls === 'motorway') && Math.hypot(net.nx[e.b] - onCarriageway(centreLine(), +l.area[1], 'A', at.merge).x, net.nz[e.b] - onCarriageway(centreLine(), +l.area[1], 'A', at.merge).z) < 1);
    assert.ok(slip, 'no entry slip road at the lesson junction');
    for (const v of SETUPS[l.setup]) {
      if (v.slip != null) assert.ok(v.slip <= slip.len, `a vehicle ${v.slip} m up a ${Math.round(slip.len)} m slip road`);
      if (v.main != null) assert.ok(v.main < at.merge - 200, `a vehicle ${v.main} m upstream runs past the start of the circuit`);
    }
  }
  assert.ok(l.setup === 'join' ? r.steps[0].e.way.cls === 'motorway_link' && r.steps.at(-1).e.way.cls === 'motorway' : r.steps.slice(0, 3).every(st => st.e.way.cls === 'motorway'), 'the lesson starts where it says');
  if (l.exit) assert.ok(r.steps.some(st => st.e.way.cls === 'motorway_link'), 'an exit lesson leaves by the slip road');
});

// Issue #8: the slip roads' shape, the markings drawn on them and the points the AI and the assessor work
// from all come from the same constants (MW.junction.accel / decel, MW.taper), so they cannot drift apart.
for (const id of ['m2', 'm3']) test(`${id}: every slip road runs beside the carriageway exactly where its markings say`, () => {
  const lanes = +id[1], net = buildNet(area(id)), J = MW.junction, cw = lanes * MW.laneW, lane0 = cw / 2 - MW.laneW / 2, off0 = cw / 2 + MW.slipW / 2;
  const touches = (n) => net.out[n].some(o => o.e.way.cls === 'motorway');
  let checked = 0;
  for (const e of net.edges.filter(x => x.way.cls === 'motorway_link')) {
    const entry = touches(e.b), exit = touches(e.a); if (!entry && !exit) continue;
    for (let i = 0; i < e.n; i++) {
      const d = entry ? e.len - e.cum[i] : e.cum[i]; if (d < 2) continue; // the shared node itself sits on the centre line
      const tx = e.px[Math.min(i + 1, e.n - 1)] - e.px[Math.max(i - 1, 0)], tz = e.pz[Math.min(i + 1, e.n - 1)] - e.pz[Math.max(i - 1, 0)];
      const near = nearestWhere(net, e.px[i], e.pz[i], x => x.way.cls === 'motorway');
      if (!near || near.tx * tx + near.tz * tz < 0) continue; // the other carriageway is nearer: a slip sweeping away round it
      const lat = near.lat, lim = entry ? J.accel : J.decel;
      if (d <= MW.taper) assert.ok(lat > lane0 - 0.3 && lat < off0 + 0.3, `${e.way.name} ${entry ? 'entry' : 'exit'}: ${Math.round(d)} m from the motorway the taper is at ${lat.toFixed(2)} m`);
      else if (d <= lim) assert.ok(Math.abs(lat - off0) < 0.3, `${e.way.name} ${entry ? 'entry' : 'exit'}: ${Math.round(d)} m out it is ${lat.toFixed(2)} m across, not beside lane 1 (${off0})`);
      else if (d > lim + 40 && near.d < 60) assert.ok(lat > off0 + 0.5, `${e.way.name}: ${Math.round(d)} m out it is still alongside`);
      checked++;
    }
  }
  assert.ok(checked > 200, `only ${checked} slip-road points checked`);
});

// Issue #9: slip roads sweep away gently, as real ones do; none has a bend that needs much under 45 mph
// (the roundabout at the end, and the ends where they meet it, aside)
for (const id of ['m2', 'm3']) test(`${id}: no slip road has a bend tighter than 120 m radius`, () => {
  const net = buildNet(area(id));
  for (const e of net.edges.filter(x => x.way.cls === 'motorway_link')) for (let s = 15; s < e.len - 45; s += 5) {
    const a = posAt(e, s - 12), b = posAt(e, s), c = posAt(e, s + 12);
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z), k = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    const r = k > 1e-6 ? ab * bc * ca / (2 * k) : Infinity;
    assert.ok(r > 120, `${e.way.name}: a ${Math.round(r)} m bend ${s} m along`);
  }
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
