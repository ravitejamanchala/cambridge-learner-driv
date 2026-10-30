import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
globalThis.THREE=T;
const {createAuthoredTiles}=await import('../js/local-world.js');
test('prepared scenery retains all source data but only builds current and approaching tiles',async()=>{
 const object=(id,x)=>({id,type:'scenery',x,y:0,z:0,sx:2,sy:2,sz:2,rotation:0,properties:{}}),track={objects:[object('near',0),object('next',1250),object('later',4000)]},source=structuredClone(track),scene=new T.Scene();
 const tiles=createAuthoredTiles(T,scene,track,null);await tiles.prepare(0,0);tiles.update(0,0);
 assert.equal(tiles.stats().total,3);assert.equal(tiles.stats().resident,2);assert.equal(tiles.stats().active,1);assert.equal(tiles.stats().objects,2);
 assert.equal(scene.children.find(g=>g.children.some(m=>m.userData.editorObjectId==='next')).visible,false,'approaching tile is prepared without drawing it');
 assert.equal(scene.children.some(g=>g.children.some(m=>m.userData.editorObjectId==='later')),false,'distant data has no mesh');
 tiles.update(3000,0,0,100);tiles.update(3000,0,0,100);assert.equal(scene.children.some(g=>g.children.some(m=>m.userData.editorObjectId==='near')),false,'far-behind meshes are released');
 assert.equal(scene.children.some(g=>g.visible&&g.children.some(m=>m.userData.editorObjectId==='later')),true);
 await tiles.prepare(0,0);assert.equal(scene.children.some(g=>g.visible&&g.children.some(m=>m.userData.editorObjectId==='near')),true,'returning rebuilds from retained source');assert.deepEqual(track,source);
});
