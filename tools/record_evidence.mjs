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
import { installMwDriver } from '../tests/mw-driver.mjs';

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
    // window.__lat moves the aim that many lanes to the right of the route's lane (a lane change)
    let q = aim(); const off = (window.__lat || 0) * 3.65; if (off && q.tx != null) q = { x: q.x - q.tz * off, z: q.z + q.tx * off };
    const fx = -Math.sin(p.th), fz = -Math.cos(p.th);
    let want = window.__target;
    for (const c of a.traffic.cars) { if (!c.alive) continue; const dx = c.x - p.x, dz = c.z - p.z, f = dx * fx + dz * fz;
      if (f > 0 && f < Math.max(20, p.v * 2.2) && Math.abs(dx * fz - dz * fx) < 2.2) want = Math.min(want, c.v - (f < p.v * 1.6 ? 2 : 0)); }
    let ang = Math.atan2(-(q.x - p.x), -(q.z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    return { throttle: p.v < want - 0.4 ? 1 : 0, brake: p.v > want + 1.0 ? Math.min(1, (p.v - want) / 6) : 0, steer: a.steerFor(ang, 3, p.v) };
  });
});
// The Bot lab's own reference driver (js/bots.js), the one test:bots runs every lesson with, driving here
// in the open application instead of the lab.
const installBot = (page, lesson, human = null) => page.addScriptTag({ type: 'module', content: `
  import { makeDriver, humanize } from '/js/bots.js';
  const a = window.cambridgeDrive, lesson = ${JSON.stringify(lesson)};
  const drive = makeDriver({ get A() { return { test: a.test, traffic: a.traffic, net: a.net }; }, player: a.player, lesson: () => lesson,
    scenarioStatus: () => null, scenarioPhase: () => null, estopBanner: () => false, operate: () => {}, gear: () => {}, lanePoint: (s) => a.lanePoint(s),
    look: (view = 'all-round') => { a.player.lookAt = a.traffic.clock; a.player.observations.push({ view, at: a.traffic.clock, x: a.player.x, z: a.player.z }); } });
  const human = ${JSON.stringify(human)}, d = human ? humanize(drive, { device: human, clock: () => a.traffic.clock, speed: () => a.player.v }) : drive;
  a.addInput(() => d()); window.__botReady = true;` }).then(() => page.waitForFunction(() => window.__botReady));
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
GROUPS.joining = {
  dir: 'docs/evidence/8-motorway-joining',
  title: 'Joining the motorway, and traffic joining beside you (issue #8)',
  driverNote: 'The careful join uses the Bot lab\'s reference driver (`js/bots.js`); the other clips use the scriptable driver that `npm run test:motorway` drives these lessons with (`tests/mw-driver.mjs`), making the same three safe choices and the one unsafe one the checks make.',
  clips: [
    { name: '01-joining-the-motorway', driver: 'bot', lesson: { id: 'mw-join', scenario: 'motorway' }, seconds: 48,
      caption: 'Joining from the slip road (Rule 259). The driver builds up speed, looks right in the mirror and over its shoulder, signals, and matches the speed of a gap in the left-hand lane to drop into it. Nobody on the motorway brakes or moves over: traffic already on the motorway has priority.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-join'); await camera(p, 0); } },
    { name: '02-traffic-joining-keep-your-lane', driver: 'scripted', seconds: 40,
      caption: 'Traffic joining beside you, answer one: keep your lane and your speed. The two vehicles on the slip road give way, as Rule 259 says they must, and fit in behind. The lesson passes.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-merging'); await camera(p, 0); await ctx.d.set({ mph: 60 }); await ctx.d.steps(10); } },
    { name: '03-traffic-joining-ease-off', driver: 'scripted', seconds: 42,
      caption: 'Answer two: ease off a little as they arrive, to make room, then back up to speed. Also passes.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-merging'); await camera(p, 0); await ctx.d.set({ mph: 60 }); await ctx.d.steps(10); },
      script: (p, ctx) => async (t) => { if (!ctx.eased && await ctx.d.joinerNear()) { ctx.eased = t; await ctx.d.set({ mph: 47 }); } if (ctx.eased && !ctx.back && t > ctx.eased + 9) { ctx.back = true; await ctx.d.set({ mph: 60 }); } } },
    { name: '04-traffic-joining-move-over', driver: 'scripted', seconds: 50,
      caption: 'Answer three: once the car alongside in the middle lane has drawn ahead, mirror, shoulder and signal, move over to leave the left-hand lane free, then back left the same way once the joiners are in and two seconds behind. Also passes; being in the middle lane while traffic comes down the slip road is courtesy, not hogging.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-merging'); await camera(p, 0); await ctx.d.set({ mph: 60 }); await ctx.d.steps(10); },
      script: (p, ctx) => async (t) => { const d = ctx.d;
        if (!ctx.out && await d.laneClear(1, 60, 30)) { ctx.out = t; await d.look('right'); await d.look('blindspot'); await d.signal('R'); }
        if (ctx.out && !ctx.over && t > ctx.out + 2) { ctx.over = t; await d.set({ want: 1 }); }
        if (ctx.over && !ctx.cancel && t > ctx.over + 3.5) { ctx.cancel = true; await d.signal('R'); }
        if (ctx.cancel && !ctx.back && await d.joinersIn() && await d.laneClear(0, 50, 80)) { ctx.back = t; await d.look('left'); await d.look('left-blindspot'); await d.signal('L'); }
        if (ctx.back && !ctx.left && t > ctx.back + 2) { ctx.left = t; await d.set({ want: 0 }); }
        if (ctx.left && !ctx.done && t > ctx.left + 3.5) { ctx.done = true; await d.signal('L'); } } },
    { name: '05-joining-beside-a-car-and-what-it-is-marked-for', driver: 'scripted', seconds: 34,
      caption: 'The unsafe join: matching speed with a car in the left-hand lane and running down the slip road into it. Marked as a serious fault (a vehicle alongside), with the result naming it.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-join'); await camera(p, 0); await ctx.d.set({ mph: 60, shadow: true }); await ctx.d.steps(10); await ctx.d.look('right'); await ctx.d.look('blindspot'); await ctx.d.signal('R');
        await ffUntil(p, 'a => a.test.ctx && a.test.ctx.way.cls === "motorway_link" && a.test.ctx.e.len - a.test.ctx.s < 300', 120); },
      script: (p) => { const end = once(() => p.evaluate(() => { const a = window.cambridgeDrive; for (let i = 0; i < 4000 && !a.test.done; i++) a.step(1); }));
        return async t => { await at(t, 24, end); }; } },
  ],
};
const exitIn = (d) => `a => { const t = a.test, R = t.route, k = R.steps.findIndex(x => x.e.way.cls === 'motorway_link'); return k > 0 && R.stepS[k] - t.sRoute < ${d}; }`;
GROUPS.exits = {
  dir: 'docs/evidence/9-motorway-exits',
  title: 'Leaving the motorway, and missing your exit (issue #9)',
  driverNote: 'The careful drives use the Bot lab\'s reference driver (`js/bots.js`); the careless ones use the scriptable driver from `npm run test:motorway` (`tests/mw-driver.mjs`), making the same mistakes the checks make.',
  clips: [
    { name: '01-the-advance-signs', driver: 'bot', lesson: { id: 'mw-exit', scenario: 'motorway' }, seconds: 36,
      caption: 'Approaching junction 3 from the driver\'s seat: the blue advance direction signs at 1 mile and ½ mile, with the junction number, the destination and the distance; the instruction box counts down to J3 · Kingsmere.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-exit'); await camera(p, 1); await ffUntil(p, exitIn(1760)); } },
    { name: '02-countdown-markers-and-leaving', driver: 'bot', lesson: { id: 'mw-exit', scenario: 'motorway' }, seconds: 30,
      caption: 'The countdown markers at 300, 200 and 100 yards (three, two and one bars), the final direction sign, and leaving: mirror and signal by the first marker, the speed of the traffic kept until on the slip road, then slowing on it for the bend and the roundabout.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-exit'); await camera(p, 1); await ffUntil(p, exitIn(430)); } },
    { name: '03-the-whole-exit', driver: 'bot', lesson: { id: 'mw-exit', scenario: 'motorway' }, seconds: 50, speed: 2,
      caption: 'The whole exit from the chase view, at twice real speed: the signs going by, into the slip road, a gentle bend at a speed that suits it, giving way at the roundabout, and away along the A301 to pull up.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-exit'); await camera(p, 0); await ffUntil(p, exitIn(700)); } },
    { name: '04-a-careless-exit-and-what-it-is-marked-for', driver: 'scripted', seconds: 30,
      caption: 'The careless version: no mirror and no signal, braking hard on the motorway at the 300-yard marker, then into the slip road\'s bend far too fast. The result names each one.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-exit'); await camera(p, 0); await ctx.d.set({ mph: 64, gap: 2.5 }); await ffUntil(p, exitIn(330)); },
      script: (p, ctx) => async (t) => { const d = ctx.d, e = await d.exitIn();
        if (!ctx.brake && e != null && e < 270) { ctx.brake = true; await d.set({ mph: 25 }); }
        if (ctx.brake && !ctx.fast && e != null && e < 0) { ctx.fast = true; await d.set({ mph: 75, gap: null }); }
        if (ctx.fast && !ctx.end && (e == null || e < -640)) { ctx.end = true; await p.evaluate(() => window.cambridgeDrive.test.finish()); } } },
    { name: '05-missing-your-exit', driver: 'bot', lesson: { id: 'mw-missed-exit', scenario: 'motorway' }, seconds: 50,
      caption: 'If you miss your exit (Rule 263). A solid line of lorries in the left-hand lane: there is no safe gap, so the driver lets junction 3 go and carries on. The instruction box points on to J4 · Harlow Cross. The lesson passes: carrying on is exactly right.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-missed-exit'); await camera(p, 0); } },
    { name: '06-cutting-across-the-hatching', driver: 'scripted', seconds: 24,
      caption: 'The wrong way to recover: diving across the left-hand lane and the hatched area to reach the slip road at the last moment. Both are marked serious.',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-missed-exit'); await camera(p, 0); await ctx.d.set({ lane: 1, want: 1, mph: 58, road: true }); await ffUntil(p, exitIn(60)); },
      script: (p, ctx) => async (t) => { const d = ctx.d, e = await d.exitIn();
        if (!ctx.dive && e != null && e < -120) { ctx.dive = true; await d.look('left'); await d.signal('L'); await d.set({ road: false, want: 0 }); }
        if (ctx.dive && !ctx.end && (e == null || e < -330)) { ctx.end = true; await p.evaluate(() => window.cambridgeDrive.test.finish()); } } },
  ],
};
GROUPS.evening = {
  dir: 'docs/evidence/10-evening-motorway',
  title: 'Evening motorway driving (issue #10)',
  driverNote: 'The careful drives use the Bot lab\'s reference driver (`js/bots.js`), which switches dipped headlights on before moving off; the careless one uses the scriptable driver from `npm run test:motorway` (`tests/mw-driver.mjs`) and leaves them off.',
  clips: [
    { name: '01-joining-at-dusk', driver: 'bot', lesson: { id: 'mw-dusk-join', scenario: 'motorway' }, seconds: 36,
      caption: 'Joining at dusk from the driver\'s seat: dipped headlights on, the slip road\'s green studs, the lit junction, and the traffic in the left-hand lane read by its headlights in the mirror.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-dusk-join'); await camera(p, 1); } },
    { name: '02-following-by-brake-lights', driver: 'bot', lesson: { id: 'mw-dusk-following', scenario: 'motorway' }, seconds: 30,
      caption: 'Following as the traffic slows at dusk: the brake lights ahead give the warning, and the gap stays over two seconds. Chase view, then the driver\'s view.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-dusk-following'); await camera(p, 0); await ffUntil(p, a => a.traffic.clock > 25); },
      script: (p) => { const toDriver = once(() => camera(p, 1)); return t => at(t, 14, toDriver); } },
    { name: '03-signs-and-studs-at-the-exit', driver: 'bot', lesson: { id: 'mw-dusk-exit', scenario: 'motorway' }, seconds: 36,
      caption: 'Leaving at junction 3 at dusk: the ½-mile sign and the countdown markers lit, the green studs where the slip road leaves, red studs along the left edge, and the lighting columns at the junction.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-dusk-exit'); await camera(p, 1); await ffUntil(p, exitIn(900)); } },
    { name: '04-no-headlights-and-what-it-is-marked-for', driver: 'scripted', seconds: 26,
      caption: 'The same following lesson driven with the headlights left off: the tail lights and studs still show, but the car is not lit ahead. The result marks it, once, as a driving fault under ancillary controls (Rules 113 and 115).',
      async setup(p, ctx) { await startDrive(p, 'lesson', 'mw-dusk-following'); await camera(p, 0); await ctx.d.set({ gap: 2.6, mph: 70 }); },
      script: (p) => { const end = once(() => p.evaluate(() => window.cambridgeDrive.test.finish())); return t => at(t, 18, end); } },
    { name: '05-free-drive-at-dusk', seconds: 18,
      caption: 'Free drive on the three-lane circuit at dusk, from the chase view: every vehicle\'s lamps, the lit junction, and the studs marking the lanes.',
      async setup(p) { await startDrive(p, 'free', 'm3-dusk'); await p.evaluate(() => { window.__target = 31; window.cambridgeDrive.player.headlights = true; }); const j = await nextExit(p, 900); await placeOnRoute(p, j.s - 420, 31); await camera(p, 0); } },
  ],
  // the same spot by day and at dusk, from the driver's seat, and what each costs to draw
  async extra(open, dir) {
    const shots = [], times = [];
    const spot = async (page, id, lp) => { await startDrive(page, 'lesson', id); await installMwDriver(page).then(d => d.set({ mph: 64, gap: 2.5 }));
      if (id.includes('dusk')) await page.evaluate(() => { window.cambridgeDrive.player.headlights = true; });
      await page.evaluate(lp => document.querySelector(`#lpSeg [data-lp="${lp ? 1 : 0}"]`).click(), lp);
      await camera(page, 1); await ffUntil(page, exitIn(330)); await page.evaluate(() => { for (let i = 0; i < 40; i++) window.cambridgeDrive.frame(0.05); }); await page.waitForTimeout(300); };
    for (const [id, lp, name] of [['mw-exit', false, 'day'], ['mw-dusk-exit', false, 'dusk'], ['mw-dusk-exit', true, 'dusk-low-power']]) {
      const page = await open({ width: 1280, height: 720 }); await spot(page, id, lp);
      await page.screenshot({ path: path.join(dir, `still-${name}.jpg`), type: 'jpeg', quality: 86 }); shots.push(name); await page.close();
    }
    // draw time per frame, in this headless software renderer (SwiftShader): a comparison, not a device figure
    for (const view of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) for (const [id, lp, name] of [['mw-exit', false, 'day'], ['mw-dusk-exit', false, 'dusk'], ['mw-dusk-exit', true, 'dusk, low power']]) {
      const page = await open(view); await spot(page, id, lp);
      const ms = await page.evaluate(async () => { const a = window.cambridgeDrive, out = [];
        // reading back one pixel makes each frame finish drawing before the next, so the time is the whole frame
        const c = document.querySelector('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'), px = new Uint8Array(4);
        for (let k = 0; k < 3; k++) { await new Promise(r => requestAnimationFrame(r)); const t0 = performance.now(); for (let i = 0; i < 30; i++) { a.frame(0.05); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } out.push((performance.now() - t0) / 30); }
        out.sort((x, y) => x - y); return out[1]; });
      times.push({ view: `${view.width}×${view.height}`, name, ms: ms.toFixed(1) }); await page.close();
    }
    return ['## The same spot by day and at dusk', '',
      'From the driver\'s seat, 330 m before junction 3 with the headlights on: by day, at dusk, and at dusk on low-power graphics (no shadows, no headlight beam or light pools, the lamps still on).', '',
      ...shots.map(n => `![${n}](still-${n}.jpg)`), '',
      '## What it costs to draw', '',
      'Milliseconds per frame (simulation and drawing, each frame finished before the next; median of three runs of 30 frames) at the same spot. Measured in the headless software renderer these clips are made with, so the numbers compare day, dusk and low power with each other; they are not what a phone or laptop GPU will do, which still needs measuring on real devices.', '',
      '| Window | Lighting | ms per frame |', '|---|---|---|', ...times.map(t => `| ${t.view} | ${t.name} | ${t.ms} |`), ''];
  },
};
GROUPS.handling = {
  dir: 'docs/evidence/handling',
  title: 'Steering a person can manage, and leaving the road marked',
  driverNote: 'The "person on keys" is the Bot lab\'s human-like driver: the reference driver\'s intentions seen 0.3 s late, decided ten times a second, on/off keys tapped, and steering no firmer than that reaction time allows. The lessons were chosen before recording (the simplest town turn and the simplest motorway lesson), not picked for the result. The "old steering" clips are the same build with only the old steering mapping put back (`BEFORE_URL`).',
  clips: [
    { name: '01-turn-left-on-keys-old-steering', site: 'before', driver: 'bot', human: 'keys', lesson: { id: 'turn-left' }, seconds: 40, speed: 2,
      caption: 'Turning left, driven on keys with the old steering: every tap turns the car at up to 25 m/s², so it weaves and runs onto the kerb.',
      async setup(p) { await startDrive(p, 'lesson', 'turn-left'); await camera(p, 0); } },
    { name: '02-turn-left-on-keys-new-steering', driver: 'bot', human: 'keys', lesson: { id: 'turn-left' }, seconds: 40, speed: 2,
      caption: 'The same person, the same lesson, with steering limited by grip: the taps nudge the car instead of throwing it.',
      async setup(p) { await startDrive(p, 'lesson', 'turn-left'); await camera(p, 0); } },
    { name: '03-motorway-on-keys-old-steering', site: 'before', driver: 'bot', human: 'keys', lesson: { id: 'mw-keep-left', scenario: 'motorway' }, seconds: 40,
      caption: 'Keep left on the motorway, on keys, old steering: at 70 mph a tap was nearly as sharp as at 30, and the car snakes across the lanes.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-keep-left'); await camera(p, 0); } },
    { name: '04-motorway-on-keys-new-steering', driver: 'bot', human: 'keys', lesson: { id: 'mw-keep-left', scenario: 'motorway' }, seconds: 40,
      caption: 'The same, new steering: a tap at 70 mph is a gentle move within the lane.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-keep-left'); await camera(p, 0); } },
    { name: '05-leaving-the-road-is-marked', seconds: 16, caption: 'Drifting off the motorway onto the verge: a wheel over the edge is marked as mounting the kerb, the car off the road as a serious fault, and the lesson is not passed. Before, this was at most one driving fault.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-keep-left'); await p.evaluate(() => { window.cambridgeDrive.addInput(() => window.__drift ? { throttle: 0.4, brake: 0, steer: 0.35 } : null); }); await camera(p, 0); },
      script: (p) => { const go = once(() => p.evaluate(() => { window.__drift = true; })), stop = once(() => p.evaluate(() => { window.__drift = false; window.cambridgeDrive.test.finish(); })); return async t => { await at(t, 2, go); await at(t, 11, stop); }; } },
    { name: '06-slow-traffic-keeps-left', seconds: 30, caption: 'The three-lane motorway from above: slower vehicles in the left-hand lane, quicker ones pulling out to pass and moving back left once past, each lane change into a real gap at half a lane a second.',
      async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 31; window.cambridgeDrive.step(20 * 40); }); await camera(p, 2); } },
    { name: '07-marked-on-medium', driver: 'bot', lesson: { id: 'turn-left' }, seconds: 40, speed: 2,
      caption: 'Turning left, marked on Medium (chosen in the lesson panel before starting): the result shows two stars and says it was marked on Medium. Hard earns three and is the real test\'s standard.',
      async setup(p) { await p.evaluate(() => localStorage.setItem('cambridge-learner-drive.mode', 'medium')); await startDrive(p, 'lesson', 'turn-left'); await camera(p, 0); } },
    { name: '08-traffic-signals-before-it-moves', seconds: 30, caption: 'Free drive at 55 mph in the left-hand lane, in the chase view: vehicles coming up behind signal right before they pull out to pass, and signal left before they move back in, so you can see where each one is going.',
      async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { window.__target = 24.5; window.cambridgeDrive.step(20 * 40); }); await camera(p, 0); } },
    { name: '09-a-courteous-driver-lets-you-in', seconds: 16, caption: 'The learner, at 60 mph in the left-hand lane, checks the mirror and signals right with a car alongside in the next lane. That driver is one of the courteous half: it eases off and drops back to leave a gap, and the learner moves across into it. (For the clip, a driver whose drawn trait is courtesy was moved up beside the learner; the other half hold their speed.)',
      async setup(p) { await startDrive(p, 'free', 'm3'); await p.evaluate(() => { const a = window.cambridgeDrive, pl = a.player; window.__target = 27; window.__lat = 0; a.step(20 * 30);
        // move one of the courteous drivers alongside the learner in the next lane, keeping its own traits
        const c = a.traffic.cars.find(c => c.alive && c.kind === 'car' && c.traits?.courtesy), traits = c.traits, x = a.test.ctx, dir = x.dir ?? 1;
        const along = dir > 0 ? x.s : x.e.len - x.s; a.traffic.placeCar(c, x.e, dir, along + 1, pl.v, pl.v / (x.e.way.mph * 0.447), null, 1); // cruising at the learner's speed
        Object.assign(c, { traits, scripted: false, pinned: 0 }); }); await camera(p, 0); },
      script: (p) => { const signal = once(() => p.evaluate(() => { const a = window.cambridgeDrive; a.player.observations.push({ view: 'right', at: a.traffic.clock, x: a.player.x, z: a.player.z }); if (a.player.indicator !== 'R') a.player.signal('R'); })),
        move = once(() => p.evaluate(() => { window.__lat = 1; })), off = once(() => p.evaluate(() => { const pl = window.cambridgeDrive.player; if (pl.indicator) pl.signal(pl.indicator); }));
        return async t => { await at(t, 0.5, signal); await at(t, 5, move); await at(t, 10, off); }; } },
  ],
};
// Temporary restrictions (the lessons in js/mw-restrictions.js): limits and a red X on the gantries, and
// roadworks. Route metres: the gantries lesson's route starts at centre line 15200, the roadworks at 4000.
GROUPS.restrictions = {
  dir: 'docs/evidence/11-motorway-restrictions',
  title: 'Speed limits on the gantries, a closed lane, and roadworks',
  driverNote: 'Driven by the Bot lab\'s reference driver (`js/bots.js`, the one `npm run test:bots` checks every lesson with), which reads the same plan as the examiner: the limit ahead, and lanes about to close. The careless drives are checked by `npm run test:motorway`.',
  clips: [
    { name: '01-limits-on-the-gantries', driver: 'bot', lesson: { id: 'mw-smart-limits', scenario: 'motorway' }, seconds: 34,
      caption: 'From the driver\'s seat: the first gantry shows 60 over every lane, so the driver is down to 60 by the time it gets there; the next shows 50, and an arrow over the left-hand lane. The speed display shows the limit the gantry set.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-smart-limits'); await camera(p, 1); await ffUntil(p, 'a => a.test.sRoute > 520', 60); } },
    { name: '02-red-x-and-the-broken-down-car', driver: 'bot', lesson: { id: 'mw-smart-limits', scenario: 'motorway' }, seconds: 34,
      caption: 'Out of the left-hand lane after the arrow, the driver passes under the red X over that lane, the amber lamps flashing beside it, and then the reason for it: a broken-down car with its hazard lights on. The driver keeps to the middle lane, which the examiner does not call hogging with the lane to its left closed.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-smart-limits'); await camera(p, 0); await ffUntil(p, 'a => a.test.sRoute > 1560', 120); } },
    { name: '03-roadworks-lane-closed', driver: 'bot', lesson: { id: 'mw-roadworks', scenario: 'motorway' }, seconds: 38, speed: 2,
      caption: 'Roadworks: the half-mile and lane-closed signs, the 50 limit on both sides, then Merge in turn. Overtaking in the right-hand lane when it closes, the driver signals and moves left into a gap in the middle lane before the cones, and keeps to 50 past the works to the end of the roadworks.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-roadworks'); await camera(p, 0); await ffUntil(p, 'a => a.test.sRoute > 330', 60); } },
    { name: '04-feedback-gantry-by-gantry', driver: 'bot', lesson: { id: 'mw-smart-limits', scenario: 'motorway' }, seconds: 8,
      caption: 'The result after a careful run: passed, and the feedback says what the gantry above your lane showed at each one and how fast you passed it.',
      async setup(p) { await startDrive(p, 'lesson', 'mw-smart-limits'); await ffUntil(p, 'a => a.test.done', 400); } },
  ],
};
// Approach a junction along one road: the steady driver follows the lane towards node `at` (x, z) on the road
// named `road`, starting `from` metres out, and pulls up just short of the line it meets there.
// With `through`, the path carries straight on along the same road past the junction for that many metres
// instead of pulling up at the line.
const approach = (page, area, road, at, from, mph = 20, through = 0) => page.evaluate(([road, at, from, mph, through]) => {
  const a = window.cambridgeDrive, net = a.net, v = [...net.nx].findIndex((x, i) => Math.hypot(x - at[0], net.nz[i] - at[1]) < 1);
  // of the two sides of a through road, the one that carries a KEEP CLEAR towards the node, if either does
  const named = net.inc[v].filter(o => o.e.way.name === road), o = named.find(o => (net.keepClear || []).some(k => k.e === o.e && k.dir === (o.dir === 1 ? -1 : 1))) || named[0];
  const e = o.e, toward = o.dir === 1 ? -1 : 1; // inc dir 1 leaves v
  const pts = [], L = e.len, lane = e.way.oneway ? 0 : Math.min(e.way.w / 4, 2.2);
  for (let k = Math.min(from, L - 1); k >= 0; k -= 2) { const s = toward > 0 ? L - k : k; let i = 0; while (i < e.n - 2 && e.cum[i + 1] < s) i++;
    const l = e.cum[i + 1] - e.cum[i] || 1, u = (s - e.cum[i]) / l, tx = (e.px[i + 1] - e.px[i]) / l * toward, tz = (e.pz[i + 1] - e.pz[i]) / l * toward;
    pts.push({ x: e.px[i] + (e.px[i + 1] - e.px[i]) * u + tz * lane, z: e.pz[i] + (e.pz[i + 1] - e.pz[i]) * u - tx * lane, tx, tz }); }
  const on = through > 0 && net.inc[v].find(q => q.e !== e && q.e.way.name === road);
  if (on) { const c = on.e, out = c.a === v ? 1 : -1, L2 = c.len, lane2 = c.way.oneway ? 0 : Math.min(c.way.w / 4, 2.2);
    for (let k = 2; k <= Math.min(through, L2 - 1); k += 2) { const s = out > 0 ? k : L2 - k; let i = 0; while (i < c.n - 2 && c.cum[i + 1] < s) i++;
      const l = c.cum[i + 1] - c.cum[i] || 1, u = (s - c.cum[i]) / l, tx = (c.px[i + 1] - c.px[i]) / l * out, tz = (c.pz[i + 1] - c.pz[i]) / l * out;
      pts.push({ x: c.px[i] + (c.px[i + 1] - c.px[i]) * u + tz * lane2, z: c.pz[i] + (c.pz[i + 1] - c.pz[i]) * u - tx * lane2, tx, tz }); } }
  const p0 = pts[0]; a.player.place(p0.x, p0.z, Math.atan2(-p0.tx, -p0.tz)); a.player.v = mph * 0.447;
  const line = [...(net.giveByEdge?.get(e.id) || net.giveways.filter(g => g.e === e)), ...(net.stopsByEdge.get(e.id) || [])].filter(g => g.dir === toward)
    .map(g => (toward > 0 ? e.len - g.s : g.s)).sort((x, y) => x - y)[0] ?? 6;
  window.__path = pts; window.__target = mph * 0.447; window.__stopAt = on ? null : { x: net.nx[v], z: net.nz[v], d: line + 2.5 };
}, [road, at, from, mph, through]);
const stopNear = (page) => page.evaluate(() => { const s = window.__stopAt, p = window.cambridgeDrive.player; if (s && Math.hypot(p.x - s.x, p.z - s.z) < s.d + 8) window.__target = Math.max(0, (Math.hypot(p.x - s.x, p.z - s.z) - s.d) * 0.5); });
const SPOTS = {
  'milton-road-side-road': { title: 'A side road off Milton Road (Ascham Road), approaching the give-way', area: 'mock:east-road', road: 'Ascham Road', at: [498.8, -1820.9], from: 70 },
  'newmarket-road': { title: 'Newmarket Road at Godesdone Road, where a 4 m stub of road meets the junction', area: 'mock:east-road', road: 'Newmarket Road', at: [1365.5, -865.9], from: 70 },
  'crossroads': { title: 'Hills Road at the Lensfield Road crossroads, lights and two lanes', area: 'mock:east-road', road: 'Hills Road', at: [377.3, 222.8], from: 80 },
  'keep-clear': { title: 'High Street westbound at Orchard Way in the practice town: KEEP CLEAR', area: 'lesson:move-off', road: 'High Street', at: [0, 0], from: 70, through: 45, still: 14 },
};
// a still is taken from `still` metres out (about 25 m), close enough to see the line and what leads to it
const goSpot = async (page, k, mph, from) => { const S = SPOTS[k], [kind, id] = S.area.split(':'); await startDrive(page, kind, id); await installDriver(page); await approach(page, S.area, S.road, S.at, from ?? S.from, mph, from == null ? S.through || 0 : 0); };
GROUPS.markings = {
  dir: 'docs/evidence/4-junction-markings',
  title: 'Junction markings and KEEP CLEAR (issue #4)',
  driverNote: 'The car is driven by the steady driver the browser checks use, along the lane and up to the line at each junction.',
  clips: [
    { name: '01-side-road-give-way', seconds: 20, caption: 'Ascham Road to Milton Road from the driver\'s seat: one give-way line at the mouth of the junction (the map had two on this approach, one inside the junction), and Milton Road\'s centre line broken across the side road.',
      async setup(p) { await goSpot(p, 'milton-road-side-road'); await camera(p, 1); }, script: (p) => () => stopNear(p) },
    { name: '02-newmarket-road', seconds: 20, caption: 'Newmarket Road towards Godesdone Road: the lane line now stops short of the junction instead of running into it from a 4 m stub of road.',
      async setup(p) { await goSpot(p, 'newmarket-road'); await camera(p, 1); }, script: (p) => () => stopNear(p) },
    { name: '03-crossroads', seconds: 22, caption: 'Hills Road into the Lensfield Road crossroads: the lane lines lengthen on the approach and end at the stop line.',
      async setup(p) { await goSpot(p, 'crossroads'); await camera(p, 1); }, script: (p) => () => stopNear(p) },
    { name: '04-keep-clear', seconds: 12, caption: 'High Street westbound in the practice town: KEEP CLEAR in your lane across the mouth of Orchard Way, so a queue leaves room for traffic turning in and out. Configured for this spot, not painted at every junction.',
      async setup(p) { await goSpot(p, 'keep-clear'); await p.evaluate(() => { window.__stopAt = null; }); await camera(p, 1); } },
  ],
  // the same spots before (the motorway branch, the old rules) and after, from the driver's seat
  async extra(open, dir) {
    const before = process.env.BEFORE_URL, rows = [];
    for (const k of Object.keys(SPOTS)) {
      for (const [tag, site] of [['before', before], ['after', url]]) {
        if (!site || (tag === 'before' && k === 'keep-clear')) continue;
        const page = await open({ width: 1280, height: 720 }, site); await goSpot(page, k, 0, SPOTS[k].still ?? 26);
        await page.evaluate(() => { const a = window.cambridgeDrive; a.player.v = 0; window.__target = 0; for (let i = 0; i < 30; i++) a.frame(0.05); });
        await camera(page, 1); await page.evaluate(() => { for (let i = 0; i < 20; i++) window.cambridgeDrive.frame(0.05); }); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(dir, `${k}-${tag}.jpg`), type: 'jpeg', quality: 86 }); await page.close();
      }
      rows.push(`### ${SPOTS[k].title}`, '', k === 'keep-clear' ? `![after](${k}-after.jpg)` : `| Before | After |\n|---|---|\n| ![before](${k}-before.jpg) | ![after](${k}-after.jpg) |`, '');
    }
    return ['## Before and after, from the driver\'s seat', '', 'The same spot with the old marking rules (before) and the new ones (after), from the driver\'s seat about 25 m before the line.', '', ...rows];
  },
};
// metres along the route to the node of the first yellow box (or, with keep, the KEEP CLEAR) on it
const toMarked = (keep = false) => `a => { const t = a.test, R = t.route, end = st => st.dir > 0 ? st.e.b : st.e.a, K = a.net.keepClear[0];
  const k = R.steps.findIndex(st => ${keep} ? end(st) === (K.dir > 0 ? K.e.b : K.e.a) : a.net.boxes.some(b => b.node === end(st))); return R.stepS[k + 1] - t.sRoute; }`;
GROUPS.boxes = {
  dir: 'docs/evidence/5-box-junctions-keep-clear',
  title: 'Yellow box junctions and KEEP CLEAR (issue #5)',
  driverNote: 'The careful drives use the Bot lab\'s reference driver (`js/bots.js`, the one `npm run test:bots` checks every lesson with), which waits before a box or KEEP CLEAR until there is room beyond it. The careless one uses the scriptable driver from `npm run test:boxes`, which just follows the car in front.',
  clips: [
    { name: '01-waiting-at-the-line-for-room', driver: 'bot', lesson: { id: 'box-junction', scenario: 'box' }, seconds: 24,
      caption: 'Straight on over the yellow box at Station Road, the light green. Traffic is queueing beyond the box, so the driver waits at the line, outside the box, until the queue moves off and there is room for the whole car on the other side, then crosses without stopping.',
      async setup(p) { await startDrive(p, 'lesson', 'box-junction'); await camera(p, 0); await ffUntil(p, `a => (${toMarked()})(a) < 55`, 120); } },
    { name: '02-waiting-in-the-box-to-turn-right', driver: 'bot', lesson: { id: 'box-right', scenario: 'box-right' }, seconds: 20,
      caption: 'Turning right at the same box with the exit clear: the driver moves forward into the box to the turning point and waits there for the oncoming traffic to pass, which Rule 174 allows, then turns. Nothing is marked.',
      async setup(p) { await startDrive(p, 'lesson', 'box-right'); await camera(p, 0); await ffUntil(p, `a => (${toMarked()})(a) < 60`, 120); } },
    { name: '03-stopping-short-of-keep-clear', driver: 'bot', lesson: { id: 'keep-clear', scenario: 'keep-clear' }, seconds: 22,
      caption: 'High Street, a queue ahead. The driver stops short of the KEEP CLEAR across the mouth of Orchard Way, and a car waiting in Orchard Way turns right into the gap; then the queue moves off.',
      async setup(p) { await startDrive(p, 'lesson', 'keep-clear'); await camera(p, 0); await ffUntil(p, `a => (${toMarked(true)})(a) < 45`, 120); } },
    { name: '04-following-the-queue-into-the-box', driver: 'scripted', seconds: 22,
      caption: 'The careless version of clip 1: following the car in front into the box with no room beyond it, and stopping inside, across the junction. Marked at once as a serious fault (Rule 174).',
      async setup(p) { await startDrive(p, 'lesson', 'box-junction'); await p.evaluate(() => Object.assign(window.__mw, { mph: 20, gap: 0.6 })); await camera(p, 0); await ffUntil(p, `a => (${toMarked()})(a) < 50`, 120); } },
    { name: '05-what-it-is-marked-for', driver: 'scripted', seconds: 8,
      caption: 'The result of that drive: not passed, the serious fault named, and the lesson\'s own feedback saying what went wrong.',
      async setup(p) { await startDrive(p, 'lesson', 'box-junction'); await p.evaluate(() => Object.assign(window.__mw, { mph: 20, gap: 0.6 }));
        await ffUntil(p, 'a => a.test.sRoute > a.test.route.len - 30', 400); await p.evaluate(() => { window.__mw.mph = -1; }); await ffUntil(p, 'a => a.test.done', 60); } },
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
  // a fresh page per clip, so one clip's state never leaks into the next
  const open = async (viewport = VIEW, site = url) => { const page = await browser.newPage({ viewport }), errors = []; page.errors = errors;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({ path: three + '/build/three.min.js', contentType: 'application/javascript' }));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', r => r.fulfill({ path: three + '/examples/js/loaders/GLTFLoader.js', contentType: 'application/javascript' }));
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await installAuthFixture(page);
    await page.goto(site); await page.waitForFunction(() => document.querySelector('#loadOv')?.hidden, {}, { timeout: 45000 }); await signedIn(page);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(5000); // let the car models arrive, so nothing on the road is still a box
    return page; };
  let extra = [];
  for (const c of group.clips) {
    if (process.argv[3] && !c.name.includes(process.argv[3])) continue;
    if (c.site === 'before' && !process.env.BEFORE_URL) { console.log(`  ${c.name}: skipped, needs BEFORE_URL`); continue; }
    const page = await open(VIEW, c.site === 'before' ? process.env.BEFORE_URL : url), errors = page.errors;
    // the scripted driver is the one tests/motorway-lessons-browser.mjs uses (tests/mw-driver.mjs), so a
    // clip shows exactly the drive the check makes
    const ctx = {};
    if (c.driver === 'bot') await installBot(page, c.lesson, c.human || null); else if (c.driver === 'scripted') ctx.d = await installMwDriver(page); else await installDriver(page);
    await c.setup(page, ctx);
    made.push({ ...c, ...(await clip(page, group.dir, c.name, c.seconds, c.script?.(page, ctx), c.speed || 1)) });
    if (errors.length) throw new Error(`${c.name}: ${errors.join('; ')}`);
    await page.close();
  }
  if (group.extra && (!process.argv[3] || process.argv[3] === 'extra')) extra = await group.extra(open, group.dir);
  // `<group> extra` redoes only the stills and measurements, in place in the existing index
  if (process.argv[3] === 'extra' && extra.length && fs.existsSync(path.join(group.dir, 'README.md'))) {
    const old = fs.readFileSync(path.join(group.dir, 'README.md'), 'utf8'), at = old.indexOf(extra[0]);
    fs.writeFileSync(path.join(group.dir, 'README.md'), (at >= 0 ? old.slice(0, at) : old.trimEnd() + '\n\n') + extra.join('\n'));
  }
  if (!process.argv[3]) {
    const lines = [`# ${group.title}`, '', `Recorded with \`node tools/record_evidence.mjs ${process.argv[2]}\` on ${new Date().toISOString().slice(0, 10)}: the real application,`,
      `stepped at ${FPS} frames a second and captured frame by frame, so each clip plays at true speed unless it says otherwise.`,
      group.driverNote || 'The car is driven by the same steady driver the browser checks use.', ''];
    for (const m of made) lines.push(`## ${m.name.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}`, '', m.caption, '',
      `[${m.file}](${m.file}) · ${m.seconds} s${m.speed > 1 ? ` (${m.seconds * m.speed} s of driving at ${m.speed}× speed)` : ''} · ${m.mb} MB`, '');
    fs.writeFileSync(path.join(group.dir, 'README.md'), [...lines, ...extra].join('\n'));
  }
} finally { await browser?.close(); server.kill(); }
