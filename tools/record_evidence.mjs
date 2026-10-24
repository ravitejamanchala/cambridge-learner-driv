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
async function clip(page, dir, name, seconds, script) {
  const file = path.join(dir, name + '.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  const frames = Math.round(seconds * FPS);
  // a second off camera first, so a clip never opens on scenery that is still being built round the car
  await page.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) window.cambridgeDrive.frame(dt); }, [DT, FPS]); await page.waitForTimeout(300);
  for (let f = 0; f < frames; f++) {
    await script?.(f / FPS, f);
    await page.evaluate(dt => window.cambridgeDrive.frame(dt), DT);
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
    await installDriver(page);
    const ctx = {};
    await c.setup(page, ctx);
    made.push({ ...c, ...(await clip(page, group.dir, c.name, c.seconds, c.script?.(page, ctx))) });
    if (errors.length) throw new Error(`${c.name}: ${errors.join('; ')}`);
    await page.close();
  }
  if (!process.argv[3]) {
    const lines = [`# ${group.title}`, '', `Recorded with \`node tools/record_evidence.mjs ${process.argv[2]}\` on ${new Date().toISOString().slice(0, 10)}: the real application,`,
      `stepped at ${FPS} frames a second and captured frame by frame, so each clip plays at true speed. The car is driven by the`,
      'same steady driver the browser checks use.', ''];
    for (const m of made) lines.push(`## ${m.name.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}`, '', m.caption, '', `[${m.file}](${m.file}) · ${m.seconds} s · ${m.mb} MB`, '');
    fs.writeFileSync(path.join(group.dir, 'README.md'), lines.join('\n'));
  }
} finally { await browser?.close(); server.kill(); }
