// The scriptable motorway driver shared by the browser checks (tests/motorway-lessons-browser.mjs) and
// the evidence recorder (tools/record_evidence.mjs), so a clip shows exactly the drive a check makes.
// It holds the route's line offset by .lane lanes to the right (moving across at half a lane a second
// towards .want), at .mph, or .gap seconds behind the car ahead in its lane. It looks and signals only
// when told to, which is how the careless drives are made.
//   .road    follow the motorway itself, whatever the route does (to carry on past an exit)
//   .shadow  on a slip road, sit alongside the nearest car within 100 m in the left-hand lane (to join into it)
//   .reverse hold the brake down, which at a standstill reverses
export async function installMwDriver(page) {
  await page.evaluate(() => {
    const a = window.cambridgeDrive, p = a.player;
    window.__mw = { lane: 0, want: 0, mph: 68, gap: null, road: false, shadow: false, reverse: false };
    a.addInput(() => {
      const M = window.__mw, t = a.test; if (!t.running) return null;
      if (M.reverse) return { throttle: 0, brake: 1, steer: 0 }; // held down at a standstill: backwards
      M.lane += Math.sign(M.want - M.lane) * Math.min(Math.abs(M.want - M.lane), 0.025);
      let q = a.lanePoint(Math.min(t.route.len, t.sRoute + 25)), off = M.lane * 3.65;
      const nr = t.ctx;
      if (M.road && nr && nr.way.cls === 'motorway') { const e = nr.e, s2 = Math.min(e.len - 0.1, nr.s + 25); let i = 0; while (i < e.n - 2 && e.cum[i + 1] < s2) i++;
        const L = e.cum[i + 1] - e.cum[i] || 1, u = (s2 - e.cum[i]) / L, tx = (e.px[i + 1] - e.px[i]) / L, tz = (e.pz[i + 1] - e.pz[i]) / L, lat = e.way.w / 2 - 3.65 * 0.5;
        q = { x: e.px[i] + tx * u * L + tz * lat, z: e.pz[i] + tz * u * L - tx * lat, tx, tz }; }
      const x = q.x - q.tz * off, z = q.z + q.tx * off;
      let want = M.mph * 0.44704; const fx = -Math.sin(p.th), fz = -Math.cos(p.th);
      if (M.shadow && nr && nr.way.cls === 'motorway_link') { let best = null;
        for (const c of a.traffic.cars) { if (!c.alive || c.e.way.cls !== 'motorway' || c.lane !== 0) continue; const f = (c.x - p.x) * fx + (c.z - p.z) * fz; if (Math.abs(f) < 100 && (!best || Math.abs(f) < Math.abs(best.f))) best = { f, v: c.v }; }
        if (best) want = Math.max(5, best.v + best.f * 0.3); }
      if (M.gap != null) for (const c of a.traffic.cars) { if (!c.alive) continue; const dx = c.x - p.x, dz = c.z - p.z, f = dx * fx + dz * fz;
        if (f > 0 && f < 150 && Math.abs(dx * fz - dz * fx) < 1.8) want = Math.min(want, c.v + ((f - 4.6) - M.gap * p.v) * 0.4); }
      let ang = Math.atan2(-(x - p.x), -(z - p.z)) - p.th; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
      return { throttle: p.v < want - 0.3 ? 1 : 0, brake: p.v > want + 0.6 ? Math.min(1, (p.v - want) / 4) : 0, steer: a.steerFor(ang, 2, p.v) };
    });
  });
  const steps = (n) => page.evaluate(k => window.cambridgeDrive.step(k), n);
  return {
    start: (id, lane = 0) => page.evaluate(async ([id, lane]) => { const a = window.cambridgeDrive; a.manual(true); await a.pick('lesson', id, true); a.manual(true);
      Object.assign(window.__mw, { lane, want: lane, mph: 68, gap: null, road: false, shadow: false, reverse: false }); }, [id, lane]),
    steps,
    look: (view) => page.evaluate(v => { const a = window.cambridgeDrive; a.player.observations.push({ view: v, at: a.traffic.clock }); }, view),
    signal: (d) => page.evaluate(d => { const p = window.cambridgeDrive.player; if (p.indicator !== d) p.signal(d); }, d),
    set: (o) => page.evaluate(o => Object.assign(window.__mw, o), o),
    untilDone: async () => { for (let i = 0; i < 60; i++) { if (await page.evaluate(() => window.cambridgeDrive.test.done)) return; await steps(200); } throw new Error('the lesson never finished'); },
    outcome: () => page.evaluate(() => ({ verdict: document.querySelector('#verdict').textContent, reasons: [...document.querySelectorAll('#rReasons li')].map(l => l.textContent),
      detail: [...document.querySelectorAll('#runDetailList li')].map(l => l.textContent), faults: window.cambridgeDrive.test.faults.map(f => `${f.kind} ${f.cat}: ${f.text}`).reverse() })),
    // is a lane clear from `back` metres behind to `ahead` metres in front?
    laneClear: (lane, back, ahead) => page.evaluate(([l, b, a]) => { const d = window.cambridgeDrive, p = d.player, fx = -Math.sin(p.th), fz = -Math.cos(p.th);
      return !d.traffic.cars.some(c => { if (!c.alive || c.lane !== l || c.e.way.cls !== 'motorway') return false; const f = (c.x - p.x) * fx + (c.z - p.z) * fz; return f > -b && f < a; }); }, [lane, back, ahead]),
    // metres to where the route's exit slip road leaves (negative once past it); null if there is none
    exitIn: () => page.evaluate(() => { const t = window.cambridgeDrive.test, R = t.route, k = R.steps.findIndex(x => x.e.way.cls === 'motorway_link'); return k > 0 ? R.stepS[k] - t.sRoute : null; }),
    joinerNear: () => page.evaluate(() => window.cambridgeDrive.traffic.cars.some(c => c.alive && c.e.way.cls === 'motorway_link' && c.e.len - c.s < 220)),
    joinersIn: () => page.evaluate(() => !window.cambridgeDrive.traffic.cars.some(c => c.alive && c.scripted && c.e.way.cls === 'motorway_link')),
    // the first of a stream of faster cars just behind on the right
    fasterJustBehind: (lane = 1) => page.evaluate(l => { const a = window.cambridgeDrive, p = a.player, fx = -Math.sin(p.th), fz = -Math.cos(p.th);
      return a.traffic.cars.some(c => c.alive && c.lane === l && (c.x - p.x) * fx + (c.z - p.z) * fz > -18 && (c.x - p.x) * fx + (c.z - p.z) * fz < -8); }, lane),
  };
}
