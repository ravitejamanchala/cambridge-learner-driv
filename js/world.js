import {roadsidePosition} from './road-space.js';
import {objectBlocker,fitRoadCorners} from './roadside-clearance.js';
import {joinedRoadSurfaces,surfaceGeometry} from './road-surfaces.js';
import {ribbon,dash,roadBoundsVisible} from './road-ribbon.js';
// Builds the 3D city from the road network: road surfaces, markings, roundabouts, signals, zebras,
// and lazily generated buildings and trees in 400 m chunks around the driver.
import { WORLD } from './config.js';
import { posAt, laneInfo, nearest, paved } from './net.js';
import { MW, JUNCTIONS, centreLine, sampleAt, circuitLength } from './motorway.js';
import { buildChunkContent, kitResources } from './city.js';
import { buildSigns, setSignsLit } from './signs.js';
import { DUSK, duskSky, lightPoolTexture } from './evening.js';
import { createRoadsideParkingView } from './roadside-parking-view.js';

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
function flatMat(c, order) { const m = new T.MeshLambertMaterial({ color: c, side: T.DoubleSide }); m.depthWrite = false; return m; }

export function buildWorld(scene, net, traffic, options = {}) {
  const W = WORLD;
  const joined=!!options.authored&&!net.edges.some(e=>e.way.cls==='motorway');
  if(joined)fitRoadCorners(net,options.objects||[]);
  const blocked=objectBlocker(options.objects||[]),placements=[];
  scene.background = new T.Color(W.sky); scene.fog = new T.Fog(W.sky, W.fogNear, W.fogFar);
  const hemi = new T.HemisphereLight(0xe3ecf5, 0x7d7666, 0.78); scene.add(hemi);
  // warm low sun; its shadow box follows the driver so shadows stay sharp nearby
  const sun = new T.DirectionalLight(0xffe4c2, 0.92); sun.castShadow = true;
  const SH = WORLD.shadowBox; Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 10, far: 700 });
  sun.shadow.mapSize.set(WORLD.shadowMap, WORLD.shadowMap); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);
  const SUN_OFF = new T.Vector3(-150, 230, 110), SUN_DAY = SUN_OFF.clone();
  function updateSun(x, z) { const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4; sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z); }
  const groundMat = new T.MeshLambertMaterial({ color: W.ground }); groundMat.depthWrite = false;
  const ground = new T.Mesh(new T.PlaneGeometry(120000, 120000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = -1; ground.receiveShadow = true; scene.add(ground);

  // road surfaces, split into chunks so only nearby roads are drawn
  const C0 = net.chunkSize, roadChunks = new Map();
  const accFor = (x, z) => {
    const key = net.ck(Math.floor(x / C0), Math.floor(z / C0)); let a = roadChunks.get(key);
    if (!a) roadChunks.set(key, a = { pave: new Acc(), road: new Acc(), cyc: new Acc(), white: new Acc(), meshes: [] }); return a;
  };
  const bikeMarks = [];
  // Motorways: no footway, a hard shoulder on the nearside and a hard strip by the central reservation,
  // solid edge lines, and lane lines to diagram 1005.1 (2 m mark, 7 m gap, 150 mm wide: the over-40 mph
  // module in Traffic Signs Manual chapter 5). Where a slip road runs alongside, the nearside edge line
  // becomes a short broken line instead (diagram 1010; its exact module is approximated here).
  const isMway = (wy) => wy.cls === 'motorway' || wy.cls === 'motorway_link';
  const slipOut = (v) => net.out[v].some(o => o.e.way.cls === 'motorway_link') && net.out[v].some(o => o.e.way.cls === 'motorway');
  const slipIn = (v) => net.inc[v].some(o => o.dir < 0 && o.e.way.cls === 'motorway_link') && net.inc[v].some(o => o.dir < 0 && o.e.way.cls === 'motorway');
  const line = (acc, e, off, s0, s1, half = 0.1) => ribbon(acc, e, off - half, off + half, 0.07, Math.max(0, s0), Math.min(e.len, s1));
  const broken = (acc, e, off, s0, s1, mark, gap, half) => { for (let s = Math.max(0, s0); s < Math.min(e.len, s1) - 0.2; s += mark + gap) dash(acc, e, s, Math.min(mark, s1 - s), off, 0.07, half); };
  // Road studs (Highway Code Rule 132), lit only at dusk: white between lanes, red on the nearside edge,
  // amber by the central reservation, green where a slip road leaves or joins.
  const studs = { white: [], red: [], amber: [], green: [] };
  const studLine = (list, e, off, s0, s1) => { for (let s = Math.max(1, s0); s < Math.min(e.len - 1, s1); s += 18) { const p = posAt(e, s); list.push(p.x + p.tz * off, p.z - p.tx * off); } };
  function motorwayEdge(e) {
    const wy = e.way, w = wy.w, A = accFor(e.px[0], e.pz[0]), J = MW.junction;
    if (wy.cls === 'motorway') {
      { const L = laneInfo(e, 1), dec = slipOut(e.a) ? J.decel : 0, acc = slipIn(e.b) ? J.accel : 0;
        for (let k = 1; k < L.n; k++) studLine(studs.white, e, L.outer - L.laneW * k, 0, e.len);
        studLine(studs.amber, e, -w / 2 - 0.15, 0, e.len);
        studLine(studs.red, e, w / 2 + 0.15, dec, e.len - acc);
        if (dec) studLine(studs.green, e, w / 2 + 0.15, 0, dec);
        if (acc) studLine(studs.green, e, w / 2 + 0.15, e.len - acc, e.len); }
      ribbon(A.road, e, -(w / 2 + MW.hardStrip), w / 2 + (wy.hs || 0), 0.04);
      line(A.white, e, -w / 2, 0, e.len); // offside edge, by the central reservation
      const L = laneInfo(e, 1);
      for (let k = 1; k < L.n; k++) broken(A.white, e, L.outer - L.laneW * k, 4, e.len - 2, 2, 7, 0.075);
      // nearside edge: broken where a slip road runs alongside lane 1, solid everywhere else
      const dec = slipOut(e.a) ? J.decel : 0, acc = slipIn(e.b) ? J.accel : 0;
      if (dec) broken(A.white, e, w / 2, 0, dec, 1, 1, 0.15);
      if (acc) broken(A.white, e, w / 2, e.len - acc, e.len, 1, 1, 0.15);
      line(A.white, e, w / 2, dec, e.len - acc);
      return;
    }
    // slip road: one lane between solid edge lines, except where it runs alongside the carriageway
    const exit = slipOut(e.a), entry = slipIn(e.b);
    ribbon(A.road, e, -(w / 2 + 0.6), w / 2 + 0.6, 0.041);
    line(A.white, e, w / 2, exit ? MW.taper : 0, entry ? e.len - MW.taper : e.len);
    line(A.white, e, -w / 2, exit ? J.decel : 0, entry ? e.len - J.accel : e.len);
  }

  for (const e of net.edges) {
    if (isMway(e.way)) { motorwayEdge(e); continue; }
    const wy = e.way, w = wy.w, A = accFor(e.px[0], e.pz[0]), pave = A.pave, road = A.road, white = A.white;
    if(!joined){ribbon(pave, e, -(w / 2 + 2.6), w / 2 + 2.6, 0.02);
    ribbon(road, e, -w / 2, w / 2, 0.04);}
    if (wy.rb && wy.lanes >= 2) { // lane line round a two-lane roundabout
      const L = laneInfo(e, 1); for (let k = 1; k < L.n; k++) { const o = L.outer - L.laneW * k; for (let s = 2; s < e.len - 2; s += 4.5) dash(white, e, s, 2.2, o, 0.07); }
    }
    if (!wy.rb && e.len > 5 && w >= 5.5) {
      // How far the markings stay clear of the junction at each end. A road is cut into an edge per
      // junction, so a fixed clearance left every short edge bare: a stretch of Hills Road 12 m long
      // got no centre line at all, and the road looked unmarked between two marked stretches.
      const clear = (want) => Math.min(want, e.len * 0.28);
      // lane dividers within each direction: dashed, then long solid-looking dashes on the last 30 m before a junction
      for (const dir of wy.oneway ? [1] : [1, -1]) {
        const L = laneInfo(e, dir), c = clear(8);
        for (let k = 1; k < L.n; k++) {
          const o = (L.outer - L.laneW * k) * dir;
          for (let s = c; s + 1.2 < e.len - c; s += 9) {
            const toEnd = dir > 0 ? e.len - s : s; // distance to the junction you are driving towards
            dash(white, e, s, Math.min(toEnd < 38 ? 7 : 3, e.len - c - s), o, 0.07);
          }
        }
      }
      // centre line on two-way main roads, kept clear of junctions
      if (!wy.oneway && (/^(primary|secondary|tertiary|trunk)/.test(wy.cls) || wy.lanes >= 2)) {
        const c = clear(9);
        for (let s = c; s + 1.2 < e.len - c; s += 9) dash(white, e, s, Math.min(3.2, e.len - c - s), 0, 0.07);
      }
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
  if(!joined)for (const f of net.fillets) { const road = accFor(f.C[0], f.C[1]).road; for (let k = 0; k < f.pts.length - 1; k++) road.quad(f.C[0], f.C[1], f.pts[k][0], f.pts[k][1], f.pts[k + 1][0], f.pts[k + 1][1], f.pts[k + 1][0], f.pts[k + 1][1], 0.04); }
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
  // the studs, hidden in daylight: one instanced mesh per colour for each 300 m square, and only the squares
  // near the car drawn. A whole circuit's studs at once were most of the triangles in the view.
  const studMeshes = [], STUD_CELL = 300, STUD_R = 800;
  { const g = new T.BoxGeometry(0.14, 0.04, 0.1).translate(0, 0.06, 0), M = new T.Matrix4();
    for (const [k, c] of [['white', 0xf4f4ee], ['red', 0xe2241c], ['amber', 0xf3a51a], ['green', 0x2fd36a]]) {
      const list = studs[k], mat = new T.MeshBasicMaterial({ color: c }), cells = new Map();
      for (let i = 0; i < list.length; i += 2) { const key = Math.floor(list[i] / STUD_CELL) + ',' + Math.floor(list[i + 1] / STUD_CELL); (cells.get(key) || cells.set(key, []).get(key)).push(list[i], list[i + 1]); }
      for (const [key, pts] of cells) {
        const im = new T.InstancedMesh(g, mat, pts.length / 2), [cx, cz] = key.split(',').map(Number);
        for (let i = 0; i < pts.length; i += 2) { M.makeTranslation(pts[i], 0, pts[i + 1]); im.setMatrixAt(i / 2, M); }
        im.visible = false; im.frustumCulled = false; im.userData = { studs: true, x: (cx + 0.5) * STUD_CELL, z: (cz + 0.5) * STUD_CELL };
        scene.add(im); studMeshes.push(im);
      }
    } }
  let studsOn = false, studAt = { x: 0, z: 0 };
  const updateStuds = (px, pz) => { studAt = { x: px, z: pz }; for (const m of studMeshes) m.visible = studsOn && Math.hypot(m.userData.x - px, m.userData.z - pz) < STUD_R; };
  if(joined){
    pm.color.setHex(0xa7a398);rm.color.setHex(0x444a4e);const kerbMat=flatMat(0x777b79);
    for(const tile of joinedRoadSurfaces(net))for(const [kind,mat,y,order] of [['pave',pm,.02,1],['kerb',kerbMat,.03,1.5],['road',rm,.04,2]]){
      if(!tile[kind].length)continue;const m=new T.Mesh(surfaceGeometry(T,tile[kind]),mat);m.position.y=y;m.renderOrder=order;m.receiveShadow=true;m.userData.roadSurface=kind;accFor(tile.x,tile.z).meshes.push(m);scene.add(m);
    }
  }
  for (const [key, A] of roadChunks) {
    for (const [acc, mat, ord] of [[A.pave, pm, 1], [A.road, rm, 2], [A.cyc, cm, 3], [A.white, wm, 4]]) {
      if (!acc.idx.length) continue; const m = acc.mesh(mat, ord); m.frustumCulled = true; m.receiveShadow = true; A.meshes.push(m); scene.add(m);
    }
    A.bounds = new T.Box3();
    for(const m of A.meshes){m.geometry.computeBoundingBox();A.bounds.union(m.geometry.boundingBox);}
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
  S.forEach((st, i) => {
    const point=st.e.way.oneway&&st.dir<0?null:roadsidePosition(net,st,{blocked:(x,z,r)=>blocked(x,z,r)||placements.some(p=>p.x!==null&&Math.hypot(x-p.x,z-p.z)<r+.4)});
    placements.push({kind:'signal',id:st.id,x:point?.x??null,z:point?.z??null,hidden:!point});
    if(!point){M4.makeScale(0,0,0);for(const mesh of [poles,heads,...lamps])mesh.setMatrixAt(i,M4);st.px=st.pz=null;return;}
    const px=point.x,pz=point.z;
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
    const point=roadsidePosition(net,z,{side:sd,radius:.3,blocked});
    placements.push({kind:'beacon',id:i*2+k,x:point?.x??null,z:point?.z??null,hidden:!point});
    if(!point){M4.makeScale(0,0,0);bPole.setMatrixAt(i*2+k,M4);globes.setMatrixAt(i*2+k,M4);return;}
    const bx=point.x,bz=point.z;
    M4.makeTranslation(bx, 0, bz); bPole.setMatrixAt(i * 2 + k, M4); M4.makeTranslation(bx, 2.75, bz); globes.setMatrixAt(i * 2 + k, M4);
  }));
  for (const m of [bPole, globes]) { m.frustumCulled = false; scene.add(m); }

  buildSigns(scene, net, {blocked,placements});

  // Central reservation: a concrete step barrier along the motorway's centre line, one instance per
  // segment so the whole circuit is a single draw call.
  const segs = []; for (const b of net.barriers) for (let i = 0; i < b.length - 1; i++) segs.push([b[i], b[i + 1]]);
  if (segs.length) {
    const bar = new T.InstancedMesh(new T.BoxGeometry(0.6, 1.0, 1).translate(0, 0.5, 0), new T.MeshLambertMaterial({ color: 0xd2d0c8 }), segs.length); // concrete step barrier, about 1 m
    const q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
    segs.forEach(([p, r], i) => {
      const dx = r[0] - p[0], dz = r[1] - p[1], len = Math.hypot(dx, dz);
      e.set(0, Math.atan2(dx, dz), 0); q.setFromEuler(e);
      M4.compose(v.set((p[0] + r[0]) / 2, 0, (p[1] + r[1]) / 2), q, sc.set(1, 1, len + 0.05)); bar.setMatrixAt(i, M4);
    });
    bar.frustumCulled = false; bar.receiveShadow = true; scene.add(bar);
  }

  // Motorway lighting around each junction: columns in the central reservation with a lantern over each
  // carriageway. In daylight they are just columns; at dusk the lanterns are lit and pools of light lie
  // on the road beneath (drawn on top of the surface, so they never hide a marking).
  const lighting = { heads: null, pools: null };
  if (net.motorway) {
    const line = centreLine(), total = circuitLength(), M4l = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
    const reach = MW.reserve / 2 + 2.6, pool = MW.reserve / 2 + MW.hardStrip + 4.5, posts = [];
    for (const j of JUNCTIONS) for (let s = j.at * total - 500; s <= j.at * total + MW.junction.len + 500; s += 42) posts.push(sampleAt(line, s));
    const col = new T.InstancedMesh(new T.CylinderGeometry(0.11, 0.14, 12, 6).translate(0, 6, 0), new T.MeshLambertMaterial({ color: 0x9ea3a6 }), posts.length);
    const arm = new T.InstancedMesh(new T.BoxGeometry(reach * 2, 0.12, 0.12).translate(0, 11.8, 0), new T.MeshLambertMaterial({ color: 0x9ea3a6 }), posts.length);
    const heads = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.18, 0.32).translate(0, 11.65, 0), new T.MeshBasicMaterial({ color: 0x5a5f63 }), posts.length * 2);
    const pools = new T.InstancedMesh(new T.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: T.AdditiveBlending }), posts.length * 2);
    posts.forEach((p, i) => {
      q.setFromAxisAngle(up, Math.atan2(p.nx, p.nz));
      M4l.compose(new T.Vector3(p.x, 0, p.z), q, one); col.setMatrixAt(i, M4l); arm.setMatrixAt(i, M4l);
      for (const [k, side] of [[0, 1], [1, -1]]) {
        M4l.compose(new T.Vector3(p.x + p.nx * reach * side, 0, p.z + p.nz * reach * side), q, one); heads.setMatrixAt(i * 2 + k, M4l);
        M4l.compose(new T.Vector3(p.x + p.nx * pool * side, 0.06, p.z + p.nz * pool * side), q, one); pools.setMatrixAt(i * 2 + k, M4l);
      }
    });
    for (const m of [col, arm, heads, pools]) { m.frustumCulled = false; scene.add(m); }
    pools.visible = false; pools.renderOrder = 6;
    Object.assign(lighting, { heads, pools, count: posts.length });
  }

  // Time of day. Lighting only: nothing about the road, the traffic or the assessment changes.
  const daySky = scene.background, duskBg = { tex: null };
  function setTimeOfDay(mode, { lowPower = false } = {}) {
    const dusk = mode === 'dusk';
    if (dusk) { duskBg.tex = duskBg.tex || duskSky(); scene.background = duskBg.tex; } else scene.background = daySky;
    scene.fog.color.setHex(dusk ? DUSK.fog : W.sky);
    hemi.color.setHex(dusk ? DUSK.hemi.sky : 0xe3ecf5); hemi.groundColor.setHex(dusk ? DUSK.hemi.ground : 0x7d7666); hemi.intensity = dusk ? DUSK.hemi.intensity : 0.78;
    sun.color.setHex(dusk ? DUSK.sun.colour : 0xffe4c2); sun.intensity = dusk ? DUSK.sun.intensity : 0.92;
    if (dusk) SUN_OFF.set(...DUSK.sun.offset); else SUN_OFF.copy(SUN_DAY);
    wm.color.setHex(dusk ? DUSK.lines : W.line);
    studsOn = dusk; updateStuds(studAt.x, studAt.z);
    if (lighting.heads) { lighting.heads.material.color.setHex(dusk ? 0xffe2a8 : 0x5a5f63); lighting.pools.visible = dusk && !lowPower; }
    setSignsLit(dusk);
  }

  // lazy chunks of buildings, roofs, awnings, lamps and trees (see city.js)
  const chunks = new Map(), queue = [];
  const C = net.chunkSize;
  function buildChunk(key, cx, cz) {
    const edges = net.chunks.get(key);
    const grp = edges && !options.authored ? buildChunkContent(net, edges, cx, cz, C, rng(key)) : new T.Group();
    chunks.set(key, grp); scene.add(grp);
  }
  // Geometry and materials shared by every chunk (the city kit) must survive; everything else the chunk
  // made for itself goes, including the per-chunk instance buffers.
  function freeChunk(g) {
    const keep = new Set(kitResources());
    g.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) if (!keep.has(m)) { if (m.map && !keep.has(m.map)) m.map.dispose(); m.dispose(); }
    });
    scene.remove(g);
  }
  function updateChunks(px, pz, budget) {
    if (studsOn) updateStuds(px, pz);
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
      const cx = Math.floor(k / 8192) - 4000, cz = (k % 8192) - 4000, d = Math.hypot((cx + 0.5) * C - px, (cz + 0.5) * C - pz);
      g.visible = d < WORLD.hideRadius;
      // Far behind: free it. A chunk that was only hidden stayed in memory for the rest of the drive,
      // so a long motorway drive kept every building and tree it had ever passed. It is rebuilt, the
      // same as before (the scenery is seeded by chunk), if the driver comes back.
      if (d > WORLD.freeRadius) { freeChunk(g); chunks.delete(k); }
    }
    for (const A of roadChunks.values()) {
      const vis = roadBoundsVisible(A.bounds, px, pz, WORLD.hideRadius + 200), far = !roadBoundsVisible(A.bounds, px, pz, WORLD.freeRadius);
      for (const m of A.meshes) m.visible = vis;
      // The road itself is built once for the whole map, but a hidden mesh keeps its GPU buffers from
      // the last time it was drawn, so a lap of the motorway left every section it had passed on the
      // GPU. Far behind, give the buffers back; the geometry stays here and uploads again on return.
      if (far && A.onGpu) { for (const m of A.meshes) m.geometry.dispose(); A.onGpu = false; }
      else if (vis) A.onGpu = true;
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
  // roadside parallel parking draws its markings, parked cars and guide over the ordinary world
  const roadside = createRoadsideParkingView(scene);
  return { placements, updateChunks, updateSignals, updateSun, setShadows, setTimeOfDay, lighting, studs: studMeshes, chunkCount: () => chunks.size, pending: () => queue.length, ...roadside };
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
