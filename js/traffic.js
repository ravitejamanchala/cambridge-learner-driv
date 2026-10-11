// Traffic lights, other cars, cyclists, and pedestrians at zebra crossings.
// Vehicles follow lane centres and take smooth curves through junctions.
import { TRAFFIC } from './config.js';
import { along, endNode, posAt, laneCentre, laneInfo, cycleLeft } from './net.js';

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createTraffic(net, scene, makeCarMesh, makeBikeMesh) {
  let clock = 0;
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
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.15, 10), new THREE.MeshLambertMaterial({ color: [0x2f5d8a, 0x8a3b2f, 0x3f6b46, 0x6b4f8a][i % 4] })); body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9b896 })); head.position.y = 1.72;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x2b2e33 })); legs.position.y = 0.25;
    g.add(body, head, legs); g.visible = false; scene.add(g); pedPool.push(g);
  }
  for (const z of net.zebras) z.ped = { state: 'idle', t: 2 + ((z.id * 7.1) % 9), p: 0, dir: 1 };
  function updatePeds(dt, px, pz) {
    const active = [];
    for (const z of net.zebras) {
      const d = Math.hypot(z.x - px, z.z - pz); if (d > 220) { z.ped.state = 'idle'; continue; }
      const P = z.ped; P.t -= dt;
      if (P.state === 'idle' && P.t <= 0) { P.state = 'wait'; P.t = 1.6; P.dir = Math.random() < 0.5 ? 1 : -1; P.p = 0; }
      else if (P.state === 'wait' && P.t <= 0) P.state = 'walk';
      else if (P.state === 'walk') { P.p += dt / ((z.w + 3.2) / 1.3); if (P.p >= 1) { P.state = 'idle'; P.t = 8 + Math.random() * 16; } }
      if (P.state !== 'idle') active.push([d, z]);
    }
    active.sort((a, b) => a[0] - b[0]);
    pedPool.forEach((m, i) => {
      const it = active[i]; m.visible = !!it; if (!it) return; const z = it[1], P = z.ped;
      const half = z.w / 2 + 1.6, o = P.dir * (-half + 2 * half * P.p);
      m.position.set(z.x + z.tz * o, 0, z.z - z.tx * o);
    });
  }

  // ---------- vehicles (cars and bikes) ----------
  const cars = [], bikes = [], all = [];
  let player = null;
  const isMain = cls => /^(trunk|primary|secondary)/.test(cls);
  function offsetFor(a, e, dir) {
    if (a.kind === 'car') return laneCentre(e, dir, a.lane);
    const c = cycleLeft(e, dir), w = e.way;
    if (c === 1 || c === 2) return w.w / 2 - w.cw / 2;
    if (c === 3) return w.w / 2 + 1.7; // separate track beside the road
    return w.w / 2 - 0.85;
  }
  function chooseNext(a) {
    const v = endNode(a), opts = net.out[v].filter(o => o.e !== a.e && !(a.kind === 'bike' && /trunk/.test(o.e.way.cls)));
    if (!opts.length) return null;
    const p = along(a.e, a.e.len - 0.5, a.dir);
    let tot = 0; const w = opts.map(o => {
      const q = along(o.e, Math.min(5, o.e.len / 2), o.dir);
      const ang = Math.abs(Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz));
      let rank = isMain(o.e.way.cls) ? 2.2 : /tertiary/.test(o.e.way.cls) ? 1.6 : o.e.way.rb ? 3 : 0.7;
      if (a.kind === 'bike' && (o.e.way.cl || o.e.way.cr)) rank *= 2.5;
      const x = rank * (ang < 0.5 ? 3 : 1); tot += x; return x;
    });
    let r = Math.random() * tot; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
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
      const e = net.edges[Math.floor(Math.random() * net.edges.length)];
      if (e.len < 25) continue;
      const mid = posAt(e, e.len / 2), d = Math.hypot(mid.x - px, mid.z - pz);
      if (d < (first ? 40 : TRAFFIC.spawnMin) || d > TRAFFIC.spawnMax) continue;
      if (a.kind === 'bike') { if (/trunk/.test(e.way.cls)) continue; if (!(e.way.cl || e.way.cr) && Math.random() < 0.7) continue; }
      else if (!/^(trunk|primary|secondary|tertiary|unclassified|residential)/.test(e.way.cls) && Math.random() < 0.6) continue;
      const dir = e.way.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const lane = a.kind === 'car' ? Math.floor(Math.random() * laneInfo(e, dir).n) : 0;
      const s = 8 + Math.random() * Math.max(1, e.len - 20);
      Object.assign(a, { e, dir, s, lane, prev: null });
      const p = trackPoint(a);
      if (all.some(o => o !== a && o.alive && Math.hypot(o.x - p.x, o.z - p.z) < (a.kind === 'bike' ? 10 : 18))) continue;
      Object.assign(a, { v: a.kind === 'bike' ? 4 : 5, x: p.x, z: p.z, th: Math.atan2(-p.tx, -p.tz), stuck: 0, ghost: 0, alive: true });
      a.next = chooseNext(a); a.cruise = a.kind === 'bike' ? 4.4 + Math.random() * 2.2 : 0.88 + Math.random() * 0.12;
      a.mesh.visible = true; return true;
    }
    a.alive = false; a.mesh.visible = false; a.x = a.z = 1e6; return false;
  }
  function init(px, pz, colours) {
    for (let i = 0; i < TRAFFIC.cars; i++) { const c = { kind: 'car', mesh: makeCarMesh(colours[i % colours.length]) }; cars.push(c); all.push(c); spawn(c, px, pz, true); }
    for (let i = 0; i < TRAFFIC.bikes; i++) { const b = { kind: 'bike', mesh: makeBikeMesh(i) }; bikes.push(b); all.push(b); spawn(b, px, pz, true); }
  }
  const brakeTo = (target, dist, dec = 3.4) => Math.sqrt(Math.max(0, target * target + 2 * dec * Math.max(0, dist)));
  function ringBusy(v, self) {
    const x = net.nx[v], z = net.nz[v];
    for (const o of cars) if (o !== self && o.alive && o.e.way.rb && Math.hypot(o.x - x, o.z - z) < 18) {
      const ex = x - o.x, ez = z - o.z; if (ex * -Math.sin(o.th) + ez * -Math.cos(o.th) > -2) return true;
    }
    if (player && player.onRb && Math.hypot(player.x - x, player.z - z) < 16) return true;
    return false;
  }
  function stopAhead(a, e, dir, offset, vmax) {
    const list = net.stopsByEdge.get(e.id); if (list) for (const st of list) {
      if (st.dir !== dir) continue; const ds = st.ts - (offset < 0 ? a.s : 0) + (offset > 0 ? offset : 0) - 0.6 - (a.kind === 'bike' ? -1.5 : 0);
      if (ds < -0.6 || ds > 55) continue;
      const L = lightState(st); if (L === 'R' || L === 'RA' || (L === 'A' && ds > 8)) vmax = Math.min(vmax, brakeTo(0, ds));
    }
    const zl = net.zebrasByEdge.get(e.id); if (zl) for (const z of zl) {
      const zts = dir > 0 ? z.s : e.len - z.s, ds = zts - (offset < 0 ? a.s : 0) + (offset > 0 ? offset : 0) - 3.5;
      if (ds < -2 || ds > 40) continue; if (z.ped.state !== 'idle') vmax = Math.min(vmax, brakeTo(0, ds));
    }
    return vmax;
  }
  function updateAgent(a, dt) {
    const w = a.e.way, bike = a.kind === 'bike';
    let vmax = bike ? a.cruise : w.mph * 0.447 * a.cruise;
    if (w.rb) vmax = Math.min(vmax, bike ? 4.5 : 7);
    const rem = a.e.len - a.s;
    if (a.next) {
      const p = along(a.e, a.e.len - 0.5, a.dir), q = along(a.next.e, Math.min(4, a.next.e.len / 2), a.next.dir);
      const ang = Math.abs(Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz));
      if (ang > 0.5 && !w.rb) vmax = Math.min(vmax, brakeTo(bike ? 3.5 : 4.5, rem - 6));
      if (a.next.e.way.rb && !w.rb && rem < 22 && ringBusy(endNode(a), a)) vmax = Math.min(vmax, brakeTo(0, rem - 4));
      vmax = stopAhead(a, a.next.e, a.next.dir, rem, vmax);
    } else vmax = Math.min(vmax, brakeTo(0, rem - 2));
    vmax = stopAhead(a, a.e, a.dir, -1, vmax);
    const fx = -Math.sin(a.th), fz = -Math.cos(a.th);
    const others = player ? all.concat([player]) : all;
    for (const o of others) {
      if (o === a || o.alive === false) continue; if (a.ghost > 0 && !o.isPlayer) continue;
      const rx = o.x - a.x, rz = o.z - a.z, fwd = rx * fx + rz * fz; if (fwd <= 0 || fwd > 20) continue;
      const lat = Math.abs(rx * fz - rz * fx), oBike = o.kind === 'bike';
      const width = bike ? (oBike ? 0.8 : 1.3) : (oBike ? 1.25 : 2.2);
      if (lat < width) vmax = Math.min(vmax, brakeTo(0, fwd - (bike || oBike ? 4 : 6.5)));
    }
    if (a.v < 0.2 && vmax < 0.4) a.stuck += dt; else a.stuck = 0;
    if (a.stuck > 8) { a.ghost = 3; a.stuck = 0; } a.ghost -= dt;
    a.v = a.v > vmax ? Math.max(vmax, a.v - 7 * dt) : Math.min(vmax, a.v + (bike ? 1.2 : 2.2) * dt);
    a.s += a.v * dt;
    while (a.s >= a.e.len) {
      a.s -= a.e.len; if (!a.next) { a.alive = false; a.mesh.visible = false; return; }
      a.prev = { e: a.e, dir: a.dir }; a.e = a.next.e; a.dir = a.next.dir;
      if (!bike) a.lane = Math.min(a.lane, laneInfo(a.e, a.dir).n - 1);
      a.next = chooseNext(a);
    }
    const p = trackPoint(a), k = Math.min(1, dt * 12);
    a.x += (p.x - a.x) * k; a.z += (p.z - a.z) * k;
    a.th += wrap(Math.atan2(-p.tx, -p.tz) - a.th) * Math.min(1, dt * 14);
  }
  function update(dt, pl) {
    clock += dt; player = pl;
    for (const a of all) {
      if (a.pinned > 0) a.pinned -= dt;
      else if (!a.alive || Math.hypot(a.x - pl.x, a.z - pl.z) > TRAFFIC.despawn) { if (!spawn(a, pl.x, pl.z, false)) continue; }
      updateAgent(a, dt);
      a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.th;
      if (a.kind === 'bike') { const u = a.mesh.userData; u.spin = (u.spin || 0) + a.v * dt / 0.34; for (const wh of u.wheels) wh.rotation.x = -u.spin; u.crank.rotation.x = -u.spin * 0.5; }
    }
    updatePeds(dt, pl.x, pl.z);
  }
  // put a cyclist at a given spot (used by lessons)
  function placeBike(b, e, dir, s, speed) {
    Object.assign(b, { e, dir, s, lane: 0, prev: null, alive: true, stuck: 0, ghost: 0, v: speed, cruise: speed });
    const p = trackPoint(b); b.x = p.x; b.z = p.z; b.th = Math.atan2(-p.tx, -p.tz); b.next = chooseNext(b); b.mesh.visible = true; b.pinned = 60;
  }
  return { lightState, update, init, cars, bikes, overrides, placeBike, get clock() { return clock; } };
}
