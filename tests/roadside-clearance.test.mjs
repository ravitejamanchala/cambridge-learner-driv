import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildNet} from '../js/net.js';
import {roadSpace,roadsidePosition,ringArea} from '../js/road-space.js';
import {clearRoadside,fitRoadCorners,objectRings,roadObstacle,objectBlocker} from '../js/roadside-clearance.js';
import {joinedRoadSurfaces,polygonOperation} from '../js/road-surfaces.js';
const source=JSON.parse(fs.readFileSync(new URL('fixtures/hills-road-user.json',import.meta.url)));
const small=()=>({origin:[0,0],kx:1,kz:1,names:['Narrow','Wide'],classes:['residential'],nodes:[-200,0,200,0,-200,50,200,50],ways:[[0,0,30,0,0,2,0,2],[1,0,30,0,0,12,0,2]],edges:[[0,1,0,[-200,0,200,0]],[2,3,1,[-200,50,200,50]]],stops:[],giveways:[],zebras:[],minis:[],rbs:[]});
test('clearance considers a wider overlapping road, not only the nearest centreline',()=>{
 const n=buildNet(small());assert.equal(roadSpace(n).disk(0,1.8,.2),true);assert.equal(roadSpace(n).disk(0,-2,.2),false);
 const safe=roadsidePosition(n,{x:0,z:0,tx:1,tz:0,w:2});assert.ok(safe);assert.equal(roadSpace(n).disk(safe.x,safe.z,.75),false);
 assert.equal(roadsidePosition(n,{x:0,z:0,tx:1,tz:0,w:2},{blocked:()=>true}),null,'no unsafe fallback');
});
test('a real uploaded Cambridge route clears trees and signals while preserving every building and road',()=>{
 const before=structuredClone(source),t=clearRoadside(source),n=buildNet(t.network);fitRoadCorners(n,t.objects);
 assert.deepEqual(source,before);assert.equal(t.network.edges.length,184);assert.deepEqual(t.network.edges,source.network.edges);assert.deepEqual(t.network.nodes,source.network.nodes);assert.deepEqual(t.spawn,source.spawn);assert.deepEqual(t.plan,source.plan);
 assert.deepEqual(t.objects.filter(o=>o.type==='building'),source.objects.filter(o=>o.type==='building'));assert.equal(t.objects.filter(o=>o.type==='building').length,327);
 assert.equal(t.roadsideClearance.movedThisPass,27);assert.equal(t.roadsideClearance.excludedThisPass,18);assert.equal(t.network.stops.length,13);assert.ok(n.adjustedCorners>0);
 for(const o of t.objects.filter(roadObstacle))assert.deepEqual(roadSpace(n).overlaps(objectRings(o),o.type==='building'?0:.35),[],o.id);
 for(const e of t.roadsideClearance.excluded)assert.deepEqual(e.object,source.objects.find(o=>o.id===e.object.id));
 const again=clearRoadside(t);assert.equal(again.roadsideClearance.movedThisPass,0);assert.equal(again.roadsideClearance.excludedThisPass,0);assert.deepEqual(again.objects,t.objects);assert.deepEqual(again.roadsideClearance.adjustments,t.roadsideClearance.adjustments);
 const blocked=objectBlocker(t.objects);for(const st of n.stops){const p=roadsidePosition(n,st,{blocked});assert.ok(p);assert.equal(roadSpace(n).disk(p.x,p.z,.75),false);assert.equal(blocked(p.x,p.z,.4),false);}
});
test('merged pavement has no positive-area overlap with the carriageway, including the uploaded junction',()=>{
 const t=clearRoadside(source),n=buildNet(t.network);fitRoadCorners(n,t.objects);
 const tiles=joinedRoadSurfaces(n);assert.ok(tiles.length>0);
 for(const t of tiles){const overlap=polygonOperation(t.pave,t.road,'intersection');assert.equal(overlap.reduce((s,p)=>s+ringArea(p[0]),0),0);for(const polys of [t.road,t.pave])for(const poly of polys)for(const ring of poly)assert.ok(ring.every(p=>p.every(Number.isFinite)));}
});
test('courtyard holes remain available for pole placement and overhead buildings stay unchanged',()=>{
 const ring=r=>[{x:-r,z:-r},{x:r,z:-r},{x:r,z:r},{x:-r,z:r}],o={id:'court',type:'building',x:0,y:0,z:0,sx:20,sy:7,sz:20,rotation:0,properties:{footprint:ring(10),holes:[ring(4)]}};
 const blocked=objectBlocker([o]);assert.equal(blocked(0,0,.5),false);assert.equal(blocked(6,0,.5),true);assert.equal(objectBlocker([{...o,y:5}])(6,0,.5),false);
});
