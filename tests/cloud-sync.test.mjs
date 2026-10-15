import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSync } from '../js/cloud-sync.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const p={name:'Alice',lessons:{},history:[],mocks:[],practiceSeconds:2};
test('offline outbox survives reload and is isolated by account',async()=>{
 const disk=storage();const off=new CloudSync({userId:'a',storage:disk,request:async()=>{throw Error('offline');}});
 await off.save(p);await off.session({id:'stable-id'});off.close();
 const calls=[];const restored=new CloudSync({userId:'a',storage:disk,request:async(path,body)=>{calls.push({path,body});return {revision:1};}});
 await restored.flush();assert.equal(calls.length,2);assert.equal(calls[1].body.id,'stable-id');assert.equal(restored.state.dirty,false);
 assert.equal(new CloudSync({userId:'b',storage:disk,request:()=>{}}).state.profile,null);
});
test('conflicts preserve local work until the user explicitly resolves them',async()=>{
 let conflict=true;const sync=new CloudSync({userId:'a',storage:storage(),request:async(path,body)=>{if(!body)return {profile:{...p,name:'Cloud'},revision:4};if(conflict)throw Object.assign(Error(),{status:409});return {revision:5};}});
 await sync.save(p);assert.equal(sync.conflict,true);assert.equal(sync.state.profile.name,'Alice');
 conflict=false;await sync.resolve(true);assert.equal(sync.state.revision,5);assert.equal(sync.state.profile.name,'Alice');
});
test('changes made while an earlier save is in flight are drained next',async()=>{
 let release;const gate=new Promise(r=>release=r);let n=0;const names=[];
 const sync=new CloudSync({userId:'a',storage:storage(),request:async(path,body)=>{names.push(body.profile.name);if(++n===1)await gate;return {revision:n};}});
 const first=sync.save(p);sync.save({...p,name:'New'});release();await first;assert.deepEqual(names,['Alice','New']);assert.equal(sync.state.dirty,false);
});
test('closing an account stops queued requests and preserves its outbox',async()=>{
 let release;const gate=new Promise(r=>release=r);let calls=0;
 const disk=storage();const sync=new CloudSync({userId:'a',storage:disk,request:async()=>{calls++;await gate;return {revision:1};}});
 const pending=sync.save(p);sync.session({id:'pending'});sync.close();release();await pending;
 assert.equal(calls,1);assert.equal(sync.state.sessions.length,1);
});
