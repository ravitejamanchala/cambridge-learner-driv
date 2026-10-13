import test from 'node:test';
import assert from 'node:assert/strict';
import { rectangleCorners, containsVehicle, gradeParking, rectanglesOverlap, sweptContact, VEHICLE_ENVELOPE } from '../js/parking-geometry.js';
import { PARKING_LAYOUT, parkingPlan } from '../js/parking-layout.js';
import { createParkingScenario } from '../js/parking-scenario.js';
import { createAutomaticState } from '../js/vehicle-state.js';
import { buildLayout } from '../tools/layouts.mjs';
const target=PARKING_LAYOUT.bay;
test('parking requires every corner, correct facing and a complete stop',()=>{
 assert.equal(rectangleCorners({...target,...VEHICLE_ENVELOPE}).length,4);
 assert.equal(gradeParking(target,{...target,v:0}).valid,true);
 assert.equal(containsVehicle(target,{...target,z:1}),false);
 assert.equal(gradeParking(target,{...target,th:target.th+Math.PI}).aligned,false);
 assert.equal(gradeParking(target,{...target,v:.3}).valid,false);
});
test('rotated vehicle contact uses separating axes, not centre proximity',()=>{
 const car={x:0,z:0,th:Math.PI/4,...VEHICLE_ENVELOPE};
 assert.equal(rectanglesOverlap(car,{...car,x:.5}),true);
 assert.equal(rectanglesOverlap(car,{...car,x:8}),false);
});
test('swept collision catches a parked car passed between frames and the boundary',()=>{
 const obstacle=PARKING_LAYOUT.obstacles[0];
 assert.equal(sweptContact({x:5,z:obstacle.z,th:-Math.PI/2},{x:14,z:obstacle.z,th:-Math.PI/2},PARKING_LAYOUT),obstacle.id);
 assert.equal(sweptContact({x:0,z:0,th:0},{x:20,z:0,th:0},PARKING_LAYOUT),'boundary');
 assert.equal(sweptContact({x:0,z:14,th:0},{x:0,z:13,th:0},PARKING_LAYOUT),null);
});
test('all authored parking starts and references fit inside the real generated pad',()=>{
 const layout=buildLayout('parking');assert.deepEqual(layout.parking,PARKING_LAYOUT);
 for(const kind of ['forward-bay','reverse-bay','leave-bay']){
  const spec=parkingPlan(kind);assert.equal(containsVehicle(layout.parking.bounds,spec.start),true);
  for(const leg of spec.legs)assert.ok(leg.path.every(p=>Math.abs(p.x)<15&&p.z> -30&&p.z<32));
 }
 assert.throws(()=>parkingPlan('unknown'),/Unknown/);
});
function harness(kind='forward-bay'){
 const plan=parkingPlan(kind);const player={...plan.start,v:0,operation:createAutomaticState(),observations:[],place(x,z,th){Object.assign(this,{x,z,th,v:0});}};
 const test={faults:[],fault(...f){this.faults.push(f);},finish(){this.done=true;}};const traffic={clock:10};
 const scenario=createParkingScenario({manoeuvre:true,parkingKind:kind},{net:{parking:PARKING_LAYOUT},player,test,traffic,ui:{banner(){}}});return {player,test,traffic,scenario,plan};
}
test('no movement and a secured car outside the target fail assessment',()=>{
 const {player:p,test:t,scenario:s}=harness();p.operation.engine=false;
 assert.equal(s.finishAttempt(),true);assert.equal(t.done,true);assert.equal(s.result().ok,false);assert.equal(t.faults[0][1],'Manoeuvre – accuracy');
});
test('target reached before securing cannot pass; moving away again invalidates the finish',()=>{
 const {player:p,scenario:s,plan}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];
 // Feed measured physical states to the unit-level assessor; integration tests use actual driving.
 for(const q of plan.legs[0].path.slice(1)){const th=Math.atan2(-(q.x-p.x),-(q.z-p.z));Object.assign(p,q,{th,v:.8});s.update(1);}
 Object.assign(p,plan.target,{v:0});s.update(.1);assert.equal(s.progress.phase,'secure');assert.equal(s.result().ok,false);
 for(const q of plan.legs[0].path.slice(0,-1).reverse()){const th=Math.atan2(-(q.x-p.x),-(q.z-p.z))-Math.PI;Object.assign(p,q,{th,v:-.8});s.update(.1);}
 p.v=0;p.operation.gear='P';p.operation.parkingBrake=true;p.operation.engine=false;s.update(.1);assert.equal(s.result().ok,false);
});
test('leaving a bay must complete reverse and forward legs, not just finish near the exit',()=>{
 const {player:p,scenario:s,plan}=harness('leave-bay');Object.assign(p,plan.target);p.operation.engine=false;
 s.finishAttempt();assert.equal(s.result().ok,false);
});

test('a stationary reported speed cannot substitute for measured displacement',()=>{
 const {player:p,scenario:s}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];p.v=.8;
 for(let i=0;i<40;i++)s.update(1);assert.equal(s.result().ok,false);assert.equal(s.progress.phase,'drive');
});

test('contact stays one episode until the car moves clear, then a new impact is logged',()=>{
 const {player:p,scenario:s,test:t}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];
 p.z=-27.849;p.v=.8;s.update(.1);
 for(let i=0;i<10;i++){p.z=-27.9;p.v=.8;s.update(.1);}
 assert.equal(t.faults.filter(f=>f[1]==='Control – collision').length,1);
 p.z=-27.7;p.v=-.8;s.update(.1);p.z=-27.9;p.v=.8;s.update(.1);
 assert.equal(t.faults.filter(f=>f[1]==='Control – collision').length,2);
});
test('parking plans come from location metadata, so other locations can supply their own starts',()=>{
 const layout=structuredClone(PARKING_LAYOUT);layout.manoeuvres['forward-bay'].start.x=7;
 assert.equal(parkingPlan('forward-bay',layout).start.x,7);assert.equal(parkingPlan('forward-bay').start.x,0);
});
