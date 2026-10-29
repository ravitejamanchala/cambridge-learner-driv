import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildNet,buildRoute} from '../js/net.js';
import {createTest} from '../js/test.js';
import {validate} from '../js/editor-track.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/editor-route.json',import.meta.url)));
function drive(experimental){
 const net=buildNet(fixture.network),route=buildRoute(net,[0,1]);
 const traffic={clock:0,cars:[],bikes:[],ringBikes:[],puffins:[]};
 const player={x:net.nx[0]-1.5,z:net.nz[0]-10,th:0,v:25,lookAt:-100};
 const examiner=createTest(net,traffic,player);examiner.setRoute(route,[0,1]);examiner.reset();examiner.experimental=experimental;examiner.running=true;
 return {examiner,traffic,player,net};
}
test('experimental practice keeps navigation and impact response without any assessment',()=>{
 const {examiner:t,traffic,player}=drive(true);let finished=0;t.onFinish=()=>finished++;
 for(let i=0;i<100;i++){traffic.clock+=.05;t.update(.05);}
 assert.ok(t.sRoute>0);assert.equal(t.parked,false);assert.deepEqual(t.timers,{});assert.deepEqual(t.faults,[]);
 t.fault('S','test','Forced fault');assert.equal(t.S,0);assert.equal(t.passed(),null);
 traffic.cars.push({alive:true,x:player.x,z:player.z-3,th:0,v:0,ghost:0});t.update(.05);
 assert.equal(player.v,0,'real contact response stops the player');assert.equal(traffic.cars[0].v,0);assert.equal(t.faults.length,0);
 t.finish();assert.equal(finished,0);assert.equal(t.done,false);assert.equal(t.running,true);
});
test('ordinary mocks still assess speeding, collisions and completion',()=>{
 const {examiner:t,traffic,player}=drive(false);
 for(let i=0;i<100;i++){traffic.clock+=.05;t.update(.05);}
 assert.ok(t.faults.some(f=>f.key==='spd2'));
 traffic.cars.push({alive:true,x:player.x,z:player.z-3,th:0,v:0,ghost:0});t.update(.05);
 assert.equal(player.v,0);assert.ok(t.faults.some(f=>f.cat==='Control – collision'));
 let finished=0;t.onFinish=()=>finished++;t.finish();assert.equal(finished,1);assert.equal(t.done,true);
});
test('only the explicit experimental practice value is accepted',()=>{
 assert.deepEqual(validate({...fixture,practiceMode:'experimental'}),[]);
 assert.deepEqual(validate(fixture),[]);
 assert.ok(validate({...fixture,practiceMode:'free'}).includes('Invalid practice mode'));
});

test('procedural scenery is opt-in and cannot duplicate authored buildings',()=>{
 assert.deepEqual(validate({...fixture,sceneryMode:'procedural',objects:[]}),[]);
 assert.ok(validate({...fixture,sceneryMode:'procedural'}).includes('Procedural scenery cannot include authored buildings'));
 assert.ok(validate({...fixture,sceneryMode:'unknown'}).includes('Invalid scenery mode'));
});
