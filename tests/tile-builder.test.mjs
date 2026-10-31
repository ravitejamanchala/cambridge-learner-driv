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

import {bufferedLine,tileSurfaces} from '../js/tile-builder/surfaces.js';
import {insideRing,ringArea} from '../js/road-space.js';
import {polygonOperation} from '../js/road-surfaces.js';
test('continuous road buffers keep short bends filled and pavements outside the carriageway',()=>{
 const points=[[-60,-10],[-1,0],[0,.15],[.35,.1],[12,-2],[60,5]],polys=bufferedLine(points,3.2);
 const covered=([x,z])=>polys.some(p=>insideRing([x,z],p[0])&&!p.slice(1).some(h=>insideRing([x,z],h)));
 for(let i=1;i<points.length;i++)for(let j=1;j<20;j++){const t=j/20,p=points[i].map((v,k)=>points[i-1][k]*(1-t)+v*t);assert.ok(covered(p),'centreline must not develop a triangular hole');}
 const s=tileSelection([.1218,52.2053]),elements=points.map(([x,z],i)=>({type:'node',id:i+1,lon:s.center[0]+x/s.kx,lat:s.center[1]-z/s.kz}));elements.push({type:'way',id:100,nodes:points.map((_,i)=>i+1),tags:{highway:'residential',lanes:'2',width:'6.4'}});
 const tile=generateTile({elements},s.center),surface=tile.surfaces[0];assert.ok(tile.street.inferredPaint>0);assert.ok(tile.street.paint.length>0);
 assert.equal(polygonOperation(surface.road,[...surface.pave,...surface.kerb],'intersection').reduce((s,p)=>s+ringArea(p[0]),0),0);
 elements.at(-1).tags.lane_markings='no';assert.equal(generateTile({elements},s.center).street.inferredPaint,0);
});
test('pedestrian crossings use source location and distinguish signal studs from zebra stripes',()=>{
 const s=tileSelection([.1218,52.2053]),node=(id,x,tags)=>({type:'node',id,lon:s.center[0]+x/s.kx,lat:s.center[1],tags});
 const elements=[node(1,-100),node(2,-30,{highway:'crossing',crossing:'traffic_signals',tactile_paving:'yes'}),node(3,30,{highway:'crossing',crossing_ref:'zebra'}),node(4,100),{type:'way',id:100,nodes:[1,2,3,4],tags:{highway:'residential',width:'6',lanes:'2',lane_markings:'no'}}];
 const tile=generateTile({elements},s.center);assert.deepEqual(tile.street.crossings.map(c=>c.kind),['signals','zebra']);assert.ok(Math.abs(tile.street.crossings[0].x+30)<.1);assert.ok(tile.street.tactile.length===2);assert.ok(tile.street.paint.length>10);
});

import {yellowBoxPaint} from '../js/tile-builder/markings.js';
test('yellow box hatching follows a skewed boundary and leaves pedestrian islands clear',()=>{
 const box=[[[0,0],[14,3],[12,16],[-2,12]],[[4,5],[7,5],[7,8],[4,8]]],paint=yellowBoxPaint([box]);assert.ok(paint.length>0);
 assert.equal(polygonOperation(paint,[box],'difference').reduce((n,p)=>n+ringArea(p[0]),0),0);
 const hole=[[box[1]]];assert.equal(polygonOperation(paint,hole,'intersection').reduce((n,p)=>n+ringArea(p[0]),0),0);
});

test('mapped signal direction prevents reverse-facing duplicate heads and pedestrian heads stay distinct',()=>{
 const s=tileSelection([.1218,52.2053]),node=(id,x,tags)=>({type:'node',id,lon:s.center[0]+x/s.kx,lat:s.center[1],tags});
 const source={elements:[node(1,-100),node(2,0,{highway:'traffic_signals','traffic_signals:direction':'forward'}),node(3,100),{type:'way',id:100,nodes:[1,2,3],tags:{highway:'residential',width:'6.4',lanes:'2'}}]};
 const forward=generateTile(source,s.center);assert.equal(forward.street.signals.filter(s=>s.role==='vehicle').length,1);assert.ok(forward.street.signals[0].tx>.99);assert.equal(forward.street.omittedSignalApproaches,1);
 const reversed=structuredClone(source);reversed.elements[1].tags['traffic_signals:direction']='backward';reversed.elements.at(-1).tags.oneway='-1';const backward=generateTile(reversed,s.center);assert.equal(backward.street.signals.filter(s=>s.role==='vehicle').length,1);assert.ok(backward.street.signals[0].tx<-.99);
 const crossing=structuredClone(source);crossing.elements.push(node(4,15,{highway:'crossing',crossing:'traffic_signals',tactile_paving:'yes'}));crossing.elements.find(e=>e.type==='way').nodes=[1,2,4,3];const tile=generateTile(crossing,s.center);
 assert.equal(tile.street.signals.filter(s=>s.role==='pedestrian').length,2);assert.equal(tile.street.signals.filter(s=>s.role==='vehicle').length,2);assert.ok(tile.street.signals.filter(s=>s.role==='pedestrian').every(s=>Math.abs(s.tx)<.01));
});

test('a junction-coordinated crossing reuses traffic approaches instead of creating standalone vehicle signals',()=>{
 const s=tileSelection([.1218,52.2053]),node=(id,x,z,tags)=>({type:'node',id,lon:s.center[0]+x/s.kx,lat:s.center[1]-z/s.kz,tags}),elements=[node(1,0,-100),node(2,0,0,{highway:'traffic_signals'}),node(3,0,100),node(4,-100,0),node(5,100,0)];
 elements.push({type:'way',id:100,nodes:[1,2,3],tags:{highway:'primary',width:'6.4',lanes:'2'}},{type:'way',id:101,nodes:[4,2,5],tags:{highway:'secondary',width:'6.4',lanes:'2'}});
 const base=generateTile({elements},s.center),vehicleCount=base.street.signals.filter(s=>s.role==='vehicle').length;
 elements.push(node(6,0,12,{highway:'crossing',crossing:'traffic_signals',button_operated:'no'}));elements.find(e=>e.type==='way'&&e.id===100).nodes=[1,2,6,3];
 const automatic=generateTile({elements},s.center);assert.equal(automatic.street.crossings[0].controller.kind,'junction');assert.equal(automatic.street.crossings[0].request,'automatic');assert.equal(automatic.street.signals.filter(s=>s.role==='vehicle').length,vehicleCount);
 elements.at(-1).tags.button_operated='yes';const requested=generateTile({elements},s.center);assert.equal(requested.street.crossings[0].controller.kind,'junction');assert.equal(requested.street.crossings[0].request,'button');assert.equal(requested.street.signals.filter(s=>s.role==='vehicle').length,vehicleCount);
});

import {buildNet} from '../js/net.js';
import {roadsidePosition} from '../js/road-space.js';
test('a signal cannot fall back onto the opposite footway and create a back-to-back pair',()=>{
 const tile=generateTile(osm,[.1218,52.2053]),net=buildNet(tile.street.network),e=net.edges.find(e=>e.len>40),i=Math.floor(e.n/2),f={x:e.px[i],z:e.pz[i],tx:1,tz:0,w:e.way.w};
 const blocked=(_x,z)=>z<f.z;
 assert.equal(roadsidePosition(net,f,{blocked,sideOnly:true}),null);
 const fallback=roadsidePosition(net,f,{blocked});assert.ok(fallback&&fallback.z>f.z);
});
