// Browser compatibility checks; emulation is not a physical iOS/Android device test.
import { chromium, webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';
const require=createRequire(import.meta.url), three=path.dirname(require.resolve('three/package.json'));
const output=path.resolve(process.env.MOBILE_OUTPUT || '../../outputs/mobile-tests');await mkdir(output,{recursive:true});
const root=path.resolve(process.env.TEST_SITE || 'dist'),port=8781,url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const results=[];
const matrix=[
 {name:'iphone-se',engine:'webkit',preset:'iPhone SE'},
 {name:'iphone-13',engine:'webkit',preset:'iPhone 13'},
 {name:'iphone-13-landscape',engine:'webkit',preset:'iPhone 13 landscape'},
 {name:'ipad-mini',engine:'webkit',preset:'iPad Mini'},
 {name:'pixel-7',engine:'chromium',preset:'Pixel 7'},
 {name:'pixel-7-landscape',engine:'chromium',preset:'Pixel 7 landscape'},
 {name:'galaxy-s9',engine:'chromium',preset:'Galaxy S9+'}
];
let browser;
try {
 for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 for(const engine of ['webkit','chromium'].filter(e=>!process.env.MOBILE_ENGINE||process.env.MOBILE_ENGINE===e)){
  try {browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});}
  catch(e){results.push({engine,status:'unavailable',error:e.message.slice(0,600)});continue;}
  for(const spec of matrix.filter(s=>s.engine===engine)){
   const result={...spec,status:'running',checks:[],errors:[]};results.push(result);
   const context=await browser.newContext({...devices[spec.preset],locale:'en-GB',timezoneId:'Europe/London'});
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>result.errors.push(e.message));
   try {
    await context.route('**/auth-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.LEARNER_CONFIG={};'}));
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
    await context.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
    await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await installAuthFixture(context);
    // The auth fixture signs in and holds progress, so no lesson is unlocked by hand.
    const KEY='cambridge-learner-drive.v1.account.fixture';
    const start=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:45000});await signedIn(page);
    result.bootMs=Date.now()-start;result.checks.push('3D scene boots');
    result.webgl=await page.evaluate(()=>({canvas:!!document.querySelector('#stage canvas'),webgl2:!!window.WebGL2RenderingContext}));assert.equal(result.webgl.canvas,true);
    await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','cockpit-drill',true);window.cambridgeDrive.manual(true);});
    for(const action of ['doorClosed','seatSet','mirrorsSet','belt'])await page.locator(`[data-operation="${action}"]`).tap();
    await page.evaluate(()=>window.cambridgeDrive.step(2));assert.equal(await page.locator('#verdict').textContent(),'Lesson passed');result.checks.push('cockpit lesson completes via touch');
    await page.locator('#hubBtn').tap();
    await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','parallel-park',true);window.cambridgeDrive.manual(true);window.cambridgeDrive.frame(0);});
    const view=page.viewportSize();
    const rects=await page.locator('.touch button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
    result.controls=rects;
    assert.ok(rects.length>=4);
    for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=view.width+1&&r.y+r.h<=view.height+1,'Control out of viewport: '+r.name);assert.ok(r.w>=44&&r.h>=44,'Control too small: '+r.name);assert.ok(r.hit,'Obscured control: '+r.name);}
    for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++){const x=rects[a],y=rects[b];assert.ok(x.x+x.w<=y.x||y.x+y.w<=x.x||x.y+x.h<=y.y||y.y+y.h<=x.y,'Overlapping controls');}
    result.checks.push('touch targets fit, hit-test, >=44px, no overlap');
    const pointer=async(sel,type,id)=>page.locator(sel).dispatchEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,buttons:type==='pointerdown'?1:0,bubbles:true});
    const cdp=engine==='chromium'?await context.newCDPSession(page):null;
    const point=async(sel,id)=>{const r=await page.locator(sel).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2,id};};
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point('[data-k="down"]',1)]});else await pointer('[data-k="down"]','pointerdown',1);
    await page.evaluate(()=>window.cambridgeDrive.step(2));await page.locator('[data-gear="D"]').click();await page.locator('[data-operation="parkingBrake"]').click();await page.locator('#lookBtn').click();
    if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point('[data-k="up"]',1),await point('[data-k="left"]',2)]});}
    else {await pointer('[data-k="down"]','pointerup',1);await pointer('[data-k="up"]','pointerdown',1);await pointer('[data-k="left"]','pointerdown',2);}
    const movement=await page.evaluate(()=>{const a=window.cambridgeDrive,x=a.player.x,z=a.player.z;a.step(45);return {throttle:a.player.rawInput.throttle,steer:a.player.rawInput.steer,moved:Math.hypot(a.player.x-x,a.player.z-z)};});
    result.movement=movement;assert.equal(movement.throttle,1);assert.equal(movement.steer,1);assert.ok(movement.moved>.05);result.checks.push(engine==='chromium'?'CDP simultaneous touch drives and steers':'synthetic pointer events drive and steer');
    await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.cambridgeDrive.step(1);});assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.rawInput.throttle),0);result.checks.push('blur releases held inputs');
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const sample=await page.evaluate(async()=>{const a=window.cambridgeDrive,times=[];let last=performance.now();for(let n=0;n<30;n++)await new Promise(resolve=>requestAnimationFrame(t=>{a.frame(1/60);times.push(t-last);last=t;resolve();}));return {medianFrameMs:times.sort((a,b)=>a-b)[15],maxFrameMs:Math.max(...times)};});result.desktopFrameSample=sample;
    await page.screenshot({path:path.join(output,spec.name+'.png')});
    await page.setViewportSize({width:view.height,height:view.width});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const rotated=await page.locator('.touch button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(const r of rotated)assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=view.height+1&&r.y+r.h<=view.width+1,'Rotated control clipped: '+r.name);
    assert.equal(await page.evaluate(()=>window.cambridgeDrive.test.running),true);result.checks.push('rotation retains active drive and controls fit');
    await page.setViewportSize(view);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:45000});
    const saved=await page.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));return d.profiles[0].lessons['cockpit-drill'];},KEY);assert.equal(saved.passed,true);assert.ok(saved.attempts>=1);result.checks.push('lesson progress persists after reload');
    await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','cockpit-drill',true);window.cambridgeDrive.manual(true);});
    await context.setOffline(true);
    for(const action of ['doorClosed','seatSet','mirrorsSet','belt'])await page.locator(`[data-operation="${action}"]`).tap();
    await page.evaluate(()=>window.cambridgeDrive.step(2));assert.equal(await page.locator('#verdict').textContent(),'Lesson passed');
    await context.setOffline(false);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:45000});
    const offlineSaved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).profiles[0].lessons['cockpit-drill'],KEY);
    assert.ok(offlineSaved.attempts>saved.attempts);result.checks.push('offline in-session progress survives reconnect and reload');
    assert.deepEqual(result.errors,[]);result.status='passed';
   }catch(e){result.status='failed';result.error=e.message;result.loadMessage=await page.locator('#loadMsg').textContent().catch(()=>null);await page.screenshot({path:path.join(output,spec.name+'-failure.png')}).catch(()=>{});}
   finally {await context.close();await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({name:result.name,engine,status:result.status,checks:result.checks,error:result.error}));}
  }
  await browser.close();browser=null;
 }
} finally {await browser?.close();server.kill();}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
