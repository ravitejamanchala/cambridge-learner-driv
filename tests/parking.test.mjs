import test from 'node:test';
import assert from 'node:assert/strict';
import { rectangleCorners, containsVehicle, gradeParking, rectanglesOverlap, sweptContact, VEHICLE_ENVELOPE } from '../js/parking-geometry.js';
import { ROADSIDE_PARKING, parkingPlan } from '../js/roadside-parking.js';
import { createParkingScenario } from '../js/parking-scenario.js';
import { createAutomaticState } from '../js/vehicle-state.js';
import { buildNet, nearest } from '../js/net.js';
import { buildLayout } from '../tools/layouts.mjs';
const L=ROADSIDE_PARKING, target=L.bay, EAST=target.th;
test('parking requires every corner, correct facing and a complete stop',()=>{
 assert.equal(rectangleCorners({...target,...VEHICLE_ENVELOPE}).length,4);
 assert.equal(gradeParking(target,{...target,v:0}).valid,true);
 assert.equal(containsVehicle(target,{...target,z:target.z+1}),false);
 assert.equal(gradeParking(target,{...target,th:target.th+Math.PI}).aligned,false);
 assert.equal(gradeParking(target,{...target,v:.3}).valid,false);
});
test('rotated vehicle contact uses separating axes, not centre proximity',()=>{
 const car={x:0,z:0,th:Math.PI/4,...VEHICLE_ENVELOPE};
 assert.equal(rectanglesOverlap(car,{...car,x:.5}),true);
 assert.equal(rectanglesOverlap(car,{...car,x:8}),false);
});
test('swept collision catches a parked car passed between frames and leaving the road',()=>{
 const rear=L.obstacles.find(o=>o.id==='parked-rear');
 assert.equal(sweptContact({x:104,z:rear.z,th:EAST},{x:118,z:rear.z,th:EAST},L),rear.id);
 assert.equal(sweptContact({x:target.x,z:349,th:EAST},{x:target.x,z:343,th:EAST},L),'boundary');
 assert.equal(sweptContact({x:95,z:347.6,th:EAST},{x:97,z:347.6,th:EAST},L),null);
});
test('the parking space sits at the kerb of a real road in the generated town area',()=>{
 const net=buildNet(buildLayout('town'));
 for(const spot of [target,L.ready,...L.obstacles]){
  const nr=nearest(net,spot.x,spot.z);
  assert.equal(nr.way.name,L.road,JSON.stringify(spot));
  assert.ok(nr.d<=nr.way.w/2+.2,`${nr.d} off the centre of a ${nr.way.w} m road`);
 }
 // the bay is on the nearside of the road, not out in the running lane
 assert.ok(Math.abs(target.z-L.kerb.z)<L.bay.width,'bay is beside the kerb');
});
test('authored starts and guide paths stay on the marked stretch of road',()=>{
 const spec=parkingPlan('parallel-park');
 assert.equal(containsVehicle(L.bounds,spec.start),true);
 for(const leg of spec.legs)for(const p of leg.path)assert.equal(containsVehicle(L.bounds,{...p,th:EAST}),true,JSON.stringify(p));
 assert.throws(()=>parkingPlan('unknown'),/Unknown/);
});
function harness(kind='parallel-park'){
 const plan=parkingPlan(kind);const player={...plan.start,v:0,operation:createAutomaticState(),observations:[],place(x,z,th){Object.assign(this,{x,z,th,v:0});}};
 const test={faults:[],fault(...f){this.faults.push(f);},finish(){this.done=true;}};const traffic={clock:10};
 const scenario=createParkingScenario({manoeuvre:true,parkingKind:kind},{net:{},player,test,traffic,ui:{banner(){}}});return {player,test,traffic,scenario,plan};
}
test('no movement and a secured car outside the target fail assessment',()=>{
 const {player:p,test:t,scenario:s}=harness();p.operation.engine=false;
 assert.equal(s.finishAttempt(),true);assert.equal(t.done,true);assert.equal(s.result().ok,false);assert.equal(t.faults[0][1],'Manoeuvre – accuracy');
});
test('target reached before securing cannot pass; moving away again invalidates the finish',()=>{
 const {player:p,scenario:s,plan}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];
 // Feed measured physical states to the unit-level assessor; integration tests use actual driving.
 for(const q of plan.legs[0].path.slice(1)){const th=Math.atan2(-(q.x-p.x),-(q.z-p.z));Object.assign(p,q,{th,v:.8});s.update(1);}
 Object.assign(p,plan.legs[0].target,{v:0});s.update(.1);assert.equal(s.progress.leg,1);assert.equal(s.result().ok,false);
 Object.assign(p,plan.target,{v:0});s.update(.1);assert.equal(s.result().ok,false);
});
test('parking must complete both legs, not just finish in the space',()=>{
 const {player:p,scenario:s}=harness();Object.assign(p,ROADSIDE_PARKING.bay,{v:0});p.operation.engine=false;
 s.finishAttempt();assert.equal(s.result().ok,false);
});
test('a stationary reported speed cannot substitute for measured displacement',()=>{
 const {player:p,scenario:s}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];p.v=.8;
 for(let i=0;i<40;i++)s.update(1);assert.equal(s.result().ok,false);assert.equal(s.progress.phase,'drive');
});
test('contact stays one episode until the car moves clear, then a new impact is logged',()=>{
 const {player:p,scenario:s,test:t}=harness();p.operation.gear='D';p.operation.parkingBrake=false;p.observations=[{at:10}];
 const rear=ROADSIDE_PARKING.obstacles.find(o=>o.id==='parked-rear');
 p.z=rear.z;p.x=108.7;p.v=.8;s.update(.1);
 assert.equal(t.faults.filter(f=>f[1]==='Control – collision').length,0);
 for(let i=0;i<10;i++){p.x=108.95;p.v=.8;s.update(.1);}
 assert.equal(t.faults.filter(f=>f[1]==='Control – collision').length,1);
 p.x=107.9;p.v=-.8;s.update(.1);p.x=108.95;p.v=.8;s.update(.1);
 assert.equal(t.faults.filter(f=>f[1]==='Control – collision').length,2);
});
test('parking plans come from layout metadata, so other locations can supply their own starts',()=>{
 const layout=structuredClone(ROADSIDE_PARKING);layout.manoeuvres['parallel-park'].start.x=7;
 assert.equal(parkingPlan('parallel-park',layout).start.x,7);
 assert.equal(parkingPlan('parallel-park').start.x,ROADSIDE_PARKING.manoeuvres['parallel-park'].start.x);
});
