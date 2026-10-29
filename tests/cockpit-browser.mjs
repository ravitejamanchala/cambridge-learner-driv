import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {installAuthFixture,signedIn} from './auth-fixture.mjs';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json')),root=path.resolve(process.env.TEST_SITE||'.'),port=8791,url=process.env.PREVIEW_URL||`http://127.0.0.1:${port}`;
const server=process.env.PREVIEW_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{const r=await fetch(url);await r.arrayBuffer();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:.75});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!process.env.PREVIEW_URL){await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await installAuthFixture(page);}
 await page.goto(url);await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);if(!process.env.PREVIEW_URL)await signedIn(page);else if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Cockpit review');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 await page.evaluate(async()=>{const a=cambridgeDrive;await a.pick('mock','east-road',true);a.manual(true);a.setCam(1);a.frame(.2);});
 await page.waitForFunction(()=>cambridgeDrive.cockpit);
 await page.evaluate(()=>{for(let i=0;i<8;i++)cambridgeDrive.frame(.1);});
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
  await page.screenshot({path:`test-results/cockpit-${vp.width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS cockpit: live speed, route, steering, hidden texture updates and responsive layouts',after);
}finally{await browser?.close();server?.kill();}
