import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tileSelection,generateTile} from '../js/tile-builder/model.js';
const osm=JSON.parse(fs.readFileSync(new URL('./fixtures/personal-routes/cambridge-osm.json',import.meta.url)));
test('one kilometre core and 100 metre buffer share a stable simulator origin',()=>{
 for(const center of [[.1218,52.2053],[-.12,51.5],[151.2,-33.8]]){const s=tileSelection(center);assert.deepEqual(s.origin,[center[1],center[0]]);assert.ok(Math.abs((s.bounds[3]-s.bounds[1])*s.kx-1000)<1e-6);assert.ok(Math.abs((s.bounds[2]-s.bounds[0])*s.kz-1000)<1e-6);assert.ok(Math.abs((s.dataBounds[3]-s.dataBounds[1])*s.kx-1200)<1e-6);}
 assert.throws(()=>tileSelection([180,0]));assert.throws(()=>tileSelection([0,90]));assert.throws(()=>tileSelection([NaN,0]));
});
test('native road conversion produces bounded surfaces and source footprint buildings',()=>{
 const snapshot=JSON.stringify(osm),a=generateTile(osm,[.1218,52.2053]),b=generateTile(osm,[.124,52.2053]);
 assert.equal(JSON.stringify(osm),snapshot);assert.ok(a.buildings.length>50);assert.ok(a.stats.roadPolygons>0);assert.notDeepEqual(a.selection,b.selection);assert.notDeepEqual(a.surfaces,b.surfaces);
 for(const tile of [a,b]){
  const rings=[...tile.surfaces.flatMap(t=>[...t.road,...t.pave,...t.kerb]).flat(),...tile.buildings.flatMap(b=>b.rings),...tile.land.flatMap(a=>a.polygons.flat())];
  assert.ok(rings.length>50);for(const ring of rings)for(const [x,z]of ring)assert.ok(Number.isFinite(x+z)&&Math.abs(x)<=500.001&&Math.abs(z)<=500.001);
  assert.ok(tile.buildings.every(b=>b.height>0&&b.id.startsWith('way/')));
 }
 assert.throws(()=>generateTile({...osm,remark:'timeout'},[.1218,52.2053]),/incomplete/);assert.throws(()=>generateTile({elements:[]},[.1218,52.2053]),/No drivable/);
});
test('buffer roads meet the tile edge and clipped buildings retain courtyard holes',()=>{
 const s=tileSelection([.1218,52.2053]),elements=[];let id=1;
 const nodes=points=>points.map(([x,z])=>{const n=id++;elements.push({type:'node',id:n,lon:s.center[0]+x/s.kx,lat:s.center[1]-z/s.kz});return n;});
 elements.push({type:'way',id:100,nodes:nodes([[-600,0],[0,0],[600,0]]),tags:{highway:'residential',width:'6',lanes:'2'}});
 const ring=p=>{const r=nodes(p);r.push(r[0]);return r;};
 elements.push({type:'way',id:101,nodes:ring([[480,100],[550,100],[550,200],[480,200]]),tags:{building:'yes',height:'8'}});
 elements.push({type:'way',id:102,nodes:ring([[-100,100],[100,100],[100,300],[-100,300]])});
 elements.push({type:'way',id:103,nodes:ring([[-30,150],[30,150],[30,250],[-30,250]])});
 elements.push({type:'relation',id:200,tags:{type:'multipolygon',building:'yes',height:'10'},members:[{type:'way',ref:102,role:'outer'},{type:'way',ref:103,role:'inner'}]});
 const t=generateTile({elements},s.center),cut=t.buildings.find(b=>b.id==='way/101'),courtyard=t.buildings.find(b=>b.id==='relation/200');
 assert.ok(cut);assert.equal(Math.max(...cut.rings[0].map(p=>p[0])),500);assert.equal(courtyard.rings.length,2);assert.equal(courtyard.height,10);
 const xs=t.surfaces.flatMap(t=>t.road.flatMap(p=>p[0].map(p=>p[0])));assert.equal(Math.min(...xs),-500);assert.equal(Math.max(...xs),500);
});

import {laneLayout,turnCode} from '../js/tile-builder/street-data.js';
test('lane guidance rejects inconsistent counts and preserves source travel direction',()=>{
 assert.deepEqual(laneLayout({lanes:'3','lanes:forward':'2','lanes:backward':'1'},false),{forward:2,backward:1,total:3});
 assert.equal(laneLayout({lanes:'2','lanes:forward':'2','lanes:backward':'1'},false),null);
 assert.equal(laneLayout({},false),null);
 assert.deepEqual(laneLayout({oneway:'-1','turn:lanes:backward':'left|through'},true),{forward:2,backward:0,total:2});
 assert.equal(turnCode('left;through'),'LS');assert.equal(turnCode('reverse'),null);assert.equal(turnCode('none'),'');
});
test('street assets retain explicit markings, restrictions and reversed one-way lanes without inventing missing paint',()=>{
 const s=tileSelection([.1218,52.2053]),elements=[];let id=1;
 const node=(x,z,tags)=>{const n=id++;elements.push({type:'node',id:n,lon:s.center[0]+x/s.kx,lat:s.center[1]-z/s.kz,tags});return n;};
 const ring=points=>{const ids=points.map(([x,z])=>node(x,z));return [...ids,ids[0]];};
 const a=node(-400,0),b=node(400,0);
 elements.push({type:'way',id:100,nodes:[a,b],tags:{highway:'residential',name:'Fixture Street',width:'6',lanes:'2',oneway:'-1','turn:lanes':'left|through','bus:lanes':'designated|no',lane_markings:'yes'}});
 elements.push({type:'way',id:101,nodes:ring([[20,-3],[30,-3],[30,3],[20,3]]),tags:{road_marking:'box_junction'}});
 elements.push({type:'way',id:102,nodes:ring([[100,6],[105,6],[105,8],[100,8]]),tags:{amenity:'parking_space'}});
 elements.push({type:'way',id:103,nodes:[node(-50,15),node(50,15)],tags:{barrier:'fence'}});
 node(50,0,{road_marking:'keep_clear'});node(80,12,{natural:'tree'});node(80,0,{natural:'tree'});node(90,12,{highway:'street_lamp'});
 node(150,10,{traffic_sign:'GB:616'});node(180,10,{traffic_sign:'unknown'});
 elements.push({type:'relation',id:300,tags:{type:'restriction',restriction:'no_right_turn'},members:[{type:'way',role:'from',ref:100},{type:'node',role:'via',ref:b},{type:'way',role:'to',ref:100}]});
 const tile=generateTile({elements},s.center),street=tile.street;
 assert.equal(street.boxes.length,1);assert.equal(street.parking.length,1);assert.ok(street.counts.fence>0);assert.equal(street.counts.tree,1);assert.equal(street.excluded.length,1);assert.equal(street.counts.lamp,1);
 assert.ok(street.arrows.some(p=>p.code==='L'));assert.ok(street.arrows.every(p=>p.tx<-.99));
 assert.ok(street.arrows.filter(p=>p.code==='L').every(p=>p.z>0));
 assert.ok(street.texts.some(p=>p.text==='KEEP CLEAR'));assert.ok(street.texts.some(p=>p.text==='BUS LANE'));assert.ok(street.signs.some(p=>p.kind==='noentry'));
 assert.equal(street.restrictions[0].tags.restriction,'no_right_turn');assert.ok(street.labels.some(p=>p.text==='Fixture Street'));assert.ok(street.unknown.some(v=>v.includes('unknown')));
 const plain=structuredClone(elements);plain.find(e=>e.id===100&&e.type==='way').tags={highway:'residential',width:'6',lanes:'2'};
 const unmarked=generateTile({elements:plain.filter(e=>!e.tags?.road_marking)},s.center);assert.equal(unmarked.street.arrows.length,0);assert.equal(unmarked.street.texts.length,0);assert.equal(unmarked.street.boxes.length,0);
});

import {tileDetailQuery} from '../server/map/tile-details.js';
import {handleMapRequest} from '../server/map/handler.js';
test('supplementary markings query is bounded, fixed and rejects partial provider responses',async()=>{
 const bounds=tileSelection([.1218,52.2053]).dataBounds;
 assert.match(tileDetailQuery(bounds),/nwr\[road_marking\]/);assert.match(tileDetailQuery(bounds),/amenity=parking_space/);
 assert.throws(()=>tileDetailQuery([52,0,52.012,.015]),/limited/);
 let calls=0;const req=()=>new Request('https://preview.pages.dev/map-api/tile-details',{method:'POST',headers:{Origin:'https://preview.pages.dev'},body:JSON.stringify({bounds})});
 const good=await handleMapRequest(req(),{},{fetch:async url=>{calls++;assert.ok(url.startsWith('https://overpass-api.de/api/interpreter?data='));return Response.json({elements:[]});}});assert.equal(good.status,200);assert.equal(calls,1);
 const partial=await handleMapRequest(req(),{},{fetch:async()=>Response.json({elements:[],remark:'timeout'})});assert.equal(partial.status,502);
 const limited=await handleMapRequest(req(),{},{fetch:async()=>new Response('',{status:429,headers:{'Retry-After':'20'}})});assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'20');
 const foreign=new Request('https://preview.pages.dev/map-api/tile-details',{method:'POST',headers:{Origin:'https://other.test'},body:JSON.stringify({bounds})});assert.equal((await handleMapRequest(foreign,{},{})).status,403);
});
