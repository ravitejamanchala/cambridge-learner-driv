// Route guide in the 3D view: chevrons painted along the next stretch of your lane, and a floating
// marker over the point where the next instruction happens (turn, roundabout or pull-up spot).
import { along, laneCentre } from './net.js';
import { pointOnRoute } from './ui.js';
const T = THREE;

export function createGuide() {
  const group = new T.Group(); group.renderOrder = 7;
  const N = 16, GAP = 6.5;
  const shape = new T.Shape(); // chevron pointing along -z (forward)
  shape.moveTo(0, -0.9); shape.lineTo(0.95, 0.15); shape.lineTo(0.6, 0.5); shape.lineTo(0, -0.15); shape.lineTo(-0.6, 0.5); shape.lineTo(-0.95, 0.15); shape.closePath();
  const cg = new T.ShapeGeometry(shape); cg.rotateX(-Math.PI / 2); cg.scale(1, 1, -1);
  const cm = new T.MeshBasicMaterial({ color: 0xef4f97, transparent: true, opacity: 0.6, depthWrite: false, side: T.DoubleSide });
  const chev = new T.InstancedMesh(cg, cm, N); chev.frustumCulled = false; chev.renderOrder = 7; group.add(chev);
  // next-turn marker: a soft beam and a bobbing arrow
  const beam = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 7, 12, 1, true), new T.MeshBasicMaterial({ color: 0xef4f97, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
  beam.position.y = 3.5; beam.renderOrder = 7;
  const head = new T.Mesh(new T.ConeGeometry(0.45, 0.8, 4), new T.MeshBasicMaterial({ color: 0xef4f97 })); head.rotation.x = Math.PI; head.renderOrder = 7;
  const ring = new T.Mesh(new T.RingGeometry(1.1, 1.4, 32), new T.MeshBasicMaterial({ color: 0xef4f97, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.renderOrder = 7;
  const marker = new T.Group(); marker.add(beam, head, ring); group.add(marker);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), pos = new T.Vector3(), sc = new T.Vector3(1, 1, 1);
  let on = true;

  // lane-centre point s metres along the route: the kerb lane, drifting into the lane the next junction needs
  // over the 120 m before it (so the arrows show you when and where to change lane)
  function lanePoint(R, s) {
    let k = 0; while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
    const st = R.steps[k], ts = Math.max(0, Math.min(st.e.len, s - R.stepS[k]));
    let off = laneCentre(st.e, st.dir, 0);
    const ins = R.instructions.find(i => i.laneOK && i.approach && i.approach.e === st.e && i.s >= s - 2);
    if (ins && !ins.laneOK.includes(0)) {
      const want = laneCentre(st.e, st.dir, ins.laneOK[0]), u = Math.max(0, Math.min(1, (s - (ins.s - 130)) / 45));
      off += (want - off) * u;
    }
    // on a two-lane roundabout: came in from the right-hand lane, so keep to the inner lane until just before your exit
    if (st.e.way.rb && st.e.way.lanes >= 2) {
      const rb = R.instructions.find(i => i.kind === 'rb' && i.s <= s + 1 && s <= i.exitS);
      if (rb && rb.laneOK && !rb.laneOK.includes(0)) {
        const inner = laneCentre(st.e, 1, 9), u = Math.max(0, Math.min(1, (rb.exitS - s - 4) / 16));
        off += (inner - off) * u;
      }
    }
    return along(st.e, ts, st.dir, off);
  }
  let minis = [];
  function update(test, clock, net) {
    minis = net ? net.minis : [];
    group.visible = on && !!test.route && !test.offRoute;
    if (!group.visible) return;
    const R = test.route, s0 = test.sRoute + 7, ins = R.instructions[Math.min(test.step, R.instructions.length - 1)];
    const stop = Math.min(R.len - 2, (ins.exitS ?? ins.s) + 12);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const s = s0 + i * GAP; if (s > stop) break;
      const p = lanePoint(R, s);
      for (const m of minis) { const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz); if (d < 3) { const k = 3 / (d || 1); p.x = m.x + dx * k; p.z = m.z + dz * k; } } // go round the painted disc
      q.setFromAxisAngle(up, Math.atan2(-p.tx, -p.tz)); pos.set(p.x, 0.07, p.z);
      const fade = 1 - i / N; sc.set(fade * 0.5 + 0.6, 1, fade * 0.5 + 0.6);
      m4.compose(pos, q, sc); chev.setMatrixAt(n++, m4);
    }
    chev.count = n; chev.instanceMatrix.needsUpdate = true;
    const tp = lanePoint(R, ins.final ? Math.max(0, R.len - 6) : ins.kind === 'rb' && test.sRoute > ins.s - 15 ? ins.exitS + 4 : ins.s);
    marker.position.set(tp.x, 0, tp.z);
    head.position.y = 7.6 + Math.sin(clock * 3) * 0.25; head.rotation.y = clock;
    ring.scale.setScalar(1 + (clock * 0.8 % 1) * 0.35); ring.material.opacity = 0.85 * (1 - (clock * 0.8 % 1));
  }
  return { group, update, lanePoint, set enabled(b) { on = b; }, get enabled() { return on; } };
}
