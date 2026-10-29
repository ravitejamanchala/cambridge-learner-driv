import http from 'node:http';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {startLocalServer} from '../tools/local-editor-server.mjs';import {inspectTrack} from '../js/editor-track.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/editor-route.json',import.meta.url)));
test('local JSON library validates native routes, saves immutable revisions, persists restarts and rejects external requests',async()=>{
 const store=await fs.mkdtemp(path.join(os.tmpdir(),'local-mocks-'));let server;
 try{
  server=await startLocalServer({port:0,store});let url=`http://127.0.0.1:${server.address().port}`;
  const post=(body,headers={})=>fetch(url+'/__local/tracks',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.ok(inspectTrack(fixture).len>100);
  assert.equal((await post(fixture,{Origin:'https://evil.example'})).status,403);
  assert.equal(await new Promise(resolve=>{http.get(url+'/__local/tracks',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});}),403);
  assert.equal((await post({...fixture,plan:{waypoints:[]}})).status,400);
  assert.equal((await post({...fixture,network:{...fixture.network,nodes:[1e8,1e8]}})).status,400);
  const first=await(await post(fixture)).json();const second=await(await post({...fixture,title:'Updated JSON'})).json();assert.notEqual(first.id,second.id);
  assert.equal((await(await fetch(url+'/__local/tracks')).json()).length,2);
  await new Promise(r=>server.close(r));server=await startLocalServer({port:0,store});url=`http://127.0.0.1:${server.address().port}`;
  const entries=await(await fetch(url+'/__local/tracks')).json();assert.equal(entries.find(e=>e.id===first.id).track.title,fixture.title);
  assert.match(await(await fetch(url+'/auth-config.js')).text(),/LOCAL_AUTHORING:true/);
  assert.equal((await fetch(url+'/.git/config')).status,404);
 }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(store,{recursive:true,force:true});}
});
