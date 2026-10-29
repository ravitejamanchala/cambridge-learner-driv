import{chromium}from'playwright';import{spawn}from'node:child_process';import{createRequire}from'node:module';import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{installAuthFixture,signedIn}from'./auth-fixture.mjs';
const require=createRequire(import.meta.url),three=path.dirname(require.resolve('three/package.json')),port=Number(process.env.MODAL_TEST_PORT||8798),url=`http://127.0.0.1:${port}`,server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});let browser;const results=[];
try{
 for(let i=0;i<100;i++){try{const r=await fetch(url);await r.arrayBuffer();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.env.CI?undefined:'/usr/bin/chromium'),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'text/javascript'}));await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'text/javascript'}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await installAuthFixture(page);await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loadOv').hidden);await signedIn(page);await page.evaluate(()=>cambridgeDrive.manual(true));await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 await page.evaluate(async()=>{await cambridgeDrive.pick('lesson','q-showme',true);});
 await page.evaluate(async()=>{await cambridgeDrive.pick('mock','east-road',true);cambridgeDrive.test.onFinish();cambridgeDrive.test.running=false;document.body.dataset.mode='lobby';});
 const sheets=['courseSheet','puzzleSheet','mockSheet','freeSheet','codeSheet','carSheet','creditsSheet','controlsSheet','settingsSheet','profileSheet','quizSheet','pauseSheet','resultSheet'];fs.mkdirSync('test-results/modals',{recursive:true});
 for(const [width,height]of[[320,568],[390,844],[844,390],[768,1024]]){
  await page.setViewportSize({width,height});
  for(const id of sheets){
   await page.evaluate(id=>{document.querySelectorAll('.sheet').forEach(s=>s.hidden=true);document.querySelector('#'+id).hidden=false;},id);
   await page.waitForTimeout(25);
   const detail=await page.locator('#'+id).evaluate(s=>{const card=s.querySelector('.card'),r=card.getBoundingClientRect();const over=[...s.querySelectorAll('input,select,.seg,.set,.detail,.tile,.item,.body')].filter(e=>e.offsetWidth&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX!=='auto').map(e=>({el:e.id||e.className,width:e.clientWidth,scroll:e.scrollWidth}));return {card:{x:r.x,y:r.y,w:r.width,h:r.height},over,body:s.querySelector('.body')?.getBoundingClientRect().height};});
   results.push({width,height,id,...detail});
   if((width===390||height===390)&&['courseSheet','settingsSheet','profileSheet','mockSheet','carSheet'].includes(id))await page.screenshot({path:`test-results/modals/${width}-${height}-${id}.png`});
   if(!process.env.AUDIT_ONLY){assert.ok(detail.card.x>=0&&detail.card.y>=0&&detail.card.x+detail.card.w<=width+1&&detail.card.y+detail.card.h<=height+1,JSON.stringify(results.at(-1)));assert.deepEqual(detail.over,[],JSON.stringify(results.at(-1)));assert.ok(detail.body>=70,JSON.stringify(results.at(-1)));}
  }
 }
 // Touch list -> detail -> back, with controls reachable without scrolling through the course.
 await page.setViewportSize({width:390,height:844});
 for(const [id,selector]of[['courseSheet','[data-l]'],['puzzleSheet','[data-z]'],['mockSheet','[data-i]'],['freeSheet','[data-f]']]){
  await page.evaluate(id=>{document.querySelectorAll('.sheet').forEach(s=>s.hidden=true);const s=document.querySelector('#'+id);s.hidden=false;s.querySelector('.card').dataset.mobileView='list';s.querySelector('.body').scrollTop=0;},id);
  await page.locator('#'+id+' '+selector).first().click();assert.equal(await page.locator('#'+id+' .list').isVisible(),false);assert.equal(await page.locator('#'+id+' .detail').isVisible(),true);
  await page.screenshot({path:'test-results/modals/390-844-'+id+'-detail.png'});
  await page.locator('#'+id+' .sheet-back').click();assert.equal(await page.locator('#'+id+' .list').isVisible(),true);assert.equal(await page.locator('#'+id+' .detail').isVisible(),false);
 }
 // The Linux fallback is wider than the local default font. It previously made
 // the camera selector overflow at 320 px even though the other layouts passed.
 await page.setViewportSize({width:320,height:568});
 await page.addStyleTag({content:':root{--font-display:"DejaVu Sans",sans-serif;--font-body:"DejaVu Sans",sans-serif}'});
 await page.evaluate(()=>{document.querySelectorAll('.sheet').forEach(s=>s.hidden=true);document.querySelector('#settingsSheet').hidden=false;});
 for(const group of await page.locator('#settingsSheet .seg').all())assert.ok(await group.evaluate(e=>e.scrollWidth<=e.clientWidth+2),await group.getAttribute('id')+' overflows with the fallback font');
 await page.screenshot({path:'test-results/modals/320-568-settings-fallback.png'});
 fs.rmSync('test-results/modals/failure.json',{force:true});
 fs.writeFileSync('test-results/modals/layout.json',JSON.stringify(results,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({panels:sheets.length,viewports:4,fallbackFont:'passed',overflows:results.filter(r=>r.over.length)}));
}catch(error){fs.mkdirSync('test-results/modals',{recursive:true});fs.writeFileSync('test-results/modals/failure.json',JSON.stringify({message:error.message,last:results.at(-1),stack:error.stack},null,2));console.error('::error::'+error.message.replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));throw error;}finally{await browser?.close();server.kill();}
