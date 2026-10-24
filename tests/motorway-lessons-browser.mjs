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
import { installMwDriver } from './mw-driver.mjs';

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

  const { start, steps, look, signal, set, untilDone, outcome, laneClear, joinerNear, joinersIn, fasterJustBehind, exitIn } = await installMwDriver(page);
  const show = (r) => r.faults.join('\n  ');

  // ---------- pulling straight out into busy traffic, with no look and no signal ----------
  const rushed = async () => {
    // the moment the first of the faster cars is just behind on the right: straight out, no look, no signal
    await start('mw-busy-lane'); await set({ mph: 55 });
    for (let i = 0; i < 200 && !(await fasterJustBehind()); i++) await steps(2);
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

  // ---------- traffic joining beside you (issue #8): every safe response passes ----------
  const responses = {};
  for (const how of ['kept', 'eased', 'moved']) {
    await start('mw-merging'); await set({ mph: 60 }); await steps(10); // the lesson places its traffic on the first step
    if (how === 'eased') { for (let i = 0; i < 300 && !(await joinerNear()); i++) await steps(5); await set({ mph: 47 }); await steps(20 * 9); await set({ mph: 60 }); }
    if (how === 'moved') {
      // wait for the car alongside in the middle lane to get clear, then mirror, shoulder, signal, over
      for (let i = 0; i < 400 && !(await laneClear(1, 60, 30)); i++) await steps(5);
      await look('right'); await look('blindspot'); await signal('R'); await steps(40); await set({ want: 1 }); await steps(70); await signal('R');
      // once the joiners are in and the left-hand lane is clear around you, back left the same way
      for (let i = 0; i < 600 && !((await joinersIn()) && (await laneClear(0, 50, 80))); i++) await steps(5); // two seconds and more behind
      await look('left'); await look('left-blindspot'); await signal('L'); await steps(40); await set({ want: 0 }); await steps(70); await signal('L');
    }
    await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Lesson passed', `${how}: ${show(r)}\n${r.reasons.join('\n')}`);
    assert.ok(!r.faults.length, `${how}: ${show(r)}`);
    responses[how] = r.reasons.find(l => /Traffic joined from the slip road/.test(l)) || '';
    assert.ok(responses[how], `${how}: nobody joined: ${r.reasons.join(' | ')}`);
    if (how !== 'kept') assert.match(responses[how], how === 'eased' ? /you eased off/ : /you moved over/);
    else assert.match(responses[how], /you kept your lane and speed/);
    assert.equal(await page.evaluate(() => window.cambridgeDrive.test.hits.length), 0, `${how}: a joining vehicle ran into you`);
  }
  console.log('Joining beside you, three safe answers all pass:\n ', Object.entries(responses).map(([k, v]) => `${k}: ${v}`).join('\n  '));
  // moving over into the occupied middle lane "to let them in" is not cooperation, it is a conflict
  {
    await start('mw-merging'); await set({ mph: 60 }); await steps(20);
    await look('right'); await look('blindspot'); await signal('R'); await steps(30); await set({ want: 1 }); await steps(200);
    await set({ want: 0 }); await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    // the car in the middle lane is either still alongside or just ahead as you cross the line
    assert.ok(r.faults.some(f => /Moved right into a lane with a vehicle alongside you|Moved into the lane only [\d.]+ s behind the vehicle ahead|Moved right into too small a gap/.test(f)), show(r));
    console.log('Moving over into an occupied lane:', r.faults.map(f => f.split(':')[0]).join(', '));
  }
  // ---------- joining from the slip road: blind, without a look or a signal ----------
  {
    await start('mw-join'); await set({ mph: 62 }); await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /Mirrors – change direction: Joined the motorway without checking the right mirror first/.test(f)), show(r));
    assert.ok(r.faults.some(f => /Signals – necessary: Joined the motorway without signalling right/.test(f)), show(r));
    assert.ok(r.detail.some(l => /^Joined the motorway at \d+ mph/.test(l)), r.detail.join('\n'));
    console.log('Joining blind:', r.faults.map(f => f.split(':')[0]).join(', '));
  }
  // ---------- joining right beside a car in the left-hand lane: an unsafe gap, detected ----------
  {
    await start('mw-join'); await set({ mph: 60, shadow: true }); await steps(10);
    await look('right'); await look('blindspot'); await signal('R'); await untilDone(); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /^S Mirrors – change direction: Joined the motorway with a vehicle alongside you|Joined the motorway into too small a gap/.test(f)), show(r));
    console.log('Joining beside a car:', r.faults.map(f => f.split(':').slice(0, 2).join(':')).join(' | '));
  }

  // ---------- leaving the motorway (issue #9): the signs, and a careless exit ----------
  {
    await start('mw-exit'); await steps(10);
    const signs = await page.evaluate(() => { const a = window.cambridgeDrive; let built = 0; a.camera.parent.traverse(o => { if (o.userData.motorwaySign) built++; });
      const j3 = a.net.mwSigns.filter(s => s.j === 3).map(s => s.kind + ':' + s.before); return { built, j3 }; });
    assert.equal(signs.built, 4 * 2 * 6, 'every exit on both carriageways should have six signs built in the scene');
    for (const k of ['advance:1609', 'advance:805', 'count:274', 'count:183', 'count:91', 'exit:30']) assert.ok(signs.j3.includes(k), `junction 3 is missing its ${k} sign`);
    await page.evaluate(() => { for (let i = 0; i < 4; i++) window.cambridgeDrive.frame(0.05); });
    assert.equal(await page.evaluate(() => document.querySelector('#hudDist').textContent), 'J3 · Kingsmere', 'the instruction box should count down to the junction');
    // no mirror, no signal, brakes hard on the motorway at the 300-yard marker, then takes the slip road's bend fast
    await set({ mph: 64, gap: 2.5 }); for (let i = 0; i < 400 && (await exitIn()) > 270; i++) await steps(5);
    await set({ mph: 25 }); for (let i = 0; i < 200 && (await exitIn()) > 0; i++) await steps(5); await set({ mph: 75, gap: null });
    // this driver never gives way at the roundabout at the end, so finish the drive once past the bend
    for (let i = 0; i < 400 && (await exitIn()) > -(220 + 420); i++) await steps(5);
    await page.evaluate(() => window.cambridgeDrive.test.finish()); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    for (const re of [/Signals – necessary: Left the motorway without signalling left/, /Mirrors – change direction: Left the motorway without checking the left mirror/, /Use of speed: Slowed by \d+ mph on the motorway before the slip road/, /Use of speed: Took the bend on the slip road at \d+ mph: it suits about \d+ mph/])
      assert.ok(r.faults.some(f => re.test(f)), `${re}: ${show(r)}`);
    console.log('Careless exit:', r.faults.map(f => f.split(': ').slice(0, 2).join(': ')).join(' | '));
  }
  // ---------- stopping, and reversing, on the motorway ----------
  for (const how of ['stop', 'reverse']) {
    await start('mw-exit'); await steps(200); await set({ mph: 0 }); await steps(200);
    if (how === 'reverse') { await set({ reverse: true }); await steps(60); await set({ reverse: false }); }
    const f = await page.evaluate(() => window.cambridgeDrive.test.faults.map(f => `${f.kind} ${f.text}`));
    assert.ok(f.some(x => how === 'stop' ? /^S Stopped on the motorway/.test(x) : /^S Reversed on the motorway/.test(x)), `${how}: ${f.join(' | ')}`);
    console.log(`${how === 'stop' ? 'Stopping' : 'Reversing'} on the motorway:`, f.find(x => /Stopped|Reversed/.test(x) && (how === 'stop' ? /Stopped/ : /Reversed/).test(x)));
  }
  // ---------- if you miss your exit: carrying on passes, cutting across the hatching does not ----------
  {
    await start('mw-missed-exit', 1); await set({ mph: 58, road: true });
    let next = '';
    for (let i = 0; i < 600 && !(await page.evaluate(() => window.cambridgeDrive.test.done)); i++) { await steps(10);
      if (!next) next = await page.evaluate(() => { const t = window.cambridgeDrive.test, i = t.route.instructions.find(x => x.junction && !x.final); return i && /missed/.test(i.text) ? `J${i.junction} · ${i.to}` : ''; }); }
    const r = await outcome();
    assert.equal(r.verdict, 'Lesson passed', show(r) + '\n' + r.reasons.join('\n'));
    assert.ok(r.reasons.some(l => /let the exit go and carried on: exactly right/.test(l)), r.reasons.join('\n'));
    assert.equal(next, 'J4 · Harlow Cross', 'after the missed exit the instruction should point on to the next junction');
    console.log('Missed exit, carried on:', r.reasons.find(l => /carried on/.test(l)), '| then:', next);
  }
  {
    await start('mw-missed-exit', 1); await set({ mph: 58, road: true });
    for (let i = 0; i < 600 && (await exitIn()) > -120; i++) await steps(5);
    await look('left'); await signal('L'); await set({ road: false, want: 0, lane: 1 });
    for (let i = 0; i < 400 && (await exitIn()) > -330; i++) await steps(5);
    await page.evaluate(() => window.cambridgeDrive.test.finish()); const r = await outcome();
    assert.equal(r.verdict, 'Not yet', show(r));
    assert.ok(r.faults.some(f => /^S Response to road markings: Crossed the hatched area to reach the slip road/.test(f)), show(r));
    console.log('Cutting across the hatching:', r.faults.filter(f => /^S/.test(f)).map(f => f.split(': ').slice(1).join(': ').slice(0, 60)).join(' | '));
  }

  assert.deepEqual(errors, []);
  console.log('Motorway lessons: careless driving marked for what it was, repeatably; lane strip and feedback present; safe following passes; every safe answer to joining traffic passes; exits signed, careless exits and recovery marked, a missed exit carried on safely passes.');
} finally { await browser?.close(); server.kill(); }
