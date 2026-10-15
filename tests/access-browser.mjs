import {chromium} from 'playwright';
import assert from 'node:assert/strict';
let full=false,progressReads=0;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:process.cwd()+'/node_modules/three/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:process.cwd()+'/node_modules/three/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/auth-config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.LEARNER_CONFIG={CLERK_PUBLISHABLE_KEY:'pk_test_'+btoa('clerk.fixture.invalid$'),API_BASE_URL:'https://api.fixture.invalid'};`}));
 await page.route('https://clerk.fixture.invalid/**',r=>r.fulfill({contentType:'text/javascript',body:`window.Clerk={user:{id:'fixture',firstName:'Test'},session:{getToken:async()=> 'fixture'},load:async()=>{},addListener(){},mountUserButton(){},unmountUserButton(){},openSignIn(){},signOut(){}};`}));
 await page.route('https://api.fixture.invalid/**',r=>{const me=new URL(r.request().url()).pathname==='/api/me';if(!me)progressReads++;return r.fulfill({contentType:'application/json',body:JSON.stringify(me?{id:'internal',access:{full}}:{profile:null,revision:0,sessions:[]})});});
 await page.goto('http://127.0.0.1:8000/');await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:30000}).catch(async e=>{console.log(errors,await page.locator('#loadMsg').textContent());throw e;});
 for(const sheet of ['courseSheet','mockSheet','puzzleSheet']){
  await page.locator(`[data-open=${sheet}]`).first().click({force:true});await page.locator('#profileSheet').waitFor({state:'visible'});assert.equal(await page.locator('#'+sheet).isVisible(),false);await page.locator('#profileSheet [data-close]').click();
 }
 assert.equal(progressReads,0);
 full=true;await page.locator('#profBtn2').click();await page.locator('[data-access]').click();await page.waitForFunction(()=>document.querySelector('#playBtn').getAttribute('aria-disabled')==='false');
 await page.locator('#profileSheet [data-close]').click();
 await page.locator('[data-open=courseSheet]').first().click();assert.equal(await page.locator('#lessonList [data-l]').count(),32);
 for(const id of ['cockpit-drill','engine-control','automatic-drive','automatic-reverse','steering-control','forward-bay','reverse-bay','leave-bay'])assert.equal(await page.locator(`[data-l="${id}"]`).count(),0);
 await page.locator('#courseSheet [data-close]').click();
 for(const sheet of ['mockSheet','puzzleSheet']){await page.locator(`[data-open=${sheet}]`).first().click();await page.locator('#'+sheet).waitFor({state:'visible'});await page.locator('#'+sheet+' [data-close]').click();}
 full=false;await page.locator('#profBtn2').click();await page.locator('[data-access]').click();await page.waitForFunction(()=>document.querySelector('#playBtn').getAttribute('aria-disabled')==='true');
 assert.deepEqual(errors,[]);console.log('PASS: locked menus, tagged access, 32 visible lessons, mock/puzzle access and revocation; no page errors');
}finally{await browser.close();}
