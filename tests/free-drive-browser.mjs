// Motorway free drive in a real browser (issue #6): both lane configurations, a sustained drive right round
// the circuit with memory and frame-time sampled as it goes, leaving at a junction, and pause, resume,
// restart and end after a section transition. Free drive is ungraded, so it must also never touch the
// learner's record. Writes test-results/free-drive-benchmark.json.
//   CHROMIUM_PATH=... node tests/free-drive-browser.mjs        (FREE_MINUTES=14 by default)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installAuthFixture, signedIn } from './auth-fixture.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const root = path.resolve(process.env.TEST_SITE || '.'), port = 8779, url = `http://127.0.0.1:${port}`;
const MINUTES = +(process.env.FREE_MINUTES || 14);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(url); await r.arrayBuffer(); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({ path: three + '/build/three.min.js', contentType: 'application/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', r => r.fulfill({ path: three + '/examples/js/loaders/GLTFLoader.js', contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const account = await installAuthFixture(page);
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#loadOv').hidden, {}, { timeout: 45000 }); await signedIn(page);

  const record = () => page.evaluate(() => localStorage.getItem('cambridge-learner-drive.v1'));
  const before = { local: await record(), account: JSON.stringify({ profile: account.profile, sessions: account.sessions }) };
  const start = (id) => page.evaluate(async id => { await window.cambridgeDrive.pick('free', id, true); window.cambridgeDrive.manual(true); }, id);
  // ---------- Start in the Free drive sheet starts a free drive, whatever was selected before ----------
  {
    await page.locator('[data-open=freeSheet]').first().click(); await page.locator('#freeDetail [data-start]').click();
    await page.waitForFunction(() => document.body.dataset.mode === 'drive' && window.cambridgeDrive.test?.running, {}, { timeout: 45000 });
    const s = await page.evaluate(() => ({ area: window.cambridgeDrive.area, ungraded: window.cambridgeDrive.test.ungraded }));
    assert.deepEqual(s, { area: 'm3', ungraded: true }, 'Start free drive began something else: ' + JSON.stringify(s));
    console.log('Free drive sheet: Start began the ungraded m3 drive, though the lobby had a lesson selected.');
  }
  // A steady driver: follows the lane the route is in at a set speed, and keeps a two-second gap to
  // anything ahead in that lane, as a sensible driver would.
  await page.evaluate(() => { const a = window.cambridgeDrive, p = a.player; window.__target = 30; window.__drive = a.addInput(() => {
    const t = a.test, q = a.lanePoint(Math.min(t.route.len, t.sRoute + 25)), fx = -Math.sin(p.th), fz = -Math.cos(p.th);
    let want = window.__target;
    for (const c of a.traffic.cars) { if (!c.alive) continue; const dx = c.x - p.x, dz = c.z - p.z, f = dx * fx + dz * fz;
      if (f > 0 && f < Math.max(20, p.v * 2.2) && Math.abs(dx * fz - dz * fx) < 2.2) want = Math.min(want, c.v - (f < p.v * 1.6 ? 2 : 0)); }
    let ang = Math.atan2(-(q.x - p.x), -(q.z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    return { throttle: p.v < want - 0.4 ? 1 : 0, brake: p.v > want + 1.0 ? Math.min(1, (p.v - want) / 6) : 0, steer: a.steerFor(ang, 3, p.v) }; }); });
  const frames = (n) => page.evaluate(k => { for (let i = 0; i < k; i++) window.cambridgeDrive.frame(0.05); }, n);
  const state = () => page.evaluate(() => {
    const a = window.cambridgeDrive, t = a.test, p = a.player, cars = a.traffic.cars.filter(c => c.alive);
    const wrongWay = cars.filter(c => c.e.way.cls === 'motorway' && Math.cos(c.th - Math.atan2(-c.e.px[c.e.n - 1] + c.e.px[0], -c.e.pz[c.e.n - 1] + c.e.pz[0])) < 0).length;
    return { mode: document.body.dataset.mode, running: t.running, ungraded: t.ungraded, faults: t.faults.length, off: t.offRoute, rerouted: t.rerouted, sRoute: t.sRoute, lap: t.lap, laps: a.freeStats?.laps,
      mph: Math.abs(p.v) * 2.23694, cls: t.ctx?.way.cls, lanes: t.ctx?.way.lanes, cars: cars.length, wrongWay, finite: cars.every(c => Number.isFinite(c.x) && Number.isFinite(c.z)) && Number.isFinite(p.x) };
  });

  // ---------- both lane configurations are playable ----------
  for (const id of ['m2', 'm3', 'm3-dusk']) {
    await start(id); await frames(600); // 30 s
    const s = await state(), dusk = await page.evaluate(() => ({ on: document.body.classList.contains('dusk'), button: !document.querySelector('#lightsBtn').hidden }));
    assert.deepEqual(dusk, { on: id.endsWith('dusk'), button: id.endsWith('dusk') }, `${id}: wrong time of day`);
    assert.equal(s.mode, 'drive', `${id}: the drive did not start`);
    assert.equal(s.ungraded, true, `${id}: free drive must be ungraded`);
    assert.equal(s.cls, 'motorway'); assert.equal(s.lanes, +id[1], `${id}: wrong number of lanes`);
    assert.equal(s.off, false, `${id}: left the route on a straight motorway`);
    assert.equal(s.faults, 0, `${id}: an ungraded drive recorded faults`);
    assert.ok(s.cars >= 10, `${id}: only ${s.cars} cars about`);
    assert.equal(s.wrongWay, 0, `${id}: ${s.wrongWay} cars travelling the wrong way down a carriageway`);
    assert.ok(s.finite, `${id}: a position went non-finite`);
    console.log(`${id}: ${Math.round(s.sRoute)} m in 30 s (${Math.round(s.sRoute / 30 * 2.23694)} mph average), ${s.cars} cars, all going the right way`);
  }

  // ---------- slower traffic keeps left (Rule 264): nobody sits in an outer lane with nothing to pass ----------
  {
    await start('m3'); await page.evaluate(() => { window.__target = 31; }); await frames(200);
    const hog = await page.evaluate(() => { const a = window.cambridgeDrive, out = new Map();
      for (let t = 0; t < 90; t++) { a.step(20);
        for (const c of a.traffic.cars) { if (!c.alive || c.e.way.cls !== 'motorway' || c.lane === 0) { out.delete(c); continue; }
          const fx = -Math.sin(c.th), fz = -Math.cos(c.th);
          const passing = a.traffic.cars.some(o => o !== c && o.alive && o.e === c.e && o.dir === c.dir && o.lane < c.lane && (() => { const f = (o.x - c.x) * fx + (o.z - c.z) * fz; return f > -10 && f < 120; })());
          out.set(c, passing ? 0 : (out.get(c) || 0) + 1); } }
      const worst = Math.max(0, ...out.values()), lanes = [0, 0, 0]; for (const c of a.traffic.cars) if (c.alive && c.e.way.cls === 'motorway') lanes[Math.min(2, c.lane)]++;
      return { worst, lanes }; });
    assert.ok(hog.worst <= 15, `a car sat ${hog.worst} s in an outer lane with nothing to pass`);
    console.log(`Keep left: the longest any car sat in an outer lane with nothing to pass was ${hog.worst} s; cars by lane ${hog.lanes.join(' / ')}.`);
  }

  // ---------- traffic signals what it is about to do, and some drivers make room for the learner ----------
  {
    await start('m3'); await page.evaluate(() => { window.__target = 31; }); await frames(100);
    const sig = await page.evaluate(() => { const a = window.cambridgeDrive, seen = new Map(); let changes = 0, signalled = 0, indicating = 0, flashing = 0;
      for (let t = 0; t < 1200; t++) { a.frame(0.05);
        for (const c of a.traffic.cars) { if (!c.alive || c.e.way.cls !== 'motorway') continue; const was = seen.get(c);
          if (was && was.lane !== c.lane && was.e === c.e && c.traits?.signals) { changes++; if (was.ind) signalled++; } // (the few who never signal aside)
          seen.set(c, { lane: c.lane, e: c.e, ind: c.ind });
          if (c.ind) { indicating++; const g = c.mesh.getObjectByName('indicators'); if (g && (g.userData.L.visible || g.userData.R.visible)) flashing++; } } }
      return { changes, signalled, indicating, flashing }; });
    assert.ok(sig.changes > 0, 'no traffic changed lane in a minute');
    assert.equal(sig.signalled, sig.changes, `${sig.signalled} of ${sig.changes} lane changes by drivers who signal were signalled first`);
    assert.ok(sig.flashing > 0 && sig.flashing < sig.indicating, 'indicators should flash, on and off');
    // the learner signals right with a courteous driver just behind in the next lane: it drops back
    const room = await page.evaluate(() => { const a = window.cambridgeDrive, p = a.player;
      const c = a.traffic.cars.find(c => c.alive && c.traits && c.e.way.cls === 'motorway'); if (!c) return null;
      c.traits.courtesy = true; c.traits.signals = true;
      const fx = -Math.sin(c.th), fz = -Math.cos(c.th), lx = fz, lz = -fx; // c's left
      // put the learner one lane to the car's left, 12 m ahead, at the car's speed, signalling right
      p.place(c.x + fx * 12 + lx * 3.65, c.z + fz * 12 + lz * 3.65, c.th); p.v = c.v; if (p.indicator !== 'R') p.signal('R');
      const v0 = c.v; window.__target = c.v; for (let i = 0; i < 60; i++) a.step(1);
      const r = { v0, v1: c.v, yielding: !!c.yielding }; p.signal('R'); return r; });
    assert.ok(room && room.yielding && room.v1 < room.v0 - 1.5, 'a courteous driver should drop back for a learner signalling into its lane: ' + JSON.stringify(room));
    console.log(`Signals: ${sig.signalled} of ${sig.changes} lane changes signalled first; a courteous driver dropped from ${(room.v0 * 2.237).toFixed(0)} to ${(room.v1 * 2.237).toFixed(0)} mph to let the learner in.`);
  }

  // ---------- leaving at a junction: a route back onto the circuit is built from wherever you are ----------
  {
    await start('m3'); await frames(20);
    const placed = await page.evaluate(() => {
      const a = window.cambridgeDrive, e = a.net.edges.find(x => x.way.cls === 'motorway_link' && x.len > 300 && a.net.out[x.a].some(o => o.e.way.cls === 'motorway'));
      const s = 250, i = e.cum.findIndex(c => c >= s), x = e.px[i], z = e.pz[i], dx = e.px[i + 1] - x, dz = e.pz[i + 1] - z;
      a.player.place(x, z, Math.atan2(-dx, -dz)); a.player.v = 15; return e.way.name;
    });
    await page.evaluate(() => { window.__target = 12; });
    await frames(140);
    const s = await state();
    assert.ok(s.rerouted >= 1, 'leaving the motorway did not build a route back');
    assert.ok(s.lap.start > 0, 'the rejoin route should carry a lead-in before the lap');
    // the way back keeps its own directions: the roundabout at the bottom of the slip road comes before
    // the next junction's countdown
    const dirs = await page.evaluate(() => window.cambridgeDrive.test.route.instructions.map(i => ({ s: Math.round(i.s), kind: i.kind, junction: i.junction || 0, short: i.short })));
    const rb = dirs.find(i => i.kind === 'rb'), j = dirs.find(i => i.junction);
    assert.ok(rb && j && rb.s < j.s, 'the route back lost its roundabout directions: ' + JSON.stringify(dirs.slice(0, 6)));
    await frames(300);
    const later = await state();
    assert.equal(later.off, false, 'the route back onto the circuit could not be followed');
    console.log(`Left at ${placed}: route back onto the circuit built and followed (lap starts ${Math.round(s.lap.start)} m in); directions: ${dirs.slice(0, 3).map(i => i.short).join(' → ')}.`);
  }

  // ---------- sustained drive right round the circuit: memory and frame time ----------
  // at dusk, the heavier case: the same road and traffic, plus every car's lamps, the studs and the lit junctions
  await start('m3-dusk'); await page.evaluate(() => { window.__target = 31; window.cambridgeDrive.player.headlights = true; });
  const samples = [], cycles = Math.round(MINUTES * 60 / 0.8);
  for (let c = 0; c <= cycles; c++) {
    const ft = await page.evaluate(() => { const a = window.cambridgeDrive; a.step(15); const t0 = performance.now(); a.frame(0.05); return performance.now() - t0; });
    if (c % 38 === 0) { const s = await state(), m = await page.evaluate(() => window.cambridgeDrive.perf()); samples.push({ minute: +(c * 0.8 / 60).toFixed(1), km: +(s.sRoute / 1000).toFixed(2), laps: s.laps, off: s.off, ...m, frameMs: Math.round(ft) }); }
  }
  const end = await state();
  console.log('\n minute   km  laps  chunks  geometries  textures  heapMB  frameMs');
  for (const s of samples) console.log(`${String(s.minute).padStart(7)} ${String(s.km).padStart(5)} ${String(s.laps).padStart(5)} ${String(s.chunks).padStart(7)} ${String(s.geometries).padStart(11)} ${String(s.textures).padStart(9)} ${String(s.heap ?? '-').padStart(7)} ${String(s.frameMs).padStart(8)}`);
  const half = Math.floor(samples.length / 2), first = samples.slice(1, half), second = samples.slice(half);
  const peak = (list, k) => Math.max(...list.map(s => s[k]));
  assert.ok(end.laps >= 1, `the drive never came round a full lap (${end.laps})`);
  assert.ok(samples.every(s => !s.off), 'went off the route during the sustained drive');
  assert.ok(peak(samples, 'chunks') <= 60, `scenery chunks are not being freed: ${peak(samples, 'chunks')} alive`);
  assert.ok(peak(second, 'geometries') <= peak(first, 'geometries') * 1.15 + 20, `geometry count keeps growing: ${peak(first, 'geometries')} then ${peak(second, 'geometries')}`);
  assert.equal(end.faults, 0, 'ungraded drive recorded faults'); assert.ok(end.finite);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/free-drive-benchmark.json', JSON.stringify({ minutes: MINUTES, laps: end.laps, samples }, null, 1));
  console.log(`\nSustained drive: ${MINUTES} min, ${end.laps} lap(s), chunks peaked at ${peak(samples, 'chunks')}, geometries ${peak(first, 'geometries')} → ${peak(second, 'geometries')} (first half → second half).`);

  // ---------- pause, resume, restart and end, after the lap has rolled over ----------
  await page.locator('#pauseBtn').click();
  assert.equal((await state()).running, false, 'pause did not stop the drive');
  await page.locator('#resumeBtn').click();
  assert.equal((await state()).running, true, 'resume did not restart the drive');
  await frames(40); const goingOn = await state(); assert.equal(goingOn.off, false);
  await page.locator('#pauseBtn').click(); await page.locator('#restartBtn').click(); await frames(20);
  const restarted = await state();
  assert.ok(restarted.running && restarted.sRoute < 200 && restarted.laps === 0, 'restart did not begin a fresh drive');
  await frames(200);
  await page.locator('#pauseBtn').click(); await page.locator('#quitBtn').click();
  const summary = await page.evaluate(() => ({ shown: !document.querySelector('#resultSheet').hidden, verdict: document.querySelector('#verdict').textContent, lines: [...document.querySelectorAll('#rReasons li')].map(l => l.textContent), next: !document.querySelector('#nextBtn').hidden }));
  assert.equal(summary.shown, true, 'ending a free drive showed no summary');
  assert.match(summary.verdict, /miles driven/);
  assert.ok(summary.lines.some(l => /averaging \d+ mph/.test(l)) && summary.lines.some(l => /Longest stretch at or under the limit/.test(l)), JSON.stringify(summary.lines));
  console.log('Summary:', summary.verdict, '|', summary.lines.join(' | '));

  // ---------- nothing was written to the learner's record ----------
  const after = { local: await record(), account: JSON.stringify({ profile: account.profile, sessions: account.sessions }) };
  assert.equal(after.account, before.account, 'free drive wrote to the account');
  assert.equal(after.local, before.local, 'free drive wrote to the stored learner record');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Free drive: both lane layouts and the dusk circuit, a full lap with bounded memory, leaving and rejoining, pause/resume/restart/end, and no record written.');
} finally { await browser?.close(); server.kill(); }
