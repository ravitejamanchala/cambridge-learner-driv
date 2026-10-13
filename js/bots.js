import { createParkingDriver } from './parking-driver.js';
// Bot lab (open the sim with ?bots in the address): drives lessons, puzzles and mock tests with a
// rule-following test driver, as fast as the browser allows (no rendering unless you watch), and
// keeps every result in localStorage so several windows can run at once and add to the same table.
// Hidden from learners; for checking that every drive can be completed cleanly.

const KEY = 'cld.bot.';           // one localStorage entry per run, so windows never overwrite each other
const TAB = Math.random().toString(36).slice(2, 7);
const MPH = 2.23694;
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------- the driver ----------
// Follows the route guide's lane line, keeps to limits, stops for lights, crossings and traffic,
// gives way at side roads, minis, roundabouts and cycle rings, signals, looks round before moving off.
export function makeDriver(api) {
  const parkingInput = createParkingDriver(api);
  const st = { lookedAt: -1e9, waitT: 0 };
  return function input() {
    const A = api.A, t = A.test, pl = api.player, R = t.route, tr = A.traffic, net = A.net; if (!t.running) return null;
    const lesson = api.lesson?.(), status = api.scenarioStatus?.();
    if (lesson?.manoeuvre) return parkingInput();
    if (pl.operation?.enabled && pl.operation.transmission !== 'automatic') {
      const missing = ['doorClosed', 'seatSet', 'mirrorsSet', 'belt'].find(k => !pl.operation[k]);
      if (missing) api.operate(missing);
      else if (lesson.scenario === 'engine') {
        if (!pl.operation.events.some(e => e.action === 'engine' && e.value) || pl.operation.engine) api.operate('engine');
      }
      return { throttle: 0, brake: 0, steer: 0 };
    }
    if (pl.operation?.transmission === 'automatic') {
      const desired = lesson.scenario === 'automatic-reverse' ? 'R' : 'D';
      if (status?.phase === 'prepare') {
        if (pl.rawInput?.brake >= 0.5 && Math.abs(pl.v) < 0.1) {
          if (pl.operation.gear !== desired) api.gear(desired);
          if (pl.operation.parkingBrake) api.operate('parkingBrake');
          api.look();
        }
        return { throttle: 0, brake: 1, steer: 0 };
      }
      if (['stop', 'secure'].includes(status?.phase)) {
        if (status.phase === 'secure' && pl.rawInput?.brake >= 0.5 && Math.abs(pl.v) < 0.1) {
          if (pl.operation.gear !== 'P') api.gear('P');
          if (!pl.operation.parkingBrake) api.operate('parkingBrake');
        }
        return { throttle: 0, brake: 1, steer: 0 };
      }
      // Idle creep is enough for this straight reversing exercise.
      if (desired === 'R') return { throttle: 0, brake: 0, steer: 0 };
      return { throttle: pl.v < 2.5 ? 0.3 : 0, brake: pl.v > 2.8 ? 0.3 : 0, steer: 0 };
    }
    if (lesson?.scenario === 'mirrors' && (t.parked || t.sRoute > 180)) {
      for (const view of ['interior', 'right', 'blindspot']) if (!pl.observations.some(e => e.view === view && (t.parked || tr.clock - e.at < 5))) api.look(view);
    }
    const fx = -Math.sin(pl.th), fz = -Math.cos(pl.th), dt = 0.05;
    if (api.estopBanner()) return { throttle: 0, brake: 1, steer: 0 };
    // moving off: look round, wait for traffic coming from behind (up to 8 s), signal right, go
    if (t.parked) {
      st.waitT += dt; if (tr.clock - pl.lookAt > 6) { api.look(); st.lookedAt = tr.clock; }
      const behind = tr.cars.some(o => { if (!o.alive || o.v < 1.5 || Math.cos(o.th - pl.th) < 0.7) return false; const dx = o.x - pl.x, dz = o.z - pl.z, fw = dx * fx + dz * fz; return fw < 3 && fw > -90 && Math.abs(dx * fz - dz * fx) < 5.5; });
      if ((behind && st.waitT < 8) || tr.clock - st.lookedAt < 1.2) return { throttle: 0, brake: pl.v > 0.05 ? 1 : 0, steer: 0 };
      if (pl.indicator !== 'R') pl.signal('R');
    } else st.waitT = 0;
    const p = api.lanePoint(t.sRoute + 10), d = wrapA(Math.atan2(-(p.x - pl.x), -(p.z - pl.z)) - pl.th);
    const nr = t.ctx; let target = Math.min(nr ? nr.way.mph / MPH * 0.88 : 8, 24);
    if (lesson?.scenario === 'steering') target = Math.min(target, 5.5);
    const ins = R.instructions[t.step], ahead = ins.s - t.sRoute;
    if (!t.parked && pl.indicator === 'R' && !(ins.signal === 'R' && ahead < 90)) pl.signal('R'); // cancel the moving-off signal
    if (ins.kind === 'rb' && ahead < 45) target = Math.min(target, ahead < 15 ? 5.5 : 8);
    else if (ins.kind !== 'straight' && ins.kind !== 'end' && ahead < 35) target = Math.min(target, 5);
    if (nr && nr.way.rb) target = Math.min(target, 7);
    const prev = R.instructions[t.step - 1]; if (prev && /left|right/.test(prev.kind) && t.sRoute - prev.s < 14) target = Math.min(target, 5);
    const p2 = api.lanePoint(t.sRoute + 45), bend = Math.abs(wrapA(Math.atan2(-(p2.x - pl.x), -(p2.z - pl.z)) - pl.th));
    if (bend > 0.25) target = Math.min(target, Math.max(9, 22 - bend * 30));
    if (['controlled-stop', 'accel-decel', 'mirrors'].includes(lesson?.scenario)) {
      target = Math.min(target, 5.5);
      if (lesson.scenario === 'controlled-stop' && status?.message?.startsWith('Brake to stop')) target = 0;
      if (lesson.scenario === 'accel-decel' && status?.message?.startsWith('Release accelerator')) target = 3;
    }
    if (ins.final && t.sRoute > ins.s - 60) target = Math.min(target, 4);
    if (ins.final && t.sRoute > ins.s - 28) target = 0;
    const stopAt = (fw, m) => { target = Math.min(target, Math.max(0, (fw - m) * 0.45)); };
    for (const s of net.stops) { const rx = s.x - pl.x, rz = s.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 50 || Math.abs(rx * fz - rz * fx) > s.w / 2 + 2 || s.tx * fx + s.tz * fz < 0.5) continue; const L = tr.lightState(s); if (L === 'R' || L === 'RA' || (L === 'A' && fw > 6)) stopAt(fw, 2.5); }
    for (const z of net.zebras) { if (z.ped.state === 'idle') continue; const rx = z.x - pl.x, rz = z.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 40 || Math.abs(rx * fz - rz * fx) > z.w) continue; stopAt(fw, 5); }
    for (const c of tr.puffins) { if (c.ped.state === 'idle') continue; const rx = c.x - pl.x, rz = c.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1 || fw > 40 || Math.abs(rx * fz - rz * fx) > c.w) continue; stopAt(fw, 4.5); }
    const look = Math.max(24, pl.v * pl.v / 9 + pl.v * 1.2 + 8), others = tr.cars.concat(tr.bikes);
    for (const o of others) { if (!o.alive) continue; const rx = o.x - pl.x, rz = o.z - pl.z, fw = rx * fx + rz * fz; if (fw < 0 || fw > look || Math.abs(rx * fz - rz * fx) > 2.3 || Math.cos(o.th - pl.th) < -0.5) continue; target = Math.min(target, o.v + Math.max(0, (fw - 8) * 0.35)); stopAt(fw, 7); }
    for (const o of others) { if (!o.alive || o.v < 0.8 || Math.cos(o.th - pl.th) < -0.75) continue; const px = o.x - Math.sin(o.th) * o.v * 1.5 - pl.x, pz = o.z - Math.cos(o.th) * o.v * 1.5 - pl.z, fw = px * fx + pz * fz; if (fw < 0 || fw > 14 || Math.abs(px * fz - pz * fx) > 2.6) continue; stopAt(Math.max(fw, Math.hypot(o.x - pl.x, o.z - pl.z)), 6); }
    if (ins.kind === 'right' && ahead < 14 && ahead > -4 && tr.cars.some(o => { if (!o.alive || o.v < 1) return false; const dx = o.x - pl.x, dz = o.z - pl.z, fw = dx * fx + dz * fz; return fw > 0 && fw < 60 && Math.cos(o.th - pl.th) < -0.6 && Math.abs(dx * fz - dz * fx) < 8; })) stopAt(ahead + 2, 0);
    if (ins.approach && ahead > 1.5 && ahead < 26 && net.giveways.some(g => g.e === ins.approach.e && g.dir === ins.approach.dir)) {
      const vx = net.nx[ins.node], vz = net.nz[ins.node];
      if (others.some(o => { if (!o.alive || o.v < 0.8) return false; const dx = vx - o.x, dz = vz - o.z, dd = Math.hypot(dx, dz); if (dd > 55 || dd < 3 || Math.hypot(o.x - pl.x, o.z - pl.z) < 4) return false; return (dx * -Math.sin(o.th) + dz * -Math.cos(o.th)) / dd > 0.6; })) stopAt(ahead, 5);
    }
    if (ins.kind === 'rb' && ahead > 2 && ahead < 22) {
      const vx = net.nx[ins.node], vz = net.nz[ins.node], lit = net.stops.some(s => Math.hypot(s.x - pl.x, s.z - pl.z) < 40 && s.tx * fx + s.tz * fz > 0.5);
      if (!lit && tr.cars.some(o => o.alive && o.e.way.rb && o.v > 1 && Math.hypot(o.x - vx, o.z - vz) < 26 && ((vx - o.x) * -Math.sin(o.th) + (vz - o.z) * -Math.cos(o.th)) > -1)) stopAt(ahead, 4);
    }
    for (const m of net.minis) {
      const dx = m.x - pl.x, dz = m.z - pl.z, fw = dx * fx + dz * fz; if (fw < 5 || fw > 26 || Math.abs(dx * fz - dz * fx) > 8) continue;
      const rx = -fz, rz = fx; if (others.some(o => { if (!o.alive || o.v < 1) return false; const ox = o.x - m.x, oz = o.z - m.z, od = Math.hypot(ox, oz); if (od > 26 || od < 2.5) return false; return -(ox * -Math.sin(o.th) + oz * -Math.cos(o.th)) / od > 0.5 && (ox * rx + oz * rz) / od > 0.3; })) stopAt(fw, 8);
    }
    for (const ring of net.cycleRings) for (const cr of ring.crossings) {
      const rx = cr.x - pl.x, rz = cr.z - pl.z, fw = rx * fx + rz * fz; if (fw < 1.5 || fw > 28 || Math.abs(rx * fz - rz * fx) > 4) continue;
      if (tr.ringBikes.some(b => b.ring === ring && wrapA(b.ang - cr.ang) * ring.r > -18 && wrapA(b.ang - cr.ang) * ring.r < 3)) stopAt(fw, 3.5);
    }
    if (ins.signal && ahead < 80 && ahead > 3 && pl.indicator !== ins.signal && !(ins.kind === 'rb' && t.sRoute > ins.prevExitS - 0.3)) pl.signal(ins.signal);
    if (ins.kind === 'rb' && ins.exitSignal && t.sRoute > ins.prevExitS + 0.3 && t.sRoute < ins.exitS && pl.indicator !== 'L') pl.signal('L');
    return { throttle: pl.v < target - 0.3 ? 1 : 0, brake: pl.v > target + 0.6 && pl.v > 0.05 ? 1 : 0, steer: Math.max(-1, Math.min(1, d * 2.4)) };
  };
}

// ---------- results store ----------
function allRuns() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(KEY)) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (_) {} } } } catch (_) {}
  return out.sort((a, b) => a.at - b.at);
}
function saveRun(r) { try { localStorage.setItem(KEY + r.at + '.' + TAB + '.' + Math.random().toString(36).slice(2, 6), JSON.stringify(r)); } catch (_) {} }
function clearRuns() { try { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith(KEY) || k.startsWith('cld.note.'))) ks.push(k); } ks.forEach(k => localStorage.removeItem(k)); } catch (_) {} }
function allNotes() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cld.note.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (_) {} } } } catch (_) {} return out.sort((a, b) => a.at - b.at); }
function download(name, text, type, url) { const a = document.createElement('a'); a.href = url || URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); if (!url) setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const yieldNow = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const f = q.shift(); f && f(); }; return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); }); })();

// ---------- runner + panel ----------
export function createBotLab(api) {
  const drive = makeDriver(api);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div'); el.id = 'botlab';
  el.innerHTML = `<style>
#botlab{position:fixed;right:12px;top:84px;max-height:calc(100vh - 100px);width:min(440px,calc(100vw - 24px));z-index:60;background:rgba(18,14,22,.94);color:#fff;border-radius:16px;font:13px/1.35 Geist,ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.45)}
#botlab header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}#botlab h2{margin:0;font-size:16px;flex:1}
#botlab .row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
#botlab label{display:flex;gap:5px;align-items:center}#botlab input[type=number]{width:56px;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px 5px}
#botlab button{background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:8px;padding:6px 11px;font:inherit;cursor:pointer}#botlab button.go{background:#ff8c28;border-color:#ff8c28;color:#1a0f00;font-weight:700}
#botlab .live{font:12px/1.4 ui-monospace,monospace;color:#ffcf8a;padding:8px 14px;min-height:36px}
#botlab .tbl{overflow:auto;flex:1;padding:0 6px 10px}#botlab table{width:100%;border-collapse:collapse;font-size:12px}#botlab th,#botlab td{padding:5px 6px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}#botlab th{position:sticky;top:0;background:#1d1822;font-weight:600;color:#bbb}
#botlab td.n{text-align:right;font-variant-numeric:tabular-nums}#botlab .bad{color:#ff7b7f}#botlab .ok{color:#6fe0a0}#botlab .min{width:30px;height:30px;padding:0}
#botlab.min .row,#botlab.min .tbl{display:none}#botlab.min{bottom:auto}</style>
<header><h2>Bot lab</h2><span id="blCount"></span><button class="min" id="blMin" title="Collapse">–</button></header>
<div class="row"><label style="flex:1">Drive <select id="blPick" style="flex:1;min-width:0;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:4px"></select></label></div>
<div class="row"><label>Runs <input type="number" id="blN" min="1" max="500" value="1"></label><label>Speed <select id="blSpd" style="background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:3px"><option value="1">1× watch</option><option value="2">2× watch</option><option value="4">4× watch</option><option value="0">Max, no view</option></select></label><label><input type="checkbox" id="blLoop"> Keep going</label></div>
<div class="row"><button class="go" id="blGo">Start</button><button id="blStop" disabled>Stop</button><span style="flex:1"></span><button id="blJson">Export JSON</button><button id="blCsv">Export CSV</button><button id="blClear">Clear</button></div>
<div class="row"><button id="blPause" disabled>Pause</button><button id="blPick2">Pick point</button><button id="blShot">Screenshot</button><input id="blNote" placeholder="What's wrong here?" style="flex:1;min-width:120px;background:#2a2430;color:#fff;border:1px solid #4a4250;border-radius:6px;padding:5px"><button id="blSave">Save note</button></div>
<div class="live" id="blPos" style="color:#9fd3ff;padding-top:0"></div>
<div class="live" id="blLive">Ready. Each window runs its own bots; results from every window appear below.</div>
<div class="tbl"><table><thead><tr><th>Drive</th><th class="n">Runs</th><th class="n">Pass</th><th class="n">Avg D</th><th class="n">S</th><th class="n">Stuck</th><th>Most common fault</th></tr></thead><tbody id="blBody"></tbody></table></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  $('blMin').onclick = () => el.classList.toggle('min');
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  $('blPick').innerHTML = opt('all:all', 'Everything') + opt('all:lesson', 'All lessons') + opt('all:puzzle', 'All puzzles') + opt('all:mock', 'All mock tests') +
    ['lesson', 'puzzle', 'mock'].map(k => `<optgroup label="${k === 'mock' ? 'Mock tests' : k[0].toUpperCase() + k.slice(1) + 's'}">${api.plans.filter(p => p.kind === k).map(p => opt(p.kind + ':' + p.id, p.title)).join('')}</optgroup>`).join('');
  let running = false, stopReq = false, paused = false, picking = false, picked = null;
  // ---- where am I: car position, clicked point, pause, screenshot, notes ----
  const fmt = (v) => v.toFixed(1);
  function where() {
    const A = api.A, pl = api.player, t = A.test, nr = t && t.ctx;
    return { area: A.id, drive: t && t.route ? t.route.name : '', x: +fmt(pl.x), z: +fmt(pl.z), heading: Math.round(((-pl.th * 180 / Math.PI) % 360 + 360) % 360), mph: Math.round(Math.abs(pl.v) * MPH),
      road: nr ? (nr.way.name || (nr.way.rb ? 'roundabout' : 'unnamed')) : '', s: t ? Math.round(t.sRoute) : 0, clock: Math.round(A.traffic ? A.traffic.clock : 0), picked };
  }
  setInterval(() => { if (!api.A.net) return; const w = where(); $('blPos').textContent = `car ${w.area} x ${w.x} z ${w.z} · ${w.road} · ${w.mph} mph · route ${w.s} m` + (picked ? `\npoint x ${picked.x} z ${picked.z} (${picked.road || 'off road'})` : ''); }, 250);
  $('blPause').onclick = () => { paused = !paused; $('blPause').textContent = paused ? 'Resume' : 'Pause'; };
  $('blPick2').onclick = () => { picking = !picking; $('blPick2').textContent = picking ? 'Click the road…' : 'Pick point'; document.body.style.cursor = picking ? 'crosshair' : ''; };
  document.getElementById('stage').addEventListener('click', (e) => {
    if (!picking) return; const p = api.pick(e.clientX, e.clientY); if (!p) return;
    picking = false; $('blPick2').textContent = 'Pick point'; document.body.style.cursor = '';
    picked = { x: +fmt(p.x), z: +fmt(p.z), road: p.road }; api.pin(p.x, p.z);
    try { navigator.clipboard.writeText(`${api.A.id} x ${picked.x} z ${picked.z}`); } catch (_) {}
  }, true);
  $('blShot').onclick = () => {
    const w = where(), img = api.snapshot(), t = api.A.test;
    const c = document.createElement('canvas'), im = new Image();
    im.onload = () => {
      const strip = 64; c.width = im.width; c.height = im.height + strip; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      g.fillStyle = '#18121a'; g.fillRect(0, im.height, c.width, strip); g.fillStyle = '#fff'; g.font = '600 14px ui-monospace,monospace';
      g.fillText(`${w.drive}  ·  area ${w.area}  ·  car x ${w.x} z ${w.z}  heading ${w.heading}°  ${w.mph} mph  ·  route ${w.s} m  ·  t ${w.clock} s`, 14, im.height + 26);
      g.fillStyle = '#ffcf8a'; g.fillText((picked ? `point x ${picked.x} z ${picked.z}  ·  ` : '') + (t && t.faults.length ? 'faults: ' + t.faults.map(f => f.text).join(' | ') : 'no faults') + ($('blNote').value ? '  ·  note: ' + $('blNote').value : ''), 14, im.height + 50);
      download(`bot-${w.area}-x${Math.round(w.x)}-z${Math.round(w.z)}.png`, null, null, c.toDataURL('image/png'));
    };
    im.src = img;
  };
  $('blSave').onclick = () => {
    const w = where(), text = $('blNote').value.trim(); if (!text) { $('blNote').focus(); return; }
    try { localStorage.setItem('cld.note.' + Date.now() + '.' + TAB, JSON.stringify({ ...w, text, at: Date.now() })); } catch (_) {}
    $('blNote').value = ''; $('blLive').textContent = 'Note saved with the coordinates. It is in the exports.';
  };

  function render() {
    const runs = allRuns(), by = new Map();
    for (const r of runs) { let g = by.get(r.key); if (!g) by.set(r.key, g = { title: r.title, runs: [] }); g.runs.push(r); }
    $('blCount').textContent = runs.length + ' runs';
    const rows = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, g]) => {
      const n = g.runs.length, pass = g.runs.filter(r => r.pass).length, avgD = g.runs.reduce((a, r) => a + r.D, 0) / n, S = g.runs.reduce((a, r) => a + r.S, 0), stuck = g.runs.filter(r => r.end !== 'done').length;
      const fc = new Map(), at = new Map(); for (const r of g.runs) { for (const f of r.faults) fc.set(f, (fc.get(f) || 0) + 1); for (const w of r.where || []) at.set(w[1], w); }
      const top = [...fc.entries()].sort((a, b) => b[1] - a[1])[0], hits = g.runs.reduce((a, r) => a + (r.hitBy ? r.hitBy.length : 0), 0);
      const loc = top && at.get(top[0]) ? ` <span style="color:#9fd3ff">@ ${at.get(top[0])[2]}, ${at.get(top[0])[3]}</span>` : '';
      return `<tr><td>${esc(g.title)}<br><span style="color:#888">${esc(key)}</span></td><td class="n">${n}</td><td class="n ${pass === n ? 'ok' : 'bad'}">${Math.round(pass / n * 100)}%</td><td class="n">${avgD.toFixed(1)}</td><td class="n ${S ? 'bad' : ''}">${S}</td><td class="n ${stuck ? 'bad' : ''}">${stuck}</td><td>${top ? esc(top[0]) + ' ×' + top[1] + loc : '<span class="ok">none</span>'}${hits ? `<br><span style="color:#888">hit by others ×${hits}</span>` : ''}</td></tr>`;
    });
    $('blBody').innerHTML = rows.join('') || '<tr><td colspan="7" style="color:#888">No runs yet.</td></tr>';
  }
  window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith(KEY)) render(); });
  setInterval(() => { if (!running) render(); }, 4000);

  async function runOne(p, label) {
    await api.start(p.kind, p.id);
    const A = api.A, t = A.test, wall0 = performance.now(), speed = +$('blSpd').value, watch = speed > 0;
    const limit = Math.max(240, t.route.len / 3 + 180); // seconds of sim time before giving up
    let sim = 0, bestS = t.sRoute, lastProg = 0, end = 'done';
    api.setInput(drive);
    while (!t.done) {
      if (stopReq) { end = 'stopped'; break; }
      if (paused) { await new Promise(r => requestAnimationFrame(r)); api.frame(0); continue; }
      if (watch) {
        // watching: one drawn frame per screen refresh, the sim moved on by `speed` × the real time that passed
        const f0 = performance.now(); await new Promise(r => requestAnimationFrame(r));
        const dt = Math.min(0.1, (performance.now() - f0) / 1000) * speed, n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n;
        if (n > 1) api.step(n - 1, h); api.frame(h); sim += dt;
      } else {
        const slice = performance.now();
        while (!t.done && performance.now() - slice < 30) { api.step(1, 0.05); sim += 0.05; }
      }
      if (t.sRoute > bestS + 1) { bestS = t.sRoute; lastProg = sim; }
      if (sim - lastProg > 90) { end = 'stuck'; break; }
      if (sim > limit) { end = 'timeout'; break; }
      $('blLive').textContent = `${label}  ${p.title}\n${Math.round(t.sRoute)} / ${Math.round(t.route.len)} m · ${Math.round(sim)} s sim · ${(sim / ((performance.now() - wall0) / 1000)).toFixed(0)}× real time · D ${t.D} S ${t.S}`;
      if (!watch) await yieldNow();
    }
    api.setInput(null);
    const res = t.done ? api.result() : { pass: false, why: end };
    const pl = api.player;
    saveRun({ key: p.kind + ':' + p.id, title: p.title, kind: p.kind, at: Date.now(), tab: TAB, end, pass: !!res.pass && end === 'done', D: t.D, S: t.S,
      faults: t.faults.map(f => f.text), cats: t.faults.map(f => f.cat), where: t.faults.map(f => [f.kind, f.text, f.x, f.z]), hitBy: (t.hits || []).map(h => [h.text, h.x, h.z]), why: res.why || '', len: Math.round(t.route.len), reached: Math.round(t.sRoute),
      simT: Math.round(sim), wallT: Math.round((performance.now() - wall0) / 100) / 10, rerouted: t.rerouted, at_xz: [Math.round(pl.x), Math.round(pl.z)] });
    render();
  }

  $('blGo').onclick = async () => {
    if (running) return;
    const v = $('blPick').value, list = v.startsWith('all:') ? api.plans.filter(p => v === 'all:all' || p.kind === v.slice(4)) : api.plans.filter(p => p.kind + ':' + p.id === v);
    if (!list.length) return;
    running = true; stopReq = false; paused = false; $('blGo').disabled = true; $('blStop').disabled = false; $('blPause').disabled = false; $('blPause').textContent = 'Pause'; api.botMode(true);
    try {
      do {
        const N = Math.max(1, +$('blN').value || 1), total = list.length * N; let k = 0;
        for (const p of list) for (let i = 0; i < N && !stopReq; i++) await runOne(p, `[${++k}/${total}]`);
      } while ($('blLoop').checked && !stopReq);
    } catch (err) { $('blLive').textContent = 'Stopped by an error: ' + err.message; console.error(err); }
    running = false; api.botMode(false); $('blGo').disabled = false; $('blStop').disabled = true; $('blPause').disabled = true; render();
    if (!stopReq) $('blLive').textContent = 'Finished. ' + allRuns().length + ' runs stored in this browser.';
  };
  $('blStop').onclick = () => { stopReq = true; $('blLive').textContent = 'Stopping after this step…'; };
  $('blJson').onclick = () => download('bot-runs.json', JSON.stringify({ runs: allRuns(), notes: allNotes() }, null, 1), 'application/json');
  $('blCsv').onclick = () => {
    const cols = ['key', 'title', 'at', 'tab', 'end', 'pass', 'D', 'S', 'len', 'reached', 'simT', 'wallT', 'rerouted', 'faults', 'where', 'hitBy'];
    const q = (v) => '"' + String(Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.join(' ') : x).join(' | ') : v ?? '').replace(/"/g, '""') + '"';
    const notes = allNotes().map(n => ['note', n.drive, new Date(n.at).toISOString(), n.area, `x ${n.x} z ${n.z}`, n.picked ? `point x ${n.picked.x} z ${n.picked.z}` : '', n.road, n.s, n.text].map(q).join(','));
    download('bot-notes.csv', ['type,drive,at,area,car,point,road,route_m,text'].concat(notes).join('\n'), 'text/csv');
    download('bot-runs.csv', [cols.join(',')].concat(allRuns().map(r => cols.map(c => q(c === 'at' ? new Date(r.at).toISOString() : r[c])).join(','))).join('\n'), 'text/csv');
  };
  $('blClear').onclick = () => { if (confirm('Delete every stored bot run and note in this browser?')) { clearRuns(); render(); } };
  render();
}
