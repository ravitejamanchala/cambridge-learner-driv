import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {roadFixture} from './personal-route-fixture.mjs';
import {PUZZLES} from '../js/puzzles.js';
import {measure,section,encode} from '../js/personal/geometry.js';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json')),port=Number(process.env.ROUTE_TEST_PORT||8796),base=process.env.PREVIEW_URL||`http://127.0.0.1:${port}/`,root=path.resolve(process.env.TEST_SITE||'.');
const server=process.env.PREVIEW_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser,fixture;let osmRequests=0,routeRequests=0,searchRequests=0,rateLimit=true,failMapRequests=false;
fs.mkdirSync('test-results/personal-routes',{recursive:true});
let holdRoute=true,releaseRoute,routeStarted;const routeWaiting=new Promise(resolve=>{routeStarted=resolve;});
try{
 for(let i=0;i<100;i++){try{const ready=await fetch(base);await ready.arrayBuffer();if(ready.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:process.env.RECORD_ROUTES?{dir:'test-results/personal-routes/video',size:{width:1280,height:900}}:undefined}),page=await context.newPage(),errors=[];
 const videoStart=Date.now(),videoMarks={};const mark=name=>{videoMarks[name]=(Date.now()-videoStart)/1000;};
 page.setDefaultTimeout(60000);await page.addInitScript(()=>{window.spoken=[];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},getVoices(){return[{lang:'en-GB'}];},speak(u){window.spoken.push(u.text);}}});});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/auth-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.LEARNER_CONFIG={PREVIEW:true}'}));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4ebdf"/><path d="M0 100h256M100 0v256" stroke="#fff" stroke-width="12"/><text x="120" y="145" fill="#799080" font-size="12">Map fixture</text></svg>'}));
 await page.route('**/map-api/search?*',r=>{searchRequests++;return r.fulfill({json:[{name:'Cambridge',display_name:'Cambridge, Cambridgeshire, England',lat:'52.205',lon:'.12',boundingbox:['52.195','52.215','.105','.135']}]});});
 await page.route('**/map-api/route',async r=>{routeRequests++;if(holdRoute){routeStarted();await new Promise(resolve=>{releaseRoute=resolve;});}const {start,end}=r.request().postDataJSON();fixture=roadFixture(start,end);return r.fulfill({json:{code:'Ok',routes:[{geometry:{type:'LineString',coordinates:fixture.coordinates},distance:1000,duration:120}],waypoints:fixture.waypoints}}).catch(()=>{});});
 await page.route('**/map-api/osm',r=>{osmRequests++;if(failMapRequests)return r.fulfill({status:503,json:{message:'Fixture provider temporarily unavailable'}});if(rateLimit){rateLimit=false;return r.fulfill({status:429,headers:{'Retry-After':'1'},json:{message:'busy'}});}return r.fulfill({json:fixture.osm});});
 await page.goto(base);await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Route review');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 mark('route-flow');await page.locator('#myRoutesBtn').click();assert.equal(await page.locator('#tileMode,#tileControls,#tileViewport').count(),0);await page.locator('#routePlace').fill('Cambridge');await page.locator('#placeSearch button').click();await page.getByRole('button',{name:'Cambridge, Cambridgeshire, England',exact:true}).click();
 const rect=await page.locator('#personalRouteMap').boundingBox();await page.mouse.click(rect.x+rect.width*.25,rect.y+rect.height*.72);await page.mouse.click(rect.x+rect.width*.76,rect.y+rect.height*.25);
 // A real draggable Leaflet marker changes the stored start coordinate.
 const before=await page.locator('#pinSummary').textContent(),pin=await page.locator('.personal-pin.start').boundingBox();await page.mouse.move(pin.x+16,pin.y+16);await page.mouse.down();await page.mouse.move(pin.x+35,pin.y+10,{steps:8});await page.mouse.up();assert.notEqual(await page.locator('#pinSummary').textContent(),before);
 // Keep one provider request pending to verify the loader is visible, cancellable
 // and accessible on mobile as well as desktop, without pretending to know a percentage.
 await page.locator('#generatePersonalRoute').click();await routeWaiting;
 assert.ok(await page.locator('#personalRouteLoading').isVisible());assert.match(await page.locator('#routeLoadingStatus').textContent(),/Finding/);assert.equal(await page.locator('.personal-routes>.card').getAttribute('aria-busy'),'true');
 await page.screenshot({path:'test-results/personal-routes/loading-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.route-loading-spinner').evaluate(e=>getComputedStyle(e).animationName),'none');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'cancelRouteRequest');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/personal-routes/loading-mobile.png'});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#personalRouteLoading').isVisible(),false);assert.match(await page.locator('#personalRouteStatus').textContent(),/Cancelled/);assert.ok(await page.locator('#personalRoutesSheet').isVisible());holdRoute=false;releaseRoute();await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#generatePersonalRoute').click();await page.waitForFunction(()=>!document.querySelector('#routeReady').hidden);assert.equal(await page.locator('#personalRouteLoading').isVisible(),false);assert.equal(await page.locator('#mockPersonalRoute').isVisible(),false);await page.locator('#personalRouteName').fill('Cambridge weekend practice');await page.locator('#savePersonalRoute').click();assert.match(await page.locator('#personalRouteStatus').textContent(),/Saved/);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes);assert.equal(stored.length,1);assert.equal(stored[0].title,'Cambridge weekend practice');
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='slaydrive.personal-routes.v1')throw new DOMException('Full','QuotaExceededError');return window.originalSetItem.call(this,k,v);};});await page.locator('#savePersonalRoute').click();assert.match(await page.locator('#personalRouteStatus').textContent(),/storage is full/);await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);await page.locator('#savePersonalRoute').click();assert.ok(stored[0].distance>700,'fixture should exercise section streaming');
 await page.screenshot({path:'test-results/personal-routes/create-desktop.png'});await page.reload();await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden);await page.locator('#myRoutesBtn').click();await page.locator('#personalSavedRoutes').getByRole('button',{name:'View',exact:true}).click();assert.equal(await page.locator('#personalRouteName').inputValue(),'Cambridge weekend practice');
 failMapRequests=true;await page.locator('#drivePersonalRoute').click();await page.waitForFunction(()=>document.querySelector('#personalRouteStatus').textContent.includes('unavailable'));assert.equal(await page.evaluate(()=>document.body.dataset.mode),'lobby');assert.equal(await page.locator('#personalRouteLoading').isVisible(),false);failMapRequests=false;
 await page.locator('#drivePersonalRoute').click();assert.ok(await page.locator('#personalRouteLoading').isVisible());await page.waitForFunction(()=>document.body.dataset.mode==='drive'&&cambridgeDrive.test.running&&cambridgeDrive.personalJourney);
 mark('route-drive');assert.ok(osmRequests>=2,'429 must retry');failMapRequests=true;
 const drive=await page.evaluate(()=>{const a=cambridgeDrive;a.manual(true);a.frame(.1);let buildings=0,refinedChunks=0;a.camera.parent.traverse(m=>{if(m.userData.simulatorBuilding)buildings++;if(m.userData.refinedMarkings)refinedChunks++;});window.__continuousNet=a.net;window.__continuousTest=a.test;window.__continuousTraffic=a.traffic;return {experimental:a.test.experimental,ungraded:a.test.ungraded,scenario:!!a.scenario,buildings,refinedChunks,perf:a.perf(),roads:a.net.edges.length,origin:a.net.origin,progress:JSON.parse(localStorage.getItem('cambridge-learner-drive.profiles')||'null')};});
 assert.equal(drive.experimental,true);assert.equal(drive.ungraded,true);assert.equal(drive.scenario,false);assert.ok(drive.buildings>0);assert.ok(drive.refinedChunks>0,"drive uses refined map markings");assert.ok(drive.roads>0);
 await page.keyboard.down('ArrowUp');await page.evaluate(()=>cambridgeDrive.step(80));await page.keyboard.up('ArrowUp');assert.ok(await page.evaluate(()=>Math.abs(cambridgeDrive.player.v)>1),'native controls accelerate');
 await page.evaluate(()=>{const a=cambridgeDrive;a.test.fault('S','Test','should not be recorded');a.frame(.1);});assert.equal(await page.evaluate(()=>cambridgeDrive.test.S),0);
 await page.screenshot({path:'test-results/personal-routes/drive.png'});
 // Provider access is deliberately unavailable after Start. Crossing the former
 // 600 m boundary must not fetch, pause, replace the world or reset traffic.
 const requestsAtStart=osmRequests;
 for(let i=0;i<30;i++){
   if(await page.evaluate(()=>cambridgeDrive.personalJourney.progress>625))break;
   await page.evaluate(()=>{const a=cambridgeDrive,s=Math.min(a.test.route.len-50,a.test.sRoute+24),p=a.lanePoint(s);a.player.place(p.x,p.z,Math.atan2(-p.tx,-p.tz));a.player.v=8;a.step(1,.01);a.frame(0);});
 }
 assert.ok(await page.evaluate(()=>cambridgeDrive.personalJourney.progress>600));
 assert.ok(await page.evaluate(()=>cambridgeDrive.net===window.__continuousNet&&cambridgeDrive.test===window.__continuousTest&&cambridgeDrive.traffic===window.__continuousTraffic&&cambridgeDrive.test.running));
 assert.equal(osmRequests,requestsAtStart);assert.deepEqual(await page.evaluate(()=>cambridgeDrive.net.origin),drive.origin);
 assert.equal(await page.evaluate(()=>cambridgeDrive.test.S),0);await page.evaluate(()=>cambridgeDrive.frame(.01));await page.screenshot({path:'test-results/personal-routes/next-section.png'});
 await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();assert.match(await page.locator('#rNote').textContent(),/ungraded/);await page.locator('#hubBtn').click();await page.locator('#myRoutesBtn').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:'test-results/personal-routes/create-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Deleting one recipe only removes its own local map cache.
 page.once('dialog',d=>d.accept());await page.locator('#personalSavedRoutes').getByRole('button',{name:/Delete Cambridge/}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes.length),0);
 mark('course-voice');
 // Road challenges are lessons in the same course; IDs and marking stay intact.
 await page.locator('#personalRoutesSheet .x').click();await page.locator('[data-open=courseSheet]').first().click();
 assert.equal(await page.locator('[data-open=puzzleSheet]').count(),0);assert.equal(await page.locator('#lessonList [data-z]').count(),PUZZLES.length);
 await page.locator('#lessonList [data-z]').first().click();assert.ok((await page.evaluate(()=>window.spoken)).some(t=>t.includes(PUZZLES[0].title)));
 await page.locator('#lessonDetail [data-start]').click();await page.waitForFunction(()=>document.body.dataset.mode==='drive'&&cambridgeDrive.test.running);assert.equal(await page.evaluate(()=>cambridgeDrive.test.experimental),false);
 await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();await page.locator('#setBtn').click();await page.locator('[data-voice="0"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('slaydrive.voice.v1')),'off');
 await page.locator('#settingsSheet .x').click();const spoken=await page.evaluate(()=>window.spoken.length);await page.locator('[data-open=courseSheet]').first().click();await page.locator('#lessonList [data-z]').first().click();assert.equal(await page.evaluate(()=>window.spoken.length),spoken);
 await page.screenshot({path:'test-results/personal-routes/course-road-lesson.png'});await page.locator('#courseSheet .x').click();
 mark('graded-mock');
 // A synthetic, cached 6+ mile loop exercises the real graded custom-drive path.
 const corners=[[.12,52.2],[.123,52.2],[.123,52.202],[.12,52.202]],coords=[];for(let lap=0;lap<13;lap++)coords.push(...corners);coords.push(corners[0],[.121,52.2]);const measured=measure(coords);
 const mockRecipe={version:1,id:'graded-loop-test',title:'Long Cambridge practice loop',createdAt:Date.now(),start:coords[0],end:coords.at(-1),distance:measured.length,geometry:encode(coords)};
 const osm={elements:[...corners.map(([lon,lat],i)=>({type:'node',id:i+1,lon,lat})),{type:'way',id:10,nodes:[1,2,3,4,1],tags:{highway:'residential',name:'Fixture loop',oneway:'yes',lanes:'1',width:'3.2',maxspeed:'20 mph'}}]};
 const cached=Array.from({length:Math.ceil(measured.length/600)},(_,i)=>({key:`${mockRecipe.id}:2:${i}`,track:{kind:'osm-source',bounds:section(measured,i).bounds,elements:osm.elements}}));
 await page.evaluate(({mockRecipe,cached})=>{localStorage.setItem('slaydrive.personal-routes.v1',JSON.stringify({version:1,routes:[mockRecipe]}));localStorage.setItem('slaydrive.personal-map-cache.v1',JSON.stringify(cached));},{mockRecipe,cached});
 await page.locator('#myRoutesBtn').click();await page.locator('#personalSavedRoutes').getByRole('button',{name:'Mock test',exact:true}).click();await page.waitForFunction(()=>cambridgeDrive.test.running&&document.body.dataset.mode==='drive');
 assert.deepEqual(await page.evaluate(()=>({ungraded:cambridgeDrive.test.ungraded,experimental:cambridgeDrive.test.experimental,marking:cambridgeDrive.test.marking})),{ungraded:false,experimental:false,marking:'hard'});
 await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();assert.equal(await page.locator('#verdict').textContent(),'Incomplete');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes[0].lastMock.pass),false);await page.locator('#againBtn').click();
 const finish=async serious=>page.evaluate(serious=>{const a=cambridgeDrive;a.manual(true);if(serious)a.test.fault('S','Control','Fixture serious fault','fixture');const r=a.test.route,p=a.lanePoint(r.len-1);a.player.place(p.x,p.z,Math.atan2(-p.tx,-p.tz));a.player.v=0;a.test.idx=r.xs.length-2;a.test.sRoute=r.len-1;a.test.step=r.instructions.length-1;a.test.wpIndex=a.test.waypoints.length-1;a.step(1);},serious);
 await finish(true);await page.waitForFunction(()=>!document.querySelector('#resultSheet').hidden);assert.equal(await page.locator('#rS').textContent(),'1');assert.equal(await page.locator('#verdict').textContent(),'Not this time');
 await page.locator('#againBtn').click();await finish(false);await page.waitForFunction(()=>!document.querySelector('#resultSheet').hidden);assert.equal(await page.locator('#verdict').textContent(),'Pass. Well driven.');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes[0].lastMock.pass),true);
 await page.waitForTimeout(350);await page.screenshot({path:'test-results/personal-routes/graded-mock-result.png'});
 videoMarks.end=(Date.now()-videoStart)/1000;fs.writeFileSync('test-results/personal-routes/video-marks.json',JSON.stringify(videoMarks,null,2));
 assert.equal(searchRequests,1);assert.equal(routeRequests,2);assert.deepEqual(errors,[]);await context.close();
 fs.writeFileSync('test-results/personal-routes/result.json',JSON.stringify({status:'passed',source:'deterministic provider fixtures; real UI, converter, storage and simulator physics',searchRequests,routeRequests,osmRequests,buildings:drive.buildings,performance:drive.perf,loaderCancellation:true,loaderMobileAndKeyboard:true,preparedWholeRoute:true,boundaryWithoutReload:true,offlineWhileDriving:true,preflightFailureRecovery:true,gradedMockPassAndFail:true,courseRoadLessons:PUZZLES.length,voiceMute:true},null,2));console.log('Personal routes: search, pin drag, save/reload, 429 retry, native driving, continuous tiles without requests, ungraded practice, graded mock pass/fail, course road lessons, voice mute, mobile and delete passed');
}finally{await browser?.close();server?.kill();}
