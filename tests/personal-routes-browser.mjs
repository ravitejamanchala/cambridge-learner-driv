import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {roadFixture} from './personal-route-fixture.mjs';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json')),port=8796,base=process.env.PREVIEW_URL||`http://127.0.0.1:${port}/`,root=path.resolve(process.env.TEST_SITE||'.');
const server=process.env.PREVIEW_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser,fixture;let osmRequests=0,routeRequests=0,searchRequests=0,rateLimit=true;
fs.mkdirSync('test-results/personal-routes',{recursive:true});
try{
 for(let i=0;i<100;i++){try{const ready=await fetch(base);await ready.arrayBuffer();if(ready.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:process.env.RECORD_ROUTES?{dir:'test-results/personal-routes/video',size:{width:1280,height:900}}:undefined}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/auth-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.LEARNER_CONFIG={PREVIEW:true}'}));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4ebdf"/><path d="M0 100h256M100 0v256" stroke="#fff" stroke-width="12"/><text x="120" y="145" fill="#799080" font-size="12">Map fixture</text></svg>'}));
 await page.route('**/map-api/search?*',r=>{searchRequests++;return r.fulfill({json:[{name:'Cambridge',display_name:'Cambridge, Cambridgeshire, England',lat:'52.205',lon:'.12',boundingbox:['52.195','52.215','.105','.135']}]});});
 await page.route('**/map-api/route',r=>{routeRequests++;const {start,end}=r.request().postDataJSON();fixture=roadFixture(start,end);return r.fulfill({json:{code:'Ok',routes:[{geometry:{type:'LineString',coordinates:fixture.coordinates},distance:1000,duration:120}],waypoints:fixture.waypoints}});});
 await page.route('**/map-api/osm',r=>{osmRequests++;if(rateLimit){rateLimit=false;return r.fulfill({status:429,headers:{'Retry-After':'1'},json:{message:'busy'}});}return r.fulfill({json:fixture.osm});});
 await page.goto(base);await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Route review');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 await page.locator('#myRoutesBtn').click();await page.locator('#routePlace').fill('Cambridge');await page.locator('#placeSearch button').click();await page.getByRole('button',{name:'Cambridge, Cambridgeshire, England',exact:true}).click();
 const rect=await page.locator('#personalRouteMap').boundingBox();await page.mouse.click(rect.x+rect.width*.25,rect.y+rect.height*.72);await page.mouse.click(rect.x+rect.width*.76,rect.y+rect.height*.25);
 // A real draggable Leaflet marker changes the stored start coordinate.
 const before=await page.locator('#pinSummary').textContent(),pin=await page.locator('.personal-pin.start').boundingBox();await page.mouse.move(pin.x+16,pin.y+16);await page.mouse.down();await page.mouse.move(pin.x+35,pin.y+10,{steps:8});await page.mouse.up();assert.notEqual(await page.locator('#pinSummary').textContent(),before);
 await page.locator('#generatePersonalRoute').click();await page.waitForFunction(()=>!document.querySelector('#routeReady').hidden);await page.locator('#personalRouteName').fill('Cambridge weekend practice');await page.locator('#savePersonalRoute').click();assert.match(await page.locator('#personalRouteStatus').textContent(),/Saved/);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes);assert.equal(stored.length,1);assert.equal(stored[0].title,'Cambridge weekend practice');
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='slaydrive.personal-routes.v1')throw new DOMException('Full','QuotaExceededError');return window.originalSetItem.call(this,k,v);};});await page.locator('#savePersonalRoute').click();assert.match(await page.locator('#personalRouteStatus').textContent(),/storage is full/);await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);await page.locator('#savePersonalRoute').click();assert.ok(stored[0].distance>700,'fixture should exercise section streaming');
 await page.screenshot({path:'test-results/personal-routes/create-desktop.png'});await page.reload();await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);await page.locator('#myRoutesBtn').click();await page.locator('#personalSavedRoutes').getByRole('button',{name:'View',exact:true}).click();assert.equal(await page.locator('#personalRouteName').inputValue(),'Cambridge weekend practice');
 await page.locator('#drivePersonalRoute').click();await page.waitForFunction(()=>document.body.dataset.mode==='drive'&&cambridgeDrive.test.running&&cambridgeDrive.personalJourney);
 assert.ok(osmRequests>=2,'429 must retry');
 const drive=await page.evaluate(()=>{const a=cambridgeDrive;a.manual(true);a.frame(.1);let buildings=0;for(const m of a.camera.parent.children)if(m.userData.simulatorBuilding)buildings++;return {experimental:a.test.experimental,ungraded:a.test.ungraded,scenario:!!a.scenario,buildings,perf:a.perf(),roads:a.net.edges.length,origin:a.net.origin,progress:JSON.parse(localStorage.getItem('cambridge-learner-drive.profiles')||'null')};});
 assert.equal(drive.experimental,true);assert.equal(drive.ungraded,true);assert.equal(drive.scenario,false);assert.ok(drive.buildings>0);assert.ok(drive.roads>0);
 await page.keyboard.down('ArrowUp');await page.evaluate(()=>cambridgeDrive.step(80));await page.keyboard.up('ArrowUp');assert.ok(await page.evaluate(()=>Math.abs(cambridgeDrive.player.v)>1),'native controls accelerate');
 await page.evaluate(()=>{const a=cambridgeDrive;a.test.fault('S','Test','should not be recorded');a.frame(.1);});assert.equal(await page.evaluate(()=>cambridgeDrive.test.S),0);
 await page.screenshot({path:'test-results/personal-routes/drive.png'});
 // Advance along the real lane geometry, in small steps, across a streamed boundary.
 for(let i=0;i<35;i++){
   const state=await page.evaluate(()=>{const a=cambridgeDrive,j=a.personalJourney;if(j.loading||j.part>0)return j;const s=Math.min(a.test.route.len-8,a.test.sRoute+24),p=a.lanePoint(s);a.player.place(p.x,p.z,Math.atan2(-p.tx,-p.tz));a.player.v=8;a.step(1,.01);a.frame(0);return a.personalJourney;});
   if(state.part>0||state.loading)break;
 }
 await page.waitForFunction(()=>cambridgeDrive.personalJourney.part===1&&!cambridgeDrive.personalJourney.loading);
 assert.ok(await page.evaluate(()=>cambridgeDrive.player.v>7),'speed survives rebasing');assert.notDeepEqual(await page.evaluate(()=>cambridgeDrive.net.origin),drive.origin);
 assert.equal(await page.evaluate(()=>cambridgeDrive.test.S),0);await page.evaluate(()=>cambridgeDrive.frame(.01));await page.screenshot({path:'test-results/personal-routes/next-section.png'});
 await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();assert.match(await page.locator('#rNote').textContent(),/ungraded/);await page.locator('#hubBtn').click();await page.locator('#myRoutesBtn').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:'test-results/personal-routes/create-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Deleting one recipe only removes its own local map cache.
 page.once('dialog',d=>d.accept());await page.locator('#personalSavedRoutes').getByRole('button',{name:/Delete Cambridge/}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes.length),0);
 assert.equal(searchRequests,1);assert.equal(routeRequests,1);assert.deepEqual(errors,[]);await context.close();
 fs.writeFileSync('test-results/personal-routes/result.json',JSON.stringify({status:'passed',source:'deterministic provider fixtures; real UI, converter, storage and simulator physics',searchRequests,routeRequests,osmRequests,buildings:drive.buildings,performance:drive.perf,streamedSections:2},null,2));console.log('Personal routes: search, pin drag, save/reload, 429 retry, native driving, streaming, no grading, mobile, delete passed');
}finally{await browser?.close();server?.kill();}
