import test from 'node:test';
import assert from 'node:assert/strict';
import {hasFullAccess} from '../src/access.mjs';
import {createApp} from '../.test-build/app.mjs';
test('only private full tag grants access',()=>{
 assert.equal(hasFullAccess({privateMetadata:{learnerAccess:'full'}}),true);
 for(const user of [null,{}, {publicMetadata:{learnerAccess:'full'}},{unsafeMetadata:{learnerAccess:'full'}},{privateMetadata:{learnerAccess:true}},{privateMetadata:{learnerAccess:'Full'}}])assert.equal(hasFullAccess(user),false);
});
test('access is rechecked on every request and denial blocks progress',async()=>{
 let full=false,reads=0;
 const app=createApp({verify:async()=>({sub:'alice',sid:'s'}),getAccess:async id=>{assert.equal(id,'alice');return full;},store:{user:async()=> 'internal',progress:async()=>{reads++;return {};}}});
 const env={DATABASE_URL:'fake',CLERK_SECRET_KEY:'fake',FRONTEND_URL:'https://manchala.co.uk',RATE_LIMITER:{limit:async()=>({success:true})}};
 const req=path=>app.request(path,{headers:{Authorization:'Bearer token'}},env);
 assert.equal((await (await req('/api/me')).json()).access.full,false);
 assert.equal((await req('/api/progress')).status,403);assert.equal(reads,0);
 full=true;assert.equal((await req('/api/progress')).status,200);
 full=false;assert.equal((await req('/api/progress')).status,403);assert.equal(reads,1);
});
