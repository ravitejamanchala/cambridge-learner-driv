// Temporary restrictions on the motorway (gantry signals and roadworks): what applies where, and where a
// vehicle is, so the lessons, the examiner, the HUD, the traffic and the Bot lab all read the same plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, limitAt, limitAhead, closedAt, closesAt, inWorks, sOnA, laneOnA } from '../js/mw-restrictions.js';
import { MW, centreLine, onCarriageway, JUNCTIONS, junctionSpan } from '../js/motorway.js';
import { MOTORWAY_LESSONS } from '../js/motorway-lessons.js';

const G = PLANS.gantries, R = PLANS.roadworks;

test('gantries: each limit applies from its gantry, the red X closes its lane, and the restriction ends', () => {
  assert.equal(limitAt(G, 15900), null, 'no limit before the first gantry');
  assert.equal(limitAt(G, 15950), 60);
  assert.equal(limitAt(G, 16500), 50);
  assert.deepEqual(closedAt(G, 16500), [], 'the arrow asks you to move over; the lane is not closed yet');
  assert.deepEqual(closedAt(G, 16900), [0]);
  assert.deepEqual(closedAt(G, 17800), [], 'reopened at the next gantry');
  assert.equal(limitAt(G, 18200), null, 'national limit after the end sign');
  assert.equal(closesAt(G, 0, 16500, 450), 16850);
  assert.equal(closesAt(G, 1, 16500, 2000), null, 'the middle lane never closes');
  assert.equal(limitAhead(G, 16200, 300), 50, 'a driver sees the lower limit coming');
  // the broken-down car is inside the closed stretch
  assert.deepEqual(closedAt(G, G.incident.at), [G.incident.lane]);
});

test('roadworks: the temporary limit, the closed lane, and the coned-off area across the taper', () => {
  assert.equal(limitAt(R, R.limit.from - 1), null);
  assert.equal(limitAt(R, R.limit.from), 50);
  assert.equal(limitAt(R, R.limit.to), null);
  assert.deepEqual(closedAt(R, R.taper[0] - 1), []);
  assert.deepEqual(closedAt(R, R.taper[0] + 1), [R.lane]);
  // the cones run across the right-hand lane: in the middle of that lane, clear at a third of the way
  // along the taper and inside the cones at two thirds; the middle lane is never coned off
  const at = (u) => R.taper[0] + (R.taper[1] - R.taper[0]) * u;
  assert.equal(inWorks(R, at(1 / 3), 2), false);
  assert.equal(inWorks(R, at(2 / 3), 2), true);
  assert.equal(inWorks(R, (R.works[0] + R.works[1]) / 2, 1), false);
  assert.equal(inWorks(R, (R.works[0] + R.works[1]) / 2, 1.8), true);
  assert.equal(inWorks(R, R.reopen + 10, 2), false, 'the lane is open again after the works');
});

test('a point on carriageway A gives back its distance along the circuit and its lane', () => {
  for (const s of [500, 3500, 6500, 12500, 15600, 18800]) for (const lane of [0, 1, 2]) {
    const lat = ((3 - 1) / 2 - lane) * MW.laneW, c = onCarriageway(centreLine(), 3, 'A', s, lat), th = Math.atan2(-c.tx, -c.tz);
    const back = sOnA(c.x, c.z, th);
    assert.ok(back != null && Math.abs(back - s) < 0.5, `s ${s}: got ${back}`);
    assert.ok(Math.abs(laneOnA(G, c.x, c.z, back) - lane) < 0.1, `lane ${lane} at ${s}`);
  }
  // carriageway B, and the bends, are never under a restriction
  const b = onCarriageway(centreLine(), 3, 'B', 15600);
  assert.equal(sOnA(b.x, b.z, Math.atan2(-b.tx, -b.tz)), null);
  const bend = onCarriageway(centreLine(), 3, 'A', 9500);
  assert.equal(sOnA(bend.x, bend.z, Math.atan2(-bend.tx, -bend.tz)), null);
});

test('every restriction is on a straight, clear of junction slip roads, and inside its lesson', () => {
  const marks = { gantries: [...G.gantries.map(g => g.at), G.incident.at], roadworks: [...R.signs.map(s => s.at), ...R.taper, ...R.works, R.reopen] };
  const straight = (s) => (s > 0 && s < MW.straight) || (s > MW.straight + Math.PI * MW.radius && s < 2 * MW.straight + Math.PI * MW.radius);
  for (const [k, list] of Object.entries(marks)) {
    // the lesson's stretch, from where the learner starts (after its 0.2 miles of straight) to its end
    const l = MOTORWAY_LESSONS.find(x => x.restriction === k), sOf = (w) => sOnA(w.x, w.z, w.z < 0 ? -Math.PI / 2 : Math.PI / 2);
    const from = sOf(l.waypoints[0]) + l.startAt + 322, to = sOf(l.waypoints[l.waypoints.length - 1]) - 40;
    for (const s of list) {
      assert.ok(s >= from && s <= to, `${k}: ${s} m is outside the lesson (${Math.round(from)} to ${Math.round(to)})`);
      assert.ok(straight(s), `${k}: ${s} m is on a bend`);
      // nothing in a junction's slip-road span, where lanes are added and dropped
      for (const j of JUNCTIONS) { const sp = junctionSpan(j, 'A'); assert.ok(s < sp.diverge - 30 || s > sp.merge + 30 || (s > sp.diverge + MW.junction.decel + 30 && s < sp.merge - MW.junction.accel - 30), `${k}: ${s} m is at junction ${j.n}`); }
    }
  }
});
