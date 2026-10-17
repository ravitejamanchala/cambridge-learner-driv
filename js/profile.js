// Learner profiles and progress, stored in this browser (localStorage).
// Swap `load`/`save` for a backend (Supabase, Firebase) later to sync accounts across devices.
const KEY = 'cambridge-learner-drive.v1';
let mem = { profiles: [], current: null };

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw) || mem; } catch (_) { /* private mode or blocked storage: keep in memory */ }
  if (!Array.isArray(mem.profiles)) mem.profiles = [];
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) {} }

// The examiner's faults, reduced to { category: [total, serious] }. Counting here rather than
// keeping a row per fault means nothing is truncated on a bad drive and a profile stays small.
// This is what lets the result sheet say which categories to practise, not just how many faults.
function packFaults(faults) {
  const out = {};
  if (!Array.isArray(faults)) return out;
  for (const f of faults) {
    if (!f || !f.cat) continue;
    const e = out[f.cat] || (out[f.cat] = [0, 0]);
    e[0]++; if (f.kind === 'S') e[1]++;
  }
  return out;
}

export const Profiles = {
  init() { load(); return this; },
  list() { return mem.profiles; },
  current() { return mem.profiles.find(p => p.id === mem.current) || null; },
  create(name) {
    name = String(name || '').trim().slice(0, 40); if (!name) return null;
    const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, created: Date.now(), lessons: {}, mocks: [] };
    mem.profiles.push(p); mem.current = p.id; save(); return p;
  },
  select(id) { if (mem.profiles.some(p => p.id === id)) { mem.current = id; save(); } return this.current(); },
  remove(id) { mem.profiles = mem.profiles.filter(p => p.id !== id); if (mem.current === id) mem.current = null; save(); },
  lesson(id) { const p = this.current(); return (p && p.lessons[id]) || null; },
  recordLesson(id, r) {
    const p = this.current(); if (!p) return;
    const L = p.lessons[id] || { attempts: 0, passed: false, bestD: null };
    L.attempts++; L.last = Date.now(); if (r.pass) L.passed = true;
    if (r.pass && (L.bestD === null || r.D < L.bestD)) L.bestD = r.D;
    L.f = packFaults(r.faults);
    p.lessons[id] = L; save();
  },
  recordMock(routeId, r) {
    const p = this.current(); if (!p) return;
    p.mocks.unshift({ route: routeId, at: Date.now(), D: r.D, S: r.S, pass: r.pass, f: packFaults(r.faults) }); p.mocks = p.mocks.slice(0, 50); save();
  },
  mockStats(routeId) {
    const p = this.current(); if (!p) return null; const m = p.mocks.filter(x => x.route === routeId);
    return m.length ? { tries: m.length, passes: m.filter(x => x.pass).length, last: m[0] } : null;
  },
  // Categories this learner keeps losing marks on, worst first: serious faults rank above
  // driving faults, then sheer frequency. Pass a routeId to narrow it to one route.
  weakAreas(routeId, limit = 3) {
    const p = this.current(); if (!p) return [];
    const by = new Map();
    const add = m => { for (const cat in (m || {})) { const [n, S] = m[cat]; const e = by.get(cat) || { cat, n: 0, S: 0 }; e.n += n; e.S += S; by.set(cat, e); } };
    for (const m of p.mocks) if (!routeId || m.route === routeId) add(m.f);
    if (!routeId) for (const id in p.lessons) add(p.lessons[id].f);
    return [...by.values()].sort((a, b) => (b.S - a.S) || (b.n - a.n)).slice(0, limit);
  },
  // The last few mocks, oldest first, so the result sheet can show whether faults are coming down.
  trend(routeId, limit = 6) {
    const p = this.current(); if (!p) return [];
    return p.mocks.filter(m => !routeId || m.route === routeId).slice(0, limit).reverse()
      .map(m => ({ D: m.D, S: m.S, pass: m.pass, at: m.at }));
  }
};
