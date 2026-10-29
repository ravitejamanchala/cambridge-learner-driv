import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {installAuthFixture,signedIn} from './auth-fixture.mjs';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json')),root=path.resolve(process.env.TEST_SITE||'.'),port=8791,url=process.env.PREVIEW_URL||`http://127.0.0.1:${port}`;
const server=process.env.PREVIEW_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 const expected=process.env.EXPECTED_REVISION;let ready=false;
 for(let i=0;i<60;i++){try{const target=expected?new URL('release.json?verify='+Date.now(),url.endsWith('/')?url:url+'/'):url,r=await fetch(target,{signal:AbortSignal.timeout(10000)});const body=await r.text();if(r.ok&&(!expected||JSON.parse(body).sourceCommit===expected)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,'Preview must serve the revision being reviewed');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:.75});page.setDefaultTimeout(60000);const errors=[],authoringRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/__local\/|\/examples\/cambridge-pilot\//.test(r.url()))authoringRequests.push(r.url());});
 if(!process.env.PREVIEW_URL){await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await installAuthFixture(page);}
 const target=new URL(url);if(expected)target.searchParams.set('review',expected);
 await page.goto(target.href);await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);if(!process.env.PREVIEW_URL)await signedIn(page);else if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Cockpit review');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 if(expected)assert.equal(await page.locator('meta[name="app-release"]').getAttribute('content'),expected);
 assert.equal(await page.locator('#localTrackLibrary').count(),0,'learner preview must not include the JSON testing panel');
 assert.equal(await page.getByLabel('Import editor track JSON').count(),0);
 assert.equal(await page.evaluate(()=>!!(LEARNER_CONFIG.BROWSER_AUTHORING||LEARNER_CONFIG.LOCAL_AUTHORING)),false);
 fs.mkdirSync('test-results',{recursive:true});
 await page.locator('[data-open=mockSheet]').first().click();await page.screenshot({path:'test-results/learner-mock-tests.png'});await page.locator('#mockSheet [data-close]').click();
 await page.evaluate(async()=>{const a=cambridgeDrive;await a.pick('mock','east-road',true);a.manual(true);a.setCam(0);for(let i=0;i<8;i++)a.frame(.1);window.__cockpitWorld={scene:a.camera.parent,net:a.net,route:a.test.route,car:a.player.carId,area:a.area};});
 await page.screenshot({path:'test-results/cockpit-chase.png'});
 assert.ok(await page.evaluate(()=>{const a=cambridgeDrive,w=window.__cockpitWorld;a.setCam(1);a.frame(.2);return w.scene===a.camera.parent&&w.net===a.net&&w.route===a.test.route&&w.car===a.player.carId&&w.area===a.area;}),'camera changes must keep the same car, map and route');
 await page.waitForFunction(()=>cambridgeDrive.cockpit);
 await page.evaluate(()=>{for(let i=0;i<8;i++)cambridgeDrive.frame(.1);});
 const alignedRear=async()=>page.evaluate(()=>{const camera=cambridgeDrive.camera;let rear;camera.traverse(o=>{if(o.userData.interiorRearMirror)rear=o;});const glass=rear.children[1],direction=camera.getWorldPosition(new THREE.Vector3()).sub(rear.getWorldPosition(new THREE.Vector3())).normalize();return {alignment:rear.getWorldDirection(new THREE.Vector3()).dot(direction),glassAspect:glass.geometry.parameters.width/glass.geometry.parameters.height,imageAspect:glass.material.map.image.width/glass.material.map.image.height};});
 const rear=await alignedRear();assert.ok(rear.alignment>.995,'rear mirror must face the driver');assert.ok(Math.abs(rear.glassAspect-rear.imageAspect)<.001,'mirror image must not stretch');
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/cockpit-desktop.png'});
 const benchmark=await page.evaluate(async()=>{
  const samples=[];let last=performance.now();for(let i=0;i<15;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>=3)samples.push(now-last);last=now;cambridgeDrive.frame(1/60);}samples.sort((a,b)=>a-b);return {environment:'Headless Chromium; software WebGL (not device FPS)',samples:samples.length,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},frameMedianMs:samples[6],frameP95Ms:samples[11],mainView:cambridgeDrive.perf()};
 });fs.writeFileSync('test-results/cockpit-performance.json',JSON.stringify(benchmark,null,2));
 const initial=await page.evaluate(()=>cambridgeDrive.cockpit);assert.equal(initial.speed,0);assert.ok(initial.road);assert.ok(initial.turn);assert.ok(initial.remaining>0);
 const after=await page.evaluate(()=>{const a=cambridgeDrive;const off=a.addInput(()=>({throttle:1,brake:0,steer:.2}));a.look();a.step(30);a.frame(.2);off();return {display:a.cockpit,speed:Math.round(Math.abs(a.player.v)*2.23694),wheel:a.wheelAngle};});assert.equal(after.display.speed,after.speed);assert.ok(after.speed>0);assert.notEqual(after.wheel,0);
 // Hidden dashboards stop uploading textures; resizing does not create new instruments.
 const hidden=await page.evaluate(()=>{const a=cambridgeDrive,before=a.cockpit.updates;a.setCam(0);a.frame(.2);return {before,after:a.cockpit.updates};});assert.equal(hidden.before,hidden.after);
 // Finish the animated mirror glance before testing the forward sightline.
 await page.evaluate(()=>{for(let i=0;i<12;i++)cambridgeDrive.frame(.1);});
 await page.evaluate(async()=>{await cambridgeDrive.pick('mock','east-road',true);cambridgeDrive.manual(true);});
 for(const vp of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(vp);await page.waitForFunction(()=>Math.abs(cambridgeDrive.camera.aspect-innerWidth/innerHeight)<.001);
  await page.evaluate(async()=>{cambridgeDrive.setCam(1);for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);cambridgeDrive.frame(.1);}});
  assert.ok(await page.evaluate(()=>document.body.classList.contains('driver-view')&&cambridgeDrive.cockpit.speed>=0));
  const mirror=await page.evaluate(()=>{const cam=cambridgeDrive.camera;let glass;cam.traverse(o=>{if(!glass&&o.isMesh&&o.material?.map&&o.geometry.type==='PlaneGeometry'&&o.parent.parent?.visible&&!o.parent.userData.chaseMirror)glass=o;});const p=glass.geometry.parameters;return [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].map(([x,y])=>new THREE.Vector3(x*p.width,y*p.height,0).applyMatrix4(glass.matrixWorld).project(cam)).map(v=>({x:v.x,y:v.y}));});
  assert.ok(mirror.every(p=>Math.abs(p.x)<=1&&Math.abs(p.y)<=1),'rear mirror must stay inside the forward viewport: '+JSON.stringify(mirror));
  assert.ok((await alignedRear()).alignment>.995,'fitted rear mirror must stay aligned with the driver');
  await page.screenshot({path:`test-results/cockpit-${vp.width}.png`});
  const covered=await page.evaluate(points=>{const r={left:Math.min(...points.map(p=>(p.x*.5+.5)*innerWidth))-8,right:Math.max(...points.map(p=>(p.x*.5+.5)*innerWidth))+8,top:Math.min(...points.map(p=>(-.5*p.y+.5)*innerHeight))-8,bottom:Math.max(...points.map(p=>(-.5*p.y+.5)*innerHeight))+8};return ['.hud-map','.hud-right .speedo','.hud-right button','#hudNextBox','#markBoard'].flatMap(selector=>[...document.querySelectorAll(selector)].flatMap(el=>{if(el.hidden||getComputedStyle(el).opacity==='0')return [];const b=el.getBoundingClientRect();return b.width&&b.height&&r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top?[{selector,id:el.id,mirror:r,control:{left:b.left,right:b.right,top:b.top,bottom:b.bottom}}]:[];}));},mirror);
  assert.deepEqual(covered,[],`${vp.width}×${vp.height}: HUD controls must not cover the rear mirror`);
 }
 assert.deepEqual(authoringRequests,[]);assert.deepEqual(errors,[]);console.log('PASS learner cockpit: shared chase/driver world, no JSON testing UI, live speed, route, steering, hidden texture updates and responsive layouts',after);
}finally{await browser?.close();server?.kill();}
