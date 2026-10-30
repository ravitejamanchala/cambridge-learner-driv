// Real navigation, focus, car selection and responsive dashboard checks.
// Account responses are offline fixtures; this does not verify Clerk or Stripe live.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const port = Number(process.env.UI_TEST_PORT || 8832), url = process.env.TEST_BASE || `http://127.0.0.1:${port}`;
const out = 'test-results/interface', record = process.env.RECORD_UI === '1';
fs.mkdirSync(out, { recursive: true });
const server = process.env.TEST_BASE ? null : spawn('python3', ['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.env.TEST_SITE || '.'], { stdio: 'ignore' });
let browser, page;
const results = { source: 'Chromium with fixture account; real controls and renderer', checks: [], viewports: [] };
try {
  for (let i=0;i<100;i++) { try { const r=await fetch(url); await r.arrayBuffer(); if(r.ok)break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (process.env.CI ? undefined : '/usr/bin/chromium'), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport:{width:1440,height:900}, reducedMotion:'reduce', ...(record ? {recordVideo:{dir:out+'/video',size:{width:1440,height:900}}} : {}) });
  const videoOrigin=Date.now();
  page = await context.newPage(); const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));
  await installAuthFixture(page);
  await page.goto(url); await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:60000}); await signedIn(page);
  await page.evaluate(()=>cambridgeDrive.manual(true));
  assert.equal(await page.evaluate(async()=>{await document.fonts.load('500 16px Geist');return document.fonts.check('500 16px Geist');}),true);
  const start=Date.now();
  const marks={desktop:(start-videoOrigin)/1000};
  const shot=async name=>{if(record)await page.waitForTimeout(900);await page.screenshot({path:`${out}/${name}.png`});};
  await shot('home-desktop');

  await page.locator('.lobby-nav [data-open=courseSheet]').click();
  assert.equal(await page.locator('#courseSheet [role=dialog]').getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#lobby').evaluate(e=>e.inert),true);
  await page.locator('#courseSheet .x').focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-read-lesson')),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.matches('#courseSheet .x')),true);
  await page.locator('#lessonList [data-l="controlled-stop"]').click();
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.l),'controlled-stop');
  await page.locator('#lessonDetail [data-mode=hard]').focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#lessonDetail [data-mode=medium]').getAttribute('aria-checked'),'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#lessonDetail [data-mode=hard]').getAttribute('aria-checked'),'true');
  await shot('course-desktop');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.matches('.lobby-nav [data-open=courseSheet]')),true);
  assert.equal(await page.locator('#lobby').evaluate(e=>e.inert),false);
  results.checks.push('Course focus stays inside, selected lesson retains focus, Escape restores navigation');

  await page.locator('.lobby-nav [data-open=freeSheet]').click();
  await page.locator('#freePick [data-f]').first().click();await page.locator('#freeSheet .x').click();
  assert.match(await page.locator('#playBtn').textContent(),/Start free drive/);
  await page.locator('#eventCard').click();assert.equal(await page.locator('#freeSheet').isVisible(),true);
  await shot('free-drive');await page.keyboard.press('Escape');
  await page.locator('.lobby-nav [data-open=courseSheet]').click();await page.locator('#lessonList [data-l]').first().click();await page.keyboard.press('Escape');
  results.checks.push('Selected free drive opens its own brief and has the correct Start action');

  await page.locator('#setBtn').click();await shot('settings-desktop');
  await page.locator('#steerSens').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#settingsSheet').isVisible(),false);
  await page.locator('#setBtn').click();
  await page.locator('#settingsSheet [data-open=carSheet]').click();
  await page.locator('#carSheet .x').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'setBtn');
  results.checks.push('Switching Settings → Garage → Close restores the original trigger');
  await page.locator('#homeCars [aria-checked=true]').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#homeCars [aria-checked=true]').dataset.homeCar!=='rx7');
  assert.equal(await page.locator('#homeCarStage').getAttribute('aria-label'),await page.locator('#homeCars [aria-checked=true]').getAttribute('aria-label'));
  await shot('garage-selection');results.checks.push('Keyboard car selection updates the real 3D showroom');

  marks.desktopEnd=(Date.now()-videoOrigin)/1000;
  // Every destination remains reachable without clipped or overlapping controls.
  for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});
    if(width===390)marks.mobile=(Date.now()-videoOrigin)/1000;
    await page.locator('.lobby-main').evaluate(e=>e.scrollTop=0);
    for(const button of await page.locator('.lobby-nav .gbtn').all()) {
      await button.scrollIntoViewIfNeeded();
      const r=await button.evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
      assert.ok(r.w>=44&&r.h>=44&&r.x>=0&&r.x+r.w<=width+1&&r.y>=0&&r.y+r.h<=height+1&&r.hit,JSON.stringify({width,height,r}));
    }
    await page.locator('#playBtn').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#playBtn').evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}));
    for(const sel of ['.lobby-main','.lobby-nav','.dashboard-overview','.dashboard-lower'])assert.ok(await page.locator(sel).evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${width} ${sel} overflow`);
    await page.locator('.lobby-nav').evaluate(e=>e.scrollTop=0);await page.locator('.lobby-main').evaluate(e=>e.scrollTop=0);
    await shot(`home-${width}-${height}`);
    if(width===390){
      await page.locator('.lobby-nav [data-open=courseSheet]').click();await shot('course-mobile');
      await page.locator('#lessonList [data-l]').first().click();assert.equal(await page.locator('#lessonList').isVisible(),false);await shot('lesson-mobile');
      await page.locator('#courseSheet .sheet-back').click();assert.equal(await page.locator('#lessonList').isVisible(),true);await page.keyboard.press('Escape');
      await page.locator('#setBtn').click();await shot('settings-mobile');await page.keyboard.press('Escape');
      await page.locator('.showcase').scrollIntoViewIfNeeded();await shot('garage-mobile');
      marks.mobileEnd=(Date.now()-videoOrigin)/1000;
    }
    results.viewports.push({width,height,navigation:'reachable',horizontalOverflow:false,primaryAction:'reachable'});
  }
  results.checks.push('Five viewport layouts, 44px navigation targets, mobile lesson list/detail/back and scroll');
  await page.locator('[data-route-builder]').scrollIntoViewIfNeeded();
  // Keep the provider unreachable here: the map's useful error state must still fit.
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await page.locator('[data-route-builder]').click();await page.waitForSelector('#personalRoutesSheet:not([hidden])');
  await shot('routes-desktop');await page.locator('#personalRoutesSheet .x').click();
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-route-builder')),true);
  results.checks.push('Route callout opens the existing builder and Close restores its trigger');
  assert.deepEqual(errors,[]);results.errors=errors;results.status='passed';results.videoStartMs=start;
  if(record){results.video=await page.video().path();results.videoMarks=marks;}
  await context.close();fs.writeFileSync(out+'/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}catch(error){await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();server?.kill();}
