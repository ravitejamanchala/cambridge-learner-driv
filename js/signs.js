// UK road markings and upright signs, derived from the road network:
// give-way lines, triangles and signs at minor junctions and roundabouts, SLOW before roundabouts,
// speed-limit roundels and terminal signs where the limit changes, no-entry signs on one-way streets,
// and lane arrows on multi-lane approaches.
import { along, laneInfo, laneCentre, stopsNear, nearest, laneArrows } from './net.js';

const T = THREE;
const RANK = { trunk: 6, trunk_link: 5.5, primary: 5, primary_link: 4.5, secondary: 4, secondary_link: 3.5, tertiary: 3, tertiary_link: 2.5, unclassified: 2, residential: 1, living_street: 0 };
const rank = (e) => e.way.rb ? 10 : (RANK[e.way.cls] ?? 1);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 4; return t; }
const PAINT = '#f2f1ea';

// ---- painted textures (top of texture = direction of travel) ----
function arrowTex(kind) {
  return canvasTex(64, 192, (g, W, H) => {
    g.fillStyle = PAINT; g.strokeStyle = PAINT; g.lineWidth = 12; g.lineCap = 'butt'; g.lineJoin = 'round';
    const head = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 6); g.lineTo(-18, 6); g.closePath(); g.fill(); g.restore(); };
    const shaft = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    if (kind === 'ahead') { shaft(32, H - 6, 32, 44); head(32, 30, 0); }
    if (kind === 'left' || kind === 'aheadleft') { shaft(36, H - 6, 36, 92); g.beginPath(); g.moveTo(36, 96); g.quadraticCurveTo(36, 72, 18, 66); g.stroke(); head(14, 64, -Math.PI / 2.4); }
    if (kind === 'right' || kind === 'aheadright') { shaft(28, H - 6, 28, 92); g.beginPath(); g.moveTo(28, 96); g.quadraticCurveTo(28, 72, 46, 66); g.stroke(); head(50, 64, Math.PI / 2.4); }
    if (kind === 'aheadleft') { shaft(36, 92, 36, 44); head(36, 30, 0); }
    if (kind === 'aheadright') { shaft(28, 92, 28, 44); head(28, 30, 0); }
  });
}
const triTex = () => canvasTex(96, 192, (g, W, H) => { g.strokeStyle = PAINT; g.lineWidth = 9; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(8, 8); g.lineTo(W - 8, 8); g.lineTo(W / 2, H - 8); g.closePath(); g.stroke(); });
const textTex = (txt) => canvasTex(96, 256, (g, W, H) => { g.fillStyle = PAINT; g.font = '700 30px Geist, ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(W / 2, H / 2); g.scale(1, 3.2); g.fillText(txt, 0, 0); g.restore(); });
const roundelTex = (v) => canvasTex(128, 256, (g, W, H) => {
  g.save(); g.translate(W / 2, H / 2); g.scale(1, 2.1);
  g.fillStyle = 'rgba(196,40,40,.85)'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = PAINT; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
  g.fillStyle = PAINT; g.font = '700 50px Geist, ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), 0, 2);
  g.restore();
});
// ---- upright sign faces ----
const speedSignTex = (v) => canvasTex(128, 128, (g) => {
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d2232a'; g.lineWidth = 15; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111'; g.font = '700 50px Geist, ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), 64, 67);
});
const giveWaySignTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#d2232a'; g.beginPath(); g.moveTo(4, 10); g.lineTo(124, 10); g.lineTo(64, 120); g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(24, 22); g.lineTo(104, 22); g.lineTo(64, 96); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.font = '700 15px Geist, ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('GIVE', 64, 40); g.fillText('WAY', 64, 56);
});
const noEntryTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#d2232a'; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(20, 54, 88, 20);
});

// collects instance transforms for one textured quad type, then builds one InstancedMesh
class Batch {
  constructor(geo, mat, order) { this.geo = geo; this.mat = mat; this.order = order; this.m = []; }
  push(x, y, z, yaw, sx, sy, sz) { const M = new T.Matrix4(); M.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)), new T.Vector3(sx, sy, sz)); this.m.push(M); }
  build(scene) {
    if (!this.m.length) return; const im = new T.InstancedMesh(this.geo, this.mat, this.m.length);
    this.m.forEach((M, i) => im.setMatrixAt(i, M)); im.frustumCulled = false; im.renderOrder = this.order; scene.add(im);
  }
}

export function buildSigns(scene, net) {
  const floorG = new T.PlaneGeometry(1, 1); floorG.rotateX(-Math.PI / 2);
  const floor = (tex) => { const m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }); return new Batch(floorG, m, 5); };
  const plateG = new T.PlaneGeometry(1, 1), discG = new T.CircleGeometry(0.5, 24);
  const face = (tex, geo) => new Batch(geo, new T.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4 }), 0);
  const backMat = new T.MeshLambertMaterial({ color: 0x8a9096 });
  const triBackG = new T.ShapeGeometry(new T.Shape([new T.Vector2(-0.5, 0.42), new T.Vector2(0.5, 0.42), new T.Vector2(0, -0.44)]));
  const B = {
    tri: floor(triTex()), slow: floor(textTex('SLOW')), arrows: {}, roundel: {},
    gwSign: face(giveWaySignTex(), plateG), noEntry: face(noEntryTex(), discG), speed: {},
    discBack: new Batch(discG, backMat, 0), triBack: new Batch(triBackG, backMat, 0),
    poles: new Batch(new T.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), new T.MeshLambertMaterial({ color: 0x8a9096 }), 0)
  };
  const arrowB = (k) => B.arrows[k] || (B.arrows[k] = floor(arrowTex(k)));
  const roundelB = (v) => B.roundel[v] || (B.roundel[v] = floor(roundelTex(v)));
  const speedB = (v) => B.speed[v] || (B.speed[v] = face(speedSignTex(v), discG));
  const lines = { pos: [], idx: [] };
  const quad = (pts) => { const i = lines.pos.length / 3; for (const [x, z] of pts) lines.pos.push(x, 0.075, z); lines.idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };

  const yawOf = (p) => Math.atan2(-p.tx, -p.tz); // texture top / sign face toward travel
  const paint = (batch, e, ts, dir, off, w, l) => { if (ts < 1 || ts > e.len - 1) return; const p = along(e, ts, dir, off); batch.push(p.x, 0.08, p.z, yawOf(p), w, 1, l); };
  const signAt = (batch, back, e, ts, dir, off, size, h = 2.3) => {
    if (ts < 0.5 || ts > e.len - 0.5) return;
    const p = along(e, ts, dir, off), yaw = Math.atan2(-p.tx, -p.tz); // plate normal points back at approaching drivers
    const nr = nearest(net, p.x, p.z); if (nr && nr.e !== e && nr.d < nr.way.w / 2 + 0.4) return; // never inside another carriageway
    batch.push(p.x, h, p.z, yaw, size, size, 1);
    if (back) back.push(p.x + p.tx * 0.02, h, p.z + p.tz * 0.02, yaw + Math.PI, size, size, 1);
    B.poles.push(p.x + p.tx * 0.05, 0, p.z + p.tz * 0.05, 0, 1, h - size * 0.4, 1);
  };
  // double broken give-way line across the traveller's half of the road
  const giveWayLine = (e, ts, dir) => {
    const w = e.way.w, o1 = e.way.oneway ? -w / 2 + 0.3 : 0.2, o2 = w / 2 - 0.3;
    for (const back of [0, 0.75]) for (let o = o1; o < o2; o += 1) {
      const a = along(e, ts - back, dir), b2 = Math.min(o + 0.55, o2), nx = a.tz, nz = -a.tx, th = 0.22;
      quad([[a.x + nx * o, a.z + nz * o], [a.x + nx * b2, a.z + nz * b2], [a.x + nx * b2 - a.tx * th, a.z + nz * b2 - a.tz * th], [a.x + nx * o - a.tx * th, a.z + nz * o - a.tz * th]]);
    }
  };
  const hasDataGW = new Set(net.giveways.map(g => g.e.id));
  const miniAt = (v) => net.minis.some(m => Math.hypot(m.x - net.nx[v], m.z - net.nz[v]) < 10);
  const sigAt = (v) => stopsNear(net, net.nx[v], net.nz[v]).some(s => Math.hypot(s.x - net.nx[v], s.z - net.nz[v]) < 32);
  const arriveDir = (o) => -o.dir; // o.dir leaves the node; arriving travel is the opposite
  const canArrive = (o) => !o.e.way.oneway || arriveDir(o) === 1;
  const tangentIn = (o) => { const p = along(o.e, o.e.len - 1, arriveDir(o)); return { x: p.tx, z: p.tz }; };
  const tangentOut = (o) => { const p = along(o.e, Math.min(4, o.e.len / 2), o.dir); return { x: p.tx, z: p.tz }; };
  const turn = (a, b) => Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z); // <0 left

  for (let v = 0; v < net.nx.length; v++) {
    const inc = net.inc[v]; if (inc.length < 2) continue;
    const signals = sigAt(v), mini = miniAt(v), hasRb = inc.some(o => o.e.way.rb);
    // --- give way, SLOW, lane arrows on approaches ---
    if (inc.length >= 3 || hasRb) for (const o of inc) {
      if (o.e.way.rb || !canArrive(o)) continue;
      const others = inc.filter(p => p !== o), r = rank(o.e), maxO = Math.max(...others.map(p => rank(p.e)));
      const tin = tangentIn(o);
      const continues = others.some(p => Math.abs(turn(tin, tangentOut(p))) < 0.5 && !p.e.way.rb);
      const minor = hasRb || mini || r < maxO || (r === maxO && !continues);
      const ad = arriveDir(o), e = o.e;
      const majorW = Math.max(...others.map(p => p.e.way.w));
      let stopDist = hasRb ? majorW / 2 + 0.8 : majorW / 2 + 1.0;
      if (!signals && minor && e.len > stopDist + 4) {
        const ts = e.len - stopDist;
        if (!hasDataGW.has(e.id)) giveWayLine(e, ts, ad);
        if (ts > 18) paint(B.tri, e, ts - 14, ad, laneCentre(e, ad, 0), 1.6, 3.6);
        if (hasRb && ts > 40) paint(B.slow, e, ts - 32, ad, laneCentre(e, ad, 0), 1.6, 4.2);
        if (hasRb || mini || maxO >= 3) signAt(B.gwSign, B.triBack, e, ts + 0.3, ad, e.way.w / 2 + 0.7, 0.9);
      }
      // lane arrows where there are two or more lanes towards the junction
      // lane arrows (the same ones the examiner marks you on)
      const L = laneInfo(e, ad), codes = L.n >= 2 && e.len > 40 ? laneArrows(net, e, ad) : null;
      if (codes) {
        const KIND = { L: 'left', S: 'ahead', R: 'right', LS: 'aheadleft', SR: 'aheadright' };
        const back0 = signals ? 4 : 0;
        codes.forEach((c, i) => { for (const back of [10, 32, 60]) if (back < e.len - 12) paint(arrowB(KIND[c] || 'ahead'), e, e.len - stopDist - back - back0, ad, laneCentre(e, ad, i), 1.1, 4.5); });
      }
    }
    // --- speed limit changes: roundel on the road and terminal signs on both sides ---
    for (const o of inc) {
      if (o.e.way.oneway && o.dir !== 1) continue; if (o.e.way.assumed || o.e.way.rb) continue;
      const to = tangentOut(o);
      let best = null, bd = 0.7;
      for (const p of inc) { if (p === o || !canArrive(p)) continue; const d = tangentIn(p).x * to.x + tangentIn(p).z * to.z; if (d > bd) { bd = d; best = p; } }
      if (!best || best.e.way.mph === o.e.way.mph) continue;
      const e = o.e, mph = e.way.mph; if (e.len < 20) continue;
      const far = e.way.oneway ? -e.way.w / 2 - 0.7 : -e.way.w / 2 - 0.7;
      signAt(speedB(mph), B.discBack, e, 4, o.dir, e.way.w / 2 + 0.7, 0.75);
      signAt(speedB(mph), B.discBack, e, 4, o.dir, far, 0.75);
      if (e.len > 30) paint(roundelB(mph), e, 14, o.dir, laneCentre(e, o.dir, 0), 1.9, 4.2);
    }
    // --- no entry at the exit end of one-way streets ---
    for (const o of inc) {
      const e = o.e; if (!e.way.oneway || e.way.rb || o.dir !== -1 || e.len < 12) continue; // o.dir -1: e ends here
      if (!inc.some(p => p !== o && canArrive(p))) continue;
      if (inc.some(p => p !== o && p.e.way.oneway && p.e.way.name === e.way.name)) continue; // dual-carriageway split, not a one-way street
      signAt(B.noEntry, B.discBack, e, 2, -1, e.way.w / 2 + 0.6, 0.75);
      signAt(B.noEntry, B.discBack, e, 2, -1, -e.way.w / 2 - 0.6, 0.75);
    }
  }
  // repeater roundels along long 20 mph roads
  for (const e of net.edges) {
    if (e.way.mph !== 20 || e.way.assumed || e.len < 220) continue;
    for (const dir of e.way.oneway ? [1] : [1, -1]) for (let s = 120; s < e.len - 60; s += 260) paint(roundelB(20), e, s, dir, laneCentre(e, dir, 0), 1.9, 4.2);
  }

  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(lines.pos, 3)); g.setIndex(lines.idx);
  const lm = new T.MeshBasicMaterial({ color: 0xf2f1ea, side: T.DoubleSide }); lm.depthWrite = false;
  const lmesh = new T.Mesh(g, lm); lmesh.renderOrder = 4; lmesh.frustumCulled = false; scene.add(lmesh);
  for (const b of [B.tri, B.slow, B.gwSign, B.noEntry, B.discBack, B.triBack, B.poles, ...Object.values(B.arrows), ...Object.values(B.roundel), ...Object.values(B.speed)]) b.build(scene);
}
