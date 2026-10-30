import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  three = path.dirname(require.resolve("three/package.json")),
  port = 8798,
  root = path.resolve(process.env.TEST_SITE || "dist-preview"),
  base = process.env.PREVIEW_URL || `http://127.0.0.1:${port}/`;
const recipe = JSON.parse(
  fs.readFileSync("tests/fixtures/world/water-street-route.json"),
);
const server = process.env.PREVIEW_URL
  ? null
  : spawn(
      "python3",
      [
        "-m",
        "http.server",
        String(port),
        "--bind",
        "127.0.0.1",
        "--directory",
        root,
      ],
      { stdio: "ignore" },
    );
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      const response=await fetch(base);await response.arrayBuffer();if(response.ok)break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (process.env.CI ? undefined : "/usr/bin/chromium"),
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(90000);

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=','base64');
  await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({body:tile,contentType:'image/png'}));
  let satelliteFail=true,satelliteCalls=0,providers=0;
  await page.route('https://server.arcgisonline.com/**',r=>{satelliteCalls++;return r.fulfill(satelliteFail?{status:503,body:'Unavailable'}:{body:tile,contentType:'image/png'});});
  await page.route('**/map-api/**',r=>{providers++;return r.fulfill({status:503,json:{message:'No network regeneration allowed'}});});
  await page.goto(base+'world-inspector.html');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('geographic review pending'));
  await page.locator('#worldExample').click();
  await page.waitForFunction(()=>!document.querySelector('#worldSave').disabled||/invalid|failed|disagree|outside/i.test(document.querySelector('#worldFlowStatus').textContent));
  console.log('Generation:',await page.locator('#worldFlowStatus').textContent());
  assert.equal(await page.locator('#worldSave').isEnabled(),true);
  assert.equal(await page.locator('#worldReviewed').isDisabled(),true);
  await page.locator('#worldSave').click();
  await page.waitForFunction(()=>!document.querySelector('#worldDrive').hidden||document.querySelector('#worldFlowStatus').textContent.includes('invalid'));
  console.log('Save:',await page.locator('#worldFlowStatus').textContent());
  assert.equal(await page.locator('#worldDrive').isVisible(),true);
  let snapshots=await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes);
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].savedWorld.reviewStatus,'pending');
  await page.locator('#worldSatellite').click();
  await page.waitForFunction(()=>document.querySelector('#satStatus').textContent.includes('unavailable'));
  assert.equal(await page.locator('#worldReviewed').isDisabled(),true);
  await page.locator('#satClose').click();satelliteFail=false;
  await page.locator('#worldSatellite').click();
  await page.waitForFunction(()=>document.querySelector('#satStatus').textContent.includes('tiles loaded'));
  const shape=page.locator('#satMap path.leaflet-interactive').first();assert.ok(await shape.count());
  await page.locator('#satHide').click();assert.equal(await shape.getAttribute('stroke-opacity'),'0');
  await page.locator('#satHide').click();assert.equal(await shape.getAttribute('stroke-opacity'),'0.45');
  await page.locator('#satClose').click();
  await page.locator('[data-review=roads]').selectOption('mismatch');
  await page.locator('#worldNotes').fill('Adapter test only; no real imagery comparison. Junction width needs review.');
  await page.locator('#worldReviewed').check();await page.locator('#worldSave').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes.length===2);
  snapshots=await page.evaluate(()=>JSON.parse(localStorage.getItem('slaydrive.personal-routes.v1')).routes);
  assert.equal(snapshots[0].savedWorld.reviewStatus,'needs-correction');
  const url=await page.locator('#worldDrive').getAttribute('href');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),snapshots[0].savedWorld.key);
  assert.equal(saved.review.checks.markings,'unknown');assert.equal(saved.review.automaticCorrection,false);
  assert.deepEqual(saved.track,await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).track,snapshots[1].savedWorld.key));
  fs.mkdirSync('test-results/world-flow',{recursive:true});
  await page.screenshot({path:'test-results/world-flow/inspector.png'});
  await page.goto(base+'world-inspector.html?route='+snapshots[0].id);
  await page.waitForFunction(()=>document.querySelector('#worldFlowStatus')?.textContent.includes('Exact saved map restored'));
  assert.equal(await page.locator('#worldName').inputValue(),snapshots[0].title);
  assert.equal(await page.locator('#worldNotes').inputValue(),saved.review.notes);
  assert.equal(await page.locator('#worldReviewed').isDisabled(),true);
  // Persist across a reload and prevent all source access when restoring.
  await page.reload();await page.route('**/world-data/**',r=>r.fulfill({status:503,body:'Saved map must not fetch source'}));
  await page.goto(base+url+'&bots');
  await page.waitForFunction(()=>window.cambridgeDrive&&document.querySelector('#loadOv').hidden&&document.querySelector('#personalRoutesSheet')&&!document.querySelector('#personalRoutesSheet').hidden);
  await page.locator('#drivePersonalRoute').click();
  await page.waitForFunction(()=>cambridgeDrive.personalJourney?.ready&&document.body.dataset.mode==='drive');
  assert.equal(providers,0);
  const scene=await page.evaluate(()=>({id:cambridgeDrive.personalJourney.id,nodes:Array.from(cambridgeDrive.net.nx),edges:cambridgeDrive.net.edges.map(e=>({a:e.a,b:e.b,x:Array.from(e.px),z:Array.from(e.pz)})),objects:cambridgeDrive.importedScene.sourceObjects,origin:cambridgeDrive.net.origin}));
  assert.equal(scene.id,snapshots[0].id);assert.equal(scene.objects,saved.track.objects.length);assert.deepEqual(scene.origin,saved.track.network.origin);assert.equal(scene.edges.length,saved.track.network.edges.length);
  scene.edges.forEach((edge,i)=>{const source=saved.track.network.edges[i];assert.equal(edge.a,source[0]);assert.equal(edge.b,source[1]);edge.x.forEach((v,j)=>assert.ok(Math.abs(v-source[3][j*2]/10)<.001));edge.z.forEach((v,j)=>assert.ok(Math.abs(v-source[3][j*2+1]/10)<.001));});
  const before=await page.evaluate(()=>({x:cambridgeDrive.player.x,z:cambridgeDrive.player.z}));
  await page.locator('#blSeed').fill('7');await page.locator('#blSpd').selectOption('4');await page.locator('#blGo').click();
  await page.waitForFunction(p=>Math.hypot(cambridgeDrive.player.x-p.x,cambridgeDrive.player.z-p.z)>8,before,{timeout:60000});
  await page.locator('#blStop').click();
  await page.screenshot({path:'test-results/world-flow/drive.png'});
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/world-flow/result.json',JSON.stringify({passed:true,satellite:'Provider adapter only: fixture tiles, not a real accuracy review',satelliteCalls,providers,objects:scene.objects,edges:scene.edges.length,checks:['real Cambridge source generation','pending review','satellite error gate','overlay hide/show','mismatch and unknown review states','immutable revisions','reload','exact network restoration without source access','native car moved >8 metres']},null,2));
  if(process.env.LIVE_SATELLITE==='1'){
    const live=await browser.newPage({viewport:{width:1440,height:1000}});const responses=[];
    live.on('response',r=>{if(r.url().includes('World_Imagery/MapServer/tile/'))responses.push({status:r.status(),type:r.headers()['content-type']});});
    await live.goto(base+'world-inspector.html');await live.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('geographic review pending'),null,{timeout:90000});
    await live.locator('#worldExample').click();await live.waitForFunction(()=>!document.querySelector('#worldSatellite').disabled,null,{timeout:90000});await live.locator('#worldSatellite').click();
    await live.waitForFunction(()=>document.querySelector('#satStatus')?.textContent.includes('tiles loaded'),null,{timeout:60000});
    assert.ok(responses.some(r=>r.status===200&&r.type?.startsWith('image/')));
    await live.screenshot({path:'test-results/world-flow/live-satellite.png'});
    fs.writeFileSync('test-results/world-flow/live-satellite.json',JSON.stringify({provider:'Esri World Imagery',tiles:responses,imageryLoaded:true,accuracyCertified:false},null,2));await live.close();
  }
  console.log('World inspector → satellite review adapter → local map → My routes → native drive passed.');
}finally{await browser?.close();server?.kill();}
