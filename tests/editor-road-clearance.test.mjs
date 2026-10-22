import test from 'node:test';
import assert from 'node:assert/strict';
import {clearRoadBuildings,roadClearanceIndex} from '../js/editor-road-clearance.js';
const network={ways:[[0,0,0,0,0,6]],edges:[[0,1,0,[-200,0,200,0]]]};
const box=(id,x,z)=>({id,type:'building',x,y:0,z,sx:4,sy:8,sz:4,rotation:0,properties:{}});
test('road crossings are excluded without changing the saved source; clearance is idempotent',()=>{
 const track={network,objects:[box('blocked',0,0),box('safe',0,8),{...box('overhead',0,0),y:4}]},original=structuredClone(track),clean=clearRoadBuildings(track);
 assert.deepEqual(clean.objects.map(o=>o.id),['safe','overhead']);assert.deepEqual(track,original);
 assert.equal(clean.buildingClearance.excluded[0].object.id,'blocked');assert.equal(clearRoadBuildings(clean).buildingClearance.removedThisPass,0);
});
test('courtyard holes and rotated footprints are respected',()=>{
 const ring=(r)=>[{x:-r,z:-r},{x:r,z:-r},{x:r,z:r},{x:-r,z:r}];
 const courtyard={...box('court',0,0),sx:100,sz:100,properties:{footprint:ring(50),holes:[ring(30)]}};
 assert.deepEqual(roadClearanceIndex(network)(courtyard),[]);
 const long={...box('long',0,10),sx:30,sz:2,rotation:0};assert.deepEqual(roadClearanceIndex(network)(long),[]);
 assert.deepEqual(roadClearanceIndex(network)({...long,rotation:Math.PI/2}),[0]);
});
