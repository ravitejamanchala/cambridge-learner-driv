import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CARS,carById } from '../js/cars.js';
function glb(path){const file=fs.readFileSync(path);assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);return JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());}
test('all seven supplied cars have self-contained geometry, materials and wheel objects',()=>{
 assert.equal(new Set(CARS.map(c=>c.id)).size,8);assert.equal(carById('unknown').id,'rx7');
 for(const car of CARS.filter(c=>c.supplied)){const data=glb(car.url);assert.ok(data.meshes.length>=4);assert.ok(data.nodes.some(n=>n.name.includes('FrontLeftWheel')));assert.ok(data.materials.length>=5);assert.equal(data.buffers[0].uri,undefined);}
});
test('civilian pedestrian exports contain skins and only walking and idle clips',()=>{
 for(const name of ['Casual','Casual2','Suit','Worker']){const data=glb('models/Human'+name+'.glb');assert.ok(data.skins.length>0);assert.ok(data.animations.some(a=>a.name.includes('Walk')));assert.ok(data.animations.some(a=>a.name.includes('Idle')));assert.ok(data.animations.every(a=>/Walk|Idle/.test(a.name)));assert.ok(data.materials.every(m=>(m.pbrMetallicRoughness?.baseColorFactor?.[3]??1)===1),'characters must not export as invisible');}
});
