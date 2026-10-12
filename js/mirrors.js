// Mirrors inside the car: a rear-view mirror at the top of the windscreen and a door mirror on each side.
// Each renders the scene from its own camera into a texture shown on the glass, flipped like a real mirror.
// They are fixed to the driver's-seat cockpit, so you see them in the driver view (UK right-hand drive).
const T = THREE;

export function createMirrors(renderer) {
  // pos/look: camera position and target in car space (x right, y up, z backward from the car centre)
  // at: glass position relative to the driver's eye; rot: turn the glass towards the driver
  const defs = [
    { w: 512, h: 150, fov: 28, pos: [0, 1.3, 2.3], look: [0, 1.05, 40], size: [0.24, 0.068], at: [-1, 0.26, -0.95], rot: [-0.1, 0.3] },
    { w: 256, h: 190, fov: 36, pos: [-1.16, 1.05, -0.5], look: [-9, 0.9, 40], size: [0.2, 0.15], at: [-1, -0.17, -1.45], rot: [0, 0.62] },
    { w: 256, h: 190, fov: 36, pos: [1.16, 1.05, -0.5], look: [9, 0.9, 40], size: [0.17, 0.13], at: [1, -0.13, -1.0], rot: [0, -0.5] }
  ];
  const housing = new T.MeshLambertMaterial({ color: 0x1b1e21 });
  for (const d of defs) {
    d.rt = new T.WebGLRenderTarget(d.w, d.h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    d.cam = new T.PerspectiveCamera(d.fov, d.size[0] / d.size[1], 0.3, 420);
    const g = new T.PlaneGeometry(d.size[0], d.size[1]), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // mirror image
    d.glass = new T.Mesh(g, new T.MeshBasicMaterial({ map: d.rt.texture }));
    const box = new T.Mesh(new T.BoxGeometry(d.size[0] + 0.03, d.size[1] + 0.03, 0.035), housing); box.position.z = -0.02;
    d.group = new T.Group(); d.group.add(box, d.glass); d.group.rotation.set(d.rot[0], d.rot[1], 0, 'YXZ');
  }
  let frame = 0, enabled = true, mounted = null;
  const v = new T.Vector3(), q = new T.Vector3();
  const toWorld = (p, out, [lx, ly, lz]) => { const s = Math.sin(p.th), c = Math.cos(p.th); return out.set(p.x + c * lx + s * lz, ly, p.z - s * lx + c * lz); };

  // fix the mirrors to the cockpit; seatX is how far right of the car's centre the driver sits
  function mount(cockpit, seatX) {
    mounted = cockpit;
    for (const d of defs) {
      // x in `at` is a side: -1 = car's left edge/centre line, +1 = right door
      const x = d === defs[0] ? -seatX : d.at[0] < 0 ? -seatX - 1.0 : -seatX + 1.0;
      d.group.position.set(x, d.at[1], d.at[2]); cockpit.add(d.group);
    }
  }
  // render one mirror per frame (the rear-view one every other frame); only while the cockpit is showing
  function update(scene, player) {
    for (const d of defs) d.group.visible = enabled;
    if (!enabled || !mounted || !mounted.visible) return;
    frame++;
    const d = frame % 2 ? defs[0] : defs[1 + ((frame >> 1) % 2)];
    toWorld(player, v, d.pos); toWorld(player, q, d.look);
    d.cam.position.copy(v); d.cam.lookAt(q);
    const showCar = d !== defs[0], carVis = player.mesh.visible, auto = renderer.shadowMap.autoUpdate;
    mounted.visible = false; player.mesh.visible = showCar || carVis; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(d.rt); renderer.render(scene, d.cam); renderer.setRenderTarget(null);
    mounted.visible = true; player.mesh.visible = carVis; renderer.shadowMap.autoUpdate = auto;
  }
  return { mount, update, set enabled(b) { enabled = b; }, get enabled() { return enabled; } };
}
