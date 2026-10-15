import test from 'node:test';
import assert from 'node:assert/strict';
import {hasFullAccess} from '../src/access.mjs';
import {createApp} from '../.test-build/app.mjs';
test('only private full tag grants access',()=>{
 assert.equal(hasFullAccess({privateMetadata:{learnerAccess:'full'}}),true);
 for(const user of [null,{}, {publicMetadata:{learnerAccess:'full'}},{unsafeMetadata:{learnerAccess:'full'}},{privateMetadata:{learnerAccess:true}},{privateMetadata:{learnerAccess:'Full'}}])assert.equal(hasFullAccess(user),false);
});
test('basic accounts retain free progress while premium sessions require access',async()=>{
 let full=false,saves=0;
 const store={user:async()=> 'internal',billing:async()=>null,progress:async()=>({profile:null,revision:0}),saveSession:async()=>{saves++;return {id:'saved'};}};
 const app=createApp({verify:async()=>({sub:'alice',sid:'s'}),getAccess:async id=>{assert.equal(id,'alice');return full;},store});
 const env={DATABASE_URL:'fake',CLERK_SECRET_KEY:'fake',FRONTEND_URL:'https://manchala.co.uk',RATE_LIMITER:{limit:async()=>({success:true})}};
 const req=(path,body)=>app.request(path,{headers:{Authorization:'Bearer token','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})},env);
 assert.equal((await (await req('/api/me')).json()).access.full,false);
 assert.equal((await req('/api/progress')).status,200);
 const session=id=>({id:crypto.randomUUID(),startedAt:new Date().toISOString(),duration:1,kind:'lesson',data:{lessonId:id},faults:[]});
 assert.equal((await req('/api/sessions',session('move-off'))).status,403);
 assert.equal((await req('/api/sessions',session('controlled-stop'))).status,201);
 full=true;assert.equal((await req('/api/sessions',session('move-off'))).status,201);
 full=false;assert.equal((await req('/api/sessions',session('move-off'))).status,403);assert.equal(saves,2);
});
