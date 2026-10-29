import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {compactMaterialGroups} from '../js/material-groups.js';
import {createObstacleIndex} from '../js/obstacle-index.js';
import {footprintContact,obstacleContact} from '../js/editor-collisions.js';
import {VEHICLE_ENVELOPE} from '../js/parking-geometry.js';
import {roadJoinRings} from '../js/road-joins.js';
import {buildNet,posAt} from '../js/net.js';
import {joinedRoadSurfaces,surfaceGeometry,polygonOperation} from '../js/road-surfaces.js';
import {ribbonRings,ringArea} from '../js/road-space.js';
import {clearRoadside,fitRoadCorners} from '../js/roadside-clearance.js';
import {applyMappedRoadTags} from '../js/mapped-road-tags.js';
const track=JSON.parse(fs.readFileSync(new URL('./fixtures/hills-road-cutoff-user.json',import.meta.url)));
test('material batching preserves every triangle, its material and vertex attributes',()=>{
 const g=new T.BoxGeometry().toNonIndexed();g.groups.forEach((v,i)=>v.materialIndex=i%2);
 const triangles=g=>{const result=[];for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i+=3){const indices=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);result.push(JSON.stringify([group.materialIndex,...indices.flatMap(j=>[...['position','normal','uv'].flatMap(k=>{const a=g.attributes[k];return Array.from({length:a.itemSize},(_,c)=>a.array[j*a.itemSize+c]);})]) ]));}return result.sort();};
 const before=triangles(g);compactMaterialGroups(g);assert.equal(g.groups.length,2);assert.deepEqual(triangles(g),before);
});
test('swept obstacle index preserves collisions with rotated polygons, courtyards, trunks and fast motion',()=>{
 const objects=track.objects.filter(o=>['building','scenery','sign','light'].includes(o.type)),index=createObstacleIndex(objects);
 for(const o of objects.filter((_,i)=>i%7===0))for(const offset of [-1,0,1]){const pose={x:o.x+offset,z:o.z,th:.7,...VEHICLE_ENVELOPE},previous={x:pose.x-10,z:pose.z-5},near=index.near(previous,pose);for(const target of objects)if(footprintContact(pose,target))assert.ok(near.includes(target),target.id);const a={...pose,v:10},b={...pose,v:10};assert.equal(obstacleContact(a,objects,previous),obstacleContact(b,near,previous));assert.deepEqual(a,b);}
 const origin=track.spawn;assert.ok(index.near(origin,origin).length<objects.length*.1);
});
test('separate road segments share a filled bevel instead of a triangular outer notch',()=>{
 const data={...track.network,nodes:[0,0,0,200,200,400],ways:[[0,0,30,0,0,6,0,2]],edges:[[0,1,0,[0,0,0,200]],[1,2,0,[0,200,200,400]]],stops:[],giveways:[],zebras:[],minis:[],rbs:[],arrows:[],cycleRings:[]};const net=buildNet(data),joins=roadJoinRings(net);assert.ok(joins.length>=1);const bare=net.edges.flatMap(e=>ribbonRings(e).map(r=>[r]));assert.ok(polygonOperation(joins.map(j=>[j.ring]),bare,'difference').reduce((s,p)=>s+ringArea(p[0]),0)>.1);
 const surfaces=joinedRoadSurfaces(net).flatMap(t=>t.road);assert.equal(polygonOperation(joins.map(j=>[j.ring]),surfaces,'difference').reduce((s,p)=>s+ringArea(p[0]),0),0);
});
test('uploaded 340-road map has rendered triangles across sampled lanes and chunk boundaries',()=>{
 const clean=clearRoadside(track),net=buildNet(clean.network);fitRoadCorners(net,clean.objects);applyMappedRoadTags(net,clean.osm.ways);
 const meshes=joinedRoadSurfaces(net).filter(t=>t.road.length).map(t=>new T.Mesh(surfaceGeometry(T,t.road),new T.MeshBasicMaterial({side:T.DoubleSide}))),ray=new T.Raycaster();let samples=0;
 for(const e of net.edges)for(let s=.1;s<e.len;s+=8){const p=posAt(e,s);for(const o of [0,e.way.w*.3,-e.way.w*.3]){ray.set(new T.Vector3(p.x+p.tz*o,10,p.z-p.tx*o),new T.Vector3(0,-1,0));assert.ok(ray.intersectObjects(meshes).length,'road '+e.id+' at '+s);samples++;}}
 assert.ok(samples>4500);
});
