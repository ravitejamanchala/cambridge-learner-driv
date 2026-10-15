// Learner profiles and progress, stored in this browser (localStorage).
// Guest storage remains separate from account storage and the cloud sync outbox.
const GUEST_KEY = 'cambridge-learner-drive.v1';
let KEY = GUEST_KEY;
const listeners = new Set();
const notify = (kind, value) => { for (const fn of listeners) fn(kind, value); };
let mem = { profiles: [], current: null };

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw) || mem; } catch (_) { /* private mode or blocked storage: keep in memory */ }
  if (!Array.isArray(mem.profiles)) mem.profiles = [];
  for (const p of mem.profiles) { p.lessons ||= {}; p.mocks ||= []; p.history ||= []; p.practiceSeconds ||= 0; }
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) {} notify('progress', Profiles.current()); }

export const Profiles = {
  init() { load(); return this; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  guest() { try { const g = JSON.parse(localStorage.getItem(GUEST_KEY)); return g?.profiles?.find(p => p.id === g.current) || null; } catch { return null; } },
  useAccount(userId, profile) {
    KEY = userId ? GUEST_KEY + '.account.' + userId : GUEST_KEY;
    mem = { profiles: [], current: null };
    if (userId) { if (profile) { mem = { profiles:[{...structuredClone(profile), id:'account'}], current:'account' }; } }
    else load();
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {}
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('learner-account-change'));
  },
  isAccount() { return KEY !== GUEST_KEY; },
  scope() { return KEY; },
  list() { return mem.profiles; },
  current() { return mem.profiles.find(p => p.id === mem.current) || null; },
  create(name) {
    name = String(name || '').trim().slice(0, 40); if (!name) return null;
    const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, created: Date.now(), lessons: {}, mocks: [], history: [], practiceSeconds: 0 };
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
    L.latestReport = r.report || null;
    p.lessons[id] = L; this.recordHistory({ ...r, lessonId: id }); save();
  },
  recordMock(routeId, r) {
    const p = this.current(); if (!p) return;
    p.mocks.unshift({ route: routeId, at: Date.now(), D: r.D, S: r.S, pass: r.pass }); p.mocks = p.mocks.slice(0, 50); this.recordHistory({ ...r, routeId }); save();
  },
  recordHistory(r) { const p = this.current(); if (!p) return; p.history ||= []; p.practiceSeconds ||= 0;
    const duration = Number.isFinite(r.duration) ? Math.max(0, r.duration) : 0;
    p.practiceSeconds += duration; const entry = { ...r, duration, at: Date.now(), sessionId: crypto.randomUUID() }; p.history.unshift(entry); p.history = p.history.slice(0, 50); notify('session', entry);
  },
  summary() { const p = this.current(); return { history: p?.history || [], practiceSeconds: p?.practiceSeconds || 0, attempts: Object.values(p?.lessons || {}).reduce((n, l) => n + (l.attempts || 0), 0) + (p?.mocks?.length || 0) }; },
  mockStats(routeId) {
    const p = this.current(); if (!p) return null; const m = p.mocks.filter(x => x.route === routeId);
    return m.length ? { tries: m.length, passes: m.filter(x => x.pass).length, last: m[0] } : null;
  }
};
