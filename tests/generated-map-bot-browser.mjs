import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  three = path.dirname(require.resolve("three/package.json")),
  port = 8797,
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
  await page.addInitScript((recipe) => {
    localStorage.setItem(
      "slaydrive.personal-routes.v1",
      JSON.stringify({ version: 1, routes: [recipe] }),
    );
  }, recipe);
  await page.route(
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    (r) =>
      r.fulfill({
        path: three + "/build/three.min.js",
        contentType: "text/javascript",
      }),
  );
  await page.route(
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
    (r) =>
      r.fulfill({
        path: three + "/examples/js/loaders/GLTFLoader.js",
        contentType: "text/javascript",
      }),
  );
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ body: "", contentType: "text/css" }),
  );
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/></svg>',
      contentType: "image/svg+xml",
    }),
  );
  let providerCalls = 0;
  await page.route("**/map-api/osm", (r) => {
    providerCalls++;
    return r.fulfill({
      status: 503,
      json: { message: "City test must use its packaged source" },
    });
  });
  await page.goto(base + "?bots");
  await page.waitForFunction(
    () => window.cambridgeDrive && document.querySelector("#loadOv").hidden,
  );
  await page.locator("#blMyRoutes").click();
  await page
    .locator("#personalSavedRoutes")
    .getByRole("button", { name: "Drive", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      cambridgeDrive.personalJourney?.ready &&
      document.body.dataset.mode === "drive",
  );
  assert.equal(providerCalls, 0);
  assert.equal(await page.locator("#blPick").inputValue(), "personal:current");
  const before = await page.evaluate(() => ({
    x: cambridgeDrive.player.x,
    z: cambridgeDrive.player.z,
    scene: cambridgeDrive.importedScene,
  }));
  assert.ok(before.scene.sourceObjects > 300);
  assert.ok(before.scene.roads > 50);
  await page.locator("#blSpd").selectOption("4");
  await page.locator("#blSeed").fill("7");
  await page.locator("#blGo").click();
  await page.waitForFunction(
    (p) =>
      Math.hypot(cambridgeDrive.player.x - p.x, cambridgeDrive.player.z - p.z) >
      8,
    before,
    { timeout: 60000 },
  );
  await fs.promises.mkdir("test-results/world", { recursive: true });
  await page.screenshot({ path: "test-results/world/my-routes-bot.png" });
  await page.locator("#blPause").click();
  const paused = await page.evaluate(() => ({
    x: cambridgeDrive.player.x,
    z: cambridgeDrive.player.z,
  }));
  await page.waitForTimeout(300);
  assert.ok(
    await page.evaluate(
      (p) =>
        Math.hypot(
          cambridgeDrive.player.x - p.x,
          cambridgeDrive.player.z - p.z,
        ) < 0.1,
      paused,
    ),
  );
  await page.locator("#blPause").click();
  await page.locator("#blStop").click();
  await page.waitForFunction(() => !document.querySelector("#blGo").disabled);
  let run = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("cld.bot."))
      .map((k) => JSON.parse(localStorage.getItem(k)))
      .at(-1),
  );
  assert.equal(run.kind, "personal");
  assert.equal(run.pass, null);
  assert.equal(run.source.generator, "source-normalized-v1");
  assert.equal(
    run.source.datasetVersion,
    "52fdf092cb5e518587df60f81ee649591e457ede6b761af903e7ecf17563bef9",
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      experimental: cambridgeDrive.test.experimental,
      D: cambridgeDrive.test.D,
      S: cambridgeDrive.test.S,
    })),
    { experimental: true, D: 0, S: 0 },
  );
  // The one-click shortcut must use the same native My routes flow.
  await page.locator('#blExample').click();
  await page.waitForFunction(()=>!document.querySelector('#blExample').disabled);
  // Also complete the short real-source sample at maximum simulation speed.
  await page.locator('#blSpd').selectOption('0');
  await page.locator('#blGo').click();
  await page.waitForFunction(()=>!document.querySelector('#blGo').disabled,{},{timeout:120000});
  const completed=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('cld.bot.')).map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>a.at-b.at).at(-1));
  assert.equal(completed.end,'done',JSON.stringify(completed));
  assert.equal(completed.completed,true);assert.equal(completed.pass,null);
  // Provider adapter fixture: verifies UI/coordinates, not live Google imagery access.
  await page.evaluate(()=>{window.SLAYDRIVE_MAPS={googleMapsBrowserKey:''};});
  await page.locator('#blGoogleOverlay').click();
  await page.locator('#googleReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#gmConnect').isVisible(),true);
  await page.evaluate(()=>{
    window.overlayTest={shapes:[],maps:[]};
    class Shape{constructor(options){this.options=options;overlayTest.shapes.push(this);}setMap(map){this.options.map=map;}addListener(){return {remove(){}};}}
    class Map{constructor(node,options){this.options=options;node.textContent='Google API adapter fixture — no reference imagery';overlayTest.maps.push(this);}getBounds(){return {toJSON:()=>({south:52,north:53,west:0,east:1})};}fitBounds(){}addListener(){return {remove(){}};}}
    window.google={maps:{Map,Polygon:Shape,Polyline:Shape,LatLngBounds:class{extend(){}},event:{clearInstanceListeners(){}}}};
  });
  await page.locator('#gmKey').fill('fixture-not-a-real-key');
  await page.locator('#gmConnect button').click();
  await page.waitForFunction(()=>window.overlayTest?.shapes.length>0);
  assert.equal(await page.evaluate(()=>overlayTest.maps[0].options.mapTypeId),'satellite');
  const proposal={type:'FeatureCollection',schemaVersion:1,accepted:false,source:{provider:'Synthetic test only',allowsDerivedData:true},georeference:{crs:'EPSG:4326'},features:[{geometry:{type:'Polygon',coordinates:[[[.146,52.218],[.1461,52.218],[.1461,52.2181],[.146,52.218]]]},properties:{kind:'parking_bay',status:'proposal',verified:false,scoreCalibrated:false,score:.7}}]};
  await page.locator('#gmVision').setInputFiles({name:'fixture-proposals.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(proposal))});
  await page.waitForFunction(()=>document.querySelector('#gmStatus').textContent.includes('1 unverified'));
  await page.locator('#gmHide').click();
  assert.equal(await page.evaluate(()=>overlayTest.shapes.filter(s=>s.options.map).length),0);
  await page.locator('#gmHide').click();
  assert.ok(await page.evaluate(()=>overlayTest.shapes.some(s=>s.options.map)));
  await page.locator('#gmOpacity').fill('0');await page.locator('#gmOpacity').dispatchEvent('input');
  assert.ok(await page.evaluate(()=>overlayTest.shapes.filter(s=>s.options.map).every(s=>s.options.strokeOpacity===0)));
  await page.locator('#gmClose').click();assert.equal(await page.locator('#googleReview').count(),0);
  await page.goto(base+'street-assets.html');
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  assert.equal(await page.locator('.label').count(),10);
  await page.screenshot({path:'test-results/world/street-assets.png'});
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-results/world/my-routes-bot.json",
    JSON.stringify(
      {
        passed: true,
        sourceObjects: before.scene.sourceObjects,
        roads: before.scene.roads,
        providerCalls,
        run, completed,
        pageErrors: errors,
        checks: [
          "existing My routes saved recipe",
          "packaged real Cambridge source",
          "native car driven more than 8 metres by existing bot",
          "watch and pause",
          "stop and exportable evidence",
          "no grading",
          "one-click example and short route completion",
          "ten original street assets rendered in WebGL",
          "Google overlay setup, provider adapter, layer visibility and opacity (provider mocked)",
        ],
        scope:
          "Local real-data integration, one short route/seed completion, not a city accuracy certificate",
      },
      null,
      2,
    ),
  );
  console.log("Generated My routes map + Bot lab browser checks passed");
} finally {
  await browser?.close();
  server?.kill();
}
