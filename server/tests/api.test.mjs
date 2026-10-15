import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../.test-build/app.mjs';
const env={ DATABASE_URL:'fake',CLERK_SECRET_KEY:'fake',FRONTEND_URL:'https://manchala.co.uk',RATE_LIMITER:{limit:async()=>({success:true})} };
const profile={name:'Learner',lessons:{},mocks:[],history:[],practiceSeconds:0};
const store={ready:async()=>{},user:async id=>id,progress:async()=>({profile:null,revision:0}),saveProgress:async()=>({revision:1}),list:async()=>[],session:async(user)=>user==='alice'?{pass:true}:null};
const app=createApp({getAccess:async()=>true,store,verify:async token=>{if(token==='bad')throw Error('secret');return {sub:token,sid:'session'};}});
const request=(path,opts={},bindings=env)=>app.request(path,{headers:{Authorization:'Bearer alice',Origin:env.FRONTEND_URL,'Content-Type':'application/json'},...opts},bindings);
test('liveness and readiness are distinct; missing config fails closed',async()=>{
 assert.equal((await app.request('/health',{},{})).status,200);
 assert.equal((await app.request('/health/ready',{},{})).status,503);
 assert.equal((await request('/health/ready')).status,200);
});
test('auth rejects missing and invalid tokens',async()=>{
 for(const headers of [{},{Authorization:'Bearer bad'}])assert.equal((await request('/api/me',{headers})).status,401);
});
test('rejects foreign origins and does not reflect them in CORS',async()=>{
 const r=await request('/api/me',{headers:{Origin:'https://evil.example',Authorization:'Bearer alice'}});assert.equal(r.status,403);assert.notEqual(r.headers.get('access-control-allow-origin'),'https://evil.example');
 const ok=await request('/api/me');assert.equal(ok.headers.get('access-control-allow-origin'),env.FRONTEND_URL);
});
test('server validates body, ids, pagination and payload size',async()=>{
 assert.equal((await request('/api/progress',{method:'POST',body:'bad'})).status,400);
 assert.equal((await request('/api/progress',{method:'POST',body:JSON.stringify({revision:0,profile})})).status,200);
 assert.equal((await request('/api/progress',{method:'POST',body:JSON.stringify({revision:0,profile,userId:'other'})})).status,400);
 assert.equal((await request('/api/sessions?limit=1000')).status,400);
 assert.equal((await request('/api/sessions/not-a-uuid')).status,400);
 assert.equal((await request('/api/progress',{method:'POST',body:'x'.repeat(262145)})).status,413);
});
test('user-scoped session detail conceals another user’s records',async()=>{
 const id=crypto.randomUUID();assert.equal((await request('/api/sessions/'+id)).status,200);
 assert.equal((await request('/api/sessions/'+id,{headers:{Authorization:'Bearer bob'}})).status,404);
});
test('rate limits fail closed with safe error response',async()=>{
 const r=await request('/api/me',{}, {...env,RATE_LIMITER:{limit:async()=>({success:false})}});assert.equal(r.status,429);
 const broken=createApp({getAccess:async()=>true,store:{user:async()=>{throw Error('password=secret');}},verify:async()=>({sub:'alice',sid:'x'})});
 const fail=await broken.request('/api/me',{headers:{Authorization:'Bearer alice'}},env);assert.equal(fail.status,503);assert.equal((await fail.text()).includes('secret'),false);
});
test('API exposes revision conflicts, idempotent session statuses and bounded pagination',async()=>{
 let duplicate=false;
 const api=createApp({getAccess:async()=>true,verify:async()=>({sub:'alice',sid:'s'}),store:{...store,
  saveProgress:async()=>null,
  saveSession:async()=>{const result={id:'saved',duplicate};duplicate=true;return result;},
  list:async(_user,limit,offset)=>{assert.equal(limit,3);assert.equal(offset,10);return [{id:1},{id:2},{id:3}];}
 }});
 const req=(path,body)=>api.request(path,{headers:{Authorization:'Bearer alice','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})},env);
 assert.equal((await req('/api/progress',{revision:0,profile})).status,409);
 const session={id:crypto.randomUUID(),startedAt:new Date().toISOString(),duration:1,kind:'mock',data:{},faults:[]};
 assert.equal((await req('/api/sessions',session)).status,201);assert.equal((await req('/api/sessions',session)).status,200);
 assert.deepEqual(await (await req('/api/sessions?limit=2&offset=10')).json(),{sessions:[{id:1},{id:2}],nextOffset:12});
});
