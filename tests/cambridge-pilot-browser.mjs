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
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:.5});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:'node_modules/three/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:'node_modules/three/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Practice tester');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}

 const results=[];
 for(const direction of ['clockwise','anticlockwise']){
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
  await page.locator('[data-open=mockSheet]').click();
  await page.getByText('Cambridge (Brookmount Court) experimental loops',{exact:true}).click();
  await page.getByRole('button',{name:'Load '+direction+' practice',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved on disk'));
  await page.locator('[data-open=mockSheet]').click();
  const title='Cambridge (Brookmount Court) — '+direction+' EXPERIMENTAL';
  await page.locator('#routePick button').filter({hasText:title}).click();
  await page.getByRole('button',{name:'Start practice',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.mode==='drive');
  const result=await page.evaluate(()=>{const a=window.cambridgeDrive;a.manual(true);const stop=a.addInput(()=>({throttle:1,brake:0,steer:0}));const x=a.player.x,z=a.player.z;a.step(60);stop();a.frame(0);return {area:a.area,len:a.test.route.len,moved:Math.hypot(a.player.x-x,a.player.z-z),experimental:a.test.experimental,elapsed:a.test.elapsed,faults:a.test.faults.length,start:{x,z}};});
  assert.ok(result.area.startsWith('local:'));assert.equal(result.experimental,true);assert.equal(result.elapsed,0);assert.equal(result.faults,0);assert.ok(result.len>6000&&result.len<6500);assert.ok(result.moved>.1);
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/brookmount-'+direction+'.png'});results.push({...result,direction});
 }
 assert.notEqual(results[0].len,results[1].len);assert.notDeepEqual(results[0].start,results[1].start);
 const entries=await(await fetch(url+'/__local/tracks')).json();assert.equal(entries.length,2);
 console.log('PASS Cambridge pilot buttons/import/drive/restore distinct experimental worlds',results);
 assert.deepEqual(errors,[]);
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await fs.rm(store,{recursive:true,force:true});}
