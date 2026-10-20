import { canAccessPlan } from './access.js';
import { initAuth } from './auth.js';
import { parkingPlan, ROADSIDE_PARKING } from './roadside-parking.js';
import { gradeParking } from './parking-geometry.js';
// Wires the modules together: loads the map area for the chosen drive, builds the world, runs the loop,
// handles input, cameras, mirrors and the route guide.
import { CAR, ROUTES, WORLD, HANDLING, AREAS_URL } from './config.js';
import { buildNet, buildRoute, snapWaypoint, along, nearest, laneCentre, ll2xz, inFillet } from './net.js';
import { buildWorld } from './world.js';
import { kitResources } from './city.js';
import { createTraffic } from './traffic.js';
import { createPlayer, loadCarModel, makeBoxCar, makeBike } from './car.js';
import { createGarage } from './garage.js';
import { createPedestrianFactory } from './pedestrian-models.js';
import { createTest } from './test.js';
import { createUI, attachDrag } from './ui.js';
import { createHub } from './hub.js';
import { createScenario, evaluate } from './course.js';
import { createEmergencyEvent } from './emergency.js';
import { createMirrors } from './mirrors.js';
import { createGuide } from './guide.js';
import { STAR } from './icons.js';
import { createBotLab } from './bots.js';
import { LESSONS } from './course.js';
import { PUZZLES } from './puzzles.js';
import { availability } from './curriculum.js';
import { resolveScenario } from './scenarios.js';
import { loadTrafficModels, loadVehicleModel } from './traffic-models.js';
import { EMERGENCY_CAR_ID } from './cars.js';
import { createVehicleState, createAutomaticState, createManoeuvreState, selectGear, operate } from './vehicle-state.js';
import { buildReport, runDetail } from './reports.js';

initAuth().catch(() => {});

const T = THREE, $ = id => document.getElementById(id);
const shadowed = (o) => { o.traverse(c => { if (c.isMesh) c.castShadow = true; }); return o; };
const stage = $('stage');
const setLoad = (msg) => { const el = $('loadMsg'); if (el) el.textContent = msg; };

async function boot() {
  if (!window.THREE) throw new Error('The 3D library did not load. Check your connection and reload.');
  setLoad('Loading…');
  const release = document.querySelector('meta[name="app-release"]')?.content;
  const assetURL = url => release ? url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(release) : url;
  const ix = await fetch(assetURL(AREAS_URL + 'index.json')); if (!ix.ok) throw new Error('Map index did not load (' + ix.status + ')');
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
  const carPool = [], bikePool = [],pedPool=[]; let carI = 0, bikeI = 0,pedI=0;
  const buildPedestrian=createPedestrianFactory(assetURL);
  const makePedestrian=()=>{let m=pedPool[pedI];if(!m)pedPool.push(m=buildPedestrian(pedI));pedI++;scene.add(m);return m;};
  // Each pooled traffic car is a wrapper group holding one body. It starts as a coloured box and is
  // swapped for a supplied model once those have loaded, so traffic never waits on the network.
  let trafficModels = [];
  const dressCar = (slot, index) => {
    const body = trafficModels.length ? trafficModels[index % trafficModels.length].clone(true) : shadowed(makeBoxCar(slot.userData.colour, false));
    slot.userData.model = trafficModels.length ? index % trafficModels.length : -1;
    slot.remove(...slot.children); slot.add(body);
  };
  const makeCar = (c) => {
    let m = carPool[carI];
    if (!m) { m = new T.Group(); m.userData = { colour: c, model: -1 }; carPool.push(m); dressCar(m, carPool.length - 1); }
    carI++; scene.add(m); return m;
  };
  const makeBk = (i) => { let m = bikePool[bikeI]; if (!m) bikePool.push(m = shadowed(makeBike(i))); bikeI++; scene.add(m); return m; };
  const A = { id: null, net: null, traffic: null, world: null, test: null, trafficInit: false };
  let areaChain = Promise.resolve(), shadowsOn = true;
  const areaOf = (pl) => pl.scenarioDefinition?.location.areaId || meta(pl.key).area;
  function disposeScene(old) {
    const keep = new Set(kitResources());
    const mark = (o) => o.traverse(c => { if (c.geometry) keep.add(c.geometry); for (const m of [].concat(c.material || [])) { keep.add(m); if (m.map) keep.add(m.map); } });
    [player.mesh, camera, guide.group, ...carPool, ...bikePool,...pedPool].forEach(mark);
    old.traverse(c => {
      if (c.geometry && !keep.has(c.geometry)) c.geometry.dispose();
      for (const m of [].concat(c.material || [])) { if (keep.has(m)) continue; if (m.map && !keep.has(m.map)) m.map.dispose(); m.dispose(); }
    });
  }
  function useArea(id) {
    areaChain = areaChain.catch(() => {}).then(async () => {
      if (A.id === id) { $('areaLoad').hidden = true; return; }
      $('areaLoad').textContent = 'Loading map…';
      const info = index.areas.find(a => a.id === id); if (!info) throw new Error('Unknown map area ' + id);
      $('areaLoad').hidden = false;
      const r = await fetch(assetURL(AREAS_URL + info.file)); if (!r.ok) throw new Error('Map area did not load (' + r.status + ')');
      const d = await r.json();
      await new Promise(res => setTimeout(res, 16));
      if (A.test) A.test.running = false;
      const old = scene; scene = new T.Scene(); scene.add(camera, player.mesh, guide.group); carI = bikeI = pedI = 0;
      const net = buildNet(d);
      const traffic = createTraffic(net, scene, makeCar, makeBk,makePedestrian);
      const world = buildWorld(scene, net, traffic); world.setShadows(shadowsOn);
      const test = createTest(net, traffic, player);
      test.onFault = () => ui.renderFaults(test); test.onFinish = onFinish;
      test.onReroute = (r) => { if (plan && plan.lesson && plan.lesson.callouts) addCallouts(r, plan.lesson.callouts); };
      Object.assign(A, { id, net, traffic, world, test, trafficInit: false });
      ui.setNet(net); disposeScene(old); farMode = -2;
      $('areaLoad').hidden = true;
    }).catch(err => { console.error(err); const el = $('areaLoad'); el.textContent = 'Map did not load. Reload to try again.'; el.hidden = false; throw err; });
    return areaChain;
  }

  // ---------- drives ----------
  let route = null, nodes = null, plan = null, scenario = null, driveScope = null;
  const learnerScope = () => hub.Profiles.scope() + ":" + hub.Profiles.current()?.id;
  // lessons and puzzles start about 150 yards before the junction they are about; mock tests run the whole route
  const LEAD = 137;
  const startS = (pl) => { if (pl.lesson?.scenario && ['cockpit', 'engine', 'mirrors', 'controlled-stop', 'accel-decel', 'automatic-drive', 'automatic-reverse', 'steering'].includes(pl.lesson.scenario)) return 0; if (pl.kind === 'mock') return 0; const ins = route.instructions.find(i => !i.final); return ins ? Math.max(0, ins.s - LEAD) : 0; };
  const startPos = (s0 = 0) => {
    let k = 0; while (k < route.steps.length - 1 && route.stepS[k + 1] <= s0) k++;
    const st = route.steps[k], ts = Math.max(Math.min(8, st.e.len / 3), Math.min(st.e.len - 4, s0 - route.stepS[k]));
    const p = along(st.e, ts, st.dir, laneCentre(st.e, st.dir, 0)); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz));
    return route.stepS[k] + ts;
  };
  // examiner callouts for places the route builder can't describe (e.g. a one-way gyratory)
  function addCallouts(r, list) {
    for (const c of list) {
      const p = c.x !== undefined ? c : ll2xz(A.net, c.lat, c.lon); let bi = 0, bd = Infinity;
      for (let i = 0; i < r.xs.length; i++) { const dd = (r.xs[i] - p.x) ** 2 + (r.zs[i] - p.z) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      r.instructions.push({ s: r.cum[bi], kind: 'straight', icon: c.icon || (c.signal === 'L' ? 'left' : c.signal === 'R' ? 'right' : 'straight'), text: c.text, short: c.short, signal: c.signal || null, road: c.road || '', callout: true });
    }
    r.instructions.sort((a, b) => (a.final ? 1 : 0) - (b.final ? 1 : 0) || a.s - b.s);
  }
  // load a plan (lesson, puzzle or mock route) in the current area without starting it: the car moves to the start
  function loadPlan(pl) {
    plan = pl; if (scenario) { scenario.stop(); scenario = null; }
    const wps = pl.kind === 'mock' ? ROUTES[pl.index].waypoints : (pl.scenarioDefinition?.location.waypoints || pl.lesson.waypoints);
    nodes = wps.map(w => snapWaypoint(A.net, w));
    route = buildRoute(A.net, nodes, { name: pl.kind === 'mock' ? ROUTES[pl.index].name : pl.lesson.title });
    if (pl.lesson && pl.lesson.callouts) addCallouts(route, pl.lesson.callouts);
    const test = A.test;
    test.running = false; test.done = false; test.setRoute(route, nodes); test.wpIndex = 1; test.reset();
    player.operation = pl.lesson?.manoeuvre ? createManoeuvreState()
      : pl.lesson?.vehicle?.transmission === 'automatic' ? createAutomaticState() : createVehicleState(!!pl.lesson?.operationControls); player.observations = []; player.lookAt = -1e9;
    A.traffic.setDensity(pl.scenarioDefinition?.conditions.trafficDensity || 'normal');
    const s0 = startPos(startS(pl));
    const parkingLayout = pl.lesson?.manoeuvre ? (pl.lesson.parkingLayout || ROADSIDE_PARKING) : null;
    if (parkingLayout) { const start = parkingPlan(pl.lesson.parkingKind, parkingLayout).start; player.place(start.x,start.z,start.th); }
    A.world.setRoadsideParking?.(parkingLayout, i => trafficModels.length ? trafficModels[(i + 2) % trafficModels.length].clone(true) : null);
    test.ctx = nearest(A.net,player.x,player.z);
    test.mode = pl.lesson?.manoeuvre ? 'manoeuvre' : 'road'; test.manoeuvreStatus = null; camInit = false; player.indicator = null;
    // clear any traffic sitting where the learner is placed; it comes back further away
    if (A.trafficInit) for (const c of A.traffic.cars.concat(A.traffic.bikes)) if (Math.hypot(c.x - player.x, c.z - player.z) < 35) { c.alive = false; c.pinned = 0; c.mesh.visible = false; c.x = c.z = 1e6; }
    if (s0 > 10) { test.sRoute = s0 - 2; let i = 0; while (i < route.cum.length - 2 && route.cum[i + 1] < s0) i++; test.idx = i; }
    if (!A.trafficInit) { A.traffic.init(player.x, player.z, WORLD.npcColours); A.trafficInit = true; }
    if(botMode&&botSeed!==null)A.traffic.reset(player.x,player.z,botSeed);
    ui.renderSteps(route, 0); ui.renderFaults(test, pl.kind === 'mock' ? 15 : (pl.lesson.maxD ?? 2));
    $('testState').textContent = pl.kind === 'mock' ? 'Not started' : (pl.kind === 'puzzle' ? 'Puzzle' : 'Lesson') + ' · not started';
    A.world.updateChunks(player.x, player.z, 4);
  }
  let pickTok = 0;
  async function pickPlan(pl, start) {
    if(start&&!canAccessPlan(pl)){hub.requestAccess();return false;}
    if (start && pl.kind === 'lesson' && !botMode && !availability(pl.lesson, hub.Profiles.current()).available) { hub.openSheet('courseSheet'); return; }
    if (pl.kind === 'lesson' && !pl.lesson.questions) pl = { ...pl, scenarioDefinition: resolveScenario(pl.lesson, pl.scenarioId) };
    if (pl.lesson && pl.lesson.questions) { // theory quiz: no driving, no map
      if (start) { if (A.test) A.test.running = false; paused = false; $('pauseSheet').hidden = true; $('resultSheet').hidden = true; banner(null); setMode('lobby'); hub.startQuiz(pl.lesson); }
      return;
    }
    const tok = ++pickTok;
    try { await useArea(areaOf(pl)); } catch (_) { if (A.test) A.test.running = false; setMode('lobby'); return false; }
    if (tok !== pickTok || !A.net || A.id !== areaOf(pl)) return false;
    loadPlan(pl); if (start) begin();
  }
  const hub = createHub({ meta, onPick: (pl) => pickPlan(pl, false), onStart: (pl) => pickPlan(pl, true) });
  const setMode = (m) => { document.body.dataset.mode = m; document.body.classList.toggle('parking-drive',m === 'drive' && !!plan?.lesson?.manoeuvre); camInit = false; layoutSoon(); };
  window.addEventListener('learner-access-change',()=>{
    if(!canAccessPlan(plan)){if(A.test)A.test.running=false;paused=false;$('pauseSheet').hidden=true;$('resultSheet').hidden=true;$('quizSheet').hidden=true;hub.closeSheets();setMode('lobby');}
  });
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('cambridge-learner-drive.prefs') || '{}'); } catch (_) { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem('cambridge-learner-drive.prefs', JSON.stringify(prefs)); } catch (_) {} };

  const garage=createGarage({player,prefs,save:savePrefs,assetURL,load:car=>loadCarModel(assetURL(car.url),car.supplied?{yaw:0,hide:null,maxWidth:1.8,wheel:mesh=>/Wheel/i.test(mesh.name)||/Wheel/i.test(mesh.parent?.name||'')}:{}).then(shadowed)});
  // Supplied models for the background traffic and the blue-light vehicle. Both are optional: a failed
  // load leaves boxes on the road and a box with a light bar in front of the learner.
  // The police car is wanted by a scripted event that can start early, so it is fetched first; the
  // background models follow and the pooled cars are redressed as soon as they arrive.
  let policeModel = null;
  loadVehicleModel(EMERGENCY_CAR_ID, assetURL, shadowed, { learner: false })
    .then(model => { policeModel = model; return loadTrafficModels(assetURL, shadowed); })
    .then(models => { trafficModels = models; carPool.forEach(dressCar); })
    .catch(() => {});

  // ---------- input ----------
  const key = { up: 0, down: 0, left: 0, right: 0 }, tch = { up: 0, down: 0, left: 0, right: 0 };
  // Hold to look left or right. This swings the camera only: the car keeps going where it is pointed.
  const lookHold = { left: 0, right: 0 };
  let cam = 0; const CAMS = ['Chase view', 'Driver view', 'Overhead'];
  const KM = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const sigBtns = () => document.querySelectorAll('[data-sig]').forEach(b => b.classList.toggle('sig-on', b.dataset.sig === player.indicator));
  const portrait = () => window.innerHeight > window.innerWidth && window.innerWidth <= 820;
  const setCam = (c, save) => {
    cam = c; $('camBtn').textContent = 'View: ' + CAMS[cam];
    document.querySelectorAll('#camSeg [data-cam]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.cam === cam));
    document.body.classList.toggle('cam-over', cam === 2); layoutSoon();
    if (save) { if (portrait()) prefs.camP = cam; else prefs.cam = cam; savePrefs(); }
  };
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Escape') { if (hub.anyOpen()) hub.closeSheets(); else if (document.body.dataset.mode === 'drive' && $('resultSheet').hidden) paused ? resume() : pause(); return; }
    if (document.body.dataset.mode !== 'drive') return;
    const k = KM[e.code];
    if (k) { key[k] = 1; if (A.test && A.test.running) e.preventDefault(); }
    else if (e.code === 'KeyQ') { player.signal('L'); sigBtns(); } else if (e.code === 'KeyE') { player.signal('R'); sigBtns(); }
    else if (e.code === 'KeyC') setCam((cam + 1) % 3, true);
    else if (e.code === 'KeyZ') { if (!lookHold.left) look('left'); lookHold.left = 1; }
    else if (e.code === 'KeyX') { if (!lookHold.right) look('right'); lookHold.right = 1; }
    else if (e.code === 'KeyB') look();
    else if (e.code === 'KeyI') cockpitAction('engine');
    else if (e.code === 'KeyP') cockpitAction('parkingBrake');
    else if (e.code === 'Space' && A.test && A.test.running) e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    const k = KM[e.code]; if (k) key[k] = 0;
    if (e.code === 'KeyZ') lookHold.left = 0; else if (e.code === 'KeyX') lookHold.right = 0;
  });
  const releaseControls = () => {
    for (const k in key) { key[k] = 0; tch[k] = 0; }
    lookHold.left = lookHold.right = 0; document.querySelectorAll('[data-look].on').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.touch .on').forEach(b => b.classList.remove('on'));
  };
  window.addEventListener('blur', releaseControls);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseControls(); });
  document.querySelectorAll('[data-k]').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); tch[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { tch[k] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault());
  });
  document.querySelectorAll('[data-sig]').forEach(b => b.addEventListener('click', () => { player.signal(b.dataset.sig); sigBtns(); }));
  // look round: mirrors and over the shoulder (the driver view turns to look); the examiner notes when you did it
  let lookAnim = 0;
  function look(view = 'all-round') { if (!A.traffic || !A.test?.running) return; player.lookAt = A.traffic.clock; player.observations.push({ view, at: A.traffic.clock, x: player.x, z: player.z }); lookAnim = 1; }
  $('lookBtn').addEventListener('click', () => look());
  // hold-to-look buttons for touch, matching the Z and X keys
  document.querySelectorAll('[data-look]').forEach(b => {
    const side = b.dataset.look;
    const on = e => { e.preventDefault(); if (!lookHold[side]) look(side); lookHold[side] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { lookHold[side] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault());
  });
  function cockpitAction(action) {
    if (!A.test?.running || !player.operation.enabled) return;
    if (!operate(player.operation, action, player.v, A.traffic.clock)) A.test.fault('D', 'Control – cockpit', 'Control input rejected: stop and prepare the cockpit before operating this control', 'cockpit-' + action, 2);
    renderTrainingControls();
  }
  function gearAction(gear) {
    if (!A.test?.running || player.operation.transmission !== 'automatic') return;
    if (!selectGear(player.operation, gear, player.v, player.rawInput?.brake || 0, A.traffic.clock)) A.test.fault('D', 'Control – selector', 'Stop and hold the footbrake before selecting a gear', 'gear-change', 2);
    renderTrainingControls();
  }
  document.querySelectorAll('[data-gear]').forEach(b => b.addEventListener('click', () => gearAction(b.dataset.gear)));
  document.querySelectorAll('[data-operation]').forEach(b => b.addEventListener('click', () => cockpitAction(b.dataset.operation)));
  document.querySelectorAll('[data-observe]').forEach(b => b.addEventListener('click', () => look(b.dataset.observe)));
  // Manoeuvre lessons have exactly one control: release the parking brake to set off, apply it to park.
  // Reverse is the back arrow held down, as on every other drive.
  $('assessParking').addEventListener('click', () => {
    if (!A.test?.running || !plan?.lesson?.manoeuvre) return;
    const op = player.operation;
    if (!operate(op, 'parkingBrake', player.v, A.traffic.clock)) { banner('Come to a stop first.', 'warn'); setTimeout(() => banner(null), 2000); renderTrainingControls(); return; }
    if (op.parkingBrake) scenario?.finishAttempt();
    renderTrainingControls();
  });
  function renderTrainingControls() {
    const parking = !!plan?.lesson?.manoeuvre, op = player.operation;
    const preparation = ['cockpit','engine'].includes(plan?.lesson?.scenario);
    const nextPreparation = ['doorClosed','seatSet','mirrorsSet','belt'].find(action => !op[action]) || (plan?.lesson?.scenario === 'engine' ? 'engine' : null);
    document.body.classList.toggle('parking-controls-right',!!plan?.lesson?.manoeuvre && (scenario?.progress?.target.x ?? player.x) < player.x - .5);
    $('backBtn').hidden = !!plan?.lesson?.manoeuvre;
    // One small control, out of the way: the view is what the learner needs to see.
    $('parkControls').hidden = !parking;
    if (parking) $('assessParking').textContent = op.parkingBrake ? 'Release parking brake' : 'Park';
    // The stage label lives in the HUD. This line stays empty unless something has gone wrong.
    const warn = scenario?.progress?.message || '';
    $('parkingTask').hidden = !plan?.lesson?.manoeuvre || !warn;
    $('parkingTask').textContent = warn;
    $('trainingControls').hidden = parking || document.body.dataset.mode !== 'drive' || (!player.operation.enabled && plan?.lesson?.scenario !== 'mirrors');
    $('cockpitControls').hidden = !player.operation.enabled;
    $('cockpitState').hidden = parking;
    $('gearControls').hidden = parking || player.operation.transmission !== 'automatic';
    document.querySelectorAll('[data-gear]').forEach(b => { b.hidden = parking && b.dataset.gear === 'N'; b.setAttribute('aria-pressed', String(op.gear === b.dataset.gear)); });
    $('observationControls').hidden = plan?.lesson?.scenario !== 'mirrors';
    document.querySelectorAll('[data-operation]').forEach(b => {
      const action = b.dataset.operation;
      b.hidden = !preparation && !['engine','parkingBrake'].includes(action);
      if (preparation) b.hidden = action !== nextPreparation;
      if (!preparation && action === 'engine') b.hidden = !parking || op.gear !== 'P' || !op.parkingBrake || !op.events.some(e => e.action === 'gear' && ['D','R'].includes(e.value));
      if (!preparation && action === 'parkingBrake') b.hidden = op.gear === 'P' ? op.parkingBrake : !op.parkingBrake;
      if (action === 'engine') b.textContent = op.engine ? 'Switch off engine' : 'Start engine';
      if (action === 'parkingBrake') b.textContent = op.parkingBrake ? 'Release parking brake' : 'Apply parking brake';
      b.setAttribute('aria-pressed', String(!!op[action]));
    });
    $('cockpitControls').hidden = parking || !op.enabled || !Array.from(document.querySelectorAll('[data-operation]')).some(b => !b.hidden);
    $('cockpitState').textContent = `Engine ${player.operation.engine ? 'on' : 'off'} · Parking brake ${player.operation.parkingBrake ? 'on' : 'off'}${player.operation.gear ? ' · Selector ' + player.operation.gear : ''}`;
  }
  ui.setClock(() => A.traffic ? A.traffic.clock : 0);
  // Hook for future input devices (e.g. a USB steering wheel via the Gamepad API): return {throttle, brake, steer} or null.
  const extraInputs = [];
  window.cambridgeDrive = { addInput: (fn) => { extraInputs.push(fn); return () => { const i = extraInputs.indexOf(fn); if (i >= 0) extraInputs.splice(i, 1); }; }, look: () => look(), lanePoint: (s) => guide.lanePoint(A.test.route, s, A.net), pick: (kind, id, start) => pickPlan(hub.select(kind, id), start), get net() { return A.net; }, get test() { return A.test; }, player, get traffic() { return A.traffic; }, CAR, get area() { return A.id; }, ready: () => areaChain, get camera() { return camera; }, get scenario() { return scenario; } };
  let botInput = null, botMode = false, pinMesh = null,botSeed=null;
  function readInput() {
    if (botInput) { const r = botInput(); if (r) return r; }
    for (const fn of extraInputs) { const r = fn(); if (r) return r; }
    return { throttle: key.up || tch.up ? 1 : 0, brake: key.down || tch.down ? 1 : 0, steer: (key.left || tch.left ? 1 : 0) - (key.right || tch.right ? 1 : 0) };
  }

  // ---------- drive flow ----------
  const banner = (text, kind) => { const el = $('banner'); el.hidden = !text; if (text) { el.textContent = text; el.className = 'banner ' + (kind || ''); } };
  // measured over one drive, for the feedback at the end
  const stats = { distance: 0, topSpeed: 0 };
  function showRunDetail(about) {
    const lines = runDetail({ ...about, stats, observations: player.observations });
    $('runDetailList').innerHTML = lines.map(line => `<li>${line.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('');
  }
  function onFinish() {
    const test = A.test; if (scenario) scenario.stop();
    $('rD').textContent = test.D; $('rS').textContent = test.S;
    const v = $('verdict'), reasons = $('rReasons'), next = $('nextBtn');
    if (plan.kind !== 'mock') {
      const res = evaluate(plan.lesson, test, scenario), pz = plan.kind === 'puzzle';
      const report = buildReport({ lessonId: plan.lesson.id, scenarioId: plan.scenarioDefinition?.id, pass: res.pass, faults: test.faults, duration: test.elapsed, objectives: plan.lesson.objectives || plan.lesson.steps, evidence: { observations: player.observations.map(e => ({ ...e })), controls: player.operation.events.map(e => ({ ...e })), scenarioEvents: scenario?.events || [], objectiveResult: scenario?.result ? scenario.result() : null } });
      $('coachingReport').textContent = report.summary + (report.practice.length ? ' ' + report.practice.map(p => `${p.category} (${p.evidence}): ${p.advice}`).join(' ') : '');
      showRunDetail({ kind: plan.kind, lesson: plan.lesson, test, scenario });
      if (!botMode && driveScope === learnerScope()) hub.Profiles.recordLesson(plan.lesson.id, { pass: res.pass, D: test.D, S: test.S, duration: test.elapsed, report }); // bot runs never touch a learner's progress
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
      if (!botMode && driveScope === learnerScope()) hub.Profiles.recordMock(ROUTES[plan.index].id, { pass, D: test.D, S: test.S, duration: test.elapsed, report: buildReport({ pass, faults: test.faults, duration: test.elapsed }) });
      $('endTag').textContent = 'Mock test complete';
      v.textContent = pass ? 'Pass. Well driven.' : 'Not this time'; v.className = 'verdict ' + (pass ? 'pass' : 'fail');
      $('rNote').textContent = pass ? (test.D ? `You picked up ${test.D} driving fault${test.D > 1 ? 's' : ''}. The marking sheet shows where.` : 'A clean drive with no faults recorded.')
        : (test.S ? `${test.S} serious fault${test.S > 1 ? 's' : ''} means a fail. The marking sheet shows what to work on.` : 'More than 15 driving faults means a fail. The marking sheet shows what to work on.');
      $('coachingReport').textContent = test.faults.map(f => f.cat + ': ' + f.text).join(' ') || 'No faults recorded in this mock test.';
      showRunDetail({ kind: 'mock', lesson: null, test, scenario });
      reasons.innerHTML = ''; next.hidden = true;
      $('testState').textContent = pass ? 'Passed' : 'Failed';
    }
    $('resultSheet').hidden = false; hub.render();
  }
  function pause() { if (!A.test || !A.test.running) return; paused = true; A.test.running = false; releaseControls(); $('pauseSheet').hidden = false; }
  function resume() { if (!paused) return; paused = false; A.test.running = true; $('pauseSheet').hidden = true; }
  function toLobby() {
    if (A.test) A.test.running = false; paused = false; if (scenario) { scenario.stop(); scenario = null; } banner(null);
    $('pauseSheet').hidden = true; $('resultSheet').hidden = true; setMode('lobby'); hub.open();
  }
  function begin() {
    if(!canAccessPlan(plan)){hub.requestAccess();return;}
    driveScope = learnerScope();
    paused = false; $('pauseSheet').hidden = true; $('resultSheet').hidden = true; hub.closeSheets(); setMode('drive');
    loadPlan(plan);
    // Every mock test includes a blue-light vehicle; lessons get their own scripted event.
    const deps = { net: A.net, traffic: A.traffic, test: A.test, player, ui: { banner }, get scene() { return scene; }, body: () => policeModel && policeModel.clone(true) };
    scenario = plan.kind === 'mock' ? createEmergencyEvent(deps) : createScenario(plan.lesson, deps);
    ui.pinTip(plan.lesson ? plan.lesson.rule : null, plan.lesson ? plan.lesson.title : '');
    // What to do is on the lesson card before you press Start, and what you did is in the feedback
    // afterwards. The drive itself carries only the short stage label in the HUD.
    stats.distance = 0; stats.topSpeed = 0;
    sigBtns(); A.test.running = true; A.test.elapsed = 0; A.test.startedAt = A.traffic.clock;
    A.test.context = { lessonId: plan.lesson?.id || null, scenarioId: plan.scenarioDefinition?.id || null, areaId: A.id }; banner(null); renderTrainingControls();
    $('testState').textContent = plan.kind === 'mock' ? 'In progress' : (plan.kind === 'puzzle' ? 'Puzzle · ' : 'Lesson · ') + plan.lesson.title;
    ui.hud(player, A.test, true); renderTrainingControls();
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
    if (plan?.lesson?.manoeuvre) return;
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
  // touch control size, 100-300% (capped so the controls always fit the screen)
  const ctl = $('ctlSize'), setTs = (v) => { document.querySelector('.touch').style.setProperty('--ts', v / 100); $('ctlSizeV').textContent = v + '%'; ctl.value = v; };
  setTs(prefs.ts || 300); ctl.addEventListener('input', () => { prefs.ts = +ctl.value; savePrefs(); setTs(prefs.ts); });

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
  }, (f) => {
    if (cam === 0) { chaseZ = Math.min(2.2, Math.max(0.6, chaseZ / f)); prefs.cz = +chaseZ.toFixed(2); savePrefs(); return; } // chase view: pinch or scroll to zoom
    if (cam !== 2) return; ov.h = Math.min(380, Math.max(25, ov.h / f)); showCamRecentre();
  });
  let chaseZ = prefs.cz || 1;
  $('camRecentre').addEventListener('click', () => { ov.px = ov.pz = 0; ov.h = 95; showCamRecentre(); });

  // ---------- camera ----------
  const camPos = new T.Vector3(), camLook = new T.Vector3(); let farMode = -2, orbit = 0, lookBlend = 0;
  function updateCamera(dt) {
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), rx = -fz, rz = fx; let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-dt * 4.2);
    const lobby = document.body.dataset.mode === 'lobby';
    if (lookAnim > 0) lookAnim = Math.max(0, lookAnim - dt / 1.1);
    const lookTarget = (lookHold.right ? 1 : 0) - (lookHold.left ? 1 : 0);
    lookBlend += (lookTarget - lookBlend) * (1 - Math.exp(-dt * 9));
    if (Math.abs(lookBlend - lookTarget) < 0.002) lookBlend = lookTarget;
    if (lobby) { orbit += dt * 0.12; const a = player.th + 2.4 + Math.sin(orbit) * 0.7; px = player.x + Math.sin(a) * 7.2; py = 2.3; pz = player.z + Math.cos(a) * 7.2; lx = player.x; ly = 0.85; lz = player.z; k = 1 - Math.exp(-dt * 3); }
    else if (cam === 0) { const P = camera.aspect < 1, z = chaseZ, b = (P ? 7 : 6.2) * z, h = 1.25 + (P ? 2.4 : 1.4) * z, a = P ? 4 : 6;
      // looking round swings the camera about the car; the car itself is unaffected
      const ya = lookBlend * 0.95, c = Math.cos(ya), sn = Math.sin(ya), gx = fx * c + rx * sn, gz = fz * c + rz * sn;
      px = player.x - gx * b; py = h; pz = player.z - gz * b; lx = player.x + gx * a; ly = P ? -1.6 : 1.1; lz = player.z + gz * a; k = 1 - Math.exp(-dt * 7); } // close behind the car, so it fills the view
    else if (cam === 1) {
      const s = CAR.seat; px = player.x + rx * s.x + fx * -s.z; py = s.y; pz = player.z + rz * s.x + fz * -s.z;
      // a held look wins over the B glance; both only turn the driver's head, never the car
      const glance = lookAnim > 0 ? Math.sin(Math.PI * (1 - lookAnim)) * 1.75 : 0;
      const turn = lookBlend !== 0 ? lookBlend * 1.85 : glance, lfx = fx * Math.cos(turn) + rx * Math.sin(turn), lfz = fz * Math.cos(turn) + rz * Math.sin(turn);
      lx = px + lfx * 20; ly = 0.9; lz = pz + lfz * 20; k = 1;
    }
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
    // The cockpit hangs off the camera, so a head turn would swing the bonnet and dashboard round with it
    // and look as though the car were steering. Cancel the camera's yaw so the car's own body stays put.
    if (cockpit.visible) {
      const dx = camLook.x - camPos.x, dz = camLook.z - camPos.z;
      cockpit.rotation.y = player.th - Math.atan2(-dx, -dz);
    }
  }
  let layoutT = 0; function layoutSoon() { layoutT = 0.05; }
  let wasPortrait = null;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix(); layoutSoon();
    const p = portrait(); if (p !== wasPortrait) { if (wasPortrait !== null || p) setCam(plan?.lesson?.manoeuvre ? 2 : p ? (prefs.camP ?? 0) : (prefs.cam ?? 1)); wasPortrait = p; } // upright phones default to the outside view
  }
  new ResizeObserver(resize).observe(stage); resize();
  setCam(portrait() ? (prefs.camP ?? 0) : (prefs.cam ?? 1)); setSh(prefs.sh !== 0); setMi(prefs.mi !== 0); setGd(prefs.gd !== 0);

  let last = performance.now(), uiT = 0, mapT = 0, sigT = 0, chunkT = 0, lastStep = -1, lastRoute = null;
  function sim(dt) {
    const { traffic, test, net } = A;
    traffic.update(dt, player);
    if (test.running) test.elapsed = (test.elapsed || 0) + dt;
    if (test.running && scenario && !plan?.lesson?.manoeuvre) scenario.update(dt, traffic.clock);
    if (test.running) {
      const nr = nearest(net, player.x, player.z);
      player.update(dt, readInput(), nr && nr.d > nr.way.w / 2 + 2.6 && !inFillet(net, player.x, player.z) ? 'off' : 'road');
      test.update(dt);
      stats.distance += Math.abs(player.v) * dt; stats.topSpeed = Math.max(stats.topSpeed, Math.abs(player.v));
      if (test.running && plan?.lesson?.manoeuvre) scenario.update(dt, traffic.clock);
      test.nearZebra = net.zebras.some(z => Math.abs(z.x - player.x) < 70 && Math.abs(z.z - player.z) < 70);
      test.nearLights = test.ctx && net.stopsByEdge.has(test.ctx.e.id);
    }
  }
  // test hook: advance the simulation without rendering
  window.cambridgeDrive.step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) if (A.net && route) sim(dt); };
  let manual = false; // recording hook: frames are stepped by hand with a fixed time step
  window.cambridgeDrive.manual = (on) => { manual = on; };
  window.cambridgeDrive.frame = (dt) => tick(dt);
  window.cambridgeDrive.setCam = (c) => setCam(c);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!manual) tick(dt);
  }
  function tick(dt) {
    if (!A.net || !route) return;
    const { traffic, test, world } = A, drive = document.body.dataset.mode === 'drive';
    sim(dt);
    player.sync(traffic.clock);
    $('sigL').classList.toggle('on', player.indicator === 'L' && Math.floor(traffic.clock * 3) % 2 === 0);
    $('sigR').classList.toggle('on', player.indicator === 'R' && Math.floor(traffic.clock * 3) % 2 === 0);
    sigT += dt; if (sigT > 0.15) { sigT = 0; world.updateSignals(traffic.clock); }
    chunkT += dt; if (chunkT > 0.25) { chunkT = 0; const o = cam === 2 && drive; world.updateChunks(player.x + (o ? ov.px : 0), player.z + (o ? ov.pz : 0), o ? 2 : 1); }
    updateCamera(dt); world.updateSun(cam === 2 && drive ? player.x + ov.px : player.x, cam === 2 && drive ? player.z + ov.pz : player.z);
    guide.update(test, traffic.clock, A.net); guide.group.visible = guide.group.visible && drive && !plan?.lesson?.manoeuvre;
    if (plan?.lesson?.manoeuvre && scenario?.progress) { const p = scenario.progress; world.setParkingTarget(p.target,p.path,gradeParking(p.target,player)); world.showParkingGuide(guide.enabled); }
    if (drive && cam === 1) { const gv = guide.group.visible; guide.group.visible = false; mirrors.update(scene, player); guide.group.visible = gv; }
    if(drive||botMode)renderer.render(scene, camera);
    uiT += dt; if (uiT > 0.1) { uiT = 0; ui.hud(player, test, test.running || paused); renderTrainingControls(); if (test.step !== lastStep || test.route !== lastRoute) { lastStep = test.step; lastRoute = test.route; ui.renderSteps(test.route, test.step); } }
    mapT += dt; if (mapT > 0.05) { mapT = 0; ui.drawMap(player, test.route, test.step, traffic.clock); }
  }
  requestAnimationFrame(frame);

  setMode('lobby'); hub.open();
  // bot lab: open the sim with ?bots to run and watch the test driver on any lesson, puzzle or mock test
  if (/[?&]bots\b/.test(location.search)) createBotLab({
    lesson: () => plan.lesson, scenarioStatus: () => scenario?.progress, scenarioPhase: () => scenario?.phase, operate: cockpitAction, gear: gearAction,
    get A() { return A; }, player, look, frame: (dt) => tick(dt), step: (n, dt) => window.cambridgeDrive.step(n, dt),
    // screenshot of the 3D view (rendered now, so the drawing buffer is still there to read)
    snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    // ground point under a click on the 3D view
    pick: (cx, cy) => {
      const r = renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const p = new T.Vector3(); if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p)) return null;
      const nr = nearest(A.net, p.x, p.z); return { x: p.x, z: p.z, road: nr && nr.d < nr.way.w / 2 + 1 ? nr.way.name || (nr.way.rb ? 'roundabout' : 'unnamed') : '' };
    },
    pin: (x, z) => { if (!pinMesh) { pinMesh = new T.Mesh(new T.ConeGeometry(0.3, 1.2, 12), new T.MeshBasicMaterial({ color: 0xff3b30 })); pinMesh.rotation.x = Math.PI; } scene.add(pinMesh); pinMesh.position.set(x, 0.75, z); },
    lanePoint: (s) => guide.lanePoint(A.test.route, s, A.net),
    estopBanner: () => { const b = $('banner'); return !b.hidden && /STOP/.test(b.textContent); },
    setInput: (fn) => { botInput = fn; },
    botMode: (on) => { botMode = on; manual = on; },
    async start(kind, id, seed) {
      botSeed=seed;
      const pl = kind === 'mock' ? { kind: 'mock', key: 'route:' + id, index: ROUTES.findIndex(r => r.id === id) } : hub.select(kind, id);
      await pickPlan(pl, true); await areaChain;
    },
    result: () => plan.kind === 'mock' ? { pass: A.test.passed(), why: '' } : evaluate(plan.lesson, A.test, scenario),
    plans: [...LESSONS.filter(l => l.waypoints).map(l => ({ kind: 'lesson', id: l.id, title: l.title })), ...PUZZLES.map(p => ({ kind: 'puzzle', id: p.id, title: p.title })), ...ROUTES.map(r => ({ kind: 'mock', id: r.id, title: 'Mock: ' + r.name }))]
  });
  await areaChain; await new Promise(r => setTimeout(r, 0));
  $('loadOv').hidden = true;
}

boot().catch(err => { console.error(err); setLoad(err.message || 'Something went wrong while loading.'); const b = $('loadErr'); if (b) b.hidden = false; });
