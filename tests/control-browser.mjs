// Steering, controllers and leaving the road, in a real browser:
//  - driving off the road is marked: a wheel over the edge as mounting the kerb, the car off the road as a
//    serious fault, so the lesson cannot pass (a car could once run onto the verge for one driving fault)
//  - free drive, which marks nothing, still says how long the wheels were off the road
//  - full steering at speed is a firm turn, not a swerve; at walking pace it is still full lock
//  - a game controller steers, accelerates, brakes and indicates
//   CHROMIUM_PATH=... node tests/control-browser.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const root = path.resolve(process.env.TEST_SITE || '.'), port = 8787, url = `http://127.0.0.1:${port}`;
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
  // a stand-in game controller, driven from the test through window.__pad
  await page.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })), connected: false };
    navigator.getGamepads = () => [window.__pad.connected ? { id: 'Test pad', mapping: 'standard', connected: true, axes: window.__pad.axes, buttons: window.__pad.buttons } : null];
  });
  await installAuthFixture(page);
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#loadOv').hidden, {}, { timeout: 45000 }); await signedIn(page);
  const start = (kind, id) => page.evaluate(async ([k, i]) => { const a = window.cambridgeDrive; a.manual(true); await a.pick(k, i, true); a.manual(true); }, [kind, id]);
  const steps = (n) => page.evaluate(k => window.cambridgeDrive.step(k), n);
  const hold = (inp) => page.evaluate(i => { window.__hold = i; if (!window.__holdOn) { window.__holdOn = true; window.cambridgeDrive.addInput(() => window.__hold); } }, inp);

  // ---------- running off the road in a lesson ----------
  {
    await start('lesson', 'mw-keep-left'); await steps(20);
    await hold({ throttle: 0.4, brake: 0, steer: 0.35 }); // drift left across the hard shoulder onto the verge
    let f = []; for (let i = 0; i < 60 && !f.some(x => /Drove off the road/.test(x)); i++) { await steps(10); f = await page.evaluate(() => window.cambridgeDrive.test.faults.map(x => `${x.kind} ${x.cat}: ${x.text}`)); }
    assert.ok(f.some(x => /^D Control – steering: Mounted the kerb/.test(x)), f.join(' | '));
    assert.ok(f.some(x => /^S Control – steering: Drove off the road: the car was \d+\.\d m past the edge/.test(x)), f.join(' | '));
    await hold(null); await page.evaluate(() => window.cambridgeDrive.test.finish());
    assert.equal(await page.evaluate(() => document.querySelector('#verdict').textContent), 'Not yet', 'a drive that left the road must not pass');
    console.log('Off the road in a lesson:', f.filter(x => /steering/.test(x)).join(' | '));
  }
  // ---------- free drive marks nothing, but says how long the wheels were off ----------
  {
    await start('free', 'm3'); await page.evaluate(() => { window.cambridgeDrive.player.v = 22; }); await steps(100);
    await hold({ throttle: 0.5, brake: 0, steer: 0.3 }); await steps(80); await hold({ throttle: 0, brake: 1, steer: 0 }); await steps(120); await hold(null);
    const lines = await page.evaluate(() => { const a = window.cambridgeDrive; return { faults: a.test.faults.length, off: a.freeStats.offRoad }; });
    assert.equal(lines.faults, 0, 'free drive is ungraded'); assert.ok(lines.off > 0.5, `free drive did not measure the time off the road (${lines.off})`);
    console.log(`Free drive: ${lines.off.toFixed(1)} s with wheels off the road measured, no faults.`);
  }
  // ---------- steering at speed and at walking pace ----------
  {
    await start('lesson', 'mw-keep-left'); await hold({ throttle: 0.6, brake: 0, steer: 0 }); await steps(60);
    const fast = await page.evaluate(() => { const a = window.cambridgeDrive, p = a.player; window.__hold = { throttle: 0.6, brake: 0, steer: 1 }; let peak = 0, th = p.th;
      for (let i = 0; i < 20; i++) { a.step(1); const yaw = (p.th - th) / 0.05; th = p.th; peak = Math.max(peak, Math.abs(yaw * p.v)); } window.__hold = { throttle: 0, brake: 0, steer: 0 }; return { mph: p.v * 2.237, peak }; });
    assert.ok(fast.peak <= 7.5, `full steering at ${fast.mph.toFixed(0)} mph pulled ${fast.peak.toFixed(1)} m/s² sideways`);
    const slow = await page.evaluate(() => { const a = window.cambridgeDrive, p = a.player; p.v = 2; window.__hold = { throttle: 0, brake: 0, steer: 1 }; for (let i = 0; i < 20; i++) a.step(1); return p.delta; });
    assert.ok(slow > 0.6, `full lock at walking pace is ${slow.toFixed(2)} rad`);
    await hold(null);
    console.log(`Steering: full input at ${fast.mph.toFixed(0)} mph peaks at ${fast.peak.toFixed(1)} m/s² sideways; at walking pace the wheels reach ${(slow * 57.3).toFixed(0)}°.`);
  }
  // ---------- a game controller ----------
  {
    await start('lesson', 'mw-keep-left'); await steps(10);
    const pad = (o) => page.evaluate(o => { const P = window.__pad; P.connected = true; if (o.x !== undefined) P.axes[0] = o.x; for (const [i, v] of Object.entries(o.b || {})) P.buttons[i] = { value: v, pressed: v > 0.5 }; }, o);
    const v0 = await page.evaluate(() => window.cambridgeDrive.player.v);
    await pad({ x: -0.6, b: { 7: 1 } }); await steps(20);
    const s1 = await page.evaluate(() => ({ steer: window.cambridgeDrive.player.steer, v: window.cambridgeDrive.player.v }));
    assert.ok(s1.steer > 0.2, `stick left did not steer left (${s1.steer})`); assert.ok(s1.v > v0, 'the right trigger did not accelerate');
    await pad({ x: 0, b: { 7: 0, 4: 1 } }); await steps(1); await pad({ b: { 4: 0 } }); await steps(1);
    assert.equal(await page.evaluate(() => window.cambridgeDrive.player.indicator), 'L', 'LB did not indicate left');
    await pad({ b: { 6: 1 } }); await steps(20);
    assert.ok(await page.evaluate(v => window.cambridgeDrive.player.v < v, s1.v), 'the left trigger did not brake');
    // keys still win while the controller is idle
    await pad({ b: { 6: 0 } });
    console.log('Controller: left stick steers, triggers accelerate and brake, LB indicates.');
  }
  // ---------- mirrors in the chase view: always on screen, so not marked ----------
  {
    const laneChange = async (camView) => {
      await start('lesson', 'mw-keep-left'); await page.evaluate(c => window.cambridgeDrive.setCam(c), camView); await steps(10);
      await page.evaluate(() => { const p = window.cambridgeDrive.player; if (p.indicator !== 'R') p.signal('R'); });
      await hold({ throttle: 0.5, brake: 0, steer: -0.6 }); await steps(16); await hold({ throttle: 0.5, brake: 0, steer: 0.6 }); await steps(16); await hold({ throttle: 0.5, brake: 0, steer: 0 }); await steps(60); await hold(null);
      return page.evaluate(() => window.cambridgeDrive.test.faults.filter(f => /^Mirrors/.test(f.cat)).map(f => f.text));
    };
    const driver = await laneChange(1), chase = await laneChange(0);
    assert.ok(driver.length > 0, 'in the driver view a lane change with no mirror check is marked');
    assert.deepEqual(chase, [], 'in the chase view the mirrors are always in sight: nothing to mark');
    await page.evaluate(() => window.cambridgeDrive.test.finish());
    const detail = await page.evaluate(() => [...document.querySelectorAll('#runDetailList li')].map(l => l.textContent));
    assert.ok(detail.some(l => /Driven in the chase view for \d+ s: the mirrors were always in sight there, so mirror and shoulder checks were not marked/.test(l)), detail.join('\n'));
    await page.evaluate(() => window.cambridgeDrive.setCam(1));
    console.log(`Mirrors: driver view marks "${driver[0]}"; chase view marks nothing and says so.`);
  }
  // ---------- marking modes: chosen where the drive starts, fixed for it, stars by mode ----------
  {
    const lobby = () => page.evaluate(() => { const t = window.cambridgeDrive.test; if (t) t.running = false; document.querySelector('#hubBtn').click(); });
    await lobby();
    const drive = async (mode, nD) => {
      await page.locator('[data-open=puzzleSheet]').first().click(); await page.locator('[data-z="pz-trumpington"]').click();
      await page.locator(`#puzzleDetail .mode-pick [data-mode="${mode}"]`).click();
      assert.equal(await page.locator(`#puzzleDetail .mode-pick [data-mode="${mode}"]`).getAttribute('aria-checked'), 'true');
      await page.locator('#puzzleDetail [data-start]').click();
      await page.waitForFunction(() => document.body.dataset.mode === 'drive' && window.cambridgeDrive.test?.running, {}, { timeout: 45000 });
      await page.evaluate(n => { const a = window.cambridgeDrive; a.manual(true); for (let i = 0; i < n; i++) a.test.fault('D', 'Signals – necessary', 'Test fault ' + i, 'tf' + i, 0); if (a.scenario && a.scenario.result) a.scenario.result = () => ({ ok: true, why: '' }); a.test.finish(); }, nD); // the puzzle's own goal stands in as met: only the faults are being judged here
      return page.evaluate(() => ({ reasons: [...document.querySelectorAll("#rReasons li")].map(l => l.textContent).join(" / "), verdict: document.querySelector("#verdict").textContent, note: document.querySelector('#rNote').textContent, stars: document.querySelectorAll('#rNote .stars [data-on], #rNote .stars .on').length, label: document.querySelector('#rNote .stars').getAttribute('aria-label') }));
    };
    const hard = await drive('hard', 4); // the easy tier allows 3 driving faults on Hard
    assert.equal(hard.verdict, 'Not yet'); assert.match(hard.label, /^0 of 3/);
    await lobby();
    const medium = await drive('medium', 4);
    assert.equal(medium.verdict, 'Solved', medium.reasons); assert.match(medium.label, /^2 of 3/); assert.match(medium.note, /marked on Medium/);
    // changing the mode afterwards changes nothing already earned
    await page.evaluate(() => { localStorage.setItem('cambridge-learner-drive.mode', 'easy'); });
    const rec = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { if (!k.startsWith('cambridge-learner-drive.v1')) continue; const d = JSON.parse(localStorage.getItem(k)); const p = (d.profiles || []).find(x => x.id === d.current); if (p && p.lessons['pz-trumpington']) return p.lessons['pz-trumpington']; } return null; });
    if (rec) assert.equal(rec.bestStars, 2, 'the record keeps the stars earned on Medium');
    console.log(`Marking: 4 driving faults on an easy-tier puzzle: Hard "${hard.verdict}", Medium "${medium.verdict}" with ${medium.label}${rec ? '; record keeps 2 stars' : ''}.`);
  }
  assert.deepEqual(errors, []);
  console.log('Control: leaving the road is marked and fails the lesson; free drive measures it; steering is firm at speed and full at walking pace; controllers work.');
} finally { await browser?.close(); server.kill(); }
