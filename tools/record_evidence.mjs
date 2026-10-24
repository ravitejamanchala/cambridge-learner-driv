// Records short real-time videos of a feature working, as evidence for its pull request, and writes an
// index beside them.
//   node tools/record_evidence.mjs motorway          (one group; see GROUPS below)
// The simulation is stepped by hand at a fixed 20 frames a second and every frame is captured, so the
// clips play at true speed however slowly the software renderer draws. Needs Chromium and ffmpeg.
// Uses the offline sign-in fixture, so no account and no network are involved.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { installAuthFixture, signedIn } from '../tests/auth-fixture.mjs';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const FPS = 20, DT = 1 / FPS, VIEW = { width: 960, height: 540 };
const port = 8794, url = `http://127.0.0.1:${port}`;

// ---------- in-page helpers ----------
// A steady driver: holds the route's lane at window.__target m/s and a two-second gap to whatever is
// ahead in that lane. With window.__path set it follows that polyline instead (to take an exit).
const installDriver = (page) => page.evaluate(() => {
  const a = window.cambridgeDrive, p = a.player; window.__target = 30; window.__path = null;
  const aim = () => {
    const pts = window.__path; if (!pts) return a.lanePoint(Math.min(a.test.route.len, a.test.sRoute + 25));
    let best = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - p.x, pts[i].z - p.z); if (d < bd) { bd = d; best = i; } }
    let k = best, run = 0; while (k < pts.length - 1 && run < 22) { run += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z); k++; }
    return pts[k];
  };
  a.addInput(() => {
    const q = aim(), fx = -Math.sin(p.th), fz = -Math.cos(p.th);
    let want = window.__target;
    for (const c of a.traffic.cars) { if (!c.alive) continue; const dx = c.x - p.x, dz = c.z - p.z, f = dx * fx + dz * fz;
      if (f > 0 && f < Math.max(20, p.v * 2.2) && Math.abs(dx * fz - dz * fx) < 2.2) want = Math.min(want, c.v - (f < p.v * 1.6 ? 2 : 0)); }
    let ang = Math.atan2(-(q.x - p.x), -(q.z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    return { throttle: p.v < want - 0.4 ? 1 : 0, brake: p.v > want + 1.0 ? Math.min(1, (p.v - want) / 6) : 0, steer: Math.max(-1, Math.min(1, ang * 3)) };
  });
});
// The Bot lab's own reference driver (js/bots.js), the one test:bots runs every lesson with, driving here
// in the open application instead of the lab.
const installBot = (page, lesson) => page.addScriptTag({ type: 'module', content: `
  import { makeDriver } from '/js/bots.js';
  const a = window.cambridgeDrive, lesson = ${JSON.stringify(lesson)};
  const drive = makeDriver({ get A() { return { test: a.test, traffic: a.traffic, net: a.net }; }, player: a.player, lesson: () => lesson,
    scenarioStatus: () => null, scenarioPhase: () => null, estopBanner: () => false, operate: () => {}, gear: () => {}, lanePoint: (s) => a.lanePoint(s),
    look: (view = 'all-round') => { a.player.lookAt = a.traffic.clock; a.player.observations.push({ view, at: a.traffic.clock, x: a.player.x, z: a.player.z }); } });
  a.addInput(() => drive()); window.__botReady = true;` }).then(() => page.waitForFunction(() => window.__botReady));
// The browser check's scriptable driver (tests/motorway-lessons-browser.mjs): the route's line offset by
// window.__mw.lane lanes, moving across at half a lane a second towards .want, at .mph. It looks and
// signals only when told to, which is how the careless drives are made.
const installScripted = (page) => page.evaluate(() => {
  const a = window.cambridgeDrive, p = a.player; window.__mw = { lane: 0, want: 0, mph: 60 };
  a.addInput(() => { const M = window.__mw, t = a.test; if (!t.running) return null;
    M.lane += Math.sign(M.want - M.lane) * Math.min(Math.abs(M.want - M.lane), 0.025);
    const q = a.lanePoint(Math.min(t.route.len, t.sRoute + 25)), off = M.lane * 3.65, x = q.x - q.tz * off, z = q.z + q.tx * off, want = M.mph * 0.44704;
    let ang = Math.atan2(-(x - p.x), -(z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    return { throttle: p.v < want - 0.3 ? 1 : 0, brake: p.v > want + 0.6 ? Math.min(1, (p.v - want) / 4) : 0, steer: Math.max(-1, Math.min(1, ang * 2)) }; });
});
// run the simulation without drawing until the predicate (a function source run in the page) holds
const ffUntil = (page, pred, maxSeconds = 600) => page.evaluate(([src, max]) => { const f = new Function('a', 'return (' + src + ')(a)'), a = window.cambridgeDrive;
  for (let i = 0; i < max * 20; i += 10) { if (f(a)) return true; a.step(10); } return false; }, [pred.toString(), maxSeconds]);
const fw = `(a, c) => { const p = a.player; return (c.x - p.x) * -Math.sin(p.th) + (c.z - p.z) * -Math.cos(p.th); }`;
const startDrive = (page, kind, id) => page.evaluate(async ([k, i]) => { const a = window.cambridgeDrive; a.manual(true); await a.pick(k, i, true); a.manual(true); }, [kind, id]);
const camera = (page, n) => page.evaluate(n => window.cambridgeDrive.setCam(n), n);
// put the car on the route, s metres in, at speed v
const placeOnRoute = (page, s, v) => page.evaluate(([s, v]) => {
  const a = window.cambridgeDrive, t = a.test, r = t.route; let i = 0; while (i < r.cum.length - 2 && r.cum[i + 1] < s) i++;
  const q = a.lanePoint(s), dx = r.xs[i + 1] - r.xs[i], dz = r.zs[i + 1] - r.zs[i];
  a.player.place(q.x, q.z, Math.atan2(-dx, -dz)); a.player.v = v; t.snapProgress(3000); a.step(1);
}, [s, v]);
// the first exit slip off the route's carriageway at least `after` metres in: where it leaves, and its line
const nextExit = (page, after) => page.evaluate(after => {
  const a = window.cambridgeDrive, r = a.test.route, net = a.net; let best = null;
  for (const e of net.edges) {
    if (e.way.cls !== 'motorway_link' || !net.out[e.a].some(o => o.e.way.cls === 'motorway')) continue;
    for (let i = 0; i < r.xs.length; i++) if (r.cum[i] > after && Math.hypot(r.xs[i] - e.px[0], r.zs[i] - e.pz[0]) < 2) {
      if (!best || r.cum[i] < best.s) best = { s: r.cum[i], name: e.way.name, path: Array.from(e.px, (x, k) => ({ x, z: e.pz[k] })) }; break; }
  }
  return best;
}, after);

// ---------- recording ----------
async function clip(page, dir, name, seconds, script, speed = 1) {
  const file = path.join(dir, name + '.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  const frames = Math.round(seconds * FPS);
  // a second off camera first, so a clip never opens on scenery that is still being built round the car
  await page.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) window.cambridgeDrive.frame(dt); }, [DT, FPS]); await page.waitForTimeout(300);
  for (let f = 0; f < frames; f++) {
    await script?.(f / FPS, f);
    await page.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) window.cambridgeDrive.frame(dt); }, [DT, speed]);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 82 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await done;
  const mb = (fs.statSync(file).size / 1048576).toFixed(1);
  console.log(`  ${file}  ${seconds} s  ${mb} MB`);
  return { file: path.basename(file), seconds, mb };
}
const once = (fn) => { let done = false; return async (...a) => { if (!done) { done = true; await fn(...a); } }; };
const at = (t, s, fn) => t >= s ? fn() : null;

// ---------- what to record ----------
const GROUPS = {
  motorway: {
    dir: 'docs/evidence/6-motorway-free-drive',
    title: 'Motorway worlds and free drive (issue #6)',
    clips: [
      { name: '01-three-lanes-chase-and-driver', caption: 'Three lanes each way: central reservation and barrier, hard shoulder, 2 m / 7 m lane lines, traffic keeping to its lanes. Chase view, then the driver\'s view.',
        seconds: 22, async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 31; }); await camera(p, 0); },
        script: (p) => { const toDriver = once(() => camera(p, 1)); return t => at(t, 13, toDriver); } },
      { name: '02-two-lanes', caption: 'The two-lane world: same circuit, narrower carriageways, the cruise held at 70 mph.',
        seconds: 14, async setup(p) { await startDrive(p, 'free', 'm2'); await p.evaluate(() => { window.__target = 31; }); await camera(p, 0); } },
      { name: '03-passing-a-junction', caption: 'Passing a junction: the blue junction sign with its number and destination, the broken edge line along the deceleration lane, and the instruction box counting down to the next junction. The car carries on by.',
        seconds: 24, async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 31; }); const j = await nextExit(p, 900); await placeOnRoute(p, j.s - 520, 31); await camera(p, 1); } },
      { name: '04-leave-at-a-junction-and-rejoin', caption: 'Leaving at a junction instead: off down the slip road, slowing for the roundabout, and a route back onto the circuit built from wherever the car is. Free drive never calls this off-route.',
        seconds: 48, async setup(p, ctx) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 31; }); ctx.j = await nextExit(p, 900); await placeOnRoute(p, ctx.j.s - 330, 31); await camera(p, 0); },
        script: (p, ctx) => async () => {
          const s = await p.evaluate(() => ({ s: window.cambridgeDrive.test.sRoute, r: window.cambridgeDrive.test.rerouted, path: !!window.__path }));
          if (!s.path && !ctx.took && s.s > ctx.j.s - 4) { ctx.took = true; ctx.r0 = s.r; await p.evaluate(path => { window.__path = path; window.__target = 22; }, ctx.j.path); }
          if (s.path && s.r > ctx.r0) await p.evaluate(() => { window.__path = null; window.__target = 13; });
        } },
      { name: '05-pause-resume-and-end-of-drive-summary', caption: 'Pause and resume after the lap has rolled over, then End drive: a summary of the session that says plainly nothing was added to the record.',
        seconds: 22, async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 31; const a = window.cambridgeDrive; a.step(20 * 60 * 3); }); await camera(p, 0); },
        script: (p) => { const pause = once(() => p.locator('#pauseBtn').click()), resume = once(() => p.locator('#resumeBtn').click()), pause2 = once(() => p.locator('#pauseBtn').click()), end = once(() => p.locator('#quitBtn').click());
          return async t => { await at(t, 7, pause); await at(t, 9.5, resume); await at(t, 14, pause2); await at(t, 15.5, end); }; } },
    ],
  },
};

GROUPS.lanes = {
  dir: 'docs/evidence/7-motorway-lane-discipline',
  title: 'Motorway lane discipline, overtaking and following (issue #7)',
  driverNote: 'The careful drives use the Bot lab\'s reference driver (`js/bots.js`, the one `npm run test:bots` checks every lesson with); the careless one uses the scriptable driver from `npm run test:motorway`.',
  clips: [
    { name: '01-overtake-and-move-back', driver: 'bot', lesson: { id: 'mw-keep-left', scenario: 'motorway' }, seconds: 45,
      caption: 'Keep left, overtake, move back (three lanes). Once the faster car in the middle lane has gone by, catching a slower vehicle: right mirror and a look over the shoulder, signal, out into a clear lane, past, and back to the left once the vehicle passed is more than two seconds behind. The lane strip by the instruction box shows the lanes that are right for you (amber) and the one you are in (marked underneath).',
      // from just after the faster car in the middle lane has gone by (the driver rightly waits for it)
      async setup(p) { await startDrive(p, 'lesson', 'mw-keep-left'); await camera(p, 0); await ffUntil(p, `a => a.traffic.cars.some(c => c.alive && c.lane === 1 && (${fw})(a, c) > 5)`); } },
    { name: '02-waiting-for-a-safe-gap', driver: 'bot', lesson: { id: 'mw-busy-lane', scenario: 'motorway' }, seconds: 52,
      caption: 'Overtaking when the next lane is busy (two lanes). A lorry ahead and a stream of faster cars passing on the right: the driver drops back to two seconds behind the lorry and waits, then goes once the stream has passed and the next car is far enough back that nobody has to brake.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-busy-lane'); await camera(p, 0); } },
    { name: '03-following-as-traffic-slows', driver: 'bot', lesson: { id: 'mw-following', scenario: 'motorway' }, seconds: 45,
      caption: 'Following distance at 70. The traffic in every lane slows from 60 to about 42 mph and speeds up again; the driver stays at least two seconds behind the car ahead the whole way and does not dive into the next lane, which is moving no faster.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-following'); await camera(p, 0); await ffUntil(p, 'a => a.traffic.clock > 15', 30); } },
    { name: '04-across-three-lanes-for-an-exit', driver: 'bot', lesson: { id: 'mw-exit-prep', scenario: 'motorway' }, seconds: 40, speed: 2,
      caption: 'Getting into lane for your exit. From the right-hand lane with traffic in the other two: one lane at a time, settling in each, easing off to drop into a gap rather than forcing one, in the left-hand lane well before the 300-yard point, then off along the slip road. The instruction box counts down to J2 · Ashwell.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-exit-prep'); await camera(p, 0); } },
    { name: '05-careless-pull-out-and-what-it-is-marked-for', driver: 'scripted', seconds: 20,
      caption: 'The careless version of clip 2: straight out without a mirror check or a signal, just as the first of the faster cars arrives. Then the result, with every fault named for what it was, and the lane change itemised in the feedback.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-busy-lane'); await camera(p, 0); await p.evaluate(() => { window.__mw.mph = 55; });
        await ffUntil(p, `a => a.traffic.cars.some(c => c.alive && c.lane === 1 && (${fw})(a, c) > -24 && (${fw})(a, c) < -14)`, 60); },
      script: (p) => { const go = once(() => p.evaluate(() => Object.assign(window.__mw, { want: 1, mph: 60 })));
        const end = once(() => p.evaluate(() => { const a = window.cambridgeDrive; window.__mw.want = 0; for (let i = 0; i < 4000 && !a.test.done; i++) a.step(1); }));
        return async t => { await at(t, 1, go); await at(t, 11, end); }; } },
    { name: '06-feedback-after-a-careful-run', driver: 'bot', lesson: { id: 'mw-keep-left', scenario: 'motorway' }, seconds: 8,
      caption: 'The result after the careful run of clip 1: passed, nothing marked, and the feedback itemises each lane change with what was checked first and the gap it was made into, how long was spent out of the left-hand lane and why.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-keep-left'); await ffUntil(p, 'a => a.test.done', 400); } },
  ],
};
const group = GROUPS[process.argv[2]];
if (!group) { console.error(`usage: node tools/record_evidence.mjs <${Object.keys(GROUPS).join('|')}>`); process.exit(2); }
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '.'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(url); await r.arrayBuffer(); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(group.dir, { recursive: true });
  const made = [];
  for (const c of group.clips) {
    if (process.argv[3] && !c.name.includes(process.argv[3])) continue;
    // a fresh page per clip, so one clip's state never leaks into the next
    const page = await browser.newPage({ viewport: VIEW }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({ path: three + '/build/three.min.js', contentType: 'application/javascript' }));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', r => r.fulfill({ path: three + '/examples/js/loaders/GLTFLoader.js', contentType: 'application/javascript' }));
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await installAuthFixture(page);
    await page.goto(url); await page.waitForFunction(() => document.querySelector('#loadOv')?.hidden, {}, { timeout: 45000 }); await signedIn(page);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(5000); // let the car models arrive, so nothing on the road is still a box
    if (c.driver === 'bot') await installBot(page, c.lesson); else if (c.driver === 'scripted') await installScripted(page); else await installDriver(page);
    const ctx = {};
    await c.setup(page, ctx);
    made.push({ ...c, ...(await clip(page, group.dir, c.name, c.seconds, c.script?.(page, ctx), c.speed || 1)) });
    if (errors.length) throw new Error(`${c.name}: ${errors.join('; ')}`);
    await page.close();
  }
  if (!process.argv[3]) {
    const lines = [`# ${group.title}`, '', `Recorded with \`node tools/record_evidence.mjs ${process.argv[2]}\` on ${new Date().toISOString().slice(0, 10)}: the real application,`,
      `stepped at ${FPS} frames a second and captured frame by frame, so each clip plays at true speed unless it says otherwise.`,
      group.driverNote || 'The car is driven by the same steady driver the browser checks use.', ''];
    for (const m of made) lines.push(`## ${m.name.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}`, '', m.caption, '',
      `[${m.file}](${m.file}) · ${m.seconds} s${m.speed > 1 ? ` (${m.seconds * m.speed} s of driving at ${m.speed}× speed)` : ''} · ${m.mb} MB`, '');
    fs.writeFileSync(path.join(group.dir, 'README.md'), lines.join('\n'));
  }
} finally { await browser?.close(); server.kill(); }
