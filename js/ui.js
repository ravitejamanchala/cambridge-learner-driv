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
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16v.5"/></svg>'
};
const TIPS = {
  keep: { rule: 'Rule 160', ctx: 'Normal driving', txt: 'Keep to the left unless road signs or markings tell you otherwise. Give cyclists plenty of room; Cambridge has a lot of them.' },
  speed: { rule: 'Rule 124', ctx: 'Speed limits', txt: 'A limit is the most you may do, not a target. Much of central Cambridge is 20 mph. Go slower near parked cars, schools and crossings.' },
  lights: { rule: 'Rule 175', ctx: 'Traffic lights', txt: 'Stop at the white line on red. Amber also means stop, unless you have already crossed the line or stopping could cause a crash. Red and amber together still means stop.' },
  rb: { rule: 'Rule 185', ctx: 'Roundabouts', txt: 'Give priority to traffic coming from your right. Go round clockwise, and check for cyclists on your left as you leave.' },
  zebra: { rule: 'Rule 195', ctx: 'Zebra crossings', txt: 'Watch for people waiting to cross and be ready to slow down or stop. Once someone has stepped onto the crossing, you must give way.' },
  signal: { rule: 'Rule 103', ctx: 'Signals', txt: 'Signal clearly and in good time so others know what you plan to do. Cancel the indicator once you have turned.' },
  oneway: { rule: 'Rule 143', ctx: 'One-way streets', txt: 'Traffic moves in one direction only. Choose your lane early for where you want to go, and never reverse the wrong way along it.' },
  cyclist: { rule: 'Rule 163', ctx: 'Cyclists', txt: 'When overtaking a cyclist at up to 30 mph, leave at least 1.5 metres, and more at higher speeds. If you cannot, wait behind until it is safe.' },
  cyclelane: { rule: 'Rule 140', ctx: 'Cycle lanes', txt: 'Do not drive in a cycle lane marked by a solid white line. Avoid one marked by a broken line unless it is unavoidable. Check for cyclists before turning left across it.' }
};

export function createUI(net) {
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
      const tp = pointOnRoute(route, ins.s); g.fillStyle = col['--accent']; g.beginPath(); g.arc(tp.x, tp.z, 5 / k, 0, Math.PI * 2); g.fill();
      g.fillStyle = col['--map-bg']; g.beginPath(); g.arc(tp.x, tp.z, 2.2 / k, 0, Math.PI * 2); g.fill();
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
  function renderFaults(t) {
    const ul = $('flist'); $('dCount').textContent = t.D; $('sCount').textContent = t.S;
    if (!t.faults.length) { ul.innerHTML = '<li class="empty">No faults yet. Keep left, watch your speed and signal before turning.</li>'; return; }
    ul.innerHTML = t.faults.slice(0, 30).map(f => `<li><span class="badge ${f.kind === 'S' ? 's' : ''}">${f.kind}</span><div class="fx"><strong>${esc(f.cat)}</strong><span>${esc(f.text)}</span></div></li>`).join('');
  }
  function hud(p, t, running) {
    const mph = Math.round(Math.abs(p.v) * MPH), ctx = t.ctx, way = ctx && ctx.d < 30 ? ctx.way : null;
    const limit = way ? way.mph : 30, over = mph > limit + 1;
    $('hudSpd').textContent = mph; $('hudLimit').textContent = limit; $('hudLimit').classList.toggle('over', over);
    $('hudLimit').title = !way ? 'Off the road network' : way.assumed ? `No limit tagged for ${way.name || 'this road'}; ${limit} mph assumed` : `${limit} mph limit from OpenStreetMap`;
    const rn = way ? (way.name || 'Unnamed road') : 'Off the road network';
    $('hudRoad').textContent = rn;
    const R = t.route, ins = R.instructions, i = Math.min(t.step, ins.length - 1), s = ins[i];
    let short = s.short, ico = s.icon, dtxt;
    const yd = Math.max(0, s.s - t.sRoute) * YD; dtxt = yd < 15 ? 'now' : yd > 1700 ? 'in ' + (yd / 1760).toFixed(1) + ' miles' : 'in ' + Math.round(yd / 10) * 10 + ' yd';
    if (t.offRoute) { short = 'Finding a new route'; ico = 'off'; dtxt = 'follow the road'; }
    if (!running && !t.done) dtxt = 'Press start';
    $('hudNext').textContent = short; $('hudDist').textContent = dtxt + ' · ' + rn;
    if (ico !== lastIco) { $('hudIco').innerHTML = ICON[ico]; lastIco = ico; }
    if (running) $('testState').textContent = t.rerouted ? `In progress · re-routed ${t.rerouted}×` : 'In progress';
    // tip
    let key = 'keep';
    if (mph > limit + 1) key = 'speed';
    else if (s.signal && s.s - t.sRoute < 110) key = 'signal';
    else if (t.bikeAhead) key = 'cyclist';
    else if ((s.kind === 'rb' && s.s - t.sRoute < 140) || (way && way.rb)) key = 'rb';
    else if (t.nearZebra) key = 'zebra';
    else if (t.nearLights || t.lightAhead) key = 'lights';
    else if (t.inCycleLaneRoad) key = 'cyclelane';
    else if (way && way.oneway) key = 'oneway';
    // traffic light ahead
    const la = running ? t.lightAhead : null, tl = $('hudLight'); tl.hidden = !la;
    if (la) { const st = la.state; tl.dataset.s = st; tl.setAttribute('aria-label', { R: 'Red light', RA: 'Red and amber', A: 'Amber light', G: 'Green light' }[st] + ' ahead'); }
    if (key !== tipKey) { tipKey = key; const tp = TIPS[key]; $('tipRule').textContent = tp.rule; $('tipCtx').textContent = tp.ctx; $('tipTxt').textContent = tp.txt; }
  }
  return { drawMap, renderSteps, renderFaults, hud };
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
