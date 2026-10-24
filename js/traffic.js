// Traffic lights, other cars, cyclists, and pedestrians at zebra crossings.
// Vehicles follow lane centres and take smooth curves through junctions.
import { TRAFFIC } from './config.js';
import { safeTrafficSpawn } from './traffic-spawn.js';
import { seededRandom } from './random.js';
import { along, endNode, posAt, laneCentre, laneInfo, cycleLeft, laneArrows, manoeuvre, nearestWhere } from './net.js';
import { MW } from './motorway.js';

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createTraffic(net, scene, makeCarMesh, makeBikeMesh, makePedestrianMesh = null) {
  let clock = 0;
  let random=Math.random;
  // drivers' traits come from a stream of their own, so adding them left the traffic itself (where each
  // vehicle starts, its speed, its turns) exactly as each seeded lesson was tuned against
  let traitRandom=Math.random;
  // lessons can script a junction: { group, t0 } holds `group` on green until t0, then runs amber, red, red-and-amber, green
  const overrides = new Map();
  // UK sequence: red, red+amber, green, amber, red. Junctions alternate two groups; stand-alone crossings get a pedestrian phase.
  function lightState(st) {
    const ov = overrides.get(st.cluster);
    if (ov) {
      const el = clock - ov.t0, mine = st.group === ov.group || st.single;
      if (el < 0) return mine ? 'G' : 'R';
      if (el < 30) { if (!mine) return 'R'; return el < 3 ? 'A' : el < 11 ? 'R' : el < 13 ? 'RA' : 'G'; }
      overrides.delete(st.cluster);
    }
    const ph = ((clock + st.offset) % 32 + 32) % 32;
    if (st.single) { if (ph < 20) return 'G'; if (ph < 23) return 'A'; if (ph < 30) return 'R'; return 'RA'; }
    if (st.group === 0) { if (ph < 12) return 'G'; if (ph < 15) return 'A'; if (ph < 30) return 'R'; return 'RA'; }
    if (ph < 15) return 'R'; if (ph < 17) return 'RA'; if (ph < 27) return 'G'; if (ph < 30) return 'A'; return 'R';
  }

  // ---------- pedestrians ----------
  const pedPool = [];
  for (let i = 0; i < TRAFFIC.peds; i++) {
    if(makePedestrianMesh){const g=makePedestrianMesh(i);g.visible=false;scene.add(g);pedPool.push(g);continue;}
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.15, 10), new THREE.MeshLambertMaterial({ color: [0x2f5d8a, 0x8a3b2f, 0x3f6b46, 0x6b4f8a][i % 4] })); body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9b896 })); head.position.y = 1.72;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x2b2e33 })); legs.position.y = 0.25;
    g.add(body, head, legs); g.visible = false; scene.add(g); pedPool.push(g);
  }
  for (const z of net.zebras) z.ped = { state: 'idle', t: 2 + ((z.id * 7.1) % 9), p: 0, dir: 1 };
  // puffin and pelican crossings (stand-alone lights): someone waits on amber and walks on red
  const puffins = [], byCluster = new Map();
  for (const st of net.stops) if (st.single) { let l = byCluster.get(st.cluster); if (!l) byCluster.set(st.cluster, l = []); l.push(st); }
  for (const list of byCluster.values()) {
    const st = list[0], p = posAt(st.e, st.s); let x = 0, z = 0;
    for (const s of list) { x += s.x + s.tx * 2.5; z += s.z + s.tz * 2.5; }
    puffins.push({ id: puffins.length, x: x / list.length, z: z / list.length, tx: p.tx, tz: p.tz, w: st.e.way.w, st, last: 'G', ped: { state: 'idle', p: 0, dir: 1 } });
  }
  function updatePeds(dt, px, pz) {
    const active = [];
    for (const c of puffins) {
      const d = Math.hypot(c.x - px, c.z - pz), P = c.ped, L = lightState(c.st);
      if (d > 220) { P.state = 'idle'; c.last = L; continue; }
      if (P.state === 'idle' && (L === 'A' || (L === 'R' && c.last !== 'R'))) { P.state = 'wait'; P.p = 0; P.dir = (c.id + Math.floor(clock / 40)) % 2 ? 1 : -1; }
      if (P.state === 'wait' && L === 'R') P.state = 'walk';
      if (P.state === 'walk') { P.p += dt * 1.45 / (c.w + 3.2); if (P.p >= 1) P.state = 'idle'; }
      c.last = L; if (P.state !== 'idle') active.push([d, c]);
    }
    for (const z of net.zebras) {
      const d = Math.hypot(z.x - px, z.z - pz); if (d > 220) { z.ped.state = 'idle'; continue; }
      const P = z.ped; P.t -= dt;
      if (P.state === 'idle' && P.t <= 0) { P.state = 'wait'; P.t = 1.6; P.dir = random() < 0.5 ? 1 : -1; P.p = 0; }
      else if (P.state === 'wait' && P.t <= 0) P.state = 'walk';
      else if (P.state === 'walk') { P.p += dt / ((z.w + 3.2) / 1.3); if (P.p >= 1) { P.state = 'idle'; P.t = 8 + random() * 16; } }
      if (P.state !== 'idle') active.push([d, z]);
    }
    active.sort((a, b) => a[0] - b[0]);
    pedPool.forEach((m, i) => {
      const it = active[i]; m.visible = !!it; if (!it) return; const z = it[1], P = z.ped;
      const half = z.w / 2 + 1.6, o = P.dir * (-half + 2 * half * P.p);
      m.position.set(z.x + z.tz * o, 0, z.z - z.tx * o);
      m.rotation.y=Math.atan2(-z.tz*P.dir,z.tx*P.dir);
      m.userData.pedestrian?.update(dt,P.state==='walk');
    });
  }

  // ---------- vehicles (cars and bikes) ----------
  const cars = [], bikes = [], all = [];
  let player = null;
  const isMain = cls => /^(trunk|primary|secondary)/.test(cls);
  function offsetFor(a, e, dir) {
    if (a.kind === 'car') { const f = Math.max(0, a.laneF ?? a.lane), i = Math.floor(f), u = f - i; return u ? laneCentre(e, dir, i) * (1 - u) + laneCentre(e, dir, i + 1) * u : laneCentre(e, dir, i); }
    const c = cycleLeft(e, dir), w = e.way;
    const sw = a.swing || 0; // moved out to pass a stopped car
    if (c === 1 || c === 2) return w.w / 2 - w.cw / 2 - sw;
    if (c === 3) return w.w / 2 + 1.7; // separate track beside the road
    return w.w / 2 - 0.85 - sw;
  }
  function chooseNext(a) {
    if (a.path) { const i = a.path.findIndex(st => st.e === a.e && st.dir === a.dir); if (i >= 0 && a.path[i + 1]) return a.path[i + 1]; }
    const v = endNode(a), all0 = net.out[v].filter(o => o.e !== a.e && !(a.kind === 'bike' && /trunk/.test(o.e.way.cls)));
    if (!all0.length) return a.e.way.oneway ? null : { e:a.e, dir:-a.dir };
    // a lesson's own traffic stays on the road it was placed on (motorway lessons: never off at a junction)
    const kept = a.keepTo ? all0.filter(o => o.e.way.cls === a.keepTo) : [], opts = kept.length ? kept : all0;
    const p = along(a.e, a.e.len - 0.5, a.dir);
    // keep to the lane arrows: a car in a "left only" lane turns left
    let use = opts;
    if (a.kind === 'car' && !net.inc[v].some(o => o.e.way.rb)) {
      const codes = laneArrows(net, a.e, a.dir), c = codes && codes[Math.min(a.lane, codes.length - 1)];
      if (c) { const f = opts.filter(o => { const q = along(o.e, Math.min(5, o.e.len / 2), o.dir); return c.includes(manoeuvre(Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz))); }); if (f.length) use = f; }
    }
    let tot = 0; const w = use.map(o => {
      const q = along(o.e, Math.min(5, o.e.len / 2), o.dir);
      const ang = Math.abs(Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz));
      // on a motorway most traffic carries on past a junction; about one car in eight takes the slip road
      let rank = o.e.way.cls === 'motorway' ? 7 : o.e.way.cls === 'motorway_link' ? 1 : isMain(o.e.way.cls) ? 2.2 : /tertiary/.test(o.e.way.cls) ? 1.6 : o.e.way.rb ? 3 : 0.7;
      if (a.kind === 'bike' && (o.e.way.cl || o.e.way.cr)) rank *= 2.5;
      const x = rank * (ang < 0.5 ? 3 : 1); tot += x; return x;
    });
    let r = random() * tot; for (let i = 0; i < use.length; i++) { r -= w[i]; if (r <= 0) return use[i]; }
    return use[use.length - 1];
  }
  // junction curve: quadratic Bezier from the lane on the incoming edge to the lane on the outgoing edge
  const jT = (e1, e2) => Math.min(7, e1.len / 3, e2.len / 3);
  function bez(a, e1, d1, e2, d2, T, u) {
    const A = along(e1, e1.len - T, d1, offsetFor(a, e1, d1)), B = along(e2, T, d2, offsetFor(a, e2, d2));
    const dx = B.x - A.x, dz = B.z - A.z, det = A.tx * B.tz - A.tz * B.tx;
    let cx = (A.x + B.x) / 2, cz = (A.z + B.z) / 2;
    if (Math.abs(det) > 0.15) { let k = (dx * B.tz - dz * B.tx) / det; k = Math.max(0, Math.min(T * 2.5, k)); cx = A.x + A.tx * k; cz = A.z + A.tz * k; }
    const m = 1 - u;
    const x = m * m * A.x + 2 * u * m * cx + u * u * B.x, z = m * m * A.z + 2 * u * m * cz + u * u * B.z;
    let tx = 2 * m * (cx - A.x) + 2 * u * (B.x - cx), tz = 2 * m * (cz - A.z) + 2 * u * (B.z - cz); const L = Math.hypot(tx, tz) || 1;
    return { x, z, tx: tx / L, tz: tz / L };
  }
  function trackPoint(a) {
    const e = a.e;
    if (a.next) { const T = jT(e, a.next.e); if (a.s > e.len - T) return bez(a, e, a.dir, a.next.e, a.next.dir, T, (a.s - (e.len - T)) / (2 * T)); }
    if (a.prev) { const T = jT(a.prev.e, e); if (a.s < T) return bez(a, a.prev.e, a.prev.dir, e, a.dir, T, 0.5 + a.s / (2 * T)); }
    return along(e, a.s, a.dir, offsetFor(a, e, a.dir));
  }
  function spawn(a, px, pz, first) {
    for (let t = 0; t < 70; t++) {
      const e = net.edges[Math.floor(random() * net.edges.length)];
      if (e.len < 25) continue;
      const mid = posAt(e, e.len / 2), d = Math.hypot(mid.x - px, mid.z - pz);
      if (d < (first ? 40 : TRAFFIC.spawnMin) || d > TRAFFIC.spawnMax) continue;
      if (a.kind === 'bike') { if (/^(trunk|motorway)/.test(e.way.cls)) continue; if (!(e.way.cl || e.way.cr) && random() < 0.7) continue; }
      else if (!/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)/.test(e.way.cls) && random() < 0.6) continue;
      const dir = e.way.oneway ? 1 : (random() < 0.5 ? 1 : -1);
      // slower vehicles keep left (Rule 264): on a road of two or more lanes each way, only the quicker
      // ones start out in an outer lane
      // (one random draw, as before, so a seeded drive meets the same traffic)
      const nL = laneInfo(e, dir).n, r = a.kind === 'car' ? random() : 0;
      const lane = a.kind !== 'car' || nL < 2 ? 0 : e.way.cls === 'motorway' ? Math.floor(r * nL) : r > 0.55 ? 1 + Math.min(nL - 2, Math.floor((r - 0.55) / 0.45 * (nL - 1))) : 0;
      const s = 8 + random() * Math.max(1, e.len - 20);
      Object.assign(a, { e, dir, s, lane, laneF: lane, lcT: 0, prev: null, path: null, keepTo: null });
      const p = trackPoint(a);
      if (!safeTrafficSpawn(p,{x:px,z:pz,th:player?.th},first)) continue;
      if (all.some(o => o !== a && o.alive && Math.hypot(o.x - p.x, o.z - p.z) < (a.kind === 'bike' ? 10 : 18))) continue;
      Object.assign(a, { v: a.kind === 'bike' ? 4 : 5, x: p.x, z: p.z, th: Math.atan2(-p.tx, -p.tz), stuck: 0, ghost: 0, alive: true });
      a.next = chooseNext(a); a.cruise = a.kind === 'bike' ? 4.4 + random() * 2.2 : 0.88 + random() * 0.12;
      // every driver a little different, from the drive's own seed: how close they follow, how big a gap
      // they want before changing lane, how long they signal first, whether they make room for others,
      // and the few who never signal
      if (a.kind === 'car') a.traits = { headway: 1.1 + traitRandom() * 1.4, gap: 0.8 + traitRandom() * 0.6, wait: 1.5 + traitRandom() * 1.5, courtesy: traitRandom() < 0.55, signals: traitRandom() > 0.05 };
      a.intent = null; a.ind = null;
      // Motorway traffic is not all one speed: lane 1 carries the slower vehicles (lorries are limited to
      // 56 mph), the outer lanes the faster ones, so there is always something to catch up with.
      if (a.kind === 'car' && e.way.cls === 'motorway') a.cruise = [0.76, 0.9, 0.95][Math.min(lane, 2)] + random() * 0.07;
      a.v = a.kind === 'car' && e.way.cls === 'motorway' ? e.way.mph * 0.447 * a.cruise * 0.9 : a.v; // join the flow already moving
      a.mesh.position.set(a.x,0,a.z);a.mesh.rotation.y=a.th;a.mesh.visible = true; return true;
    }
    a.alive = false; a.mesh.visible = false; a.x = a.z = 1e6; return false;
  }
  function init(px, pz, colours) {
    for (let i = 0; i < TRAFFIC.cars; i++) { const c = { id:i,kind: 'car', mesh: makeCarMesh(colours[i % colours.length]) }; cars.push(c); all.push(c); spawn(c, px, pz, true); }
    for (let i = 0; i < TRAFFIC.bikes; i++) { const b = { id:TRAFFIC.cars+i,kind: 'bike', mesh: makeBikeMesh(i) }; bikes.push(b); all.push(b); spawn(b, px, pz, true); }
    net.cycleRings.forEach((ring, ri) => { for (let i = 0; i < 3; i++) ringBikes.push({ kind: 'bike', ring, ang: i * 2.1 + ri, v: 4.4, cruise: 4.2 + i * 0.35, x: 0, z: 0, th: 0, alive: true, mesh: makeBikeMesh(TRAFFIC.bikes + i) }); });
  }
  // cyclists riding round a Dutch-style roundabout's cycle track, clockwise; they stop only if something is in the way
  const ringBikes = [];
  function updateRingBikes(dt) {
    for (const b of ringBikes) {
      const r = b.ring.r, tx = Math.cos(b.ang), tz = Math.sin(b.ang); let vmax = b.cruise;
      for (const o of player ? cars.concat([player]) : cars) {
        if (o.alive === false) continue; const dx = o.x - b.x, dz = o.z - b.z, fw = dx * tx + dz * tz;
        if (fw > 0 && fw < 6 && Math.abs(dx * tz - dz * tx) < 2.2) vmax = Math.min(vmax, brakeTo(0, fw - 3.2, 4));
      }
      if (b.pinned > 0) b.pinned -= dt;
      b.v = b.v > vmax ? Math.max(vmax, b.v - 6 * dt) : Math.min(vmax, b.v + 1.2 * dt);
      b.ang += b.v * dt / r;
      b.x = b.ring.x + r * Math.sin(b.ang); b.z = b.ring.z - r * Math.cos(b.ang); b.th = Math.atan2(-tx, -tz);
      b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.y = b.th; b.mesh.visible = true;
      const u = b.mesh.userData; u.spin = (u.spin || 0) + b.v * dt / 0.34; for (const wh of u.wheels) wh.rotation.x = -u.spin; u.crank.rotation.x = -u.spin * 0.5;
    }
  }
  // cars give way to cyclists on the cycle track where the road crosses it
  function ringYield(a, rem, vmax) {
    for (const ring of net.cycleRings) {
      if (Math.abs(Math.hypot(a.x - ring.x, a.z - ring.z) - ring.r) > 30) continue;
      for (const c of ring.crossings) {
        let ds = null;
        if (c.e === a.e) ds = (a.dir > 0 ? c.s : a.e.len - c.s) - a.s;
        else if (a.next && c.e === a.next.e) ds = rem + (a.next.dir > 0 ? c.s : a.next.e.len - c.s);
        if (ds === null || ds < 1.5 || ds > 30) continue;
        const busy = ringBikes.some(b => { if (b.ring !== ring) return false; let da = b.ang - c.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const arc = da * ring.r; return arc > -12 && arc < 2.5; });
        const fx=-Math.sin(a.th),fz=-Math.cos(a.th),dx=c.x-a.x,dz=c.z-a.z;
        const forward=dx*fx+dz*fz;
        // Hold clear of the track. Once the car has committed to crossing,
        // keep clearing it rather than stopping underneath an approaching bike.
        if (busy && forward>5.5) vmax = Math.min(vmax, brakeTo(0,forward-6));
      }
    }
    return vmax;
  }
  const sigEntry = (e, dir) => (net.stopsByEdge.get(e.id) || []).some(s => s.dir === dir);
  // nodes at mini-roundabouts: traffic slows right down to go round them
  const miniNodes = new Set();
  for (let v = 0; v < net.nx.length; v++) if (net.minis.some(m => Math.abs(m.x - net.nx[v]) < 8 && Math.abs(m.z - net.nz[v]) < 8)) miniNodes.add(v);
  // give-way lines: traffic on a minor road gives way to the learner at the junction
  const giveKey = new Set(net.giveways.map(g => g.e.id + ':' + g.dir));
  function learnerApproaching(v) {
    if (!player) return false;
    const x = net.nx[v], z = net.nz[v], dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz);
    if (d > 26) return false; if (d < 7) return true;
    return Math.abs(player.v) > 1 && (dx * -Math.sin(player.th) + dz * -Math.cos(player.th)) / d > 0.3;
  }
  const brakeTo = (target, dist, dec = 3.4) => Math.sqrt(Math.max(0, target * target + 2 * dec * Math.max(0, dist)));
  function ringBusy(v, self) {
    const x = net.nx[v], z = net.nz[v];
    for (const o of cars.concat(bikes)) if (o !== self && o.alive && o.e.way.rb && Math.hypot(o.x - x, o.z - z) < 18) {
      const ex = x - o.x, ez = z - o.z; if (ex * -Math.sin(o.th) + ez * -Math.cos(o.th) > -2) return true;
    }
    if (player && player.onRb && Math.abs(player.v) > 1 && Math.hypot(player.x - x, player.z - z) < 16) return true; // a learner stopped on the ring doesn't block entry for ever
    return false;
  }
  function stopAhead(a, e, dir, offset, vmax) {
    const list = net.stopsByEdge.get(e.id); if (list) for (const st of list) {
      if (st.dir !== dir) continue; const ds = st.ts - (offset < 0 ? a.s : 0) + (offset > 0 ? offset : 0) - (a.kind === 'bike' ? 2 : 3);
      if (ds < -0.6 || ds > 55) continue;
      const L = lightState(st); if (L === 'R' || L === 'RA' || (L === 'A' && ds > 8)) vmax = Math.min(vmax, brakeTo(0, ds));
    }
    const zl = net.zebrasByEdge.get(e.id); if (zl) for (const z of zl) {
      const zts = dir > 0 ? z.s : e.len - z.s, ds = zts - (offset < 0 ? a.s : 0) + (offset > 0 ? offset : 0) - 3.5;
      if (ds < -2 || ds > 40) continue; if (z.ped.state !== 'idle') vmax = Math.min(vmax, brakeTo(0, ds));
    }
    return vmax;
  }
  // Joining a motorway (Rule 259): traffic already on the motorway has priority, the learner included.
  // A joining vehicle looks for a gap in lane 1 alongside the acceleration lane: it fits in only if
  // whoever would be behind it has at least 1.5 s (and is not closing to within 4 s), and whoever would be
  // ahead is clear. Otherwise it drops back behind them, and if it runs out of slip road it stops at the
  // end rather than forcing its way in. Nobody on the motorway is expected to brake or move over for it.
  const MERGE_ZONE = MW.junction.accel + 20, TAPER = MW.taper; // the acceleration lane, as drawn (world.js) and assessed
  function mergeYield(a, rem, vmax) {
    const fx = -Math.sin(a.th), fz = -Math.cos(a.th);
    let blocked = null;
    for (const o of player ? all.concat([player]) : all) {
      if (o === a || o.alive === false || o.kind === 'bike') continue;
      if (Math.cos((o.th || 0) - a.th) < 0.9) continue;
      const dx = o.x - a.x, dz = o.z - a.z, right = -dx * fz + dz * fx, fw = dx * fx + dz * fz;
      if (right < -3 || right > 7) continue; // not beside this slip road at all
      // only what is already in the left-hand lane of the carriageway counts: other traffic still on the
      // slip road is queuing with us, not traffic we give way to
      if (o.isPlayer) { const m = nearestWhere(net, o.x, o.z, e => e.way.cls === 'motorway'); if (!m || m.d > m.way.w / 2 + 0.5 || m.lat < m.way.w / 2 - MW.laneW - 0.5) continue; }
      else if (!o.e || o.e.way.cls !== 'motorway' || o.lane !== 0) continue;
      const ov = Math.abs(o.v);
      const clear = fw < 0 ? -fw - 4.6 >= Math.max(ov * 1.5, 8) && (ov - a.v <= 0.3 || (-fw - 4.6) / (ov - a.v) >= 4) : fw - 4.6 >= Math.max(a.v * 0.8, 6) || ov > a.v + 2;
      if (!clear && (!blocked || Math.abs(fw) < Math.abs(blocked.fw))) blocked = { fw, v: ov };
    }
    a.merging = !!blocked;
    // The last TAPER metres of the slip run into the left-hand lane itself, so stopping there is stopping
    // in the lane: a vehicle already in the taper has committed and carries on; one before it waits at
    // the end of the acceleration lane for a gap.
    if (!blocked || rem <= TAPER) return vmax;
    // behind or beside us: let it go by; just ahead: drop in behind it
    return Math.min(vmax, Math.max(0, blocked.v - (blocked.fw < 2 ? 3 : 1)), brakeTo(0, rem - TAPER - 5));
  }
  // Lane changes on roads of two or more lanes each way: keep to the left-hand lane unless passing
  // something slower (Rule 264), pull out to pass when the next lane is clear, and get into the left-hand
  // lane in good time for a motorway exit. Only into a real gap: nothing in the target lane within 20 m
  // behind or 25 m ahead, and never in front of the learner with less than 2.5 s between them, so the
  // learner is never given a following-distance fault by someone cutting in. A lesson's own placed traffic
  // stays in the lane it was put in.
  // Which way a vehicle is indicating (a.ind), from what it is about to do: a lane change it has decided on,
  // a turn at the next junction, leaving the roundabout, leaving or joining a motorway. A few drivers never
  // signal, as on real roads.
  function signalFor(a, rem) {
    if (a.traits && !a.traits.signals) { a.ind = null; return; }
    let ind = null;
    if (a.intent) ind = a.intent.to < a.lane ? 'L' : 'R';
    else if (Math.abs((a.laneF ?? a.lane) - a.lane) > 0.15) ind = a.laneF > a.lane ? 'L' : 'R'; // still moving across
    else if (a.next) {
      const w = a.e.way, nw = a.next.e.way;
      if (w.cls === 'motorway' && nw.cls === 'motorway_link' && rem < 300) ind = 'L';
      else if (w.cls === 'motorway_link' && nw.cls === 'motorway' && rem < MERGE_ZONE + 60) ind = 'R';
      else if (w.rb && !nw.rb && rem < 25) ind = 'L';
      else if (!w.rb && !nw.rb && rem < 35) {
        const p = along(a.e, a.e.len - 0.5, a.dir), q = along(a.next.e, Math.min(4, a.next.e.len / 2), a.next.dir);
        const turn = Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz);
        if (Math.abs(turn) > 0.5) ind = turn < 0 ? 'L' : 'R';
      }
    }
    if (!ind && a.ind && a.s < 10 && a.indHold > 0) ind = a.ind; // just round the corner: still cancelling
    a.indHold = ind ? 1.2 : Math.max(0, (a.indHold || 0) - 0.05);
    a.ind = ind;
  }
  function keepLeft(a, dt, others, fx, fz) {
    // part-way across and someone else has moved into the space alongside (two lanes merging into one gap):
    // a driver gives up and drifts back, as people do
    if (a.lane !== Math.round(a.laneF ?? a.lane) && a.prevLane != null && !a.aborted) {
      const d = laneCentre(a.e, a.dir, a.lane) - offsetFor(a, a.e, a.dir);
      if (others.some(o => o !== a && o.alive !== false && o.kind !== 'bike' && Math.cos((o.th || 0) - a.th) > 0.8 && (() => { const rx = o.x - a.x, rz = o.z - a.z, fw = rx * fx + rz * fz, lat = rx * fz - rz * fx;
        return fw > -8 && fw < 10 && Math.abs(lat - d) < 1.6 && Math.sign(lat || d) === Math.sign(d); })())) { a.lane = a.prevLane; a.aborted = true; }
      return;
    }
    a.lcT = (a.lcT || 0) - dt; if (a.lcT > 0 || a.lane !== Math.round(a.laneF ?? a.lane)) return;
    a.aborted = false;
    a.lcT = a.intent ? 0.1 : 0.5;
    const w = a.e.way, n = laneInfo(a.e, a.dir).n, rem = a.e.len - a.s;
    // only on motorways and fast dual carriageways: in town the lanes lead to lane arrows and junctions,
    // and side-road traffic joins across them, so there a vehicle keeps the lane it chose
    if (n < 2 || w.rb || a.pinned || a.keepTo || !(w.cls === 'motorway' || (/^trunk$/.test(w.cls) && w.mph >= 50))) return;
    const mw = w.cls === 'motorway', exiting = mw && a.next && a.next.e.way.cls === 'motorway_link';
    if (!exiting && (rem < 50 || a.s < 10)) return; // near a junction the lane says where it is going
    const here = offsetFor(a, a.e, a.dir), want = w.mph * 0.447 * a.cruise;
    // what is in lane `l`, between `back` metres behind and `ahead` metres in front
    const inLane = (l, back, ahead) => { const d = laneCentre(a.e, a.dir, l) - here, hits = [];
      for (const o of others) { if (o === a || o.alive === false || o.kind === 'bike') continue;
        const rx = o.x - a.x, rz = o.z - a.z, fwd = rx * fx + rz * fz; if (fwd < -back || fwd > ahead) continue;
        if (Math.cos((o.th || 0) - a.th) < 0.8) continue; // not going this way
        if (Math.abs(rx * fz - rz * fx - d) < 2) hits.push({ o, fwd }); }
      return hits; };
    const g = a.traits?.gap ?? 1, clear = (l) => inLane(l, 20 * g, 25 * g).length === 0 && !inLane(l, 60, 0).some(h => h.o.isPlayer && -h.fwd < Math.max(15, Math.abs(h.o.v) * 2.5));
    const slowerAhead = (l, within) => inLane(l, 0, within).some(h => h.fwd > 4 && Math.abs(h.o.v) < want - 2.5);
    // A driver signals first and moves only when the signal has been on a moment (1.5 to 3 s, by driver)
    // and the gap is still there: so the learner can see what the vehicle is about to do.
    const intend = (to) => { if (a.intent && a.intent.to === to) { if (clock >= a.intent.at && clear(to)) { a.prevLane = a.lane; a.lane = to; a.intent = null; } else if (!clear(to) && clock > a.intent.at + 4) a.intent = null; return true; }
      a.intent = { to, at: clock + (a.traits?.wait ?? 2) }; return true; };
    // courtesy: a learner coming down a slip road beside the left-hand lane, and the next lane clear
    const makeRoom = mw && a.lane === 0 && a.traits?.courtesy && playerOnSlip && player && (() => { const f = (player.x - a.x) * fx + (player.z - a.z) * fz; return f > -30 && f < 140; })();
    if (makeRoom && clear(1) && intend(1)) return;
    if (a.lane > 0 && (exiting || !slowerAhead(a.lane - 1, 70)) && clear(a.lane - 1) && intend(a.lane - 1)) return;
    if (!exiting && a.lane < n - 1 && slowerAhead(a.lane, 45) && clear(a.lane + 1) && intend(a.lane + 1)) return;
    if (a.intent && !a.intent.keep) a.intent = null; // nothing to do after all: signal off
  }
  function updateAgent(a, dt) {
    const w = a.e.way, bike = a.kind === 'bike', blue = !!a.emergency;
    // A vehicle on a shout drives hard: well above the limit, through corners faster, and it gives way
    // to nobody. It still stops at red lights, which this training build does not let it run.
    let vmax = bike ? a.cruise : w.mph * 0.447 * a.cruise;
    if (w.rb) vmax = Math.min(vmax, bike ? 4.5 : blue ? 11 : 7);
    const rem = a.e.len - a.s;
    if (a.next) {
      const p = along(a.e, a.e.len - 0.5, a.dir), q = along(a.next.e, Math.min(4, a.next.e.len / 2), a.next.dir);
      const ang = Math.abs(Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz));
      const corner = bike ? 3.5 : blue ? 8 : 4.5;
      if (miniNodes.has(endNode(a))) vmax = Math.min(vmax, brakeTo(corner, rem - 3));
      // (where a slip road meets the motorway the edges join at a node on the carriageway's centre line,
      // which reads as a sharp corner; the roads themselves are smooth, so there is nothing to slow for)
      const slipJoin = /^motorway/.test(w.cls) && /^motorway/.test(a.next.e.way.cls) && w.cls !== a.next.e.way.cls;
      if (ang > 0.5 && !w.rb && !slipJoin) vmax = Math.min(vmax, brakeTo(corner, rem - 6));
      // minor-road give-way and mini-roundabouts: let the learner go first (the ghost timer breaks a stand-off)
      if (!blue && rem < 24 && (giveKey.has(a.e.id + ':' + a.dir) || miniNodes.has(endNode(a))) && learnerApproaching(endNode(a))) vmax = Math.min(vmax, brakeTo(0, rem - 9));
      if (!blue && a.next.e.way.rb && !w.rb && rem < 22 && !sigEntry(a.e, a.dir) && ringBusy(endNode(a), a)) vmax = Math.min(vmax, brakeTo(0, rem - 9)); // lights decide at signalled entries
      if (net.cycleRings.length && !bike) vmax = ringYield(a, rem, vmax);
      vmax = stopAhead(a, a.next.e, a.next.dir, rem, vmax);
    } else vmax = Math.min(vmax, brakeTo(0, rem - 2));
    vmax = stopAhead(a, a.e, a.dir, -1, vmax);
    if (!bike && !blue && w.cls === 'motorway_link' && a.next && a.next.e.way.cls === 'motorway' && rem < MERGE_ZONE) vmax = mergeYield(a, rem, vmax);
    const fx = -Math.sin(a.th), fz = -Math.cos(a.th);
    const others = player ? all.concat([player]) : all;
    // look further ahead at speed so fast traffic can stop behind a slower learner
    const look = Math.max(20, a.v * a.v / 10 + 12); let blocked = false;
    for (const o of others) {
      if (o === a || o.alive === false) continue;
      if (a.ghost > 0 && !o.isPlayer) continue;
      if(!o.isPlayer&&Math.cos((o.th||0)-a.th)<.7&&Math.hypot(o.x-a.x,o.z-a.z)>4.5)continue;
      const rx = o.x - a.x, rz = o.z - a.z, fwd = rx * fx + rz * fz; if (fwd <= 0 || fwd > look) continue;
      // on a motorway, sideways offset across the road between the two, not across this vehicle's own
      // heading: round a long bend a vehicle in the next lane 80 m ahead would otherwise seem to be in this
      // lane. (Only there: at a roundabout a car waiting to enter can face the same way as one on the ring.)
      let lx = fx, lz = fz;
      if (w.cls === 'motorway' && Math.cos((o.th || 0) - a.th) > 0.9) { lx += -Math.sin(o.th); lz += -Math.cos(o.th); const L = Math.hypot(lx, lz) || 1; lx /= L; lz /= L; }
      const lat = Math.abs(rx * lz - rz * lx), oBike = o.kind === 'bike';
      const oncoming = Math.cos((o.th || 0) - a.th) < -0.5; // passing in the other lane, not in our way
      let width = bike ? (oBike ? 0.8 : 1.3) : (oBike ? 1.25 : o.isPlayer ? 2.8 : 2.2); // more room round the learner, who may be turning across
      if (oncoming) width = Math.min(width, 1.4);
      if (a.ghost > 0 && o.isPlayer && Math.abs(o.v) < 0.3 && lat > 1.3) continue; // squeeze past a learner who has stopped to one side
      // A blue-light vehicle gets past once the learner has made room beside it, or has slowed to a
      // crawl: a real crew would squeeze by rather than sit behind a car doing walking pace.
      if (a.emergency && o.isPlayer && (lat > 1.6 || Math.abs(o.v) < 2) && Math.abs(o.v) < Math.max(2.5, a.v - 3)) continue;
      // Ordinary traffic going the same way makes way for it (see below), so it filters through
      // rather than queueing and never reaching the learner at all.
      if (a.emergency && !o.isPlayer && !oncoming) continue;
      if (lat < width) {
        vmax = Math.min(vmax, brakeTo(0, fwd - (bike || oBike ? 4 : blue ? 4.5 : 6.5), blue ? 7 : 5));
        // and hold back to this driver's own following distance (1.1 to 2.5 s) behind moving traffic
        if (!bike && !blue && !oncoming && a.traits && Math.abs(o.v) > 3) { const want = a.traits.headway * a.v + 6; if (fwd < want) vmax = Math.min(vmax, Math.abs(o.v) - (want - fwd) * 0.15); }
        if (bike && o.isPlayer && Math.abs(o.v) < 0.5 && fwd < 12) blocked = true;
      }
    }
    // A learner signalling to move into this vehicle's lane, just ahead of it or alongside: a courteous
    // driver drops back to open the gap; others hold their speed. Same direction, one lane across.
    if (!bike && !blue && player && player.indicator && a.traits?.courtesy && Math.abs(player.v) > 3 && Math.cos(player.th - a.th) > 0.95) {
      const rx = player.x - a.x, rz = player.z - a.z, ahead = rx * fx + rz * fz, left = rx * fz - rz * fx; // + the learner is to this vehicle's left
      if (ahead > -6 && ahead < 45 && (player.indicator === 'R' ? left > 2 && left < 5.5 : left < -2 && left > -5.5)) { vmax = Math.min(vmax, Math.max(0, Math.abs(player.v) - 2.5)); a.yielding = true; } else a.yielding = false;
    } else a.yielding = false;
    // cyclists pass a stopped car with room to spare (or wait until they can)
    if (bike) a.swing = blocked ? Math.min(1.9, (a.swing || 0) + dt * 1.2) : Math.max(0, (a.swing || 0) - dt * 0.6);
    // everyone makes way for a blue light coming up behind: slow right down and let it through
    if (!a.emergency) for (const o of all) {
      if (!o.emergency || o.alive === false) continue;
      const ofx = -Math.sin(o.th), ofz = -Math.cos(o.th), dx = a.x - o.x, dz = a.z - o.z;
      const ahead = dx * ofx + dz * ofz;
      if (ahead > 0 && ahead < 40 && Math.abs(dx * ofz - dz * ofx) < 6) { vmax = Math.min(vmax, 2.5); break; }
    }
    // predict where the learner will be over the next 2 s and give way to them
    if (player && !(a.ghost > 0) && !blue && Math.abs(player.v) + a.v > 0.5) {
      const pfx = -Math.sin(player.th), pfz = -Math.cos(player.th), pv = player.v;
      const rx0 = player.x - a.x, rz0 = player.z - a.z, ahead = rx0 * fx + rz0 * fz, side = Math.abs(rx0 * fz - rz0 * fx), cosH = pfx * fx + pfz * fz;
      const passing = cosH < -0.7 && side > 2; // oncoming in the other lane
      // alongside in the next lane, going the same way and not moving across: straight-line projections
      // round a long motorway bend make parallel lanes look as if they meet, so this is not a conflict
      const parallel = cosH > 0.97 && side > 2.6 && Math.abs(Math.sin(player.th - a.th) * pv) < 0.8;
      if (!passing && !parallel && ahead > -2) for (const T of [0.5, 1, 1.5, 2]) {
        const ax = a.x + fx * a.v * T, az = a.z + fz * a.v * T, px = player.x + pfx * pv * T, pz = player.z + pfz * pv * T;
        if (Math.hypot(ax - px, az - pz) < (bike ? 2.3 : 3.3)) { vmax = Math.min(vmax, brakeTo(0, Math.max(0, a.v * T - (bike ? 2.5 : 4)), 6)); break; }
      }
    }
    if (!bike && !blue && !a.scripted) keepLeft(a, dt, others, fx, fz);
    if (!bike) signalFor(a, rem);
    if (!bike) a.laneF = (a.laneF ?? a.lane) + Math.max(-dt * 0.5, Math.min(dt * 0.5, a.lane - (a.laneF ?? a.lane))); // half a lane a second
    if (a.v < 0.2 && vmax < 0.4) a.stuck += dt; else a.stuck = 0;
    if (a.stuck > 8) { a.ghost = 3; a.stuck = 0; } a.ghost -= dt;
    a.v = a.v > vmax ? Math.max(vmax, a.v - 7 * dt) : Math.min(vmax, a.v + (bike ? 1.2 : 2.2) * dt);
    a.s += a.v * dt;
    while (a.s >= a.e.len) {
      a.s -= a.e.len; if (!a.next) { a.alive = false; a.mesh.visible = false; return; }
      a.prev = { e: a.e, dir: a.dir }; a.e = a.next.e; a.dir = a.next.dir;
      if (!bike) { const n = laneInfo(a.e, a.dir).n; a.lane = Math.min(a.lane, n - 1); a.laneF = Math.min(a.laneF ?? a.lane, n - 1); }
      a.next = chooseNext(a);
    }
    const p = trackPoint(a), k = Math.min(1, dt * 12);
    a.x += (p.x - a.x) * k; a.z += (p.z - a.z) * k;
    a.th += wrap(Math.atan2(-p.tx, -p.tz) - a.th) * Math.min(1, dt * 14);
  }
  let density = 'normal';
  function setDensity(value) { if (!['normal', 'light', 'none'].includes(value)) throw new Error('Unsupported traffic density'); density = value; all.forEach(a => a.scripted = false); }
  function reset(px,pz,seed) {
    random=seededRandom(seed);traitRandom=seededRandom((seed^0x9e3779b9)>>>0);clock=0;overrides.clear();
    all.forEach(a=>{a.alive=false;a.mesh.visible=false;a.pinned=0;a.scripted=false;a.swing=0;a.emergency=false;});
    all.forEach(a=>spawn(a,px,pz,true));
    net.zebras.forEach(z=>Object.assign(z.ped,{state:'idle',t:2+(z.id*7.1)%9,p:0,dir:1}));
    puffins.forEach(c=>{c.last='G';Object.assign(c.ped,{state:'idle',p:0,dir:1});});
    ringBikes.forEach((b,i)=>{b.ang=(i%3)*2.1+net.cycleRings.indexOf(b.ring);b.v=4.4;b.cruise=4.2+(i%3)*.35;b.pinned=0;b.alive=true;});
    updateRingBikes(0);
  }
  let playerOnSlip = false;
  function update(dt, pl) {
    clock += dt; player = pl;
    { const n = nearestWhere(net, pl.x, pl.z, e => /^motorway/.test(e.way.cls)); playerOnSlip = !!n && n.d < 8 && n.way.cls === 'motorway_link'; }
    for (const a of all) {
      const pool = a.kind === 'bike' ? bikes : cars;
      if (!a.scripted && (density === 'none' || (density === 'light' && pool.indexOf(a) >= Math.ceil(pool.length / 3)))) { a.alive = false; a.mesh.visible = false; continue; }
      if (a.pinned > 0) a.pinned -= dt;
      else if (!a.alive || Math.hypot(a.x - pl.x, a.z - pl.z) > TRAFFIC.despawn) { if (!spawn(a, pl.x, pl.z, false)) continue; }
      updateAgent(a, dt);
      a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.th;
      if (a.kind === 'bike') { const u = a.mesh.userData; u.spin = (u.spin || 0) + a.v * dt / 0.34; for (const wh of u.wheels) wh.rotation.x = -u.spin; u.crank.rotation.x = -u.spin * 0.5; }
    }
    if (density === 'none') for (const b of ringBikes) { b.alive = false; b.mesh.visible = false; }
    else { for (const b of ringBikes) { b.alive = true; b.mesh.visible = true; } updateRingBikes(dt); }
    updatePeds(dt, pl.x, pl.z);
  }
  // put a cyclist on a cycle ring at an angle (used by lessons to have one arrive as the learner does)
  function placeRingBike(ring, ang, speed) { const b = ringBikes.find(q => q.ring === ring); if (!b) return null; Object.assign(b, { ang, v: speed, cruise: speed, pinned: 30 }); return b; }
  // put a cyclist at a given spot (used by lessons)
  function placeBike(b, e, dir, s, speed) {
    Object.assign(b, { scripted: true, e, dir, s, lane: 0, prev: null, alive: true, stuck: 0, ghost: 0, v: speed, cruise: speed });
    const p = trackPoint(b); b.x = p.x; b.z = p.z; b.th = Math.atan2(-p.tx, -p.tz); b.next = chooseNext(b); b.mesh.visible = true; b.pinned = 60;
  }
  // put a car at a given spot heading for a junction (used by puzzles to bring traffic from the right)
  // path (optional): route steps the car should follow instead of choosing turns at random
  // lane (optional): which lane, 0 nearest the kerb; keepTo (optional): a road class it never leaves
  function placeCar(c, e, dir, s, speed, cruise = 1, path = null, lane = 0, keepTo = null) {
    Object.assign(c, { scripted: true, traits: null, intent: null, ind: null, e, dir, s, lane: Math.min(lane, laneInfo(e, dir).n - 1), laneF: Math.min(lane, laneInfo(e, dir).n - 1), prev: null, alive: true, stuck: 0, ghost: 0, v: speed, cruise, path, keepTo, emergency: false });
    const p = trackPoint(c); c.x = p.x; c.z = p.z; c.th = Math.atan2(-p.tx, -p.tz); c.next = chooseNext(c); c.mesh.visible = true; c.pinned = 45;
  }
  return { setDensity, reset, lightState, update, init, cars, bikes, ringBikes, puffins, pedestrians:pedPool, overrides, placeBike, placeCar, placeRingBike, miniNodes, get clock() { return clock; } };
}
