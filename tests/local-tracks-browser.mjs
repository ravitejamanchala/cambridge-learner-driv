import {chromium} from 'playwright';import {startLocalServer} from '../tools/local-editor-server.mjs';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),store=await fs.mkdtemp(path.join(os.tmpdir(),'local-mock-browser-'));let server,browser;
try{
 server=await startLocalServer({port:0,store});const url=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (process.env.CI ? undefined : '/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error',e.message);});page.setDefaultTimeout(20000);
 const three=path.dirname(require.resolve('three/package.json'));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 console.log('Opening local simulator');await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Local author');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 console.log('Opening mock tests');await page.locator('[data-open=mockSheet]').click();
 console.log('Importing JSON');await page.getByLabel('Import editor track JSON').setInputFiles('tests/fixtures/editor-route.json');
 await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved on disk'));
 console.log('Opening mock tests');await page.locator('[data-open=mockSheet]').click();
 await page.locator('#routePick button').filter({hasText:'Local browser test road'}).click();
 await page.locator('#mockDetail [data-start]').click();
 await page.waitForFunction(()=>document.body.dataset.mode==='drive');
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.running),true);
 assert.ok((await page.evaluate(()=>window.cambridgeDrive.area)).startsWith('local:'));
 // Uses actual assessment and actual vehicle, with no free-drive bypass.
 const state=await page.evaluate(()=>{const a=window.cambridgeDrive;a.manual(true);a.addInput(()=>({throttle:1,brake:0,steer:0}));const before={x:a.player.x,z:a.player.z};a.step(30);return {moved:Math.hypot(a.player.x-before.x,a.player.z-before.z),elapsed:a.test.elapsed,len:a.test.route.len};});
 assert.ok(state.moved>.1);assert.ok(state.elapsed>0);assert.ok(state.len>100);
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/local-mock-drive.png'});
 const collision=await page.evaluate(()=>{const a=window.cambridgeDrive,road=a.test.route; a.player.place(road.xs[0]+20-6-3,road.zs[0]-30,-Math.PI/2);a.player.v=6;a.step(15);return a.test.faults.some(f=>f.key==='authored-collision'&&f.kind==='S');});assert.equal(collision,true);
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('mock','east-road',true);});assert.equal(await page.evaluate(()=>window.cambridgeDrive.area),'a1');
 // Save a browser JSON edit as a fresh revision, retaining the original.
 console.log('Opening local simulator');await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);console.log('Opening mock tests');await page.locator('[data-open=mockSheet]').click();
 await page.locator('#routePick button').filter({hasText:'Local browser test road'}).click();
 await page.locator('#localTrackLibrary summary').filter({hasText:'Edit saved JSON'}).click();
 const text=page.getByLabel('Editor track JSON',{exact:true});await text.fill((await text.inputValue()).replace('Local browser test road','Edited mock route'));
 await page.getByRole('button',{name:'Save as new revision'}).click();
 await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved on disk'));
 const entries=await(await fetch(url+'/__local/tracks')).json();assert.equal(entries.length,2);assert.ok(entries.some(e=>e.track.title==='Edited mock route'));assert.ok(entries.some(e=>e.track.title==='Local browser test road'));
 console.log('Opening mock tests');await page.locator('[data-open=mockSheet]').click();await page.locator('#localTrackLibrary summary').filter({hasText:'Edit saved JSON'}).click();await page.getByLabel('Editor track JSON',{exact:true}).fill('{bad json');await page.getByRole('button',{name:'Save as new revision'}).click();await page.waitForFunction(()=>!document.querySelector('#localTrackLibrary input').disabled);assert.equal((await(await fetch(url+'/__local/tracks')).json()).length,2);
 await page.getByLabel('Saved local revision').dispatchEvent('change');await page.locator('#localTrackLibrary summary').filter({hasText:'Edit saved JSON'}).click();await page.locator('#routePick button').filter({hasText:'Edited mock route'}).click();await page.screenshot({path:'test-results/local-mock-library.png'});assert.deepEqual(errors,[]);
 console.log('Browser passed: editor JSON import, mock selection/start with assessment active, physical simulation, reload, JSON edit/new revision, invalid JSON preserves library.',state);
}catch(error){console.error(error);throw error;}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await fs.rm(store,{recursive:true,force:true});}
