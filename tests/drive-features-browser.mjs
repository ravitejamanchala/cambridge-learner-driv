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

 // ---------- how far the head turns: a mirror glance, then a look over the shoulder ----------
 const frames=n=>page.evaluate(k=>{for(let i=0;i<k;i++)window.cambridgeDrive.frame(0.05);},n);
 await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),1);
 await settle();
 const straight=await heading(page);
 const swungTo=async()=>Math.abs(wrap((await heading(page)).camera-straight.camera))*180/Math.PI;
 await page.keyboard.down('KeyX'); await frames(7); // 0.35 s in: still a glance at the door mirror
 const mirrorAngle=await swungTo();
 await frames(40);                                  // held on: it becomes a blind-spot check
 const shoulderAngle=await swungTo();
 await page.keyboard.up('KeyX'); await settle();
 assert.ok(mirrorAngle>35&&mirrorAngle<50,`a mirror glance should be about 45°, got ${mirrorAngle.toFixed(1)}°`);
 assert.ok(shoulderAngle>85&&shoulderAngle<105,`a blind-spot check should be about 95°, got ${shoulderAngle.toFixed(1)}°`);
 assert.ok(shoulderAngle-mirrorAngle>40,`the shoulder check must open out past the glance, got ${(shoulderAngle-mirrorAngle).toFixed(1)}°`);
 console.log(`Head turn: ${mirrorAngle.toFixed(0)}° for the door mirror, ${shoulderAngle.toFixed(0)}° over the shoulder.`);

 // ---------- the steering wheel follows the driver's hands ----------
 const wheelAt=()=>page.evaluate(()=>window.cambridgeDrive.wheelAngle);
 const wheelRest=await wheelAt();
 await page.evaluate(()=>{window.__steer=window.cambridgeDrive.addInput(()=>({throttle:0.3,brake:0,steer:-0.8}));});
 await frames(30);
 const wheelRight=await wheelAt();
 await page.evaluate(()=>{window.__steer();});
 assert.ok(Math.abs(wheelRight-wheelRest)>0.8,`the steering wheel barely moved: ${wheelRest.toFixed(2)} to ${wheelRight.toFixed(2)} rad`);
 assert.ok(wheelRight<wheelRest,'steering right must turn the wheel the same way');
 await settle();
 console.log(`Steering wheel turns ${(Math.abs(wheelRight-wheelRest)*180/Math.PI).toFixed(0)}° at the lock the input asked for.`);

 // ---------- the rear-view mirror is in the chase view as well as the cockpit ----------
 const panel=async()=>page.evaluate(()=>{let f=null;window.cambridgeDrive.camera.traverse(o=>{if(o.userData.chaseMirror)f=o;});
   return f?{found:true,visible:f.visible,above:f.position.y>0}:{found:false};});
 await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),0);
 await frames(5);
 const inChase=await panel();
 assert.equal(inChase.found,true,'there is no rear-view panel for the chase view');
 assert.equal(inChase.visible,true,'the chase view has no rear-view mirror');
 assert.equal(inChase.above,true,'the rear-view panel should hang at the top of the view');
 await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),1);
 await frames(5);
 assert.equal((await panel()).visible,false,'the chase panel is still showing in the driver view');
 await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),0);
 await frames(5);
 // Where it lands on screen, against everything else drawn over the view. A phone is the tight case:
 // the map, the speedometer and the look buttons all sit in the same band.
 const panelRect=()=>page.evaluate(()=>{
  let f=null; window.cambridgeDrive.camera.traverse(o=>{if(o.userData.chaseMirror)f=o;});
  if(!f||!f.visible) return null;
  const cam=window.cambridgeDrive.camera, glass=f.children[1]; glass.updateMatrixWorld(true);
  const xs=[],ys=[];
  for(const [x,y] of [[-0.5,-0.5],[0.5,-0.5],[-0.5,0.5],[0.5,0.5]]){
   const v=new THREE.Vector3(x,y,0).applyMatrix4(glass.matrixWorld).project(cam);
   xs.push((v.x*0.5+0.5)*window.innerWidth); ys.push((-v.y*0.5+0.5)*window.innerHeight);
  }
  const r={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  const hit=['.hud-map','.speedo','#hudNextBox','.lookpair','.hud-bl','.touch','#lookBtn']
   .map(sel=>[sel,document.querySelector(sel)]).filter(([,e])=>e&&!e.hidden&&e.getBoundingClientRect().width>0)
   .filter(([,e])=>{const b=e.getBoundingClientRect();return !(r.right<=b.left||b.right<=r.left||r.bottom<=b.top||b.bottom<=r.top);})
   .map(([sel])=>sel);
  return {...r,hit,w:window.innerWidth,h:window.innerHeight};
 });
 for(const vp of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(vp); await page.waitForTimeout(260); await frames(6);
  const r=await panelRect();
  const at=`${vp.width}x${vp.height}`;
  assert.ok(r,`${at}: the rear-view panel is not on screen in the chase view`);
  assert.ok(r.left>=0&&r.right<=vp.width,`${at}: the rear-view panel runs off the side`);
  assert.ok(r.top>=0,`${at}: the rear-view panel is off the top`);
  assert.deepEqual(r.hit,[],`${at}: the rear-view panel overlaps ${r.hit.join(', ')}`);
  const area=Math.round((r.right-r.left)*(r.bottom-r.top)/(vp.width*vp.height)*100);
  assert.ok(area<=14,`${at}: the rear-view panel covers ${area}% of the view`);
  console.log(` rear-view panel at ${at}: ${area}% of the view, clear of the instruments`);
 }
 // ---------- and the glass itself stays on screen in the cockpit, phone included ----------
 // An upright phone starts in the chase view, so the driver view is chosen again after each resize.
 for(const vp of [{width:1280,height:720},{width:390,height:844}]){
  await page.setViewportSize(vp); await page.waitForTimeout(260);
  await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),1); await frames(6);
  const glass=await page.evaluate(()=>{
   const cam=window.cambridgeDrive.camera; let m=null;
   cam.traverse(o=>{ if(o.isMesh&&o.material?.map&&o.geometry?.type==='PlaneGeometry'&&o.parent?.parent?.visible&&!o.parent.userData.chaseMirror&&m===null) m=o; });
   if(!m) return null; m.updateMatrixWorld(true);
   const xs=[],ys=[],p=m.geometry.parameters;
   for(const [x,y] of [[-0.5,-0.5],[0.5,-0.5],[-0.5,0.5],[0.5,0.5]]){
    const v=new THREE.Vector3(x*p.width,y*p.height,0).applyMatrix4(m.matrixWorld).project(cam);
    xs.push((v.x*0.5+0.5)*window.innerWidth); ys.push((-v.y*0.5+0.5)*window.innerHeight);
   }
   return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  });
  const at=`${vp.width}x${vp.height}`;
  assert.ok(glass,`${at}: no mirror glass in the cockpit`);
  assert.ok(glass.left>=0&&glass.right<=vp.width,`${at}: the rear-view mirror runs off the side of the screen`);
  assert.ok(glass.top>=0&&glass.bottom<=vp.height,`${at}: the rear-view mirror runs off the top or bottom`);
  console.log(` rear-view glass at ${at}: on screen at x ${Math.round(glass.left)}–${Math.round(glass.right)}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(v=>document.querySelector(`#camSeg [data-cam="${v}"]`)?.click(),0);
 console.log('Rear-view mirror: a panel in the chase view, the glass on the windscreen in the cockpit.');

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
  let blueTop=0,otherTop=0;
  for(let i=0;i<4000&&!app.test.done;i++){
   const s=app.scenario;
   // once the blue lights are behind, slow right down and let it through
   mode=s&&s.phase==='coming'?'stop':'drive';
   if(s&&s.phase==='passing')mode='drive';
   app.step(1);
   if(s?.vehicle)blueTop=Math.max(blueTop,s.vehicle.v);
   for(const c of app.traffic.cars) if(c.alive&&c!==s?.vehicle) otherTop=Math.max(otherTop,c.v);
  }
  remove();
  return {phase:app.scenario.phase,events:app.scenario.events.map(e=>e.type),result:app.scenario.result(),
   topSpeed:Math.round(blueTop*10)/10,fastestOther:Math.round(otherTop*10)/10,
   faults:app.test.faults.filter(f=>f.cat.startsWith('Emergency')).map(f=>f.cat)};
 });
 assert.ok(lesson.events.includes('emergency-approach'),JSON.stringify(lesson));
 assert.ok(lesson.events.includes('emergency-passed'),JSON.stringify(lesson));
 assert.ok(lesson.topSpeed>lesson.fastestOther+2,`the blue light should outpace the traffic: ${JSON.stringify(lesson)}`);
 assert.deepEqual(lesson.faults,[],JSON.stringify(lesson));
 assert.equal(lesson.result.ok,true,JSON.stringify(lesson));
 console.log(`Blue light lesson: clean pass. It peaked at ${lesson.topSpeed} m/s against ${lesson.fastestOther} m/s for the fastest other car.`);
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
 // ---------- coaching: off unless asked for, and inside the HUD when it is on ----------
 const quiet=await page.evaluate(()=>{const el=document.querySelector('#hudCoach');
  return {exists:!!el,shown:!!(el&&!el.hidden),coach:window.cambridgeDrive.test.coach||null};});
 assert.equal(quiet.exists,true,'the coaching line is missing from the page');
 assert.equal(quiet.shown,false,'coaching is talking without being asked to');
 assert.equal(quiet.coach,null,'a coaching line is being fed with the setting off');
 await page.evaluate(()=>{document.querySelector('#coSeg [data-co="1"]').click();});
 await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','mirror-practice',true);window.cambridgeDrive.manual(true);});
 await page.evaluate(()=>{for(let i=0;i<10;i++)window.cambridgeDrive.step(1);window.cambridgeDrive.frame(0.2);});
 await page.waitForTimeout(150);
 // the same line has to behave on a phone and on a desktop window
 for(const vp of [{width:390,height:844},{width:820,height:1180},{width:1280,height:720}]){
  await page.setViewportSize(vp); await page.evaluate(()=>window.cambridgeDrive.frame(0.2)); await page.waitForTimeout(150);
  const coached=await page.evaluate(()=>{
   const el=document.querySelector('#hudCoach'), r=el.getBoundingClientRect();
   const box=document.querySelector('#hudNextBox').getBoundingClientRect();
   const stage=document.querySelector('#stage').getBoundingClientRect();
   const overlap=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
   const near=['.speedo','.hud-map','.lookpair','#hudNextBox','.touch'].map(sel=>[sel,document.querySelector(sel)])
     .filter(([,e])=>e&&!e.hidden).filter(([,e])=>overlap(r,e.getBoundingClientRect())).map(([sel])=>sel);
   return {shown:!el.hidden,text:el.textContent,
    area:Math.round(r.width*r.height/(stage.width*stage.height)*100),
    offScreen:r.left<0||r.right>stage.width,
    belowBox:r.top>=box.bottom-1, clashesBox:overlap(r,box), near};
  });
  const at=`${vp.width}px`;
  assert.equal(coached.shown,true,`${at}: coaching was asked for and says nothing`);
  assert.ok(coached.text.length>10,`${at}: the coaching line is empty`);
  assert.equal(coached.clashesBox,false,`${at}: the coaching line overlaps the instruction box`);
  assert.deepEqual(coached.near,[],`${at}: the coaching line overlaps ${coached.near.join(', ')}`);
  assert.equal(coached.offScreen,false,`${at}: the coaching line runs off the screen`);
  assert.ok(coached.area<=12,`${at}: the coaching line covers ${coached.area}% of the view`);
  console.log(` coaching at ${at}: ${coached.area}% of the view, clear of the instruments`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{document.querySelector('#coSeg [data-co="0"]').click();});
 await page.evaluate(()=>{window.cambridgeDrive.step(2);window.cambridgeDrive.frame(0.2);});
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>!document.querySelector('#hudCoach').hidden),false,'coaching stayed on after being switched off');
 console.log('Coaching: off by default, under the instruction box at three widths when asked for, and off again on request.');
 await page.setViewportSize({width:1280,height:720});
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser?.close();server.kill();}
