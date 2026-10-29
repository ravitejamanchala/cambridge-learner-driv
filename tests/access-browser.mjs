import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const specs=process.env.TEST_ENGINE==='webkit'?[{name:'iphone',engine:webkit,preset:devices['iPhone 13']}]:[{name:'desktop',engine:chromium,preset:{}},{name:'android',engine:chromium,preset:devices['Pixel 7']}];
for(const spec of specs){
 let full=false,checkouts=0;
 const browser=await spec.engine.launch(spec.engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
 try{
  const page=await browser.newPage({...spec.preset,...(process.env.TEST_DPR?{deviceScaleFactor:Number(process.env.TEST_DPR)}:{})}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:process.cwd()+'/node_modules/three/build/three.min.js',contentType:'application/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:process.cwd()+'/node_modules/three/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.route('**/auth-config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.LEARNER_CONFIG={CLERK_PUBLISHABLE_KEY:'pk_test_'+btoa('clerk.fixture.invalid$'),API_BASE_URL:'https://api.fixture.invalid'};`}));
  await page.route('https://clerk.fixture.invalid/**',r=>r.fulfill({contentType:'text/javascript',body:`window.Clerk={user:{id:'fixture',firstName:'Test'},session:{getToken:async()=> 'fixture'},load:async()=>{},addListener(){},mountUserButton(){},unmountUserButton(){},openSignIn(){},signOut(){}};`}));
  await page.route('https://api.fixture.invalid/**',r=>{
   const path=new URL(r.request().url()).pathname;let body;
   if(path==='/api/me')body={id:'internal',access:{full}};
   else if(path==='/api/billing')body={enabled:true,testMode:true,full,hasCustomer:full,status:full?'active':'none'};
   else if(path==='/billing/config')body={enabled:true,testMode:true};
   else if(path==='/api/billing/checkout'){checkouts++;body={url:'https://checkout.stripe.com/fixture'};}
   else body={profile:null,revision:0,sessions:[]};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route('https://checkout.stripe.com/fixture',r=>r.fulfill({body:'<h1>Checkout fixture</h1>',contentType:'text/html'}));
  const site=process.env.TEST_URL||'http://127.0.0.1:8000/';
  await page.goto(site+'?subscription=success');await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:45000}).catch(async e=>{console.log(spec.name,errors,await page.locator('#loadMsg').textContent());throw e;});
  if(!await page.locator('#profileSheet').isVisible())await page.locator('#profBtn2').click();await page.locator('[data-billing-status]').filter({hasText:'confirmation is pending'}).waitFor();await page.locator('#profileSheet [data-close]').click();
  // A forged success redirect cannot grant access. Free course stays open.
  for(const sheet of ['mockSheet','puzzleSheet']){await page.locator(`[data-open=${sheet}]`).first().click({force:true});await page.locator('#profileSheet').waitFor({state:'visible'});assert.equal(await page.locator('#'+sheet).isVisible(),false);await page.locator('#profileSheet [data-close]').click();}
  await page.locator('[data-open=courseSheet]').first().click();assert.equal(await page.locator('#lessonList [data-l]').count(),50);
  for(const id of ['mirror-practice','controlled-stop','accel-decel'])assert.match(await page.locator(`[data-l="${id}"]`).innerText(),/Free/);
  for(const id of ['cockpit-drill','engine-control','automatic-drive','automatic-reverse','steering-control'])assert.equal(await page.locator(`[data-l="${id}"]`).count(),0);
  // reduced motion (issue #10): the menus open and their cards appear without animating
  await page.emulateMedia({reducedMotion:'reduce'});
  const motion=await page.evaluate(()=>[...document.querySelectorAll('#courseSheet, #courseSheet *')].map(el=>{const c=getComputedStyle(el),ms=v=>Math.max(...v.split(',').map(x=>parseFloat(x)*(/ms/.test(x)?1:1000)));return{el:el.id||el.className,t:ms(c.transitionDuration),a:c.animationName==='none'?0:ms(c.animationDuration)};}).filter(x=>x.t>1||x.a>1));
  assert.deepEqual(motion,[],'menus still animate with reduced motion: '+JSON.stringify(motion.slice(0,5)));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#courseSheet [data-close]').click();
  await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','controlled-stop',true);});assert.equal(await page.locator('body').getAttribute('data-mode'),'drive');
  await page.locator('#pauseBtn').click();await page.locator('#quitBtn').click();
  assert.equal(await page.evaluate(()=>window.cambridgeDrive.pick('lesson','move-off',true)),false);await page.locator('#profileSheet').waitFor({state:'visible'});
  await page.locator('[data-subscribe]').click();await page.waitForURL('https://checkout.stripe.com/fixture');assert.equal(checkouts,1);
  // Server-confirmed paid state unlocks mock/puzzles; revocation stops a paid drive.
  full=true;await page.goto(site);await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:45000}).catch(async e=>{console.log(spec.name,errors,await page.locator('#loadMsg').textContent());throw e;});
  await page.waitForFunction(()=>document.querySelector('[data-open=mockSheet]').getAttribute('aria-disabled')==='false');
  if(await page.locator('#profileSheet').isVisible())await page.locator('#profileSheet [data-close]').click();
  for(const sheet of ['mockSheet','puzzleSheet']){await page.locator(`[data-open=${sheet}]`).first().click();await page.locator('#'+sheet).waitFor({state:'visible'});await page.locator('#'+sheet+' [data-close]').click();}
  await page.evaluate(async()=>{await window.cambridgeDrive.pick('lesson','move-off',true);});assert.equal(await page.locator('body').getAttribute('data-mode'),'drive');
  full=false;await page.evaluate(()=>document.querySelector('[data-access]').click());await page.waitForFunction(()=>document.body.dataset.mode==='lobby');
  assert.equal(await page.locator('[data-open=mockSheet]').getAttribute('aria-disabled'),'true');
  assert.deepEqual(errors,[]);await mkdir('test-results/subscription',{recursive:true});if(!await page.locator('#profileSheet').isVisible())await page.locator('#profBtn2').click();await page.screenshot({path:'test-results/subscription/'+spec.name+'.png'});
  console.log('PASS '+spec.name+': free lessons drive, paid gates, checkout redirect, verified unlock, expiry lock; no page errors');
 }finally{await browser.close();}
}
