// Tests the actual import/UI/physics path with a disposable local library.
import {chromium} from 'playwright';
import {startLocalServer} from '../tools/local-editor-server.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const store=await fs.mkdtemp(path.join(os.tmpdir(),'experimental-drive-'));let server,browser;
try {
 server=await startLocalServer({port:0,store});const url=`http://127.0.0.1:${server.address().port}`;
 const track=JSON.parse(await fs.readFile('tests/fixtures/editor-route.json','utf8'));track.practiceMode='experimental';track.title='Experimental import test';
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:.5});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:'node_modules/three/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:'node_modules/three/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Practice tester');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 await page.locator('[data-open=mockSheet]').click();
 await page.getByLabel('Import editor track JSON').setInputFiles({name:'experimental.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(track))});
 await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved on disk'));
 await page.locator('[data-open=mockSheet]').click();await page.locator('#routePick button').filter({hasText:track.title}).click();
 assert.ok((await page.locator('#mockDetail').innerText()).includes('No grading'));
 await page.getByRole('button',{name:'Start practice',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.mode==='drive');
 const before=await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1'));
 const result=await page.evaluate(()=>{
  const a=window.cambridgeDrive;a.manual(true);const cancel=a.addInput(()=>({throttle:1,brake:0,steer:0}));
  const x=a.player.x,z=a.player.z;a.step(80);const moved=Math.hypot(a.player.x-x,a.player.z-z);
  a.test.fault('S','forced','must be ignored');a.test.finish();a.test.onFinish();cancel();a.frame(0);
  return {experimental:a.test.experimental,moved,elapsed:a.test.elapsed,faults:a.test.faults.length,done:a.test.done,scenario:a.scenario,passed:a.test.passed()};
 });
 assert.ok(result.moved>.1);assert.equal(result.experimental,true);assert.equal(result.elapsed,0);assert.equal(result.faults,0);assert.equal(result.done,false);assert.equal(result.passed,null);assert.equal(result.scenario,null);
 assert.equal(await page.locator('#markBoard').isVisible(),false);assert.equal(await page.locator('#resultSheet').isVisible(),false);
 assert.ok((await page.locator('#hudCoach').innerText()).includes('Experimental'));
 // Authored scenery still collides, while no fault is recorded.
 const contact=await page.evaluate(()=>{const a=window.cambridgeDrive;a.player.place(-23.1,25.3,-Math.PI/2);a.player.v=6;a.step(25);return {v:a.player.v,x:a.player.x,faults:a.test.faults.length};});
 assert.equal(contact.faults,0);assert.equal(contact.v,0,'authored building contact stops the vehicle');assert.ok(contact.x < -20.1,'car must not cross the building boundary');
 await page.locator('#pauseBtn').click();await page.getByRole('button',{name:'Reset to spawn',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.experimental),true);
 await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1')),before,'practice must not persist learner results');
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('mock','east-road',true);});
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.experimental),false);assert.equal(await page.locator('#markBoard').isVisible(),true);
 assert.ok(await page.evaluate(()=>!!window.cambridgeDrive.scenario));
 assert.deepEqual(errors,[]);console.log('PASS experimental import, physics, no faults/results/timer, reset, progress unchanged, normal mock restored',result);
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await fs.rm(store,{recursive:true,force:true});}
