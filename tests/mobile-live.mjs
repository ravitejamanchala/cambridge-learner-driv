import { chromium, webkit, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve('../../outputs/mobile-tests');await mkdir(output,{recursive:true});
const results=[];
for(const spec of [{name:'iphone-live-signin',engine:'webkit',preset:'iPhone 13'},{name:'android-live-signin',engine:'chromium',preset:'Pixel 7'}]){
 let browser,context,page;const result={...spec,checks:[],status:'running',errors:[]};results.push(result);
 try{
  browser=await (spec.engine==='webkit'?webkit:chromium).launch(spec.engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  context=await browser.newContext({...devices[spec.preset],locale:'en-GB'});page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>result.errors.push(e.message));
  const start=Date.now();await page.goto('https://manchala.co.uk/cambridge-learner-driv/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loadOv')?.hidden,{}, {timeout:60000});result.bootMs=Date.now()-start;result.checks.push('deployed simulator boots with real CDN/network');
  await page.waitForFunction(()=>window.Clerk?.loaded,{}, {timeout:45000});result.checks.push('production Clerk initializes');
  if(!await page.locator('[data-login]').isVisible())await page.locator('#profBtn2').tap();
  await page.locator('[data-login]').tap();
  await page.getByRole('heading',{name:'Sign in to drive sim'}).waitFor();assert.equal(await page.getByRole('button',{name:'Sign in with Google Continue with Google'}).isVisible(),true);
  assert.equal(await page.getByLabel('Email address',{exact:true}).isVisible(),true);result.checks.push('Google and email login UI renders');
  result.pageFacts=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,serviceWorkerControlsPage:!!navigator.serviceWorker?.controller,hasManifest:!!document.querySelector('link[rel="manifest"]')}));
  await page.screenshot({path:path.join(output,spec.name+'.png')});
  assert.deepEqual(result.errors,[]);result.status='passed';
 }catch(e){result.status='failed';result.error=e.message;await page?.screenshot({path:path.join(output,spec.name+'-failure.png')}).catch(()=>{});}
 finally{await context?.close();await browser?.close();console.log(JSON.stringify(result));await writeFile(path.join(output,'live-results.json'),JSON.stringify(results,null,2));}
}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
