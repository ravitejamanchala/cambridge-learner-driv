// Rear-view and wing mirrors. Each mirror renders the scene from its own camera into a small texture,
// which is drawn flipped left-to-right (like a real mirror) inside its frame on the HUD.
// The frames are DOM elements (#mirrorRear, #mirrorL, #mirrorR); their on-screen boxes place the images.
const T = THREE;

export function createMirrors(renderer) {
  const defs = [
    { id: 'mirrorRear', w: 384, h: 112, fov: 34, pos: [0, 1.28, 2.3], look: [0, 1.0, 40] },     // behind the rear bumper, looking back
    { id: 'mirrorL', w: 224, h: 144, fov: 40, pos: [-1.16, 1.05, -0.5], look: [-9, 0.9, 40] }, // left door, angled out
    { id: 'mirrorR', w: 224, h: 144, fov: 40, pos: [1.16, 1.05, -0.5], look: [9, 0.9, 40] }
  ];
  const hud = new T.Scene(), ortho = new T.OrthographicCamera(0, 1, 0, -1, -1, 1);
  for (const d of defs) {
    d.rt = new T.WebGLRenderTarget(d.w, d.h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    d.cam = new T.PerspectiveCamera(d.fov, d.w / d.h, 0.3, 420);
    const g = new T.PlaneGeometry(1, 1), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // mirror image
    d.quad = new T.Mesh(g, new T.MeshBasicMaterial({ map: d.rt.texture, depthTest: false, depthWrite: false }));
    hud.add(d.quad);
  }
  let frame = 0, enabled = true;
  const v = new T.Vector3(), q = new T.Vector3();
  // car-local (x right, y up, z backward) to world
  function toWorld(p, out, [lx, ly, lz]) {
    const s = Math.sin(p.th), c = Math.cos(p.th); // forward = (-s, -c), right = (c, -s)
    return out.set(p.x + c * lx + s * lz, ly, p.z - s * lx + c * lz);
  }
  function layout() {
    const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight, cr = renderer.domElement.getBoundingClientRect();
    ortho.left = 0; ortho.right = W; ortho.top = 0; ortho.bottom = -H; ortho.updateProjectionMatrix();
    for (const d of defs) {
      const el = document.getElementById(d.id), r = el && el.getBoundingClientRect();
      d.on = !!(r && r.width > 4 && el.offsetParent !== null);
      if (!d.on) continue;
      const inset = 3; // inside the frame border
      d.quad.position.set(r.left - cr.left + r.width / 2, -(r.top - cr.top + r.height / 2), 0);
      d.quad.scale.set(r.width - inset * 2, r.height - inset * 2, 1);
      d.cam.aspect = (r.width - inset * 2) / Math.max(1, r.height - inset * 2); d.cam.updateProjectionMatrix();
    }
  }
  // call before the main render; updates one mirror per frame (the rear one every other frame) to keep the cost down
  function update(scene, player) {
    if (!enabled) return;
    frame++;
    const d = frame % 2 ? defs[0] : defs[1 + ((frame >> 1) % 2)];
    if (!d.on) return;
    toWorld(player, v, d.pos); toWorld(player, q, d.look);
    d.cam.position.copy(v); d.cam.lookAt(q);
    const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(d.rt); renderer.render(scene, d.cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = auto;
  }
  // call after the main render
  function draw() {
    if (!enabled || !defs.some(d => d.on)) return;
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
    for (const d of defs) d.quad.visible = d.on;
    renderer.render(hud, ortho); renderer.autoClear = ac;
  }
  return { update, draw, layout, set enabled(b) { enabled = b; }, get enabled() { return enabled; } };
}
