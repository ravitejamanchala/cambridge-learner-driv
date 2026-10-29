import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {measure,section,metres,at,encode,decode,project,unproject,locate} from '../js/personal/geometry.js';
import {routeStore,ROUTES_KEY,CACHE_KEY} from '../js/personal/storage.js';
import {generateSection} from '../js/personal/section.js';
import {handleMapRequest} from '../server/map/handler.js';
import {canUsePlan,basicProgressAllowed} from '../shared/access-policy.mjs';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const geometry=[[.12,52.2],[.121,52.204]],recipe=()=>({version:1,id:'test-1',title:'Cambridge practice',createdAt:1,start:geometry[0],end:geometry[1],geometry:encode(geometry),distance:450});
const read=f=>JSON.parse(fs.readFileSync(new URL('./fixtures/personal-routes/'+f,import.meta.url)));
test('long routes have no 50 km cutoff, every section is bounded with overlaps',()=>{
 const route=measure([[.12,52.2],[.13,53.8]]);assert.ok(route.length>150000);const count=Math.ceil(route.length/600);
 let previous;for(let i=0;i<count;i++){const p=section(route,i);assert.ok(p.end-p.start<=900.001);assert.ok((p.bounds[2]-p.bounds[0])*111320<2000);if(previous)assert.deepEqual(at(route,previous.advance),at(route,p.start+150));previous=p;}assert.equal(previous.end,route.length);
});
test('geographic round trip, compressed storage and progress around loops',()=>{
 const points=[[.122222,52.201111],[.12,52.21],[.14,52.205555]],n={origin:[52.2,.1],kx:68000,kz:110574};assert.deepEqual(decode(encode(points)),points);
 for(const p of points)assert.ok(metres(p,unproject(n,project(n,p)))<.001);
 const r=measure([geometry[0],geometry[1],geometry[0],geometry[1]]),hit=locate(r,at(r,20),0);assert.ok(Math.abs(hit.s-20)<.1);assert.throws(()=>decode('?'));assert.throws(()=>measure([[NaN,0],[1,1]]));
});
test('save, restore, rename, delete and quota failure preserve prior recipes',()=>{
 const memoryStore=memory(),s=routeStore(memoryStore),r=recipe();s.save(r);assert.deepEqual(routeStore(memoryStore).list(),[r]);s.save({...r,title:'Renamed'});assert.equal(s.list().length,1);assert.equal(s.list()[0].title,'Renamed');
 s.putSection(r.id,0,{network:{},plan:{},objects:[]});assert.ok(s.getSection(r.id,0));s.remove(r.id);assert.equal(s.list().length,0);assert.equal(s.getSection(r.id,0),null);
 s.save(r);const previous=memoryStore.getItem(ROUTES_KEY),quota={...memoryStore,setItem:()=>{throw Error('quota');}};assert.throws(()=>routeStore(quota).save({...r,title:'lost'}),/storage is full/);assert.equal(memoryStore.getItem(ROUTES_KEY),previous);
 memoryStore.setItem(ROUTES_KEY,'{broken');assert.throws(()=>s.list(),/kept/);assert.equal(memoryStore.getItem(ROUTES_KEY),'{broken');
});
test('Cambridge mapped road imports reuse native geometry, clearance and simulator buildings',()=>{
 const r=read('cambridge-route.json'),p=section(measure(r.routes[0].coordinates),0),track=generateSection(read('cambridge-osm.json'),p);
 assert.equal(track.buildingStyle,'simulator');assert.equal(track.practiceMode,'experimental');assert.ok(track.objects.some(o=>o.type==='building'));assert.ok(track.network.edges.length);assert.ok(track.plan.nodes.length>2);assert.notEqual(track.network,track.renderNetwork);assert.ok(metres(r.start,unproject(track.network,track.spawn))<5);
 assert.throws(()=>generateSection({elements:[],remark:'timed out'},p),/incomplete/);
});
test('personal practice is available to basic accounts without unlocking mocks or progress writes',()=>{
 assert.ok(canUsePlan({kind:'personal'},false));assert.equal(canUsePlan({kind:'mock'},false),false);
 const profile={lessons:{},mocks:[],history:[]};assert.equal(basicProgressAllowed({...profile,mocks:[{id:'personal'}]},profile),false);
});
const req=(path,body,origin='https://routes-review.learner-drive-app.pages.dev')=>new Request(origin+'/map-api/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});
test('map proxy validates requests, rejects arbitrary URLs/methods and missing production routing config',async()=>{
 let calls=0;const deps={fetch:async()=>{calls++;return Response.json({});}};
 assert.equal((await handleMapRequest(req('osm',{bounds:[0,0,20,20]}),{},deps)).status,400);
 assert.equal((await handleMapRequest(req('route',{start:[Infinity,1],end:[2,3]}),{},deps)).status,400);
 assert.equal((await handleMapRequest(req('route',{start:[.1,52],end:[.2,53]},'https://app.slaydrive.com'),{},deps)).status,503);
 assert.equal((await handleMapRequest(req('https://example.com'),{},deps)).status,404);
 assert.equal((await handleMapRequest(req('osm'),{},deps)).status,405);assert.equal(calls,0);
});
test('map proxy preserves provider rate limits and reports no-route / incomplete-map errors',async()=>{
 const request=req('route',{start:[.1,52],end:[.2,53]});let url;
 const r=await handleMapRequest(request.clone(),{}, {fetch:async u=>{url=u;return Response.json({code:'NoRoute',routes:[]});}});assert.equal(r.status,422);assert.match(url,/routing.openstreetmap.de/);
 const limited=await handleMapRequest(request.clone(),{},{fetch:async()=>new Response('',{status:429,headers:{'Retry-After':'17'}})});assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'17');
 const incomplete=await handleMapRequest(req('osm',{bounds:[52,.1,52.001,.101]}),{},{fetch:async()=>Response.json({elements:[],remark:'timeout'})});assert.equal(incomplete.status,502);
});
test('personal drive honours configured sign-in but needs no paid entitlement',async()=>{
 const {canAccessPlan,setAuthConfigured,setSignedIn,setAccess}=await import('../js/access.js');
 setAuthConfigured(true);setSignedIn(false);setAccess(false);assert.equal(canAccessPlan({kind:'personal'}),false);
 setSignedIn(true);assert.equal(canAccessPlan({kind:'personal'}),true);assert.equal(canAccessPlan({kind:'mock'}),false);
 setSignedIn(false);assert.equal(canAccessPlan({kind:'personal'}),false);setAuthConfigured(false);
});
test('cancelled section requests do not finish or write map cache',async()=>{
 const {createJourney,abortableDelay}=await import('../js/personal/client.js');let writes=0;
 const journey=createJourney(recipe(),{store:{getSection:()=>null,putSection:()=>writes++},fetchSection:async(_,options)=>{await abortableDelay(500,options.signal);return{};},generate:()=>({})});
 const request=journey.get(0);journey.cancel();await assert.rejects(request,e=>e.name==='AbortError');assert.equal(writes,0);assert.equal(journey.cancelled,true);
});
