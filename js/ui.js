// Everything on screen outside the 3D view: HUD, heading-up route map, examiner tiles, fault sheet, Highway Code tips.
const DUMMY = { textContent: '', innerHTML: '', hidden: false, dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} };
const $ = id => document.getElementById(id) || DUMMY; // tolerate layouts that leave some HUD parts out
const YD = 1.09361, MPH = 2.23694;

const ICON = {
  straight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20V4M6 10l6-6 6 6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 20v-7a3 3 0 0 0-3-3H5M9 6l-4 4 4 4"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 20v-7a3 3 0 0 1 3-3h8M15 6l4 4-4 4"/></svg>',
  rb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="4"/><path d="M12 20v-6M16 10h4M8 10H4M12 6V2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 20V8a3 3 0 0 1 3-3h6M13 2l4 3-4 3"/><path d="M4 20h16"/></svg>',
  look: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16v.5"/></svg>'
};
const TIPS = {
  keep: { rule: 'Rule 160', ctx: 'Normal driving', txt: 'Keep to the left unless road signs or markings tell you otherwise. Give cyclists plenty of room.' },
  speed: { rule: 'Rule 124', ctx: 'Speed limits', txt: 'A limit is the most you may do, not a target. Many town streets are 20 mph. Go slower near parked cars, schools and crossings.' },
  lights: { rule: 'Rule 175', ctx: 'Traffic lights', txt: 'Stop at the white line on red. Amber also means stop, unless you have already crossed the line or stopping could cause a collision. Red and amber together still means stop.' },
  rb: { rule: 'Rule 185', ctx: 'Roundabouts', txt: 'Give priority to traffic coming from your right. Go round clockwise, and check for cyclists on your left as you leave.' },
  zebra: { rule: 'Rule 195', ctx: 'Zebra crossings', txt: 'Watch for people waiting to cross and be ready to slow down or stop. Once someone has stepped onto the crossing, you must give way.' },
  signal: { rule: 'Rule 103', ctx: 'Signals', txt: 'Signal clearly and in good time so others know what you plan to do. Cancel the indicator once you have turned.' },
  oneway: { rule: 'Rule 143', ctx: 'One-way streets', txt: 'Traffic moves in one direction only. Choose your lane early for where you want to go, and stay in your lane unless you need to change.' },
  dual: { rule: 'Rule 137', ctx: 'Dual carriageways', txt: 'On a two-lane dual carriageway, stay in the left-hand lane. Use the right-hand lane for overtaking or turning right, then move back to the left.' },
  cyclist: { rule: 'Rule 163', ctx: 'Cyclists', txt: 'When overtaking a cyclist at up to 30 mph, leave at least 1.5 metres, and more at higher speeds. If you cannot, wait behind until it is safe.' },
  cyclelane: { rule: 'Rule 140', ctx: 'Cycle lanes', txt: 'Do not drive in a cycle lane marked by a solid white line. Avoid one marked by a broken line unless it is unavoidable. Check for cyclists before turning left across it.' }
};

export function createUI(net) {
  // Highway Code tip: a small chip that opens for a few seconds when the advice changes; tap to open or close
  const tipCard = document.getElementById('tipCard'); let tipTimer = 0;
  function openTip(ms) { if (!tipCard) return; tipCard.classList.add('open'); tipCard.setAttribute('aria-expanded', 'true'); clearTimeout(tipTimer); if (ms) tipTimer = setTimeout(() => { tipCard.classList.remove('open'); tipCard.setAttribute('aria-expanded', 'false'); }, ms); }
  if (tipCard) tipCard.addEventListener('click', () => { if (tipCard.classList.contains('open')) { clearTimeout(tipTimer); tipCard.classList.remove('open'); tipCard.setAttribute('aria-expanded', 'false'); } else openTip(0); });
  const mini = $('mini'), g = mini.getContext('2d'); let col = {}, colT = -9, lastIco = '', tipKey = '';
  // drag to pan, wheel or pinch to zoom; pan is a world offset from the car
  const view = { px: 0, pz: 0, zoom: 1, th: 0, k: 0.38 };
  const recentre = $('mapRecentre');
  const panned = () => Math.hypot(view.px, view.pz) > 2 || Math.abs(view.zoom - 1) > 0.05;
  const showRecentre = () => { recentre.hidden = !panned(); };
  recentre.addEventListener('click', () => { view.px = view.pz = 0; view.zoom = 1; showRecentre(); });
  attachDrag(mini, (dx, dy) => {
    const c = Math.cos(view.th), s = Math.sin(view.th), k = view.k * view.zoom;
    view.px -= (dx * c + dy * s) / k; view.pz -= (-dx * s + dy * c) / k; showRecentre();
  }, (f) => { view.zoom = Math.min(4, Math.max(0.25, view.zoom * f)); showRecentre(); });
  function readCols() { const cs = getComputedStyle(document.documentElement); ['--map-bg', '--map-pave', '--map-road', '--map-label', '--accent', '--bad'].forEach(k => col[k] = cs.getPropertyValue(k).trim() || '#888'); }

  function drawMap(p, route, step, clock) {
    if (clock - colT > 1) { readCols(); colT = clock; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = mini.clientWidth, H = mini.clientHeight; if (!W || !H) return;
    if (mini.width !== Math.round(W * dpr) || mini.height !== Math.round(H * dpr)) { mini.width = Math.round(W * dpr); mini.height = Math.round(H * dpr); }
    view.k = W < 150 ? 0.3 : 0.38; view.th = p.th;
    const k = view.k * view.zoom, S = dpr * k, cx = mini.width / 2, cy = mini.height * 0.66, cs = Math.cos(p.th), sn = Math.sin(p.th);
    const mx = p.x + view.px, mz = p.z + view.pz; // map centre
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = col['--map-bg']; g.fillRect(0, 0, mini.width, mini.height);
    g.translate(cx, cy); g.rotate(p.th); g.scale(S, S); g.translate(-mx, -mz); g.lineCap = 'round'; g.lineJoin = 'round';
    const reach = Math.hypot(mini.width, mini.height) / S, C = net.chunkSize, seen = new Set(), list = [];
    for (let i = Math.floor((mx - reach) / C); i <= Math.floor((mx + reach) / C); i++)
      for (let j = Math.floor((mz - reach) / C); j <= Math.floor((mz + reach) / C); j++) {
        const set = net.chunks.get(net.ck(i, j)); if (set) for (const e of set) if (!seen.has(e.id)) { seen.add(e.id); list.push(e); }
      }
    for (const [c, extra] of [['--map-pave', 5], ['--map-road', 0]]) {
      g.strokeStyle = col[c];
      for (const e of list) { g.lineWidth = Math.max(e.way.w + extra, (extra ? 2.4 : 1.4) / k); g.beginPath(); g.moveTo(e.px[0], e.pz[0]); for (let i = 1; i < e.n; i++) g.lineTo(e.px[i], e.pz[i]); g.stroke(); }
    }
    if (route) {
      g.strokeStyle = col['--accent']; g.globalAlpha = 0.9; g.lineWidth = 3.4 / k; g.beginPath();
      for (let i = 0; i < route.xs.length; i++) i ? g.lineTo(route.xs[i], route.zs[i]) : g.moveTo(route.xs[i], route.zs[i]); g.stroke(); g.globalAlpha = 1;
      const ins = route.instructions[Math.min(step, route.instructions.length - 1)];
      // destination: chequered flag; next instruction: pulsing pink target
      const ep = pointOnRoute(route, route.len), fs = 3.2 / k;
      g.save(); g.translate(ep.x, ep.z); g.rotate(-p.th); g.fillStyle = '#2b2030'; g.fillRect(-0.4 / k, -4 * fs, 0.8 / k, 4 * fs);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) { g.fillStyle = (a + b) % 2 ? '#fff' : '#2b2030'; g.fillRect(b * fs * 0.9, -4 * fs + a * fs * 0.9, fs * 0.9, fs * 0.9); }
      g.restore();
      const tp = pointOnRoute(route, ins.s), pulse = (clock * 1.2) % 1;
      g.strokeStyle = col['--accent']; g.globalAlpha = 1 - pulse; g.lineWidth = 2 / k; g.beginPath(); g.arc(tp.x, tp.z, (7 + pulse * 9) / k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(tp.x, tp.z, 7.5 / k, 0, Math.PI * 2); g.fill();
      g.fillStyle = col['--accent']; g.beginPath(); g.arc(tp.x, tp.z, 5.5 / k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(tp.x, tp.z, 2 / k, 0, Math.PI * 2); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const nr = Math.min(cx, cy, mini.height - cy) - 11 * dpr, nx = cx + sn * nr, ny = cy - cs * nr;
    g.fillStyle = col['--map-label']; g.beginPath(); g.arc(nx, ny, 7.5 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = col['--map-bg']; g.font = `600 ${9 * dpr}px Geist, ui-sans-serif, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5 * dpr);
    const ax = cx + (-view.px * cs - -view.pz * sn) * S, ay = cy + (-view.px * sn + -view.pz * cs) * S;
    g.save(); g.translate(ax, ay); g.fillStyle = col['--bad']; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.beginPath();
    g.moveTo(0, -9 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  function renderSteps(route, step) {
    const ins = route.instructions, i = Math.min(step, ins.length - 1);
    $('nextTxt').textContent = ins[i].text;
    $('steps').innerHTML = ins.map((x, k) => `<li class="${k < i ? 'done' : k === i ? 'cur' : ''}"><b>${String(k + 1).padStart(2, '0')}</b><span>${esc(x.short)}</span></li>`).join('');
  }
  // marking board on the driving screen and the full sheet in the pause menu
  let shown = 0, hitT = 0, allowD = 15;
  const mbEl = document.getElementById('markBoard'); if (mbEl) mbEl.addEventListener('click', () => { clearTimeout(hitT); mbEl.classList.toggle('open'); });
  function renderFaults(t, maxD) {
    $('markBoard').hidden = !!t.experimental;
    const heading = document.querySelector('#pauseSheet .detail h3'); if (heading) heading.textContent = t.experimental ? 'Practice mode' : 'Marking sheet';
    if (t.experimental) { shown = 0; $('flist').innerHTML = '<li class="empty">Experimental practice — grading and saved results are disabled. Physical collisions remain enabled.</li>'; return; }
    if (maxD !== undefined) allowD = maxD;
    const ul = $('flist'); $('dCount').textContent = t.D; $('sCount').textContent = t.S;
    $('dMax').textContent = '/' + allowD; $('sCount').parentElement.classList.toggle('on', t.S > 0);
    const bar = $('dBar'); bar.style.width = Math.min(100, t.D / Math.max(1, allowD) * 100) + '%'; bar.parentElement.classList.toggle('over', t.D > allowD);
    const fresh = t.faults.length > shown ? t.faults.length - shown : 0; shown = t.faults.length;
    $('mbList').innerHTML = t.faults.length ? t.faults.slice(0, 2).map((f, i) => `<li class="${i < fresh ? 'new' : ''}"><i class="${f.kind === 'S' ? 's' : ''}">${f.kind}</i><span><b>${esc(f.cat)}</b>${esc(f.text)}</span></li>`).join('') : '<li class="ok">No faults yet</li>';
    if (fresh) { const mb = $('markBoard'); mb.classList.remove('hit-d', 'hit-s'); mb.classList.add(t.faults[0].kind === 'S' ? 'hit-s' : 'hit-d', 'open'); clearTimeout(hitT); hitT = setTimeout(() => mb.classList.remove('hit-d', 'hit-s', 'open'), 4500); }
    if (!t.faults.length) { ul.innerHTML = '<li class="empty">No faults yet. Keep left, watch your speed and signal before turning.</li>'; return; }
    ul.innerHTML = t.faults.slice(0, 30).map(f => `<li><span class="badge ${f.kind === 'S' ? 's' : ''}">${f.kind}</span><div class="fx"><strong>${esc(f.cat)}</strong><span>${esc(f.text)}</span></div></li>`).join('');
  }
  // The instruction box sits centred at the top, and grows with what it carries (a junction name, a
  // lane strip). On a mid-width window that can reach the speedometer cluster: slide it left just far
  // enough to clear whatever shares its band on the right, but never into the map. Measured from the
  // real elements every update, never cached, as the interface guidelines ask.
  function fitNextBox(box) {
    box.style.setProperty('--nudge', '0px');
    const b = box.getBoundingClientRect(); if (!b.width) return;
    const band = (r) => r.width > 0 && r.top < b.bottom && r.bottom > b.top;
    let need = 0;
    for (const el of document.querySelectorAll('.hud-right > *')) { const r = el.getBoundingClientRect(); if (band(r)) need = Math.max(need, b.right - (r.left - 8)); }
    if (need <= 0) return;
    const map = document.querySelector('.hud-map')?.getBoundingClientRect(), room = map && band(map) ? b.left - (map.right + 8) : b.left - 8;
    box.style.setProperty('--nudge', Math.max(0, Math.min(need, room)) + 'px');
  }
  function hud(p, t, running) {
    const mph = Math.round(Math.abs(p.v) * MPH), ctx = t.ctx, way = ctx && ctx.d < 30 ? ctx.way : null;
    const temp = t.restriction?.limit() ?? null, limit = temp ?? (way ? way.mph : 30), over = mph > limit + 1;
    $('hudSpd').textContent = mph; $('hudLimit').textContent = limit; $('hudLimit').classList.toggle('over', over);
    $('hudLimit').title = temp != null ? `${limit} mph: the ${t.restriction.what}` : !way ? 'Off the road network' : way.assumed ? `No limit tagged for ${way.name || 'this road'}; ${limit} mph assumed` : `${limit} mph limit`;
    const rn = way ? (way.name || (way.rb ? 'Roundabout' : 'Unnamed road')) : 'Off the road network';
    $('hudRoad').textContent = rn;
    const R = t.route, ins = R.instructions, i = Math.min(t.step, ins.length - 1), s = ins[i];
    let short = s.short, ico = s.icon, dtxt;
    const yd = Math.max(0, s.s - t.sRoute) * YD; dtxt = yd < 15 ? 'now' : yd > 1700 ? 'in ' + (yd / 1760).toFixed(1) + ' miles' : 'in ' + Math.round(yd / 10) * 10 + ' yd';
    if (s.final && yd > 280) { short = 'Follow the road ahead'; ico = 'straight'; } // don't announce "pull up" a mile early
    // roundabouts: once past the exit before yours, the prompt is to signal left
    if (s.kind === 'rb' && s.exitSignal && t.sRoute > s.s && t.sRoute > s.prevExitS - 0.5 && t.sRoute < s.exitS) { short = p.indicator === 'L' ? 'Leave at the next exit' : 'Signal left now: your exit is next'; dtxt = 'now'; }
    else if (s.kind === 'rb' && t.sRoute > s.s && t.sRoute < s.exitS) { short = s.exitN > 1 ? `Stay on · ${s.exitN}${['', 'st', 'nd', 'rd'][s.exitN] || 'th'} exit` : 'Leave at the 1st exit'; dtxt = 'on the roundabout'; }
    if (t.offRoute) { short = 'Finding a new route'; ico = 'off'; dtxt = 'follow the road'; }
    // parked at the kerb: look round before moving off
    const lb = $('lookBtn'), looked = clockSim() - p.lookAt < 10;
    if (running && t.parked) { short = looked ? 'Move off when it is safe' : 'Look round (B), then move off'; ico = 'look'; dtxt = looked ? 'signal if anyone could benefit' : 'mirrors and blind spot'; }
    lb.classList.toggle('ask', running && t.parked && !looked); lb.classList.toggle('done', running && t.parked && looked);
    if (!running && !t.done) dtxt = 'Press start';
    // sign-first: the icon says what to do; show the distance, and words only for prompts that need them
    // free drive counts down to the next motorway junction: the number and where it goes
    const prompt = s.junction && !t.offRoute && !t.parked ? `J${s.junction} · ${s.to}` : /Look round|Move off|Signal left|Finding|Pull up|Leave at/.test(short) ? short.replace('Look round (B), then move off', 'Look round · B').replace('Move off when it is safe', 'Move off').replace('Signal left now: your exit is next', 'Signal left').replace('Finding a new route', 'New route').replace('Leave at the next exit', 'Exit next').replace('Pull up on the left', 'Pull up left') : '';
    $('hudNext').textContent = !running && !t.done ? 'Ready' : t.parked ? '' : (dtxt === 'now' || dtxt === 'on the roundabout' ? 'now' : dtxt.replace(/^in /, '').replace('follow the road', '…'));
    $('hudDist').textContent = prompt;
    $('hudNextBox').setAttribute('aria-label', s.text);
    const ex = $('hudExit'), exN = s.kind === 'rb' && !t.offRoute && !t.parked ? s.exitN : 0; ex.hidden = !exN; ex.textContent = exN || '';
    // lanes: the arrows' lanes before a junction, or on a motorway lesson the lanes that are right for you
    // now (amber) and the one you are in (marked underneath): an instrument, not a sentence
    const mw = running && t.laneGuide, ln = $('hudLanes'), showL = mw || (s.laneOK && s.lanes >= 2 && s.lanes <= 4 && !t.offRoute && s.s - t.sRoute < 250 && s.s > t.sRoute - 2);
    const lanes = mw ? mw.lanes : s.lanes, ok = mw ? mw.ok : s.laneOK, here = mw ? mw.here : -1, shut = mw?.shut || [];
    ln.hidden = !showL; if (showL) { const k = lanes + ':' + ok.join(',') + ':' + here + ':' + shut.join(','); if (ln.dataset.k !== k) { ln.dataset.k = k; ln.innerHTML = Array.from({ length: lanes }, (_, i) => `<i class="${[ok.includes(i) ? 'on' : '', shut.includes(i) ? 'shut' : '', i === here ? 'me' : ''].join(' ').trim()}"></i>`).join(''); } }
    if (ico !== lastIco) { $('hudIco').innerHTML = ICON[ico]; lastIco = ico; }
    if (running) $('testState').textContent = t.rerouted ? `In progress · re-routed ${t.rerouted}×` : 'In progress';
    // Getting started: the state goes on the instruments, not into a sentence over the road.
    const basic = t.basicStatus, ck = $('hudChecks'), tg = $('hudTarget');
    ck.hidden = !basic?.checks;
    if (basic?.checks) { const k = basic.checks.join(','); if (ck.dataset.k !== k) { ck.dataset.k = k; ck.innerHTML = basic.checks.map(on => `<i class="${on ? 'on' : ''}"></i>`).join(''); } }
    const band = basic?.band, inBand = band && mph >= band[0] && mph <= band[1];
    tg.hidden = !band;
    if (band) { tg.textContent = band[0] ? `${band[0]}–${band[1]}` : `under ${band[1]}`; tg.classList.toggle('on', !!inBand); }
    document.querySelector('.hud-spd').classList.toggle('inband', !!inBand);
    if (basic) {
      if (basic.value) $('hudNext').textContent = basic.value;
      if (basic.checks) $('hudNext').textContent = basic.checks.filter(Boolean).length + '/3';
    }
    if (t.mode === 'manoeuvre' && t.manoeuvreStatus) {
      const m = t.manoeuvreStatus; $('hudNext').textContent = Math.round(m.remaining) + ' m'; $('hudDist').textContent = ''; $('hudNextBox').setAttribute('aria-label', 'Distance to the target'); $('hudExit').hidden = true; $('hudLanes').hidden = true; $('hudIco').innerHTML = ICON.look; lastIco = 'parking';
    }
    // Coaching, when the learner has asked for it: the scenario's own running line, under the
    // instruction box. Off by default, so a drive carries nothing the lesson card already said.
    const coach = $('hudCoach'), coachTxt = t.experimental ? 'Experimental practice · ungraded' : running ? t.coach || '' : '';
    coach.hidden = !coachTxt;
    if (coachTxt && coach.textContent !== coachTxt) coach.textContent = coachTxt;
    // An alert takes the HUD box over while it lasts: the state goes where the learner already looks,
    // and nothing is drawn across the road.
    const alert = t.alert, boxEl = $('hudNextBox');
    boxEl.classList.toggle('warn', alert?.tone === 'warn');
    boxEl.classList.toggle('stop', alert?.tone === 'stop');
    if (alert) {
      $('hudNext').textContent = alert.tone === 'stop' ? alert.label : '';
      $('hudDist').textContent = alert.tone === 'stop' ? '' : alert.label;
      $('hudChecks').hidden = true; $('hudExit').hidden = true; $('hudLanes').hidden = true;
      boxEl.setAttribute('aria-label', alert.label);
    }
    fitNextBox(boxEl);
    // tip
    let key = 'keep';
    if (mph > limit + 1) key = 'speed';
    else if (s.signal && s.s - t.sRoute < 110) key = 'signal';
    else if (t.bikeAhead) key = 'cyclist';
    else if ((s.kind === 'rb' && s.s - t.sRoute < 140) || (way && way.rb)) key = 'rb';
    else if (t.nearZebra) key = 'zebra';
    else if (t.nearLights || t.lightAhead) key = 'lights';
    else if (t.inCycleLaneRoad) key = 'cyclelane';
    else if (way && way.oneway && way.mph >= 50) key = 'dual';
    else if (way && way.oneway) key = 'oneway';
    // traffic light ahead
    const la = running ? t.lightAhead : null, tl = $('hudLight'); tl.hidden = !la;
    if (la) { const st = la.state; tl.dataset.s = st; tl.setAttribute('aria-label', { R: 'Red light', RA: 'Red and amber', A: 'Amber light', G: 'Green light' }[st] + ' ahead'); }
    if (pinned && (t.mode === 'manoeuvre' || clockNow() < pinned.until)) key = 'lesson';
    if (key !== tipKey) { tipKey = key; const tp = key === 'lesson' ? pinned.tip : TIPS[key]; $('tipRule').textContent = tp.rule; $('tipCtx').textContent = tp.ctx; $('tipTxt').textContent = tp.txt; if (running && !matchMedia('(pointer:coarse)').matches) openTip(5000); } // phones: chip only, tap to read
  }
  // show the lesson's own Highway Code rule for the first part of a drive
  let pinned = null; const clockNow = () => performance.now() / 1000;
  function pinTip(rule, title, secs = 20) { pinned = rule ? { tip: { rule: rule.n, ctx: title, txt: rule.t }, until: clockNow() + secs } : null; tipKey = ''; }
  let clockSim = () => 0;
  return { drawMap, renderSteps, renderFaults, hud, pinTip, setNet: (n) => { net = n; }, setClock: (f) => { clockSim = f; } };
}
export function pointOnRoute(route, s) {
  const c = route.cum; let lo = 0, hi = c.length - 1; s = Math.max(0, Math.min(route.len, s));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const L = (c[hi] - c[lo]) || 1, u = (s - c[lo]) / L;
  return { x: route.xs[lo] + (route.xs[hi] - route.xs[lo]) * u, z: route.zs[lo] + (route.zs[hi] - route.zs[lo]) * u, tx: (route.xs[hi] - route.xs[lo]) / L, tz: (route.zs[hi] - route.zs[lo]) / L };
}
// one-finger / mouse drag -> onPan(dxCss, dyCss); wheel or two-finger pinch -> onZoom(factor)
export function attachDrag(el, onPan, onZoom) {
  const pts = new Map(); let pinch = 0;
  el.addEventListener('pointerdown', e => { e.preventDefault(); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('dragging'); if (pts.size === 2) pinch = spread(); });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) onPan(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && onZoom) { const d = spread(); if (pinch) onZoom(d / pinch); pinch = d; }
  });
  const up = e => { pts.delete(e.pointerId); pinch = pts.size === 2 ? spread() : 0; if (!pts.size) el.classList.remove('dragging'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  if (onZoom) el.addEventListener('wheel', e => { e.preventDefault(); onZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  function spread() { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
