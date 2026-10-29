// The examiner: follows progress along the route, re-routes when you go off it, and marks faults DVSA-style.
import { MARKING, RULES, HANDLING } from './config.js';
import { createClearJudge } from './box-junction.js';
import { nearest, stopsNear, buildRoute, laneIndex, laneName, inFillet, paved, onPaved } from './net.js';

// The four wheels against the road surface: how many are off it, the furthest any is past the edge, and
// whether the middle of the car is off. 15 cm of grace for the line itself and the kerb face.
const TRACK = 0.78;
export function wheelsOff(net, p) {
  const fx = -Math.sin(p.th), fz = -Math.cos(p.th), half = HANDLING.wheelbase / 2;
  const offAt = (x, z) => { if (onPaved(net, x, z, 0.15) || inFillet(net, x, z)) return 0; const n = nearest(net, x, z); return n ? Math.max(0.16, n.d - paved(n.way)) : 9; };
  let wheels = 0, over = 0;
  for (const a of [half, -half]) for (const b of [TRACK, -TRACK]) { const o = offAt(p.x + fx * a + fz * b, p.z + fz * a - fx * b); if (o) { wheels++; over = Math.max(over, o); } }
  return { wheels, over, centre: wheels >= 2 && !onPaved(net, p.x, p.z, 0) && !inFillet(net, p.x, p.z) };
}

const MPH = 2.23694;
export function approachLane(nr,approach,heading) {
  if(nr.e!==approach.e)return null;
  const alignment=(-Math.sin(heading)*nr.tx-Math.cos(heading)*nr.tz)*approach.dir;
  return alignment>Math.cos(Math.PI/9) ? laneIndex(nr.e,approach.dir,nr.lat) : null;
}

export function createTest(net, traffic, player) {
  const t = {
    experimental: false, running: false, done: false, route: null, waypoints: [], wpIndex: 1,
    sRoute: 0, idx: 0, step: 0, offRoute: false, offT: 0, rerouted: 0,
    faults: [], D: 0, S: 0, cool: {}, timers: {}, flags: {}, stopPrev: new Map(), amberAt: new Map(), onRb: false, ctx: null, onFault: null, offRoad: { max: 0, seconds: 0 }
  };
  t.setRoute = (route, nodes) => { t.route = route; t.waypoints = nodes; };
  t.fault = (kind, cat, text, key, cd = 8) => {
    if (!t.running || t.experimental || t.ungraded) return; const now = traffic.clock; // experimental practice and free drive are never marked
    if (key) { if (t.cool[key] && now < t.cool[key]) return; t.cool[key] = now + cd; }
    t.faults.unshift({ kind, cat, text, key: key || null, context: t.context || null, elapsed: Math.max(0, now - (t.startedAt ?? now)), at: now, x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10 }); if (kind === 'S') t.S++; else t.D++;
    t.onFault && t.onFault();
  };
  t.reset = () => {
    t.basicStatus = null; t.alert = null; t.coach = null; t.laneGuide = null;
    Object.assign(t, { lap: null, done: false, sRoute: 0, idx: 0, step: 0, offRoute: false, offT: 0, rerouted: 0, faults: [], D: 0, S: 0, cool: {}, timers: {}, flags: {}, stopPrev: new Map(), amberAt: new Map(), parked: true, contacts: new Set(), hits: [], offRoad: { max: 0, seconds: 0 } });
    t.boxes.reset();
    for (const i of t.route.instructions) Object.assign(i, { sigSeen: false, checked: false, laneSeen: undefined, laneChecked: false, exitSigSeen: false, exitChecked: false, earlyFlag: false });
  };
  t.passed = () => t.experimental ? null : t.S === 0 && t.D <= MARKING.maxDrivingFaults;
  // yellow boxes and KEEP CLEAR (Rule 174): judged on every drive; t.boxes.log keeps each crossing for feedback
  t.boxes = createClearJudge({ net, test: t, traffic, player });
  const timer = (k, cond, dt) => (t.timers[k] = cond ? (t.timers[k] || 0) + dt : 0);

  // where the car is along the route: nearest route SEGMENT (not vertex), searched only a short way
  // ahead of the last known position, so a parallel road later in the route can't make progress jump
  function progress(dt) {
    const R = t.route, n = R.xs.length; let best = Math.min(t.idx, n - 2), bd = 1e18, s = t.sRoute, bscore = 1e18;
    const sMin = t.sRoute - 40, sMax = t.sRoute + 45;
    for (let j = Math.max(0, t.idx - 30); j < n - 1; j++) {
      if (R.cum[j] > sMax) break;
      if (R.cum[j + 1] < sMin) continue;
      const ax = R.xs[j], az = R.zs[j], dx = R.xs[j + 1] - ax, dz = R.zs[j + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const u = Math.max(0, Math.min(1, ((player.x - ax) * dx + (player.z - az) * dz) / L2));
      const qx = ax + dx * u, qz = az + dz * u, d = (player.x - qx) ** 2 + (player.z - qz) ** 2, sj = R.cum[j] + u * Math.sqrt(L2);
      const score = Math.sqrt(d) + Math.max(0, sj - t.sRoute) * 0.02; // tie-break towards the nearer, earlier piece
      if (score < bscore) { bscore = score; bd = d; best = j; s = sj; }
    }
    const dist = Math.sqrt(bd);
    t.offRoute = dist > 22;
    if (!t.offRoute) { t.idx = best; t.sRoute = Math.max(t.sRoute, s); t.offT = 0; }
    else { t.offT += dt; if (t.offT > 2.5) (t.ungraded && t.onOffRoute ? rejoin() : reroute()); }
    // current instruction (a roundabout stays current until you leave it at your exit)
    const ins = R.instructions; while (t.step < ins.length - 1 && t.sRoute > (ins[t.step].exitS ?? ins[t.step].s) + 6) t.step++;
  }
  function reroute() {
    // continue from the road the car is on, in the direction it's facing, to the remaining waypoints
    const nr = nearest(net, player.x, player.z); if (!nr || nr.d > 30) return;
    const fwd = (-Math.sin(player.th)) * nr.tx + (-Math.cos(player.th)) * nr.tz;
    const dir = fwd >= 0 ? 1 : -1, from = (nr.e.way.oneway ? 1 : dir) > 0 ? nr.e.b : nr.e.a;
    const remaining = t.waypoints.slice(t.wpIndex);
    try {
      // don't send the learner straight back along the road they are on: no U-turn at the first node
      const r = buildRoute(net, [from, ...remaining.length ? remaining : [t.waypoints[t.waypoints.length - 1]]], { noUturnEdge: nr.e });
      if (!r.steps.length || r.len < 20) { t.offT = 0; return; }
      if (t.onReroute) t.onReroute(r); // e.g. re-add the examiner's hand-written callouts
      t.route = r; t.idx = 0; t.sRoute = 0; t.step = 0; t.offT = 0; t.rerouted++;
    } catch (e) { t.offT = 0; }
  }

  function physicalContacts() {
    const v = player.v, fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    // collisions
    // Boxes about 10% smaller than the vehicles, checked in both vehicles' directions; a real impact needs 1.5 m/s
    // closing speed; one fault per crash; and it is your fault only if your own movement closed the gap, or you had
    // just broken a rule (red light, not giving way). Otherwise it is noted that someone hit you.
    const PL = 4.3 * 0.45, PW = 1.8 * 0.45, rx = -fz, rz = fx;
    const hit = (o, oL, oW, bike) => {
      const dx = o.x - player.x, dz = o.z - player.z, d = Math.hypot(dx, dz);
      if (d > 9) { t.contacts.delete(o); return; }
      const ofx = -Math.sin(o.th), ofz = -Math.cos(o.th), orx = -ofz, orz = ofx;
      const sep = [[fx, fz], [rx, rz], [ofx, ofz], [orx, orz]].some(([ax, az]) => Math.abs(dx * ax + dz * az) > PL * Math.abs(fx * ax + fz * az) + PW * Math.abs(rx * ax + rz * az) + oL * Math.abs(ofx * ax + ofz * az) + oW * Math.abs(orx * ax + orz * az));
      if (sep) { if (d > PL + oL + 1) t.contacts.delete(o); return; }
      if (t.contacts.has(o)) return; t.contacts.add(o);
      const ux = dx / (d || 1), uz = dz / (d || 1), mine = v * (fx * ux + fz * uz), theirs = -(o.v * (ofx * ux + ofz * uz)), closing = mine + theirs;
      if (closing < 1.5) return; // a nudge, not a crash
      const lastRule = t.faults.find(f => traffic.clock - f.at < 4 && /traffic lights|Junctions – observation|Pedestrian/.test(f.cat));
      if ((mine > 0.5 && mine >= theirs * 0.6) || lastRule) { t.fault('S', 'Control – collision', bike ? 'Collided with a cyclist' : 'Collided with another vehicle'); player.v = Math.min(player.v, 0) * 0.5; }
      else t.hits.push({ text: bike ? 'A cyclist rode into you' : 'Another vehicle drove into you', x: Math.round(player.x), z: Math.round(player.z) });
      o.v = 0; o.ghost = Math.max(o.ghost || 0, 1.5); // the other road user stops, then eases past
    };
    for (const c of traffic.cars) if (c.alive && !(c.ghost > 0)) hit(c, 4.2 * 0.45, 1.8 * 0.45, false);
    for (const b of traffic.bikes.concat(traffic.ringBikes)) if (b.alive !== false) hit(b, 0.9 * 0.9, 0.3, true);
  }

  // Free drive: off the circuit (out at a junction, say), the drive owner builds a route back onto it.
  // The route starts at the beginning of the road the car is on and runs along it, so the car is on the
  // route from the first moment; starting at the far end left it "off route" for the whole slip road.
  function rejoin() {
    const nr = nearest(net, player.x, player.z); t.offT = 0; if (!nr || nr.d > 30) return;
    const fwd = (-Math.sin(player.th)) * nr.tx + (-Math.cos(player.th)) * nr.tz, d = nr.e.way.oneway ? 1 : (fwd >= 0 ? 1 : -1);
    t.onOffRoute(d > 0 ? nr.e.a : nr.e.b, d > 0 ? nr.e.b : nr.e.a);
  }
  // put progress where the car actually is on a freshly built route (its first stretch, not just 45 m)
  t.snapProgress = (reach = 1500) => {
    const R = t.route; let best = 0, bd = 1e18, bs = 0;
    for (let j = 0; j < R.xs.length - 1 && R.cum[j] < reach; j++) {
      const ax = R.xs[j], az = R.zs[j], dx = R.xs[j + 1] - ax, dz = R.zs[j + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const u = Math.max(0, Math.min(1, ((player.x - ax) * dx + (player.z - az) * dz) / L2)), d = (player.x - ax - dx * u) ** 2 + (player.z - az - dz * u) ** 2;
      if (d < bd) { bd = d; best = j; bs = R.cum[j] + u * Math.sqrt(L2); }
    }
    t.idx = best; t.sRoute = bs; t.offRoute = false; t.offT = 0;
  };
  // Free drive: a lap route carries on a quarter-lap past its own start, and once the car is round,
  // progress steps back one lap. The road under the car is the same either way, so nothing jumps.
  t.useLap = (route, start, len) => { t.route = route; t.lap = { start, len }; t.idx = 0; t.sRoute = 0; t.step = 0; t.offT = 0; };
  function rollLap() {
    const L = t.lap; if (!L || t.sRoute < L.start + L.len + 30) return false;
    t.sRoute -= L.len; let i = Math.min(t.idx, t.route.cum.length - 2); while (i > 0 && t.route.cum[i] > t.sRoute) i--; t.idx = i; t.step = 0;
    return true;
  }

  t.update = (dt, inputSteer) => {
    if (!t.running) return;
    if (t.mode === 'manoeuvre') { t.ctx = nearest(net, player.x, player.z); if (Math.abs(player.v) > 0.3) t.parked = false; return; }
    const v = player.v, mph = Math.abs(v) * MPH, fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const nr = nearest(net, player.x, player.z); t.ctx = nr;
    progress(dt);
    if (t.ungraded && rollLap() && t.onLap) t.onLap();
    t.boxes.update(dt);
    // waypoints passed (for re-routing)
    while (t.wpIndex < t.waypoints.length - 1) { const n = t.waypoints[t.wpIndex]; if (Math.hypot(net.nx[n] - player.x, net.nz[n] - player.z) < 25) t.wpIndex++; else break; }
    if (!nr) return;
    if (t.experimental) {
      if (Math.abs(v) > .3) t.parked = false;
      player.onRb = t.onRb = nr.way.rb;
      physicalContacts();
      return; // Navigation and collision physics only: no examiner timers or objectives.
    }
    // A signed temporary restriction takes precedence over the road limit.
    const temp = t.restriction?.limit() ?? null, way = nr.way, limit = temp ?? way.mph;
    // moving off from the kerb (Rule 159): look round first, and don't pull out in front of traffic coming from behind
    if (t.parked && v > 0.8) {
      t.parked = false;
      const looked = player.lookAt !== undefined && traffic.clock - player.lookAt < 10;
      if (!looked) t.fault('D', 'Move off – safety', 'Moved off without a recent look-round input (B or observation button)');
      let close = null;
      for (const c of traffic.cars) {
        if (!c.alive || c.v < 2 || Math.cos(c.th - player.th) < 0.7) continue;
        const dx = c.x - player.x, dz = c.z - player.z, fw = dx * fx + dz * fz, lt = Math.abs(dx * fz - dz * fx);
        if (fw > 2 || fw < -90 || lt > 5.5) continue;
        const ttc = -fw / Math.max(0.3, c.v - Math.max(0, v));
        if (!close || ttc < close.ttc) close = { ttc, d: -fw };
      }
      if (close && close.ttc < 3) t.fault(close.d < 14 ? 'S' : 'D', 'Move off – safety', close.d < 14 ? 'Pulled out into the path of a vehicle coming from behind' : 'Moved off when a vehicle coming from behind had to slow down for you');
      else if (close && close.d < 80 && player.indicator !== 'R') t.fault('D', 'Signals – necessary', 'Did not signal before moving off with a vehicle coming');
    }
    // speed
    if (timer('spd', mph > limit + 2.5, dt) > 2) t.fault('D', 'Use of speed', temp != null ? `Went over the ${limit} mph ${t.restriction.what}` : `Went over the ${limit} mph limit on ${way.name || 'this road'}`, 'spd', 10);
    if (timer('spd2', mph > limit + 10, dt) > 1) t.fault('S', 'Use of speed', temp != null ? `Drove well over the ${limit} mph ${t.restriction.what}` : `Drove well over the ${limit} mph limit`, 'spd2', 14);
    // one-way and positioning
    const along = fx * nr.tx + fz * nr.tz;
    if (way.oneway && timer('ww', v > 2 && along < -0.4, dt) > 0.8) t.fault('S', way.rb ? 'Positioning – roundabout' : 'Response to signs', way.rb ? 'Went the wrong way round the roundabout' : 'Drove the wrong way along a one-way road', 'ww', 12);
    const inJunction = net.fillets.some(f => Math.abs(f.C[0] - player.x) < f.R + f.w && Math.abs(f.C[1] - player.z) < f.R + f.w); // turning through a junction
    if (!way.oneway && nr.d < way.w / 2 + 1 && !inJunction) {
      const offL = nr.lat * (Math.sign(along) || 1);
      if (timer('pos', v > 2 && offL < -0.5, dt) > 1.4) t.fault('D', 'Positioning – normal driving', 'Drove on the right-hand side of the road', 'pos', 8);
    } else timer('pos', false, dt);
    // Off the road, judged by the wheels against the road surface as drawn (junction corners included). A
    // wheel over the edge is mounting the kerb; the middle of the car off the road is driving off it, a
    // serious fault. Before this the car's centre had to be 0.8 m past the edge before anything was marked,
    // and only ever as a driving fault, so a car could run right off the road and still pass.
    const off = wheelsOff(net, player);
    t.offRoad.max = Math.max(t.offRoad.max, off.over); if (off.wheels) t.offRoad.seconds += dt;
    if (off.wheels && Math.abs(v) > 1.2 && !t.flags.kerb) { t.flags.kerb = true; t.fault('D', 'Control – steering', off.wheels > 1 ? 'Mounted the kerb with both wheels on one side' : 'Mounted the kerb', 'kerb', 4); }
    if (timer('offroad', off.centre && Math.abs(v) > 1.2, dt) > 0.4 && !t.flags.offroad) { t.flags.offroad = true; t.fault('S', 'Control – steering', `Drove off the road: the car was ${off.over.toFixed(1)} m past the edge`, 'offroad', 8); }
    if (!off.wheels) { t.flags.kerb = false; t.flags.offroad = false; }
    // roundabout entry
    if (way.rb && !t.onRb && v > 3.2) {
      // traffic lights control this entry: priority is set by the lights, not give-way
      const signalled = stopsNear(net, player.x, player.z).some(st => Math.hypot(st.x - player.x, st.z - player.z) < 28 && (fx * st.tx + fz * st.tz) > 0.3);
      const busy = !signalled && traffic.cars.concat(traffic.bikes).some(c => c.alive && c.v > 1.5 && c.e.way.rb && Math.hypot(c.x - player.x, c.z - player.z) < 20 && ((player.x - c.x) * -Math.sin(c.th) + (player.z - c.z) * -Math.cos(c.th)) > 0);
      if (busy) t.fault('D', 'Junctions – observation', 'Did not give way to traffic already on the roundabout', 'rbgw', 6);
    }
    t.onRb = way.rb; player.onRb = way.rb;
    // mini-roundabouts (Rule 188): give way to traffic from the right, and go round the painted circle, not over it
    for (const m of net.minis) {
      const dx = player.x - m.x, dz = player.z - m.z; if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      const d = Math.hypot(dx, dz), inside = d < 7, was = t.flags['mini' + m.x] || false; t.flags['mini' + m.x] = inside;
      if (inside && !was && v > 2) {
        const rx = -fz, rz = fx; // driver's right
        const fromRight = traffic.cars.concat(traffic.bikes).some(c => {
          if (!c.alive || c.v < 1.5) return false;
          const ox = c.x - m.x, oz = c.z - m.z, od = Math.hypot(ox, oz); if (od > 24 || od < 2.5) return false;
          const toward = -(ox * -Math.sin(c.th) + oz * -Math.cos(c.th)) / od; // heading at the mini?
          return toward > 0.5 && (ox * rx + oz * rz) / od > 0.35;
        });
        if (fromRight) t.fault('D', 'Junctions – observation', 'Did not give way to traffic from the right at the mini-roundabout', 'minigw', 6);
      }
      if (d < 1.1 && v > 4.5) t.fault('D', 'Junctions – positioning', 'Drove over the painted centre of the mini-roundabout', 'minic', 8);
    }
    // traffic lights: crossing a stop line
    for (const st of stopsNear(net, player.x, player.z)) {
      // Nearby entry and circulating lanes have different signals. Crossing
      // the infinite plane of another road's stop line is not crossing its line.
      if(nr.e!==st.e){t.stopPrev.delete(st.id);t.amberAt.delete(st.id);continue;}
      const rx = player.x - st.x, rz = player.z - st.z, a = rx * st.tx + rz * st.tz, lat = rx * st.tz - rz * st.tx;
      const prev = t.stopPrev.get(st.id); t.stopPrev.set(st.id, a);
      // remember where the car was when the light first showed amber (to judge whether it could have stopped)
      const Ls = traffic.lightState(st);
      if (Ls === 'A' && a < 0 && !t.amberAt.has(st.id)) t.amberAt.set(st.id, { d: -a, v: Math.max(0, v) });
      else if (Ls !== 'A') t.amberAt.delete(st.id);
      if (prev === undefined || Math.abs(a) > 30) continue;
      if (prev < 0 && a >= 0 && fx * st.tx + fz * st.tz > 0.3 && lat > (st.e.way.oneway ? -st.w / 2 - 0.5 : -0.8) && lat < st.w / 2 + 0.8) {
        const L = traffic.lightState(st);
        if (L === 'R' || L === 'RA') t.fault('S', 'Response to signals – traffic lights', 'Crossed the stop line on a red light', 'red' + st.cluster, 6);
        else if (L === 'A') {
          const seen = t.amberAt.get(st.id); // stopping distance at a firm (not emergency) 5 m/s² plus 0.6 s reaction
          if (seen && seen.d > seen.v * seen.v / 10 + seen.v * 0.6 + 1) t.fault('D', 'Response to signals – traffic lights', 'Went through on amber when there was time to stop', 'amb' + st.cluster, 6);
        }
      }
    }
    // zebra crossings
    for (const z of net.zebras) {
      const dx = player.x - z.x, dz = player.z - z.z; if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      const al = dx * z.tx + dz * z.tz, lt = dx * z.tz - dz * z.tx;
      if (Math.abs(al) < 2.2 && Math.abs(lt) < z.w / 2 + 0.4 && Math.abs(v) > 1 && z.ped.state === 'walk' && !z.faulted) { z.faulted = true; t.fault('S', 'Pedestrian crossings', 'Did not give way to a pedestrian on the zebra crossing', 'zb', 4); }
      if (z.ped.state === 'idle') z.faulted = false;
    }
    // cyclists: leave at least 1.5 m when passing (Rule 163); never hit one
    for (const b of traffic.bikes) {
      if (!b.alive) continue; const ex = b.x - player.x, ez = b.z - player.z; if (Math.abs(ex) > 8 || Math.abs(ez) > 8) continue;
      const fw = ex * fx + ez * fz, lt = Math.abs(ex * fz - ez * fx);
      if (Math.abs(fw) < 2.6 && lt < 1.25) continue; // touching: see collisions below
      const gap = lt - 0.9 - 0.35; // car half-width + bike half-width
      // passing: the cyclist beside the front three-quarters of the car or just ahead. One stopped beside the
      // back of a car that pulls away from a standstill (filtering up at a light) is not being passed
      if (fw < 2.5 && fw > -1.2 && v > b.v + 0.8 && gap < RULES.cyclistGap) {
        if (gap < 0.75) t.fault('S', 'Clearance – cyclists', 'Passed dangerously close to a cyclist', 'bclose' , 8);
        else t.fault('D', 'Clearance – cyclists', `Passed a cyclist with less than ${RULES.cyclistGap} m clearance`, 'bpass', 8);
      }
    }
    // mandatory cycle lanes (solid white line): keep out except at junctions
    if (!way.rb && nr.d < way.w / 2 + 1) {
      const sideDir = way.oneway ? 1 : (Math.sign(along) || 1), lane = sideDir > 0 ? way.cl : way.cr;
      const offL = nr.lat * sideDir, lineOff = way.w / 2 - way.cw, nearEnd = Math.min(nr.s, nr.e.len - nr.s) < 14;
      const inLane = (lane === 1 || lane === 2) && offL + 0.9 > lineOff + 0.45 && !nearEnd;
      if (timer('cyc', inLane && v > 2, dt) > 1) {
        if (lane === 2) t.fault('D', 'Positioning – lane discipline', 'Drove in a mandatory cycle lane (solid white line)', 'cyc', 10);
        else if (timer('cyc2', true, dt) > 4) t.fault('D', 'Positioning – lane discipline', 'Drove along an advisory cycle lane when it was avoidable', 'cyc2', 14);
      } else timer('cyc2', false, dt);
      t.inCycleLaneRoad = lane === 1 || lane === 2;
    } else t.inCycleLaneRoad = false;
    t.bikeAhead = traffic.bikes.some(b => b.alive && ((b.x - player.x) * fx + (b.z - player.z) * fz) > 0 && Math.hypot(b.x - player.x, b.z - player.z) < 45);
    // next traffic light ahead (for the HUD)
    let la = null;
    for (const st of stopsNear(net, player.x, player.z).concat(stopsNear(net, player.x + fx * 60, player.z + fz * 60))) {
      const rx = st.x - player.x, rz = st.z - player.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 90) continue;
      if (fx * st.tx + fz * st.tz < 0.6 || Math.abs(rx * fz - rz * fx) > st.w / 2 + 2) continue;
      if (!la || fw < la.dist) la = { dist: fw, st };
    }
    t.lightAhead = la ? { dist: la.dist, state: traffic.lightState(la.st) } : null;
    physicalContacts();
    // lane discipline: be in the lane the examiner asked for before the junction
    for (const ins of t.route.instructions) {
      if (!ins.laneOK || ins.laneChecked) continue;
      const ahead = ins.s - t.sRoute;
      if (ahead < 35 && ahead > 4) {
        const lane=approachLane(nr,ins.approach,player.th);
        if(lane!==null)ins.laneSeen=lane;
      }
      if (ahead <= 3) {
        ins.laneChecked = true;
        if (ins.laneSeen !== undefined && !ins.laneOK.includes(ins.laneSeen)) {
          const what = ins.kind === 'rb' ? `your exit (${ins.m === 'L' ? 'left' : ins.m === 'R' ? 'right' : 'straight on'})` : ins.kind === 'straight' ? 'going straight on' : 'the turn';
          t.fault('D', 'Positioning – lane discipline', `Was not in the ${laneName(ins.lanes, ins.laneOK)} for ${what}: read the arrows on the road`);
        }
      }
    }
    // signalling before turns
    for (const ins of t.route.instructions) {
      if (!ins.signal || ins.checked) continue;
      const ahead = ins.s - t.sRoute;
      if (ahead < 90 && ahead > 3 && player.indicator === ins.signal) ins.sigSeen = true;
      if (ahead <= 2) { ins.checked = true; if (!ins.sigSeen) t.fault('D', 'Signals – necessary', `Did not signal ${ins.signal === 'L' ? 'left' : 'right'} before ${ins.kind === 'rb' ? 'the roundabout' : 'turning'}${ins.kind !== 'rb' && ins.road ? ' onto ' + ins.road : ''}`); }
    }
    // roundabouts (Rule 186): signal left after you pass the exit before yours, not before
    for (const ins of t.route.instructions) {
      if (ins.kind !== 'rb' || !ins.exitSignal || ins.exitChecked) continue;
      const sr = t.sRoute;
      if (ins.exitN >= 2 && sr > ins.prevExitS - 5 && sr < ins.prevExitS - 0.5 && player.indicator === 'L' && !ins.earlyFlag) {
        ins.earlyFlag = true; t.fault('D', 'Signals – timed', 'Signalled left before passing the exit before yours: others will think you are leaving there');
      }
      if (sr > ins.prevExitS - 0.5 && sr < ins.exitS && player.indicator === 'L') ins.exitSigSeen = true;
      if (sr >= ins.exitS - 0.5 && sr < ins.exitS + 20) { ins.exitChecked = true; if (!ins.exitSigSeen) t.fault('D', 'Signals – necessary', `Did not signal left after passing the exit before yours${ins.road ? ' (leaving onto ' + ins.road + ')' : ''}`); }
    }
    // Dutch-style roundabouts: cyclists on the outer ring have priority where you cross it, going in and coming out
    for (const ring of net.cycleRings) {
      const d = Math.hypot(player.x - ring.x, player.z - ring.z) - ring.r, k = 'ring' + ring.x, was = t.flags[k]; t.flags[k] = d;
      if (was === undefined || Math.abs(d) > 30 || (was > 0) === (d > 0) || Math.abs(v) < 0.4) continue;
      const ang = Math.atan2(player.x - ring.x, -(player.z - ring.z));
      for (const b of traffic.ringBikes) {
        if (b.ring !== ring) continue;
        let da = b.ang - ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const arc = da * ring.r; // < 0: the cyclist is still coming towards where you cross
        if (arc > -13 && arc < 2.5) { const bad = arc > -5; t.fault(bad ? 'S' : 'D', 'Junctions – observation', bad ? 'Cut across a cyclist on the roundabout cycle track' : 'Did not give way to a cyclist on the roundabout cycle track', 'ringgw', 4); break; }
      }
    }
    // puffin crossings: never drive onto the crossing while someone is on it
    for (const c of traffic.puffins) {
      if (c.ped.state !== 'walk') continue; const dx = player.x - c.x, dz = player.z - c.z; if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      const al = dx * c.tx + dz * c.tz, lt = dx * c.tz - dz * c.tx;
      if (Math.abs(al) < 2 && Math.abs(lt) < c.w / 2 + 0.4 && Math.abs(v) > 0.8) t.fault('S', 'Pedestrian crossings', 'Drove onto the crossing while someone was crossing', 'pfn' + c.id, 8);
    }
    // finish: near the end, stopped, on the left
    const last = t.route.instructions[t.route.instructions.length - 1];
    if (!t.ungraded && t.step >= t.route.instructions.length - 1 && t.sRoute > last.s - 35 && Math.abs(v) < 0.3) {
      const offL = nr.lat * (way.oneway ? 1 : (Math.sign(along) || 1));
      if (offL > (way.oneway ? -0.5 : 0.3)) finish();
    }
  };
  function finish() { if (!t.running || t.done || t.experimental) return; t.running = false; t.done = true; t.onFinish && t.onFinish(); }
  t.finish = finish;
  return t;
}
