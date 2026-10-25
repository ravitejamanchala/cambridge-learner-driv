// Drives every lesson (or whatever BOT_PICK selects) with the Bot lab's own test driver and reports
// how each one ended. It is a regression sweep, not a marking check: the bot is not a good learner, so
// the bar is that every drive runs to completion rather than getting stuck or timing out.
//   npm run test:bots
//   BOT_PICK=all:all npm run test:bots      (lessons, puzzles and mock tests)
//   BOT_PICK=mock:mill npm run test:bots    (one drive)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';
const require=createRequire(import.meta.url), three=path.dirname(require.resolve('three/package.json'));
const root=path.resolve(process.env.TEST_SITE||'.'),port=8775,url=`http://127.0.0.1:${port}`;
const pick=process.env.BOT_PICK||'all:lesson', budget=+(process.env.BOT_TIMEOUT||1500000);
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<200;i++){try{const r=await fetch(url);await r.arrayBuffer();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',r=>r.fulfill({path:three+'/build/three.min.js',contentType:'application/javascript'}));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',r=>r.fulfill({path:three+'/examples/js/loaders/GLTFLoader.js',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await installAuthFixture(page);
 await page.goto(url+'/?bots');await page.waitForFunction(()=>document.querySelector('#loadOv').hidden,{},{timeout:45000});await signedIn(page);
 await page.locator('#blN').fill('1');await page.locator('#blSpd').selectOption('0');await page.locator('#blLoop').uncheck();
 await page.locator('#blSeed').fill(process.env.BOT_SEED||'7'); // same traffic every sweep unless BOT_SEED asks for another
 await page.locator('#blPick').selectOption(pick);
 if(process.env.BOT_DRIVER) await page.locator('#blDriver').selectOption(process.env.BOT_DRIVER); // reference | keys | stick
 if(process.env.BOT_TRAFFIC) await page.locator('#blTraffic').selectOption(process.env.BOT_TRAFFIC); // lesson | random
 if(process.env.BOT_RUNS) await page.locator('#blN').fill(process.env.BOT_RUNS); // runs of each drive, each on its own seed
 const expected=await page.evaluate(v=>{
  const list=[...document.querySelectorAll('#blPick option')].map(o=>o.value);
  return v.startsWith('all:')?null:list.includes(v)?1:0;
 },pick);
 assert.notEqual(expected,0,`unknown bot selection ${pick}`);
 console.log(`driving ${pick} …`);
 await page.locator('#blGo').click();
 await page.waitForFunction(()=>!document.querySelector('#blGo').disabled,{},{timeout:budget});
 const runs=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('cld.bot.'))
   .map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>a.key.localeCompare(b.key)));
 assert.ok(runs.length,'the bot recorded no runs');
 const KNOWN_STUCK=new Set(); // drives known to stall; none at present
 const bad=runs.filter(r=>r.end!=='done'&&!KNOWN_STUCK.has(r.key));
 const known=runs.filter(r=>r.end!=='done'&&KNOWN_STUCK.has(r.key));
 for(const r of runs){
  const off=r.offRoad&&r.offRoad.max?` off-road ${r.offRoad.max} m for ${r.offRoad.seconds} s`:'', st=r.steering?(r.steering.presses?` ${r.steering.presses} steering presses`:` stick travel ${r.steering.steerTravel.toFixed(0)}`):'';
  console.log(` ${r.end==='done'?(r.pass?'pass':'fail'):'STUCK'.padEnd(4)}  ${r.key.padEnd(26)} ${String(r.reached).padStart(5)}/${String(r.len).padEnd(5)} m  D${r.D} S${r.S}  ${r.end}${off}${st}${r.why?'  '+r.why.slice(0,70):''}`);
  if(!r.pass&&r.cats?.length) console.log(`         ${[...new Set(r.cats)].join(' · ')}`);
  if((!r.pass||process.env.BOT_VERBOSE)&&r.where?.length) for(const [kind,text,x,z] of r.where) console.log(`           ${kind} ${text} (x ${x}, z ${z})`);
 }
 console.log(`\n${runs.length} drives · ${runs.filter(r=>r.pass).length} passed · ${bad.length} did not finish${known.length?` · ${known.length} known stall(s): ${known.map(r=>r.key).join(', ')}`:''}`);
 // a known stall that starts finishing is good news, but the list should be trimmed
 for(const r of runs) if(KNOWN_STUCK.has(r.key)&&r.end==='done') console.log(` note: ${r.key} now runs to completion — remove it from KNOWN_STUCK`);
 // a drive that left the road must not pass: the examiner marks a wheel over the edge, and the car off the road is serious
 const flattering=runs.filter(r=>r.pass&&r.offRoad&&r.offRoad.max>1);
 assert.deepEqual(flattering.map(r=>`${r.key}: passed ${r.offRoad.max} m off the road`),[],'a drive passed after leaving the road');
 // the person-like drivers are a measure of difficulty: a drive they cannot finish is a finding, not a failure
 if(!process.env.BOT_DRIVER||process.env.BOT_DRIVER==='reference') assert.deepEqual(bad.map(r=>`${r.key}: ${r.end} at ${r.reached}/${r.len} m`),[],'every drive must run to completion');
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser?.close();server.kill();}
