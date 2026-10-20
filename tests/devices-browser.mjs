import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json'));
const root=path.resolve(process.env.TEST_SITE||'.'),port=8767,url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try{const response=await fetch(url);await response.arrayBuffer();if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const device of [{name:'phone',width:320,height:568,touch:true},{name:'phone-large',width:390,height:844,touch:true},{name:'landscape',width:844,height:390,touch:true},{name:'tablet',width:768,height:1024,touch:true},{name:'desktop',width:1440,height:900,touch:false}]){
  if(process.env.TEST_DEVICE && process.env.TEST_DEVICE !== device.name)continue;
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:device.touch,isMobile:device.touch});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await installAuthFixture(page);
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);await signedIn(page);
  // The auth fixture signs in, so the account learner already exists. Nothing is unlocked by hand:
  // the tested manoeuvre runs through real input and physics.
  await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','parallel-park',true);window.cambridgeDrive.manual(true);window.cambridgeDrive.frame(0);});
  assert.equal(await page.locator('#observationControls').isVisible(),false);
  assert.equal(await page.locator('[data-gear="N"]').isVisible(),false);
  // one control for the whole manoeuvre, and no cockpit drill or gear selector
  assert.equal(await page.locator('#assessParking').isVisible(),true);
  assert.equal(await page.locator('#assessParking').textContent(),'Release parking brake');
  assert.equal(await page.locator('[data-operation="engine"]').isVisible(),false);
  assert.equal(await page.locator('#cockpitControls').isVisible(),false);
  assert.equal(await page.locator('#gearControls').isVisible(),false);
  await page.screenshot({path:`/tmp/driving-${device.name}-ready.png`});
  // the HUD buttons beside the speedo (pause, all-round check, hold-to-look) must stay on screen and tappable
  const hud=await page.locator('.hud-right button').evaluateAll(buttons=>buttons.filter(b=>b.offsetParent!==null).map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  assert.equal(hud.length,4,JSON.stringify(hud));
  for(const r of hud){
   assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=device.width&&r.y+r.h<=device.height,JSON.stringify({device:device.name,r}));
   assert.ok(r.hit,JSON.stringify({device:device.name,r}));
   if(device.touch)assert.ok(r.w>=36&&r.h>=36,JSON.stringify({device:device.name,r}));
  }
  for(let i=0;i<hud.length;i++)for(let j=i+1;j<hud.length;j++){const a=hud[i],b=hud[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${device.name}: ${a.name} overlaps ${b.name}`);}
  const controls=page.locator('.touch');assert.equal(await controls.isVisible(),device.touch,device.name);
  if(device.touch){
   const rects=await page.locator('.touch button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
   for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=device.width&&r.y+r.h<=device.height,JSON.stringify({device:device.name,r}));assert.ok(r.w>=44&&r.h>=44,JSON.stringify(r));assert.ok(r.hit,JSON.stringify({device:device.name,r}));}
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${device.name}: ${a.name} overlaps ${b.name}`);}
  }
  const cdp=device.touch?await context.newCDPSession(page):null;
  const point=async(selector,id)=>{const r=await page.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2,id};};
  if(device.touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point('[data-k="down"]',1)]});
  else await page.keyboard.down('ArrowDown');
  await page.evaluate(()=>window.cambridgeDrive.step(2));
  // one control: tapping it releases the parking brake, and the car can then be driven
  await page.locator('#assessParking').click();
  assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.operation.parkingBrake),false);
  assert.equal(await page.locator('#assessParking').textContent(),'Park');
  await page.locator('#lookBtn').click();
  if(device.touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point('[data-k="up"]',1),await point('[data-k="left"]',2)]});}
  else{await page.keyboard.up('ArrowDown');await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowLeft');}
  const input=await page.evaluate(()=>{const a=window.cambridgeDrive,before={x:a.player.x,z:a.player.z};a.step(45);return {raw:a.player.rawInput,moved:Math.hypot(a.player.x-before.x,a.player.z-before.z)};});
  assert.equal(input.raw.throttle,1);assert.equal(input.raw.steer,1);assert.ok(input.moved>.05,JSON.stringify(input));
  // Switching away must release held touch and keyboard controls.
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.cambridgeDrive.step(1);});
  assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.rawInput.throttle),0);
  if(device.touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else{await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowLeft');}
  await page.screenshot({path:`/tmp/driving-${device.name}.png`});
  assert.deepEqual(errors,[]);console.log(`${device.name}: controls fit; simultaneous drive/steer and blur release passed`);
  await context.close();
 }
}finally{await browser?.close();server.kill();}
