import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {ukProfile,rectangularOutline,styleUKBuilding,UK_STYLES} from '../js/uk-buildings.js';
const object=()=>({id:'osm-house-42',type:'building',x:30,z:40,y:0,sx:8,sy:7,sz:10,rotation:0,properties:{tags:{building:'house','building:levels':'2'}}});
test('UK profiles respect use, roof and level tags and are deterministic',()=>{
 const o=object();assert.deepEqual(ukProfile(o),ukProfile(structuredClone(o)));assert.equal(ukProfile(o).floors,2);
 for(const unknown of ['__proto__','constructor','toString','unknown']){o.properties.ukStyle=unknown;assert.ok(Object.hasOwn(UK_STYLES,ukProfile(o).style));}delete o.properties.ukStyle;
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
test('recreated modular frontage follows the road and retains rotated footprint bounds',()=>{
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});globalThis.document={createElement:()=>({getContext:()=>ctx})};
 try{const o=object();o.properties.ukStyle='terrace';const a=.6,c=Math.cos(a),s=Math.sin(a),ring=[[-4,-5],[4,-5],[4,5],[-4,5]].map(([x,z])=>({x:c*x+s*z,z:-s*x+c*z}));o.properties.footprint=ring;o.sx=Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x));o.sz=Math.max(...ring.map(p=>p.z))-Math.min(...ring.map(p=>p.z));
 const shape=new T.Shape(ring.map(p=>new T.Vector2(p.x/o.sx,-p.z/o.sz))),g=new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,-.5,0);const mesh=new T.Mesh(g,[new T.MeshLambertMaterial(),new T.MeshLambertMaterial()]);styleUKBuilding(T,mesh,o,{front:{x:0,z:30}});assert.ok(mesh.userData.ukFrontage.bays>0);const lod=mesh.children.find(c=>c.userData.ukFrontage);assert.ok(lod.isLOD);assert.equal(lod.levels[1].distance,160);
 const p=lod.levels[0].object.geometry.attributes.position;for(let start=0;start<p.count;start+=36){let volume=0;for(let i=start;i<start+36;i+=3){const a=new T.Vector3().fromBufferAttribute(p,i),b=new T.Vector3().fromBufferAttribute(p,i+1),c=new T.Vector3().fromBufferAttribute(p,i+2);volume+=a.dot(b.cross(c))/6;}assert.ok(volume>0,'frontage boxes have outward-facing triangles');}for(let i=0;i<p.count;i++){const x=p.getX(i)*o.sx,z=p.getZ(i)*o.sz;assert.ok(Math.abs(c*x-s*z)<=4.00001);assert.ok(Math.abs(s*x+c*z)<=5.00001);assert.ok(p.getY(i)>=-.50001&&p.getY(i)<=.50001);}
 const before=rectangularOutline(o);o.properties.tags['roof:orientation']='across';const across=rectangularOutline(o);assert.deepEqual(across[0],before[1]);
 }finally{delete globalThis.document;}
});

test('mapped numeric roof directions are accepted and orient the roof',()=>{
 const o=object();o.properties.tags['roof:direction']='90';const east=rectangularOutline(o);o.properties.tags['roof:direction']='0';const north=rectangularOutline(o);assert.notDeepEqual(east,north);
});

test('mapped shop sign faces outward, stays on its footprint and releases its texture',async()=>{
 const {addShopSign}=await import('../js/shop-signs.js');const ctx=new Proxy({},{get:()=>()=>{}});globalThis.document={createElement:()=>({getContext:()=>ctx})};
 try{const o=object();o.properties.storefront={name:'Cambridge Books',source:'OpenStreetMap'};const m=new T.Mesh();addShopSign(T,m,o,{x:0,z:1});assert.equal(m.userData.shopSign.label,'Cambridge Books');const sign=m.children[0].levels[0].object;assert.ok(sign.geometry.attributes.normal.getZ(0)>.99);const p=sign.geometry.attributes.position;for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getX(i))<=.5);assert.ok(Math.abs(p.getZ(i))<=.5);assert.ok(Math.abs(p.getY(i))<=.5);}let disposed=false;sign.material.map.addEventListener('dispose',()=>disposed=true);sign.material.dispose();assert.equal(disposed,true);
 }finally{delete globalThis.document;}
});
