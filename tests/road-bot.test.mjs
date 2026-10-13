import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDriver, plannedStopPosition } from '../js/bots.js';
import { approachLane } from '../js/test.js';
import { createTest } from '../js/test.js';
import { buildNet,buildRoute,snapWaypoint,along,laneCentre } from '../js/net.js';
import { PUZZLES } from '../js/puzzles.js';
import fs from 'node:fs';
import * as THREE from 'three';
import { createTraffic } from '../js/traffic.js';
import { seededRandom } from '../js/random.js';
import { safeTrafficSpawn } from '../js/traffic-spawn.js';
function setup(speed=5) {
 const edge={id:0,len:1000,way:{mph:30}};
 const route={len:1000,steps:[{e:edge,dir:1}],stepS:[0],instructions:[{kind:'straight',s:1000}]};
 const player={x:0,z:0,th:0,v:speed,lookAt:0,operation:{enabled:false},signal(){},observations:[]};
 const net={stops:[],stopsByEdge:new Map(),zebras:[],minis:[],cycleRings:[],giveways:[]};
 const traffic={clock:0,cars:[],bikes:[],puffins:[],ringBikes:[],lightState:()=> 'R'};
 const api={A:{test:{running:true,route,sRoute:0,step:0,ctx:{way:edge.way},parked:false},net,traffic},player,lanePoint:s=>({x:0,z:-s,tx:0,tz:-1}),estopBanner:()=>false,look:()=>{player.lookAt=traffic.clock;}};
 return {api,driver:makeDriver(api),edge,net,traffic,player};
}
test('a red stop line holds a slow rolling car instead of allowing creep',()=>{
 const f=setup(.2);f.net.stops.push({x:0,z:-2,tx:0,tz:-1,w:7});
 assert.equal(f.driver().brake,1);assert.equal(f.driver().throttle,0);
});
test('a signal beyond a tight turn is detected from the planned edge',()=>{
 const f=setup(5),light={e:f.edge,dir:1,s:4,x:4,z:0,tx:1,tz:0,w:7};
 f.net.stopsByEdge.set(0,[light]);f.net.stops.push(light);
 assert.equal(f.driver().brake,1);
 light.dir=-1;assert.equal(f.driver().brake,0,'opposite-direction signal must not block this route');
});
test('cyclists with less than 1.5 m clearance are followed, including oncoming bikes',()=>{
 const f=setup(5),bike={kind:'bike',alive:true,x:2.8,z:-9,th:0,v:2};f.traffic.bikes.push(bike);
 assert.equal(f.driver().brake,1);
 bike.th=Math.PI;assert.equal(f.driver().brake,1);
 bike.x=4;assert.equal(f.driver().brake,0,'a cyclist outside the passing corridor does not block');
});
test('moving off does not force a gap after eight seconds',()=>{
 const f=setup(0);f.api.A.test.parked=true;f.traffic.cars.push({alive:true,x:0,z:12,th:0,v:5});
 for(let i=0;i<220;i++){f.traffic.clock+=.05;assert.equal(f.driver().throttle,0);}
});
test('spawn validation rejects close final positions and traffic popping into the forward view',()=>{
 const origin={x:0,z:0,th:0};
 assert.equal(safeTrafficSpawn({x:0,z:-5},origin),false);
 assert.equal(safeTrafficSpawn({x:0,z:-160},origin),false);
 assert.equal(safeTrafficSpawn({x:130,z:0},origin),true);
 assert.equal(safeTrafficSpawn({x:0,z:150},origin),true);
 assert.equal(safeTrafficSpawn({x:0,z:500},origin),false);
 assert.equal(safeTrafficSpawn({x:0,z:-60},origin,true),true);
});
test('an angled stop line is measured where the chosen lane crosses it',()=>{
 const f=setup(),light={e:f.edge,dir:1,s:30,x:0,z:-30,tx:.6,tz:-.8,w:20};
 const crossing=plannedStopPosition(f.api.A.test.route,0,light,s=>({x:8,z:-s}));
 assert.ok(Math.abs(crossing-24)<.01,'lane offset crosses the stop plane six metres before the road centre');
});
test('approach lane is recorded on the approach, not after steering into the junction',()=>{
 const edge={way:{oneway:true,lanes:3,w:18,cl:0,cr:0,cw:0}},nr={e:edge,tx:1,tz:0,lat:-6};
 assert.equal(approachLane(nr,{e:edge,dir:1},-Math.PI/2),2);
 assert.equal(approachLane({...nr,lat:2},{e:edge,dir:1},-.76),null);
 assert.equal(approachLane({...nr,lat:6},{e:edge,dir:1},-Math.PI/2),0,'a wrong approach lane is still recorded');
});
test('interchange entry is graded against its own signal, while a real red-line crossing still fails',()=>{
 const net=buildNet(JSON.parse(fs.readFileSync('data/areas/park.json'))),lesson=PUZZLES.find(l=>l.id==='pz-milton'),nodes=lesson.waypoints.map(w=>snapWaypoint(net,w)),route=buildRoute(net,nodes);
 const traffic={clock:1,cars:[],bikes:[],ringBikes:[],puffins:[],lightState:line=>line.e.way.rb?'R':'G'};
 const player={x:2350.9,z:-5.1,th:-1.15,v:5,lookAt:1},examiner=createTest(net,traffic,player);examiner.setRoute(route,nodes);
 const reset=()=>{examiner.reset();examiner.running=true;examiner.parked=false;examiner.sRoute=495;examiner.idx=route.cum.findIndex(s=>s>=490);};
 reset();examiner.update(.05);player.x=2351.5;player.z=-5.2;examiner.update(.05);assert.equal(examiner.S,0,'the adjacent ring signal does not control the entry lane');
 traffic.lightState=()=> 'R';player.x=2347;player.z=-3.4;player.th=-Math.PI/2;reset();examiner.update(.05);player.x=2348;examiner.update(.05);
 assert.equal(examiner.faults.filter(f=>f.text==='Crossed the stop line on a red light').length,1);
});

test('seeded traffic resets reproduce the same vehicles and pedestrian timing independently of rendering',()=>{
 globalThis.THREE=THREE;const net=buildNet(JSON.parse(fs.readFileSync('data/areas/rbs.json'))),scene=new THREE.Scene();
 const mesh=()=>{const g=new THREE.Group();g.userData={wheels:[],crank:new THREE.Object3D()};return g;};
 const traffic=createTraffic(net,scene,mesh,mesh,mesh),player={x:-446,z:-1.8,th:-Math.PI/2,v:0,isPlayer:true};
 traffic.init(player.x,player.z,[0]);
 const sample=()=>{traffic.reset(player.x,player.z,12345);for(let i=0;i<20;i++)traffic.update(.05,player);return JSON.stringify({cars:traffic.cars.map(c=>[c.x,c.z,c.v,c.alive,c.next?.e.id]),bikes:traffic.bikes.map(b=>[b.x,b.z,b.v,b.alive]),peds:net.zebras.map(z=>z.ped)});};
 const first=sample();for(let i=0;i<100;i++)new THREE.Group();assert.equal(sample(),first);
 const one=seededRandom(7),two=seededRandom(7);assert.deepEqual(Array.from({length:20},()=>one()),Array.from({length:20},()=>two()));
});
test('route progress reports the physical projection without a four-metre lag',()=>{
 const net=buildNet(JSON.parse(fs.readFileSync('data/areas/park.json'))),lesson=PUZZLES.find(l=>l.id==='pz-milton'),nodes=lesson.waypoints.map(w=>snapWaypoint(net,w)),route=buildRoute(net,nodes),step=route.steps[0];
 const pose=along(step.e,100,step.dir,laneCentre(step.e,step.dir)),player={...pose,th:Math.atan2(-pose.tx,-pose.tz),v:0,lookAt:1};
 const traffic={clock:1,cars:[],bikes:[],ringBikes:[],puffins:[],lightState:()=> 'G'},examiner=createTest(net,traffic,player);
 examiner.setRoute(route,nodes);examiner.reset();examiner.running=true;examiner.parked=false;examiner.sRoute=95;examiner.idx=route.cum.findIndex(s=>s>=95);examiner.update(.05);
 assert.ok(Math.abs(examiner.sRoute-100)<.1,examiner.sRoute);
 Object.assign(player,along(step.e,98,step.dir,laneCentre(step.e,step.dir)));examiner.update(.05);assert.ok(Math.abs(examiner.sRoute-100)<.1,'a slight retreat cannot falsely add or erase route progress');
});
test('background cars and cyclists stop with their fronts behind a red line',()=>{
 globalThis.THREE=THREE;
 for(const kind of ['car','bike']){
  const net=buildNet(JSON.parse(fs.readFileSync('data/areas/park.json'))),scene=new THREE.Scene(),mesh=()=>{const g=new THREE.Group();g.userData={wheels:[],crank:new THREE.Object3D()};return g;};
  const traffic=createTraffic(net,scene,mesh,mesh,mesh),player={x:0,z:0,th:0,v:0,isPlayer:true};traffic.init(2400,0,[0]);traffic.setDensity('none');
  const line=net.stops.find(s=>s.e.way.rb),actor=kind==='car'?traffic.cars[0]:traffic.bikes[0];
  traffic.overrides.set(line.cluster,{group:line.group===0?1:0,t0:100});
  if(kind==='car')traffic.placeCar(actor,line.e,line.dir,line.ts-15,5.5);else traffic.placeBike(actor,line.e,line.dir,line.ts-15,5.5);
  for(let i=0;i<200;i++)traffic.update(.05,player);
  const plane=(actor.x-line.x)*line.tx+(actor.z-line.z)*line.tz;
  const front=plane+(kind==='car'?2.1:.9)*Math.abs(-Math.sin(actor.th)*line.tx-Math.cos(actor.th)*line.tz);
  assert.ok(actor.v<.1,kind+' should remain stopped');assert.ok(front<0,JSON.stringify({kind,plane,front}));
 }
});
