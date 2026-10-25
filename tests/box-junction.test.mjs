// Yellow box junctions and KEEP CLEAR (issue #5): where they are, what counts as inside, and when the way
// out is blocked. The examiner, the traffic and the scenery all read these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNet } from '../js/net.js';
import { boxArea, clearAreas, inArea, vehicleIn, crossing, exitBlocked, exitLine } from '../js/box-junction.js';

const area = (id) => JSON.parse(fs.readFileSync(new URL(`../data/areas/${id}.json`, import.meta.url)));
const town = buildNet(area('town'));
const node = (net, x, z) => [...net.nx].findIndex((nx, i) => Math.hypot(nx - x, net.nz[i] - z) < 1);
// a vehicle at (x, z) heading along (tx, tz)
const car = (x, z, tx, tz, v = 0) => ({ x, z, th: Math.atan2(-tx, -tz), v, alive: true });

test('one box in the practice town, over the Bridge Street / Station Road crossroads, kerb to kerb', () => {
  assert.equal(town.boxes.length, 1);
  const v = node(town, -250, -450); assert.equal(town.boxes[0].node, v);
  const A = boxArea(town, v);
  assert.equal(A.hl, 6.5); assert.equal(A.hw, 6.5); // both roads are 13 m wide there
  assert.ok(inArea(A, -250, -450) && inArea(A, -244, -456) && !inArea(A, -250, -458), 'the corners and the middle are in, past the edge is out');
  // the stop lines are just outside it, so a car waiting at the line is not in the box
  for (const st of town.stops.filter(s => Math.hypot(s.x + 250, s.z + 450) < 15)) assert.ok(!inArea(A, st.x, st.z), `stop line at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`);
  // none on the Cambridge areas: a box is configured, never applied by rule
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) assert.equal(buildNet(area(id)).boxes.length, 0);
});

test('a car is in the box when any part of it is: its front, its middle or its back', () => {
  const A = boxArea(town, node(town, -250, -450)); // heading north (towards -z) in the left-hand lane
  assert.equal(vehicleIn(A, -252, -441, 0), false, 'front just short of the edge');
  assert.equal(vehicleIn(A, -252, -441.5, 0), true, 'nose over the edge');
  assert.equal(vehicleIn(A, -252, -458.5, 0), true, 'tail still in it');
  assert.equal(vehicleIn(A, -252, -459, 0), false, 'clear of it');
});

test('crossing distances, and the way out blocked only by traffic queueing in the exit', () => {
  const v = node(town, -250, -450), A = boxArea(town, v);
  // heading north (towards -z) up Bridge Street, 20 m short of the middle of the box
  const c = crossing(A, -252, -430, 0, -1);
  assert.ok(Math.abs(c.into - 13.5) < 1e-6 && Math.abs(c.out - 26.5) < 1e-6);
  assert.equal(crossing(A, -230, -430, 0, -1).into, Infinity, 'a line beside the box never enters it');
  // a car stopped 3 m past the far edge, in the same lane: blocked. Moving away, or 9 m past: not
  assert.ok(exitBlocked(A, -252, -430, 0, -1, [car(-252, -459.5, 0, -1)]));
  assert.equal(exitBlocked(A, -252, -430, 0, -1, [car(-252, -459.5, 0, -1, 6)]), null, 'driving away');
  assert.equal(exitBlocked(A, -252, -430, 0, -1, [car(-252, -467, 0, -1)]), null, 'room for a car before it');
  assert.equal(exitBlocked(A, -252, -430, 0, -1, [car(-248, -459.5, 0, 1)]), null, 'oncoming, in the other lane');
  assert.ok(exitBlocked(A, -252, -430, 0, -1, [car(-252, -452, 0, -1)]), 'stopped in the box ahead');
  // the exit for a vehicle turning right from Bridge Street onto Station Road (eastbound): a line down the
  // middle of Station Road east of the box, and its near side
  const bridge = town.inc[v].find(o => o.e.way.name === 'Bridge Street' && town.nz[o.dir === 1 ? o.e.b : o.e.a] > -450);
  const east = town.inc[v].find(o => o.e.way.name === 'Station Road' && town.nx[o.dir === 1 ? o.e.b : o.e.a] > -250);
  assert.ok(bridge && east);
  const L = exitLine(town, v, { e: east.e, dir: east.dir });
  assert.ok(Math.abs(L.fx - 1) < 1e-6 && Math.abs(L.fz) < 1e-6, 'heading east');
  const q = [car(-240, -452, 1, 0)]; // queueing in the left-hand lane just past the box (the north side, eastbound)
  assert.ok(exitBlocked(A, L.x, L.z, L.fx, L.fz, q, { lo: L.lo, hi: L.hi }));
  assert.equal(exitBlocked(A, -252, -430, 0, -1, q), null, 'and it does not block the way straight on');
});

test('KEEP CLEAR covers the westbound lane of High Street across the mouth of Orchard Way', () => {
  const K = clearAreas(town).find(A => A.kind === 'keep');
  assert.ok(K && K.hl === 4.5);
  assert.ok(inArea(K, 0, 1.8) && !inArea(K, 0, -1.8), 'the westbound lane only (on the south side: left of a driver heading west)');
  assert.ok(!inArea(K, 6, 1.8) && !inArea(K, -6, 1.8));
});
