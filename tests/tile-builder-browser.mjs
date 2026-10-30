import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json'));
const root=process.env.TEST_SITE||'dist-tile',base=process.env.PREVIEW_URL||'http://127.0.0.1:8898/';
const server=process.env.PREVIEW_URL?null:spawn('python3',['-m','http.server','8898','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const fixture=JSON.parse(fs.readFileSync(process.env.TILE_FIXTURE||'tests/fixtures/personal-routes/cambridge-osm.json'));
let browser;const output='test-results/tile-builder';fs.mkdirSync(output,{recursive:true});
try{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'?tile');await r.arrayBuffer();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e6eadd"/><path d="M0 80H256M125 0V256" stroke="white" stroke-width="12"/><text x="12" y="35" font-size="12" fill="#4c5760">Map adapter fixture</text></svg>',contentType:'image/svg+xml'}));
 await page.route('**/map-api/search?*',r=>r.fulfill({json:[{lat:'52.2053',lon:'0.1218',display_name:'Cambridge, Cambridgeshire, UK'}]}));
 await page.route('**/map-api/tile-details',r=>r.fulfill({json:{elements:[]}}));
 let mode='ok';await page.route('**/map-api/osm',async r=>{requests.push(r.request().postDataJSON().bounds);if(mode==='delay')await new Promise(r=>setTimeout(r,1500));await r.fulfill(mode==='error'?{status:502,json:{message:'Provider unavailable. Please retry.'}}:{json:fixture}).catch(()=>{});});
 await page.goto(base+'?tile');await page.waitForSelector('#personalRouteMap .tile-centre-pin');assert.equal(await page.locator('#tile3D').isDisabled(),true);assert.ok(await page.locator('#personalRouteMap').isVisible());
 await page.locator('#routePlace').fill('Cambridge');await page.locator('#placeSearch button').click();await page.locator('#placeResults button').click();assert.equal(await page.locator('#routePlace').inputValue(),'Cambridge');
 const before=await page.locator('#tileCoordinates').textContent(),pin=await page.locator('.tile-centre-pin').boundingBox();await page.mouse.move(pin.x+10,pin.y+10);await page.mouse.down();await page.mouse.move(pin.x+28,pin.y+20,{steps:6});await page.mouse.up();assert.notEqual(await page.locator('#tileCoordinates').textContent(),before);
 // Return to the exact Cambridge fixture selection for the geometric comparison.
 await page.locator('#placeSearch button').click();await page.locator('#placeResults button').click();await page.screenshot({path:output+'/map-fixture.png'});
 await page.locator('#tileGenerate').click();await page.waitForFunction(()=>!document.querySelector('#tileViewport').hidden);
 const canvas=page.locator('#tileViewport canvas');assert.ok(Number(await canvas.getAttribute('data-buildings'))>50);assert.equal(await canvas.getAttribute('data-center'),'0.1218,52.2053');
 assert.ok(Number(await canvas.getAttribute('data-street-assets'))>0);await page.locator('#tileCoverage summary').click();assert.match(await page.locator('#tileAssets').textContent(),/laneArrows/);await page.locator('#tileCoverage summary').click();const withGuides=await canvas.screenshot();await page.locator('#tileGuides').uncheck();assert.notDeepEqual(await canvas.screenshot(),withGuides);await page.locator('#tileGuides').check();
 const first=await canvas.screenshot();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:12});await page.mouse.up();assert.notDeepEqual(await canvas.screenshot(),first);
 await page.locator('#tileReset').click();await page.screenshot({path:output+'/cambridge-3d.png'});const count=await page.locator('#tileCounts').textContent();const drawCalls=Number(await canvas.getAttribute('data-draw-calls'));assert.ok(drawCalls<250,`Tile uses ${drawCalls} draw calls`);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);for(let i=0;i<28;i++){await page.mouse.wheel(0,-100);await page.waitForTimeout(16);}await page.waitForTimeout(150);await page.screenshot({path:output+'/street-detail.png'});await page.locator('#tileReset').click();
 assert.ok(Math.abs((requests[0][2]-requests[0][0])*110574-1200)<.001);
 await page.locator('#tileMap').click();const mapbox=await page.locator('#personalRouteMap').boundingBox();await page.mouse.click(mapbox.x+mapbox.width*.6,mapbox.y+mapbox.height*.5);assert.equal(await page.locator('#tile3D').isDisabled(),true);
 mode='delay';await page.locator('#tileGenerate').click();await page.locator('#tileCancel').click();await page.waitForTimeout(1700);assert.match(await page.locator('#personalRouteStatus').textContent(),/Cancelled/);assert.equal(await page.locator('#tile3D').isDisabled(),true);
 mode='error';await page.locator('#tileGenerate').click();await page.waitForFunction(()=>document.querySelector('#personalRouteStatus').textContent.includes('unavailable'));assert.match(await page.locator('#personalRouteStatus').textContent(),/unavailable/);
 mode='ok';await page.locator('#tileGenerate').click();await page.waitForFunction(()=>!document.querySelector('#tileViewport').hidden);assert.notEqual(await canvas.getAttribute('data-center'),'0.1218,52.2053');
 await page.setViewportSize({width:390,height:844});await page.locator('#tileMap').click();await page.screenshot({path:output+'/mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#routeMode').click();assert.equal(await page.locator('#chooseStart').isVisible(),true);assert.equal(await page.locator('#tileControls').isVisible(),false);assert.equal(await page.locator('.tile-centre-pin').count(),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/result.json',JSON.stringify({passed:true,counts:count,drawCalls,sourceFixture:process.env.TILE_FIXTURE||'committed Cambridge fixture',checks:['visible map and one kilometre square','search and select','drag centre','1200 m buffered request','real 3D render','street asset coverage','road guidance toggle','batched draw call budget','orbit','reset view','changed selection invalidates old tile','cancel','error and retry','mobile overflow'],liveProviders:false},null,2));
 console.log('Tile browser checks passed:',count);
 if(process.env.LIVE_TILE==='1'){
  const live=await browser.newPage({viewport:{width:1440,height:1000}});live.setDefaultTimeout(120000);const calls=[];live.on('response',r=>{if(r.url().includes('tile.openstreetmap.org'))calls.push(r.status());});
  await live.goto(base+'?tile');await live.waitForSelector('#personalRouteMap .leaflet-tile-loaded');await live.locator('#routePlace').fill('Cambridge, UK');await live.locator('#placeSearch button').click();await live.locator('#placeResults button').first().click();await live.screenshot({path:output+'/live-map.png'});await live.locator('#tileGenerate').click();
  await live.waitForFunction(()=>!document.querySelector('#tileViewport').hidden||/unavailable|incomplete|too much/.test(document.querySelector('#personalRouteStatus').textContent),null,{timeout:180000});assert.equal(await live.locator('#tileViewport').isVisible(),true,await live.locator('#personalRouteStatus').textContent());assert.ok(calls.includes(200));await live.screenshot({path:output+'/live-3d.png'});fs.writeFileSync(output+'/live-result.json',JSON.stringify({passed:true,mapTiles:calls,counts:await live.locator('#tileCounts').textContent(),coverage:await live.locator('#tileAssets').textContent(),warnings:await live.locator('#tileUnknown').textContent(),source:'OSM source details included in counts text'},null,2));await live.close();console.log('Live map, search and Cambridge tile generation passed.');
 }
}finally{await browser?.close();server?.kill();}
