import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadLocalLibrary} from '../js/local-library.js';
import {buildNet,buildRoute} from '../js/net.js';
globalThis.THREE=THREE;

function track(){return {
 version:1,title:'Paint continuity fixture',kind:'mock',objects:[],spawn:{x:20,z:-1.5,heading:-Math.PI/2},
 network:{origin:[52,.1],kx:68000,kz:110574,names:['Road'],classes:['residential'],nodes:[0,0,1200,0],ways:[[0,0,30,0,0,7,0,2]],edges:[[0,1,0,[0,0,1200,0]]],stops:[[0,900,1,4,0]],zebras:[[0,700]],giveways:[[0,100,-1]],minis:[],rbs:[]},
 plan:{waypoints:[{x:20,z:0},{x:60,z:0},{x:100,z:0}]},
 // This imported field must never select arbitrary visual geometry.
 renderNetwork:{invalid:'untrusted'}
};}

async function load(input){
 const saved={location:globalThis.location,window:globalThis.window,fetch:globalThis.fetch};
 globalThis.location={hostname:'localhost'};globalThis.window={LEARNER_CONFIG:{LOCAL_AUTHORING:true}};
 globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'fixture',track:input,meta:{len:80,n:1}}]});
 try{const index={areas:[],plans:{}},routes=[];const tracks=await loadLocalLibrary(index,routes);return {runtime:tracks.get('local:fixture'),route:routes[0]};}
 finally{Object.assign(globalThis,saved);}
}

test('local import retains source visual graph while waypoint routing uses split edges',async()=>{
 const input=track(),before=structuredClone(input),{runtime,route}=await load(input);
 assert.deepEqual(input,before);assert.deepEqual(runtime.renderNetwork,input.network);
 assert.equal(runtime.network.edges.length,4);assert.equal(runtime.renderNetwork.edges.length,1);
 const routing=buildNet(runtime.network),visual=buildNet(runtime.renderNetwork);
 assert.equal(buildRoute(routing,route.localNodes).len,80);
 for(const key of ['stops','zebras','giveways'])assert.deepEqual(routing[key].map(f=>[f.x,f.z,f.dir,f.cluster,f.group,f.single,f.offset]),visual[key].map(f=>[f.x,f.z,f.dir,f.cluster,f.group,f.single,f.offset]),key+' preserves position and live signal timing');
});

test('rendered road paint survives interior route anchors without missing dashes',async()=>{
 const input=track(),{runtime}=await load(input),oldDocument=globalThis.document;
 // Texture pixels are immaterial here: exercise the real Three.js paint geometry.
 const context=new Proxy({}, {get:(o,k)=>o[k]??(()=>({addColorStop(){}})),set:(o,k,v)=>(o[k]=v,true)});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 const {buildWorld}=await import('../js/world.js');
 function paint(network){
  const scene=new THREE.Scene(),signals=[];
  const world=buildWorld(scene,buildNet(network),{puffins:[],lightState:s=>{signals.push(s.cluster);return 'G';}},{authored:true});
  world.updateSignals(0);assert.deepEqual(signals,[4]);
  const geometry=scene.children.filter(m=>m.isMesh&&m.renderOrder===4).map(m=>Array.from(m.geometry.attributes.position.array));
  scene.traverse(o=>{o.geometry?.dispose();for(const material of [].concat(o.material||[])){material.map?.dispose();material.dispose();}});
  return geometry;
 }
 try{
  const expected=paint(input.network);assert.deepEqual(paint(runtime.renderNetwork),expected);
  assert.notDeepEqual(paint(runtime.network),expected,'routing cuts would erase paint if used for rendering');
 }finally{globalThis.document=oldDocument;}
});
