import { buildParkingWorld } from './parking-view.js';
// Builds the 3D city from the road network: road surfaces, markings, roundabouts, signals, zebras,
// and lazily generated buildings and trees in 400 m chunks around the driver.
import { WORLD } from './config.js';
import { posAt, laneInfo, nearest } from './net.js';
import { buildChunkContent } from './city.js';
import { buildSigns } from './signs.js';

const T = THREE;

function rng(seed) { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
class Acc {
  constructor() { this.pos = []; this.idx = []; }
  quad(x1, z1, x2, z2, x3, z3, x4, z4, y) { const i = this.pos.length / 3; this.pos.push(x1, y, z1, x2, y, z2, x3, y, z3, x4, y, z4); this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3); }
  mesh(mat, order) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3)); g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new T.Mesh(g, mat); m.renderOrder = order || 0; m.frustumCulled = false; return m;
  }
}
// ribbon along an edge polyline, offsets o1..o2 from centreline (left positive)
function ribbon(acc, e, o1, o2, y, s0 = 0, s1 = e.len) {
  const pts = [];
  for (let i = 0; i < e.n; i++) if (e.cum[i] > s0 && e.cum[i] < s1) pts.push(i);
  const P = [posAt(e, s0)]; for (const i of pts) { const a = posAt(e, e.cum[i] - 0.01), b = posAt(e, e.cum[i] + 0.01); P.push({ x: e.px[i], z: e.pz[i], tx: (a.tx + b.tx) / 2, tz: (a.tz + b.tz) / 2 }); }
  P.push(posAt(e, s1));
  for (let i = 0; i < P.length - 1; i++) {
    const p = P[i], q = P[i + 1];
    const pl = Math.hypot(p.tx, p.tz) || 1, ql = Math.hypot(q.tx, q.tz) || 1;
    const pnx = p.tz / pl, pnz = -p.tx / pl, qnx = q.tz / ql, qnz = -q.tx / ql;
    acc.quad(p.x + pnx * o1, p.z + pnz * o1, p.x + pnx * o2, p.z + pnz * o2, q.x + qnx * o2, q.z + qnz * o2, q.x + qnx * o1, q.z + qnz * o1, y);
  }
}
function flatMat(c, order) { const m = new T.MeshLambertMaterial({ color: c, side: T.DoubleSide }); m.depthWrite = false; return m; }

export function buildWorld(scene, net, traffic) {
  if (net.parking) return buildParkingWorld(scene, net.parking);
  const W = WORLD;
  scene.background = new T.Color(W.sky); scene.fog = new T.Fog(W.sky, W.fogNear, W.fogFar);
  scene.add(new T.HemisphereLight(0xe3ecf5, 0x7d7666, 0.78));
  // warm low sun; its shadow box follows the driver so shadows stay sharp nearby
  const sun = new T.DirectionalLight(0xffe4c2, 0.92); sun.castShadow = true;
  const SH = WORLD.shadowBox; Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 10, far: 700 });
  sun.shadow.mapSize.set(WORLD.shadowMap, WORLD.shadowMap); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);
  const SUN_OFF = new T.Vector3(-150, 230, 110);
  function updateSun(x, z) { const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4; sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z); }
  const groundMat = new T.MeshLambertMaterial({ color: W.ground }); groundMat.depthWrite = false;
  const ground = new T.Mesh(new T.PlaneGeometry(30000, 30000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = -1; ground.receiveShadow = true; scene.add(ground);

  // road surfaces, split into chunks so only nearby roads are drawn
  const C0 = net.chunkSize, roadChunks = new Map();
  const accFor = (x, z) => {
    const key = net.ck(Math.floor(x / C0), Math.floor(z / C0)); let a = roadChunks.get(key);
    if (!a) roadChunks.set(key, a = { pave: new Acc(), road: new Acc(), cyc: new Acc(), white: new Acc(), meshes: [] }); return a;
  };
  const bikeMarks = [];
  for (const e of net.edges) {
    const wy = e.way, w = wy.w, A = accFor(e.px[0], e.pz[0]), pave = A.pave, road = A.road, white = A.white;
    ribbon(pave, e, -(w / 2 + 2.6), w / 2 + 2.6, 0.02);
    ribbon(road, e, -w / 2, w / 2, 0.04);
    if (wy.rb && wy.lanes >= 2) { // lane line round a two-lane roundabout
      const L = laneInfo(e, 1); for (let k = 1; k < L.n; k++) { const o = L.outer - L.laneW * k; for (let s = 2; s < e.len - 2; s += 4.5) dash(white, e, s, 2.2, o, 0.07); }
    }
    if (!wy.rb && e.len > 16) {
      // lane dividers within each direction: dashed, then long solid-looking dashes on the last 30 m before a junction
      for (const dir of wy.oneway ? [1] : [1, -1]) {
        const L = laneInfo(e, dir);
        for (let k = 1; k < L.n; k++) {
          const o = (L.outer - L.laneW * k) * dir;
          for (let s = 8; s < e.len - 8; s += 9) {
            const toEnd = dir > 0 ? e.len - s : s; // distance to the junction you are driving towards
            dash(white, e, s, toEnd < 38 ? 7 : 3, o, 0.07);
          }
        }
      }
      // centre line on two-way main roads, kept clear of junctions
      if (!wy.oneway && (/^(primary|secondary|tertiary|trunk)/.test(wy.cls) || wy.lanes >= 2)) for (let s = 9; s < e.len - 9; s += 9) dash(white, e, s, 3.2, 0, 0.07);
    }
    // cycle lanes: red surface, solid edge line if mandatory, long dashes if advisory, bike symbols
    for (const [code, side] of [[wy.cl, 1], [wy.cr, -1]]) {
      if ((code !== 1 && code !== 2) || e.len < 6) continue;
      const a = side * (w / 2 - wy.cw), b = side * (w / 2);
      ribbon(A.cyc, e, Math.min(a, b), Math.max(a, b), 0.05, 1.5, e.len - 1.5);
      if (code === 2) ribbon(white, e, a - 0.08, a + 0.08, 0.07, 2, e.len - 2);
      else for (let s = 3; s < e.len - 5; s += 6) dash(white, e, s, 4, a, 0.07);
      for (let s = 12; s < e.len - 6; s += 40) { const p = posAt(e, s); const o = side * (w / 2 - wy.cw / 2); bikeMarks.push([p.x + p.tz * o, p.z - p.tx * o, Math.atan2(-p.tx * side, -p.tz * side)]); }
    }
  }
  // rounded kerbs at junction corners (see net.js junctionFillets)
  for (const f of net.fillets) { const road = accFor(f.C[0], f.C[1]).road; for (let k = 0; k < f.pts.length - 1; k++) road.quad(f.C[0], f.C[1], f.pts[k][0], f.pts[k][1], f.pts[k + 1][0], f.pts[k + 1][1], f.pts[k + 1][0], f.pts[k + 1][1], 0.04); }
  for (const st of net.stops) bar(accFor(st.x, st.z).white, st, st.e.way.oneway ? -st.w / 2 + 0.3 : 0.2, st.w / 2 - 0.3, 0.35);
  for (const g of net.giveways) {
    const white = accFor(g.x, g.z).white;
    for (const back of [0, 0.7]) for (let o = 0.3; o < g.w / 2 - 0.3; o += 1) bar(white, g, o, Math.min(o + 0.55, g.w / 2 - 0.3), 0.25, back);
  }
  for (const z of net.zebras) {
    const white = accFor(z.x, z.z).white;
    for (let o = -z.w / 2 + 0.3; o < z.w / 2 - 0.3; o += 1) {
      const o2 = Math.min(o + 0.5, z.w / 2 - 0.2), nx = z.tz, nz = -z.tx;
      white.quad(z.x + nx * o - z.tx * 1.6, z.z + nz * o - z.tz * 1.6, z.x + nx * o2 - z.tx * 1.6, z.z + nz * o2 - z.tz * 1.6, z.x + nx * o2 + z.tx * 1.6, z.z + nz * o2 + z.tz * 1.6, z.x + nx * o + z.tx * 1.6, z.z + nz * o + z.tz * 1.6, 0.07);
    }
  }
  // Dutch-style roundabouts: red cycle track round the outside with white "elephant's footprint" edges where it crosses the roads
  const annulus = (acc, ring, r0, r1, y) => { const N = 96; for (let i = 0; i < N; i++) { const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, P = (r, a) => [ring.x + r * Math.sin(a), ring.z - r * Math.cos(a)];
    const [x1, z1] = P(r0, a0), [x2, z2] = P(r1, a0), [x3, z3] = P(r1, a1), [x4, z4] = P(r0, a1); acc.quad(x1, z1, x2, z2, x3, z3, x4, z4, y); } };
  for (const ring of net.cycleRings) {
    const A = accFor(ring.x, ring.z);
    annulus(A.pave, ring, ring.r - 3.4, ring.r + 3, 0.021);
    annulus(A.cyc, ring, ring.r - 1.2, ring.r + 1.2, 0.055);
    for (const c of ring.crossings) for (const side of [-1, 1]) {
      const r = ring.r + side * 1.35, w = c.w / 2;
      for (let o = -w; o < w - 0.3; o += 0.9) { // short white blocks along both edges of the crossing
        const tx = Math.cos(c.ang), tz = Math.sin(c.ang), nx = Math.sin(c.ang), nz = -Math.cos(c.ang), cx = ring.x + nx * r + tx * (o + 0.25), cz = ring.z + nz * r + tz * (o + 0.25);
        A.white.quad(cx - tx * 0.25 - nx * 0.2, cz - tz * 0.25 - nz * 0.2, cx + tx * 0.25 - nx * 0.2, cz + tz * 0.25 - nz * 0.2, cx + tx * 0.25 + nx * 0.2, cz + tz * 0.25 + nz * 0.2, cx - tx * 0.25 + nx * 0.2, cz - tz * 0.25 + nz * 0.2, 0.075);
      }
    }
  }
  // puffin crossings: two lines of studs across the road where people cross
  for (const c of traffic.puffins) {
    const white = accFor(c.x, c.z).white, nx = c.tz, nz = -c.tx, h = c.w / 2;
    for (const al of [-1.4, 1.4]) for (let o = -h + 0.2; o < h - 0.2; o += 0.7) {
      const x = c.x + c.tx * al + nx * o, z = c.z + c.tz * al + nz * o;
      white.quad(x - 0.15, z - 0.15, x + 0.15, z - 0.15, x + 0.15, z + 0.15, x - 0.15, z + 0.15, 0.072);
    }
  }
  const pm = flatMat(W.pave), rm = flatMat(W.road), cm = flatMat(W.cycle);
  const wm = new T.MeshBasicMaterial({ color: W.line, side: T.DoubleSide }); wm.depthWrite = false;
  for (const [key, A] of roadChunks) {
    for (const [acc, mat, ord] of [[A.pave, pm, 1], [A.road, rm, 2], [A.cyc, cm, 3], [A.white, wm, 4]]) {
      if (!acc.idx.length) continue; const m = acc.mesh(mat, ord); m.frustumCulled = true; m.receiveShadow = true; A.meshes.push(m); scene.add(m);
    }
    A.cx = Math.floor(key / 8192) - 4000; A.cz = (key % 8192) - 4000; A.pave = A.road = A.cyc = A.white = null;
  }
  // bike symbols painted in cycle lanes
  if (bikeMarks.length) {
    const bm = new T.MeshBasicMaterial({ map: bikeTexture(), transparent: true, depthWrite: false });
    const g = new T.PlaneGeometry(1.1, 1.1); g.rotateX(-Math.PI / 2);
    const im = new T.InstancedMesh(g, bm, bikeMarks.length), M = new T.Matrix4(), Qb = new T.Quaternion(), Eb = new T.Euler();
    bikeMarks.forEach(([x, z, r], i) => { Eb.set(0, r, 0); Qb.setFromEuler(Eb); M.compose(new T.Vector3(x, 0.08, z), Qb, new T.Vector3(1, 1, 1)); im.setMatrixAt(i, M); });
    im.renderOrder = 5; im.frustumCulled = false; scene.add(im);
  }

  // roundabout islands and mini-roundabouts
  const grass = new T.MeshLambertMaterial({ color: 0x7ea463 }), kerb = new T.MeshLambertMaterial({ color: 0xd8d6cf });
  // island = the ring road's own shape pulled in by half its width, so oval interchanges (Milton) fit the carriageway
  function islandOutline(r, inset) {
    const pts = [];
    for (const e of net.edges) {
      if (!e.way.rb) continue;
      for (let i = 0; i < e.n; i++) if (Math.hypot(e.px[i] - r.x, e.pz[i] - r.z) < r.r + 25) pts.push([e.px[i], e.pz[i], e.way.w]);
    }
    if (pts.length < 6) return null;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    pts.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    const out = [];
    for (const [x, z, w] of pts) {
      const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz), nl = L - w / 2 - inset;
      if (nl < 1.2) return null;
      const p = [cx + dx / L * nl, cz + dz / L * nl];
      if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.8) out.push(p);
    }
    return out.length >= 6 ? out : null;
  }
  const islandMesh = (outline, depth, mat) => {
    const sh = new T.Shape(); outline.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); sh.closePath();
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    return new T.Mesh(g, mat);
  };
  for (const r of net.rbs) {
    const inner = islandOutline(r, 0.8), edge = inner && islandOutline(r, 0.4);
    if (inner && edge) { scene.add(islandMesh(edge, 0.16, kerb), islandMesh(inner, 0.3, grass)); continue; }
    const ir = r.r - r.w / 2 - 0.4; if (ir < 1.5) continue;
    const k = new T.Mesh(new T.CylinderGeometry(ir + 0.4, ir + 0.4, 0.16, 40), kerb); k.position.set(r.x, 0.08, r.z); scene.add(k);
    const g = new T.Mesh(new T.CylinderGeometry(ir, ir, 0.3, 40), grass); g.position.set(r.x, 0.15, r.z); scene.add(g);
  }
  for (const m of net.minis) { const d = new T.Mesh(new T.CircleGeometry(1.6, 24), wm); d.rotation.x = -Math.PI / 2; d.position.set(m.x, 0.08, m.z); d.renderOrder = 3; scene.add(d); }

  // traffic signals: instanced poles + heads + three lamp layers recoloured each tick
  const S = net.stops, nS = S.length, M4 = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), SC = new T.Vector3(1, 1, 1);
  const poleG = new T.CylinderGeometry(0.09, 0.09, 3.9, 6); poleG.translate(0, 1.95, 0);
  const headG = new T.BoxGeometry(0.48, 1.4, 0.34);
  const lampG = new T.SphereGeometry(0.17, 10, 8);
  const poles = new T.InstancedMesh(poleG, new T.MeshLambertMaterial({ color: 0x2a2e31 }), nS);
  const heads = new T.InstancedMesh(headG, new T.MeshLambertMaterial({ color: 0x15181a }), nS);
  const lamps = [0, 1, 2].map(() => new T.InstancedMesh(lampG, new T.MeshBasicMaterial({ color: 0xffffff }), nS));
  // a pole must stand on the pavement or an island, never in a carriageway or on a cycle track
  const clear = (x, z) => { const nr = nearest(net, x, z); if (nr && nr.d < nr.way.w / 2 + 0.6) return false; return !net.cycleRings.some(r => Math.abs(Math.hypot(x - r.x, z - r.z) - r.r) < 1.8); };
  S.forEach((st, i) => {
    const nx = st.tz, nz = -st.tx; // left of travel
    let px = st.x + nx * (st.w / 2 + 1.0), pz = st.z + nz * (st.w / 2 + 1.0);
    // left kerb first; then a little further back; then the right-hand side (a central island or the far kerb)
    for (const [side, back] of [[1, 0], [1, 2.5], [1, 5], [-1, 0], [-1, 2.5], [1, -2]]) {
      const o = side * (st.w / 2 + 1.0), x = st.x + nx * o - st.tx * back, z = st.z + nz * o - st.tz * back;
      if (clear(x, z)) { px = x; pz = z; break; }
    }
    st.px = px; st.pz = pz;
    M4.makeTranslation(px, 0, pz); poles.setMatrixAt(i, M4);
    E.set(0, Math.atan2(-st.tx, -st.tz), 0); Q.setFromEuler(E);
    M4.compose(V.set(px, 3.35, pz), Q, SC); heads.setMatrixAt(i, M4);
    [3.79, 3.35, 2.91].forEach((y, k) => { M4.makeTranslation(px - st.tx * 0.2, y, pz - st.tz * 0.2); lamps[k].setMatrixAt(i, M4); lamps[k].setColorAt(i, new T.Color(0x222222)); });
  });
  for (const m of [poles, heads, ...lamps]) { m.frustumCulled = false; scene.add(m); }

  // Belisha beacons
  const Z = net.zebras, bPole = new T.InstancedMesh(new T.CylinderGeometry(0.07, 0.07, 2.5, 6).translate(0, 1.25, 0), new T.MeshLambertMaterial({ color: 0x1a1a1a }), Z.length * 2);
  const globeMat = new T.MeshBasicMaterial({ color: 0xffb21a });
  const globes = new T.InstancedMesh(new T.SphereGeometry(0.28, 12, 8), globeMat, Z.length * 2);
  Z.forEach((z, i) => [-1, 1].forEach((sd, k) => {
    let bx = z.x + z.tz * sd * (z.w / 2 + 1.3), bz = z.z - z.tx * sd * (z.w / 2 + 1.3);
    for (const along of [0, -1.2, 1.2, -2.4, 2.4]) { const x = bx + z.tx * along, y = bz + z.tz * along; if (clear(x, y)) { bx = x; bz = y; break; } } // step along the kerb until clear of other roads
    M4.makeTranslation(bx, 0, bz); bPole.setMatrixAt(i * 2 + k, M4); M4.makeTranslation(bx, 2.75, bz); globes.setMatrixAt(i * 2 + k, M4);
  }));
  for (const m of [bPole, globes]) { m.frustumCulled = false; scene.add(m); }

  buildSigns(scene, net);

  // lazy chunks of buildings, roofs, awnings, lamps and trees (see city.js)
  const chunks = new Map(), queue = [];
  const C = net.chunkSize;
  function buildChunk(key, cx, cz) {
    const edges = net.chunks.get(key);
    const grp = edges ? buildChunkContent(net, edges, cx, cz, C, rng(key)) : new T.Group();
    chunks.set(key, grp); scene.add(grp);
  }
  function updateChunks(px, pz, budget) {
    const r = Math.ceil(WORLD.buildRadius / C), pcx = Math.floor(px / C), pcz = Math.floor(pz / C);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const cx = pcx + i, cz = pcz + j, key = net.ck(cx, cz);
      if (chunks.has(key) || queue.some(q => q[0] === key)) continue;
      const d = Math.hypot((cx + 0.5) * C - px, (cz + 0.5) * C - pz);
      if (d < WORLD.buildRadius) queue.push([key, cx, cz, d]);
    }
    queue.sort((a, b) => a[3] - b[3]);
    for (let n = 0; n < budget && queue.length; n++) { const [k, cx, cz] = queue.shift(); buildChunk(k, cx, cz); }
    for (const [k, g] of chunks) {
      const cx = Math.floor(k / 8192) - 4000, cz = (k % 8192) - 4000;
      g.visible = Math.hypot((cx + 0.5) * C - px, (cz + 0.5) * C - pz) < WORLD.hideRadius;
    }
    for (const A of roadChunks.values()) {
      const vis = Math.hypot((A.cx + 0.5) * C - px, (A.cz + 0.5) * C - pz) < WORLD.hideRadius + 200;
      for (const m of A.meshes) m.visible = vis;
    }
  }

  const LAMP = { R: [0xff3b30, 0x3a1210], A: [0xffb21a, 0x3a2a0c], G: [0x2fe07a, 0x0f2a1a] }, col = new T.Color();
  function updateSignals(clock) {
    for (let i = 0; i < nS; i++) {
      const st = traffic.lightState(S[i]);
      lamps[0].setColorAt(i, col.setHex(st === 'R' || st === 'RA' ? LAMP.R[0] : LAMP.R[1]));
      lamps[1].setColorAt(i, col.setHex(st === 'A' || st === 'RA' ? LAMP.A[0] : LAMP.A[1]));
      lamps[2].setColorAt(i, col.setHex(st === 'G' ? LAMP.G[0] : LAMP.G[1]));
    }
    for (const l of lamps) if (l.instanceColor) l.instanceColor.needsUpdate = true; // an area with no traffic lights has none
    globeMat.color.setHex(Math.floor(clock * 1.6) % 2 ? 0x7a5a1c : 0xffb21a);
  }
  function setShadows(on) { sun.castShadow = !!on; }
  return { updateChunks, updateSignals, updateSun, setShadows, chunkCount: () => chunks.size, pending: () => queue.length };
}

function dash(acc, e, s, len, off, y) {
  const a = posAt(e, s), b = posAt(e, Math.min(e.len, s + len));
  const ax = a.x + a.tz * off, az = a.z - a.tx * off, bx = b.x + b.tz * off, bz = b.z - b.tx * off;
  const nx = a.tz * 0.07, nz = -a.tx * 0.07;
  acc.quad(ax + nx, az + nz, ax - nx, az - nz, bx - nx, bz - nz, bx + nx, bz + nz, y);
}
function bikeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  // drawn pointing "up" the texture = direction of travel
  g.beginPath(); g.arc(32, 14, 9, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(32, 50, 9, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(32, 14); g.lineTo(32, 34); g.lineTo(32, 50); g.moveTo(24, 22); g.lineTo(40, 22); g.stroke();
  const t = new T.CanvasTexture(c); return t;
}
// line across the road at a feature, from offset o1 to o2 on the traveller's left, thickness th, set back `back` metres
function bar(acc, f, o1, o2, th, back = 0) {
  const nx = f.tz, nz = -f.tx, bx = f.x - f.tx * back, bz = f.z - f.tz * back;
  acc.quad(bx + nx * o1, bz + nz * o1, bx + nx * o2, bz + nz * o2, bx + nx * o2 - f.tx * th, bz + nz * o2 - f.tz * th, bx + nx * o1 - f.tx * th, bz + nz * o1 - f.tz * th, 0.07);
}
