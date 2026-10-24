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
import { laneInfo } from './net.js';

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
  between: 3,         // s settled in a lane before moving on across the next (no sweeping across two)
  exitBy: 270,        // m: in the left-hand lane by the 300-yard marker for an exit (Rule 272)
  congested: 13.4,    // m/s (30 mph): below this lanes are queues, and lane rules relax (Rule 268)
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
  return f.others.some(o => {
    if (o.lane !== lane - 1) return false;
    // a vehicle less than two seconds behind on that side: waiting for it to drop back is careful, not hogging
    if (o.fw < 0) return -o.fw - LANE.carLen < Math.max(o.v, 1) * 2;
    const reach = o.v < f.v - 1.5 ? Math.min(250, (f.v - o.v) * 12 + 30) : 30;
    return o.fw <= reach;
  });
}

// Frame: { t, dt, v, laneF, lanes, indicator, looks: [{view, at}], others: [{id, lane, fw, v}], exitIn }
//   laneF: continuous lane position, 0 = the centre of the left-hand lane, 1 the next, …; null off the motorway
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
    // the exit: in the left-hand lane by the 300-yard marker
    if (f.exitIn != null && !st.exitChecked && f.exitIn <= LANE.exitBy && f.laneF != null) {
      st.exitChecked = true;
      const here = Math.round(f.laneF);
      out.events.push({ type: 'exit-lane', t, lane: here, lanes: f.lanes });
      if (here > 0) mark('D', 'Positioning – lane discipline', `Was still in the ${laneName(here, f.lanes)} lane ${Math.round(LANE.exitBy / 0.9144 / 10) * 10} yards before the exit: move left in good time (Rule 272)`, 'mwexit');
    }
    if (f.laneF == null) { st.lane = null; st.move = null; return; }
    if (st.lane == null) st.lane = Math.max(0, Math.min(f.lanes - 1, Math.round(f.laneF)));
    out.stats.lanesTime[st.lane] = (out.stats.lanesTime[st.lane] || 0) + dt;
    const off = f.laneF - st.lane;

    // ---- lane changes ----
    if (!st.move && Math.abs(off) > LANE.start) {
      const dir = Math.sign(off), to = st.lane + dir;
      if (to >= 0 && to < f.lanes) {
        const want = dir > 0 ? 'R' : 'L', signalled = st.indOn === want, lk = looked(f, dir);
        st.move = { dir, from: st.lane, to, t0: t, mph: f.v * MPH, signalFor: signalled ? t - st.indSince : 0, ...lk, judged: false, sweep: dir === st.lastDir && t - st.lastDone < LANE.between };
        if (!lk.mirror) mark('D', 'Mirrors – change direction', `Moved ${side(dir)} into the ${laneName(to, f.lanes)} lane without checking the ${side(dir)} mirror first`, 'mwmir');
        if (!signalled) mark('D', 'Signals – necessary', `Moved ${side(dir)} into the ${laneName(to, f.lanes)} lane without signalling`, 'mwsig');
        if (st.move.sweep) mark('D', 'Positioning – lane discipline', `Swept across two lanes in one go: settle in each lane, then check and signal again`, 'mwsweep');
      }
    }
    if (st.move) {
      const m = st.move, into = f.laneF - m.from;
      // the moment the car's centre crosses the line: who is in the lane being joined?
      if (!m.judged && into * m.dir >= 0.5) {
        m.judged = true;
        const g = gaps(f, m.to);
        m.behind = g.behind ? { d: -g.behind.fw - LANE.carLen, v: g.behind.v } : null;
        m.ahead = g.ahead ? { d: g.ahead.fw - LANE.carLen, v: g.ahead.v } : null;
        if (g.alongside) mark('S', 'Mirrors – change direction', `Moved ${side(m.dir)} into a lane with a vehicle alongside you`, 'mwside');
        else if (m.behind) {
          const b = m.behind, behindS = b.d / Math.max(b.v, 1), close = b.v - f.v, ttc = close > 0.3 ? b.d / close : Infinity;
          m.behindS = behindS;
          if (m.dir < 0 && behindS < 1) mark(behindS < 0.5 ? 'S' : 'D', 'Positioning – lane discipline', `Cut in after overtaking: the vehicle you passed was only ${sec(behindS)} behind when you moved back (Rule 163)`, 'mwcut');
          // it would have to brake for you (Rule 133: never force anyone to change speed or course)
          else if (ttc < 4 || behindS < 1 || (behindS < 1.5 && close > 0.5)) mark(ttc < 1.5 || behindS < 0.5 ? 'S' : 'D', 'Mirrors – change direction', `Moved ${side(m.dir)} into too small a gap: a vehicle ${Math.round(b.d)} m behind${close > 0.3 ? ` was closing at ${Math.round(close * MPH)} mph faster than you` : ` was only ${sec(behindS)} away`}`, 'mwgap');
        }
        if (m.ahead && f.v > 8 && m.ahead.d / f.v < LANE.tailgate) mark('D', 'Following distance', `Moved into the lane only ${sec(m.ahead.d / f.v)} behind the vehicle ahead`, 'mwgapA');
      }
      if (Math.abs(f.laneF - m.to) < LANE.settle) {
        out.events.push({ type: 'lane', t, from: m.from, to: m.to, lanes: f.lanes, mph: Math.round(m.mph), signalFor: +m.signalFor.toFixed(1), mirror: m.mirror, blind: m.blind, interior: m.interior,
          behindS: m.behindS != null ? +m.behindS.toFixed(1) : null, aheadS: m.ahead && f.v > 1 ? +(m.ahead.d / f.v).toFixed(1) : null });
        st.lane = m.to; st.lastDone = t; st.lastDir = m.dir; st.move = null;
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
      if (!was || t - was.t > 0.5 || st.move) continue;
      if (was.fw > 0 && o.fw <= 0 && o.lane > st.lane && o.lane === was.lane && f.v > LANE.congested && f.v > o.v + 2.2)
        mark('D', 'Positioning – lane discipline', `Overtook a vehicle on its left: overtake on the right, or stay behind (Rule 268)`, 'mwunder');
    }
    for (const [id, s] of st.seen) if (t - s.t > 2) st.seen.delete(id);
  }

  // Which lanes are right for you now, for the lane strip on the instruments: the left-hand lane, plus
  // the lane you are in while overtaking justifies it; only the left-hand lane once an exit is close.
  function guide(f) {
    if (f.laneF == null) return null;
    const here = Math.max(0, Math.min(f.lanes - 1, Math.round(f.laneF))), ok = [0];
    if (f.exitIn == null || f.exitIn > 1600) for (let l = 1; l <= here; l++) if (overtaking(f, l)) ok.push(l);
    return { lanes: f.lanes, ok: [...new Set(ok)], here };
  }
  return { step, guide, events: out.events, stats: out.stats, get lane() { return st.lane; } };
}

// A frame from the live simulation. Only vehicles on the same carriageway, going the same way, within
// 300 m count.
export function senseMotorway({ t, dt, player, test, traffic, exitIn = null }) {
  const nr = test.ctx, on = nr && nr.way.cls === 'motorway';
  let laneF = null, lanes = 0;
  if (on) { const L = laneInfo(nr.e, 1); lanes = L.n; laneF = (L.outer - nr.lat) / L.laneW - 0.5; }
  const fx = -Math.sin(player.th), fz = -Math.cos(player.th), others = [];
  if (on) traffic.cars.forEach((c, id) => {
    if (!c.alive || !c.e || c.e.way.cls !== 'motorway' || Math.cos(c.th - player.th) < 0.7) return;
    const dx = c.x - player.x, dz = c.z - player.z, fw = dx * fx + dz * fz;
    if (Math.abs(fw) > 300 || Math.abs(dx * fz - dz * fx) > lanes * 3.65 + 2) return;
    others.push({ id, lane: c.lane, fw, v: c.v });
  });
  return { t, dt, v: Math.max(0, player.v), laneF, lanes, indicator: player.indicator || null, looks: player.observations || [], others, exitIn };
}
