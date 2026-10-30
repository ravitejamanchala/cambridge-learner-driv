import {routeStore} from './personal/storage.js';
import {createVoiceGuidance} from './voice.js';
import {createCockpit} from './cockpit.js';
import {locate as locatePersonal,unproject as unprojectPersonal,MOCK_MIN_METRES} from './personal/geometry.js';
import {createObstacleIndex} from './obstacle-index.js';
import {fitRoadCorners} from './roadside-clearance.js';
import { loadLocalLibrary, mountLocalLibrary, preferredLocalRoute, notifyLocalRoute } from './local-library.js';
import { addEditorObjects,createAuthoredTiles } from './local-world.js';
import { obstacleContact } from './editor-collisions.js';
import { canAccessPlan } from './access.js';
import { initAuth } from './auth.js';
import { parkingPlan, ROADSIDE_PARKING } from './roadside-parking.js';
import { gradeParking } from './parking-geometry.js';
// Wires the modules together: loads the map area for the chosen drive, builds the world, runs the loop,
// handles input, cameras, mirrors and the route guide.
import { CAR, ROUTES, WORLD, HANDLING, AREAS_URL, steerFor } from './config.js';
import { buildNet, buildRoute, snapWaypoint, along, nearest, laneCentre, ll2xz, inFillet, paved, onPaved } from './net.js';
import { buildWorld } from './world.js';
import { kitResources } from './city.js';
import { attachLamps, setLamps, attachIndicators, setIndicators } from './evening.js';
import { createTraffic } from './traffic.js';
import { createPlayer, loadCarModel, makeBoxCar, makeBike, carMetrics } from './car.js';
import { createGarage } from './garage.js';
import { createPedestrianFactory } from './pedestrian-models.js';
import { createTest, wheelsOff } from './test.js';
import { getMode, modeOf, judgeMock } from './assessment.js';
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
import { FREE_DRIVES, createFreeStats, stepFreeStats, freeSummaryLines } from './free-drive.js';
import { centreLine, onCarriageway } from './motorway.js';

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
  const localTracks = await loadLocalLibrary(index, ROUTES);
  const meta = (key) => index.plans[key] || { len: 0, n: 0, first: '' };

  let camInit = false, paused = false;
  const seat = { ...CAR.seat }; // where the driver's eyes are, refitted to whichever car is chosen
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
  // evening drives (issue #10): every vehicle carries lamps, lit only at dusk
  let dusk = false, lowPower = false;
  // one spot light lights the road ahead of the learner (left out on low-power graphics, where the lamps
  // alone show the headlights are on). Each map area gets a new scene, so it moves with the camera.
  const headBeam = new T.SpotLight(0xfff1d6, 1.3, 75, 0.46, 0.65, 1.2); headBeam.visible = false;
  const dressCar = (slot, index) => {
    const body = trafficModels.length ? trafficModels[index % trafficModels.length].clone(true) : shadowed(makeBoxCar(slot.userData.colour, false));
    slot.userData.model = trafficModels.length ? index % trafficModels.length : -1;
    slot.remove(...slot.children); slot.add(body); attachLamps(body); attachIndicators(body); setLamps(body, dusk);
  };
  const makeCar = (c) => {
    let m = carPool[carI];
    if (!m) { m = new T.Group(); m.userData = { colour: c, model: -1 }; carPool.push(m); dressCar(m, carPool.length - 1); }
    carI++; scene.add(m); return m;
  };
  const makeBk = (i) => { let m = bikePool[bikeI]; if (!m) bikePool.push(m = shadowed(makeBike(i))); bikeI++; scene.add(m); return m; };
  const A = { id: null, net: null, traffic: null, world: null, test: null, trafficInit: false };
  let areaChain = Promise.resolve(), shadowsOn = true;
  const areaOf = (pl) => pl.kind==='personal' ? pl.area : pl.scenarioDefinition?.location.areaId || meta(pl.key).area;
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
      const r = localTracks.has(id) ? {ok:true} : await fetch(assetURL(AREAS_URL + info.file)); if (!r.ok) throw new Error('Map area did not load (' + r.status + ')');
      const d = localTracks.get(id) || await r.json();
      await new Promise(res => setTimeout(res, 16));
      if (A.test) A.test.running = false;
      const old = scene; scene = new T.Scene(); scene.matrixAutoUpdate=!Array.isArray(d.objects); scene.add(camera, player.mesh, guide.group, headBeam, headBeam.target); carI = bikeI = pedI = 0;
      const net = buildNet(d.network || d);
      if(d.network)fitRoadCorners(net,d.objects||[]);
      const traffic = createTraffic(net, scene, makeCar, makeBk,makePedestrian);
      // Local navigation inserts waypoint nodes; the original graph keeps road
      // paint continuous through those artificial cuts. Signals share cluster/group
      // identifiers with traffic, so both graphs display the same live phase.
      const visualNet = d.renderNetwork ? buildNet(d.renderNetwork) : net;
      const world = buildWorld(scene, visualNet, traffic, {objects:d.objects||[],surfaceTiles:d.renderTiles?d.surfaceTiles:undefined,osmWays:d.osm?.ways,authored: d.sceneryMode !== "procedural" && (!!d.network || d.sceneryMode === "authored")});
      const authoredTiles=d.renderTiles?createAuthoredTiles(T,scene,d,visualNet,{joinedPavements:world.joinedPavements}):null;
      if(d.network&&!authoredTiles)addEditorObjects(T,scene,d,visualNet,{joinedPavements:world.joinedPavements});
      world.setShadows(shadowsOn && !lowPower);
      const test = createTest(net, traffic, player);
      test.onFault = () => ui.renderFaults(test); test.onFinish = onFinish;
      test.onReroute = (r) => { if (plan && plan.lesson && plan.lesson.callouts) addCallouts(r, plan.lesson.callouts); };
      Object.assign(A, { id, net, traffic, world, test, authoredTiles, obstacleIndex: d.objects?createObstacleIndex(d.objects):null, trafficInit: false });
      ui.setNet(net); disposeScene(old); farMode = -2;
      $('areaLoad').hidden = true;
    }).catch(err => { console.error(err); const el = $('areaLoad'); el.textContent = 'Map did not load. Reload to try again.'; el.hidden = false; throw err; });
    return areaChain;
  }

  // ---------- drives ----------
  let route = null, nodes = null, plan = null, scenario = null, driveScope = null, coaching = false;
  const learnerScope = () => hub.Profiles.scope() + ":" + hub.Profiles.current()?.id;
  // lessons and puzzles start about 150 yards before the junction they are about; mock tests run the whole route
  const LEAD = 137;
  const startS = (pl) => { if (pl.kind === 'free'||pl.kind==='personal') return 0; if (pl.lesson?.startAt !== undefined) return pl.lesson.startAt; if (pl.lesson?.scenario && ['cockpit', 'engine', 'mirrors', 'controlled-stop', 'accel-decel', 'automatic-drive', 'automatic-reverse', 'steering'].includes(pl.lesson.scenario)) return 0; if (pl.kind === 'mock') return 0; const ins = route.instructions.find(i => !i.final); return ins ? Math.max(0, ins.s - LEAD) : 0; };
  const startPos = (s0 = 0, lane = 0) => {
    let k = 0; while (k < route.steps.length - 1 && route.stepS[k + 1] <= s0) k++;
    const st = route.steps[k], ts = Math.max(Math.min(8, st.e.len / 3), Math.min(st.e.len - 4, s0 - route.stepS[k]));
    const p = along(st.e, ts, st.dir, laneCentre(st.e, st.dir, lane)); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz));
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
  // ---------- free drive ----------
  // Ungraded and endless. The route is a lap and a quarter; the examiner steps progress back a lap as
  // the car comes round (test.js useLap), and if the learner leaves at a junction, a route back onto
  // the circuit is built from wherever they are. What it measured is shown when they stop.
  let freeStats = null, freeJunctions = [];
  function startFreeDrive(pl, test) {
    const lapRoute = buildRoute(A.net, pl.drive.lap.map(w => snapWaypoint(A.net, w)));
    const lapAt = (r) => r.len - lapRoute.len * 1.25; // where the full lap starts on a route ending a lap and a quarter on
    const M = A.net.motorway, line = centreLine();
    // on the carriageway, one countdown instruction per junction passed, in place of "pull up on the left";
    // off it (leaving at a junction, and the way back on), the route's own directions at each turn
    const junctionsOn = (r) => {
      const ins = r.instructions.filter(i => !i.final && i.approach && i.approach.e.way.cls !== 'motorway');
      for (const j of (M?.junctions || []).filter(j => j.side === 'A')) {
        const p = onCarriageway(line, M.lanes, 'A', j.diverge);
        for (let i = 1; i < r.xs.length - 1; i++) {
          const d = Math.hypot(r.xs[i] - p.x, r.zs[i] - p.z);
          if (d < 25 && d <= Math.hypot(r.xs[i - 1] - p.x, r.zs[i - 1] - p.z) && d <= Math.hypot(r.xs[i + 1] - p.x, r.zs[i + 1] - p.z))
            ins.push({ s: r.cum[i], kind: 'straight', icon: 'straight', text: `Junction ${j.n} for ${j.to}`, short: `Junction ${j.n}`, signal: null, road: 'M100', junction: j.n, to: j.to });
        }
      }
      const fin = r.instructions.find(i => i.final);
      r.instructions = ins.sort((a, b) => a.s - b.s).concat(fin ? [fin] : []);
      return r;
    };
    junctionsOn(route);
    test.useLap(route, 0, lapRoute.len);
    test.onOffRoute = (from, along) => {
      try {
        const r = junctionsOn(buildRoute(A.net, [from, along, ...pl.drive.waypoints.map(w => snapWaypoint(A.net, w))]));
        route = r; test.useLap(r, Math.max(0, lapAt(r)), lapRoute.len); test.snapProgress(); test.rerouted++; ui.renderSteps(r, 0); lastStep = -1;
      } catch (_) { /* no way back from here yet: try again in a moment */ }
    };
    test.onLap = () => { if (freeStats) freeStats.laps++; };
    freeStats = createFreeStats();
    freeJunctions = (M?.junctions || []).filter(j => j.side === 'A').map(j => ({ ...onCarriageway(centreLine(), M.lanes, 'A', j.diverge), n: j.n, at: -1e9 }));
  }
  function stepFreeDrive(dt) {
    if (!freeStats || !A.test?.running) return;
    const nr = A.test.ctx, limit = nr ? nr.way.mph : 70;
    stepFreeStats(freeStats, dt, player.v, Math.abs(player.v) * 2.23694, limit, wheelsOff(A.net, player).wheels);
    for (const j of freeJunctions) if (A.traffic.clock - j.at > 60 && Math.hypot(j.x - player.x, j.z - player.z) < 30) { j.at = A.traffic.clock; freeStats.junctions++; }
  }
  // the payoff for an ungraded drive: what it measured, said plainly, and nothing written to the record
  function showFreeSummary() {
    if (A.test) A.test.running = false; paused = false; $('pauseSheet').hidden = true;
    const st = freeStats || createFreeStats(), mi = st.distance / 1609.34, min = st.seconds / 60;
    $('endTag').textContent = 'Free drive'; const v = $('verdict'); v.textContent = mi >= 0.1 ? `${mi.toFixed(1)} miles driven` : 'Drive ended'; v.className = 'verdict pass';
    $('rD').textContent = '–'; $('rS').textContent = '–';
    $('rNote').textContent = plan.drive.title + ' · ungraded, nothing added to your record';
    const lines = freeSummaryLines(st, min);
    $('rReasons').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
    $('coachingReport').textContent = ''; $('nextBtn').hidden = true; $('runDetailList').innerHTML = ''; $('againBtn').textContent = 'Drive again'; $('resultSheet').hidden = false; setMode('lobby'); document.body.classList.remove('free-drive');
  }

  // load a plan (lesson, puzzle or mock route) in the current area without starting it: the car moves to the start
  function loadPlan(pl) {
    plan = pl; if (scenario) { scenario.stop(); scenario = null; }
    const wps = pl.kind==='personal'?pl.waypoints:pl.kind === 'mock' ? ROUTES[pl.index].waypoints : pl.kind === 'free' ? pl.drive.waypoints : (pl.scenarioDefinition?.location.waypoints || pl.lesson.waypoints);
    nodes = pl.kind==='personal'?[...pl.nodes]:pl.kind==='mock' && ROUTES[pl.index].localNodes ? [...ROUTES[pl.index].localNodes] : wps.map(w => snapWaypoint(A.net, w));
    route = buildRoute(A.net, nodes, { name: pl.kind==='personal'?pl.title:pl.kind === 'mock' ? ROUTES[pl.index].name : pl.kind === 'free' ? pl.drive.title : pl.lesson.title });
    if (pl.lesson && pl.lesson.callouts) addCallouts(route, pl.lesson.callouts);
    const test = A.test;
    test.experimental = pl.kind==='personal'? !pl.graded : localTracks.get(A.id)?.practiceMode === 'experimental';
    test.running = false; test.done = false; test.setRoute(route, nodes); test.wpIndex = 1; test.reset();
    player.operation = pl.lesson?.manoeuvre ? createManoeuvreState()
      : pl.lesson?.vehicle?.transmission === 'automatic' ? createAutomaticState() : createVehicleState(!!pl.lesson?.operationControls); player.observations = []; player.lookAt = -1e9;
    A.traffic.setDensity(pl.scenarioDefinition?.conditions.trafficDensity || 'normal');
    const s0 = startPos(startS(pl), pl.lesson?.startLane || 0);
    const authored = localTracks.get(A.id);
    if(authored) player.place(authored.spawn.x, authored.spawn.z, authored.spawn.heading);
    if (pl.kind === 'free') { player.v = 22.4; player.steer = 0; test.parked = false; } // 50 mph in lane 1, nothing to move off from
    if (pl.lesson?.startMph) { player.v = pl.lesson.startMph * 0.44704; player.steer = 0; test.parked = false; } // a motorway lesson starts at speed, in its lane
    const parkingLayout = pl.lesson?.manoeuvre ? (pl.lesson.parkingLayout || ROADSIDE_PARKING) : null;
    if (parkingLayout) { const start = parkingPlan(pl.lesson.parkingKind, parkingLayout).start; player.place(start.x,start.z,start.th); }
    A.world.setRoadsideParking?.(parkingLayout, i => trafficModels.length ? trafficModels[(i + 2) % trafficModels.length].clone(true) : null);
    test.ctx = nearest(A.net,player.x,player.z);
    test.ungraded = pl.kind === 'free'||(pl.kind==='personal'&&!pl.graded); test.onLap = null; test.onOffRoute = null;
    // time of day comes from the lesson (or the scenario's conditions, or the free drive); lighting only
    test.marking = botMode||pl.graded ? 'hard' : getMode(); // fixed for this drive: changing it afterwards changes nothing (js/assessment.js)
    test.timeOfDay = pl.scenarioDefinition?.conditions.visibility === 'dusk' || pl.lesson?.timeOfDay === 'dusk' || pl.drive?.timeOfDay === 'dusk' ? 'dusk' : 'day';
    applyTimeOfDay(test.timeOfDay); setHeadlights(false);
    if (pl.kind==='free') startFreeDrive(pl, test);
    test.mode = pl.lesson?.manoeuvre ? 'manoeuvre' : 'road'; test.manoeuvreStatus = null; camInit = false; player.indicator = null;
    // clear any traffic sitting where the learner is placed; it comes back further away
    if (A.trafficInit) for (const c of A.traffic.cars.concat(A.traffic.bikes)) if (Math.hypot(c.x - player.x, c.z - player.z) < 35) { c.alive = false; c.pinned = 0; c.mesh.visible = false; c.x = c.z = 1e6; }
    if (s0 > 10) { test.sRoute = s0 - 2; let i = 0; while (i < route.cum.length - 2 && route.cum[i + 1] < s0) i++; test.idx = i; }
    if (!A.trafficInit) { A.traffic.init(player.x, player.z, WORLD.npcColours); A.trafficInit = true; }
    if(botMode&&botSeed!==null)A.traffic.reset(player.x,player.z,botSeed);
    ui.renderSteps(route, 0); ui.renderFaults(test, pl.kind === 'mock'||pl.graded ? 15 : pl.kind === 'free'||pl.kind==='personal' ? 0 : (pl.lesson.maxD ?? 2));
    $('backBtn').textContent = test.experimental ? 'Reset to spawn' : 'Back to last instruction';
    $('testState').textContent = test.experimental ? 'Experimental practice · ungraded' : pl.graded ? 'Custom mock · Hard' : pl.kind === 'mock' ? 'Not started' : pl.kind === 'free' ? 'Free drive' : 'Lesson' + ' · not started';
    document.body.classList.toggle('free-drive', test.ungraded);document.body.classList.toggle('personal-drive',pl.kind==='personal'); $('quitBtn').textContent = pl.kind === 'free'||pl.kind==='personal' ? 'End drive' : 'Quit to lobby';
    A.world.updateChunks(player.x, player.z, 4);
  }
  let pickTok = 0;
  async function pickPlan(pl, start) {
    if(pl.kind!=='personal')stopPersonal();
    notifyLocalRoute(pl);
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
  const hub = createHub({ meta, initialMockId: preferredLocalRoute(), onPick: (pl) => pickPlan(pl, false), onStart: (pl) => pickPlan(pl, true) });
  mountLocalLibrary({selectedRoute:()=>hub.plan().kind==='mock'?hub.plan().key.slice(6):null,onSelect:(id)=>{const pl=hub.select('mock',id);hub.render();return pickPlan(pl,false);}});
  let personalUI=null,personal=null;
  function stopPersonal(){personal?.journey.cancel();personal=null;for(const key of localTracks.keys())if(key.startsWith('personal:'))localTracks.delete(key);index.areas=index.areas.filter(a=>!a.id.startsWith('personal:')); $('personalJourneyProgress').hidden=true;document.body.classList.remove('personal-drive');}
  async function openPersonal(){
    hub.closeSheets();
    try{if(!personalUI){const {createRoutesUI}=await import('./personal/ui.js');personalUI=createRoutesUI({onDrive:startPersonal,canDrive:graded=>canAccessPlan({kind:'personal',graded}),requestLogin:()=>{personalUI.close();hub.requestAccess();},onClose:()=>$('myRoutesBtn').focus()});}personalUI.open();}
    catch(e){$('personalOpenStatus').textContent='Route creator could not load. Check your connection and retry.';}
  }
  $('myRoutesBtn').onclick=openPersonal;
  async function installPersonal(track){
    const current=personal;if(!current)throw Error('Drive cancelled.');
    const id=`personal:${current.journey.recipe.id}`,old=A.id;
    localTracks.set(id,track);if(!index.areas.some(a=>a.id===id))index.areas.push({id,file:''});
    await useArea(id);if(personal!==current||current.journey.cancelled)throw new DOMException('Drive cancelled.','AbortError');
    const pl={kind:'personal',graded:current.graded,key:id,area:id,title:current.journey.recipe.title,waypoints:track.plan.waypoints,nodes:track.plan.nodes};loadPlan(pl);
    if(old?.startsWith('personal:')&&old!==id){localTracks.delete(old);index.areas=index.areas.filter(a=>a.id!==old);}
  }
  async function startPersonal(journey,world,{graded=false}={}){
    if(graded&&journey.route.length<=MOCK_MIN_METRES)throw Error('A graded mock needs a route longer than 6 miles.');
    if(!canAccessPlan({kind:'personal',graded})){hub.requestAccess();throw Error('Sign in to drive your route.');}
    stopPersonal();personal={journey,graded,progress:0,seconds:0,distance:0,complete:false};
    try{await installPersonal(world);await A.authoredTiles?.prepare(player.x,player.z,()=>journey.cancelled);if(journey.cancelled)throw new DOMException('Cancelled','AbortError');}catch(e){if(personal?.journey===journey)stopPersonal();throw e;}
    begin();A.world.updateChunks(player.x,player.z,100);$('personalJourneyProgress').hidden=false;window.dispatchEvent(new Event('personal-route-ready'));
  }
  function stepPersonal(dt){
    if(!personal||personal.complete)return;
    const hit=locatePersonal(personal.journey.route,unprojectPersonal(A.net,player),personal.progress);
    if(hit.d<25)personal.progress=Math.max(personal.progress,hit.s);
    personal.seconds+=dt;personal.distance+=Math.abs(player.v)*dt;
    const remaining=Math.max(0,personal.journey.route.length-personal.progress);$('personalJourneyProgress').textContent=(remaining/1609.344).toFixed(1)+' mi to finish';
    // A graded drive can finish only through the native examiner's waypoint checks.
    if(botMode&&!personal.graded&&remaining<12&&Math.abs(player.v)<.5&&hit.d<15){personal.complete=true;A.test.running=false;A.test.done=true;return;}
    if(!personal.graded&&remaining<12&&Math.abs(player.v)<.5&&hit.d<15){personal.complete=true;showPersonalSummary(true);return;}
  }
  function showPersonalMockResult(completed){
    if(!personal)return;const t=A.test;t.running=false;t.done=true;paused=false;personal.complete=true;voice.cancel();
    const verdict=judgeMock('hard',t),pass=completed&&verdict.pass;
    $('pauseSheet').hidden=true;$('endTag').textContent=completed?'Custom mock complete':'Custom mock ended';$('verdict').textContent=completed?(pass?'Pass. Well driven.':'Not this time'):'Incomplete';$('verdict').className='verdict '+(pass?'pass':'fail');
    $('rD').textContent=t.D;$('rS').textContent=t.S;$('rNote').textContent=personal.journey.recipe.title+' · Hard marking · generated route';
    $('rReasons').replaceChildren();const note=document.createElement('li');note.textContent=completed?'15 or fewer driving faults and no serious faults to pass. Generated map details may differ from the road.':'The drive ended before the finish. No pass was awarded.';$('rReasons').append(note);
    $('coachingReport').textContent=t.faults.map(f=>f.cat+': '+f.text).join(' ')||'No faults recorded.';showRunDetail({kind:'mock',lesson:null,test:t,scenario:null});
    if(driveScope===learnerScope())try{const store=routeStore(),saved=store.list().find(r=>r.id===personal.journey.recipe.id);if(saved)store.save({...saved,lastMock:{completed,pass,D:t.D,S:t.S,duration:t.elapsed,finishedAt:Date.now(),mode:'hard'}});}catch(e){const warning=document.createElement('li');warning.textContent='Result could not be saved: '+e.message;$('rReasons').append(warning);}
    $('nextBtn').hidden=true;$('againBtn').textContent='Try again';$('resultSheet').hidden=false;setMode('lobby');
  }
  function showPersonalSummary(complete){
    if(!personal)return;voice.cancel();A.test.running=false;paused=false;$('pauseSheet').hidden=true;
    $('endTag').textContent=complete?'Route complete':'Personal practice';$('verdict').textContent=(personal.distance/1609.344).toFixed(1)+' miles driven';$('verdict').className='verdict pass';
    $('rD').textContent=$('rS').textContent='–';$('rNote').textContent=personal.journey.recipe.title+' · ungraded, nothing added to your record';$('rReasons').replaceChildren();
    for(const text of [`${Math.round(personal.seconds/60)} minutes of practice.`,complete?'You reached your chosen finish.':'Your route is saved here for another drive.']){const li=document.createElement('li');li.textContent=text;$('rReasons').append(li);}
    $('coachingReport').textContent='';$('runDetailList').replaceChildren();$('nextBtn').hidden=true;$('againBtn').textContent='Drive again';$('resultSheet').hidden=false;setMode('lobby');
  }
  const setMode = (m) => { document.body.dataset.mode = m; document.body.classList.toggle('parking-drive',m === 'drive' && !!plan?.lesson?.manoeuvre); camInit = false; layoutSoon(); };
  window.addEventListener('learner-access-change',()=>{
    if(!canAccessPlan(plan)){stopPersonal();if(A.test)A.test.running=false;paused=false;$('pauseSheet').hidden=true;$('resultSheet').hidden=true;$('quizSheet').hidden=true;hub.closeSheets();setMode('lobby');}
  });
  const voice=createVoiceGuidance();
  const renderVoice=()=>{document.querySelectorAll('[data-voice]').forEach(b=>{b.disabled=!voice.supported;b.setAttribute('aria-pressed',String((b.dataset.voice==='1')===voice.enabled));});if(!voice.supported)$('voiceAvailability').textContent='Voice is unavailable in this browser. Written instructions remain available.';};
  renderVoice();$('voiceSeg').onclick=e=>{const b=e.target.closest('[data-voice]');if(b){voice.setEnabled(b.dataset.voice==='1');renderVoice();}};
  document.addEventListener('learner-read-lesson',e=>voice.say(e.detail));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)voice.cancel();});
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
    document.body.classList.toggle('cam-over', cam === 2); document.body.classList.toggle('driver-view',cam===1); layoutSoon();
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
    else if (e.code === 'KeyZ') holdLook('left', true);
    else if (e.code === 'KeyX') holdLook('right', true);
    else if (e.code === 'KeyB') look('interior');
    else if (e.code === 'KeyI') cockpitAction('engine');
    else if (e.code === 'KeyP') cockpitAction('parkingBrake');
    else if (e.code === 'KeyH') setHeadlights(!player.headlights);
    else if (e.code === 'Space' && A.test && A.test.running) e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    const k = KM[e.code]; if (k) key[k] = 0;
    if (e.code === 'KeyZ') holdLook('left', false); else if (e.code === 'KeyX') holdLook('right', false);
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
  // A glance in the mirror and a look over the shoulder are the same movement, held for longer:
  // a tap records the mirror, keeping it held records the blind spot behind it.
  const BLIND_SPOT_HOLD = 0.55;
  // How far the head turns, in radians. A door mirror is a glance of about 45 degrees; the blind spot
  // behind it is a real look over the shoulder, so it goes much further. The interior mirror is
  // almost straight ahead, so B barely moves the head at all.
  const LOOK = { mirror: 0.79, shoulder: 1.66, interior: 0.26 };
  const heldSince = { left: 0, right: 0 }, shoulder = { left: false, right: false };
  function holdLook(side, down) {
    if (down) {
      if (lookHold[side]) return;
      lookHold[side] = 1; heldSince[side] = A.traffic ? A.traffic.clock : 0; shoulder[side] = false;
      look(side === 'left' ? 'left' : 'right');
    } else { lookHold[side] = 0; shoulder[side] = false; }
  }
  // How far the head is turned right now: the mirror angle, opening out to the shoulder angle once the
  // hold has become a blind-spot check. Eased, so the view does not snap round the moment it registers.
  let swing = LOOK.mirror;
  const lookSwing = () => swing;
  function updateLookSwing(dt) {
    const side = lookHold.right ? 'right' : lookHold.left ? 'left' : null;
    const want = side && shoulder[side] ? LOOK.shoulder : LOOK.mirror;
    swing += (want - swing) * (1 - Math.exp(-dt * 6));
  }
  // called every frame: once the look has been held long enough it becomes a blind-spot check
  function updateHeldLooks() {
    if (!A.traffic || !A.test?.running) return;
    for (const side of ['left', 'right']) {
      if (!lookHold[side] || shoulder[side]) continue;
      if (A.traffic.clock - heldSince[side] < BLIND_SPOT_HOLD) continue;
      shoulder[side] = true; look(side === 'left' ? 'left-blindspot' : 'blindspot');
    }
  }
  $('lookBtn').addEventListener('click', () => look('interior'));
  // hold-to-look buttons for touch, matching the Z and X keys
  document.querySelectorAll('[data-look]').forEach(b => {
    const side = b.dataset.look;
    const on = e => { e.preventDefault(); holdLook(side, true); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { holdLook(side, false); b.classList.remove('on'); };
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
  // Manoeuvre lessons have exactly one control: release the parking brake to set off, apply it to park.
  // Reverse is the back arrow held down, as on every other drive.
  $('assessParking').addEventListener('click', () => {
    if (!A.test?.running || !plan?.lesson?.manoeuvre) return;
    const op = player.operation;
    if (!operate(op, 'parkingBrake', player.v, A.traffic.clock)) { banner('Stop first', 'warn'); setTimeout(() => banner(null), 2000); renderTrainingControls(); return; }
    if (op.parkingBrake) scenario?.finishAttempt();
    renderTrainingControls();
  });
  // What the coach line says, for a learner who has asked to be coached: the lesson's own brief for
  // the first few seconds, then whatever the scenario is reporting as it goes. Null switches it off,
  // which is every drive unless the setting is on.
  const COACH_BRIEF = 8; // seconds the brief stays up before the running line takes over
  function coachLine() {
    if (!coaching || !A.test?.running) return null;
    // the first sentence of the lesson's own brief: enough to start on, short enough for one line
    if (plan?.lesson?.goal && (A.test.elapsed || 0) < COACH_BRIEF) return plan.lesson.goal.split(/(?<=\.)\s+/)[0];
    const p = scenario?.progress;
    return p?.coach || p?.message || null;
  }
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
    $('trainingControls').hidden = parking || document.body.dataset.mode !== 'drive' || !player.operation.enabled;
    $('cockpitControls').hidden = !player.operation.enabled;
    $('cockpitState').hidden = parking;
    $('gearControls').hidden = parking || player.operation.transmission !== 'automatic';
    document.querySelectorAll('[data-gear]').forEach(b => { b.hidden = parking && b.dataset.gear === 'N'; b.setAttribute('aria-pressed', String(op.gear === b.dataset.gear)); });
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
  window.cambridgeDrive = { get personalJourney(){return personal?{id:personal.journey.recipe.id,progress:personal.progress,length:personal.journey.route.length,ready:personal.journey.ready,tiles:A.authoredTiles?.stats()||null}:null;}, addInput: (fn) => { extraInputs.push(fn); return () => { const i = extraInputs.indexOf(fn); if (i >= 0) extraInputs.splice(i, 1); }; }, look: () => look(), lanePoint: (s) => guide.lanePoint(A.test.route, s, A.net), pick: (kind, id, start) => pickPlan(hub.select(kind, id), start), get net() { return A.net; }, get test() { return A.test; }, player, get traffic() { return A.traffic; }, CAR, get area() { return A.id; }, ready: () => areaChain, get camera() { return camera; }, get scenario() { return scenario; }, get cockpitColour() { return bonnetM.color.getHex(); }, get wheelAngle() { return wheel.rotation.z; },
    get roadsidePlacements(){return A.world?.placements||[];},
    get importedScene() { return localTracks.has(A.id)?{sourceObjects:localTracks.get(A.id).objects.length,roads:localTracks.get(A.id).renderNetwork.edges.length,objects:scene.children.flatMap(m=>m.userData.authoredTile?m.children:[m]).filter(m=>m.userData.editorObjectId).map(m=>({id:m.userData.editorObjectId,mapFeature:m.userData.mapFeature||null,streetAsset:m.userData.streetAsset||null,shopSign:m.userData.shopSign||null,ukBuilding:m.userData.ukBuilding||null,ukFrontage:m.userData.ukFrontage||null,x:m.position.x,z:m.position.z,geometry:m.geometry?.type}))}:null; },
    // memory as the renderer and the scenery see it, for the sustained-drive benchmark
    perf: () => ({ chunks: A.world?.chunkCount() ?? 0, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length ?? 0, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }),
    get freeStats() { return freeStats; }, steerFor };
  let botInput = null, botMode = false, pinMesh = null,botSeed=null;
  function readInput() {
    if (botInput) { const r = botInput(); if (r) return r; }
    for (const fn of extraInputs) { const r = fn(); if (r) return r; }
    const k = { throttle: key.up || tch.up ? 1 : 0, brake: key.down || tch.down ? 1 : 0, steer: (key.left || tch.left ? 1 : 0) - (key.right || tch.right ? 1 : 0) };
    if (k.throttle || k.brake || k.steer) return k; // keys and touch always win
    return readPad() || k;
  }
  // A game controller or a USB wheel (the browser's standard mapping): the left stick or the wheel steers,
  // the right trigger accelerates and the left brakes; LB and RB indicate, Y checks the mirrors. It takes
  // over only once it has been touched, so a controller left plugged in never fights the keyboard.
  let padUsed = false; const padWas = [];
  function readPad() {
    const g = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!g) return null;
    const b = (i) => (g.buttons[i] ? g.buttons[i].value : 0), tap = (i) => { const on = b(i) > 0.5, was = padWas[i]; padWas[i] = on; return on && !was; };
    if (tap(4)) { player.signal('L'); sigBtns(); } if (tap(5)) { player.signal('R'); sigBtns(); } if (tap(3)) look('interior');
    // a small dead zone, then a gentle curve so small movements of the stick make small corrections
    const ax = g.axes[0] || 0, dz = 0.08, x = Math.abs(ax) < dz ? 0 : Math.sign(ax) * ((Math.abs(ax) - dz) / (1 - dz)) ** 1.6;
    const thr = b(7), brk = b(6);
    if (x || thr > 0.05 || brk > 0.05) padUsed = true;
    return padUsed ? { throttle: thr, brake: brk, steer: -x, analog: true } : null;
  }

  // ---------- drive flow ----------
  // Nothing is ever drawn over the road. What used to be a banner across the windscreen is now a
  // state on the HUD box, where the learner already looks for what to do next.
  const banner = (text, kind) => { if (A.test) A.test.alert = text ? { label: text, tone: kind || 'info' } : null; };
  // measured over one drive, for the feedback at the end
  const stats = { distance: 0, topSpeed: 0 };
  function showRunDetail(about) {
    const lines = runDetail({ ...about, stats, observations: player.observations });
    $('runDetailList').innerHTML = lines.map(line => `<li>${line.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('');
  }
  function onFinish() {
    voice.cancel();
    const test = A.test; if (test.experimental) return; if(plan?.kind==='personal'&&plan.graded){showPersonalMockResult(true);return;} if (scenario) scenario.stop(); $('againBtn').textContent = 'Try again';
    $('rD').textContent = test.D; $('rS').textContent = test.S;
    const v = $('verdict'), reasons = $('rReasons'), next = $('nextBtn');
    if (plan.kind !== 'mock') {
      const res = evaluate(plan.lesson, test, scenario), pz = plan.kind === 'puzzle';
      const report = buildReport({ lessonId: plan.lesson.id, scenarioId: plan.scenarioDefinition?.id, pass: res.pass, faults: test.faults, duration: test.elapsed, objectives: plan.lesson.objectives || plan.lesson.steps, evidence: { observations: player.observations.map(e => ({ ...e })), controls: player.operation.events.map(e => ({ ...e })), scenarioEvents: scenario?.events || [], objectiveResult: scenario?.result ? scenario.result() : null } });
      $('coachingReport').textContent = report.summary + (report.practice.length ? ' ' + report.practice.map(p => `${p.category} (${p.evidence}): ${p.advice}`).join(' ') : '');
      showRunDetail({ kind: plan.kind, lesson: plan.lesson, test, scenario });
      if (!botMode && driveScope === learnerScope()) hub.Profiles.recordLesson(plan.lesson.id, { pass: res.pass, D: test.D, S: test.S, duration: test.elapsed, report, stars: res.stars, mode: res.mode }); // bot runs never touch a learner's progress
      $('endTag').textContent = 'Lesson complete';
      v.textContent = res.pass ? 'Lesson passed' : 'Not yet'; v.className = 'verdict ' + (res.pass ? 'pass' : 'fail');
      // the stars this drive earned, from the marking it was driven on: one for Easy, two for Medium, three for Hard
      const n = res.stars || 0, mode = modeOf(res.mode);
      $('rNote').innerHTML = `<span class="stars big" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => STAR(i <= n)).join('')}</span>` + plan.lesson.title.replace(/[<>&]/g, '') + ` · marked on ${mode.title}`;
      reasons.innerHTML = res.reasons.map(r => `<li>${r}</li>`).join('');
      const nx = res.pass ? hub.next(plan) : null; next.hidden = !nx;
      if (nx) { next.dataset.kind = nx.kind; next.dataset.id = nx.id; next.textContent = 'Next lesson'; }
      $('testState').textContent = res.pass ? 'Lesson passed' : 'Not passed yet';
    } else {
      const j = judgeMock(test.marking, test), pass = j.pass, mode = modeOf(j.mode);
      if (!botMode && driveScope === learnerScope()) hub.Profiles.recordMock(ROUTES[plan.index].id, { pass, D: test.D, S: test.S, duration: test.elapsed, mode: j.mode, stars: j.stars, report: buildReport({ pass, faults: test.faults, duration: test.elapsed }) });
      $('endTag').textContent = 'Mock test complete';
      v.textContent = pass ? 'Pass. Well driven.' : 'Not this time'; v.className = 'verdict ' + (pass ? 'pass' : 'fail');
      const real = mode.id === 'hard' ? '' : ` Marked on ${mode.title}; the real test is Hard (15 driving faults, no serious).`;
      $('rNote').innerHTML = `<span class="stars big" aria-label="${j.stars} of 3 stars">${[1, 2, 3].map(i => STAR(i <= j.stars)).join('')}</span>` + (pass ? (test.D ? `You picked up ${test.D} driving fault${test.D > 1 ? 's' : ''}. The marking sheet shows where.` : 'A clean drive with no faults recorded.')
        : (test.S > j.maxS ? `${test.S} serious fault${test.S > 1 ? 's' : ''} means a fail. The marking sheet shows what to work on.` : j.collision ? 'A collision is never forgiven. The marking sheet shows what to work on.' : `More than ${j.maxD} driving faults means a fail. The marking sheet shows what to work on.`)) + real;
      $('coachingReport').textContent = test.faults.map(f => f.cat + ': ' + f.text).join(' ') || 'No faults recorded in this mock test.';
      showRunDetail({ kind: 'mock', lesson: null, test, scenario });
      reasons.innerHTML = ''; next.hidden = true;
      $('testState').textContent = pass ? 'Passed' : 'Failed';
    }
    $('resultSheet').hidden = false; hub.render();
  }
  function pause() { voice.cancel(); if (!A.test || !A.test.running) return; paused = true; A.test.running = false; releaseControls(); $('pauseSheet').hidden = false; }
  function resume() { if (!paused) return; paused = false; A.test.running = true; $('pauseSheet').hidden = true; }
  function toLobby() {
    voice.cancel();
    stopPersonal();
    document.body.classList.remove('free-drive'); applyTimeOfDay('day');
    if (A.test) A.test.running = false; paused = false; if (scenario) { scenario.stop(); scenario = null; } banner(null);
    $('pauseSheet').hidden = true; $('resultSheet').hidden = true; setMode('lobby'); hub.open();
  }
  function begin() {
    voice.cancel();
    if(!canAccessPlan(plan)){hub.requestAccess();return;}
    driveScope = learnerScope();
    paused = false; $('pauseSheet').hidden = true; $('resultSheet').hidden = true; hub.closeSheets(); setMode('drive');
    loadPlan(plan);
    if(plan.kind==='personal'&&personal){personal.progress=0;personal.complete=false;personal.seconds=0;personal.distance=0;}
    // Every mock test includes a blue-light vehicle; lessons get their own scripted event.
    const deps = { net: A.net, traffic: A.traffic, test: A.test, player, ui: { banner }, get scene() { return scene; }, body: () => policeModel && policeModel.clone(true) };
    scenario = A.test.experimental ? null : plan.kind === 'mock' ? createEmergencyEvent(deps) : plan.kind === 'free'||plan.kind==='personal' ? null : createScenario(plan.lesson, deps);
    ui.pinTip(plan.lesson ? plan.lesson.rule : null, plan.lesson ? plan.lesson.title : '');
    // What to do is on the lesson card before you press Start, and what you did is in the feedback
    // afterwards. The drive itself carries only the short stage label in the HUD.
    stats.distance = 0; stats.topSpeed = 0; stats.chaseSeconds = 0; chaseAuto = -1;
    sigBtns(); A.test.running = true; A.test.elapsed = 0; A.test.startedAt = A.traffic.clock;
    A.test.context = { lessonId: plan.lesson?.id || null, scenarioId: plan.scenarioDefinition?.id || null, areaId: A.id }; banner(null); renderTrainingControls();
    $('testState').textContent = A.test.experimental ? 'Experimental practice · no grading or recorded results' : plan.graded ? 'Custom mock · Hard' : plan.kind === 'mock' ? 'In progress' : plan.kind === 'free' ? 'Free drive · ' + plan.drive.title : 'Lesson · ' + plan.lesson.title;
    A.test.coach = coachLine();
    ui.hud(player, A.test, true); renderTrainingControls();
    lastStep = -1;
  }
  $('pauseBtn').addEventListener('click', pause);
  $('resumeBtn').addEventListener('click', resume); $('resumeX').addEventListener('click', resume);
  $('quitBtn').addEventListener('click', () => plan?.kind==='personal'?(plan.graded?showPersonalMockResult(false):showPersonalSummary(false)):plan?.kind === 'free' && A.test?.ungraded ? showFreeSummary() : toLobby()); $('hubBtn').addEventListener('click', toLobby);
  $('nextBtn').addEventListener('click', () => { const b = $('nextBtn'); pickPlan(hub.select(b.dataset.kind, b.dataset.id), true); });
  async function restartDrive(){return begin();}
  $('againBtn').addEventListener('click', restartDrive); $('restartBtn').addEventListener('click', restartDrive);
  $('camBtn').addEventListener('click', () => setCam((cam + 1) % 3, true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('backBtn').addEventListener('click', () => {
    if (plan?.lesson?.manoeuvre) return;
    if (A.test.experimental) { begin(); return; }
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
  const setSh = (on) => { shadowsOn = on; if (A.world) A.world.setShadows(on && !lowPower); seg('#shSeg [data-sh]', 'sh', on ? 1 : 0); prefs.sh = on ? 1 : 0; savePrefs(); };
  document.querySelectorAll('#shSeg [data-sh]').forEach(b => b.addEventListener('click', () => setSh(b.dataset.sh === '1')));
  const setMi = (on) => { mirrors.enabled = on; document.body.classList.toggle('no-mirrors', !on); seg('#miSeg [data-mi]', 'mi', on ? 1 : 0); prefs.mi = on ? 1 : 0; savePrefs(); layoutSoon(); };
  document.querySelectorAll('#miSeg [data-mi]').forEach(b => b.addEventListener('click', () => setMi(b.dataset.mi === '1')));
  // Coaching: a running line of instruction for learners who want one. Off by default, because the
  // lesson card has already said what to do and the view is what matters while driving.
  // Low-power graphics: fewer pixels, no shadows, no light pools or headlight beam. For phones and
  // older laptops; the drive and the assessment are exactly the same.
  const setLp = (on) => {
    lowPower = on; mirrors.quality(on); renderer.setPixelRatio(on ? Math.min(window.devicePixelRatio || 1, 1) * 0.8 : Math.min(window.devicePixelRatio || 1, 1.75));
    if (A.world) { A.world.setShadows(on ? false : shadowsOn); A.world.setTimeOfDay(dusk ? 'dusk' : 'day', { lowPower }); }
    seg('#lpSeg [data-lp]', 'lp', on ? 1 : 0); prefs.lp = on ? 1 : 0; savePrefs(); resize();
  };
  document.querySelectorAll('#lpSeg [data-lp]').forEach(b => b.addEventListener('click', () => setLp(b.dataset.lp === '1')));
  const setCo = (on) => { coaching = on; seg('#coSeg [data-co]', 'co', on ? 1 : 0); prefs.co = on ? 1 : 0; savePrefs(); if (A.test) A.test.coach = null; };
  document.querySelectorAll('#coSeg [data-co]').forEach(b => b.addEventListener('click', () => setCo(b.dataset.co === '1')));
  const setGd = (on) => { guide.enabled = on; seg('#gdSeg [data-gd]', 'gd', on ? 1 : 0); prefs.gd = on ? 1 : 0; savePrefs(); };
  document.querySelectorAll('#gdSeg [data-gd]').forEach(b => b.addEventListener('click', () => setGd(b.dataset.gd === '1')));
  // touch control size, 100-300% (capped so the controls always fit the screen)
  const ctl = $('ctlSize'), setTs = (v) => { document.querySelector('.touch').style.setProperty('--ts', v / 100); $('ctlSizeV').textContent = v + '%'; ctl.value = v; };
  setTs(prefs.ts || 300); ctl.addEventListener('input', () => { prefs.ts = +ctl.value; savePrefs(); setTs(prefs.ts); });

  // Shared physical cockpit; instruments read the simulation without changing it.
  const interior = createCockpit(T,{camera,mirrors,seat,car:CAR});
  const cockpit=interior.group,wheel=interior.wheel,bonnetM=interior.bonnetMaterial;
  scene.add(camera);
  const WHEEL_LOCK=2.3;
  function fitCockpit(model){interior.fit(carMetrics(model));camInit=false;}
  Object.defineProperty(window.cambridgeDrive,'cockpit',{get:()=>interior.telemetry});
  player.onModel = (m) => { fitCockpit(m); if (!m.getObjectByName('lamps')) attachLamps(m); };
  if (player.model) player.onModel(player.model);
  if (!player.mesh.getObjectByName('lamps')) attachLamps(player.mesh);
  // the learner's dipped headlights: H, or the lights button, which only shows at dusk
  const setHeadlights = (on) => { player.headlights = on; $('lightsBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); };
  $('lightsBtn').addEventListener('click', () => setHeadlights(!player.headlights));
  function applyTimeOfDay(tod) {
    dusk = tod === 'dusk'; document.body.classList.toggle('dusk', dusk);
    if (A.world) A.world.setTimeOfDay(tod, { lowPower });
    for (const slot of carPool) setLamps(slot.children[0], dusk);
    $('lightsBtn').hidden = !dusk;
  }

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

  // How far down the screen the interface reaches at the top: the instruction box and the right-hand
  // cluster. Measured from the page rather than assumed, because the controls are a much bigger share
  // of a phone held sideways than of a desktop window. Re-measured when the window changes shape.
  // Where the interface already reaches, measured from the page itself: the bottom of the instruction
  // box, and the inside edges of the map and the speedometer cluster. The rear-view panel is placed
  // from these, so it follows the controls instead of assuming a share of the screen that only holds
  // on one shape of window. Measured each frame it is used, because a cached figure goes stale the
  // moment the window is resized or the phone is turned.
  function hudChaseBox() {
    const rect = sel => { const el = document.querySelector(sel); if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect(); return r.width ? r : null; };
    const centre = rect('#hudNextBox'); if (!centre) return null;
    const left = rect('.hud-map'), right = rect('.hud-right');
    return { below: centre.bottom, left: left ? left.right : 0, right: right ? right.left : window.innerWidth,
      viewW: window.innerWidth, viewH: window.innerHeight };
  }

  // ---------- camera ----------
  const camPos = new T.Vector3(), camLook = new T.Vector3(); let farMode = -2, orbit = 0, lookBlend = 0;
  function updateCamera(dt) {
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), rx = -fz, rz = fx; let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-dt * 4.2);
    const lobby = document.body.dataset.mode === 'lobby';
    if (lookAnim > 0) lookAnim = Math.max(0, lookAnim - dt / 1.1);
    updateLookSwing(dt);
    const lookTarget = (lookHold.right ? 1 : 0) - (lookHold.left ? 1 : 0);
    lookBlend += (lookTarget - lookBlend) * (1 - Math.exp(-dt * 9));
    if (Math.abs(lookBlend - lookTarget) < 0.002) lookBlend = lookTarget;
    if (lobby) { orbit += dt * 0.12; const a = player.th + 2.4 + Math.sin(orbit) * 0.7; px = player.x + Math.sin(a) * 7.2; py = 2.3; pz = player.z + Math.cos(a) * 7.2; lx = player.x; ly = 0.85; lz = player.z; k = 1 - Math.exp(-dt * 3); }
    else if (cam === 0) { const P = camera.aspect < 1, z = chaseZ, b = (P ? 7 : 6.2) * z, h = 1.25 + (P ? 2.4 : 1.4) * z, a = P ? 4 : 6;
      // looking round swings the camera about the car; the car itself is unaffected
      const ya = lookBlend * lookSwing() * 0.8, c = Math.cos(ya), sn = Math.sin(ya), gx = fx * c + rx * sn, gz = fz * c + rz * sn;
      px = player.x - gx * b; py = h; pz = player.z - gz * b; lx = player.x + gx * a; ly = P ? -1.6 : 1.1; lz = player.z + gz * a; k = 1 - Math.exp(-dt * 7); } // close behind the car, so it fills the view
    else if (cam === 1) {
      const s = seat; px = player.x + rx * s.x + fx * -s.z; py = s.y; pz = player.z + rz * s.x + fz * -s.z;
      // a held look wins over the B glance; both only turn the driver's head, never the car
      const glance = lookAnim > 0 ? Math.sin(Math.PI * (1 - lookAnim)) * LOOK.interior : 0;
      const turn = lookBlend !== 0 ? lookBlend * lookSwing() : glance, lfx = fx * Math.cos(turn) + rx * Math.sin(turn), lfz = fz * Math.cos(turn) + rz * Math.sin(turn);
      lx = px + lfx * 20; ly = 0.9; lz = pz + lfz * 20; k = 1;
    }
    else { lx = player.x + ov.px; ly = 0; lz = player.z + ov.pz; px = lx; py = ov.h; pz = lz + ov.h * 0.38; k = 1 - Math.exp(-dt * 12); }
    const mode = cam === 2 && !lobby ? Math.round(ov.h / 20) : -1;
    if (mode !== farMode && scene.fog) {
      farMode = mode; const extra = mode >= 0 ? ov.h : 0;
      scene.fog.near = WORLD.fogNear + extra; scene.fog.far = WORLD.fogFar + extra; camera.far = WORLD.fogFar + 200 + extra; camera.updateProjectionMatrix();
    }
    showCamRecentre();
    cockpit.visible = cam === 1 && !lobby; player.mesh.visible = cam !== 1 || lobby; wheel.rotation.z = player.steer * WHEEL_LOCK;
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
  setCam(portrait() ? (prefs.camP ?? 0) : (prefs.cam ?? 1)); setSh(prefs.sh !== 0); setMi(prefs.mi !== 0); setGd(prefs.gd !== 0); setCo(prefs.co === 1); setLp(prefs.lp === 1);

  let last = performance.now(), uiT = 0, mapT = 0, sigT = 0, chunkT = 0, lastStep = -1, lastRoute = null;
  // In the chase view the mirrors are always on screen, and the car's surroundings with them, so there is
  // nothing to check by pressing a key: mirror and shoulder checks count as made the whole time and are not
  // marked. The result says so. The mirror-practice lesson, whose whole point is the routine, still asks for
  // it; the Bot lab and the browser checks make their own looks.
  let chaseAuto = -1;
  function chaseMirrors(dt, now) {
    if (cam !== 0 || botMode || plan?.lesson?.scenario === 'mirrors') return;
    stats.chaseSeconds = (stats.chaseSeconds || 0) + dt;
    if (now - chaseAuto < 0.4 && now >= chaseAuto) return;
    chaseAuto = now;
    const obs = player.observations, keepFrom = now - 15;
    for (let i = obs.length - 1; i >= 0; i--) if (obs[i].auto && obs[i].at < keepFrom) obs.splice(i, 1);
    for (const view of ['interior', 'left', 'right', 'blindspot']) obs.push({ view, at: now, x: player.x, z: player.z, auto: true });
    player.lookAt = now;
  }
  function sim(dt) {
    const { traffic, test, net } = A;
    traffic.update(dt, player);
    if (test.running && !test.experimental) test.elapsed = (test.elapsed || 0) + dt;
    if (test.running && scenario && !plan?.lesson?.manoeuvre) scenario.update(dt, traffic.clock);
    if (test.running) {
      const nr = nearest(net, player.x, player.z);
      const previous = {x:player.x,z:player.z};
      const verge = nr && /^motorway/.test(nr.way.cls) ? 0.6 : 2.6; // a motorway has a verge, not a footway
      player.update(dt, readInput(), nr && nr.d > paved(nr.way) + verge && !onPaved(net, player.x, player.z, verge) && !inFillet(net, player.x, player.z) ? 'off' : 'road');
      chaseMirrors(dt, traffic.clock);
      const authored = localTracks.get(A.id);
      if(authored && obstacleContact(player,A.obstacleIndex.near(previous,player),previous)) test.fault("S","Control – collision","Collided with authored scenery","authored-collision",4);
      test.update(dt);
      stats.distance += Math.abs(player.v) * dt; stats.topSpeed = Math.max(stats.topSpeed, Math.abs(player.v));
      if(plan?.kind==='personal')stepPersonal(dt);
      if (plan?.kind === 'free') stepFreeDrive(dt);
      updateHeldLooks();
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
    if(dt>0)sim(dt);
    A.authoredTiles?.update(player.x,player.z,cam===2?WORLD.fogFar+200+ov.h:0);
    player.sync(traffic.clock);
    $('sigL').classList.toggle('on', player.indicator === 'L' && Math.floor(traffic.clock * 3) % 2 === 0);
    $('sigR').classList.toggle('on', player.indicator === 'R' && Math.floor(traffic.clock * 3) % 2 === 0);
    sigT += dt; if (sigT > 0.15) { sigT = 0; world.updateSignals(traffic.clock); }
    chunkT += dt; if (chunkT > 0.25) { chunkT = 0; const o = cam === 2 && drive; world.updateChunks(player.x + (o ? ov.px : 0), player.z + (o ? ov.pz : 0), o ? 2 : 1, o ? WORLD.fogFar + 200 + ov.h : 0); }
    // lamps: the learner's tail lights at dusk, headlights when switched on, and the beam on the road
    setLamps(player.mesh, dusk, !!player.headlights);
    { const blink = Math.floor(traffic.clock * 3) % 2 === 0; for (const c of traffic.cars) if (c.mesh.visible) setIndicators(c.mesh, c.ind, blink); } // everyone's indicators, flashing with the learner's
    headBeam.visible = dusk && !!player.headlights && !lowPower;
    if (headBeam.visible) { const fx = -Math.sin(player.th), fz = -Math.cos(player.th); headBeam.position.set(player.x + fx * 2, 0.8, player.z + fz * 2); headBeam.target.position.set(player.x + fx * 32, 0, player.z + fz * 32); }
    updateCamera(dt); world.updateSun(cam === 2 && drive ? player.x + ov.px : player.x, cam === 2 && drive ? player.z + ov.pz : player.z);
    guide.update(test, traffic.clock, A.net); guide.group.visible = guide.group.visible && drive && !plan?.lesson?.manoeuvre;
    if (plan?.lesson?.manoeuvre && scenario?.progress) { const p = scenario.progress; world.setParkingTarget(p.target,p.path,gradeParking(p.target,player)); world.showParkingGuide(guide.enabled); }
    mirrors.layoutChase(camera, drive && cam === 0, drive && cam === 0 ? hudChaseBox() : null);
    if (drive && cam === 1) mirrors.fitView(camera);
    if (drive && cam < 2) { const gv = guide.group.visible; guide.group.visible = false; mirrors.update(scene, player, cam === 1 ? 'cockpit' : 'chase'); guide.group.visible = gv; }
    if(drive&&cam===1)interior.update(player,test,A.net,traffic.clock,{lowPower});
    if(drive||botMode)renderer.render(scene, camera);
    uiT += dt; if (uiT > 0.1) { uiT = 0; test.coach = coachLine(); ui.hud(player, test, test.running || paused); renderTrainingControls(); if (test.step !== lastStep || test.route !== lastRoute) { lastStep = test.step; lastRoute = test.route; ui.renderSteps(test.route, test.step); if(test.running&&drive)voice.say(test.route.instructions[test.step]?.text||test.route.instructions[test.step]?.short); } }
    mapT += dt; if (mapT > 0.05) { mapT = 0; ui.drawMap(player, test.route, test.step, traffic.clock); }
  }
  requestAnimationFrame(frame);

  setMode('lobby'); hub.open();
  // bot lab: open the sim with ?bots to run and watch the test driver on any lesson, puzzle or mock test
  if (/[?&]bots\b/.test(location.search)) createBotLab({
    openMyRoutes:openPersonal,
    async openGoogleOverlay(){const track=localTracks.get(A.id);if(!track)throw Error('Load a generated My routes practice map first.');const {openGoogleOverlay}=await import('./map-review/google-overlay.js');const wasPaused=paused;paused=true;openGoogleOverlay(track,{onClose:()=>{paused=wasPaused;}});},
    previewExample:!!document.querySelector('meta[name=world-data-index]'),
    async loadExample(){
      const response=await fetch(new URL('data/world/water-street-route.json',document.baseURI));if(!response.ok)throw Error('Preview example could not load.');
      const recipe=await response.json(),store=routeStore();store.save(recipe);
      const {createJourney}=await import('./personal/client.js');const journey=createJourney(recipe,{store});
      try{const world=await journey.prepare();await startPersonal(journey,world);}catch(error){journey.cancel();throw error;}
    },
    isPersonal:()=>plan?.kind==='personal',
    sourceEvidence:()=>{const track=localTracks.get(A.id);return track?.osm?{generator:track.osm.generator,datasetVersion:track.osm.datasetVersion,validation:track.osm.validation}:null;},
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
    estopBanner: () => A.test?.alert?.tone === 'stop',
    setInput: (fn) => { botInput = fn; },
    botMode: (on) => { botMode = on; manual = on; },
    async start(kind, id, seed, { traffic = 'lesson' } = {}) {
      botSeed=seed;
      if(kind==='personal'){if(!personal||plan.kind!=='personal')throw Error('Open My routes, then load a practice drive first.');if(personal.graded)throw Error('Choose Practice drive for map validation, not a graded mock.');begin();if(traffic==='random'){A.traffic.setDensity('normal');A.traffic.reset(player.x,player.z,seed);}return;}
      const pl = kind === 'mock' ? { kind: 'mock', key: 'route:' + id, index: ROUTES.findIndex(r => r.id === id) } : hub.select(kind, id);
      await pickPlan(pl, true); await areaChain;
      // random traffic on top of whatever the lesson places, from this run's seed: a lesson with its own
      // scripted traffic otherwise meets exactly the same drive every time
      if (traffic === 'random') { A.traffic.setDensity('normal'); A.traffic.reset(player.x, player.z, seed); }
    },
    result: () => plan.kind==='personal'?{pass:null,completed:!!personal?.complete,why:'Driving check only; geographic accuracy is not assessed'}:plan.kind === 'mock' ? { pass: A.test.passed(), why: '' } : evaluate(plan.lesson, A.test, scenario),
    plans: [{kind:'personal',id:'current',title:'Current My routes map'},...LESSONS.filter(l => l.waypoints).map(l => ({ kind: 'lesson', id: l.id, title: l.title })), ...PUZZLES.map(p => ({ kind: 'puzzle', id: p.id, title: p.title })), ...ROUTES.map(r => ({ kind: 'mock', id: r.id, title: 'Mock: ' + r.name }))]
  });
  await areaChain; await new Promise(r => setTimeout(r, 0));
  $('loadOv').hidden = true;
}

boot().catch(err => { console.error(err); setLoad(err.message || 'Something went wrong while loading.'); const b = $('loadErr'); if (b) b.hidden = false; });
