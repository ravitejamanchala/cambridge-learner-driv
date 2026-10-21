// Captures one screenshot per case in the course and writes docs/screenshots.md around them.
//   node tools/screenshots.mjs                 (everything)
//   node tools/screenshots.mjs blue-light      (only cases whose name contains this)
// Needs Python and Chromium, like the browser checks. Uses the offline sign-in fixture, so no account
// and no network are involved.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { installAuthFixture, signedIn } from '../tests/auth-fixture.mjs';
import { VISIBLE_LESSONS } from '../js/course-menu.js';
import { ROUTES } from '../js/config.js';

const require = createRequire(import.meta.url), three = path.dirname(require.resolve('three/package.json'));
const OUT = 'docs/screenshots', filter = process.argv[2] || '';
const port = 8793, url = `http://127.0.0.1:${port}`;
const VIEW = { width: 900, height: 506 };
const shot = { type: 'jpeg', quality: 78 };

const practical = VISIBLE_LESSONS.filter(l => l.mode === 'practical');
const quizzes = VISIBLE_LESSONS.filter(l => l.mode === 'theory');

fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '.'], { stdio: 'ignore' });
let browser;
const written = [];

async function capture(page, name, caption) {
  const file = `${name}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), ...shot });
  written.push({ name, file, caption });
  process.stdout.write(`  ${file}  ${caption}\n`);
}
// let the scene settle and the banner behave as it would for a learner
const run = (page, seconds) => page.evaluate(s => { const app = window.cambridgeDrive; for (let i = 0; i < s * 20; i++) app.step(1); app.frame(0.12); }, seconds);
// a zero-length frame renders but never refreshes the interface, which only redraws every 0.1 s
const settle = async page => { await page.evaluate(() => { window.cambridgeDrive.frame(0.12); window.cambridgeDrive.frame(0.12); }); await page.waitForTimeout(260); };

try {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(url); await r.arrayBuffer(); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: VIEW });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r => r.fulfill({ path: three + '/build/three.min.js', contentType: 'application/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', r => r.fulfill({ path: three + '/examples/js/loaders/GLTFLoader.js', contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await installAuthFixture(page);
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#loadOv')?.hidden, {}, { timeout: 45000 }); await signedIn(page);
  // Headless throttles CSS animations, so a sheet that is fading in can be captured half transparent.
  // Screenshots want the settled state anyway.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  // give the supplied car models a moment, so nothing on the road is still a box
  await page.waitForTimeout(6000);
  const want = name => !filter || name.includes(filter);

  // ---------- the lobby and the menus ----------
  if (want('lobby')) { await settle(page); await capture(page, 'lobby', 'The lobby: learner, level and the selected drive.'); }
  if (want('course')) {
    await page.locator('[data-open=courseSheet]').first().click(); await page.waitForTimeout(250);
    await capture(page, 'course-menu', 'The course: seven units of lessons, with what you have passed.');
    await page.locator('#courseSheet [data-close]').click();
  }
  if (want('garage')) {
    await page.locator('[data-home-car="police"]').click().catch(() => {});
    await page.waitForTimeout(1200); await settle(page);
    await capture(page, 'garage', 'Eight cars in the garage. The learner drives whichever is chosen here.');
    await page.locator('[data-home-car="rx7"]').click().catch(() => {});
    await page.waitForTimeout(1200);
  }

  // ---------- one per practical lesson ----------
  for (const lesson of practical) {
    const name = 'lesson-' + lesson.id; if (!want(name)) continue;
    await page.evaluate(async id => { await window.cambridgeDrive.pick('lesson', id, true); window.cambridgeDrive.manual(true); window.cambridgeDrive.frame(0); }, lesson.id);
    await run(page, 1.5); await settle(page);
    await capture(page, name, `${lesson.title} — ${lesson.road}. ${lesson.goal}`);
  }

  // ---------- the theory quizzes ----------
  for (const quiz of quizzes) {
    const name = 'quiz-' + quiz.id; if (!want(name)) continue;
    await page.evaluate(() => window.cambridgeDrive.manual(false));
    await page.evaluate(async id => { await window.cambridgeDrive.pick('lesson', id, true); }, quiz.id);
    await page.waitForTimeout(350);
    await capture(page, name, `${quiz.title}: unofficial practice questions, not the DVSA question bank.`);
    await page.locator('#quizSheet [data-close]').click().catch(() => {});
  }

  // ---------- the mock tests ----------
  await page.evaluate(() => window.cambridgeDrive.manual(true));
  for (const [i, route] of ROUTES.entries()) {
    const name = 'mock-' + route.id; if (!want(name)) continue;
    await page.evaluate(async n => { await window.cambridgeDrive.pick('mock', n, true); window.cambridgeDrive.frame(0); }, route.id);
    await run(page, 2); await settle(page);
    await capture(page, name, `Mock test ${i + 1}: ${route.name}. ${route.blurb}`);
  }

  // ---------- the cases worth seeing in a particular state ----------
  const views = { chase: 0, driver: 1, overhead: 2 };
  const setView = (page, v) => page.evaluate(n => document.querySelector(`#camSeg [data-cam="${n}"]`)?.click(), views[v]);

  if (want('look')) {
    await page.evaluate(async () => { await window.cambridgeDrive.pick('lesson', 'rb-ahead', true); window.cambridgeDrive.frame(0); });
    await run(page, 4);
    for (const [view, key, side] of [['driver', 'KeyZ', 'left'], ['driver', 'KeyX', 'right'], ['chase', 'KeyZ', 'left'], ['chase', 'KeyX', 'right']]) {
      await setView(page, view); await run(page, 0.6);
      await page.keyboard.down(key); await run(page, 1); await settle(page);
      await capture(page, `look-${side}-${view}`, `Holding ${key === 'KeyZ' ? 'Z' : 'X'} to look ${side} in the ${view} view. The camera turns; the car keeps going where it is pointed.`);
      await page.keyboard.up(key); await run(page, 1);
    }
    await setView(page, 'chase');
  }

  // Coaching is off for every other case here, which is what a learner sees by default.
  if (want('coaching')) {
    const setCoaching = (page, on) => page.evaluate(v => document.querySelector(`#coSeg [data-co="${v}"]`).click(), on ? 1 : 0);
    await page.evaluate(async () => { await window.cambridgeDrive.pick('lesson', 'mirror-practice', true); window.cambridgeDrive.frame(0); });
    await setView(page, 'chase'); await run(page, 3); await settle(page);
    await capture(page, 'coaching-off', 'The default drive: readings only. Three ticks for the checks, a target band under the speed, and nothing repeating the lesson card.');
    await setCoaching(page, true); await run(page, 1); await settle(page);
    await capture(page, 'coaching-on', 'Coaching switched on in Settings: one line above the Highway Code tip, saying what to do as the drive goes on.');
    await setCoaching(page, false); await run(page, 0.5);
  }

  if (want('blue-light')) {
    await page.evaluate(async () => { await window.cambridgeDrive.pick('lesson', 'blue-light', true); window.cambridgeDrive.frame(0); });
    await setView(page, 'chase'); await run(page, 0.4);
    await page.evaluate(() => { const app = window.cambridgeDrive; window.__drive = app.addInput(() => { if (app.traffic.clock - app.player.lookAt > 4) app.look(); return { throttle: 1, brake: 0, steer: 0 }; }); });
    for (let i = 0; i < 400 && !(await page.evaluate(() => window.cambridgeDrive.scenario?.phase === 'coming')); i++) await run(page, 0.5);
    // let it close in, so the light bar is actually in shot
    for (let i = 0; i < 40; i++) {
      await run(page, 0.4);
      const close = await page.evaluate(() => { const s = window.cambridgeDrive.scenario, p = window.cambridgeDrive.player;
        if (!s?.vehicle || s.phase !== 'coming') return true;
        return Math.hypot(s.vehicle.x - p.x, s.vehicle.z - p.z) < 30; });
      if (close) break;
    }
    await settle(page);
    console.log('  blue light:', JSON.stringify(await page.evaluate(() => {
      const s = window.cambridgeDrive.scenario, p = window.cambridgeDrive.player;
      return { phase: s?.phase, side: s?.side, shell: !!s?.shell, shellKids: s?.shell?.children?.length ?? null,
        carVisible: s?.vehicle?.mesh?.visible, dist: s?.vehicle ? Math.round(Math.hypot(s.vehicle.x - p.x, s.vehicle.z - p.z)) : null };
    })));
    await capture(page, 'blue-light-lesson', 'Blue light vehicle lesson: a police car with its light bar on, to be let past (Rule 219).');
    await page.evaluate(() => window.__drive && window.__drive());
  }

  if (want('parallel-park')) {
    await page.evaluate(async () => { await window.cambridgeDrive.pick('lesson', 'parallel-park', true); window.cambridgeDrive.frame(0); });
    await setView(page, 'chase'); await run(page, 0.4); // the manoeuvre reads best from behind the car
    await settle(page);
    await capture(page, 'parallel-park-start', 'Parallel parking: the brief at the start of the run, with the space marked between two parked cars.');
    // drive it with the same test driver the checks use
    for (const name of ['parking-driver', 'parking-geometry', 'config']) await page.route(`**/__shots/${name}.js`, r => r.fulfill({ body: fs.readFileSync(`js/${name}.js`, 'utf8'), contentType: 'application/javascript' }));
    await page.addScriptTag({ type: 'module', content: "import { createParkingDriver } from '/__shots/parking-driver.js'; window.shotDriver = createParkingDriver;" });
    await page.waitForFunction(() => !!window.shotDriver);
    await page.evaluate(() => {
      const app = window.cambridgeDrive;
      const driver = window.shotDriver({ get A() { return { test: app.test, traffic: app.traffic }; }, player: app.player, scenarioStatus: () => app.test.manoeuvreStatus,
        look: () => app.look(), gear: () => {}, operate: () => document.querySelector('#assessParking').click() });
      window.__park = app.addInput(driver);
    });
    const until = async predicate => { for (let i = 0; i < 600; i++) { if (await page.evaluate(predicate)) return true; await run(page, 0.5); } return false; };
    await until(() => window.cambridgeDrive.test.manoeuvreStatus?.leg === 0 && window.cambridgeDrive.player.x > 118);
    await settle(page); await capture(page, 'parallel-park-alongside', 'Pulled up alongside the front car, inside the highlighted box.');
    await until(() => window.cambridgeDrive.player.v < -0.2);
    await settle(page); await capture(page, 'parallel-park-reversing', 'Reversing into the space on the back arrow. One control, no gear selector.');
    await until(() => window.cambridgeDrive.test.done);
    // stop driving before the sheet is captured, so nothing can click it away again
    await page.evaluate(() => { window.__park && window.__park(); window.cambridgeDrive.frame(0.2); });
    await page.locator('#resultSheet').waitFor({ state: 'visible', timeout: 20000 })
      .catch(async () => console.log('  !! the result sheet never appeared:', JSON.stringify(await page.evaluate(() => ({ done: window.cambridgeDrive.test.done, hidden: document.querySelector('#resultSheet').hidden })))));
    await page.waitForTimeout(500);
    const shown = await page.evaluate(() => !document.querySelector('#resultSheet').hidden && document.querySelectorAll('#runDetailList li').length);
    if (!shown) console.log('  !! the feedback was not on screen when captured:', shown);
    await capture(page, 'parallel-park-feedback', `The feedback after a run: what happened, measured, stage by stage (${shown} lines).`);
  }
  if (errors.length) console.log('page errors:', errors.join(' | '));
} finally { await browser?.close(); server.kill(); }

// ---------- the page that holds them ----------
if (!filter) {
  const section = (title, prefix, blurb) => {
    const rows = written.filter(w => w.name.startsWith(prefix));
    if (!rows.length) return '';
    return `\n## ${title}\n\n${blurb ? blurb + '\n\n' : ''}` + rows.map(r => `### ${r.caption.split(/[—.]/)[0].trim()}\n\n![${r.caption.replace(/[[\]]/g, '')}](screenshots/${r.file})\n\n${r.caption}\n`).join('\n');
  };
  const page = `# Screenshots

One picture per case in the course, captured by \`node tools/screenshots.mjs\` against the real
application: the same build the checks drive, with the offline sign-in fixture and no network. Rerun it
after changing the course or the interface, and commit what changes.
${section('The lobby', 'lobby', '')}${section('The course menu', 'course', '')}${section('The garage', 'garage', '')}${section('Looking around', 'look', 'Hold Z to look left and X to look right. The camera swings; the car does not.')}${section('Blue light vehicle', 'blue-light', '')}${section('Parallel parking', 'parallel-park', '')}${section('Lessons', 'lesson-', 'Every practical lesson, at the start of its run.')}${section('Theory quizzes', 'quiz-', '')}${section('Mock tests', 'mock-', '')}`;
  fs.writeFileSync('docs/screenshots.md', page);
  console.log(`\n${written.length} screenshots in ${OUT}, indexed by docs/screenshots.md`);
}
