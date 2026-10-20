import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), three=path.dirname(require.resolve('three/package.json'));
const root=path.resolve(process.env.TEST_SITE||'.'),port=8773,url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{const response=await fetch(url);await response.arrayBuffer();if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);
 await page.locator('#profName').fill('Car checks');await page.locator('#profForm').evaluate(f=>f.requestSubmit());
 const paint={};
 for(const id of ['compact','hatchback','suv','sports','sports-2','taxi','police','rx7']){
  await page.locator(`[data-home-car="${id}"]`).click();
  await page.waitForFunction(id=>window.cambridgeDrive.player.carId===id,id);
  // the driver's seat is painted the colour of the car that is actually selected
  paint[id]=await page.evaluate(()=>window.cambridgeDrive.cockpitColour);
  const geometry=await page.evaluate(()=>{const p=window.cambridgeDrive.player,rotation=p.mesh.rotation.clone();p.mesh.rotation.set(0,0,0);p.mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(p.mesh),size=box.getSize(new THREE.Vector3());p.mesh.rotation.copy(rotation);return {w:size.x,h:size.y,l:size.z,wheels:p.mesh.userData.wheels.length,front:p.mesh.userData.front.length};});
  assert.ok(geometry.w>1&&geometry.l>3&&geometry.h>.7,JSON.stringify({id,geometry}));assert.ok(geometry.wheels>0&&geometry.front>0,JSON.stringify({id,geometry}));
  console.log(id,JSON.stringify({...geometry,bonnet:'#'+paint[id].toString(16).padStart(6,'0')}));
 }
 // every car gives the cockpit its own paint, and none falls back to the stand-in green
 const colours=Object.values(paint);
 assert.equal(new Set(colours).size>=6,true,'cars should not share one bonnet colour: '+JSON.stringify(paint));
 assert.equal(colours.includes(0x1d6a46),false,'a car fell back to the stand-in bonnet colour: '+JSON.stringify(paint));
 assert.ok(paint.taxi>0xa06000&&paint.taxi<0xffc040,'the taxi bonnet should be amber, got '+paint.taxi.toString(16));
 assert.ok(paint.police<0x303030,'the police bonnet should be dark, got '+paint.police.toString(16));
 await page.locator('[data-home-car="suv"]').click();await page.waitForFunction(()=>window.cambridgeDrive.player.carId==='suv');
 await page.screenshot({path:'/tmp/car-picker-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/car-picker-mobile.png'});
 await page.reload();await page.waitForFunction(()=>window.cambridgeDrive?.player.carId==='suv');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cambridge-learner-drive.prefs')).car),'suv');
 // Failed model selection preserves the current car and offers retry.
 await page.route('**/models/Cop.glb*',r=>r.abort());await page.locator('[data-home-car="police"]').click();
 await page.waitForFunction(()=>document.querySelector('#homeCarStatus').textContent.includes('Could not load'));
 assert.equal(await page.evaluate(()=>window.cambridgeDrive.player.carId),'suv');
 assert.equal(await page.locator('#carTitle').textContent(),'SUV');
 assert.equal(await page.locator('[data-home-car="suv"]').getAttribute('aria-checked'),'true');
 await page.unroute('**/models/Cop.glb*');await page.locator('[data-home-car="police"]').click();await page.waitForFunction(()=>window.cambridgeDrive.player.carId==='police');
 // Keyboard choices and Settings garage stay synchronized with the home selector.
 await page.locator('[data-home-car="police"]').focus();await page.keyboard.press('Home');
 await page.waitForFunction(()=>window.cambridgeDrive.player.carId==='rx7');
 assert.equal(await page.locator('#carTitle').textContent(),'RX-7');
 assert.equal(await page.locator('#homeCars [aria-checked="true"]').count(),1);
 await page.locator('#setBtn').click();await page.locator('[data-open="carSheet"]').click();
 await page.locator('#carList [data-car="suv"]').click();await page.waitForFunction(()=>window.cambridgeDrive.player.carId==='suv');
 assert.equal(await page.locator('#carTitle').textContent(),'SUV');
 await page.locator('#carSheet [data-close]').click();
 await page.waitForFunction(()=>window.cambridgeDrive.traffic.pedestrians.every(m=>m.userData.pedestrian.ready));
 const pedestrians=await page.evaluate(()=>{
  const pool=window.cambridgeDrive.traffic.pedestrians,skeletons=[];
  const out=pool.map(m=>{let skin=null;m.traverse(o=>{if(o.isSkinnedMesh&&!skin)skin=o;});skeletons.push(skin.skeleton);const before=skin.skeleton.bones.map(b=>b.quaternion.toArray().join(',')).join(';');m.userData.pedestrian.update(.4,true);const after=skin.skeleton.bones.map(b=>b.quaternion.toArray().join(',')).join(';');const box=new THREE.Box3().setFromObject(m);return {name:m.userData.pedestrian.character,skin:!!skin,animated:before!==after,bounds:[box.min.toArray(),box.max.toArray()],visible:m.visible};});
  return {models:out,independent:skeletons[0].bones[0]!==skeletons[4].bones[0]};
 });
 console.log('PEDESTRIANS',JSON.stringify(pedestrians));
 assert.equal(new Set(pedestrians.models.map(m=>m.name)).size,4);assert.ok(pedestrians.models.every(m=>m.skin&&m.animated));assert.equal(pedestrians.independent,true);
 const image=await page.evaluate(()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xfff6ea);scene.add(new THREE.HemisphereLight(0xffffff,0x886644,1));const light=new THREE.DirectionalLight(0xffffff,1);light.position.set(2,5,-3);scene.add(light);
  const pool=window.cambridgeDrive.traffic.pedestrians;for(let i=0;i<4;i++){const m=pool[i];m.visible=true;m.position.set((i-1.5)*1.2,0,0);m.rotation.y=0;scene.add(m);m.userData.pedestrian.update(.2,false);}
  const camera=new THREE.PerspectiveCamera(35,2,.1,50);camera.position.set(0,2.1,-7.5);camera.lookAt(0,.9,0);const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,500);renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png').split(',')[1];renderer.dispose();return image;
 });fs.writeFileSync('/tmp/crossing-pedestrians.png',Buffer.from(image,'base64'));
 assert.deepEqual(errors,[]);console.log('Cars, saved selection, load recovery and four independently animated pedestrian rigs passed.');
}finally{await browser?.close();server.kill();}
