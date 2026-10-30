// Exact reported junction: the user's stored OSM export, not a live-provider claim.
import {chromium} from 'playwright';
import {startLocalServer} from '../tools/local-editor-server.mjs';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {buildNet,nearest} from '../js/net.js';import {project} from '../js/personal/geometry.js';
import {joinedRoadSurfaces,polygonOperation,PAVEMENT_HEIGHT} from '../js/road-surfaces.js';import {ringArea} from '../js/road-space.js';
import {fitRoadCorners} from '../js/roadside-clearance.js';import {applyMappedRoadTags} from '../js/mapped-road-tags.js';
const fixture=JSON.parse(await fs.readFile('tests/fixtures/hills-road-cutoff-user.json','utf8')),pins=[[.13327,52.20420],[.13089,52.20197]],net=buildNet(fixture.network);
applyMappedRoadTags(net,fixture.osm?.ways);fitRoadCorners(net,fixture.objects);
const tiles=joinedRoadSurfaces(net,fixture.objects),area=polys=>polys.reduce((n,p)=>n+ringArea(p[0])-p.slice(1).reduce((s,h)=>s+ringArea(h),0),0);
for(const tile of tiles){assert.ok(area(polygonOperation(tile.pave,tile.kerb,'intersection'))<.00001);assert.ok(area(polygonOperation([...tile.pave,...tile.kerb],tile.road,'intersection'))<.00001);}
const pinDistances=pins.map(p=>{const q=project(net,p);return nearest(net,q.x,q.z).d;});assert.ok(pinDistances.every(d=>d<50));
let server,browser;const store=await fs.mkdtemp(path.join(os.tmpdir(),'cambridge-surfaces-'));
try{
 server=await startLocalServer({port:0,store});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(90000);
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:'node_modules/three/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:'node_modules/three/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden).catch(async e=>{console.error('Loading:',await page.locator('#loadMsg').textContent(),errors);throw e;});
 if(await page.locator('#profName').isVisible()){await page.locator('#profName').fill('Surface review');await page.locator('#profForm').evaluate(f=>f.requestSubmit());}
 await page.locator('[data-open=mockSheet]').click();await page.getByLabel('Import editor track JSON').setInputFiles('tests/fixtures/hills-road-cutoff-user.json');
 await page.waitForFunction(()=>document.querySelector('#localTrackLibrary [role=status]')?.textContent.includes('Saved on disk'));
 await page.locator('[data-open=mockSheet]').click();await page.locator('#routePick button').filter({hasText:fixture.title}).click();await page.locator('#mockDetail [data-start]').click();await page.waitForFunction(()=>document.body.dataset.mode==='drive'&&cambridgeDrive.test.running);
 const endPin=project(net,pins[1]),road=nearest(net,endPin.x,endPin.z),centre={x:road.x,z:road.z};
 const geometry=await page.evaluate(({centre,height})=>{const a=cambridgeDrive;a.manual(true);a.player.place(centre.x,centre.z,0);a.player.v=0;a.setCam(2);a.frame(0);const surfaces=[];a.camera.parent.traverse(m=>{if(['pave','kerb'].includes(m.userData.roadSurface)){const p=m.geometry.attributes.position;let min=Infinity,max=-Infinity;for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}surfaces.push({min,max});}});return surfaces;},{centre,height:PAVEMENT_HEIGHT});
 assert.ok(geometry.length>0);assert.ok(geometry.every(g=>Math.abs(g.max-g.min)<.00001&&Math.abs(g.max-PAVEMENT_HEIGHT)<.00001));
 await page.mouse.move(680,470);await page.mouse.wheel(0,260);await page.waitForTimeout(120);await page.evaluate(()=>{for(let i=0;i<20;i++)cambridgeDrive.frame(.016);});
 await fs.mkdir('test-results/personal-routes',{recursive:true});await page.screenshot({path:'test-results/personal-routes/cambridge-flat-junction.png'});
 assert.deepEqual(errors,[]);const result={source:'user supplied Cambridge export, exact reported A/B location; local render',pins,pinDistances,roadTiles:tiles.length,flatPavementMeshes:geometry.length,overlapArea:0,status:'passed'};await fs.writeFile('test-results/personal-routes/cambridge-surfaces.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await fs.rm(store,{recursive:true,force:true});}
