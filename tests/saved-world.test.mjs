import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeStore,ROUTES_KEY} from '../js/personal/storage.js';
import {saveWorld,restoreWorld,WORLD_PREFIX} from '../js/personal/saved-world.js';
import {generateSection} from '../js/personal/section.js';
import {section,measure,encode} from '../js/personal/geometry.js';
import {createJourney} from '../js/personal/client.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('./fixtures/personal-routes/'+f,import.meta.url)));
const source=read('cambridge-route.json'),coords=source.routes[0].coordinates;
const recipe={version:1,id:'map-test',title:'Map test',createdAt:1,start:coords[0],end:coords.at(-1),distance:measure(coords).length,geometry:encode(coords)};
const track=JSON.parse(JSON.stringify(generateSection(read('cambridge-osm.json'),section(measure(coords),0))));
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
const review={status:'pending',notes:'',automaticCorrection:false};
test('immutable native map revisions retain all geometry and review across restore',async()=>{
 const storage=memory(),store=routeStore(storage),a=await saveWorld(recipe,track,review,{storage,store}),b=await saveWorld(recipe,{...track,title:'Second'},review,{storage,store});
 assert.notEqual(a.savedWorld.key,b.savedWorld.key);assert.equal(store.list().length,2);assert.deepEqual((await restoreWorld(a,{storage})).track,track);
 store.remove(b.id);assert.equal(storage.getItem(b.savedWorld.key),null);assert.deepEqual((await restoreWorld(a,{storage})).track,track);
});
test('damaged, missing and mismatched maps fail without substituting another world',async()=>{
 const storage=memory(),store=routeStore(storage),r=await saveWorld(recipe,track,review,{storage,store});
 await assert.rejects(restoreWorld({...r,geometry:encode([[.1,52],[.11,52.01]])},{storage}),/does not match/);
 const original=storage.getItem(r.savedWorld.key);storage.setItem(r.savedWorld.key,original+' ');await assert.rejects(restoreWorld(r,{storage}),/checksum/);assert.equal(storage.getItem(r.savedWorld.key),original+' ');
 storage.removeItem(r.savedWorld.key);await assert.rejects(restoreWorld(r,{storage}),/not be regenerated/);
});
test('index quota failure rolls back only the new revision, retaining earlier saves',async()=>{
 const storage=memory(),store=routeStore(storage),r=await saveWorld(recipe,track,review,{storage,store}),previous=storage.getItem(ROUTES_KEY);
 const full={...storage,setItem(k,v){if(k===ROUTES_KEY)throw Error('QuotaExceeded');storage.setItem(k,v);}};
 await assert.rejects(saveWorld(recipe,track,review,{storage:full,store:routeStore(full)}),/Earlier maps are kept/);
 assert.equal(storage.getItem(ROUTES_KEY),previous);assert.equal([...storage.data.keys()].filter(k=>k.startsWith(WORLD_PREFIX)).length,1);assert.deepEqual((await restoreWorld(r,{storage})).track,track);
});
test('review cannot be recorded without reference, notes and coverage of categories',async()=>{
 const storage=memory(),store=routeStore(storage);await assert.rejects(saveWorld(recipe,track,{status:'visual-review'},{storage,store}),/Complete the satellite review/);assert.equal(storage.data.size,0);
});
test('saved journey bypasses both providers and generator; cancellation remains effective',async()=>{
 const storage=memory(),store=routeStore(storage),r=await saveWorld(recipe,track,review,{storage,store});
 const old=globalThis.localStorage;globalThis.localStorage=storage;
 try{const forbidden=()=>{throw Error('Unexpected regeneration');},journey=createJourney(r,{store,citySource:forbidden,fetchSection:forbidden,generate:forbidden});assert.deepEqual(await journey.prepare(),track);assert.equal(journey.ready,true);journey.cancel();await assert.rejects(journey.prepare(),e=>e.name==='AbortError');}finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
