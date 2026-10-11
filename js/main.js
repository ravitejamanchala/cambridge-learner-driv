// Wires the modules together: loads the map, builds the world, runs the loop, handles input and cameras.
import { DATA_URL, CAR, ROUTES, WORLD } from './config.js';
import { loadNet, buildRoute, snapWaypoint, along, nearest, laneCentre } from './net.js';
import { buildWorld } from './world.js';
import { createTraffic } from './traffic.js';
import { createPlayer, loadCarModel, makeBoxCar, makeBike } from './car.js';
import { createTest } from './test.js';
import { createUI, attachDrag } from './ui.js';
import { createHub } from './hub.js';
import { createScenario, evaluate } from './course.js';

const T = THREE, $ = id => document.getElementById(id);
const shadowed = (o) => { o.traverse(c => { if (c.isMesh) c.castShadow = true; }); return o; };
const stage = $('stage');
const setLoad = (msg) => { const el = $('loadMsg'); if (el) el.textContent = msg; };

async function boot() {
  if (!window.THREE) throw new Error('The 3D library did not load. Check your connection and reload.');
  setLoad('Loading Cambridge roads…');
  const net = await loadNet(DATA_URL);
  setLoad('Building the city…');
  await new Promise(r => setTimeout(r, 20));

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  stage.appendChild(renderer.domElement);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(58, 1, 0.3, WORLD.fogFar + 200);
  const traffic = createTraffic(net, scene, (c) => { const m = shadowed(makeBoxCar(c, false)); scene.add(m); return m; }, (i) => { const m = shadowed(makeBike(i)); scene.add(m); return m; });
  const world = buildWorld(scene, net, traffic);
  const player = createPlayer(scene); shadowed(player.mesh);
  const ui = createUI(net);

  // mock-test routes (built up front) and lesson routes (built on first use)
  const routes = ROUTES.map(R => { const nodes = R.waypoints.map(w => snapWaypoint(net, w)); return { R, nodes, route: buildRoute(net, nodes, { name: R.name }) }; });
  const lessonCache = new Map();
  const lessonPlan = (l) => { let c = lessonCache.get(l.id); if (!c) { const n = l.waypoints.map(w => snapWaypoint(net, w)); c = { nodes: n, route: buildRoute(net, n, { name: l.title }) }; lessonCache.set(l.id, c); } return c; };
  let route = routes[0].route, nodes = routes[0].nodes, plan = { kind: 'mock', index: 0 }, scenario = null;
  const test = createTest(net, traffic, player); test.setRoute(route, nodes);
  const startPos = () => { const st = route.steps[0]; const p = along(st.e, Math.min(8, st.e.len / 3), st.dir, laneCentre(st.e, st.dir, 0)); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); };
  // load a plan (lesson or mock route) without starting it: car moves to the start so the map previews it
  function loadPlan(pl) {
    plan = pl; if (scenario) { scenario.stop(); scenario = null; }
    const c = pl.kind === 'lesson' ? lessonPlan(pl.lesson) : routes[pl.index];
    route = buildRoute(net, c.nodes, { name: pl.kind === 'lesson' ? pl.lesson.title : c.R.name }); nodes = c.nodes;
    test.running = false; test.done = false; test.setRoute(route, nodes); test.wpIndex = 1; test.reset();
    startPos(); player.indicator = null; ui.renderSteps(route, 0); ui.renderFaults(test);
    $('testState').textContent = pl.kind === 'lesson' ? 'Lesson · not started' : 'Not started';
    world.updateChunks(player.x, player.z, 4);
  }
  const hub = createHub({ routes, lessonRoute: (l) => lessonPlan(l).route, onPick: loadPlan, onStart: (pl) => { loadPlan(pl); begin(); } });
  startPos();
  traffic.init(player.x, player.z, WORLD.npcColours);
  world.updateChunks(player.x, player.z, 99);
  ui.renderSteps(route, 0); ui.renderFaults(test);
  $('loadOv').hidden = true; hub.open();

  loadCarModel(CAR.url).then(m => { player.setModel(shadowed(m)); }).catch(err => console.warn('Car model did not load; using the placeholder car.', err));

  // input
  const key = { up: 0, down: 0, left: 0, right: 0 }, tch = { up: 0, down: 0, left: 0, right: 0 };
  let cam = 0; const CAMS = ['Chase view', 'Driver view', 'Overhead'];
  const KM = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const sigBtns = () => document.querySelectorAll('[data-sig]').forEach(b => b.classList.toggle('sig-on', b.dataset.sig === player.indicator));
  const setCam = (c) => { cam = c; $('camBtn').textContent = 'View: ' + CAMS[cam]; };
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const k = KM[e.code];
    if (k) { key[k] = 1; if (test.running) e.preventDefault(); }
    else if (e.code === 'KeyQ') { player.signal('L'); sigBtns(); } else if (e.code === 'KeyE') { player.signal('R'); sigBtns(); }
    else if (e.code === 'KeyC') setCam((cam + 1) % 3);
    else if (e.code === 'Space' && test.running) e.preventDefault();
  });
  window.addEventListener('keyup', e => { const k = KM[e.code]; if (k) key[k] = 0; });
  window.addEventListener('blur', () => { for (const k in key) key[k] = 0; });
  document.querySelectorAll('[data-k]').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); tch[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { tch[k] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault());
  });
  document.querySelectorAll('[data-sig]').forEach(b => b.addEventListener('click', () => { player.signal(b.dataset.sig); sigBtns(); }));
  // Hook for future input devices (e.g. a USB steering wheel via the Gamepad API): return {throttle, brake, steer} or null.
  const extraInputs = [];
  window.cambridgeDrive = { addInput: (fn) => extraInputs.push(fn), net, test, player, traffic, CAR };
  function readInput() {
    for (const fn of extraInputs) { const r = fn(); if (r) return r; }
    return { throttle: key.up || tch.up ? 1 : 0, brake: key.down || tch.down ? 1 : 0, steer: (key.left || tch.left ? 1 : 0) - (key.right || tch.right ? 1 : 0) };
  }

  // test flow
  const banner = (text, kind) => { const el = $('banner'); el.hidden = !text; if (text) { el.textContent = text; el.className = 'banner ' + (kind || ''); } };
  test.onFault = () => ui.renderFaults(test);
  test.onFinish = () => {
    if (scenario) scenario.stop();
    $('rD').textContent = test.D; $('rS').textContent = test.S;
    const v = $('verdict'), reasons = $('rReasons'), next = $('nextBtn');
    if (plan.kind === 'lesson') {
      const res = evaluate(plan.lesson, test, scenario);
      hub.Profiles.recordLesson(plan.lesson.id, { pass: res.pass, D: test.D, S: test.S });
      $('endTag').textContent = 'Lesson complete';
      v.textContent = res.pass ? 'Lesson passed' : 'Not yet'; v.className = 'verdict ' + (res.pass ? 'pass' : 'fail');
      $('rNote').textContent = plan.lesson.title;
      reasons.innerHTML = res.reasons.map(r => `<li>${r}</li>`).join('');
      const nl = hub.nextLesson(plan.lesson.id); next.hidden = !(res.pass && nl); if (nl) next.dataset.l = nl.id;
      $('testState').textContent = res.pass ? 'Lesson passed' : 'Lesson not passed';
    } else {
      const pass = test.passed();
      hub.Profiles.recordMock(routes[plan.index].R.id, { pass, D: test.D, S: test.S });
      $('endTag').textContent = 'Mock test complete';
      v.textContent = pass ? 'Pass. Well driven.' : 'Not this time'; v.className = 'verdict ' + (pass ? 'pass' : 'fail');
      $('rNote').textContent = pass ? (test.D ? `You picked up ${test.D} driving fault${test.D > 1 ? 's' : ''}. The marking sheet shows where.` : 'A clean drive with no faults recorded.')
        : (test.S ? `${test.S} serious fault${test.S > 1 ? 's' : ''} means a fail. The marking sheet shows what to work on.` : 'More than 15 driving faults means a fail. The marking sheet shows what to work on.');
      reasons.innerHTML = ''; next.hidden = true;
      $('testState').textContent = pass ? 'Passed' : 'Failed';
    }
    $('endOv').hidden = false;
  };
  function begin() {
    loadPlan(plan);
    if (plan.kind === 'lesson') scenario = createScenario(plan.lesson, { net, traffic, test, player, ui: { banner } });
    sigBtns(); test.running = true; banner(null);
    $('testState').textContent = plan.kind === 'lesson' ? 'Lesson · ' + plan.lesson.title : 'In progress';
    $('startOv').hidden = true; $('endOv').hidden = true; lastStep = -1;
  }
  $('routeBtn').addEventListener('click', () => { test.running = false; if (scenario) { scenario.stop(); scenario = null; } banner(null); hub.open(); });
  $('hubBtn').addEventListener('click', () => { banner(null); hub.open(); });
  $('nextBtn').addEventListener('click', () => { hub.selectLesson($('nextBtn').dataset.l); hub.open(); });
  $('againBtn').addEventListener('click', begin); $('restartBtn').addEventListener('click', begin);
  $('camBtn').addEventListener('click', () => setCam((cam + 1) % 3)); setCam(0);
  $('backBtn').addEventListener('click', () => {
    const r = test.route, i = Math.max(0, test.step - 1), s = test.step > 0 ? r.instructions[i].s + 10 : 8;
    let best = 0; for (let k = 0; k < r.cum.length; k++) if (r.cum[k] <= s) best = k;
    const a = best, b = Math.min(r.xs.length - 1, best + 1), tx = r.xs[b] - r.xs[a], tz = r.zs[b] - r.zs[a], L = Math.hypot(tx, tz) || 1;
    player.place(r.xs[a] + tz / L * 2, r.zs[a] - tx / L * 2, Math.atan2(-tx / L, -tz / L)); test.idx = a; test.stopPrev.clear();
  });

  // driver's-seat cockpit, attached to the camera (UK right-hand drive: dashboard centre is to the driver's left)
  const cockpit = new T.Group(); scene.add(camera); camera.add(cockpit); cockpit.visible = false;
  const dashM = new T.MeshLambertMaterial({ color: 0x1d2124 }), trimM = new T.MeshLambertMaterial({ color: 0x2b3135 });
  const bonnet = new T.Mesh(new T.BoxGeometry(1.9, 0.06, 1.7), new T.MeshLambertMaterial({ color: 0x1d6a46 })); bonnet.position.set(-CAR.seat.x, -0.66, -1.95); bonnet.rotation.x = 0.06; cockpit.add(bonnet);
  const dash = new T.Mesh(new T.BoxGeometry(2.3, 0.26, 0.55), dashM); dash.position.set(-CAR.seat.x, -0.52, -0.92); cockpit.add(dash);
  const binn = new T.Mesh(new T.BoxGeometry(0.42, 0.12, 0.2), trimM); binn.position.set(0, -0.36, -0.78); cockpit.add(binn);
  const wheel = new T.Mesh(new T.TorusGeometry(0.19, 0.024, 8, 28), trimM); wheel.position.set(0, -0.44, -0.56); wheel.rotation.x = -0.35; cockpit.add(wheel);
  const spoke = new T.Mesh(new T.BoxGeometry(0.36, 0.035, 0.02), trimM); wheel.add(spoke);
  const mirror = new T.Mesh(new T.BoxGeometry(0.26, 0.07, 0.03), trimM); mirror.position.set(-CAR.seat.x, 0.27, -0.72); cockpit.add(mirror);
  for (const sx of [-1, 1]) { const pil = new T.Mesh(new T.BoxGeometry(0.045, 1.0, 0.045), dashM); pil.position.set(-CAR.seat.x + sx * 0.86, 0.1, -1.1); pil.rotation.z = -sx * 0.3; pil.rotation.x = -0.5; cockpit.add(pil); }

  // overhead view: drag to pan, wheel or pinch to zoom
  const ov = { px: 0, pz: 0, h: 95 };
  const ovPanned = () => Math.hypot(ov.px, ov.pz) > 3 || Math.abs(ov.h - 95) > 5;
  const showCamRecentre = () => { $('camRecentre').hidden = !(cam === 2 && ovPanned()); };
  attachDrag(renderer.domElement, (dx, dy) => {
    if (cam !== 2) return;
    const mpp = 2 * Math.hypot(ov.h, ov.h * 0.38) * Math.tan(camera.fov * Math.PI / 360) / (stage.clientHeight || 1);
    ov.px -= dx * mpp; ov.pz -= dy * mpp; showCamRecentre();
  }, (f) => { if (cam !== 2) return; ov.h = Math.min(380, Math.max(25, ov.h / f)); showCamRecentre(); });
  $('camRecentre').addEventListener('click', () => { ov.px = ov.pz = 0; ov.h = 95; showCamRecentre(); });

  // camera
  const camPos = new T.Vector3(), camLook = new T.Vector3(); let camInit = false, farMode = -1;
  function updateCamera(dt) {
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), rx = -fz, rz = fx; let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-dt * 4.2);
    if (cam === 0) { px = player.x - fx * 9.2; py = 4.1; pz = player.z - fz * 9.2; lx = player.x + fx * 7; ly = 1.2; lz = player.z + fz * 7; }
    else if (cam === 1) { const s = CAR.seat; px = player.x + rx * s.x + fx * -s.z; py = s.y; pz = player.z + rz * s.x + fz * -s.z; lx = px + fx * 20; ly = 0.9; lz = pz + fz * 20; k = 1; }
    else { lx = player.x + ov.px; ly = 0; lz = player.z + ov.pz; px = lx; py = ov.h; pz = lz + ov.h * 0.38; k = 1 - Math.exp(-dt * 12); }
    const mode = cam === 2 ? Math.round(ov.h / 20) : -1;
    if (mode !== farMode) {
      farMode = mode; const extra = cam === 2 ? ov.h : 0;
      scene.fog.near = WORLD.fogNear + extra; scene.fog.far = WORLD.fogFar + extra; camera.far = WORLD.fogFar + 200 + extra; camera.updateProjectionMatrix();
    }
    showCamRecentre();
    cockpit.visible = cam === 1; player.mesh.visible = cam !== 1; wheel.rotation.z = player.steer * 1.8;
    if (!camInit) { camPos.set(px, py, pz); camLook.set(lx, ly, lz); camInit = true; }
    camPos.lerp(new T.Vector3(px, py, pz), k); camLook.lerp(new T.Vector3(lx, ly, lz), k);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(stage); resize();

  let last = performance.now(), uiT = 0, mapT = 0, sigT = 0, chunkT = 0, lastStep = -1;
  function tick(dt) {
    traffic.update(dt, player);
    if (test.running && scenario) scenario.update(dt, traffic.clock);
    if (test.running) {
      const nr = nearest(net, player.x, player.z);
      player.update(dt, readInput(), nr && nr.d > nr.way.w / 2 + 2.6 ? 'off' : 'road');
      test.update(dt);
    }
  }
  // test hook: advance the simulation without rendering
  window.cambridgeDrive.step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) tick(dt); };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    traffic.update(dt, player);
    if (test.running && scenario) scenario.update(dt, traffic.clock);
    if (test.running) {
      const nr = nearest(net, player.x, player.z);
      player.update(dt, readInput(), nr && nr.d > nr.way.w / 2 + 2.6 ? 'off' : 'road');
      test.update(dt);
      test.nearZebra = net.zebras.some(z => Math.abs(z.x - player.x) < 70 && Math.abs(z.z - player.z) < 70);
      test.nearLights = test.ctx && net.stopsByEdge.has(test.ctx.e.id);
    }
    player.sync(traffic.clock);
    $('sigL').classList.toggle('on', player.indicator === 'L' && Math.floor(traffic.clock * 3) % 2 === 0);
    $('sigR').classList.toggle('on', player.indicator === 'R' && Math.floor(traffic.clock * 3) % 2 === 0);
    sigT += dt; if (sigT > 0.15) { sigT = 0; world.updateSignals(traffic.clock); }
    chunkT += dt; if (chunkT > 0.25) { chunkT = 0; const o = cam === 2; world.updateChunks(player.x + (o ? ov.px : 0), player.z + (o ? ov.pz : 0), o ? 2 : 1); }
    updateCamera(dt); world.updateSun(cam === 2 ? player.x + ov.px : player.x, cam === 2 ? player.z + ov.pz : player.z); renderer.render(scene, camera);
    uiT += dt; if (uiT > 0.1) { uiT = 0; ui.hud(player, test, test.running); if (test.step !== lastStep || test.route !== lastRoute) { lastStep = test.step; lastRoute = test.route; ui.renderSteps(test.route, test.step); } }
    mapT += dt; if (mapT > 0.05) { mapT = 0; ui.drawMap(player, test.route, test.step, traffic.clock); }
    requestAnimationFrame(frame);
  }
  let lastRoute = null;
  requestAnimationFrame(frame);
}

boot().catch(err => { console.error(err); setLoad(err.message || 'Something went wrong while loading.'); const b = $('loadErr'); if (b) b.hidden = false; });
