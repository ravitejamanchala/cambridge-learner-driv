// Motorway lane discipline (issue #7): keeping left, changing lane, overtaking, following distance and
// getting across in good time for an exit.
//
// The assessor is fed one frame at a time and holds no reference to the simulation, so the same rules
// judge a live drive and a scripted trace in a unit test, and a trace always gives the same result.
// senseMotorway() builds a frame from the live sim.
//
// Context comes first. Being out of the left-hand lane is not a fault in itself: overtaking, or a
// vehicle alongside on the left that you cannot yet move in front of, justifies it. A fault is marked
// only for what the learner chose to do — moved without looking or signalling, pulled into a gap that
// made someone brake, cut in, stayed out with nothing to pass, sat too close, passed on the left.
import { laneInfo, nearestWhere } from './net.js';
import { MW } from './motorway.js';

export const LANE = {
  start: 0.25,        // lane widths off the centre of your lane: a lane change has begun
  settle: 0.25,       // ... within this of the new lane's centre: it is over
  mirrorWindow: 8,    // s: a mirror check counts for the move that follows within this
  signalLead: 1,      // s: give others at least this much warning
  hogAfter: 10,       // s out of the left-hand lanes with nothing to pass (Rule 264)
  gap: 2,             // s: the two-second rule (Rule 126)
  closeFor: 5,        // s continuously under two seconds before it is marked
  tailgate: 0.8,      // s: dangerously close ...
  tailgateFor: 2,     // ... for this long
  grace: 4,           // s after a lane change before the gap ahead is judged: someone may have cut in
  between: 2,         // s settled in a lane before moving on across the next (no sweeping across two in one go)
  lastMoment: 91,     // m (100 yards): moving left this close to the exit, then straight onto the slip, is cutting across
  exitBy: MW.countdown[0].at, // m: in the left-hand lane by the 300-yard countdown marker (Rule 272)
  slowedBefore: 8.9,  // m/s (20 mph): slowing this much on the carriageway before the slip road (Rule 272)
  stopFor: 2,         // s at walking pace on the carriageway, with nothing stopped ahead, is stopping (Rule 270)
  congested: 13.4,    // m/s (30 mph): below this lanes are queues, and lane rules relax (Rule 268)
  settleJoin: 5,      // s in the left-hand lane after joining before moving out (Rule 259)
  joinSlower: 8.9,    // m/s (20 mph): joining this much slower than the traffic is too slow (Rule 259)
  carLen: 4.6,
};

const MPH = 2.23694;
export const laneName = (i, n) => i === 0 ? 'left-hand' : i === n - 1 ? 'right-hand' : 'middle';
const side = (dir) => dir > 0 ? 'right' : 'left';
const sec = (x) => `${x < 10 ? x.toFixed(1) : Math.round(x)} s`;

// Is being out of the left-hand lanes justified? Overtaking: something slower in the lane to your left
// that you are about to reach or are still passing, or a vehicle so close behind on that side that
// moving back now would cut in front of it. Shared with the test driver, so the two never disagree.
export function overtaking(f, lane) {
  if (lane <= 0) return true;
  // in the middle lane with traffic coming down a slip road beside you: making room for it is courtesy,
  // not hogging (but nobody has to: Rule 259 puts the duty to give way on the joining traffic)
  if (lane === 1 && f.others.some(o => o.lane === -1 && o.fw > -60 && o.fw < 250)) return true;
  return f.others.some(o => {
    if (o.lane !== lane - 1) return false;
    // a vehicle less than two seconds behind on that side: waiting for it to drop back is careful, not hogging
    if (o.fw < 0) return -o.fw - LANE.carLen < Math.max(o.v, 1) * 2;
    const reach = o.v < f.v - 1.5 ? Math.min(250, (f.v - o.v) * 12 + 30) : 30;
    return o.fw <= reach;
  });
}

// Frame: { t, dt, v, laneF, lanes, indicator, looks: [{view, at}], others: [{id, lane, fw, v}], exitIn, joining }
//   laneF: continuous lane position, 0 = the centre of the left-hand lane, 1 the next, …; null off the motorway.
//     On an entry slip road it is measured from the carriageway being joined, so the acceleration lane is
//     about -1 and joining is a move from "lane -1" into the left-hand lane, judged like any lane change.
//   joining: on an entry slip road, alongside the carriageway; leaving: on an exit slip road, alongside it
//   vSigned: speed with its sign (negative is reversing)
//   others: vehicles on this carriageway; fw = metres ahead of you along the road (negative behind)
//   exitIn: metres to where your exit leaves (null if there is none)
// fault(kind, cat, text, key) is the examiner's own.
export function createLaneAssessor({ fault = () => {} } = {}) {
  const st = { lane: null, move: null, lastDone: -1e9, lastDir: 0, indOn: null, indSince: 0, hog: 0, hogFlag: false, hogLane: null,
    close: 0, closeFlag: false, clear: 0, tail: 0, tailFlag: false, seen: new Map(), exitChecked: false };
  const out = { events: [], stats: { measured: 0, under2: 0, minGap: Infinity, hogTime: 0, outTime: 0, justifiedTime: 0, lanesTime: [] } };
  const mark = (kind, cat, text, key) => { out.events.push({ type: 'fault', kind, cat, text }); fault(kind, cat, text, key); };

  function looked(f, dir) {
    const views = dir > 0 ? ['right', 'blindspot'] : ['left', 'left-blindspot'];
    const recent = (vs) => f.looks.some(l => vs.includes(l.view) && l.at >= f.t - LANE.mirrorWindow && l.at <= f.t);
    return { mirror: recent(views), blind: recent([views[1]]), interior: recent(['interior']) };
  }
  const inLane = (f, lane) => f.others.filter(o => o.lane === lane);
  // the vehicle you would be moving in front of, and the one you would be behind
  function gaps(f, lane) {
    let behind = null, ahead = null, alongside = null;
    for (const o of inLane(f, lane)) {
      if (Math.abs(o.fw) < LANE.carLen) { alongside = o; continue; }
      if (o.fw < 0 && (!behind || o.fw > behind.fw)) behind = o;
      if (o.fw > 0 && (!ahead || o.fw < ahead.fw)) ahead = o;
    }
    return { behind, ahead, alongside };
  }

  function step(f) {
    const { t, dt } = f;
    if (f.indicator !== st.indOn) { st.indOn = f.indicator; st.indSince = t; }
    // the exit: in the left-hand lane by the 300-yard marker. Only a fault if there was a real chance to
    // get there: a usable gap in the lane to the left, within reach by easing off or speeding up, for a few
    // seconds after the 1-mile sign. Boxed in all the way by traffic, carrying on is right, and not marked.
    if (f.exitIn != null && f.exitIn > LANE.exitBy && f.exitIn < MW.advance[0].at + 50 && f.laneF != null && Math.round(f.laneF) > 0) {
      // within reach: how far you could drop back or draw ahead (about 4 m/s) before the 300-yard marker
      const l = Math.round(f.laneF) - 1, need = 2.8 * Math.max(f.v, 10) + 2 * LANE.carLen, R = Math.min(150, 4 * (f.exitIn - LANE.exitBy) / Math.max(f.v, 10));
      const at = [-Infinity, ...f.others.filter(o => o.lane === l).map(o => o.fw).sort((a, b) => a - b), Infinity];
      let gap = false; for (let i = 1; i < at.length; i++) { const lo = Math.max(at[i - 1], -R - need), hi = Math.min(at[i], R + need); if (hi - lo >= need && at[i] > -R && at[i - 1] < R) gap = true; }
      st.leftClear = gap ? (st.leftClear || 0) + dt : 0; if (st.leftClear > 3) st.hadChance = true;
    }
    if (f.exitIn != null && !st.exitChecked && f.exitIn <= LANE.exitBy && f.laneF != null) {
      st.exitChecked = true; st.exitV = f.v;
      const here = Math.round(f.laneF), boxed = here > 0 && !st.hadChance;
      out.events.push({ type: 'exit-lane', t, lane: here, lanes: f.lanes, boxed });
      if (here > 0 && !boxed) mark('D', 'Positioning – lane discipline', `Was still in the ${laneName(here, f.lanes)} lane ${Math.round(LANE.exitBy / 0.9144 / 10) * 10} yards before the exit: move left in good time (Rule 272)`, 'mwexit');
    }
    if (f.laneF == null) { st.lane = null; st.move = null; return; }
    if (st.lane == null) st.lane = Math.max(f.joining || f.leaving ? -1 : 0, Math.min(f.lanes - 1, Math.round(f.laneF)));
    // never stop or reverse on the motorway: a missed exit means carrying on to the next one
    const onCarriageway = !f.joining && !f.leaving && f.laneF > -0.5, vs = f.vSigned ?? f.v;
    const queue = f.others.some(o => o.lane === Math.round(f.laneF) && o.fw > 0 && o.fw < 30 && o.v < 4);
    st.stopT = onCarriageway && vs < 2.2 && vs > -0.5 && !queue ? (st.stopT || 0) + dt : 0;
    if (st.stopT > LANE.stopFor && !st.stopFlag) { st.stopFlag = true; mark('S', 'Positioning – normal driving', 'Stopped on the motorway (Rule 270): if you miss your exit, carry on to the next one (Rule 263)', 'mwstop'); }
    st.revT = vs < -0.5 ? (st.revT || 0) + dt : 0;
    if (st.revT > 0.5 && !st.revFlag) { st.revFlag = true; mark('S', 'Positioning – normal driving', 'Reversed on the motorway: never reverse on a motorway, even to reach an exit you have missed (Rule 263)', 'mwrev'); }
    out.stats.lanesTime[st.lane] = (out.stats.lanesTime[st.lane] || 0) + dt;
    const off = f.laneF - st.lane;

    // ---- lane changes ----
    if (!st.move && Math.abs(off) > LANE.start) {
      const dir = Math.sign(off), to = st.lane + dir, leave = to === -1 && st.lane === 0 && (f.leaving || (f.exitIn != null && f.exitIn < 150));
      if ((to >= 0 && to < f.lanes) || leave) {
        const want = dir > 0 ? 'R' : 'L', signalled = st.indOn === want, lk = looked(f, dir), join = st.lane < 0;
        const afterJoin = !join && dir > 0 && st.lastFrom === -1 && t - st.lastDone < LANE.settleJoin;
        // straight across to the slip road from the lane you have only just moved into
        // (only at the last moment: into the left-hand lane by the 100-yard marker and then off is what the signs are for)
        const cutAcross = leave && st.lastDir < 0 && t - st.lastDone < 3 && st.lastExitIn != null && st.lastExitIn < LANE.lastMoment;
        st.move = { dir, from: st.lane, to, t0: t, mph: f.v * MPH, signalFor: signalled ? t - st.indSince : 0, ...lk, judged: false, join, leave,
          sweep: !afterJoin && !cutAcross && dir === st.lastDir && t - st.lastDone < LANE.between };
        // what was done before moving is recorded now, and marked only once the car is really changing lane
        // (below, as it crosses the line): a wobble towards the line that comes back is not a lane change
        st.move.what = join ? 'Joined the motorway' : leave ? 'Left the motorway' : `Moved ${side(dir)} into the ${laneName(to, f.lanes)} lane`;
        Object.assign(st.move, { signalled, afterJoin, cutAcross, exitSlowedBy: leave && st.exitV != null && st.exitV - f.v > LANE.slowedBefore ? Math.round((st.exitV - f.v) * MPH) : 0 });
      }
    }
    // committed: the car's centre is across the line. Now the checks before it count.
    if (st.move && !st.move.committed && (f.laneF - st.move.from) * st.move.dir >= 0.5) {
      const m = st.move, dir = m.dir; m.committed = true;
      if (!m.mirror) mark('D', 'Mirrors – change direction', `${m.what} without checking the ${side(dir)} mirror first`, 'mwmir');
      if (!m.signalled) mark('D', 'Signals – necessary', `${m.what} without signalling${m.join ? ' right' : m.leave ? ' left (Rule 272)' : ''}`, 'mwsig');
      if (m.sweep) mark('D', 'Positioning – lane discipline', `Swept across two lanes in one go: settle in each lane, then check and signal again`, 'mwsweep');
      if (m.afterJoin) mark('D', 'Positioning – lane discipline', `Moved out of the left-hand lane straight after joining: settle into the traffic first (Rule 259)`, 'mwjoinout');
      if (m.cutAcross) mark('S', 'Positioning – lane discipline', `Cut across to the exit at the last moment: be in the left-hand lane by the 300-yard marker (Rule 272)`, 'mwcutexit');
      // keep up with the traffic until you are on the slip road, then slow down on it
      if (m.exitSlowedBy) { m.slowedBy = m.exitSlowedBy; mark('D', 'Use of speed', `Slowed by ${m.slowedBy} mph on the motorway before the slip road: keep up with the traffic until you are on it, then slow down (Rule 272)`, 'mwslowexit'); }
    }
    if (st.move) {
      const m = st.move, into = f.laneF - m.from;
      // the moment the car's centre crosses the line: who is in the lane being joined?
      if (!m.judged && into * m.dir >= 0.5 && m.leave) {
        m.judged = true;
        // past the taper the slip road is separated from the carriageway by hatching: never cross it
        if (f.exitIn != null && -f.exitIn > MW.taper + 15) { m.gore = true; mark('S', 'Response to road markings', 'Crossed the hatched area to reach the slip road at the last moment (Rule 130): if you are too late, carry on to the next exit', 'mwgore'); }
      }
      if (!m.judged && into * m.dir >= 0.5) {
        m.judged = true;
        const g = gaps(f, m.to);
        m.behind = g.behind ? { d: -g.behind.fw - LANE.carLen, v: g.behind.v } : null;
        m.ahead = g.ahead ? { d: g.ahead.fw - LANE.carLen, v: g.ahead.v } : null;
        if (g.alongside) mark('S', 'Mirrors – change direction', m.join ? 'Joined the motorway with a vehicle alongside you: traffic already on the motorway has priority (Rule 259)' : `Moved ${side(m.dir)} into a lane with a vehicle alongside you`, 'mwside');
        else if (m.behind) {
          const b = m.behind, behindS = b.d / Math.max(b.v, 1), close = b.v - f.v, ttc = close > 0.3 ? b.d / close : Infinity;
          m.behindS = behindS;
          // Judged by whether the vehicle behind has to brake for you (Rule 133), not by the gap alone: moving
          // in a second ahead of a slower vehicle you are pulling away from forces nobody to do anything.
          if (m.dir < 0 && (behindS < 0.5 || (behindS < 1 && close > -4))) mark(behindS < 0.5 ? 'S' : 'D', 'Positioning – lane discipline', `Cut in after overtaking: the vehicle you passed was only ${sec(behindS)} behind when you moved back (Rule 163)`, 'mwcut');
          else if (ttc < 3 || behindS < 0.5 || (behindS < 1 && close > -1)) mark(ttc < 1.5 || behindS < 0.5 ? 'S' : 'D', 'Mirrors – change direction', `${m.join ? 'Joined the motorway' : `Moved ${side(m.dir)}`} into too small a gap: a vehicle ${Math.round(b.d)} m behind${close > 0.3 ? ` was closing at ${Math.round(close * MPH)} mph faster than you` : ` was only ${sec(behindS)} away`}`, 'mwgap');
        }
        if (m.ahead && f.v > 8 && m.ahead.d / f.v < LANE.tailgate) mark('D', 'Following distance', `${m.join ? 'Joined' : 'Moved into the lane'} only ${sec(m.ahead.d / f.v)} behind the vehicle ahead`, 'mwgapA');
        // joining: match the speed of the traffic in the left-hand lane (Rule 259)
        if (m.join) {
          const near = inLane(f, 0).filter(o => o.fw > -150 && o.fw < 100);
          m.trafficMph = near.length ? Math.round(near.reduce((a, o) => a + o.v, 0) / near.length * MPH) : null;
          // held up by traffic joining ahead of you on the slip road is not joining too slowly: you could go
          // no faster than it, and it was waiting for its own gap
          const heldUp = f.others.some(o => o.lane === -1 && o.fw > 0 && o.fw < 80);
          if (near.length && !heldUp && f.v < near.reduce((a, o) => a + o.v, 0) / near.length - LANE.joinSlower)
            mark('D', 'Use of speed', `Joined at ${Math.round(f.v * MPH)} mph into traffic doing about ${m.trafficMph} mph: build up your speed on the slip road (Rule 259)`, 'mwjoinslow');
        }
      }
      if (Math.abs(f.laneF - m.to) < LANE.settle) {
        out.events.push({ type: m.join ? 'join' : m.leave ? 'leave' : 'lane', t, from: m.from, to: m.to, lanes: f.lanes, mph: Math.round(m.join ? f.v * MPH : m.mph), slowedBy: m.slowedBy ?? 0, gore: !!m.gore, signalFor: +m.signalFor.toFixed(1), mirror: m.mirror, blind: m.blind, interior: m.interior,
          behindS: m.behindS != null ? +m.behindS.toFixed(1) : null, aheadS: m.ahead && f.v > 1 ? +(m.ahead.d / f.v).toFixed(1) : null, trafficMph: m.trafficMph ?? null });
        st.lane = m.to; st.lastDone = t; st.lastDir = m.dir; st.lastFrom = m.from; st.lastExitIn = f.exitIn; st.move = null;
        if (m.dir < 0 || st.lane !== st.hogLane) { st.hog = 0; st.hogFlag = false; }
      } else if (Math.abs(f.laneF - m.from) < LANE.settle * 0.6) st.move = null; // thought better of it
    }

    // ---- keep left unless overtaking (Rule 264) ----
    if (!st.move && st.lane > 0 && f.v > LANE.congested) {
      out.stats.outTime += dt;
      if (t - st.lastDone > 3 && !overtaking(f, st.lane)) {
        st.hog += dt; out.stats.hogTime += dt;
        if (st.hog > LANE.hogAfter && !st.hogFlag) {
          st.hogFlag = true; st.hogLane = st.lane;
          mark('D', 'Positioning – lane discipline', `Stayed in the ${laneName(st.lane, f.lanes)} lane with nothing to overtake and the lane to its left clear: move back left when you are past (Rule 264)`, 'mwhog');
        }
      } else { st.hog = 0; out.stats.justifiedTime += dt; }
    } else if (st.lane === 0) st.hog = 0;

    // ---- following distance (Rule 126) ----
    const own = gaps(f, Math.round(f.laneF)).ahead;
    if (own && f.v > 8 && t - st.lastDone > LANE.grace) {
      const gapS = (own.fw - LANE.carLen) / f.v;
      if (own.fw < f.v * 6) { out.stats.measured += dt; out.stats.minGap = Math.min(out.stats.minGap, gapS); }
      if (gapS < LANE.gap) { out.stats.under2 += dt; st.close += dt; st.clear = 0; } else { st.close = 0; st.clear += dt; }
      if (st.clear > 5) st.closeFlag = false;
      if (st.close > LANE.closeFor && !st.closeFlag) { st.closeFlag = true; mark('D', 'Following distance', `Stayed under two seconds behind the vehicle ahead for ${Math.round(st.close)} s at ${Math.round(f.v * MPH)} mph (Rule 126)`, 'mwfollow'); }
      st.tail = gapS < LANE.tailgate ? st.tail + dt : 0;
      if (st.tail > LANE.tailgateFor && !st.tailFlag) { st.tailFlag = true; mark('S', 'Following distance', `Drove ${Math.round(own.fw - LANE.carLen)} m behind the vehicle ahead at ${Math.round(f.v * MPH)} mph: far too close to stop`, 'mwtail'); }
      if (gapS > LANE.gap) st.tailFlag = false;
    } else { st.close = 0; st.tail = 0; }

    // ---- never overtake on the left (Rule 268). Keeping up with your own lane while the lane to your
    // right moves at a similar speed is allowed, so only a clear difference (over 5 mph) is overtaking ----
    for (const o of f.others) {
      const was = st.seen.get(o.id); st.seen.set(o.id, { fw: o.fw, lane: o.lane, t });
      if (!was || t - was.t > 0.5 || st.move || st.lane < 0) continue; // passing on a slip road before joining is not overtaking
      if (was.fw > 0 && o.fw <= 0 && o.lane > st.lane && o.lane === was.lane && f.v > LANE.congested && f.v > o.v + 2.2)
        mark('D', 'Positioning – lane discipline', `Overtook a vehicle on its left: overtake on the right, or stay behind (Rule 268)`, 'mwunder');
    }
    for (const [id, s] of st.seen) if (t - s.t > 2) st.seen.delete(id);
  }

  // Which lanes are right for you now, for the lane strip on the instruments: the left-hand lane, plus
  // the lane you are in while overtaking justifies it; only the left-hand lane once an exit is close.
  function guide(f) {
    if (f.laneF == null) return null;
    const here = Math.max(-1, Math.min(f.lanes - 1, Math.round(f.laneF))), ok = [0];
    if (f.exitIn == null || f.exitIn > 1600) for (let l = 1; l <= here; l++) if (overtaking(f, l)) ok.push(l);
    return { lanes: f.lanes, ok: [...new Set(ok)], here };
  }
  return { step, guide, events: out.events, stats: out.stats, get lane() { return st.lane; } };
}

// A frame from the live simulation. Only vehicles on the same carriageway, going the same way, within
// 300 m count.
export function senseMotorway({ t, dt, player, test, traffic, net = null, exitIn = null }) {
  let nr = test.ctx, on = nr && nr.way.cls === 'motorway', joining = false, leaving = false, mergeIn = null;
  // on a slip road alongside the carriageway: measure from the carriageway being joined or left
  const entry = !on && net && nr && nr.way.cls === 'motorway_link' && net.out[nr.e.b]?.some(o => o.e.way.cls === 'motorway');
  const exit = !on && net && nr && nr.way.cls === 'motorway_link' && !entry && net.out[nr.e.a]?.some(o => o.e.way.cls === 'motorway');
  if (entry || exit) {
    if (entry) mergeIn = nr.e.len - nr.s;
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const m = nearestWhere(net, player.x, player.z, e => e.way.cls === 'motorway');
    if (m && m.d < m.way.w / 2 + 7 && m.tx * fx + m.tz * fz > 0.9) { nr = m; on = true; joining = entry; leaving = exit; }
  }
  let laneF = null, lanes = 0;
  if (on) { const L = laneInfo(nr.e, 1); lanes = L.n; laneF = (L.outer - nr.lat) / L.laneW - 0.5; }
  const fx = -Math.sin(player.th), fz = -Math.cos(player.th), others = [];
  // vehicles on an entry slip road coming up to the merge count too, as "lane -1"
  const joiningCar = (c) => net && c.e.way.cls === 'motorway_link' && c.e.len - c.s < 500 && net.out[c.e.b]?.some(o => o.e.way.cls === 'motorway');
  if (on) traffic.cars.forEach((c, id) => {
    if (!c.alive || !c.e || Math.cos(c.th - player.th) < 0.7) return;
    const slip = c.e.way.cls !== 'motorway'; if (slip && !joiningCar(c)) return;
    const dx = c.x - player.x, dz = c.z - player.z, fw = dx * fx + dz * fz;
    if (Math.abs(fw) > 300 || Math.abs(dx * fz - dz * fx) > lanes * 3.65 + (slip ? 12 : 2)) return;
    others.push({ id, lane: slip ? -1 : c.lane, fw, v: c.v, into: c.intent ? c.intent.to : null }); // into: the lane it is signalling to move into
  });
  return { t, dt, v: Math.max(0, player.v), vSigned: player.v, laneF, lanes, indicator: player.indicator || null, looks: player.observations || [], others, exitIn, joining, leaving, mergeIn };
}
