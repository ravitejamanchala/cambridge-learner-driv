import test from 'node:test';
import assert from 'node:assert/strict';
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
const {Profiles}=await import('../js/profile.js');
test('old profiles keep IDs, pass states, attempts, scores and mock results on migration',()=>{
 store.set('cambridge-learner-drive.v1',JSON.stringify({current:'old',profiles:[{id:'old',name:'Original',lessons:{'move-off':{attempts:2,passed:true,bestD:1}},mocks:[{route:'west',pass:true,D:0,S:0}]}]}));
 Profiles.init(); assert.equal(Profiles.current().id,'old');assert.equal(Profiles.lesson('move-off').bestD,1);assert.equal(Profiles.mockStats('west').passes,1);
 Profiles.recordLesson('controlled-stop',{pass:false,D:1,S:0,duration:60,report:{pass:false}});
 assert.equal(Profiles.lesson('controlled-stop').attempts,1);assert.equal(Profiles.lesson('controlled-stop').passed,false);assert.equal(Profiles.summary().practiceSeconds,60);
 Profiles.init();assert.equal(Profiles.lesson('move-off').passed,true);assert.equal(Profiles.summary().history.length,1);assert.equal(Profiles.lesson('controlled-stop').latestReport.pass,false);
});
test('history is bounded while total time survives and bot data is separate',()=>{
 Profiles.create('History');for(let i=0;i<60;i++) Profiles.recordLesson('speed',{pass:true,D:0,S:0,duration:2});
 assert.equal(Profiles.summary().history.length,50);assert.equal(Profiles.summary().practiceSeconds,120);assert.equal(Profiles.lesson('speed').attempts,60);
 Profiles.init();assert.equal(Profiles.lesson('speed').attempts,60);
});
test('failed storage writes still leave usable progress in memory',()=>{
 const original=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota')};Profiles.create('Memory');Profiles.recordLesson('speed',{pass:true,D:0,S:0});assert.equal(Profiles.lesson('speed').passed,true);localStorage.setItem=original;
});
test('sign-in uses separate account data and sign-out restores untouched guest progress',()=>{
 Profiles.useAccount(null);Profiles.create('Guest');Profiles.recordLesson('guest-lesson',{pass:true,D:0,S:0});
 const guest=localStorage.getItem('cambridge-learner-drive.v1');
 Profiles.useAccount('alice',{name:'Alice',lessons:{},history:[],mocks:[],practiceSeconds:0});
 Profiles.recordLesson('private-lesson',{pass:true,D:0,S:0});
 assert.equal(Profiles.isAccount(),true);assert.equal(Profiles.guest().name,'Guest');
 assert.equal(localStorage.getItem('cambridge-learner-drive.v1'),guest);
 Profiles.useAccount('bob',{name:'Bob',lessons:{},history:[],mocks:[],practiceSeconds:0});assert.equal(Profiles.lesson('private-lesson'),null);
 Profiles.useAccount(null);assert.equal(Profiles.current().name,'Guest');assert.equal(Profiles.lesson('guest-lesson').passed,true);assert.equal(Profiles.lesson('private-lesson'),null);
});
