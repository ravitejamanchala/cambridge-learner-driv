// Game-style lobby: learner chip with level/XP, course and mock-test sheets, Highway Code list,
// learner picker, the "pass" progress card, the selected-drive card and PLAY.
import { UNITS, LESSONS } from './course.js';
import { Profiles } from './profile.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const miles = r => (r.len / 1609.34).toFixed(1);
const ICO = {
  lesson: '<svg viewBox="0 0 40 40"><path d="M6 9c5-2 10-2 14 1v22c-4-3-9-3-14-1z" fill="#ffd28a" stroke="#c9741f" stroke-width="2" stroke-linejoin="round"/><path d="M34 9c-5-2-10-2-14 1v22c4-3 9-3 14-1z" fill="#ffe7bd" stroke="#c9741f" stroke-width="2" stroke-linejoin="round"/></svg>',
  mock: '<svg viewBox="0 0 40 40"><rect x="8" y="7" width="24" height="28" rx="4" fill="#fff" stroke="#8a6ae3" stroke-width="2"/><rect x="14" y="4" width="12" height="7" rx="2.5" fill="#b49cf5" stroke="#8a6ae3" stroke-width="2"/><path d="M13 19l3 3 6-6M13 28h14" stroke="#ef4f97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// XP: 40 per lesson passed, 100 per mock pass, 10 per mock attempt. 100 XP per level.
function progress(p) {
  if (!p) return { done: 0, mockPass: 0, xp: 0, lv: 1, frac: 0 };
  const done = LESSONS.filter(l => (p.lessons[l.id] || {}).passed).length;
  const mockPass = p.mocks.filter(m => m.pass).length;
  const xp = done * 40 + mockPass * 100 + p.mocks.length * 10;
  return { done, mockPass, xp, lv: 1 + Math.floor(xp / 100), frac: (xp % 100) / 100 };
}

export function createHub({ routes, lessonRoute, onPick, onStart }) {
  Profiles.init();
  const st = { kind: 'lesson', lesson: LESSONS[0].id, route: 0 };
  const status = (id) => { const L = Profiles.lesson(id); return !L ? ['New', 'new'] : L.passed ? ['Passed', 'ok'] : ['Tried ' + L.attempts + '×', 'try']; };
  const firstOpen = () => (LESSONS.find(l => !(Profiles.lesson(l.id) || {}).passed) || LESSONS[LESSONS.length - 1]).id;
  const plan = () => st.kind === 'lesson' ? { kind: 'lesson', lesson: LESSONS.find(x => x.id === st.lesson) } : { kind: 'mock', index: st.route };

  // ---------- sheets ----------
  let afterProfile = null;
  function openSheet(id) { closeSheets(); const s = $(id); if (!s) return; s.hidden = false; render(); const f = s.querySelector('[aria-checked="true"]') || (matchMedia('(pointer:coarse)').matches ? null : s.querySelector('input[type=text]')) || s.querySelector('.x'); if (f) try { f.focus({ preventScroll: true }); } catch (_) {} }
  function closeSheets() { document.querySelectorAll('.sheet').forEach(s => { if (s.id !== 'pauseSheet' && s.id !== 'resultSheet') s.hidden = true; }); }
  const anyOpen = () => [...document.querySelectorAll('.sheet')].some(s => !s.hidden && s.id !== 'pauseSheet' && s.id !== 'resultSheet');
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { openSheet(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c) { const s = c.closest('.sheet'); if (s) s.hidden = true; return; }
    if (e.target.classList && e.target.classList.contains('sheet') && e.target.id !== 'resultSheet' && e.target.id !== 'pauseSheet') e.target.hidden = true; // tap the dim backdrop
  });
  $('whoBtn').addEventListener('click', () => openSheet('profileSheet'));
  $('setBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('eventCard').addEventListener('click', () => openSheet(st.kind === 'lesson' ? 'courseSheet' : 'mockSheet'));

  // ---------- learners ----------
  function renderProfiles() {
    const list = Profiles.list(), cur = Profiles.current();
    $('profList').innerHTML = list.length ? list.map(p => {
      const g = progress(p);
      return `<button class="item" role="radio" aria-checked="${!!cur && cur.id === p.id}" data-id="${p.id}"><span class="no">${esc(p.name[0].toUpperCase())}</span><span><span class="nm">${esc(p.name)}</span><span class="sub">Level ${g.lv} · ${g.done} of ${LESSONS.length} lessons · ${g.mockPass} mock passes</span></span><span class="tag ${cur && cur.id === p.id ? 'ok' : 'new'}">${cur && cur.id === p.id ? 'Playing' : 'Switch'}</span></button>`;
    }).join('') : '<p class="muted" style="margin:0">No learners yet. Add your name to start.</p>';
  }
  const chosen = () => { st.kind = 'lesson'; st.lesson = firstOpen(); render(); onPick(plan()); $('profileSheet').hidden = true; if (afterProfile) { const f = afterProfile; afterProfile = null; f(); } };
  $('profList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; Profiles.select(b.dataset.id); chosen(); });
  $('profForm').addEventListener('submit', e => { e.preventDefault(); const p = Profiles.create($('profName').value); if (!p) { $('profName').focus(); return; } $('profName').value = ''; chosen(); });

  // ---------- course ----------
  function renderCourse() {
    let n = 0;
    $('lessonList').innerHTML = UNITS.map((u, ui) => `<div class="unit-h">Unit ${ui + 1} · ${esc(u.title)}</div>` + LESSONS.filter(l => l.unit === u.id).map(l => {
      const [txt, cls] = status(l.id); n++;
      return `<button class="item" role="radio" aria-checked="${st.kind === 'lesson' && st.lesson === l.id}" data-l="${l.id}"><span class="no">${n}</span><span><span class="nm">${esc(l.title)}</span><span class="sub">${esc(l.road)}</span></span><span class="tag ${cls}">${txt}</span></button>`;
    }).join('')).join('');
    const l = LESSONS.find(x => x.id === st.lesson), r = lessonRoute(l), L = Profiles.lesson(l.id);
    $('lessonDetail').innerHTML = `<h3>${esc(l.title)}</h3><p>${esc(l.goal)}</p><ul>${l.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="rule"><b>${esc(l.rule.n)}</b><span>${esc(l.rule.t)}</span></div>
      <p class="muted">${esc(l.road)} · ${miles(r)} mi${L && L.passed && L.bestD !== null ? ` · best ${L.bestD} faults` : ''}</p>
      <div class="btns"><button class="cbtn go" data-start>Start lesson</button></div>`;
  }
  $('lessonList').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; st.kind = 'lesson'; st.lesson = b.dataset.l; render(); onPick(plan()); });

  // ---------- mock ----------
  function renderMock() {
    $('routePick').innerHTML = routes.map((r, i) => {
      const s = Profiles.mockStats(r.R.id);
      const tag = s ? `<span class="tag ${s.passes ? 'ok' : 'try'}">${s.passes ? 'Passed' : 'Tried'} ${s.tries}×</span>` : '<span class="tag new">New</span>';
      return `<button class="item" role="radio" aria-checked="${st.kind === 'mock' && st.route === i}" data-i="${i}"><span class="no">${i + 1}</span><span><span class="nm">${esc(r.R.name)}</span><span class="sub">${miles(r.route)} mi · ${r.route.instructions.length} instructions</span></span>${tag}</button>`;
    }).join('');
    const r = routes[st.route], s = Profiles.mockStats(r.R.id);
    $('mockDetail').innerHTML = `<h3>${esc(r.R.name)}</h3><p>${esc(r.R.blurb)}</p><p class="muted">First instruction: ${esc(r.route.instructions[0].text)}</p>
      <div class="rule"><b>Marking</b><span>15 or fewer driving faults and no serious or dangerous faults is a pass, like the real test.</span></div>
      ${s ? `<p class="muted">Last try: ${s.last.pass ? 'pass' : 'fail'}, ${s.last.D} driving and ${s.last.S} serious faults.</p>` : ''}
      <div class="btns"><button class="cbtn go" data-start>Start mock test</button></div>`;
  }
  $('routePick').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; st.kind = 'mock'; st.route = +b.dataset.i; render(); onPick(plan()); });
  document.addEventListener('click', e => { if (e.target.closest('[data-start]')) play(); });

  // ---------- Highway Code ----------
  const rules = []; { const seen = new Set(); for (const l of LESSONS) if (!seen.has(l.rule.n)) { seen.add(l.rule.n); rules.push(l); } }
  $('codeList').innerHTML = rules.map(l => `<div class="item" style="cursor:default;grid-template-columns:auto 1fr"><span class="no" style="width:auto;padding:0 8px;font-family:var(--font-mono);font-size:11px">${esc(l.rule.n)}</span><span><span class="nm">${esc(l.title)}</span><span class="sub">${esc(l.rule.t)}</span></span></div>`).join('');

  // ---------- lobby ----------
  function renderLobby() {
    const p = Profiles.current(), g = progress(p);
    $('whoName').textContent = p ? p.name : 'Tap to add learner';
    $('whoAv').textContent = p ? p.name[0].toUpperCase() : '?';
    $('whoLv').textContent = g.lv; $('whoXp').style.width = (g.frac * 100) + '%';
    $('statLessons').textContent = `${g.done}/${LESSONS.length}`; $('statMocks').textContent = g.mockPass;
    const nl = LESSONS.find(l => l.id === firstOpen()), ui = UNITS.findIndex(u => u.id === nl.unit);
    $('passTitle').textContent = g.done === LESSONS.length ? 'Course complete' : UNITS[ui].title;
    $('passUnit').textContent = ui + 1; $('passBar').style.width = (g.done / LESSONS.length * 100) + '%';
    if (st.kind === 'lesson') {
      const l = LESSONS.find(x => x.id === st.lesson), [txt] = status(l.id);
      $('eventKind').textContent = 'Lesson · ' + txt; $('eventTitle').textContent = l.title; $('eventSub').textContent = l.road; $('eventIco').innerHTML = ICO.lesson;
    } else {
      const r = routes[st.route];
      $('eventKind').textContent = 'Mock test'; $('eventTitle').textContent = r.R.name; $('eventSub').textContent = `${miles(r.route)} mi · ${r.route.instructions.length} instructions`; $('eventIco').innerHTML = ICO.mock;
    }
  }
  function render() { renderLobby(); renderProfiles(); renderCourse(); renderMock(); }

  function play() {
    if (!Profiles.current()) { afterProfile = play; openSheet('profileSheet'); return; }
    closeSheets(); onStart(plan());
  }
  $('playBtn').addEventListener('click', play);

  function open() { closeSheets(); render(); onPick(plan()); if (!Profiles.current()) openSheet('profileSheet'); }
  function nextLesson(id) { const i = LESSONS.findIndex(l => l.id === id); return LESSONS[i + 1] || null; }
  function selectLesson(id) { st.kind = 'lesson'; st.lesson = id; }
  if (Profiles.current()) st.lesson = firstOpen();
  return { open, render, nextLesson, selectLesson, plan, openSheet, closeSheets, anyOpen, Profiles };
}
