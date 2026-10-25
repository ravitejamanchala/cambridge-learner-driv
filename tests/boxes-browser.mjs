// Yellow box junctions and KEEP CLEAR in a real browser (issue #5): following the queue into the box, or
// onto KEEP CLEAR, is marked for what it is and fails the lesson. The careful drives (waiting at the line,
// stopping short of KEEP CLEAR, waiting in the box to turn right) are the Bot lab's:
//   BOT_PICK=lesson:box-junction npm run test:bots      (and lesson:box-right, lesson:keep-clear)
//   CHROMIUM_PATH=... node tests/boxes-browser.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';
import { installMwDriver } from './mw-driver.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const root = path.resolve(process.env.TEST_SITE || '.'), port = 8786, url = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(url); await r.arrayBuffer(); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({ path: three + '/build/three.min.js', contentType: 'application/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', r => r.fulfill({ path: three + '/examples/js/loaders/GLTFLoader.js', contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await installAuthFixture(page);
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#loadOv').hidden, {}, { timeout: 45000 }); await signedIn(page);

  // the scripted driver keeps to the route's lane at 20 mph and simply follows whatever is in front of it,
  // up to a car's length behind: it reads neither the box nor the words on the road
  const { start, set, untilDone, outcome } = await installMwDriver(page);
  const show = (r) => [...r.faults, ...r.reasons].join('\n  ');
  // and pulls up at the end of the route, where the lesson finishes
  const pullUp = () => page.evaluate(() => { const a = window.cambridgeDrive, t = a.test;
    for (let i = 0; i < 12000 && t.running && t.sRoute < t.route.len - 30; i++) a.step(1); window.__mw.mph = -1; }); // a touch below zero: the brake stays on until the car is still
  const follow = async (id) => { await start(id); await set({ mph: 20, gap: 0.6 }); await pullUp(); await untilDone(); return outcome(); };

  // ---------- into the box behind the queue ----------
  const box = await follow('box-junction');
  assert.equal(box.verdict, 'Not yet', show(box));
  assert.ok(box.faults.some(f => /^S Response to road markings: Stopped in a yellow box junction with your exit blocked/.test(f)), show(box));
  assert.ok(box.reasons.some(r => /went into the box with no room beyond it/.test(r)), show(box));
  console.log('Into the box behind the queue:', box.faults.filter(f => /box/.test(f)).join('; '));

  // ---------- onto KEEP CLEAR behind the queue ----------
  const keep = await follow('keep-clear');
  assert.equal(keep.verdict, 'Not yet', show(keep));
  assert.ok(keep.faults.some(f => /^D Response to road markings: Stopped on the KEEP CLEAR markings/.test(f)), show(keep));
  assert.ok(keep.reasons.some(r => /stopped on the KEEP CLEAR markings, blocking Orchard Way/.test(r)), show(keep));
  console.log('Onto KEEP CLEAR behind the queue:', keep.faults.filter(f => /KEEP CLEAR/.test(f)).join('; '));

  assert.deepEqual(errors, []);
  console.log('PASS yellow box and KEEP CLEAR: following the queue in is marked and fails the lesson');
} finally { await browser?.close(); server.kill(); }
