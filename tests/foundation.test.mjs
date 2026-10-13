import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LESSONS, evaluate } from '../js/course.js';
import { availability, recommendedLesson, validateCurriculum } from '../js/curriculum.js';
import { scenariosFor, resolveScenario, registerLocation } from '../js/scenarios.js';
import { buildNet, buildRoute, snapWaypoint } from '../js/net.js';
import { createVehicleState, canDrive, operate } from '../js/vehicle-state.js';
import { createBasicScenario } from '../js/basic-scenarios.js';
import { createTest } from '../js/test.js';
import { buildReport } from '../js/reports.js';
const find = id => LESSONS.find(l => l.id === id);

test('37 lessons retain all 29 legacy IDs and have valid metadata', () => {
  assert.equal(LESSONS.length, 37); assert.deepEqual(validateCurriculum(LESSONS), []);
  for (const id of ['move-off','speed','estop','turn-left','turn-right','lights','amber','emerge-left','emerge-right','lane-choice','right-lights','mini','rb-left','rb-ahead','rb-right','rb-big','rb-lights','dutch','zebra','cyclists','ped-crossing','cycle-left','follow','country','dual','q-showme','q-signs','q-stopping','q-priority']) assert.ok(find(id), id);
});
test('validator rejects missing prerequisites, duplicate IDs and cycles', () => {
  const l = find('cockpit-drill'); assert.ok(validateCurriculum([{...l, prerequisites:['missing']}]).some(e=>e.includes('unknown')));
  assert.ok(validateCurriculum([l,l]).some(e=>e.includes('Duplicate')));
  assert.ok(validateCurriculum([{...l, prerequisites:[l.id]}]).some(e=>e.includes('cycle')));
});
test('legacy lessons stay open and engine lesson unlocks with actual completion', () => {
  assert.equal(availability(find('move-off'), null).available, true);
  assert.equal(availability(find('engine-control'), null).available, false);
  const p = { lessons:{'cockpit-drill':{passed:true}} };
  assert.equal(availability(find('engine-control'), p).available, true);
  assert.equal(recommendedLesson(LESSONS,p,'cockpit-drill').id,'engine-control');
  assert.equal(availability(find('engine-control'),{lessons:{'engine-control':{passed:true}}}).available,true);
});
test('every practical lesson scenario loads an indexed area and a connected nonempty route', () => {
  const index = JSON.parse(fs.readFileSync('data/areas/index.json'));
  for (const l of LESSONS.filter(l=>l.mode==='practical')) for (const scenario of scenariosFor(l)) {
    const s = resolveScenario(l,scenario.id), area = index.areas.find(a=>a.id===s.location.areaId);
    assert.ok(area,scenario.id);
    const net = buildNet(JSON.parse(fs.readFileSync('data/areas/'+area.file)));
    const nodes = s.location.waypoints.map(w=>snapWaypoint(net,w));
    assert.ok(nodes.every(n=>Number.isInteger(n)&&n>=0));
    const r = buildRoute(net,nodes); assert.ok(r.len>50 && r.steps.length, scenario.id);
    assert.equal(index.plans['lesson:'+l.id].area, area.id);
  }
});
test('location adapters can resolve another area without curriculum coordinate changes', () => {
  const l = {...find('controlled-stop'), locationAdapter:'test-adapter'};
  registerLocation('test-adapter',{resolve:()=>({areaId:'elsewhere',waypoints:[{node:1},{node:2}]})});
  assert.equal(resolveScenario(l).location.areaId,'elsewhere');
  assert.throws(()=>resolveScenario(l,'bad'),/Unknown/);
  assert.throws(()=>resolveScenario({...l,locationAdapter:'missing'}),/Unsupported/);
});
test('cockpit controls interlock motion, reject unsafe inputs and retain legacy motion', () => {
  assert.equal(canDrive(createVehicleState()),true);
  const s=createVehicleState(true); assert.equal(canDrive(s),false); assert.equal(operate(s,'engine',0,1),false);
  for (const a of ['doorClosed','seatSet','mirrorsSet','belt']) assert.equal(operate(s,a,0,2),true);
  assert.equal(operate(s,'engine',2,3),false); assert.equal(operate(s,'engine',0,3),true);
  assert.equal(canDrive(s),false); operate(s,'parkingBrake',0,4); assert.equal(canDrive(s),true);
  assert.deepEqual(s.events.at(-1),{action:'parkingBrake',value:false,at:4});
});
function harness(id) {
  const player={x:0,z:0,v:0,operation:createVehicleState(true),observations:[],inp:{throttle:0,brake:0}};
  const traffic={clock:10}; const t={sRoute:0,route:{len:310},faults:[],finish(){this.done=true;},fault(...f){this.faults.push(f);}};
  const s=createBasicScenario(find(id),{player,test:t,traffic,ui:{banner(){}}});
  return {player,traffic,t,s};
}
test('cockpit and engine drills cannot complete without required inputs', () => {
  for (const id of ['cockpit-drill','engine-control']) {
    const {player:p,traffic,t,s}=harness(id); s.update(.1); assert.equal(t.done,undefined); assert.equal(s.result().ok,false);
    for(const a of ['doorClosed','seatSet','mirrorsSet','belt']) operate(p.operation,a,0,traffic.clock);
    if(id==='engine-control') { s.update(.1); assert.equal(t.done,undefined); operate(p.operation,'engine',0,11); s.update(.1); assert.equal(t.done,undefined); operate(p.operation,'engine',0,12); }
    s.update(.1); assert.equal(t.done,true); assert.equal(s.result().ok,true);
  }
});
test('controlled stop fails on overshoot and passes only after braking in range', () => {
  for(const overshoot of [true,false]) { const {player:p,t,s}=harness('controlled-stop'); t.sRoute=50;p.v=5;s.update(.1);assert.equal(s.result().ok,false);
    t.sRoute=overshoot?81:70;p.v=0;p.inp.brake=1;s.update(.1); assert.equal(s.result().ok,!overshoot);assert.equal(t.faults.length,overshoot?1:0); }
});
test('acceleration target requires continuous time and a subsequent release and slowdown', () => {
  const {player:p,traffic,t,s}=harness('accel-decel'); p.v=5;p.inp.throttle=1;s.update(2);p.v=2;s.update(.1);p.v=5;s.update(2);assert.equal(s.result().ok,false);
  s.update(1.1);p.v=3;traffic.clock++;s.update(.1);assert.equal(s.result().ok,false);p.inp.throttle=0;s.update(.1);assert.equal(s.result().ok,true);
});
test('mirror exercise only counts explicitly captured views before and after moving', () => {
 const {player:p,traffic,t,s}=harness('mirror-practice');p.observations=[{view:'all-round',at:10}];p.v=1;s.update(.1);assert.equal(t.faults.length,1);assert.equal(s.result().ok,false);
 const h=harness('mirror-practice');h.player.observations=['interior','right','blindspot'].map(view=>({view,at:10}));h.player.v=1;h.s.update(.1);
 h.traffic.clock=12;h.player.observations.push(...['interior','right','blindspot'].map(view=>({view,at:12})));h.t.sRoute=290;h.s.update(.1);assert.equal(h.s.result().ok,true);
});
test('fault log context and deduplication; mock and lesson pass boundaries', () => {
 const traffic={clock:0}, player={x:1,z:2};const t=createTest({},traffic,player);t.route={instructions:[]};t.reset();t.running=true;t.context={scenarioId:'test'};t.startedAt=0;
 t.fault('D','Control','measured','collision',8);t.fault('D','Control','repeat','collision',8);assert.equal(t.D,1);assert.equal(t.faults[0].context.scenarioId,'test');
 traffic.clock=8;t.fault('D','Control','next','collision',8);assert.equal(t.D,2);assert.equal(t.faults[0].elapsed,8);
 t.D=15;assert.equal(t.passed(),true);t.D=16;assert.equal(t.passed(),false);t.D=0;t.S=1;assert.equal(t.passed(),false);
 assert.equal(evaluate(find('controlled-stop'),{D:0,S:0,faults:[]},{result:()=>({ok:false,why:'missing objective'})}).pass,false);
});
test('reports describe recorded evidence and cannot turn a fail into a pass', () => {
 const r=buildReport({pass:false,faults:[{cat:'Use of speed',text:'Exceeded limit'}],duration:10});assert.equal(r.pass,false);assert.equal(r.practice[0].evidence,1);assert.equal(r.duration,10);
});

test('unsupported scenario conditions and unknown location IDs fail explicitly', () => {
 const l = {...find('controlled-stop'), scenarioVariants:[{id:'wet',title:'Wet',trafficDensity:'unsupported'}]};
 assert.throws(()=>resolveScenario(l),/Unsupported scenario conditions/);
 assert.throws(()=>resolveScenario({...find('controlled-stop'),locationId:'unknown'}),/Unknown practice location/);
});
