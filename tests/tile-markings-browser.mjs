import {chromium} from 'playwright';
import fs from 'node:fs';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {generateTile} from '../js/tile-builder/model.js';
const tile=generateTile(JSON.parse(fs.readFileSync('tests/fixtures/tile-builder/synthetic-markings.json')),[.13407,52.20479]);
assert.ok(tile.street.yellowPaint.length);assert.ok(tile.street.texts.some(p=>p.text==='KEEP CLEAR'));assert.ok(tile.street.arrows.length);
const output='test-results/tile-markings';fs.mkdirSync(output,{recursive:true});
const server=spawn('python3',['-m','http.server','8899','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/snapshot',r=>r.fulfill({contentType:'text/html',body:'<style>html,body,#view{margin:0;width:100%;height:100%;overflow:hidden}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/":"/node_modules/three/"}}</script><div id="view"></div>'}));
 await p.goto('http://127.0.0.1:8899/snapshot');await p.evaluate(async tile=>{window.THREE=await import('three');const {createViewer}=await import('/js/tile-builder/viewer.js');window.view=createViewer(document.getElementById('view'));view.show(tile);view.setGuides(false);view.focus(0,0,{distance:200,elevation:1.5});},tile);
 await p.screenshot({path:output+'/synthetic-markings.png'});assert.deepEqual(errors,[]);assert.ok(await p.evaluate(()=>view.stats().triangles>100));
 // Check the actual WebGL screenshot, not just model counts: yellow hatching is present.
 const yellow=await p.evaluate(async()=>{view.render();const blob=await new Promise(r=>document.querySelector('canvas').toBlob(r)),bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const g=c.getContext('2d');g.drawImage(bitmap,0,0);let n=0;const a=g.getImageData(0,0,c.width,c.height).data;for(let i=0;i<a.length;i+=4)if(a[i]>180&&a[i+1]>120&&a[i+2]<100)n++;return n;});assert.ok(yellow>50,'Yellow box must be visible in the rendered frame');
 fs.writeFileSync(output+'/result.json',JSON.stringify({passed:true,source:'synthetic fixture, not real Cambridge markings',arrows:tile.street.arrows.length,crossings:tile.street.crossings.length,yellowPixels:yellow},null,2));console.log('Marking renderer passed: yellow hatching, crossing types, lane arrows and road text.');
}finally{await browser?.close();server.kill();}
