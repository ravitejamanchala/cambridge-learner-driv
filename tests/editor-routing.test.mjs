import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {prepareEditorTrack} from '../js/editor-routing.js';import {inspectTrack} from '../js/editor-track.js';import {buildNet,buildRoute} from '../js/net.js';
const actual=JSON.parse(await fs.readFile(new URL('./fixtures/admin-cambridge-route.json',import.meta.url)));
test('actual admin-generated route labels and interior checkpoints load on the native one-way graph',()=>{
 const original=structuredClone(actual),prepared=prepareEditorTrack(actual),net=buildNet(prepared.network),route=buildRoute(net,prepared.nodes);
 assert.deepEqual(actual,original);assert.ok(actual.plan.waypoints.some(w=>w.road==='Route start'));assert.ok(route.len>90&&route.len<105);assert.ok(prepared.network.nodes.length>actual.network.nodes.length);assert.equal(prepared.nodes.length,actual.plan.waypoints.length);assert.ok(inspectTrack(actual).len>90);
 for(const step of route.steps)assert.ok(!step.e.way.oneway||step.dir===1);
 for(let i=0;i<prepared.nodes.length;i++){const node=prepared.nodes[i],wp=actual.plan.waypoints[i];assert.ok(Math.hypot(net.nx[node]-wp.x,net.nz[node]-wp.z)<.25);}
});
test('splitting native edges preserves signal/crossing/give-way positions, directions and lane arrows',()=>{
 const network={version:1,origin:[52,.1],kx:68000,kz:110574,names:['Road'],classes:['residential'],nodes:[0,0,1000,0],ways:[[0,0,30,0,0,7,0,2]],edges:[[0,1,0,[0,0,1000,0]]],stops:[[0,700,1,1,1]],zebras:[[0,500]],giveways:[[0,200,-1,1]],minis:[],rbs:[],arrows:[[0,1,'S'],[0,-1,'L']]};
 const track={network,plan:{waypoints:[{x:10,z:0,road:'Route start'},{x:90,z:0,road:'Route destination'}]}};
 const prepared=prepareEditorTrack(track),net=buildNet(prepared.network);assert.equal(prepared.network.edges.length,3);
 assert.equal(net.stops[0].x,70);assert.equal(net.zebras[0].x,50);assert.equal(net.giveways[0].x,20);assert.equal(net.giveways[0].dir,-1);assert.equal(prepared.network.arrows[0][0],2);assert.equal(prepared.network.arrows[1][0],0);assert.equal(buildRoute(net,prepared.nodes).len,80);
});
