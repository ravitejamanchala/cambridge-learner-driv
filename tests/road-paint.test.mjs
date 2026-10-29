import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE=THREE;
const {dash,roadBoundsVisible}=await import('../js/road-ribbon.js');
const {buildNet}=await import('../js/net.js');
test('paint follows bend vertices instead of cutting across a corner',()=>{
 const edge={n:3,len:20,px:[0,10,10],pz:[0,0,10],cum:[0,10,20]};
 const quads=[];dash({quad:(...p)=>quads.push(p)},edge,8,6,0,.07);
 assert.equal(quads.length,2);
 // The first strip reaches the corner; the second follows the outgoing road.
 assert.equal(quads[0][4]+quads[0][6],20);
 assert.equal(quads[0][5]+quads[0][7],0);
 assert.equal(quads[1][4]+quads[1][6],20);
 assert.equal(quads[1][5]+quads[1][7],8);
});

test('long roads remain visible near their far end, beyond the start chunk',()=>{
 const bounds={min:{x:0,z:-4},max:{x:50000,z:4}};
 assert.equal(roadBoundsVisible(bounds,49000,0,1000),true);
 assert.equal(roadBoundsVisible(bounds,49000,2000,1000),false);
});
