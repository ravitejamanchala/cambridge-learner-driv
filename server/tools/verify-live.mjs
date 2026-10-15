// Writes only a uniquely named verification fixture and removes it in finally.
import { neon } from '@neondatabase/serverless';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['src/store.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.test-build/store.mjs'});
const {createStore}=await import('../.test-build/store.mjs');
const url=process.env.DATABASE_URL;
if(!url)throw Error('DATABASE_URL required');
const sql=neon(url),store=createStore(url),clerkId='recovery-verification:'+crypto.randomUUID();
let user;
try {
 await store.ready();user=await store.user(clerkId);
 const profile={name:'Verification fixture',lessons:{engine:{attempts:1,passed:true,bestD:0}},history:[],mocks:[],practiceSeconds:5};
 assert.equal((await store.saveProgress(user,{profile,revision:0})).revision,1);
 assert.equal((await store.progress(user)).profile.name,profile.name);
 assert.equal(await store.saveProgress(user,{profile,revision:0}),null);
 assert.equal((await store.saveProgress(user,{profile:{...profile,practiceSeconds:10},revision:1})).revision,2);
 const session={id:crypto.randomUUID(),startedAt:new Date().toISOString(),duration:5,kind:'lesson',data:{pass:true},faults:[{cat:'Control'}],feedback:{summary:'Verification only'}};
 assert.equal((await store.saveSession(user,session)).duplicate,false);
 assert.equal((await store.saveSession(user,session)).duplicate,true);
 assert.equal((await store.session(user,session.id)).id,session.id);
 assert.equal((await store.list(user,20,0)).length,1);
 const counts=await sql`select (select count(*) from driving_faults where session_id=${session.id}::uuid)::int as faults, (select count(*) from ai_feedback where session_id=${session.id}::uuid)::int as feedback`;
 assert.deepEqual(counts[0],{faults:1,feedback:1});
 console.log('LIVE Neon: progress write/read/update, stale revision rejection, session duplicate prevention, history, faults and feedback passed');
} catch {console.error('Live verification failed (credentials suppressed)');process.exitCode=1;}
finally {if(user) {await sql`delete from users where id=${user}::uuid and clerk_id=${clerkId}`;console.log('Verification fixture removed; application user records retained');}}
