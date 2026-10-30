import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import fs from 'node:fs';
import {buildNet} from '../js/net.js';
import {joinedRoadSurfaces,raisedSurfaceGeometry,polygonOperation,solidSurface,PAVEMENT_HEIGHT} from '../js/road-surfaces.js';
import {applyMappedRoadTags} from '../js/mapped-road-tags.js';
import {roadJoinRings} from '../js/road-joins.js';
import {ringArea,roadSpace} from '../js/road-space.js';
import {mappedPavementPolygons,styleMappedPavement} from '../js/pavement.js';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/hills-road-cutoff-user.json',import.meta.url)));
const data=(nodes,ways,edges)=>({...source.network,nodes,ways,edges,stops:[],giveways:[],zebras:[],minis:[],rbs:[],arrows:[],cycleRings:[]});
const way=w=>[0,0,30,0,0,w,0,2];
const area=polys=>polys.reduce((s,p)=>s+ringArea(p[0])-p.slice(1).reduce((a,h)=>a+ringArea(h),0),0);
test('road width changes have a curved taper, without altering source network',()=>{
 const d=data([1000,1000,1000,2000,1000,3000],[way(8),way(4)],[[0,1,0,[1000,1000,1000,2000]],[1,2,1,[1000,2000,1000,3000]]]),original=structuredClone(d),net=buildNet(d);
 const joins=roadJoinRings(net);assert.ok(joins.some(j=>j.ring.length>8));
 const road=roadSpace(net);assert.ok(road.disk(102.6,201));assert.equal(road.disk(102.6,208),false);assert.deepEqual(d,original);
});
test('a continuous road has no transverse kerb at the 400 metre tile boundary',()=>{
 const net=buildNet(data([1000,3000,1000,5000],[way(6)],[[0,1,0,[1000,3000,1000,5000]]]));
 const tiles=joinedRoadSurfaces(net),probe=[[[[97.2,399.8],[102.8,399.8],[102.8,400.2],[97.2,400.2]]]];
 assert.equal(area(polygonOperation(tiles.flatMap(t=>t.kerb),probe,'intersection')),0);
 for(const tile of tiles)assert.equal(area(polygonOperation(tile.pave,tile.road,'intersection')),0);
 assert.ok(tiles.flatMap(t=>t.pave).some(p=>p[0].length>4),'exposed pavement tips are rounded');
});
test('flat pavement has one height and no vertical walls at tile cuts',()=>{
 const polys=[[[[0,0],[2,0],[2,10],[0,10]]]],g=raisedSurfaceGeometry(T,polys,{bounds:[-10,0,10,10]});g.computeBoundingBox();assert.ok(Math.abs(g.boundingBox.max.y-PAVEMENT_HEIGHT)<1e-6);assert.ok(Math.abs(g.boundingBox.min.y-PAVEMENT_HEIGHT)<1e-6);
 const p=g.attributes.position;for(let i=0;i<p.count;i+=3){const ys=[0,1,2].map(k=>p.getY(i+k));if(Math.max(...ys)-Math.min(...ys)>.1){const zs=[0,1,2].map(k=>p.getZ(i+k));assert.ok(Math.max(...zs)-Math.min(...zs)>.1,'no vertical cap at tile cut');}}
});
test('raised mapped pavement is clipped out of the road and keeps its editable transform',()=>{
 const net=buildNet(data([0,-1000,0,1000],[way(6)],[[0,1,0,[0,-1000,0,1000]]]));
 const o={id:'footway-test',type:'marking',x:0,y:.018,z:0,sx:20,sy:.008,sz:2,rotation:.3,properties:{mapFeature:'footway'}};
 const original=structuredClone(o),polys=mappedPavementPolygons(net,o);assert.ok(area(polys)>1);assert.equal(area(polygonOperation(polys,roadSpace(net).patches.map(p=>[p.ring]),'intersection')),0);
 const m=new T.Mesh(new T.BoxGeometry(),new T.MeshLambertMaterial());m.position.set(o.x,o.y+o.sy/2,o.z);m.rotation.y=o.rotation;m.scale.set(o.sx,o.sy,o.sz);styleMappedPavement(T,m,o,net);m.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(m);assert.ok(Math.abs(bounds.max.y-PAVEMENT_HEIGHT)<1e-6);assert.equal(m.geometry.groups.length,1);assert.deepEqual(o,original);
 const ray=new T.Raycaster(new T.Vector3(0,2,0),new T.Vector3(0,-1,0));assert.equal(ray.intersectObject(m).length,0,'no raised pavement blocking carriageway');
});

test('two-arm road bends use round shoulders within the declared half-width',()=>{
 const net=buildNet(data([0,0,0,2000,2000,2000],[way(6)],[[0,1,0,[0,0,0,2000]],[1,2,0,[0,2000,2000,2000]]]));
 const arcs=roadJoinRings(net).filter(j=>j.ring.length>8);assert.equal(arcs.length,2);
 for(const arc of arcs)for(const p of arc.ring.slice(1))assert.ok(Math.abs(Math.hypot(p[0],p[1]-200)-3)<1e-8);
 assert.ok(roadSpace(net).disk(-2.1,202.1),'outer shoulder is a round arc rather than a straight bevel');
});

test('hairline polygons cannot become long raised kerb walls',()=>{
 const hairline=[[[[0,0],[20,0],[20,.001],[0,.001]]]],kerb=[[[[0,0],[20,0],[20,.14],[0,.14]]]];
 assert.deepEqual(solidSurface(hairline),[]);assert.ok(area(solidSurface(kerb))>2.7);
 // Also remove a connected millimetre-wide spike, not just tiny islands.
 const spiked=[[[[0,0],[2,0],[2,1],[20,1],[20,1.001],[2,1.001],[2,2],[0,2]]]];
 const clean=solidSurface(spiked);assert.ok(clean.flat(2).every(p=>p[0]<2.01));
});

test('a narrow inter-road gap does not produce a kerb without a footway behind it',()=>{
 const net=buildNet(data([0,0,0,1000,61,0,61,1000],[way(6)],[[0,1,0,[0,0,0,1000]],[2,3,0,[61,0,61,1000]]]));
 const tiles=joinedRoadSurfaces(net),probe=[[[[3.01,20],[3.09,20],[3.09,80],[3.01,80]]]];
 assert.equal(area(polygonOperation(tiles.flatMap(t=>[...t.kerb,...t.pave]),probe,'intersection')),0);
});

test('mapped footpaths and generated pavement share one flat surface with no overlapping layers',()=>{
 const net=buildNet(data([0,-1000,0,1000],[way(6)],[[0,1,0,[0,-1000,0,1000]]]));
 const footway={id:'path',type:'marking',x:4,y:.018,z:0,sx:2,sy:.008,sz:100,rotation:0,properties:{mapFeature:'footway'}};
 const once=joinedRoadSurfaces(net,[footway]),twice=joinedRoadSurfaces(net,[footway,{...footway,id:'duplicate'}]);
 assert.ok(Math.abs(area(once.flatMap(t=>[...t.pave,...t.kerb]))-area(twice.flatMap(t=>[...t.pave,...t.kerb])))<.001);
 for(const tile of twice){assert.equal(area(polygonOperation(tile.pave,tile.kerb,'intersection')),0);assert.equal(area(polygonOperation([...tile.pave,...tile.kerb],tile.road,'intersection')),0);}
});

// A single motorway edge must not turn off the unified pavement for the town.
test('mixed mapped routes preserve motorway shoulders without generating motorway pavement',()=>{
 const d=data([0,0,0,1000,1000,0,1000,1000],[[0,0,70,0,1,7,0,2,0,0,15,30],[0,1,30,0,0,6,0,2]],[[0,1,0,[0,0,0,1000]],[2,3,1,[1000,0,1000,1000]]]);d.classes=['motorway','residential'];const net=buildNet(d);applyMappedRoadTags(net);assert.deepEqual(net.ways[0].sidewalkWidths,[0,0]);
 const tiles=joinedRoadSurfaces(net),probe=[[[[-4,20],[6,20],[6,80],[-4,80]]]];
 assert.ok(area(polygonOperation(tiles.flatMap(t=>t.road),probe,'intersection'))>599);
 assert.equal(area(polygonOperation(tiles.flatMap(t=>[...t.pave,...t.kerb]),probe,'intersection')),0);assert.ok(area(tiles.flatMap(t=>t.pave))>300);
});
