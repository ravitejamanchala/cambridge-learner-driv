// Hold-to-look cameras and the blue-light vehicle, driven in a real browser.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';
const require=createRequire(import.meta.url), three=path.dirname(require.resolve('three/package.json'));
const root=path.resolve(process.env.TEST_SITE||'.'),port=8774,url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
const heading=page=>page.evaluate(()=>{
 const app=window.cambridgeDrive,v=new THREE.Vector3();app.camera.getWorldDirection(v);
 return {camera:Math.atan2(v.x,-v.z),car:app.player.th,x:app.camera.position.x,z:app.camera.position.z};
});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
try{
 for(let i=0;i<200;i++){try{const r=await fetch(url);await r.arrayBuffer();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await installAuthFixture(page);
 await page.goto(url+'/?bots');await page.waitForFunction(()=>document.querySelector('#loadOv').hidden,{},{timeout:45000});await signedIn(page);

 // ---------- hold to look: the camera swings, the car does not ----------
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','controlled-stop',true);window.cambridgeDrive.manual(true);window.cambridgeDrive.frame(0);});
 const settle=async()=>{for(let i=0;i<40;i++)await page.evaluate(()=>window.cambridgeDrive.frame(0.05));};
 for(const view of [0,1]){
  await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),view);
  await settle();
  const rest=await heading(page);
  await page.keyboard.down('KeyZ');await settle();
  const left=await heading(page);
  await page.keyboard.up('KeyZ');await page.keyboard.down('KeyX');await settle();
  const right=await heading(page);
  await page.keyboard.up('KeyX');await settle();
  const back=await heading(page);
  const turn=a=>wrap(a.camera-rest.camera)*180/Math.PI;
  assert.ok(turn(left)<-25,`view ${view}: holding Z should swing the camera left, got ${turn(left).toFixed(1)}°`);
  assert.ok(turn(right)>25,`view ${view}: holding X should swing the camera right, got ${turn(right).toFixed(1)}°`);
  assert.ok(Math.abs(turn(back))<5,`view ${view}: the camera should come back, got ${turn(back).toFixed(1)}°`);
  for(const [name,s] of [['left',left],['right',right]])
   assert.ok(Math.abs(wrap(s.car-rest.car))<0.02,`view ${view}: looking ${name} must not turn the car`);
 }
 // the look is recorded as an observation the examiner can see
 assert.ok(await page.evaluate(()=>window.cambridgeDrive.player.observations.some(o=>o.view==='left')&&window.cambridgeDrive.player.observations.some(o=>o.view==='right')));
 console.log('Hold-to-look swings the camera in chase and driver views, and never the car.');

 // ---------- blue light vehicle: in a mock test, and assessed in its own lesson ----------
 await page.evaluate(()=>window.cambridgeDrive.manual(false));
 await page.locator('#blN').fill('1');await page.locator('#blSpd').selectOption('0');await page.locator('#blLoop').uncheck();
 await page.locator('#blPick').selectOption('mock:east-road');await page.locator('#blGo').click();
 await page.waitForFunction(()=>window.cambridgeDrive.scenario?.phase&&window.cambridgeDrive.scenario.phase!=='idle',{},{timeout:120000});
 const mock=await page.evaluate(()=>{const s=window.cambridgeDrive.scenario;return {phase:s.phase,events:s.events.map(e=>e.type),lamps:!!s.vehicle?.mesh?.children?.length};});
 assert.ok(mock.events.includes('emergency-approach'),JSON.stringify(mock));
 assert.ok(mock.lamps,'the emergency vehicle is on the road with its light bar');
 await page.locator('#blStop').click();
 console.log('Every mock test brings a blue-light vehicle up behind the learner:',JSON.stringify(mock));

 // the lesson: slow right down when it arrives and it goes past, with no faults
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden,{},{timeout:45000});await signedIn(page);
 const lesson=await page.evaluate(async()=>{
  const app=window.cambridgeDrive;
  await app.pick('lesson','blue-light',true);app.manual(true);
  let mode='drive';
  const remove=app.addInput(()=>mode==='drive'?{throttle:1,brake:0,steer:0}:{throttle:0,brake:1,steer:0});
  for(let i=0;i<4000&&!app.test.done;i++){
   const s=app.scenario;
   // once the blue lights are behind, slow right down and let it through
   mode=s&&s.phase==='coming'?'stop':'drive';
   if(s&&s.phase==='passing')mode='drive';
   app.step(1);
  }
  remove();
  return {phase:app.scenario.phase,events:app.scenario.events.map(e=>e.type),result:app.scenario.result(),
   faults:app.test.faults.filter(f=>f.cat.startsWith('Emergency')).map(f=>f.cat)};
 });
 assert.ok(lesson.events.includes('emergency-approach'),JSON.stringify(lesson));
 assert.ok(lesson.events.includes('emergency-passed'),JSON.stringify(lesson));
 assert.deepEqual(lesson.faults,[],JSON.stringify(lesson));
 assert.equal(lesson.result.ok,true,JSON.stringify(lesson));
 console.log('Blue light lesson: slowing down and letting it past is a clean pass.',JSON.stringify(lesson.result));
 // ---------- on a phone: nothing may sit over the road, in any lesson ----------
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.banner').count(),0,'the banner slab is gone for good');
 // the blue-light event used to put a slab of text across the windscreen mid-drive
 await page.evaluate(async()=>{
  const app=window.cambridgeDrive;
  await app.pick('lesson','blue-light',true);app.manual(true);
  const remove=app.addInput(()=>({throttle:1,brake:0,steer:0}));
  for(let i=0;i<3000&&app.scenario?.phase!=='coming';i++)app.step(1);
  remove();app.frame(0.2);
 });
 const lit=await page.evaluate(()=>{
  const vis=el=>!!(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0);
  return {phase:window.cambridgeDrive.scenario?.phase,alert:window.cambridgeDrive.test.alert?.label||null,
   slab:vis(document.querySelector('.banner')),panel:vis(document.querySelector('#trainingControls'))};
 });
 assert.equal(lit.phase,'coming',JSON.stringify(lit));
 assert.equal(lit.slab,false,'a blue-light message is over the road');
 assert.equal(lit.panel,false,'a panel is over the road during the blue-light event');
 assert.equal(lit.alert,null,'the blue light is on the lesson card and visible on the road: say nothing');
 console.log('Blue light on a phone: nothing announced, nothing over the road.');
 for(const id of ['mirror-practice','controlled-stop','accel-decel']){
  await page.evaluate(async i=>{await window.cambridgeDrive.pick('lesson',i,true);window.cambridgeDrive.manual(true);window.cambridgeDrive.frame(0.2);},id);
  await page.evaluate(()=>{for(let i=0;i<40;i++)window.cambridgeDrive.step(1);window.cambridgeDrive.frame(0.2);});
  await page.waitForTimeout(150);
  const over=await page.evaluate(()=>{
   const vis=el=>!!(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0);
   const stage=document.querySelector('#stage').getBoundingClientRect();
   const area=el=>{const r=el.getBoundingClientRect();return Math.round(r.width*r.height/(stage.width*stage.height)*100);};
   const panel=document.querySelector('#trainingControls'), banner=document.querySelector('#banner');
   const boxes=[['#hudNextBox',document.querySelector('#hudNextBox')],['.speedo',document.querySelector('.speedo')]]
     .filter(([,el])=>vis(el)).map(([n,el])=>{const r=el.getBoundingClientRect();return {n,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
   const overlap=(a,b)=>!(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
   let clashes=[];
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))clashes.push(boxes[i].n+' over '+boxes[j].n);
   return {panel:vis(panel),banner:vis(banner),bannerArea:vis(banner)?area(banner):0,clashes};
  });
  assert.equal(over.panel,false,`${id}: a control panel is sitting over the road`);
  assert.equal(over.banner,false,`${id}: a banner is sitting over the road`);
  assert.ok(over.bannerArea===0,`${id}: something is covering the road`);
  assert.deepEqual(over.clashes,[],`${id}: HUD pieces overlap each other`);
  // the drive must not repeat the lesson card: readings only, no sentences
  const words=await page.evaluate(()=>{
   const t=window.cambridgeDrive.test;
   return {alert:t.alert?.label||null,label:t.basicStatus?.label||null,stage:t.manoeuvreStatus?.short||null};
  });
  assert.equal(words.label,null,`${id}: a status label is repeating the lesson card`);
  assert.equal(words.alert,null,`${id}: an alert is repeating the lesson card`);
 }
 console.log('Getting started on a phone: no panel, no banner, no overlapping HUD.');
 await page.setViewportSize({width:1280,height:720});
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser?.close();server.kill();}
