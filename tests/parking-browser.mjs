import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), three=path.dirname(require.resolve('three/package.json'));
const root=path.resolve(process.env.TEST_SITE||'.'),port=8766,url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(url+'/?bots');await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.locator('#profName').fill('Parking checks');await page.locator('#profForm').evaluate(f=>f.requestSubmit());
 const before=await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1'));
 await page.locator('#blN').fill('1');await page.locator('#blSpd').selectOption('0');await page.locator('#blLoop').uncheck();
 for(const id of ['forward-bay','reverse-bay','leave-bay']){
  await page.locator('#blPick').selectOption('lesson:'+id);await page.locator('#blGo').click();
  await page.waitForFunction(()=>!document.querySelector('#blGo').disabled,{},{timeout:60000});
  const run=await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('cld.bot.')).map(k=>JSON.parse(localStorage.getItem(k))).find(r=>r.key==='lesson:'+id),id);
  const pose=await page.evaluate(()=>{const a=window.cambridgeDrive;return {x:a.player.x,z:a.player.z,th:a.player.th,v:a.player.v,phase:a.test.manoeuvreStatus?.phase,grade:a.test.manoeuvreStatus?.grade};});
  console.log(JSON.stringify({id,end:run?.end,pass:run?.pass,D:run?.D,S:run?.S,firstFault:run?.faults?.[0],pose}));assert.ok(run,id);assert.equal(run.pass,true,JSON.stringify({id,end:run.end,pose}));assert.equal(run.end,'done');
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1')),before);
 // Fixture grants prior control lessons, never parking completion; every new pass below is driven.
 await page.evaluate(()=>{const key='cambridge-learner-drive.v1',data=JSON.parse(localStorage.getItem(key));for(const id of ['automatic-drive','automatic-reverse','steering-control'])data.profiles[0].lessons[id]={passed:true,attempts:1,bestD:0};localStorage.setItem(key,JSON.stringify(data));});
 for(const name of ['parking-driver','parking-geometry','config']) await page.route(`**/__parking-test/${name}.js`,r=>r.fulfill({body:fs.readFileSync(`js/${name}.js`,'utf8'),contentType:'application/javascript'}));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.addScriptTag({type:'module',content:"import { createParkingDriver } from '/__parking-test/parking-driver.js'; window.parkingTestDriver=createParkingDriver;"});
 await page.waitForFunction(()=>!!window.parkingTestDriver);
 await page.evaluate(()=>window.cambridgeDrive.manual(true));
 for(const id of ['forward-bay','reverse-bay','leave-bay']){
  if(await page.locator('#resultSheet').isVisible())await page.locator('#hubBtn').click();
  await page.evaluate(async id=>{await window.cambridgeDrive.pick('lesson',id,true);window.cambridgeDrive.frame(0);},id);
  if(id==='forward-bay')await page.screenshot({path:'/tmp/driving-parking-start.png'});
  const result=await page.evaluate(()=>{
   const app=window.cambridgeDrive,driver=window.parkingTestDriver({get A(){return {test:app.test,traffic:app.traffic};},player:app.player,scenarioStatus:()=>app.test.manoeuvreStatus,look:()=>app.look(),gear:g=>document.querySelector(`[data-gear="${g}"]`).click(),operate:a=>document.querySelector(`[data-operation="${a}"]`).click()});
   const remove=app.addInput(driver);for(let i=0;i<5000&&!app.test.done;i++)app.step(1);remove();app.frame(0);
   return {done:app.test.done,verdict:document.querySelector('#verdict').textContent,faults:app.test.faults};
  });
  assert.equal(result.done,true,id);assert.equal(result.verdict,'Lesson passed',JSON.stringify(result));
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','reverse-bay',true);window.cambridgeDrive.frame(0);});
 await page.evaluate(()=>window.cambridgeDrive.manual(false));await page.waitForTimeout(350);
 await page.screenshot({path:'/tmp/driving-parking-mobile.png'});
 await page.evaluate(()=>window.cambridgeDrive.manual(true));
 await page.locator('[data-gear="R"]').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-gear="R"]').isVisible(),true);
 await page.setViewportSize({width:1280,height:720});
 const learner=await page.evaluate(()=>JSON.parse(localStorage.getItem('cambridge-learner-drive.v1')).profiles[0]);
 for(const id of ['forward-bay','reverse-bay','leave-bay'])assert.equal(learner.lessons[id].latestReport.pass,true);
 assert.ok(learner.lessons['leave-bay'].latestReport.evidence.scenarioEvents.filter(e=>e.type==='parking-leg-complete').length===2);
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','forward-bay',true);});
 const collision=await page.evaluate(()=>{
  const app=window.cambridgeDrive;let braking=true;const remove=app.addInput(()=>({throttle:0,brake:braking?1:0,steer:0}));app.step(2);
  document.querySelector('[data-gear="D"]').click();document.querySelector('[data-operation="parkingBrake"]').click();app.look();braking=false;
  for(let i=0;i<1200;i++){if(app.traffic.clock-app.player.lookAt>4)app.look();app.step(1);}
  const serious=app.test.S;braking=true;app.step(5);document.querySelector('[data-gear="P"]').click();document.querySelector('[data-operation="parkingBrake"]').click();document.querySelector('[data-operation="engine"]').click();document.querySelector('#assessParking').click();remove();
  return {serious,done:app.test.done,verdict:document.querySelector('#verdict').textContent};
 });
 assert.equal(collision.serious,1,'sustained boundary contact is one episode');assert.equal(collision.done,true);assert.equal(collision.verdict,'Not yet');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 const preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cambridge-learner-drive.v1')).profiles[0]);assert.equal(preserved.lessons['forward-bay'].passed,true);assert.equal(preserved.lessons['forward-bay'].latestReport.pass,false);
 assert.equal(errors.length,0,errors.join('\n'));console.log('Parking physics, target assessment and Bot lab checks passed.');
}finally{await browser?.close();server.kill();}
