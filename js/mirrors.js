// Mirrors inside the car: a rear-view mirror at the top of the windscreen and a door mirror on each side.
// Each renders the scene from its own camera into a texture shown on the glass, flipped like a real mirror.
// They are fixed to the driver's-seat cockpit, so you see them in the driver view (UK right-hand drive).
const T = THREE;

export function createMirrors(renderer) {
  // pos/look: camera position and target in car space (x right, y up, z backward from the car centre)
  // at: glass position relative to the driver's eye; rot: turn the glass towards the driver
  const defs = [
    { w: 640, h: 200, fov: 28, pos: [0, 1.3, 2.3], look: [0, 1.05, 40], size: [0.432, 0.135], at: [-1, 0.31, -0.95], rot: [0.3, 0.3] },
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
    d.group.userData.interiorRearMirror = d === defs[0];
  }
  let frame = 0, enabled = true, mounted = null, chase = null, lowPower=false;
  const v = new T.Vector3(), q = new T.Vector3();
  const toWorld = (p, out, [lx, ly, lz]) => { const s = Math.sin(p.th), c = Math.cos(p.th); return out.set(p.x + c * lx + s * lz, ly, p.z - s * lx + c * lz); };

  // fix the mirrors to the cockpit; seatX is how far right of the car's centre the driver sits
  let seatAt = 0;
  function mount(cockpit, seatX) {
    mounted = cockpit; seatAt = seatX;
    for (const d of defs) {
      // x in `at` is a side: -1 = car's left edge/centre line, +1 = right door
      const x = d === defs[0] ? -seatX : d.at[0] < 0 ? -seatX - 1.0 : -seatX + 1.0;
      d.group.position.set(x, d.at[1], d.at[2]); cockpit.add(d.group);
    }
  }
  // The chase view gets the rear-view mirror too, as a panel in the top corner: looking behind matters
  // just as much from outside the car, and it is the same camera and the same render target as the one
  // on the windscreen, so it costs no extra draw. It hangs off the camera, so it stays in the corner.
  function mountChase(camera) {
    const d = defs[0], g = new T.PlaneGeometry(1, 1), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // mirror image, as on the glass
    const surround = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x15181b, depthTest: false }));
    const glass = new T.Mesh(g, new T.MeshBasicMaterial({ map: d.rt.texture, depthTest: false }));
    surround.position.z = -0.002; surround.renderOrder = 10; glass.renderOrder = 11;
    chase = new T.Group(); chase.userData.chaseMirror = true; chase.add(surround, glass); chase.visible = false; camera.add(chase);
  }
  // Where it hangs: top centre, just under the instruction box, which is where an interior mirror
  // actually sits. The corner is taken by the speedometer and the look buttons on every screen size,
  // and the top left by the map. The panel is on a plane one unit in front of the camera, so its size
  // comes from the camera's own field of view: a fraction of the view, not a number of pixels.
  // Placed from the interface's own measurements, in pixels, rather than from a guessed fraction of
  // the view: `below` is where the instruction box ends, and `left`/`right` are the inside edges of
  // the map and the speedometer cluster. The panel hangs just under the box and is never wider than
  // the gap between those two. A fixed fraction put it straight through the speedometer on a phone
  // held sideways, where the same controls take a far taller share of the screen.
  const PANEL = { wide: 0.3, tall: 0.46, gap: 8, least: 120 };
  function layoutChase(camera, show, box = null) {
    if (!chase) return;
    chase.visible = !!show && enabled;
    if (!chase.visible || !box || !box.viewW || !box.viewH) return;
    const halfH = Math.tan(camera.fov * Math.PI / 360), unit = 2 * halfH / box.viewH; // world units per pixel
    const room = Math.max(PANEL.least, box.right - box.left - 16);
    const w = Math.min(room, box.viewW * (camera.aspect >= 1 ? PANEL.wide : PANEL.tall));
    const h = w * defs[0].h / defs[0].w, cx = (box.left + box.right) / 2, top = box.below + PANEL.gap;
    chase.children[1].scale.set(w * unit, h * unit, 1);
    chase.children[0].scale.set((w + 6) * unit, (h + 6) * unit, 1);
    chase.position.set((cx - box.viewW / 2) * unit, (box.viewH / 2 - (top + h / 2)) * unit, -1);
  }
  // On a phone held upright the view is so narrow that the rear-view mirror sits off the left edge
  // entirely — and that is the mirror the whole blue-light exercise depends on. It is drawn in towards
  // the middle until it fits, rather than being left where a wide screen would put it.
  function fitView(camera) {
    if (!mounted) return;
    const d = defs[0], z = Math.abs(d.at[2]);
    const halfWidth = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * z;
    // Keep the larger housing in the windscreen, including narrow portrait views.
    const compact = window.innerWidth < 600 || window.innerHeight < 500;
    const scale = Math.min(compact ? 0.88 : 1, halfWidth * 1.7 / (d.size[0] + 0.03));
    d.group.scale.setScalar(scale);
    const room = Math.max(0, halfWidth - (d.size[0] / 2 + 0.025) * scale);
    d.group.position.x = -Math.min(seatAt, room * 0.9);
    d.group.position.y = compact ? 0.21 : d.at[1];
    // The glass faces the driver's eye below and to the right of the mirror.
    // Recompute both angles after fitting, so portrait mode does not leave it skewed.
    d.group.rotation.set(Math.atan2(d.group.position.y, Math.hypot(d.group.position.x, z)), Math.atan2(-d.group.position.x, z), 0, 'YXZ');
  }
  // render one mirror per frame (the rear-view one every other frame); the glass on the windscreen
  // while the cockpit is showing, the corner panel while the chase view is
  function update(scene, player, mode = 'cockpit') {
    for (const d of defs) d.group.visible = enabled && mode === 'cockpit';
    if (!enabled) return;
    frame++;
    if(lowPower&&frame%2===0)return;
    if (mode === 'chase') { if (chase?.visible && frame % 2) draw(defs[0], scene, player); return; }
    if (!mounted || !mounted.visible) return;
    const cycle=lowPower?Math.ceil(frame/2):frame;
    draw(cycle % 2 ? defs[0] : defs[1 + ((cycle >> 1) % 2)], scene, player);
  }
  function draw(d, scene, player) {
    toWorld(player, v, d.pos); toWorld(player, q, d.look);
    d.cam.position.copy(v); d.cam.lookAt(q);
    // The door mirrors show the car's own flank; the rear-view one looks back past it, so the car
    // itself is left out of that render whichever view asked for it.
    const carVis = player.mesh.visible, auto = renderer.shadowMap.autoUpdate;
    const hid = [mounted, chase].filter(Boolean).map(o => [o, o.visible]);
    for (const [o] of hid) o.visible = false;
    player.mesh.visible = d !== defs[0]; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(d.rt); renderer.render(scene, d.cam); renderer.setRenderTarget(null);
    for (const [o, was] of hid) o.visible = was;
    player.mesh.visible = carVis; renderer.shadowMap.autoUpdate = auto;
  }
  function quality(low){if(lowPower===low)return;lowPower=low;for(const d of defs)d.rt.setSize(Math.round(d.w*(low?.5:1)),Math.round(d.h*(low?.5:1)));}
  return { mount, mountChase, layoutChase, fitView, update, quality, set enabled(b) { enabled = b; }, get enabled() { return enabled; } };
}
