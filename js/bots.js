import { createParkingDriver } from './parking-driver.js';
import { senseMotorway, overtaking } from './lane-discipline.js';
import { posAt } from './net.js';
import { steerFor, steerLock, HANDLING } from './config.js';
// Bot lab (open the sim with ?bots in the address): drives lessons, puzzles and mock tests with a
// rule-following test driver, as fast as the browser allows (no rendering unless you watch), and
// keeps every result in localStorage so several windows can run at once and add to the same table.
// Hidden from learners; for checking that every drive can be completed cleanly.

const KEY = 'cld.bot.';           // one localStorage entry per run, so windows never overwrite each other
const TAB = Math.random().toString(36).slice(2, 7);
const MPH = 2.23694;
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export function plannedStopPosition(route,index,light,lanePoint) {
  const step=route.steps[index],base=route.stepS[index]+(step.dir>0?light.s:step.e.len-light.s);
  let before=lanePoint(Math.max(0,base-25)),best=base,bestDelta=Infinity;
  let previous=(before.x-light.x)*light.tx+(before.z-light.z)*light.tz;
  for(let s=Math.max(0,base-25)+1;s<=Math.min(route.len,base+25);s++) {
    const point=lanePoint(s),signed=(point.x-light.x)*light.tx+(point.z-light.z)*light.tz;
    const lateral=(point.x-light.x)*light.tz-(point.z-light.z)*light.tx;
    if(previous<0&&signed>=0&&Math.abs(lateral)<light.w/2+2){const crossing=s-signed/(signed-previous),delta=Math.abs(crossing-base);if(delta<bestDelta){best=crossing;bestDelta=delta;}}
    before=point;previous=signed;
  }
  return best;
}

// ---------- the driver ----------
// Follows the route guide's lane line, keeps to limits, stops for lights, crossings and traffic,
// gives way at side roads, minis, roundabouts and cycle rings, signals, looks round before moving off.
export function makeDriver(api) {
  const parkingInput = createParkingDriver(api);
  const st = { lookedAt: -1e9, waitT: 0 },stopPositions=new WeakMap(),cyclePositions=new WeakMap();
  return function input() {
    const A = api.A, t = A.test, pl = api.player, R = t.route, tr = A.traffic, net = A.net; if (!t.running) return null;
    const lesson = api.lesson?.(), status = api.scenarioStatus?.();
    if (lesson?.manoeuvre) return parkingInput();
    if (t.timeOfDay === 'dusk' && !pl.headlights) pl.headlights = true; // dipped headlights before moving off at dusk
    if (pl.operation?.enabled && pl.operation.transmission !== 'automatic') {
      const missing = ['doorClosed', 'seatSet', 'mirrorsSet', 'belt'].find(k => !pl.operation[k]);
      if (missing) api.operate(missing);
      else if (lesson.scenario === 'engine') {
        if (!pl.operation.events.some(e => e.action === 'engine' && e.value) || pl.operation.engine) api.operate('engine');
      }
      return { throttle: 0, brake: 0, steer: 0 };
    }
    if (pl.operation?.transmission === 'automatic') {
      const desired = lesson.scenario === 'automatic-reverse' ? 'R' : 'D';
      if (status?.phase === 'prepare') {
        if (pl.rawInput?.brake >= 0.5 && Math.abs(pl.v) < 0.1) {
          if (pl.operation.gear !== desired) api.gear(desired);
          if (pl.operation.parkingBrake) api.operate('parkingBrake');
          api.look();
        }
        return { throttle: 0, brake: 1, steer: 0 };
      }
      if (['stop', 'secure'].includes(status?.phase)) {
        if (status.phase === 'secure' && pl.rawInput?.brake >= 0.5 && Math.abs(pl.v) < 0.1) {
          if (pl.operation.gear !== 'P') api.gear('P');
          if (!pl.operation.parkingBrake) api.operate('parkingBrake');
        }
        return { throttle: 0, brake: 1, steer: 0 };
      }
      // Idle creep is enough for this straight reversing exercise.
      if (desired === 'R') return { throttle: 0, brake: 0, steer: 0 };
      return { throttle: pl.v < 2.5 ? 0.3 : 0, brake: pl.v > 2.8 ? 0.3 : 0, steer: 0 };
    }
    if (lesson?.scenario === 'mirrors' && (t.parked || t.sRoute > 180)) {
      for (const view of ['interior', 'right', 'blindspot']) if (!pl.observations.some(e => e.view === view && (t.parked || tr.clock - e.at < 5))) api.look(view);
    }
    const fx = -Math.sin(pl.th), fz = -Math.cos(pl.th), dt = 0.05;
    if (api.estopBanner()) return { throttle: 0, brake: 1, steer: 0 };
    // moving off: look round, wait for traffic coming from behind (up to 8 s), signal right, go
    if (t.parked) {
      st.waitT += dt; if (tr.clock - pl.lookAt > 6) { api.look(); st.lookedAt = tr.clock; }
      const behind = tr.cars.some(o => { if (!o.alive || o.v < 1.5 || Math.cos(o.th - pl.th) < 0.7) return false; const dx = o.x - pl.x, dz = o.z - pl.z, fw = dx * fx + dz * fz; return fw < 3 && fw > -90 && Math.abs(dx * fz - dz * fx) < 5.5; });
      if (behind || tr.clock - st.lookedAt < 1.2) return { throttle: 0, brake: pl.v > 0.05 ? 1 : 0, steer: 0 };
      if (pl.indicator !== 'R') pl.signal('R');
    } else st.waitT = 0;
    const nearMini=net.minis.some(m=>Math.hypot(m.x-pl.x,m.z-pl.z)<18);
    const follow = nearMini ? 6 : 10;
    const p = api.lanePoint(t.sRoute + follow), d = wrapA(Math.atan2(-(p.x - pl.x), -(p.z - pl.z)) - pl.th);
    // on a motorway: its own lane-aware driving, below (nothing else on the road applies there)
    const mw = joinPlan(api, st, t, pl, tr) || exitPlan(api, st, t, pl, tr) || motorwayPlan(api, st, t, pl, tr);
    if (mw) { const dm = wrapA(Math.atan2(-(mw.p.x - pl.x), -(mw.p.z - pl.z)) - pl.th);
      return { throttle: pl.v < mw.target - 0.2 ? 1 : 0, brake: pl.v > mw.target + 0.5 ? Math.min(1, (pl.v - mw.target) / 4) : 0, steer: steerFor(dm, 2, pl.v), aim: dm }; }
    const nr = t.ctx; let target = Math.min(nr ? nr.way.mph / MPH * 0.88 : 8, 8);
    if(nearMini)target=Math.min(target,3.5);
    if (lesson?.scenario === 'steering') target = Math.min(target, 5.5);
    const ins = R.instructions[t.step], ahead = ins.s - t.sRoute;
    if (!t.parked && pl.indicator === 'R' && !(ins.signal === 'R' && ahead < 90)) pl.signal('R'); // cancel the moving-off signal
    if (ins.kind === 'rb' && ahead < 45) target = Math.min(target, ahead < 15 ? 5.5 : 8);
    else if (ins.kind !== 'straight' && ins.kind !== 'end' && ahead < 35) target = Math.min(target, 5);
    if (nr && nr.way.rb) target = Math.min(target, 7);
    const prev = R.instructions[t.step - 1]; if (prev && /left|right/.test(prev.kind) && t.sRoute - prev.s < 14) target = Math.min(target, 5);
    const p2 = api.lanePoint(t.sRoute + 45), bend = Math.abs(wrapA(Math.atan2(-(p2.x - pl.x), -(p2.z - pl.z)) - pl.th));
    if (bend > 0.25) target = Math.min(target, Math.max(9, 22 - bend * 30));
    if (['controlled-stop', 'accel-decel', 'mirrors'].includes(lesson?.scenario)) {
      target = Math.min(target, 5.5);
      if (lesson.scenario === 'controlled-stop' && status?.message?.startsWith('Brake to stop')) target = 0;
      if (lesson.scenario === 'accel-decel' && status?.message?.startsWith('Release accelerator')) target = 3;
    }
    if (ins.final && t.sRoute > ins.s - 60) target = Math.min(target, 4);
    if (ins.final && t.sRoute > ins.s - 28) target = 0;
    const stopAt = (fw, m) => { target=Math.min(target,Math.max(0,(fw-m)*.45)); };
    // See stop lines along the planned route before steering towards them.
    // A tight turn can otherwise hide a red ring signal from a heading-only scan.
    for(let i=0;i<R.steps.length;i++) {
      const step=R.steps[i];if(R.stepS[i]>t.sRoute+50)break;
      if(R.stepS[i]+step.e.len<t.sRoute-1)continue;
      for(const light of net.stopsByEdge.get(step.e.id)||[]) {
        if(light.dir!==step.dir)continue;
        if(!stopPositions.has(R))stopPositions.set(R,new Map());const positions=stopPositions.get(R),key=i+':'+light.id;
        if(!positions.has(key))positions.set(key,plannedStopPosition(R,i,light,api.lanePoint));
        const distance=positions.get(key)-t.sRoute;
        if(distance<.2||distance>50)continue;
        const passed=(pl.x-light.x)*light.tx+(pl.z-light.z)*light.tz;
        if(passed>.5 && fx*light.tx+fz*light.tz>.3)continue;
        const state=tr.lightState(light);
        if(state==='R'||state==='RA'||(state==='A'&&distance>1.5))stopAt(distance,6);
      }
    }
    for (const s of net.stops) { if(t.ctx && s.e!==t.ctx.e)continue;const rx = s.x - pl.x, rz = s.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 50 || Math.abs(rx * fz - rz * fx) > s.w / 2 + 2 || s.tx * fx + s.tz * fz < 0.5) continue; const L = tr.lightState(s); if (L === 'R' || L === 'RA' || (L === 'A' && fw > 6)) stopAt(fw, 4.5); }
    for (const z of net.zebras) { if (z.ped.state === 'idle') continue; const rx = z.x - pl.x, rz = z.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 40 || Math.abs(rx * fz - rz * fx) > z.w) continue; stopAt(fw, 5); }
    for (const c of tr.puffins) { if (c.ped.state === 'idle') continue; const rx = c.x - pl.x, rz = c.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 40 || Math.abs(rx * fz - rz * fx) > c.w) continue; stopAt(fw, 4.5); }
    const look = Math.max(24, pl.v * pl.v / 9 + pl.v * 1.2 + 8), others = tr.cars.concat(tr.bikes);
    const path=[{x:pl.x,z:pl.z,s:0}];
    for(let distance=3;distance<=look+3;distance+=3)path.push({...api.lanePoint(t.sRoute+distance),s:distance});
    const routeGap=o=>{
      let gap=Infinity,along=0;
      for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,u=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/(dx*dx+dz*dz||1))),distance=Math.hypot(o.x-a.x-dx*u,o.z-a.z-dz*u);if(distance<gap){gap=distance;along=a.s+(b.s-a.s)*u;}}
      return {gap,along};
    };
    for(const o of others){
      if(!o.alive||Math.hypot(o.x-pl.x,o.z-pl.z)>look+6)continue;
      const {gap,along}=routeGap(o),width=o.kind==='bike'?3.05:2.3;
      if(gap>width||along<.5)continue;
      if(Math.cos(o.th-pl.th)<-.5){if(o.kind==='bike')stopAt(along,10);continue;}
      const following=o.v+Math.max(0,(along-8)*.35);target=Math.min(target,following);stopAt(along,8);
    }
    for(const o of others){
      if(!o.alive||Math.hypot(o.x-pl.x,o.z-pl.z)>35)continue;
      const dx=o.x-pl.x,dz=o.z-pl.z,vx=-Math.sin(o.th)*o.v-fx*pl.v,vz=-Math.cos(o.th)*o.v-fz*pl.v;
      if(dx*vx+dz*vz>=0)continue;
      for(const time of [.5,1,1.5,2,2.5]){
        const q=api.lanePoint(t.sRoute+Math.max(0,pl.v)*time),u=Math.min(1,time/1.5);
        const x=pl.x+(q.x-pl.x)*u,z=pl.z+(q.z-pl.z)*u;
        const ox=o.x-Math.sin(o.th)*o.v*time,oz=o.z-Math.cos(o.th)*o.v*time;
        if(Math.hypot(ox-x,oz-z)<3.2){stopAt(Math.max(0,routeGap(o).along),8);break;}
      }
    }
    if (ins.kind === 'right' && ahead < 14 && ahead > -4 && tr.cars.some(o => { if (!o.alive || o.v < 1) return false; const dx = o.x - pl.x, dz = o.z - pl.z, fw = dx * fx + dz * fz; return fw > 0 && fw < 60 && Math.cos(o.th - pl.th) < -0.6 && Math.abs(dx * fz - dz * fx) < 8; })) stopAt(ahead + 2, 0);
    if (ins.approach && ahead > 1.5 && ahead < 26 && net.giveways.some(g => g.e === ins.approach.e && g.dir === ins.approach.dir)) {
      const vx = net.nx[ins.node], vz = net.nz[ins.node];
      if (others.some(o => { if (!o.alive || o.v < 0.8) return false; const dx = vx - o.x, dz = vz - o.z, dd = Math.hypot(dx, dz); if (dd > 55 || dd < 3 || Math.hypot(o.x - pl.x, o.z - pl.z) < 4) return false; return (dx * -Math.sin(o.th) + dz * -Math.cos(o.th)) / dd > 0.6; })) stopAt(ahead, 5);
    }
    if (ins.kind === 'rb' && ahead > 2 && ahead < 22) {
      const vx = net.nx[ins.node], vz = net.nz[ins.node], lit = net.stops.some(s => s.e===ins.approach.e && s.dir===ins.approach.dir && Math.hypot(s.x-vx,s.z-vz)<40);
      if (!lit && others.some(o => o.alive && o.e.way.rb && o.v > .5 && Math.hypot(o.x - vx, o.z - vz) < 26 && ((vx - o.x) * -Math.sin(o.th) + (vz - o.z) * -Math.cos(o.th)) > -1)) stopAt(ahead, 8);
    }
    for (const m of net.minis) {
      const dx = m.x - pl.x, dz = m.z - pl.z, fw = dx * fx + dz * fz; if (fw < 5 || fw > 26 || Math.abs(dx * fz - dz * fx) > 8) continue;
      const rx = -fz, rz = fx; if (others.some(o => { if (!o.alive || o.v < 1) return false; const ox = o.x - m.x, oz = o.z - m.z, od = Math.hypot(ox, oz); if (od > 26 || od < 2.5) return false; return -(ox * -Math.sin(o.th) + oz * -Math.cos(o.th)) / od > 0.5 && (ox * rx + oz * rz) / od > 0.3; })) stopAt(fw, 8);
    }
    for (const ring of net.cycleRings) for (const cr of ring.crossings) {
      for(let i=0;i<R.steps.length;i++){
        const step=R.steps[i];if(step.e!==cr.e)continue;
        const base=R.stepS[i]+(step.dir>0?cr.s:step.e.len-cr.s);
        if(base-t.sRoute< -15||base-t.sRoute>40)continue;
        if(!cyclePositions.has(R))cyclePositions.set(R,new Map());const positions=cyclePositions.get(R),key=ring.x+':'+ring.z+':'+i+':'+cr.s;
        if(!positions.has(key)){
          let crossing=base,best=Infinity,previous=null;
          for(let s=Math.max(0,base-15);s<=Math.min(R.len,base+15);s++){
            const point=api.lanePoint(s),d=Math.hypot(point.x-ring.x,point.z-ring.z)-ring.r;
            if(previous&&previous.d*d<=0){const candidate=s-d/(d-previous.d||1);if(Math.abs(candidate-base)<best){crossing=candidate;best=Math.abs(candidate-base);}}
            previous={d};
          }
          const point=api.lanePoint(crossing);positions.set(key,{s:crossing,angle:Math.atan2(point.x-ring.x,-(point.z-ring.z))});
        }
        const crossing=positions.get(key),distance=crossing.s-t.sRoute;if(distance<.4||distance>35)continue;
        if(tr.ringBikes.some(b=>b.alive!==false&&b.ring===ring&&wrapA(b.ang-crossing.angle)*ring.r> -25&&wrapA(b.ang-crossing.angle)*ring.r<5))stopAt(distance,8);
      }
    }
    // a blue-light vehicle is working its way through: slow right down and let it past (Rule 219)
    if (api.scenarioPhase?.() === 'coming') target = Math.min(target, 1.6);
    if (ins.signal && ahead < 80 && ahead > 3 && pl.indicator !== ins.signal && !(ins.kind === 'rb' && t.sRoute > ins.prevExitS - 0.3)) pl.signal(ins.signal);
    if (ins.kind === 'rb' && ins.exitSignal && t.sRoute > ins.prevExitS + 0.3 && t.sRoute < ins.exitS && pl.indicator !== 'L') pl.signal('L');
    return { throttle: pl.v < target - 0.15 ? 1 : 0, brake: pl.v > target + (target < .1 ? 0 : .15) && pl.v > 0.01 ? 1 : 0, steer: steerFor(d, 2.4, pl.v), aim: d };
  };
}

// ---------- motorway ----------
// The reference driver for the motorway lessons: keeps left, overtakes slower traffic only into a gap
// nobody has to brake for (mirror, shoulder, signal, then move), moves back once the vehicle passed is
// well behind, keeps two seconds and a bit behind, never passes on the left, and gets across one lane at
// a time for an exit, easing off to drop in behind traffic when it has to.
function motorwayPlan(api, st, t, pl, tr) {
  const f = senseMotorway({ t: tr.clock, dt: 0.05, player: pl, test: t, traffic: tr });
  if (f.laneF == null) { st.mw = null; return null; }
  const R = t.route, here = Math.max(0, Math.min(f.lanes - 1, Math.round(f.laneF))), v = Math.max(pl.v, 1);
  // a new drive (or a new route) starts afresh: the driver is reused from one drive to the next
  // ... and settles for a few seconds before changing lane: just joined, or just started (Rule 259)
  // (a new drive shows as the traffic clock starting again; a new route mid-drive keeps the settle time)
  const fresh = !st.mw || tr.clock < st.mw.clock;
  if (fresh || st.mw.route !== R) st.mw = { route: R, lat: here, want: here, from: here, moving: false, go: 0, settle: fresh ? tr.clock + 6 : st.mw.settle };
  const M = st.mw; M.clock = tr.clock;
  const cruise = Math.min(t.ctx.way.mph / MPH * 0.95, 30), CAR = 4.6;
  const k = R.steps.findIndex(x => x.e.way.cls === 'motorway_link'), exitIn = k > 0 ? R.stepS[k] - t.sRoute : null;
  const inLane = l => f.others.filter(o => o.lane === l).sort((a, b) => a.fw - b.fw), ahead = l => inLane(l).find(o => o.fw > 3);
  // a gap nobody has to brake for: well clear of anything behind (more when moving back in, so as never
  // to cut in), clear of anything alongside, and not on the tail of anything ahead
  const safeInto = (l, back) => l >= 0 && l < f.lanes && inLane(l).every(o => {
    if (Math.abs(o.fw) < 7) return false;
    if (o.fw < 0) { const d = -o.fw - CAR, close = o.v - pl.v; return d / Math.max(o.v, 1) > (back ? 2.2 : 1.6) && (close <= 0.3 || d / close > 6); }
    return (o.fw - CAR) / v > 1.6 || o.v > pl.v + 1;
  });
  const look = (dir) => { const vs = dir > 0 ? ['right', 'blindspot'] : ['left', 'left-blindspot'];
    for (const view of vs) if (!pl.observations.some(e => e.view === view && tr.clock - e.at < 3)) api.look(view); };
  const indicate = (d) => { if (pl.indicator !== d) pl.signal(d); }, cancel = () => { if (pl.indicator) pl.signal(pl.indicator); };
  let target = cruise;
  if (!M.moving && tr.clock > M.settle) {
    let want = here; const lead = ahead(here), next = ahead(here + 1);
    // for an exit, move left one lane at a time; once the 300-yard marker has gone by out of the left-hand
    // lane it is too late: let the exit go and carry on (Rule 263), never cut across
    if (exitIn != null && exitIn < 2400) { if (here > 0 && exitIn > 280) want = here - 1; }
    // overtake only when the next lane is actually moving faster than this one
    else if (lead && lead.v < cruise - 2 && (lead.fw - CAR) / v < 7 && here < f.lanes - 1 && (!next || next.fw > 150 || next.v > lead.v + 2)) want = here + 1;
    else if (here > 0 && !overtaking(f, here)) want = here - 1;
    if (want !== here && safeInto(want, want < here)) {
      const dir = want > here ? 1 : -1; Object.assign(M, { want, from: here, moving: true, go: tr.clock + 1.8 });
      look(dir); indicate(dir > 0 ? 'R' : 'L');
    } else if (want < here && exitIn != null && exitIn > 280) {
      // getting across for an exit: pick the gap in the lane you need and match its speed to drop into it
      const cars = inLane(want), gaps = [];
      for (let g = 0; g <= cars.length; g++) {
        const b = cars[g - 1], a = cars[g], lo = b ? b.fw + CAR + 2.3 * Math.max(b.v, 1) : -Infinity, hi = a ? a.fw - CAR - 1.7 * v : Infinity;
        if (hi - lo > 0) gaps.push({ lo, hi, v: a && b ? (a.v + b.v) / 2 : (a || b)?.v ?? cruise });
      }
      const at = (g) => Math.max(g.lo, Math.min(g.hi, 0)), best = gaps.sort((p, q) => Math.abs(at(p)) - Math.abs(at(q)))[0];
      // the gap ahead of you: speed up into it; behind you: drop back into it
      // (never below about 45 mph on the motorway: with no gap, let the exit go rather than crawl)
      if (best) { const d = at(best); target = Math.min(30.5, Math.max(20, best.v + Math.max(-4, Math.min(4, d * 0.12)) + Math.sign(d) * 0.6)); }
    }
  }
  // still waiting to move left for an exit as the 300-yard marker goes by: too late, let it go
  if (M.moving && exitIn != null && exitIn < 280 && M.want < M.from && Math.abs(M.lat - M.from) < 0.01) { M.moving = false; M.want = M.from; cancel(); }
  if (M.moving && tr.clock >= M.go) {
    const dir = M.want > M.from ? 1 : -1;
    if (Math.abs(M.lat - M.from) < 0.01) {
      if (!safeInto(M.want, dir < 0)) M.go = tr.clock + 0.5; // the gap closed: wait, still signalling
      else { look(dir); M.lat += dir * 0.025; } // mirror and shoulder again, right as the car moves
    } else {
      M.lat += Math.sign(M.want - M.lat) * Math.min(Math.abs(M.want - M.lat), 0.025);
      if (M.lat === M.want) { M.moving = false; M.settle = tr.clock + 4; cancel(); }
    }
  }
  // two seconds and a bit behind whatever is ahead, in this lane and in the one being moved into
  for (const l of new Set([here, M.want])) { const o = ahead(l); if (o) target = Math.min(target, Math.max(0, o.v + ((o.fw - CAR) - 2.4 * v) * 0.25)); }
  // never pass on the left at speed
  for (const o of f.others) if (o.lane > here && o.fw > 0 && o.fw < 80 && o.v < pl.v && pl.v > 13.4) target = Math.min(target, o.v - 0.3);
  // the exit, from the left-hand lane: mirror, a glance over the shoulder and a left signal by the 300-yard
  // marker, the mirror again as the slip road starts, and the speed of the traffic kept until on it
  if (exitIn != null && exitIn < 300 && exitIn > -20 && here === 0 && !M.moving) {
    if (pl.indicator !== 'L') { for (const view of ['left', 'left-blindspot']) api.look(view); indicate('L'); st.exitV = pl.v; }
    if (exitIn < 40 && !pl.observations.some(e => e.view === 'left' && tr.clock - e.at < 3)) api.look('left');
  }
  // an exit let go: the route still turns up the slip road, so steer by the motorway itself, in this lane,
  // until the lesson routes on to the next junction
  if (exitIn != null && exitIn < 280 && here > 0) M.letGo = true;
  if (M.letGo && exitIn != null && t.ctx.way.cls === 'motorway') {
    let e = t.ctx.e, s2 = t.ctx.s + 25;
    if (s2 > e.len) { const o = api.A.net.out[e.b].find(x => x.e.way.cls === 'motorway'); if (o) { s2 -= e.len; e = o.e; } else s2 = e.len; }
    const c = posAt(e, Math.min(e.len, s2)), lat = e.way.w / 2 - 3.65 * (M.lat + 0.5);
    return { p: { x: c.x + c.tz * lat, z: c.z - c.tx * lat }, target };
  }
  const q = api.lanePoint(t.sRoute + 25), off = M.lat * 3.65;
  return { p: { x: q.x - q.tz * off, z: q.z + q.tx * off }, target };
}

// Joining from an entry slip road (Rule 259): build up to the speed of the left-hand lane, look right and
// signal as the acceleration lane begins, and match the speed of a gap to drop into it. The slip road
// itself runs into the left-hand lane, so following it is joining; with no safe gap, stop at the end of
// the slip road rather than run out of it.
function joinPlan(api, st, t, pl, tr) {
  const nr = t.ctx, R = t.route; if (!nr || nr.way.cls !== 'motorway_link') return null;
  const k = R.steps.findIndex(x => x.e === nr.e); if (k < 0 || R.steps[k + 1]?.e.way.cls !== 'motorway') return null;
  const mergeIn = R.stepS[k] + nr.e.len - t.sRoute, CAR = 4.6, v = Math.max(pl.v, 1);
  const f = senseMotorway({ t: tr.clock, dt: 0.05, player: pl, test: t, traffic: tr, net: api.A.net });
  const lane0 = f.others.filter(o => o.lane === 0).sort((a, b) => a.fw - b.fw), near = lane0.filter(o => Math.abs(o.fw) < 250);
  const flow = near.length ? near.reduce((a, o) => a + o.v, 0) / near.length : 27;
  let target = Math.min(29, Math.max(18, flow));
  if (mergeIn < 320) {
    for (const view of ['right', 'blindspot']) if (!pl.observations.some(e => e.view === view && tr.clock - e.at < 3)) api.look(view);
    if (pl.indicator !== 'R') pl.signal('R');
  }
  if (f.joining) {
    const safe = lane0.every(o => { if (Math.abs(o.fw) < 7) return false;
      if (o.fw < 0) { const d = -o.fw - CAR, close = o.v - pl.v; return d / Math.max(o.v, 1) > 1.7 && (close <= 0.3 || d / close > 6); }
      return (o.fw - CAR) / v > 1.6 || o.v > pl.v + 1; });
    if (!safe) {
      const gaps = [];
      for (let g = 0; g <= lane0.length; g++) {
        const b = lane0[g - 1], a = lane0[g], lo = b ? b.fw + CAR + 1.9 * Math.max(b.v, 1) : -Infinity, hi = a ? a.fw - CAR - 1.7 * v : Infinity;
        if (hi - lo > 0) gaps.push({ lo, hi, v: a && b ? (a.v + b.v) / 2 : (a || b)?.v ?? flow });
      }
      const at = (g) => Math.max(g.lo, Math.min(g.hi, 0)), best = gaps.sort((p, q) => Math.abs(at(p)) - Math.abs(at(q)))[0];
      if (best) { const d = at(best); target = Math.min(30.5, Math.max(4, best.v + Math.max(-5, Math.min(5, d * 0.15)) + Math.sign(d) * 0.6)); }
      // the taper starts 80 m before the merge: never into it without a gap
      if (mergeIn < 110) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 3 * (mergeIn - 85))));
    }
  }
  // and never faster than the vehicle ahead on the slip road allows: other traffic joins here too
  const ahead = tr.cars.filter(c => c.alive && c.e === nr.e).map(c => ({ c, d: (c.s - nr.s) * (nr.dir ?? 1) })).filter(o => o.d > 0).sort((a, b) => a.d - b.d)[0];
  if (ahead) target = Math.min(target, Math.max(0, ahead.c.v + (ahead.d - CAR - 2 - 2.2 * v) * 0.4)); // two seconds and a little
  return { p: api.lanePoint(t.sRoute + 25), target };
}

// Leaving by an exit slip road (Rule 272): keep up with the traffic while still beside the carriageway,
// then slow down on the slip road for its bend and the roundabout at the end. Near the roundabout the
// ordinary driver takes over, to give way.
const bendAt = (e, s) => { const a = posAt(e, Math.max(0, s - 12)), b = posAt(e, Math.min(e.len, s)), c = posAt(e, Math.min(e.len, s + 12));
  const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z), k = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  return k > 1e-6 ? ab * bc * ca / (2 * k) : 1e6; };
function exitPlan(api, st, t, pl, tr) {
  const nr = t.ctx, R = t.route; if (!nr || nr.way.cls !== 'motorway_link') return null;
  const k = R.steps.findIndex(x => x.e === nr.e); if (k < 1 || R.steps[k - 1].e.way.cls !== 'motorway') return null;
  if (nr.e.len - nr.s < 70) return null;
  const f = senseMotorway({ t: tr.clock, dt: 0.05, player: pl, test: t, traffic: tr, net: api.A.net });
  let target;
  if (f.laneF != null && f.laneF > -0.8) target = Math.max(st.exitV ?? pl.v, 20); // still beside the carriageway: keep up
  else {
    let suit = 30; for (let d = 0; d <= 150; d += 10) suit = Math.min(suit, Math.sqrt(2.6 * bendAt(nr.e, nr.s + d)) + d * 0.09);
    target = Math.min(suit, Math.sqrt(64 + 2 * 2.4 * Math.max(0, nr.e.len - nr.s - 60)));
  }
  if (pl.indicator !== 'L' && nr.s < 120) pl.signal('L');
  if (nr.s > 120 && pl.indicator === 'L') pl.signal('L'); // cancel once clear of the motorway
  return { p: api.lanePoint(t.sRoute + 20), target };
}

// ---------- results store ----------
function allRuns() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(KEY)) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (_) {} } } } catch (_) {}
  return out.sort((a, b) => a.at - b.at);
}
function saveRun(r) { try { localStorage.setItem(KEY + r.at + '.' + TAB + '.' + Math.random().toString(36).slice(2, 6), JSON.stringify(r)); } catch (_) {} }
function clearRuns() { try { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith(KEY) || k.startsWith('cld.note.'))) ks.push(k); } ks.forEach(k => localStorage.removeItem(k)); } catch (_) {} }
function allNotes() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cld.note.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (_) {} } } } catch (_) {} return out.sort((a, b) => a.at - b.at); }
function download(name, text, type, url) { const a = document.createElement('a'); a.href = url || URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); if (!url) setTimeout(() => URL.revokeObjectURL(a.href), 2000); }


// ---------- runner + panel ----------
// A person at the controls. The reference driver above always knows the right steering angle, applies it
// exactly and at once, twenty times a second. A person sees the road a moment late, decides a few times a
// second, and on a keyboard or the touch buttons can only press left, right, accelerator or brake all the
// way. This wraps the reference driver's intentions in those limits, so the Bot lab can show how hard a
// drive is for someone driving it by hand: how often they leave the road, and how much steering it takes.
//   device 'keys'  on/off steering and pedals, as the keyboard and touch buttons are
//   device 'stick' an analog stick or wheel, with a little unsteadiness in the hand
export function humanize(drive, { device = 'keys', reaction = 0.3, rate = 10, clock, speed: api_v = () => 0, seed = 7 } = {}) {
  const seen = []; let next = -1, key = 0, stick = 0, pedal = { throttle: 0, brake: 0 }, r = seed >>> 0;
  const acc = { steer: 0, throttle: 0, brake: 0 }, out = { steer: 0, throttle: 0, brake: 0 };
  const rand = () => { r = (r + 0x6D2B79F5) >>> 0; let x = Math.imul(r ^ (r >>> 15), 1 | r); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const stats = { presses: 0, steerTravel: 0 };
  const human = () => {
    const now = clock(), o = drive(); if (!o) return o;
    if (seen.length && now < seen[seen.length - 1][0]) { seen.length = 0; next = -1; } // a new drive: the clock started again
    seen.push([now, o]); while (seen.length > 2 && seen[1][0] <= now - reaction) seen.shift();
    if (now < next && now >= next - 1) return { ...o, ...pedal, steer: device === 'keys' ? key : stick };
    next = now + 1 / rate;
    const late = { ...seen[0][1] }; // what the driver had seen `reaction` seconds ago
    // A person steers only as firmly as their reaction time allows without weaving (McRuer's crossover
    // model): the wheel angle per radian of heading error is capped at about 0.8 × wheelbase / (speed ×
    // reaction time). The reference driver, reacting at once, can afford to steer harder.
    const v = Math.max(3, Math.abs(api_v())), lock = steerLock(v);
    if (typeof late.aim === 'number' && late.aim) { const wheel = late.steer * lock, cap = 0.8 * HANDLING.wheelbase / (v * reaction) * Math.abs(late.aim);
      late.steer = Math.max(-1, Math.min(1, Math.sign(wheel) * Math.min(Math.abs(wheel), cap) / lock)); }
    if (device === 'keys') {
      // keys are on or off, so a person taps: a gentle turn or a light throttle is a key pressed some of
      // the time, more often the more is wanted (each decision makes up for what the last ones fell short by)
      const tapped = (want, k) => { acc[k] += want - out[k]; out[k] = Math.abs(acc[k]) >= 0.5 ? Math.sign(acc[k]) : 0; return out[k]; };
      const was = key; key = tapped(late.steer, 'steer'); if (key && key !== was) stats.presses++;
      pedal = { throttle: Math.max(0, tapped(late.throttle, 'throttle')), brake: Math.max(0, tapped(late.brake, 'brake')) };
    } else {
      const was = stick; stick = Math.max(-1, Math.min(1, late.steer + (rand() - 0.5) * 0.08)); stats.steerTravel += Math.abs(stick - was);
      pedal = { throttle: late.throttle, brake: late.brake };
    }
    return { ...o, ...pedal, steer: device === 'keys' ? key : stick };
  };
  human.stats = stats;
  return human;
}

export function createBotLab(api) {
  const yieldNow = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const f = q.shift(); f && f(); }; return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); }); })();
  const drive = makeDriver(api);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div'); el.id = 'botlab';
  el.innerHTML = `<style>
#botlab{position:fixed;right:12px;top:84px;max-height:calc(100vh - 100px);width:min(440px,calc(100vw - 24px));z-index:60;background:rgba(18,14,22,.94);color:#fff;border-radius:16px;font:13px/1.35 Geist,ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.45)}
#botlab header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}#botlab h2{margin:0;font-size:16px;flex:1}
#botlab .row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
#botlab label{display:flex;gap:5px;align-items:center}#botlab input[type=number]{width:56px;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px 5px}
#botlab button{background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:8px;padding:6px 11px;font:inherit;cursor:pointer}#botlab button.go{background:#ff8c28;border-color:#ff8c28;color:#1a0f00;font-weight:700}
#botlab .live{font:12px/1.4 ui-monospace,monospace;color:#ffcf8a;padding:8px 14px;min-height:36px}
#botlab .tbl{overflow:auto;flex:1;padding:0 6px 10px}#botlab table{width:100%;border-collapse:collapse;font-size:12px}#botlab th,#botlab td{padding:5px 6px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}#botlab th{position:sticky;top:0;background:#1d1822;font-weight:600;color:#bbb}
#botlab td.n{text-align:right;font-variant-numeric:tabular-nums}#botlab .bad{color:#ff7b7f}#botlab .ok{color:#6fe0a0}#botlab .min{width:30px;height:30px;padding:0}
#botlab.min .row,#botlab.min .tbl{display:none}#botlab.min{bottom:auto}</style>
<header><h2>Bot lab</h2><span id="blCount"></span><button class="min" id="blMin" title="Collapse">–</button></header>
<div class="row"><label style="flex:1">Drive <select id="blPick" style="flex:1;min-width:0;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:4px"></select></label></div>
<div class="row"><label>Traffic <select id="blTraffic" style="background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px"><option value="lesson">The lesson's own</option><option value="random">Add random traffic</option></select></label></div>
<div class="row"><label>Driver <select id="blDriver" style="background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px"><option value="reference">Reference bot</option><option value="keys">A person on keys</option><option value="stick">A person on a controller</option></select></label></div>
<div class="row"><label>Runs <input type="number" id="blN" min="1" max="500" value="1"></label><label>Seed <input type="number" id="blSeed" placeholder="Random" min="0" max="4294967295"></label><label>Speed <select id="blSpd" style="background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px"><option value="1">1× watch</option><option value="2">2× watch</option><option value="4">4× watch</option><option value="0">Max, no view</option></select></label><label><input type="checkbox" id="blLoop"> Keep going</label></div>
<div class="row"><button class="go" id="blGo">Start</button><button id="blStop" disabled>Stop</button><span style="flex:1"></span><button id="blJson">Export JSON</button><button id="blCsv">Export CSV</button><button id="blClear">Clear</button></div>
<div class="row"><button id="blPause" disabled>Pause</button><button id="blPick2">Pick point</button><button id="blShot">Screenshot</button><input id="blNote" placeholder="What's wrong here?" style="flex:1;min-width:120px;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:5px"><button id="blSave">Save note</button></div>
<div class="live" id="blPos" style="color:#9fd3ff;padding-top:0"></div>
<div class="live" id="blLive">Ready. Each window runs its own bots; results from every window appear below.</div>
<div class="tbl"><table><thead><tr><th>Drive</th><th class="n">Runs</th><th class="n">Pass</th><th class="n">Avg D</th><th class="n">S</th><th class="n">Stuck</th><th>Most common fault</th></tr></thead><tbody id="blBody"></tbody></table></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  $('blMin').onclick = () => el.classList.toggle('min');
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  $('blPick').innerHTML = opt('all:all', 'Everything') + opt('all:lesson', 'All lessons') + opt('all:puzzle', 'All puzzles') + opt('all:mock', 'All mock tests') +
    ['lesson', 'puzzle', 'mock'].map(k => `<optgroup label="${k === 'mock' ? 'Mock tests' : k[0].toUpperCase() + k.slice(1) + 's'}">${api.plans.filter(p => p.kind === k).map(p => opt(p.kind + ':' + p.id, p.title)).join('')}</optgroup>`).join('');
  let running = false, stopReq = false, paused = false, picking = false, picked = null;
  // ---- where am I: car position, clicked point, pause, screenshot, notes ----
  const fmt = (v) => v.toFixed(1);
  function where() {
    const A = api.A, pl = api.player, t = A.test, nr = t && t.ctx;
    return { area: A.id, drive: t && t.route ? t.route.name : '', x: +fmt(pl.x), z: +fmt(pl.z), heading: Math.round(((-pl.th * 180 / Math.PI) % 360 + 360) % 360), mph: Math.round(Math.abs(pl.v) * MPH),
      road: nr ? (nr.way.name || (nr.way.rb ? 'roundabout' : 'unnamed')) : '', s: t ? Math.round(t.sRoute) : 0, clock: Math.round(A.traffic ? A.traffic.clock : 0), picked };
  }
  setInterval(() => { if (!api.A.net) return; const w = where(); $('blPos').textContent = `car ${w.area} x ${w.x} z ${w.z} · ${w.road} · ${w.mph} mph · route ${w.s} m` + (picked ? `\npoint x ${picked.x} z ${picked.z} (${picked.road || 'off road'})` : ''); }, 250);
  $('blPause').onclick = () => { paused = !paused; $('blPause').textContent = paused ? 'Resume' : 'Pause'; };
  $('blPick2').onclick = () => { picking = !picking; $('blPick2').textContent = picking ? 'Click the road…' : 'Pick point'; document.body.style.cursor = picking ? 'crosshair' : ''; };
  document.getElementById('stage').addEventListener('click', (e) => {
    if (!picking) return; const p = api.pick(e.clientX, e.clientY); if (!p) return;
    picking = false; $('blPick2').textContent = 'Pick point'; document.body.style.cursor = '';
    picked = { x: +fmt(p.x), z: +fmt(p.z), road: p.road }; api.pin(p.x, p.z);
    try { navigator.clipboard.writeText(`${api.A.id} x ${picked.x} z ${picked.z}`); } catch (_) {}
  }, true);
  $('blShot').onclick = () => {
    const w = where(), img = api.snapshot(), t = api.A.test;
    const c = document.createElement('canvas'), im = new Image();
    im.onload = () => {
      const strip = 64; c.width = im.width; c.height = im.height + strip; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      g.fillStyle = '#18121a'; g.fillRect(0, im.height, c.width, strip); g.fillStyle = '#fff'; g.font = '600 14px ui-monospace,monospace';
      g.fillText(`${w.drive}  ·  area ${w.area}  ·  car x ${w.x} z ${w.z}  heading ${w.heading}°  ${w.mph} mph  ·  route ${w.s} m  ·  t ${w.clock} s`, 14, im.height + 26);
      g.fillStyle = '#ffcf8a'; g.fillText((picked ? `point x ${picked.x} z ${picked.z}  ·  ` : '') + (t && t.faults.length ? 'faults: ' + t.faults.map(f => f.text).join(' | ') : 'no faults') + ($('blNote').value ? '  ·  note: ' + $('blNote').value : ''), 14, im.height + 50);
      download(`bot-${w.area}-x${Math.round(w.x)}-z${Math.round(w.z)}.png`, null, null, c.toDataURL('image/png'));
    };
    im.src = img;
  };
  $('blSave').onclick = () => {
    const w = where(), text = $('blNote').value.trim(); if (!text) { $('blNote').focus(); return; }
    try { localStorage.setItem('cld.note.' + Date.now() + '.' + TAB, JSON.stringify({ ...w, text, at: Date.now() })); } catch (_) {}
    $('blNote').value = ''; $('blLive').textContent = 'Note saved with the coordinates. It is in the exports.';
  };

  function render() {
    const runs = allRuns(), by = new Map();
    for (const r of runs) { let g = by.get(r.key); if (!g) by.set(r.key, g = { title: r.title, runs: [] }); g.runs.push(r); }
    $('blCount').textContent = runs.length + ' runs';
    const rows = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, g]) => {
      const n = g.runs.length, pass = g.runs.filter(r => r.pass).length, avgD = g.runs.reduce((a, r) => a + r.D, 0) / n, S = g.runs.reduce((a, r) => a + r.S, 0), stuck = g.runs.filter(r => r.end !== 'done').length;
      const fc = new Map(), at = new Map(); for (const r of g.runs) { for (const f of r.faults) fc.set(f, (fc.get(f) || 0) + 1); for (const w of r.where || []) at.set(w[1], w); }
      const top = [...fc.entries()].sort((a, b) => b[1] - a[1])[0], hits = g.runs.reduce((a, r) => a + (r.hitBy ? r.hitBy.length : 0), 0);
      const loc = top && at.get(top[0]) ? ` <span style="color:#9fd3ff">@ ${at.get(top[0])[2]}, ${at.get(top[0])[3]}</span>` : '';
      return `<tr><td>${esc(g.title)}<br><span style="color:#888">${esc(key)}</span></td><td class="n">${n}</td><td class="n ${pass === n ? 'ok' : 'bad'}">${Math.round(pass / n * 100)}%</td><td class="n">${avgD.toFixed(1)}</td><td class="n ${S ? 'bad' : ''}">${S}</td><td class="n ${stuck ? 'bad' : ''}">${stuck}</td><td>${top ? esc(top[0]) + ' ×' + top[1] + loc : '<span class="ok">none</span>'}${hits ? `<br><span style="color:#888">hit by others ×${hits}</span>` : ''}</td></tr>`;
    });
    $('blBody').innerHTML = rows.join('') || '<tr><td colspan="7" style="color:#888">No runs yet.</td></tr>';
  }
  window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith(KEY)) render(); });
  setInterval(() => { if (!running) render(); }, 4000);

  async function runOne(p, label, iteration) {
    const base=$("blSeed").value,seed=base===""?crypto.getRandomValues(new Uint32Array(1))[0]:(Number(base)+iteration)>>>0;
    await api.start(p.kind, p.id, seed, { traffic: $('blTraffic').value });
    const A = api.A, t = A.test, wall0 = performance.now(), speed = +$('blSpd').value, watch = speed > 0;
    const limit = Math.max(240, t.route.len / 3 + 180); // seconds of sim time before giving up
    let sim = 0, bestS = t.sRoute, lastProg = 0, end = 'done';
    const who = $('blDriver').value, input = who === 'reference' ? drive : humanize(drive, { device: who, clock: () => A.traffic.clock, speed: () => api.player.v, seed });
    api.setInput(input);
    while (!t.done) {
      if (stopReq) { end = 'stopped'; break; }
      if (paused) { await new Promise(r => requestAnimationFrame(r)); api.frame(0); continue; }
      if (watch) {
        // watching: one drawn frame per screen refresh, the sim moved on by `speed` × the real time that passed
        const f0 = performance.now(); await new Promise(r => requestAnimationFrame(r));
        const dt = Math.min(0.1, (performance.now() - f0) / 1000) * speed, n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n;
        if (n > 1) api.step(n - 1, h); api.frame(h); sim += dt;
      } else {
        const slice = performance.now();
        while (!t.done && performance.now() - slice < 30) { api.step(1, 0.05); sim += 0.05; }
      }
      if (t.sRoute > bestS + 1) { bestS = t.sRoute; lastProg = sim; }
      if (sim - lastProg > 90) { end = 'stuck'; break; }
      if (sim > limit) { end = 'timeout'; break; }
      $('blLive').textContent = `${label}  ${p.title}\n${Math.round(t.sRoute)} / ${Math.round(t.route.len)} m · ${Math.round(sim)} s sim · ${(sim / ((performance.now() - wall0) / 1000)).toFixed(0)}× real time · D ${t.D} S ${t.S}`;
      if (!watch) await yieldNow();
    }
    api.setInput(null);
    if(!t.done)t.running=false;
    const res = t.done ? api.result() : { pass: false, why: end };
    const pl = api.player;
    saveRun({ key: p.kind + ':' + p.id, title: p.title, kind: p.kind,seed,release:document.querySelector('meta[name="app-release"]')?.content||'source', at: Date.now(), tab: TAB, end, pass: !!res.pass && end === 'done', D: t.D, S: t.S,
      faults: t.faults.map(f => f.text), cats: t.faults.map(f => f.cat), where: t.faults.map(f => [f.kind, f.text, f.x, f.z]), hitBy: (t.hits || []).map(h => [h.text, h.x, h.z]), why: res.why || '', len: Math.round(t.route.len), reached: Math.round(t.sRoute),
      simT: Math.round(sim), wallT: Math.round((performance.now() - wall0) / 100) / 10, rerouted: t.rerouted, at_xz: [Math.round(pl.x), Math.round(pl.z)],
      traffic: $('blTraffic').value, driver: who, offRoad: { max: +(t.offRoad?.max || 0).toFixed(2), seconds: +(t.offRoad?.seconds || 0).toFixed(1) }, steering: input.stats || null });
    render();
  }

  $('blGo').onclick = async () => {
    if (running) return;
    const v = $('blPick').value, list = v.startsWith('all:') ? api.plans.filter(p => v === 'all:all' || p.kind === v.slice(4)) : api.plans.filter(p => p.kind + ':' + p.id === v);
    if (!list.length) return;
    running = true; stopReq = false; paused = false; $('blGo').disabled = true; $('blStop').disabled = false; $('blPause').disabled = false; $('blPause').textContent = 'Pause'; api.botMode(true);
    try {
      do {
        const N = Math.max(1, +$('blN').value || 1), total = list.length * N; let k = 0;
        for (const p of list) for (let i = 0; i < N && !stopReq; i++) await runOne(p, `[${++k}/${total}]`,i);
      } while ($('blLoop').checked && !stopReq);
    } catch (err) { $('blLive').textContent = 'Stopped by an error: ' + err.message; console.error(err); }
    running = false; api.botMode(false); $('blGo').disabled = false; $('blStop').disabled = true; $('blPause').disabled = true; render();
    if (!stopReq) $('blLive').textContent = 'Finished. ' + allRuns().length + ' runs stored in this browser.';
  };
  $('blStop').onclick = () => { stopReq = true; $('blLive').textContent = 'Stopping after this step…'; };
  $('blJson').onclick = () => download('bot-runs.json', JSON.stringify({ runs: allRuns(), notes: allNotes() }, null, 1), 'application/json');
  $('blCsv').onclick = () => {
    const cols = ['key', 'title', 'at', 'tab', 'end', 'pass', 'D', 'S', 'len', 'reached', 'simT', 'wallT', 'rerouted', 'faults', 'where', 'hitBy','seed','release'];
    const q = (v) => '"' + String(Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.join(' ') : x).join(' | ') : v ?? '').replace(/"/g, '""') + '"';
    const notes = allNotes().map(n => ['note', n.drive, new Date(n.at).toISOString(), n.area, `x ${n.x} z ${n.z}`, n.picked ? `point x ${n.picked.x} z ${n.picked.z}` : '', n.road, n.s, n.text].map(q).join(','));
    download('bot-notes.csv', ['type,drive,at,area,car,point,road,route_m,text'].concat(notes).join('\n'), 'text/csv');
    download('bot-runs.csv', [cols.join(',')].concat(allRuns().map(r => cols.map(c => q(c === 'at' ? new Date(r.at).toISOString() : r[c])).join(','))).join('\n'), 'text/csv');
  };
  $('blClear').onclick = () => { if (confirm('Delete every stored bot run and note in this browser?')) { clearRuns(); render(); } };
  render();
}
