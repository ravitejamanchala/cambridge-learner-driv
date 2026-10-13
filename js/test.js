// The examiner: follows progress along the route, re-routes when you go off it, and marks faults DVSA-style.
import { MARKING, RULES } from './config.js';
import { nearest, stopsNear, buildRoute, laneIndex, laneName } from './net.js';

const MPH = 2.23694;

export function createTest(net, traffic, player) {
  const t = {
    running: false, done: false, route: null, waypoints: [], wpIndex: 1,
    sRoute: 0, idx: 0, step: 0, offRoute: false, offT: 0, rerouted: 0,
    faults: [], D: 0, S: 0, cool: {}, timers: {}, flags: {}, stopPrev: new Map(), amberAt: new Map(), onRb: false, ctx: null, onFault: null
  };
  t.setRoute = (route, nodes) => { t.route = route; t.waypoints = nodes; };
  t.fault = (kind, cat, text, key, cd = 8) => {
    if (!t.running) return; const now = traffic.clock;
    if (key) { if (t.cool[key] && now < t.cool[key]) return; t.cool[key] = now + cd; }
    t.faults.unshift({ kind, cat, text, at: now }); if (kind === 'S') t.S++; else t.D++;
    t.onFault && t.onFault();
  };
  t.reset = () => {
    Object.assign(t, { done: false, sRoute: 0, idx: 0, step: 0, offRoute: false, offT: 0, rerouted: 0, faults: [], D: 0, S: 0, cool: {}, timers: {}, flags: {}, stopPrev: new Map(), amberAt: new Map(), parked: true });
    for (const i of t.route.instructions) Object.assign(i, { sigSeen: false, checked: false, laneSeen: undefined, laneChecked: false, exitSigSeen: false, exitChecked: false, earlyFlag: false });
  };
  t.passed = () => t.S === 0 && t.D <= MARKING.maxDrivingFaults;
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
    if (!t.offRoute) { t.idx = best; t.sRoute = Math.max(t.sRoute, s - 4); t.offT = 0; }
    else { t.offT += dt; if (t.offT > 2.5) reroute(); }
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

  t.update = (dt, inputSteer) => {
    if (!t.running) return;
    const v = player.v, mph = Math.abs(v) * MPH, fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const nr = nearest(net, player.x, player.z); t.ctx = nr;
    progress(dt);
    // waypoints passed (for re-routing)
    while (t.wpIndex < t.waypoints.length - 1) { const n = t.waypoints[t.wpIndex]; if (Math.hypot(net.nx[n] - player.x, net.nz[n] - player.z) < 25) t.wpIndex++; else break; }
    if (!nr) return;
    const way = nr.way, limit = way.mph;
    // moving off from the kerb (Rule 159): look round first, and don't pull out in front of traffic coming from behind
    if (t.parked && Math.abs(v) > 0.8) {
      t.parked = false;
      const looked = player.lookAt !== undefined && traffic.clock - player.lookAt < 10;
      if (!looked) t.fault('D', 'Move off – safety', 'Moved off without checking your mirrors and blind spot first');
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
    if (timer('spd', mph > limit + 2.5, dt) > 2) t.fault('D', 'Use of speed', `Went over the ${limit} mph limit on ${way.name || 'this road'}`, 'spd', 10);
    if (timer('spd2', mph > limit + 10, dt) > 1) t.fault('S', 'Use of speed', `Drove well over the ${limit} mph limit`, 'spd2', 14);
    // one-way and positioning
    const along = fx * nr.tx + fz * nr.tz;
    if (way.oneway && timer('ww', v > 2 && along < -0.4, dt) > 0.8) t.fault('S', way.rb ? 'Positioning – roundabout' : 'Response to signs', way.rb ? 'Went the wrong way round the roundabout' : 'Drove the wrong way along a one-way road', 'ww', 12);
    if (!way.oneway && nr.d < way.w / 2 + 1) {
      const offL = nr.lat * (Math.sign(along) || 1);
      if (timer('pos', v > 2 && offL < -0.5, dt) > 1.4) t.fault('D', 'Positioning – normal driving', 'Drove on the right-hand side of the road', 'pos', 8);
    } else timer('pos', false, dt);
    // kerb
    if (nr.d > way.w / 2 + 0.8) { if (!t.flags.kerb && Math.abs(v) > 1.2) { t.flags.kerb = true; t.fault('D', 'Control – steering', 'Mounted the kerb', 'kerb', 4); } }
    else if (nr.d < way.w / 2) t.flags.kerb = false;
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
      if (Math.abs(fw) < 2.6 && lt < 1.25) { t.fault('S', 'Control – collision', 'Collided with a cyclist', 'bcol', 4); player.v = Math.min(player.v, 0); continue; }
      const gap = lt - 0.9 - 0.35; // car half-width + bike half-width
      if (Math.abs(fw) < 2.5 && v > b.v + 0.8 && gap < RULES.cyclistGap) {
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
    // collisions
    for (const c of traffic.cars) {
      if (!c.alive) continue; const ex = c.x - player.x, ez = c.z - player.z; if (Math.abs(ex) > 6 || Math.abs(ez) > 6) continue;
      const fw = ex * fx + ez * fz, lt = ex * fz - ez * fx;
      if (Math.abs(fw) < 4.1 && Math.abs(lt) < 1.85) {
        // being run into from behind, or while stopped, is not the learner's fault
        const theirFault = Math.abs(v) < 0.4 || (fw < -1.5 && c.v > v + 0.5);
        if (!theirFault) t.fault('S', 'Control – collision', 'Collided with another vehicle', 'col', 4);
        player.v = theirFault ? player.v : -Math.sign(fw || 1) * 1.5;
      }
    }
    // lane discipline: be in the lane the examiner asked for before the junction
    for (const ins of t.route.instructions) {
      if (!ins.laneOK || ins.laneChecked) continue;
      const ahead = ins.s - t.sRoute;
      if (ahead < 35 && ahead > 4 && nr.e === ins.approach.e) ins.laneSeen = laneIndex(nr.e, ins.approach.dir, nr.lat);
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
    for (const b of traffic.ringBikes) if (Math.hypot(b.x - player.x, b.z - player.z) < 1.6 && Math.abs(v) > 0.3) { t.fault('S', 'Control – collision', 'Collided with a cyclist', 'bcol', 4); player.v = 0; }
    // puffin crossings: never drive onto the crossing while someone is on it
    for (const c of traffic.puffins) {
      if (c.ped.state !== 'walk') continue; const dx = player.x - c.x, dz = player.z - c.z; if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      const al = dx * c.tx + dz * c.tz, lt = dx * c.tz - dz * c.tx;
      if (Math.abs(al) < 2 && Math.abs(lt) < c.w / 2 + 0.4 && Math.abs(v) > 0.8) t.fault('S', 'Pedestrian crossings', 'Drove onto the crossing while someone was crossing', 'pfn' + c.id, 8);
    }
    // finish: near the end, stopped, on the left
    const last = t.route.instructions[t.route.instructions.length - 1];
    if (t.step >= t.route.instructions.length - 1 && t.sRoute > last.s - 35 && Math.abs(v) < 0.3) {
      const offL = nr.lat * (way.oneway ? 1 : (Math.sign(along) || 1));
      if (offL > (way.oneway ? -0.5 : 0.3)) finish();
    }
  };
  function finish() { t.running = false; t.done = true; t.onFinish && t.onFinish(); }
  return t;
}
