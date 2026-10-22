import {chromium} from 'playwright';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=await fs.mkdtemp(path.join(os.tmpdir(),'pages-preview-'));let server,browser;
try{
 await fs.symlink(path.resolve('dist'),path.join(root,'cambridge-learner-driv'));
 server=spawn('python3',['-m','http.server','8789','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});const url='http://127.0.0.1:8789/cambridge-learner-driv/';
 for(let i=0;i<100;i++){try{const response=await fetch(url);await response.arrayBuffer();if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],localRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/__local/'))localRequests.push(r.url());});
 const three=path.dirname(require.resolve('three/package.json'));await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 const fixture=JSON.parse(await fs.readFile('tests/fixtures/editor-route.json','utf8')),tracks=[];
 for(let i=0;i<3;i++){
  const track=structuredClone(fixture),x=i*500,len=60+i*40;track.title='Distinct import '+(i+1);track.network.nodes=[x*10,0,x*10,-len*10];track.network.edges=[[0,1,0,[x*10,0,x*10,-len*10]]];track.plan.waypoints=[{x,z:0},{x,z:-len}];track.spawn={x,z:-5,heading:0};track.objects=Array.from({length:i+1},(_,k)=>({...structuredClone(fixture.objects[0]),id:'building-'+i+'-'+k,x:x+20+k*20,z:-30}));tracks.push(track);
 }
 console.log('Opening Pages build for three-track regression');await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Three track tester');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 const ids=[];
 for(let i=0;i<3;i++){
  const track=tracks[i];await page.locator('[data-open=mockSheet]').click();await page.getByLabel('Import editor track JSON').setInputFiles({name:'route-'+i+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(track))});
  await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved in this browser'));
  await page.locator('[data-open=mockSheet]').click();assert.match(await page.locator('#routePick [aria-checked=true]').innerText(),new RegExp(track.title));assert.match(await page.locator('#mockDetail').innerText(),new RegExp(track.title));
  await page.waitForFunction(title=>document.querySelector('#localTrackSummary')?.textContent.includes(title),track.title);
  await page.locator('#localTrackLibrary summary').click();const value=JSON.parse(await page.getByLabel('Editor track JSON',{exact:true}).inputValue());assert.deepEqual(value,track);ids.push(await page.getByLabel('Saved local revision').inputValue());
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON'}).click();const file=await download;assert.deepEqual(JSON.parse(await fs.readFile(await file.path(),'utf8')),track);assert.ok(file.suggestedFilename().includes(ids[i].slice(0,8)));
  await page.locator('#mockDetail [data-start]').click();await page.waitForFunction(()=>document.body.dataset.mode==='drive');
  const world=await page.evaluate(()=>{const a=window.cambridgeDrive;return {x:a.player.x,z:a.player.z,firstX:a.net.nx[0],length:a.test.route.len,buildings:a.camera.parent.children.filter(o=>o.userData.editorObjectId).length,area:a.area};});
  assert.equal(world.x,track.spawn.x);assert.equal(world.z,track.spawn.z);assert.equal(world.firstX,i*500);assert.equal(Math.round(world.length),60+i*40);assert.equal(world.buildings,i+1);assert.equal(world.area,'local:'+ids[i]);
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/import-world-'+i+'.png'});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 }
 // Route list and revision dropdown both select the exact same saved map and download.
 await page.locator('[data-open=mockSheet]').click();await page.locator('#localTrackLibrary summary').click();
 for(let i=0;i<3;i++){
  await page.getByLabel('Saved local revision').selectOption(ids[i]);assert.match(await page.locator('#routePick [aria-checked=true]').innerText(),new RegExp(tracks[i].title));assert.deepEqual(JSON.parse(await page.getByLabel('Editor track JSON',{exact:true}).inputValue()),tracks[i]);
  await page.locator('#routePick button').filter({hasText:tracks[(i+1)%3].title}).click();await page.waitForFunction(expected=>document.querySelector('[aria-label="Saved local revision"]').value===expected,ids[(i+1)%3]);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON'}).click();const file=await download;assert.deepEqual(JSON.parse(await fs.readFile(await file.path(),'utf8')),tracks[(i+1)%3]);
 }
 await page.locator('#routePick button').filter({hasText:'East Road and Elizabeth Way'}).click();assert.equal(await page.getByRole('button',{name:'Download JSON'}).isDisabled(),true);assert.equal(await page.getByLabel('Editor track JSON',{exact:true}).inputValue(),'');
 // A real download from the admin route generator (including its historical road-label bug).
 const actual=JSON.parse(await fs.readFile('tests/fixtures/admin-cambridge-route.json','utf8'));
 await page.getByLabel('Import editor track JSON').setInputFiles('tests/fixtures/admin-cambridge-route.json');await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved in this browser'));await page.locator('[data-open=mockSheet]').click();assert.match(await page.locator('#routePick [aria-checked=true]').innerText(),/Cambridge start/);
 await page.locator('#localTrackLibrary summary').click();assert.deepEqual(JSON.parse(await page.getByLabel('Editor track JSON',{exact:true}).inputValue()),actual,'legacy download stays unchanged in storage/export');await page.locator('#mockDetail [data-start]').click();await page.waitForFunction(()=>document.body.dataset.mode==='drive');
 const actualWorld=await page.evaluate(()=>({len:cambridgeDrive.test.route.len,x:cambridgeDrive.player.x,z:cambridgeDrive.player.z,running:cambridgeDrive.test.running,buildings:cambridgeDrive.camera.parent.children.filter(o=>o.userData.editorObjectId).length}));assert.ok(actualWorld.len>90&&actualWorld.len<105);assert.equal(actualWorld.x,actual.spawn.x);assert.equal(actualWorld.z,actual.spawn.z);assert.equal(actualWorld.running,true);assert.equal(actualWorld.buildings,actual.objects.filter(o=>o.type==='building').length);await page.screenshot({path:'test-results/actual-admin-route-import.png'});console.log('PASS actual admin export imports unchanged and drives a 95 m Cambridge route with its own OSM buildings.',actualWorld);
 assert.deepEqual(errors,[]);assert.deepEqual(localRequests,[]);console.log('PASS: three different imports automatically select and drive three different worlds; revision/list/export selection stays synchronised, reload retains selection, built-in routes cannot export unrelated JSON.');
}finally{await browser?.close();server?.kill();await fs.rm(root,{recursive:true,force:true});}
