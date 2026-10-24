// Motorway lessons in a real browser (issue #7): each careless pattern is marked for what it was and fails
// the lesson, the same careless drive gives the same faults twice, the lane strip shows the right lanes,
// and the feedback accounts for every lane change. The careful drives are the Bot lab's job:
//   BOT_PICK=all:lesson npm run test:bots
//   CHROMIUM_PATH=... node tests/motorway-lessons-browser.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const root = path.resolve(process.env.TEST_SITE || '.'), port = 8783, url = `http://127.0.0.1:${port}`;
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

  // A scriptable driver: holds the route's line offset by window.__mw.lane lanes to the right (moving
  // across at half a lane a second towards .want), at .mph, or .gap seconds behind the car ahead in its
  // lane. Looks and signals only when told to.
  await page.evaluate(() => {
    const a = window.cambridgeDrive, p = a.player;
    window.__mw = { lane: 0, want: 0, mph: 68, gap: null, road: false };
    a.addInput(() => {
      const M = window.__mw, t = a.test; if (!t.running) return null;
      M.lane += Math.sign(M.want - M.lane) * Math.min(Math.abs(M.want - M.lane), 0.025);
      let q = a.lanePoint(Math.min(t.route.len, t.sRoute + 25)), off = M.lane * 3.65;
      // .road: follow the motorway itself, whatever the route does (to carry on past an exit)
      const nr = t.ctx;
      if (M.road && nr && nr.way.cls === 'motorway') { const e = nr.e, s2 = Math.min(e.len - 0.1, nr.s + 25); let i = 0; while (i < e.n - 2 && e.cum[i + 1] < s2) i++;
        const L = e.cum[i + 1] - e.cum[i] || 1, u = (s2 - e.cum[i]) / L, tx = (e.px[i + 1] - e.px[i]) / L, tz = (e.pz[i + 1] - e.pz[i]) / L, lat = e.way.w / 2 - 3.65 * 0.5;
        q = { x: e.px[i] + tx * u * L + tz * lat, z: e.pz[i] + tz * u * L - tx * lat, tx, tz }; }
      const x = q.x - q.tz * off, z = q.z + q.tx * off;
      let want = M.mph * 0.44704; const fx = -Math.sin(p.th), fz = -Math.cos(p.th);
      if (M.gap != null) for (const c of a.traffic.cars) { if (!c.alive) continue; const dx = c.x - p.x, dz = c.z - p.z, f = dx * fx + dz * fz;
        if (f > 0 && f < 150 && Math.abs(dx * fz - dz * fx) < 1.8) want = Math.min(want, c.v + ((f - 4.6) - M.gap * p.v) * 0.4); }
      let ang = Math.atan2(-(x - p.x), -(z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
      return { throttle: p.v < want - 0.3 ? 1 : 0, brake: p.v > want + 0.6 ? Math.min(1, (p.v - want) / 4) : 0, steer: Math.max(-1, Math.min(1, ang * 2)) };
    });
  });
  const start = (id, lane = 0) => page.evaluate(async ([id, lane]) => { const a = window.cambridgeDrive; a.manual(true); await a.pick('lesson', id, true); a.manual(true);
    Object.assign(window.__mw, { lane, want: lane, mph: 68, gap: null, road: false }); }, [id, lane]);
  const steps = (n) => page.evaluate(k => window.cambridgeDrive.step(k), n);
  const look = (view) => page.evaluate(v => { const a = window.cambridgeDrive; a.player.observations.push({ view: v, at: a.traffic.clock }); }, view);
  const signal = (d) => page.evaluate(d => { const p = window.cambridgeDrive.player; if (p.indicator !== d) p.signal(d); }, d);
  const set = (o) => page.evaluate(o => Object.assign(window.__mw, o), o);
  const untilDone = async () => { for (let i = 0; i < 60; i++) { if (await page.evaluate(() => window.cambridgeDrive.test.done)) return; await steps(200); } throw new Error('the lesson never finished'); };
  const outcome = () => page.evaluate(() => ({ verdict: document.querySelector('#verdict').textContent, reasons: [...document.querySelectorAll('#rReasons li')].map(l => l.textContent),
    detail: [...document.querySelectorAll('#runDetailList li')].map(l => l.textContent), faults: window.cambridgeDrive.test.faults.map(f => `${f.kind} ${f.cat}: ${f.text}`).reverse() }));
  const show = (r) => r.faults.join('\n  ');

  // ---------- pulling straight out into busy traffic, with no look and no signal ----------
  const rushed = async () => {
    // the moment the first of the faster cars is just behind on the right: straight out, no look, no signal
    await start('mw-busy-lane'); await set({ mph: 55 });
    for (let i = 0; i < 200 && !(await page.evaluate(() => { const a = window.cambridgeDrive, p = a.player, fx = -Math.sin(p.th), fz = -Math.cos(p.th);
      return a.traffic.cars.some(c => c.alive && c.lane === 1 && (c.x - p.x) * fx + (c.z - p.z) * fz > -18 && (c.x - p.x) * fx + (c.z - p.z) * fz < -8); })); i++) await steps(2);
    await set({ want: 1, mph: 60 }); await steps(400);
    await set({ want: 0 }); await untilDone(); return outcome();
  };
  const a1 = await rushed();
  assert.equal(a1.verdict, 'Not yet', show(a1));
  assert.ok(a1.faults.some(f => /Mirrors – change direction: Moved right into the right-hand lane without checking the right mirror/.test(f)), show(a1));
  assert.ok(a1.faults.some(f => /Signals – necessary: Moved right into the right-hand lane without signalling/.test(f)), show(a1));
  assert.ok(a1.faults.some(f => /too small a gap|vehicle alongside/.test(f)), 'pulled out in front of the stream of traffic: ' + show(a1));
  assert.ok(a1.detail.some(l => /^Moved right from the left-hand to the right-hand lane at \d+ mph: no right mirror check, no shoulder check, no signal/.test(l)), a1.detail.join('\n'));
  console.log('Rushed pull-out:', a1.faults.length, 'faults —', a1.faults.map(f => f.split(':')[0]).join(', '));
  // ---------- the same careless drive, again: the same verdict, fault for fault ----------
  const a2 = await rushed();
  assert.deepEqual(a2.faults, a1.faults, 'the same drive gave different faults the second time');
  console.log('Repeatable: the same drive gave the same', a2.faults.length, 'faults.');

  // ---------- middle-lane hogging, after a proper lane change ----------
  {
    await start('mw-keep-left'); await steps(10);
    await look('right'); await look('blindspot'); await signal('R'); await steps(40); await set({ want: 1 }); await steps(60); await signal('R');
    // the lane strip: three lanes, you in the middle one, and the left-hand lane where you should be
    await steps(20 * 25); await page.evaluate(() => { for (let i = 0; i < 4; i++) window.cambridgeDrive.frame(0.05); });
    const strip = await page.evaluate(() => { const el = document.querySelector('#hudLanes'); return { hidden: el.hidden, lanes: [...el.children].map(i => i.className) }; });
    assert.equal(strip.hidden, false, 'no lane strip on a motorway lesson');
    assert.equal(strip.lanes.length, 3); assert.match(strip.lanes[0], /\bon\b/); assert.match(strip.lanes[1], /\bme\b/);
    await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /Positioning – lane discipline: Stayed in the middle lane with nothing to overtake/.test(f)), show(r));
    assert.ok(!r.faults.some(f => /Mirrors|Signals/.test(f)), 'the lane change itself was done properly: ' + show(r));
    assert.ok(r.detail.some(l => /^Moved right from the left-hand to the middle lane at \d+ mph: right mirror checked, a look over the shoulder, signalled \d/.test(l)), r.detail.join('\n'));
    assert.ok(r.detail.some(l => /Out of the left-hand lane for \d+ s, \d+ s of it with nothing to overtake/.test(l)), r.detail.join('\n'));
    console.log('Lane hogging:', r.faults.map(f => f.split(':')[0]).join(', '), '| strip', JSON.stringify(strip.lanes));
  }

  // ---------- tailgating as the traffic slows ----------
  {
    await start('mw-following'); await set({ gap: 0.7, mph: 70 }); await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /^S Following distance: Drove \d+ m behind the vehicle ahead/.test(f)), show(r));
    assert.ok(r.reasons.some(l => /Under two seconds behind the car ahead for \d+ s/.test(l)), r.reasons.join('\n'));
    console.log('Tailgating:', r.faults.map(f => f.split(':')[0]).join(', ')); if (process.env.MW_DEBUG) console.log(show(r));
  }
  // ---------- following at a safe distance passes, as the traffic slows and speeds up again ----------
  {
    await start('mw-following'); await set({ gap: 2.6, mph: 70 }); await steps(400); await page.evaluate(() => { for (let i = 0; i < 4; i++) window.cambridgeDrive.frame(0.05); });
    // the lesson's instrument: the gap to the car ahead, in seconds, in the instruction box
    const reading = await page.evaluate(() => document.querySelector('#hudNext').textContent);
    assert.match(reading, /^\d\.\d s$/, 'no time-gap reading on the instruments');
    const gap = parseFloat(reading); assert.ok(gap > 2.2 && gap < 3.2, `the reading (${reading}) does not match a 2.6 s gap`);
    await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Lesson passed', show(r) + '\n' + r.reasons.join('\n'));
    assert.ok(r.reasons.some(l => /At least two seconds behind for \d+% of \d+ s of following/.test(l)), r.reasons.join('\n'));
    console.log('Safe following:', r.reasons.find(l => /At least two seconds/.test(l)), '| reading on the instruments:', reading);
  }

  // ---------- never moving over for the exit ----------
  {
    await start('mw-exit-prep', 2); await set({ mph: 64, road: true }); await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /Was still in the right-hand lane 300 yards before the exit/.test(f)), show(r));
    assert.ok(r.reasons.some(l => /carried on past the exit/.test(l)), r.reasons.join('\n'));
    console.log('Missed exit:', r.reasons.find(l => /past the exit/.test(l)));
  }

  assert.deepEqual(errors, []);
  console.log('Motorway lessons: careless driving marked for what it was, repeatably; lane strip and feedback present; safe following passes.');
} finally { await browser?.close(); server.kill(); }
