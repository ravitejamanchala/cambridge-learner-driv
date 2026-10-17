// Wires the modules together: loads the map area for the chosen drive, builds the world, runs the loop,
// handles input, cameras, mirrors and the route guide.
import { CAR, ROUTES, WORLD, HANDLING, AREAS_URL } from './config.js';
import { buildNet, buildRoute, snapWaypoint, along, nearest, laneCentre, ll2xz } from './net.js';
import { buildWorld } from './world.js';
import { kitResources } from './city.js';
import { createTraffic } from './traffic.js';
import { createPlayer, loadCarModel, makeBoxCar, makeBike } from './car.js';
import { createTest } from './test.js';
import { createUI, attachDrag } from './ui.js';
import { createHub } from './hub.js';
import { createScenario, evaluate } from './course.js';
import { createMirrors } from './mirrors.js';
import { createGuide } from './guide.js';
import { STAR } from './icons.js';

const T = THREE, $ = id => document.getElementById(id);
const shadowed = (o) => { o.traverse(c => { if (c.isMesh) c.castShadow = true; }); return o; };
const stage = $('stage');
const setLoad = (msg) => { const el = $('loadMsg'); if (el) el.textContent = msg; };

async function boot() {
  if (!window.THREE) throw new Error('The 3D library did not load. Check your connection and reload.');
  setLoad('Loading…');
  const ix = await fetch(AREAS_URL + 'index.json'); if (!ix.ok) throw new Error('Map index did not load (' + ix.status + ')');
  const index = await ix.json();
  const meta = (key) => index.plans[key] || { len: 0, n: 0, first: '' };

  let camInit = false, paused = false;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  stage.appendChild(renderer.domElement);
  let scene = new T.Scene();
  const camera = new T.PerspectiveCamera(58, 1, 0.3, WORLD.fogFar + 200);
  const player = createPlayer(scene); shadowed(player.mesh);
  const ui = createUI(null), guide = createGuide(), mirrors = createMirrors(renderer);

  // ---------- map areas: each drive loads only its part of the city ----------
  // vehicle meshes are pooled and reused across areas
  const carPool = [], bikePool = []; let carI = 0, bikeI = 0;
  const makeCar = (c) => { let m = carPool[carI]; if (!m) carPool.push(m = shadowed(makeBoxCar(c, false))); carI++; scene.add(m); return m; };
  const makeBk = (i) => { let m = bikePool[bikeI]; if (!m) bikePool.push(m = shadowed(makeBike(i))); bikeI++; scene.add(m); return m; };
  const A = { id: null, net: null, traffic: null, world: null, test: null, trafficInit: false };
  let areaChain = Promise.resolve(), shadowsOn = true;
  const areaOf = (pl) => meta(pl.key).area;
  function disposeScene(old) {
    const keep = new Set(kitResources());
    const mark = (o) => o.traverse(c => { if (c.geometry) keep.add(c.geometry); for (const m of [].concat(c.material || [])) { keep.add(m); if (m.map) keep.add(m.map); } });
    [player.mesh, camera, guide.group, ...carPool, ...bikePool].forEach(mark);
    old.traverse(c => {
      if (c.geometry && !keep.has(c.geometry)) c.geometry.dispose();
      for (const m of [].concat(c.material || [])) { if (keep.has(m)) continue; if (m.map && !keep.has(m.map)) m.map.dispose(); m.dispose(); }
    });
  }
  function useArea(id) {
    areaChain = areaChain.then(async () => {
      if (A.id === id) return;
      const info = index.areas.find(a => a.id === id); if (!info) throw new Error('Unknown map area ' + id);
      $('areaLoad').hidden = false;
      const r = await fetch(AREAS_URL + info.file); if (!r.ok) throw new Error('Map area did not load (' + r.status + ')');
      const d = await r.json();
      await new Promise(res => setTimeout(res, 16));
      if (A.test) A.test.running = false;
      const old = scene; scene = new T.Scene(); scene.add(camera, player.mesh, guide.group); carI = bikeI = 0;
      const net = buildNet(d);
      const traffic = createTraffic(net, scene, makeCar, makeBk);
      const world = buildWorld(scene, net, traffic); world.setShadows(shadowsOn);
      const test = createTest(net, traffic, player);
      test.onFault = () => ui.renderFaults(test); test.onFinish = onFinish;
      Object.assign(A, { id, net, traffic, world, test, trafficInit: false });
      ui.setNet(net); disposeScene(old); farMode = -2;
      $('areaLoad').hidden = true;
    }).catch(err => { console.error(err); const el = $('areaLoad'); el.textContent = 'Map did not load. Reload to try again.'; el.hidden = false; });
    return areaChain;
  }

  // ---------- drives ----------
  let route = null, nodes = null, plan = null, scenario = null;
  const startPos = () => { const st = route.steps[0]; const p = along(st.e, Math.min(8, st.e.len / 3), st.dir, laneCentre(st.e, st.dir, 0)); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); };
  // examiner callouts for places the route builder can't describe (e.g. a one-way gyratory)
  function addCallouts(r, list) {
    for (const c of list) {
      const p = ll2xz(A.net, c.lat, c.lon); let bi = 0, bd = Infinity;
      for (let i = 0; i < r.xs.length; i++) { const dd = (r.xs[i] - p.x) ** 2 + (r.zs[i] - p.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      r.instructions.push({ s: r.cum[bi], kind: 'straight', icon: c.icon || (c.signal === 'L' ? 'left' : c.signal === 'R' ? 'right' : 'straight'), text: c.text, short: c.short, signal: c.signal || null, road: c.road || '', callout: true });
    }
    r.instructions.sort((a, b) => (a.final ? 1 : 0) - (b.final ? 1 : 0) || a.s - b.s);
  }
  // load a plan (lesson, puzzle or mock route) in the current area without starting it: the car moves to the start
  function loadPlan(pl) {
    plan = pl; if (scenario) { scenario.stop(); scenario = null; }
    const wps = pl.kind === 'mock' ? ROUTES[pl.index].waypoints : pl.lesson.waypoints;
    nodes = wps.map(w => snapWaypoint(A.net, w));
    route = buildRoute(A.net, nodes, { name: pl.kind === 'mock' ? ROUTES[pl.index].name : pl.lesson.title });
    if (pl.lesson && pl.lesson.callouts) addCallouts(route, pl.lesson.callouts);
    const test = A.test;
    test.running = false; test.done = false; test.setRoute(route, nodes); test.wpIndex = 1; test.reset();
    startPos(); camInit = false; player.indicator = null;
    if (!A.trafficInit) { A.traffic.init(player.x, player.z, WORLD.npcColours); A.trafficInit = true; }
    ui.renderSteps(route, 0); ui.renderFaults(test);
    $('testState').textContent = pl.kind === 'mock' ? 'Not started' : (pl.kind === 'puzzle' ? 'Puzzle' : 'Lesson') + ' · not started';
    A.world.updateChunks(player.x, player.z, 4);
  }
  let pickTok = 0;
  async function pickPlan(pl, start) {
    if (pl.lesson && pl.lesson.questions) { // theory quiz: no driving, no map
      if (start) { if (A.test) A.test.running = false; paused = false; $('pauseSheet').hidden = true; $('resultSheet').hidden = true; banner(null); setMode('lobby'); hub.startQuiz(pl.lesson); }
      return;
    }
    const tok = ++pickTok; await useArea(areaOf(pl));
    if (tok !== pickTok || !A.net) return;
    loadPlan(pl); if (start) begin();
  }
  const hub = createHub({ meta, onPick: (pl) => pickPlan(pl, false), onStart: (pl) => pickPlan(pl, true) });
  const setMode = (m) => { document.body.dataset.mode = m; camInit = false; layoutSoon(); };
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('cambridge-learner-drive.prefs') || '{}'); } catch (_) { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem('cambridge-learner-drive.prefs', JSON.stringify(prefs)); } catch (_) {} };

  loadCarModel(CAR.url).then(m => { player.setModel(shadowed(m)); }).catch(err => console.warn('Car model did not load; using the placeholder car.', err));

  // ---------- input ----------
  const key = { up: 0, down: 0, left: 0, right: 0 }, tch = { up: 0, down: 0, left: 0, right: 0 };
  let cam = 0; const CAMS = ['Chase view', 'Driver view', 'Overhead'];
  const KM = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const sigBtns = () => document.querySelectorAll('[data-sig]').forEach(b => b.classList.toggle('sig-on', b.dataset.sig === player.indicator));
  const setCam = (c, save) => {
    cam = c; $('camBtn').textContent = 'View: ' + CAMS[cam];
    document.querySelectorAll('#camSeg [data-cam]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.cam === cam));
    document.body.classList.toggle('cam-over', cam === 2); layoutSoon();
    if (save) { prefs.cam = cam; savePrefs(); }
  };
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Escape') { if (hub.anyOpen()) hub.closeSheets(); else if (document.body.dataset.mode === 'drive' && $('resultSheet').hidden) paused ? resume() : pause(); return; }
    if (document.body.dataset.mode !== 'drive') return;
    const k = KM[e.code];
    if (k) { key[k] = 1; if (A.test && A.test.running) e.preventDefault(); }
    else if (e.code === 'KeyQ') { player.signal('L'); sigBtns(); } else if (e.code === 'KeyE') { player.signal('R'); sigBtns(); }
    else if (e.code === 'KeyC') setCam((cam + 1) % 3, true);
    else if (e.code === 'Space' && A.test && A.test.running) e.preventDefault();
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
  window.cambridgeDrive = { addInput: (fn) => extraInputs.push(fn), get net() { return A.net; }, get test() { return A.test; }, player, get traffic() { return A.traffic; }, CAR, get area() { return A.id; }, ready: () => areaChain };
  function readInput() {
    for (const fn of extraInputs) { const r = fn(); if (r) return r; }
    return { throttle: key.up || tch.up ? 1 : 0, brake: key.down || tch.down ? 1 : 0, steer: (key.left || tch.left ? 1 : 0) - (key.right || tch.right ? 1 : 0) };
  }

  // ---------- drive flow ----------
  const banner = (text, kind) => { const el = $('banner'); el.hidden = !text; if (text) { el.textContent = text; el.className = 'banner ' + (kind || ''); } };
  // "Practise next": the categories this learner keeps losing marks on, and how the last few
  // mocks on this route have gone. Both read results already stored on the profile.
  function renderPractise(routeId) {
    const el = $('rPractise'), P = hub.Profiles;
    const weak = P.weakAreas(routeId), trend = routeId ? P.trend(routeId) : [];
    if (!weak.length && trend.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    const esc = t => String(t).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const max = Math.max(1, ...trend.map(t => t.D));
    el.innerHTML =
      (weak.length ? `<h4>Practise next</h4><ol>${weak.map(w =>
        `<li><span class="cat">${esc(w.cat)}</span><span class="n${w.S ? ' s' : ''}">${w.n}\u00d7</span></li>`).join('')}</ol>` : '') +
      (trend.length > 1 ? `<h4>Last ${trend.length} mocks here</h4><div class="trend" aria-label="Driving faults per attempt, oldest first">${trend.map(t =>
        `<i class="${t.pass ? '' : 'f'}" style="height:${Math.round(100 * t.D / max)}%" title="${t.D} driving, ${t.S} serious"></i>`).join('')}</div>` : '');
    el.hidden = false;
  }
  function onFinish() {
    const test = A.test; if (scenario) scenario.stop();
    $('rD').textContent = test.D; $('rS').textContent = test.S;
    const v = $('verdict'), reasons = $('rReasons'), next = $('nextBtn');
    if (plan.kind !== 'mock') {
      const res = evaluate(plan.lesson, test, scenario), pz = plan.kind === 'puzzle';
      hub.Profiles.recordLesson(plan.lesson.id, { pass: res.pass, D: test.D, S: test.S, faults: test.faults });
      $('endTag').textContent = pz ? 'Puzzle complete' : 'Lesson complete';
      v.textContent = res.pass ? (pz ? 'Solved' : 'Lesson passed') : 'Not yet'; v.className = 'verdict ' + (res.pass ? 'pass' : 'fail');
      const n = res.pass ? (test.D === 0 ? 3 : test.D <= 1 ? 2 : 1) : 0;
      $('rNote').innerHTML = (pz ? `<span class="stars big" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => STAR(i <= n)).join('')}</span>` : '') + plan.lesson.title.replace(/[<>&]/g, '');
      reasons.innerHTML = res.reasons.map(r => `<li>${r}</li>`).join('');
      const nx = res.pass ? hub.next(plan) : null; next.hidden = !nx;
      if (nx) { next.dataset.kind = nx.kind; next.dataset.id = nx.id; next.textContent = nx.kind === 'puzzle' ? 'Next puzzle' : 'Next lesson'; }
      $('testState').textContent = res.pass ? (pz ? 'Puzzle solved' : 'Lesson passed') : 'Not passed yet';
    } else {
      const pass = test.passed();
      hub.Profiles.recordMock(ROUTES[plan.index].id, { pass, D: test.D, S: test.S, faults: test.faults });
      $('endTag').textContent = 'Mock test complete';
      v.textContent = pass ? 'Pass. Well driven.' : 'Not this time'; v.className = 'verdict ' + (pass ? 'pass' : 'fail');
      $('rNote').textContent = pass ? (test.D ? `You picked up ${test.D} driving fault${test.D > 1 ? 's' : ''}. The marking sheet shows where.` : 'A clean drive with no faults recorded.')
        : (test.S ? `${test.S} serious fault${test.S > 1 ? 's' : ''} means a fail. The marking sheet shows what to work on.` : 'More than 15 driving faults means a fail. The marking sheet shows what to work on.');
      reasons.innerHTML = ''; next.hidden = true;
      $('testState').textContent = pass ? 'Passed' : 'Failed';
    }
    renderPractise(plan.kind === 'mock' ? ROUTES[plan.index].id : null);
    $('resultSheet').hidden = false; hub.render();
  }
  function pause() { if (!A.test || !A.test.running) return; paused = true; A.test.running = false; for (const k in key) key[k] = 0; $('pauseSheet').hidden = false; }
  function resume() { if (!paused) return; paused = false; A.test.running = true; $('pauseSheet').hidden = true; }
  function toLobby() {
    if (A.test) A.test.running = false; paused = false; if (scenario) { scenario.stop(); scenario = null; } banner(null);
    $('pauseSheet').hidden = true; $('resultSheet').hidden = true; setMode('lobby'); hub.open();
  }
  function begin() {
    paused = false; $('pauseSheet').hidden = true; $('resultSheet').hidden = true; hub.closeSheets(); setMode('drive');
    loadPlan(plan);
    if (plan.kind !== 'mock') scenario = createScenario(plan.lesson, { net: A.net, traffic: A.traffic, test: A.test, player, ui: { banner } });
    sigBtns(); A.test.running = true; banner(null);
    $('testState').textContent = plan.kind === 'mock' ? 'In progress' : (plan.kind === 'puzzle' ? 'Puzzle · ' : 'Lesson · ') + plan.lesson.title;
    lastStep = -1;
  }
  $('pauseBtn').addEventListener('click', pause);
  $('resumeBtn').addEventListener('click', resume); $('resumeX').addEventListener('click', resume);
  $('quitBtn').addEventListener('click', toLobby); $('hubBtn').addEventListener('click', toLobby);
  $('nextBtn').addEventListener('click', () => { const b = $('nextBtn'); pickPlan(hub.select(b.dataset.kind, b.dataset.id), true); });
  $('againBtn').addEventListener('click', begin); $('restartBtn').addEventListener('click', begin);
  $('camBtn').addEventListener('click', () => setCam((cam + 1) % 3, true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('backBtn').addEventListener('click', () => {
    const test = A.test, r = test.route, i = Math.max(0, test.step - 1), s = test.step > 0 ? r.instructions[i].s + 10 : 8;
    let best = 0; for (let k = 0; k < r.cum.length; k++) if (r.cum[k] <= s) best = k;
    const a = best, b = Math.min(r.xs.length - 1, best + 1), tx = r.xs[b] - r.xs[a], tz = r.zs[b] - r.zs[a], L = Math.hypot(tx, tz) || 1;
    player.place(r.xs[a] + tz / L * 2, r.zs[a] - tx / L * 2, Math.atan2(-tx / L, -tz / L)); test.idx = a; test.stopPrev.clear();
  });

  // ---------- settings (saved in this browser) ----------
  const seg = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', b.dataset[attr] === String(val)));
  const sens = $('steerSens');
  if (prefs.sens) HANDLING.steerSensitivity = prefs.sens;
  sens.value = HANDLING.steerSensitivity;
  sens.addEventListener('input', () => { HANDLING.steerSensitivity = +sens.value; prefs.sens = +sens.value; savePrefs(); });
  document.querySelectorAll('#camSeg [data-cam]').forEach(b => b.addEventListener('click', () => setCam(+b.dataset.cam, true)));
  const setSh = (on) => { shadowsOn = on; if (A.world) A.world.setShadows(on); seg('#shSeg [data-sh]', 'sh', on ? 1 : 0); prefs.sh = on ? 1 : 0; savePrefs(); };
  document.querySelectorAll('#shSeg [data-sh]').forEach(b => b.addEventListener('click', () => setSh(b.dataset.sh === '1')));
  const setMi = (on) => { mirrors.enabled = on; document.body.classList.toggle('no-mirrors', !on); seg('#miSeg [data-mi]', 'mi', on ? 1 : 0); prefs.mi = on ? 1 : 0; savePrefs(); layoutSoon(); };
  document.querySelectorAll('#miSeg [data-mi]').forEach(b => b.addEventListener('click', () => setMi(b.dataset.mi === '1')));
  const setGd = (on) => { guide.enabled = on; seg('#gdSeg [data-gd]', 'gd', on ? 1 : 0); prefs.gd = on ? 1 : 0; savePrefs(); };
  document.querySelectorAll('#gdSeg [data-gd]').forEach(b => b.addEventListener('click', () => setGd(b.dataset.gd === '1')));
  $('portraitOk').addEventListener('click', () => { document.body.classList.add('allow-portrait'); layoutSoon(); });

  // ---------- driver's-seat cockpit, attached to the camera (UK right-hand drive) ----------
  const cockpit = new T.Group(); scene.add(camera); camera.add(cockpit); cockpit.visible = false;
  const dashM = new T.MeshLambertMaterial({ color: 0x1d2124 }), trimM = new T.MeshLambertMaterial({ color: 0x2b3135 });
  const bonnet = new T.Mesh(new T.BoxGeometry(1.9, 0.06, 1.7), new T.MeshLambertMaterial({ color: 0x1d6a46 })); bonnet.position.set(-CAR.seat.x, -0.66, -1.95); bonnet.rotation.x = 0.06; cockpit.add(bonnet);
  const dash = new T.Mesh(new T.BoxGeometry(2.3, 0.26, 0.55), dashM); dash.position.set(-CAR.seat.x, -0.52, -0.92); cockpit.add(dash);
  const binn = new T.Mesh(new T.BoxGeometry(0.42, 0.12, 0.2), trimM); binn.position.set(0, -0.36, -0.78); cockpit.add(binn);
  const wheel = new T.Mesh(new T.TorusGeometry(0.19, 0.024, 8, 28), trimM); wheel.position.set(0, -0.44, -0.56); wheel.rotation.x = -0.35; cockpit.add(wheel);
  const spoke = new T.Mesh(new T.BoxGeometry(0.36, 0.035, 0.02), trimM); wheel.add(spoke);
  for (const sx of [-1, 1]) { const pil = new T.Mesh(new T.BoxGeometry(0.022, 1.0, 0.022), dashM); pil.position.set(-CAR.seat.x + sx * 0.95, 0.12, -1.15); pil.rotation.z = -sx * 0.32; pil.rotation.x = -0.5; cockpit.add(pil); }
  mirrors.mount(cockpit, CAR.seat.x);

  // ---------- overhead view: drag to pan, wheel or pinch to zoom ----------
  const ov = { px: 0, pz: 0, h: 95 };
  const ovPanned = () => Math.hypot(ov.px, ov.pz) > 3 || Math.abs(ov.h - 95) > 5;
  const showCamRecentre = () => { $('camRecentre').hidden = !(cam === 2 && ovPanned()); };
  attachDrag(renderer.domElement, (dx, dy) => {
    if (cam !== 2 || document.body.dataset.mode !== 'drive') return;
    const mpp = 2 * Math.hypot(ov.h, ov.h * 0.38) * Math.tan(camera.fov * Math.PI / 360) / (stage.clientHeight || 1);
    ov.px -= dx * mpp; ov.pz -= dy * mpp; showCamRecentre();
  }, (f) => { if (cam !== 2) return; ov.h = Math.min(380, Math.max(25, ov.h / f)); showCamRecentre(); });
  $('camRecentre').addEventListener('click', () => { ov.px = ov.pz = 0; ov.h = 95; showCamRecentre(); });

  // ---------- camera ----------
  const camPos = new T.Vector3(), camLook = new T.Vector3(); let farMode = -2, orbit = 0;
  function updateCamera(dt) {
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), rx = -fz, rz = fx; let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-dt * 4.2);
    const lobby = document.body.dataset.mode === 'lobby';
    if (lobby) { orbit += dt * 0.12; const a = player.th + 2.4 + Math.sin(orbit) * 0.7; px = player.x + Math.sin(a) * 7.2; py = 2.3; pz = player.z + Math.cos(a) * 7.2; lx = player.x; ly = 0.85; lz = player.z; k = 1 - Math.exp(-dt * 3); }
    else if (cam === 0) { px = player.x - fx * 9.2; py = 4.1; pz = player.z - fz * 9.2; lx = player.x + fx * 7; ly = 1.2; lz = player.z + fz * 7; }
    else if (cam === 1) { const s = CAR.seat; px = player.x + rx * s.x + fx * -s.z; py = s.y; pz = player.z + rz * s.x + fz * -s.z; lx = px + fx * 20; ly = 0.9; lz = pz + fz * 20; k = 1; }
    else { lx = player.x + ov.px; ly = 0; lz = player.z + ov.pz; px = lx; py = ov.h; pz = lz + ov.h * 0.38; k = 1 - Math.exp(-dt * 12); }
    const mode = cam === 2 && !lobby ? Math.round(ov.h / 20) : -1;
    if (mode !== farMode && scene.fog) {
      farMode = mode; const extra = mode >= 0 ? ov.h : 0;
      scene.fog.near = WORLD.fogNear + extra; scene.fog.far = WORLD.fogFar + extra; camera.far = WORLD.fogFar + 200 + extra; camera.updateProjectionMatrix();
    }
    showCamRecentre();
    cockpit.visible = cam === 1 && !lobby; player.mesh.visible = cam !== 1 || lobby; wheel.rotation.z = player.steer * 1.8;
    if (!camInit) { camPos.set(px, py, pz); camLook.set(lx, ly, lz); camInit = true; }
    camPos.lerp(new T.Vector3(px, py, pz), k); camLook.lerp(new T.Vector3(lx, ly, lz), k);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  let layoutT = 0; function layoutSoon() { layoutT = 0.05; }
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); layoutSoon(); }
  new ResizeObserver(resize).observe(stage); resize();
  setCam(prefs.cam ?? 1); setSh(prefs.sh !== 0); setMi(prefs.mi !== 0); setGd(prefs.gd !== 0);

  let last = performance.now(), uiT = 0, mapT = 0, sigT = 0, chunkT = 0, lastStep = -1, lastRoute = null;
  function sim(dt) {
    const { traffic, test, net } = A;
    traffic.update(dt, player);
    if (test.running && scenario) scenario.update(dt, traffic.clock);
    if (test.running) {
      const nr = nearest(net, player.x, player.z);
      player.update(dt, readInput(), nr && nr.d > nr.way.w / 2 + 2.6 ? 'off' : 'road');
      test.update(dt);
      test.nearZebra = net.zebras.some(z => Math.abs(z.x - player.x) < 70 && Math.abs(z.z - player.z) < 70);
      test.nearLights = test.ctx && net.stopsByEdge.has(test.ctx.e.id);
    }
  }
  // test hook: advance the simulation without rendering
  window.cambridgeDrive.step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) if (A.net && route) sim(dt); };
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!A.net || !route) return;
    const { traffic, test, world } = A, drive = document.body.dataset.mode === 'drive';
    sim(dt);
    player.sync(traffic.clock);
    $('sigL').classList.toggle('on', player.indicator === 'L' && Math.floor(traffic.clock * 3) % 2 === 0);
    $('sigR').classList.toggle('on', player.indicator === 'R' && Math.floor(traffic.clock * 3) % 2 === 0);
    sigT += dt; if (sigT > 0.15) { sigT = 0; world.updateSignals(traffic.clock); }
    chunkT += dt; if (chunkT > 0.25) { chunkT = 0; const o = cam === 2 && drive; world.updateChunks(player.x + (o ? ov.px : 0), player.z + (o ? ov.pz : 0), o ? 2 : 1); }
    updateCamera(dt); world.updateSun(cam === 2 && drive ? player.x + ov.px : player.x, cam === 2 && drive ? player.z + ov.pz : player.z);
    guide.update(test, traffic.clock); guide.group.visible = guide.group.visible && drive;
    if (drive && cam === 1) { const gv = guide.group.visible; guide.group.visible = false; mirrors.update(scene, player); guide.group.visible = gv; }
    renderer.render(scene, camera);
    uiT += dt; if (uiT > 0.1) { uiT = 0; ui.hud(player, test, test.running || paused); if (test.step !== lastStep || test.route !== lastRoute) { lastStep = test.step; lastRoute = test.route; ui.renderSteps(test.route, test.step); } }
    mapT += dt; if (mapT > 0.05) { mapT = 0; ui.drawMap(player, test.route, test.step, traffic.clock); }
  }
  requestAnimationFrame(frame);

  setMode('lobby'); hub.open();
  await areaChain; await new Promise(r => setTimeout(r, 0));
  $('loadOv').hidden = true;
}

boot().catch(err => { console.error(err); setLoad(err.message || 'Something went wrong while loading.'); const b = $('loadErr'); if (b) b.hidden = false; });
