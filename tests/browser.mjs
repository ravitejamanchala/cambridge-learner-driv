import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(process.env.TEST_SITE || '.');
const port=8765;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const url=`http://127.0.0.1:${port}`;
let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Match the app's exact version. This functional test does not test public CDN availability.
 const three=path.dirname(require.resolve('three/package.json'));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(url); await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.locator('#profName').fill('Development checks');await page.locator('#profForm').evaluate(f=>f.requestSubmit());
 await page.evaluate(()=>window.cambridgeDrive.manual(true));
 // Prerequisite enforcement also protects direct starts.
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','engine-control',true);});
 assert.equal(await page.locator('body').getAttribute('data-mode'),'lobby');
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','cockpit-drill',true);});
 assert.equal(await page.locator('#trainingControls').isVisible(),true);
 // Engine cannot start before preparation. Rejected controls cause a real recorded fault.
 await page.keyboard.press('KeyI');
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.operation.engine),false);
 for(const action of ['doorClosed','seatSet','mirrorsSet','belt'])await page.locator(`[data-operation="${action}"]`).click();
 await page.evaluate(()=>window.cambridgeDrive.step(2));
 assert.equal(await page.locator('#verdict').textContent(),'Not yet');
 await page.locator('#againBtn').click();
 for(const action of ['doorClosed','seatSet','mirrorsSet','belt'])await page.locator(`[data-operation="${action}"]`).click();
 await page.evaluate(()=>window.cambridgeDrive.step(2));assert.equal(await page.locator('#verdict').textContent(),'Lesson passed');
 assert.ok((await page.locator('#coachingReport').textContent()).includes('measured objectives'));
 await page.locator('#nextBtn').click();
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.operation.enabled),true);
 for(const action of ['doorClosed','seatSet','mirrorsSet','belt','engine'])await page.locator(`[data-operation="${action}"]`).click();
 await page.evaluate(()=>window.cambridgeDrive.step(2));assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.done),false);
 await page.locator('[data-operation="engine"]').click();await page.evaluate(()=>window.cambridgeDrive.step(2));assert.equal(await page.locator('#verdict').textContent(),'Lesson passed');
 // Run practical control lessons with actual physics and route tracking, not teleporting to a finish.
 for(const id of ['controlled-stop','accel-decel','mirror-practice']){
  await page.evaluate(async id=>{await window.cambridgeDrive.pick('lesson',id,true);window.cambridgeDrive.manual(true);},id);
  const result=await page.evaluate(id=>{
   const api=window.cambridgeDrive, p=api.player;let target=5.5, stopped=false, slowing=false, mirrored=false;
   api.look(); p.signal('R');
   if(id==='mirror-practice')for(const view of ['interior','right','blindspot'])document.querySelector(`[data-observe="${view}"]`).click();
   const input=()=>{
    const t=api.test, msg=document.querySelector('#banner').textContent;
    if(t.sRoute>25&&p.indicator==='R')p.signal('R');
    if(t.parked && api.traffic.cars.some(c=>{if(!c.alive||c.v<1||Math.cos(c.th-p.th)<.7)return false;const dx=c.x-p.x,dz=c.z-p.z,fx=-Math.sin(p.th),fz=-Math.cos(p.th),fw=dx*fx+dz*fz;return fw<3&&fw> -90&&Math.abs(dx*fz-dz*fx)<5.5;}))return {throttle:0,brake:p.v>.1?1:0,steer:0};
    if(id==='controlled-stop'&&!stopped&&msg.startsWith('Brake to stop'))target=0;
    if(id==='controlled-stop'&&!stopped&&msg.startsWith('Stopped in the target')){stopped=true;api.look();target=5.5;}
    if(id==='accel-decel'&&msg.startsWith('Release accelerator')){target=3;slowing=true;}
    if(id==='accel-decel'&&slowing&&msg.startsWith('Speed reduced'))target=5.5;
    if(id==='mirror-practice'&&!mirrored&&t.sRoute>190){mirrored=true;for(const view of ['interior','right','blindspot'])document.querySelector(`[data-observe="${view}"]`).click();}
    if(t.sRoute>t.route.len-35)target=0;
    const q=api.lanePoint(Math.min(t.route.len,t.sRoute+12));
    let angle=Math.atan2(-(q.x-p.x),-(q.z-p.z))-p.th;while(angle>Math.PI)angle-=2*Math.PI;while(angle< -Math.PI)angle+=2*Math.PI;
    return {throttle:p.v<target-.15?1:0,brake:p.v>target+.15?1:0,steer:Math.max(-1,Math.min(1,angle*2.4))};
   };
   const fn=()=>input();const removeInput=api.addInput(fn);
   for(let i=0;i<3000&&!api.test.done;i++)api.step(1);
   removeInput();
   return {id,done:api.test.done,verdict:document.querySelector('#verdict').textContent,faults:api.test.faults,reasons:document.querySelector('#rReasons').textContent,distance:api.test.sRoute};
  },id);
  console.log(JSON.stringify(result));assert.equal(result.done,true,id);assert.equal(result.verdict,'Lesson passed',JSON.stringify(result));
 }
 // New automatic and steering exercises complete through the same physical engine.
 for(const id of ['automatic-drive','automatic-reverse','steering-control']) {
  await page.evaluate(async id=>{await window.cambridgeDrive.pick('lesson',id,true);window.cambridgeDrive.manual(true);},id);
  const result=await page.evaluate(id=>{
   const api=window.cambridgeDrive,p=api.player;api.look();let secured=false,selected=false;
   const auto=id.startsWith('automatic'),reverse=id==='automatic-reverse';
   const input=()=>{
    if(auto){
     if(!selected){
      if(p.rawInput?.brake>=.5){document.querySelector(`[data-gear="${reverse?'R':'D'}"]`).click();document.querySelector('[data-operation="parkingBrake"]').click();selected=true;}
      return {throttle:0,brake:1,steer:0};
     }
     const msg=document.querySelector('#banner').textContent;
     if(msg.startsWith('Target reached')||msg.startsWith('Keep the brake')) {
      if(Math.abs(p.v)<.05&&p.rawInput?.brake>=.5&&!secured){document.querySelector('[data-gear="P"]').click();document.querySelector('[data-operation="parkingBrake"]').click();secured=true;}
      return {throttle:0,brake:1,steer:0};
     }
     return {throttle:reverse?0:(p.v<2.5?.3:0),brake:p.v>2.8?.3:0,steer:0};
    }
    const t=api.test,target=t.sRoute>t.route.len-35?0:5.5,q=api.lanePoint(Math.min(t.route.len,t.sRoute+12));
    let angle=Math.atan2(-(q.x-p.x),-(q.z-p.z))-p.th;while(angle>Math.PI)angle-=2*Math.PI;while(angle< -Math.PI)angle+=2*Math.PI;
    return {throttle:p.v<target-.15?1:0,brake:p.v>target+.15?1:0,steer:Math.max(-1,Math.min(1,angle*2.4))};
   };
   const remove=api.addInput(input);for(let i=0;i<9000&&!api.test.done;i++)api.step(1);remove();
   return {id,done:api.test.done,verdict:document.querySelector('#verdict').textContent,faults:api.test.faults,reasons:document.querySelector('#rReasons').textContent,distance:api.test.sRoute};
  },id);
  console.log(JSON.stringify(result));assert.equal(result.done,true,id);assert.equal(result.verdict,'Lesson passed',JSON.stringify(result));
 }
 // Scenario selection changes actual ambient traffic; scripted cyclists remain active.
 await page.locator('#hubBtn').click();
 await page.locator('[data-open="courseSheet"]').first().click();
 await page.locator('[data-l="cyclists"]').click();
 await page.locator('#scenarioChoice').selectOption('cyclists:quiet');
 await page.locator('#lessonDetail [data-start]').click();
 await page.waitForFunction(()=>window.cambridgeDrive.test.context?.scenarioId==='cyclists:quiet');
 await page.evaluate(()=>window.cambridgeDrive.step(3));
 const trafficState=await page.evaluate(()=>({cars:window.cambridgeDrive.traffic.cars.filter(c=>c.alive).length,scripted:window.cambridgeDrive.traffic.bikes.some(b=>b.scripted&&b.alive)}));
 assert.ok(trafficState.cars<=9); assert.equal(trafficState.scripted,true);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cambridge-learner-drive.v1')));
 assert.equal(saved.profiles[0].lessons['cockpit-drill'].passed,true);
 assert.ok(saved.profiles[0].lessons['controlled-stop'].latestReport.evidence.scenarioEvents.some(e=>e.type==='controlled-stop' && e.distance<=30));assert.ok(saved.profiles[0].history.length>=6);
 // Reload preserves completion and unlocks the engine lesson.
 await page.reload();await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','move-off',true);});
 assert.equal(await page.locator('body').getAttribute('data-mode'),'drive');
 await page.locator('#pauseBtn').click();await page.locator('#resumeBtn').click();assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.running),true);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','engine-control',true);});
 await page.locator('[data-operation="doorClosed"]').click();
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.operation.doorClosed),true);
 // A failed area switch must not start a new lesson on the stale town network.
 await page.route('**/data/areas/roads.json*',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','country',true);});
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.running),false);
 assert.equal(await page.locator('body').getAttribute('data-mode'),'lobby');
 assert.equal(await page.locator('#areaLoad').isVisible(),true);
 await page.unroute('**/data/areas/roads.json*');
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','country',true);});
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.area),'roads');
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.running),true);
 // The developer Bot lab operates the new controls and preserves learner progress.
 const beforeBots=await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1'));
 await page.setViewportSize({width:1280,height:800});
 await page.goto(url+'/?bots');await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.locator('#blN').fill('1');await page.locator('#blSpd').selectOption('0');await page.locator('#blLoop').uncheck();
 for(const id of ['cockpit-drill','engine-control','controlled-stop','accel-decel','mirror-practice','automatic-drive','automatic-reverse','steering-control']) {
  await page.locator('#blPick').selectOption('lesson:'+id);await page.locator('#blGo').click();
  await page.waitForFunction(()=>!document.querySelector('#blGo').disabled,{},{timeout:60000});
  const run=await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('cld.bot.')).map(k=>JSON.parse(localStorage.getItem(k))).find(r=>r.key==='lesson:'+id),id);
  assert.ok(run,id);assert.equal(run.pass,true,JSON.stringify(run));
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('cambridge-learner-drive.v1')),beforeBots);
 // A failed required map request yields the application error, not fake readiness.
 await page.route('**/data/areas/index.json*',r=>r.fulfill({status:503,body:'unavailable'}));await page.reload();await page.waitForFunction(()=>!document.querySelector('#loadErr').hidden);
 assert.ok((await page.locator('#loadMsg').textContent()).includes('503'));
 assert.ok(errors.every(e=>e.includes('Map index did not load (503)')),errors.join('\n'));
 console.log('Browser checks passed: prerequisite enforcement, cockpit/engine completion, physical control lessons, legacy startup, persisted reports and failed map requests.');
} finally {await browser?.close();server.kill();}
