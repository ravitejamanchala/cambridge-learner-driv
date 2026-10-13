// Purpose-built practice layouts for the course and the puzzles (the mock tests stay on real Cambridge roads).
// Each layout is drawn here in metres (x east, z south, so north is -z) and written out in the same
// format as the OpenStreetMap areas, so the sim loads it the same way. Built by tools/split_areas.mjs.
//
// Bearings are compass degrees from north, clockwise. Roundabouts run clockwise, as in the UK.

const CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
const rad = (d) => d * Math.PI / 180;
const at = (cx, cz, r, b) => [cx + r * Math.sin(rad(b)), cz - r * Math.cos(rad(b))];
const dm = (v) => Math.round(v * 10);

class Builder {
  constructor(id) {
    Object.assign(this, { id, names: [], ways: [], nodes: [], edges: [], stops: [], zebras: [], giveways: [], minis: [], rbs: [], arrows: [], cycleRings: [] });
    this.nodeKey = new Map(); this.wayKey = new Map(); this.cluster = 0;
  }
  node(x, z) {
    const k = Math.round(x * 2) + ',' + Math.round(z * 2);
    if (!this.nodeKey.has(k)) { this.nodeKey.set(k, this.nodes.length / 2); this.nodes.push(dm(x), dm(z)); }
    return this.nodeKey.get(k);
  }
  // o: { name, cls, mph, oneway, w, rb, lanes, cl, cr, cw }
  way(o) {
    let ni = this.names.indexOf(o.name || ''); if (ni < 0) { ni = this.names.length; this.names.push(o.name || ''); }
    const w = [ni, CLASSES.indexOf(o.cls || 'residential'), o.mph || 30, 0, o.oneway ? 1 : 0, o.w || 7.3, o.rb ? 1 : 0, o.lanes || 0, o.cl || 0, o.cr || 0, Math.round((o.cw || 1.5) * 10)];
    const k = JSON.stringify(w); if (!this.wayKey.has(k)) { this.wayKey.set(k, this.ways.length); this.ways.push(w); }
    return this.wayKey.get(k);
  }
  // one edge along a polyline of [x, z] points
  edge(o, pts) {
    const wi = typeof o === 'number' ? o : this.way(o), a = this.node(...pts[0]), b = this.node(...pts[pts.length - 1]);
    const flat = []; let len = 0;
    pts.forEach((p, i) => { flat.push(dm(p[0]), dm(p[1])); if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); });
    this.edges.push([a, b, wi, flat]); const ei = this.edges.length - 1; this.edges[ei].len = len; this.edges[ei].pts = pts;
    return ei;
  }
  // a road through a list of points, split into one edge per pair (junctions sit on the listed points)
  road(o, pts) { const wi = this.way(o), out = []; for (let i = 0; i < pts.length - 1; i++) out.push(this.edge(wi, [pts[i], pts[i + 1]])); return out; }
  // a curving road: `shape` is a dense polyline, `cuts` the indices where junction nodes go
  curve(o, shape, cuts) { const wi = this.way(o), out = []; for (let i = 0; i < cuts.length - 1; i++) out.push(this.edge(wi, shape.slice(cuts[i], cuts[i + 1] + 1))); return out; }
  // the edge that joins two adjacent nodes, and the travel direction from p to q
  find(p, q) {
    const a = this.node(...p), b = this.node(...q);
    const i = this.edges.findIndex(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
    if (i < 0) throw new Error(`${this.id}: no edge ${p} -> ${q}`);
    return { ei: i, dir: this.edges[i][0] === a ? 1 : -1 };
  }
  // the point `d` metres from p travelling along a road towards q (q may be several edges away):
  // { ei, dir, s } with s measured in the edge's own direction
  locate(p, q, d) {
    const total = d < 0 ? this.dist(p, q) + d : d;
    let cur = this.node(...p), done = 0;
    const qx = q[0], qz = q[1], xy = (v) => [this.nodes[2 * v] / 10, this.nodes[2 * v + 1] / 10];
    for (let guard = 0; guard < 50; guard++) {
      const [cx, cz] = xy(cur); let best = null, bd = Infinity;
      this.edges.forEach((e, i) => {
        if (e[0] !== cur && e[1] !== cur) return;
        const o = e[0] === cur ? e[1] : e[0], [ox, oz] = xy(o), dq = Math.hypot(qx - ox, qz - oz);
        if (dq < Math.hypot(qx - cx, qz - cz) - 0.5 && dq < bd) { bd = dq; best = { ei: i, dir: e[0] === cur ? 1 : -1, o }; }
      });
      if (!best) break;
      const e = this.edges[best.ei];
      if (done + e.len >= total - 1e-6) { const ts = total - done; return { ei: best.ei, dir: best.dir, s: best.dir > 0 ? ts : e.len - ts, len: e.len }; }
      done += e.len; cur = best.o;
    }
    throw new Error(`${this.id}: can't reach ${q} from ${p}`);
  }
  dist(p, q) { let d = 0, cur = p; for (;;) { const f = this.locate(cur, q, 0.001), e = this.edges[f.ei], o = f.dir > 0 ? e[1] : e[0]; d += e.len; cur = [this.nodes[2 * o] / 10, this.nodes[2 * o + 1] / 10]; if (o === this.node(...q)) return d; } }
  // features measured back from the end of an approach p -> q
  lights(appr, back, cluster, group) { const f = this.locate(appr[0], appr[1], -back); this.stops.push([f.ei, dm(f.s), f.dir, cluster, group]); }
  giveWay(appr, back) { const f = this.locate(appr[0], appr[1], -back); this.giveways.push([f.ei, dm(f.s), f.dir, 0]); }
  zebra(p, q, fromP) { const f = this.locate(p, q, fromP); this.zebras.push([f.ei, dm(f.s)]); }
  lanesArrows(appr, codes) { const f = this.locate(appr[0], appr[1], -1); this.arrows.push([f.ei, f.dir, ...codes]); }
  mini(p) { this.minis.push([dm(p[0]), dm(p[1])]); }
  // puffin crossing: a light each way, `fromP` metres from p along p -> q, one cluster on its own
  puffin(p, q, fromP) {
    const f = this.locate(p, q, fromP), c = this.cluster++;
    this.stops.push([f.ei, dm(f.s - 2.5 * f.dir), f.dir, c, 0], [f.ei, dm(f.s + 2.5 * f.dir), -f.dir, c, 0]);
  }
  // roundabout ring through node bearings; returns ring point for each bearing
  ring(cx, cz, r, o, bearings) {
    const bs = [...new Set(bearings.map(b => ((b % 360) + 360) % 360))].sort((a, b) => a - b), wi = this.way({ ...o, oneway: 1, rb: 1 });
    for (let i = 0; i < bs.length; i++) {
      const b0 = bs[i], b1 = i + 1 < bs.length ? bs[i + 1] : bs[0] + 360, pts = [];
      const n = Math.max(2, Math.ceil((b1 - b0) / 4));
      for (let k = 0; k <= n; k++) pts.push(at(cx, cz, r, b0 + (b1 - b0) * k / n));
      pts[0] = at(cx, cz, r, b0); pts[n] = at(cx, cz, r, b1 % 360);
      this.edge(wi, pts);
    }
    this.rbs.push([dm(cx), dm(cz), dm(r), dm(o.w || 7)]);
    return (b) => at(cx, cz, r, b);
  }
  toJSON() {
    return {
      version: 1, source: 'Practice layout', origin: [52.2, 0.12], kx: 68226.76517048452, kz: 110574, classes: CLASSES,
      area: { id: this.id }, names: this.names, ways: this.ways, nodes: this.nodes, edges: this.edges.map(e => e.slice(0, 4)),
      stops: this.stops, zebras: this.zebras, giveways: this.giveways, minis: this.minis, rbs: this.rbs, arrows: this.arrows, cycleRings: this.cycleRings
    };
  }
}

// dual-carriageway arm at a roundabout: one-way in (left side as you approach) and out, joining a single road `len` metres out
function dualArm(B, cx, cz, r, bearing, len, o, sep) {
  const d = Math.asin(sep / 2 / r) * 180 / Math.PI, u = [Math.sin(rad(bearing)), -Math.cos(rad(bearing))];
  const pin = at(cx, cz, r, bearing + d), pout = at(cx, cz, r, bearing - d), axis = at(cx, cz, r + len, bearing);
  const far = (p) => [p[0] + u[0] * (len - 40), p[1] + u[1] * (len - 40)];
  const ein = B.edge({ ...o, oneway: 1 }, [axis, far(pin), pin]);
  const eout = B.edge({ ...o, oneway: 1 }, [pout, far(pout), axis]);
  return { pin, pout, axis, ein, eout, u };
}

// ============ Practice town: junctions, lights, lanes, crossings ============
function town() {
  const B = new Builder('town');
  const main = { cls: 'secondary', mph: 30, w: 7.3 };
  const X = [-700, -250, 0, 250, 700];
  // Station Road: two lanes each way, lights at Bridge Street and Park Road
  B.road({ name: 'Station Road', cls: 'primary', mph: 30, w: 13, lanes: 4 }, [-700, -640, -250, 0, 250, 640, 700].map(x => [x, -450]));
  // High Street: lights at Bridge Street, side roads, a zebra
  B.road({ name: 'High Street', ...main }, [-700, -640, -250, -180, -80, 0, 200, 250, 600, 700].map(x => [x, 0]));
  // Elm Road: quiet 20 mph street (moving off), gives way at Bridge Street
  B.road({ name: 'Elm Road', cls: 'residential', mph: 20, w: 6.5 }, [[-700, 350], [-640, 350], [-330, 350], [-250, 350], [700, 350]]);
  // Moor Road: long straight 30 (emergency stop)
  B.road({ name: 'Moor Road', ...main }, [[-700, 600], [-640, 600], [-250, 600], [560, 600], [700, 600]]);
  // frame roads
  B.road({ name: 'West Road', cls: 'tertiary', mph: 30, w: 7.3 }, [[-700, -450], [-700, 0], [-700, 350], [-700, 600]]);
  B.road({ name: 'East Road', cls: 'tertiary', mph: 30, w: 7.3 }, [[700, -450], [700, 0], [700, 350], [700, 600]]);
  // Bridge Street: cycle lanes north of Station Road, two lanes each way between Station Road and High Street, 30 then 20 mph south
  B.road({ name: 'Bridge Street', cls: 'secondary', mph: 30, w: 10.3, cl: 2, cr: 2, cw: 1.5 }, [[-250, -950], [-250, -900], [-250, -700], [-250, -500], [-250, -450]]);
  B.road({ name: 'Bridge Street', cls: 'secondary', mph: 30, w: 13, lanes: 4 }, [[-250, -450], [-250, -380], [-250, 0]]);
  B.road({ name: 'Bridge Street', ...main }, [[-250, 0], [-250, 40], [-250, 200]]);
  B.road({ name: 'Bridge Street', ...main, mph: 20 }, [[-250, 200], [-250, 350], [-250, 540], [-250, 600]]);
  B.road({ name: 'Linden Close', cls: 'residential', mph: 20, w: 6 }, [[-250, -700], [-450, -700], [-520, -700]]);
  B.road({ name: 'North Road', cls: 'tertiary', mph: 30, w: 7.3 }, [[-250, -950], [250, -950]]);
  // Park Road: lights at Station Road, a puffin crossing, ends at High Street
  B.road({ name: 'Park Road', cls: 'tertiary', mph: 30, w: 7.3 }, [[250, -950], [250, -450], [250, -400], [250, -60], [250, 0]]);
  B.puffin([250, -450], [250, 0], 200);
  // Orchard Way: side road between High Street and Station Road
  B.road({ name: 'Orchard Way', cls: 'residential', mph: 30, w: 6.5 }, [[0, 0], [0, -220], [0, -450]]);
  B.zebra([0, 0], [250, 0], 130);

  // lights: Station Road junctions (group 0 east-west, 1 north-south) and Bridge Street / High Street
  let c = B.cluster++;
  for (const p of [[-700, -450], [0, -450]]) B.lights([p, [-250, -450]], 13 / 2 + 2.5, c, 0);
  for (const p of [[-250, -700], [-250, 0]]) B.lights([p, [-250, -450]], 13 / 2 + 2.5, c, 1);
  c = B.cluster++;
  for (const p of [[0, -450], [700, -450]]) B.lights([p, [250, -450]], 7.3 / 2 + 2.5, c, 0);
  for (const p of [[250, -950], [250, 0]]) B.lights([p, [250, -450]], 13 / 2 + 2.5, c, 1);
  c = B.cluster++;
  for (const p of [[-700, 0], [0, 0]]) B.lights([p, [-250, 0]], 13 / 2 + 2.5, c, 0);
  for (const p of [[-250, -450], [-250, 200]]) B.lights([p, [-250, 0]], 7.3 / 2 + 2.5, c, 1);
  // lane arrows: straight on is from the LEFT lane at Bridge Street, from the RIGHT lane at Park Road
  B.lanesArrows([[-700, -450], [-250, -450]], ['LS', 'R']);
  B.lanesArrows([[0, -450], [250, -450]], ['L', 'SR']);
  B.lanesArrows([[700, -450], [250, -450]], ['LS', 'R']);
  B.lanesArrows([[0, -450], [-250, -450]], ['L', 'SR']);
  B.lanesArrows([[-250, -450], [-250, 0]], ['LS', 'R']);
  B.lanesArrows([[-250, 0], [-250, -450]], ['L', 'SR']);
  // give way: side roads and the frame
  const gw = (p, q, major) => B.giveWay([p, q], major / 2 + 1.2);
  gw([0, -450], [0, 0], 7.3); gw([0, 0], [0, -450], 13);
  gw([250, -450], [250, 0], 7.3); gw([-520, -700], [-250, -700], 10.3);
  gw([-700, 350], [-250, 350], 7.3); gw([700, 350], [-250, 350], 7.3); // Elm Road gives way where it crosses Bridge Street
  gw([-250, 350], [-250, 600], 7.3);
  gw([-250, 0], [-700, 0], 7.3); gw([250, 0], [700, 0], 7.3); gw([-250, 350], [-700, 350], 7.3); gw([-250, 350], [700, 350], 7.3);
  return B;
}

// ============ Roundabout road: mini, normal, two-lane, traffic-light and Dutch roundabouts ============
function rbs() {
  const B = new Builder('rbs');
  const ring = { cls: 'secondary', mph: 30, w: 7.3 };
  // Dutch-style roundabout at x = -700: compact single-lane ring, cycle track round the outside, zebras on every arm
  const D = { x: -700, r: 13 }, dp = B.ring(D.x, 0, D.r, { name: '', cls: 'tertiary', mph: 30, w: 6.5 }, [0, 90, 180, 270]);
  B.cycleRings.push([dm(D.x), 0, dm(D.r + 3.25 + 4.6)]);
  B.road({ name: 'Ring Road', ...ring }, [dp(270), [-1080, 0], [-1150, 0]]);
  B.road({ name: 'Ring Road', ...ring }, [dp(90), [-450, 0], [-200, 0]]);
  B.road({ name: 'Fendon Road', cls: 'tertiary', mph: 30, w: 6.5 }, [dp(0), [D.x, -380], [D.x, -420]]);
  B.road({ name: "Queen Edith's Way", cls: 'tertiary', mph: 30, w: 6.5 }, [dp(180), [D.x, 420]]);
  for (const [b, far] of [[270, [-1150, 0]], [90, [-200, 0]], [0, [D.x, -420]], [180, [D.x, 420]]]) {
    const p = dp(b); B.zebra(p, far, D.r * 0 + 13.5); B.giveWay([far, p], 6.5 / 2 + 0.8);
  }
  // mini-roundabout T junction at x = -200 (Queens Road from the south)
  B.mini([-200, 0]);
  B.road({ name: 'Ring Road', ...ring }, [[-200, 0], [-120, 0], [286, 0]]);
  B.road({ name: 'Queens Road', cls: 'residential', mph: 30, w: 6.5 }, [[-200, 0], [-200, 380], [-200, 420]]);
  // normal roundabout at x = 300
  const R2 = B.ring(300, 0, 14, { name: '', cls: 'secondary', mph: 30, w: 7 }, [0, 90, 180, 270]);
  B.road({ name: 'North Road', cls: 'tertiary', mph: 30, w: 7.3 }, [R2(0), [300, -350], [300, -420]]);
  B.road({ name: 'South Road', cls: 'tertiary', mph: 30, w: 7.3 }, [R2(180), [300, 350], [300, 420]]);
  const wide = { name: 'Ring Road', cls: 'primary', mph: 40, w: 13, lanes: 4 };
  B.road(wide, [R2(90), [700, 0], [878, 0]]);
  for (const [b, far] of [[270, [-200, 0]], [0, [300, -420]], [180, [300, 420]], [90, [878, 0]]]) B.giveWay([far, R2(b)], 7 / 2 + 0.8);
  // two-lane roundabout at x = 900
  const R3 = B.ring(900, 0, 22, { name: '', cls: 'primary', mph: 40, w: 9.5, lanes: 2 }, [0, 90, 180, 270]);
  B.road({ name: 'Elizabeth Way', cls: 'primary', mph: 40, w: 13, lanes: 4 }, [R3(0), [900, -450]]);
  B.road({ name: 'Newmarket Road', cls: 'secondary', mph: 30, w: 7.3 }, [R3(180), [900, 380], [900, 450]]);
  B.road(wide, [R3(90), [1150, 0], [1306, 0]]);
  for (const [b, far] of [[270, [314, 0]], [0, [900, -450]], [180, [900, 450]], [90, [1306, 0]]]) B.giveWay([far, R3(b)], 9.5 / 2 + 0.8);
  // traffic-light roundabout at x = 1700: dual-carriageway arms, two lanes on the ring, lights on the way in and on the ring
  const C = { x: 1700, r: 34 }, sep = 7.6 + 3;
  const dual = { cls: 'primary', mph: 40, w: 7.6, lanes: 2 };
  const d = Math.asin(sep / 2 / C.r) * 180 / Math.PI;
  const bear = [270, 0, 90, 180], names = { 270: 'Ring Road', 0: 'Hills Road', 90: 'Ring Road', 180: 'Cherry Hinton Road' };
  const R4 = B.ring(C.x, 0, C.r, { name: '', cls: 'primary', mph: 40, w: 10, lanes: 2 }, bear.flatMap(b => [b - d, b + d]));
  const arms = {};
  for (const b of bear) arms[b] = dualArm(B, C.x, 0, C.r, b, 300, { name: names[b], ...dual }, sep);
  B.road(wide, [[1306, 0], arms[270].axis]);
  B.road({ name: 'Ring Road', cls: 'primary', mph: 40, w: 7.3 }, [arms[90].axis, [2400, 0], [2500, 0]]);
  B.road({ name: 'Hills Road', cls: 'secondary', mph: 30, w: 7.3 }, [arms[0].axis, [C.x, -C.r - 600]]);
  B.road({ name: 'Cherry Hinton Road', cls: 'secondary', mph: 30, w: 7.3 }, [arms[180].axis, [C.x, 600], [C.x, C.r + 640]]);
  for (const b of bear) {
    const A = arms[b], c = B.cluster++, inE = B.edges[A.ein];
    B.stops.push([A.ein, dm(inE.len - 10 / 2 - 1.8), 1, c, 0]);
    // the ring stop line sits just before this entry, after the exit for this arm
    const rf = B.find(R4(b - d), R4(b + d)), re = B.edges[rf.ei];
    B.stops.push([rf.ei, dm(re.len - 2.5), 1, c, 1]);
  }
  // arrows: from the west, straight on is from the RIGHT-hand lane; from the north and east, the left lane takes you ahead
  B.arrows.push([arms[270].ein, 1, 'L', 'SR'], [arms[0].ein, 1, 'LS', 'R'], [arms[90].ein, 1, 'LS', 'R'], [arms[180].ein, 1, 'L', 'SR']);
  return B;
}

// ============ Faster roads: 40 mph road, country lane at 60, dual carriageway at 70 ============
function roads() {
  const B = new Builder('roads');
  // Long Lane: 40 mph, gentle bends, heading north from the west end
  const ll = []; for (let z = 0; z >= -1600; z -= 25) ll.push([-900 + 40 * Math.sin(-z / 260), z]);
  B.curve({ name: 'Long Lane', cls: 'secondary', mph: 40, w: 7.3 }, ll, [0, 2, ll.length - 3, ll.length - 1]);
  // Babraham Road (40) into a dual carriageway at 70, then back to a single road
  B.road({ name: 'Babraham Road', cls: 'primary', mph: 40, w: 7.3 }, [[-900, 0], [-700, 0], [0, 0]]);
  const dual = { name: 'Babraham Road', cls: 'trunk', mph: 70, w: 7.6, lanes: 2, oneway: 1 };
  // the carriageways split apart quickly, so the two directions don't overlap where they meet the single road
  B.edge(dual, [[0, 0], [12, -2.5], [30, -6.5], [1400, -6.5], [2770, -6.5], [2788, -2.5], [2800, 0]]);
  B.edge(dual, [[2800, 0], [2788, 2.5], [2770, 6.5], [1400, 6.5], [30, 6.5], [12, 2.5], [0, 0]]);
  B.road({ name: 'Babraham Road', cls: 'primary', mph: 40, w: 7.3 }, [[2800, 0], [3300, 0], [3500, 0]]);
  // Grantchester Lane: narrow, national speed limit, bends you cannot see round
  const gl = []; for (let z = 0; z <= 1700; z += 12) gl.push([3500 + 50 * Math.sin(z / 130) * Math.min(1, z / 120), z]); // bends about 340 m radius: fine at 60 if you slow a little
  B.curve({ name: 'Grantchester Lane', cls: 'unclassified', mph: 60, w: 5.6 }, gl, [0, 4, gl.length - 5, gl.length - 1]);
  return B;
}

// ============ Puzzle park: two minis, a double mini, five arms, a gyratory and a motorway interchange ============
function park() {
  const B = new Builder('park');
  const st = { name: 'Market Street', cls: 'secondary', mph: 30, w: 7.3 };
  // two separate minis 80 m apart (Sturton Street from the north, New Street from the south)
  B.mini([-800, 0]); B.mini([-720, 0]);
  B.road(st, [[-1200, 0], [-800, 0], [-720, 0], [-400, 0], [-200, 0]]);
  B.road({ name: 'Sturton Street', cls: 'residential', mph: 20, w: 6.2 }, [[-800, 0], [-800, -350], [-800, -400]]);
  B.road({ name: 'New Street', cls: 'residential', mph: 20, w: 6.2 }, [[-720, 0], [-720, 400]]);
  // staggered double mini: Church End from the south, High Street to the north, 30 m apart
  B.mini([-200, 0]); B.mini([-170, 0]);
  B.road(st, [[-200, 0], [-170, 0], [100, 0], [482, 0]]);
  B.road({ name: 'Church End', cls: 'tertiary', mph: 30, w: 6.8 }, [[-200, 0], [-200, 380], [-200, 420]]);
  B.road({ name: 'High Street', cls: 'tertiary', mph: 30, w: 6.8 }, [[-170, 0], [-170, -350], [-170, -420]]);
  // five arms at x = 500, one of them one-way INTO the roundabout (it is not an exit, so don't count it)
  const F = B.ring(500, 0, 18, { name: '', cls: 'secondary', mph: 30, w: 7.5 }, [270, 330, 30, 90, 160]);
  B.road({ name: 'Victoria Avenue', cls: 'tertiary', mph: 30, w: 7 }, [F(330), at(500, 0, 400, 330)]);
  B.edge({ name: 'Emmanuel Road', cls: 'residential', mph: 20, w: 6, oneway: 1 }, [at(500, 0, 400, 30), F(30)]);
  B.road({ name: 'Jesus Lane', cls: 'residential', mph: 20, w: 6.5 }, [F(160), at(500, 0, 360, 160), at(500, 0, 400, 160)]);
  B.road(st, [F(90), [800, 0], [1240, 0]]);
  for (const [b, far] of [[270, [-170, 0]], [330, at(500, 0, 400, 330)], [30, at(500, 0, 400, 30)], [160, at(500, 0, 400, 160)], [90, [1240, 0]]]) B.giveWay([far, F(b)], 7.5 / 2 + 0.8);
  // gyratory at x = 1300: a one-way loop, clockwise, two lanes; to carry on along Market Street you go most of the way round
  const g = { cls: 'primary', mph: 30, w: 7.6, lanes: 2, oneway: 1 };
  const W0 = [1240, 0], NW = [1240, -70], N0 = [1300, -70], NE = [1360, -70], E0 = [1360, 0], SE = [1360, 60], S0 = [1300, 60], SW = [1240, 60];
  B.road({ name: 'Victoria Road', ...g }, [SW, W0, NW]);
  B.road({ name: 'Chesterton Road', ...g }, [NW, N0, NE]);
  B.road({ name: 'Mitcham Row', ...g }, [NE, E0, SE]);
  B.road({ name: 'De Freville Avenue', ...g }, [SE, S0, SW]);
  B.road({ name: 'Milton Road', cls: 'secondary', mph: 30, w: 7.3 }, [N0, [1300, -450]]);
  B.road({ name: 'Market Street', cls: 'secondary', mph: 30, w: 7.3 }, [E0, [1700, 0], [1800, 0]]);
  B.road({ name: 'Chesterton Lane', cls: 'tertiary', mph: 30, w: 7 }, [S0, [1300, 450]]);
  B.lanesArrows([NE, E0], ['L', 'S']);
  // roads joining the loop give way to traffic already on it
  B.giveWay([F(90), W0], 4.6); B.giveWay([[1300, -450], N0], 4.6); B.giveWay([[1800, 0], E0], 4.6); B.giveWay([[1300, 450], S0], 4.6);
  // interchange at x = 2400: big traffic-light roundabout over the A14, slip roads to the north
  const C = { x: 2400, r: 46 }, sep = 11.4 + 3;
  const d = Math.asin(sep / 2 / C.r) * 180 / Math.PI;
  const R = B.ring(C.x, 0, C.r, { name: '', cls: 'primary', mph: 40, w: 10, lanes: 2 }, [270 - d, 270 + d, 340, 20, 90 - d, 90 + d, 180 - d, 180 + d]);
  const W = dualArm(B, C.x, 0, C.r, 270, 320, { name: 'Market Street', cls: 'primary', mph: 40, w: 11.4, lanes: 3 }, sep);
  const E = dualArm(B, C.x, 0, C.r, 90, 320, { name: 'Cambridge Road', cls: 'primary', mph: 40, w: 11.4, lanes: 3 }, sep);
  const S = dualArm(B, C.x, 0, C.r, 180, 320, { name: 'Histon Road', cls: 'primary', mph: 40, w: 7.6, lanes: 2 }, sep);
  B.road({ name: 'Market Street', cls: 'secondary', mph: 30, w: 7.3 }, [[1800, 0], [1850, 0], W.axis]);
  B.road({ name: 'Cambridge Road', cls: 'secondary', mph: 40, w: 7.3 }, [E.axis, [3200, 0], [3300, 0]]);
  B.road({ name: 'Histon Road', cls: 'secondary', mph: 30, w: 7.3 }, [S.axis, [C.x, 800], [C.x, 900]]);
  const slip = { name: 'A14 slip road', cls: 'trunk_link', mph: 50, w: 7.3, lanes: 2, oneway: 1 };
  B.edge(slip, [R(340), at(C.x, 0, 160, 335), at(C.x, 0, 520, 330)]);
  B.edge({ ...slip, name: 'A14 slip road' }, [at(C.x, 0, 520, 30), at(C.x, 0, 160, 25), R(20)]);
  for (const [A, b] of [[W, 270], [E, 90], [S, 180]]) {
    const c = B.cluster++, inE = B.edges[A.ein]; B.stops.push([A.ein, dm(inE.len - 6.8), 1, c, 0]);
    const rf = B.find(R(b - d), R(b + d)), re = B.edges[rf.ei]; B.stops.push([rf.ei, dm(re.len - 2.5), 1, c, 1]);
  }
  { const c = B.cluster++, sl = B.edges.length - 1; B.stops.push([sl, dm(B.edges[sl].len - 6.8), 1, c, 0]);
    const rf = B.find(R(340), R(20)), re = B.edges[rf.ei]; B.stops.push([rf.ei, dm(re.len - 2.5), 1, c, 1]); }
  // three lanes in from the west (left, ahead, ahead or right) and from the east (left, left or ahead, right)
  B.arrows.push([W.ein, 1, 'L', 'S', 'SR'], [E.ein, 1, 'L', 'LS', 'R'], [S.ein, 1, 'L', 'SR']);
  return B;
}

export const LAYOUTS = { town, rbs, roads, park };
export function buildLayout(id) { return LAYOUTS[id]().toJSON(); }
