import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildNet, nearest } from '../src/net.mjs';
import { projector } from '../src/project.mjs';
import { snapFeatures } from '../src/snap.mjs';
import { parseSign } from '../src/signs.mjs';

const AREA = process.env.AREA || '/home/user/cambridge-learner-driv/data/areas/a1.json';
const net = buildNet(JSON.parse(readFileSync(AREA, 'utf8')));
const P = projector(net);

test('projection round-trips to under a millimetre', () => {
  for (const [x, z] of [[0, 0], [1234.5, -987.6], [-4321, 2200]]) {
    const [lon, lat] = P.toWgs(x, z);
    const [x2, z2] = P.toLocal(lon, lat);
    assert.ok(Math.hypot(x2 - x, z2 - z) < 1e-3, `${x},${z} -> ${x2},${z2}`);
  }
});

test('parseSign reads the posted limit out of the class string', () => {
  assert.deepEqual(parseSign('regulatory--maximum-speed-limit-30--g1').mph, 30);
  assert.deepEqual(parseSign('regulatory--maximum-speed-limit-70--g1').mph, 70);
  assert.equal(parseSign('regulatory--give-way--g1').kind, 'giveway');
  assert.equal(parseSign('information--parking--g1'), null);
});

// Put a synthetic sign 3 m to one side of the midpoint of a real edge, in lon/lat,
// then check the snapper puts it back on the same way, on the same side.
function syntheticSign(e, side, offset = 3) {
  const i = Math.floor((e.n - 1) / 2);
  const ax = e.px[i], az = e.pz[i], bx = e.px[i + 1], bz = e.pz[i + 1];
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const tx = (bx - ax) / L, tz = (bz - az) / L;
  // left of the tangent is (-tz, tx) under this cross-product convention
  const x = mx + side * -tz * offset, z = mz + side * tx * offset;
  const [lon, lat] = P.toWgs(x, z);
  return { id: `syn-${e.id}-${side}`, lon, lat, value: `regulatory--maximum-speed-limit-${e.way.mph}--g1`, seenCount: 5 };
}

test('snaps synthetic signs back to the way they came from', () => {
  // Use long, well-separated edges so the ambiguity guard is not the thing under test.
  const cands = net.edges.filter(e => e.n >= 2 && Math.hypot(e.px[e.n-1]-e.px[0], e.pz[e.n-1]-e.pz[0]) > 60).slice(0, 400);
  assert.ok(cands.length > 20, `need candidate edges, got ${cands.length}`);
  const feats = [], want = new Map();
  for (const e of cands) for (const side of [1, -1]) {
    const f = syntheticSign(e, side);
    feats.push(f); want.set(f.id, { way: e.way.i, side });
  }
  const { snapped, skipped } = snapFeatures(net, feats);
  assert.ok(snapped.length > 0, 'nothing snapped');
  let rightWay = 0, rightSide = 0;
  for (const s of snapped) {
    const w = want.get(s.id);
    if (s.wayIndex === w.way) rightWay++;
    if (s.side === w.side) rightSide++;
  }
  const wayPct = rightWay / snapped.length, sidePct = rightSide / snapped.length;
  console.log(`      snapped ${snapped.length}/${feats.length}  way ${(wayPct*100).toFixed(1)}%  side ${(sidePct*100).toFixed(1)}%  skipped`, skipped);
  assert.ok(wayPct > 0.97, `way accuracy ${wayPct}`);
  assert.ok(sidePct > 0.97, `side accuracy ${sidePct}`);
});

test('rejects a sign that is nowhere near a road', () => {
  const [lon, lat] = P.toWgs(50000, 50000);
  const { snapped, skipped } = snapFeatures(net, [{ id: 'far', lon, lat, value: 'regulatory--maximum-speed-limit-30--g1' }]);
  assert.equal(snapped.length, 0);
  assert.equal(skipped.far, 1);
});
