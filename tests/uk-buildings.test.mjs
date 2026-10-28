import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {ukProfile,rectangularOutline,styleUKBuilding,UK_STYLES} from '../js/uk-buildings.js';
const object=()=>({id:'osm-house-42',type:'building',x:30,z:40,y:0,sx:8,sy:7,sz:10,rotation:0,properties:{tags:{building:'house','building:levels':'2'}}});
test('UK profiles respect use, roof and level tags and are deterministic',()=>{
 const o=object();assert.deepEqual(ukProfile(o),ukProfile(structuredClone(o)));assert.equal(ukProfile(o).floors,2);
 o.properties.tags.building='warehouse';assert.equal(ukProfile(o).style,'industrial');assert.equal(ukProfile(o).pitched,false);
 o.properties.ukStyle='terrace';o.properties.tags['roof:shape']='flat';assert.equal(ukProfile(o).pitched,false);
 delete o.properties.tags['roof:shape'];assert.equal(ukProfile(o).style,'terrace');assert.equal(ukProfile(o).pitched,true);
});
test('courtyards and irregular shapes never receive a bounding-box pitched roof',()=>{
 const o=object();assert.equal(rectangularOutline(o).length,4);
 o.properties.footprint=[{x:0,z:0},{x:8,z:0},{x:8,z:3},{x:3,z:3},{x:3,z:10},{x:0,z:10}];assert.equal(rectangularOutline(o),null);
 o.properties.footprint=[{x:0,z:0},{x:8,z:0},{x:8,z:10},{x:0,z:10}];o.properties.holes=[[{x:2,z:2},{x:4,z:2},{x:4,z:4}]];assert.equal(rectangularOutline(o),null);
});
test('every UK style preserves source data and mapped height/footprint bounds',()=>{
 // Canvas drawing is exercised by browser tests; this stub isolates geometry invariants.
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 globalThis.document={createElement:()=>({getContext:()=>ctx})};
 try{for(const style of Object.keys(UK_STYLES)){
  const o=object();o.properties.ukStyle=style;const before=structuredClone(o),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshLambertMaterial());styleUKBuilding(T,mesh,o);
  assert.deepEqual(o,before);mesh.updateMatrixWorld(true);const b=new T.Box3().setFromObject(mesh);
  for(const axis of ['x','y','z']){assert.ok(b.min[axis]>=-.500001,style+': min '+axis);assert.ok(b.max[axis]<=.500001,style+': max '+axis);}assert.ok(b.max.y>.49999);assert.ok(mesh.material[1].map);
  assert.equal(mesh.userData.ukBuilding.style,style);
 }}finally{delete globalThis.document;}
});
test('rotated mapped rectangles keep a roof inside their real footprint',()=>{
 const o=object(),angle=.5,c=Math.cos(angle),s=Math.sin(angle),ring=[[-4,-5],[4,-5],[4,5],[-4,5]].map(([x,z])=>({x:c*x+s*z+30,z:-s*x+c*z+40}));
 o.properties.footprint=ring;o.sx=Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x));o.sz=Math.max(...ring.map(p=>p.z))-Math.min(...ring.map(p=>p.z));
 const r=rectangularOutline(o);assert.equal(r.length,4);assert.ok(r.some(p=>Math.abs(p[0])<.49));
});
