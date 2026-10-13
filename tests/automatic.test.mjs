import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticState, canDrive, selectGear } from '../js/vehicle-state.js';
import { automaticVelocity } from '../js/automatic.js';
import { HANDLING } from '../js/config.js';
import { createControlScenario } from '../js/control-scenarios.js';
const pedals=(throttle=0,brake=0)=>({throttle,brake});
test('selector requires a stop and pressed brake; park/neutral prevent propulsion',()=>{
 const s=createAutomaticState();assert.equal(canDrive(s),false);
 assert.equal(selectGear(s,'D',0,0,1),false);assert.equal(selectGear(s,'R',2,1,1),false);
 assert.equal(selectGear(s,'D',0,1,1),true);assert.equal(canDrive(s),false);s.parkingBrake=false;assert.equal(canDrive(s),true);
 assert.equal(automaticVelocity(0,pedals(1),{...s,gear:'P'},.05,HANDLING),0);
 assert.equal(automaticVelocity(0,pedals(1),{...s,gear:'N'},.05,HANDLING),0);
 assert.deepEqual(s.events[0],{action:'gear',value:'D',at:1});
});
test('automatic brake never selects reverse after stopping; selector controls direction',()=>{
 const s={...createAutomaticState(),gear:'D',parkingBrake:false};let v=5;
 for(let i=0;i<100;i++)v=automaticVelocity(v,pedals(0,1),s,.05,HANDLING);
 assert.equal(v,0);assert.equal(s.gear,'D');
 assert.ok(automaticVelocity(0,pedals(),s,.05,HANDLING)>0);
 s.gear='R';assert.ok(automaticVelocity(0,pedals(),s,.05,HANDLING)<0);
 v=-2;for(let i=0;i<100;i++)v=automaticVelocity(v,pedals(0,1),s,.05,HANDLING);assert.equal(v,0);
});
test('reverse throttle is capped and idle creep follows the selected direction',()=>{
 const s={...createAutomaticState(),gear:'R',parkingBrake:false};let v=0;
 for(let i=0;i<400;i++)v=automaticVelocity(v,pedals(1),s,.05,HANDLING);
 assert.ok(v>=-HANDLING.reverseSpeed && v< -3);
 s.parkingBrake=true;for(let i=0;i<100;i++)v=automaticVelocity(v,pedals(1),s,.05,HANDLING);assert.equal(v,0);
});
function harness(kind){
 const player={x:0,z:0,th:0,v:0,delta:0,operation:createAutomaticState(),observations:[],rawInput:pedals()};
 const t={rerouted:0,faults:[],fault(...args){this.faults.push(args);},finish(){this.done=true;}};
 const traffic={clock:10};const s=createControlScenario({scenario:kind},{player,test:t,traffic,ui:{banner(){}}});return {player,t,traffic,s};
}
test('reverse cannot complete from driving forwards or without securing the car',()=>{
 const {player:p,t,s}=harness('automatic-reverse');p.operation.gear='R';p.operation.parkingBrake=false;p.observations=[{at:10}];s.update(.1);
 p.z=-10;p.v=1;s.update(.1);assert.equal(s.result().ok,false);
 p.z=6.2;p.v=-.8;s.update(.1);assert.equal(s.progress.phase,'stop');assert.equal(t.done,undefined);
 p.v=0;s.update(.1);assert.equal(s.progress.phase,'secure');p.operation.gear='P';p.operation.parkingBrake=true;s.update(.1);
 assert.equal(t.done,true);assert.equal(s.result().ok,true);assert.ok(s.events.some(e=>e.type==='distance-target'&&e.gear==='R'));
});
test('missing captured observation prevents an automatic exercise pass',()=>{
 const {player:p,t,s}=harness('automatic-drive');p.operation.gear='D';p.operation.parkingBrake=false;s.update(.1);p.v=1;s.update(.1);
 p.z=-51;s.update(.1);p.v=0;s.update(.1);p.operation.gear='P';p.operation.parkingBrake=true;s.update(.1);
 assert.equal(s.result().ok,false);assert.equal(t.faults.length,1);
});
test('steering needs both measured directions and no rerouting',()=>{
 const {player:p,t,s}=harness('steering');p.v=3;p.delta=.1;s.update(1);assert.equal(s.result().ok,false);p.delta=-.1;s.update(1);assert.equal(s.result().ok,true);t.rerouted=1;assert.equal(s.result().ok,false);
});
