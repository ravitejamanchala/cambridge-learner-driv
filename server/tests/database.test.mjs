import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createStore } from '../.test-build/store.mjs';
import { migrationSQL } from '../tools/migrate.mjs';
const pg=new PGlite();
const store=createStore('unused',drizzle(pg));
test('PostgreSQL migrations are repeatable, checksum protected and atomic',async()=>{
 const source=await migrationSQL();
 const broken=new PGlite();
 await assert.rejects(()=>broken.exec(source.replace('CREATE INDEX sessions_user_time','CREATE BAD_INDEX sessions_user_time')));
 assert.equal((await broken.query("select to_regclass('users') as t")).rows[0].t,null);await broken.close();
 await pg.exec(source);await pg.exec(source);
 assert.equal((await pg.query('select * from app_migrations')).rows.length,1);
 await pg.exec("update app_migrations set checksum='tampered'");
 await assert.rejects(()=>pg.exec(source),/checksum mismatch/);
 await pg.exec('drop table app_migrations');await pg.exec('drop table ai_feedback,driving_faults,driving_sessions,lesson_progress,learner_profiles,users cascade');await pg.exec(source);
});
test('real embedded PostgreSQL persists progress; stale revisions and user leaks are prevented',async()=>{
 const a=await store.user('alice'),b=await store.user('bob');assert.notEqual(a,b);
 const p={name:'Alice',lessons:{engine:{attempts:1,passed:true,bestD:0}},mocks:[],history:[],practiceSeconds:5};
 assert.equal((await store.saveProgress(a,{revision:0,profile:p})).revision,1);
 assert.equal(await store.saveProgress(a,{revision:0,profile:p}),null);
 assert.equal((await store.saveProgress(a,{revision:1,profile:{...p,name:'Updated'}})).revision,2);
 assert.equal((await store.progress(a)).profile.name,'Updated');assert.equal((await store.progress(b)).profile,null);
 assert.equal((await pg.query('select * from lesson_progress')).rows.length,1);
 await store.saveProgress(a,{revision:2,profile:{...p,lessons:{}}});assert.equal((await pg.query('select * from lesson_progress')).rows.length,0);
});
test('sessions, faults and feedback commit together; duplicates and ownership collisions are safe',async()=>{
 const a=await store.user('alice'),b=await store.user('bob');
 const s={id:crypto.randomUUID(),startedAt:new Date().toISOString(),duration:9,kind:'lesson',data:{pass:true},faults:[{cat:'Control'}],feedback:{summary:'Practice'}};
 assert.equal((await store.saveSession(a,s)).duplicate,false);assert.equal((await store.saveSession(a,s)).duplicate,true);
 assert.equal(await store.saveSession(b,s),null);assert.equal(await store.saveSession(a,{...s,duration:10}),null);
 assert.equal(await store.session(b,s.id),null);assert.equal((await store.list(a,20,0)).length,1);
 assert.equal((await pg.query('select * from driving_faults')).rows.length,1);assert.equal((await pg.query('select * from ai_feedback')).rows.length,1);
 await assert.rejects(()=>store.saveSession(a,{...s,id:crypto.randomUUID(),duration:-1}));assert.equal((await store.list(a,20,0)).length,1);
 await pg.close();
});
