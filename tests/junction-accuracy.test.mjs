import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildNet} from '../js/net.js';
import {clearRoadside,fitRoadCorners,objectRings} from '../js/roadside-clearance.js';
import {approachConflicts} from '../js/junction-approaches.js';
import {joinMappedPaths} from '../js/path-joins.js';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/hills-road-user.json',import.meta.url)));
test('Hills Road stop lines clear intersecting roads, including short split approaches',()=>{
 const before=structuredClone(source),track=clearRoadside(source),net=buildNet(track.network);fitRoadCorners(net,track.objects);
 assert.deepEqual(source,before);assert.deepEqual(track.network.edges,source.network.edges);assert.deepEqual(track.network.nodes,source.network.nodes);
 assert.deepEqual(track.objects.filter(o=>o.type==='building'),source.objects.filter(o=>o.type==='building'));
 assert.equal(track.roadsideClearance.approaches.length,10);assert.deepEqual(track.roadsideClearance.unresolvedApproaches,[]);
 for(const f of [...net.stops,...net.giveways])assert.equal(approachConflicts(net,f).length,0,'clear approach '+f.e.id);
 assert.ok(track.roadsideClearance.approaches.some(a=>a.from[0]!==a.to[0]),'short connector moved to connected upstream edge');
 const again=clearRoadside(track);assert.deepEqual(again.network,track.network);assert.deepEqual(again.objects,track.objects);assert.deepEqual(again.roadsideClearance.approaches,track.roadsideClearance.approaches);
});
const path=(id,x,z,rotation,sourceId='way:1')=>({id,type:'marking',x,z,y:.018,sx:2,sy:.008,sz:10,rotation,properties:{mapFeature:'footway',sourceId}});
test('right-angle footpath segments share both join corners and survive native serialization',()=>{
 const input=[path('a',0,5,0),path('b',5,10,Math.PI/2)],original=structuredClone(input),joined=joinMappedPaths(input);assert.deepEqual(input,original);
 const [a,b]=joined.map(o=>objectRings(o)[0]);const common=a.filter(p=>b.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-8));assert.equal(common.length,2);
 assert.deepEqual(common.sort((a,b)=>a[0]-b[0]),[[-1,11],[1,9]]);
 assert.deepEqual(joinMappedPaths(JSON.parse(JSON.stringify(joined))),joined);
 assert.deepEqual(joinMappedPaths([input[0],{...input[1],properties:{...input[1].properties,sourceId:'another-way'}}]),[input[0],{...input[1],properties:{...input[1].properties,sourceId:'another-way'}}]);
});
test('all source segment IDs remain editable, isolated terminals stay at their source positions',()=>{
 const joined=joinMappedPaths(source.objects);assert.deepEqual(joined.map(o=>o.id),source.objects.map(o=>o.id));assert.equal(joined.filter(o=>o.properties.pathJoin).length,284);
 const isolated=path('isolated',100,20,.3);assert.equal(joinMappedPaths([isolated])[0],isolated);
});

import {applyMappedRoadTags} from '../js/mapped-road-tags.js';
import {joinedRoadSurfaces} from '../js/road-surfaces.js';
test('explicit no-marking and separately mapped footways override invented defaults',()=>{
 const net=buildNet(source.network);applyMappedRoadTags(net,source.osm.ways);
 for(let i=0;i<net.ways.length;i++){
  const tags=source.osm.ways[i]?.tags||{},w=net.ways[i];if(tags.lane_markings==='no')assert.equal(w.laneMarkings,false);
  if(tags['sidewalk:both']==='separate')assert.deepEqual(w.sidewalkWidths,[0,0]);
  if(tags.sidewalk==='left')assert.equal(w.sidewalkWidths[1],0);
 }
 const tiny={ways:[{},{}]};applyMappedRoadTags(tiny,[{tags:{'sidewalk:left':'yes','sidewalk:left:width':'1.8','sidewalk:right':'no'}},{tags:{}}]);assert.deepEqual(tiny.ways[0].sidewalkWidths,[1.8,0]);assert.deepEqual(tiny.ways[1].sidewalkWidths,[2,2]);
});

test('separate footpaths produce no duplicate pavement geometry',()=>{
 const data={...source.network,nodes:[0,0,0,1000],ways:[[0,0,30,0,0,6,0,2]],edges:[[0,1,0,[0,0,0,1000]]],stops:[],giveways:[],zebras:[],minis:[],rbs:[],arrows:[],cycleRings:[]};
 const net=buildNet(data);applyMappedRoadTags(net,[{tags:{'sidewalk:both':'separate'}}]);assert.ok(joinedRoadSurfaces(net).some(t=>t.road.length));assert.equal(joinedRoadSurfaces(net).reduce((s,t)=>s+t.pave.length,0),0);
 applyMappedRoadTags(net,[{tags:{sidewalk:'left'}}]);const points=joinedRoadSurfaces(net).flatMap(t=>t.pave.flatMap(p=>p.flat()));assert.ok(points.length);assert.ok(points.every(p=>p[0]>=3));
});

test('tight short footpath bends never produce self-intersecting quads',()=>{
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const intersects=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9;
 for(const o of joinMappedPaths(source.objects).filter(o=>o.properties.pathJoin)){const r=o.properties.footprint;assert.equal(intersects(...r)||intersects(r[1],r[2],r[3],r[0]),false,o.id);}
});
