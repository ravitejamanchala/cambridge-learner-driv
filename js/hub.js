// Game-style lobby: learner chip with level/XP, course (icon tiles), puzzles (tiers and stars), mock tests,
// Highway Code and learner sheets, the course "pass" card, the selected-drive card and START.
import { UNITS, LESSONS } from './course.js';
import { TIERS, PUZZLES, starsFor } from './puzzles.js';
import { ROUTES } from './config.js';
import { Profiles } from './profile.js';
import { ICONS, LESSON_ICON, STAR } from './icons.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const miles = m => (m / 1609.34).toFixed(1);
const stars = (n) => `<span class="stars" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => STAR(i <= n)).join('')}</span>`;

// XP: 40 per lesson passed, 15 per puzzle star, 100 per mock pass, 10 per mock attempt. 100 XP per level.
function progress(p) {
  if (!p) return { done: 0, mockPass: 0, stars: 0, xp: 0, lv: 1, frac: 0 };
  const done = LESSONS.filter(l => (p.lessons[l.id] || {}).passed).length;
  const st = PUZZLES.reduce((a, z) => a + starsFor(p.lessons[z.id]), 0);
  const mockPass = p.mocks.filter(m => m.pass).length;
  const xp = done * 40 + st * 15 + mockPass * 100 + p.mocks.length * 10;
  return { done, mockPass, stars: st, xp, lv: 1 + Math.floor(xp / 100), frac: (xp % 100) / 100 };
}

// meta(key) -> { len, n, first } for 'route:<id>', 'lesson:<id>', 'puzzle:<id>' (from data/areas/index.json)
export function createHub({ meta, onPick, onStart }) {
  Profiles.init();
  const st = { kind: 'lesson', lesson: LESSONS[0].id, puzzle: PUZZLES[0].id, route: 0 };
  const status = (id) => { const L = Profiles.lesson(id); return !L ? ['New', 'new'] : L.passed ? ['Passed', 'ok'] : ['Tried ' + L.attempts + '×', 'try']; };
  const firstOpen = () => (LESSONS.find(l => !(Profiles.lesson(l.id) || {}).passed) || LESSONS[LESSONS.length - 1]).id;
  const tierOpen = (ti) => ti === 0 || PUZZLES.some(z => z.tier === TIERS[ti - 1].id && (Profiles.lesson(z.id) || {}).passed);
  const puzzleOpen = (z) => tierOpen(TIERS.findIndex(t => t.id === z.tier));
  const plan = () => st.kind === 'lesson' ? { kind: 'lesson', key: 'lesson:' + st.lesson, lesson: LESSONS.find(x => x.id === st.lesson) }
    : st.kind === 'puzzle' ? { kind: 'puzzle', key: 'puzzle:' + st.puzzle, lesson: PUZZLES.find(x => x.id === st.puzzle) }
    : { kind: 'mock', key: 'route:' + ROUTES[st.route].id, index: st.route };
  const pick = () => { render(); onPick(plan()); };

  // ---------- sheets ----------
  let afterProfile = null;
  const modal = s => s.id === 'pauseSheet' || s.id === 'resultSheet';
  function openSheet(id) { closeSheets(); const s = $(id); if (!s) return; s.hidden = false; render(); const f = s.querySelector('[aria-checked="true"]') || (matchMedia('(pointer:coarse)').matches ? null : s.querySelector('input[type=text]')) || s.querySelector('.x'); if (f) try { f.focus({ preventScroll: true }); } catch (_) {} }
  function closeSheets() { document.querySelectorAll('.sheet').forEach(s => { if (!modal(s)) s.hidden = true; }); }
  const anyOpen = () => [...document.querySelectorAll('.sheet')].some(s => !s.hidden && !modal(s));
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { openSheet(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c) { const s = c.closest('.sheet'); if (s) s.hidden = true; return; }
    if (e.target.classList && e.target.classList.contains('sheet') && !modal(e.target)) e.target.hidden = true; // tap the dim backdrop
    if (e.target.closest('[data-start]')) play();
  });
  $('whoBtn').addEventListener('click', () => openSheet('profileSheet'));
  $('setBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('eventCard').addEventListener('click', () => openSheet({ lesson: 'courseSheet', puzzle: 'puzzleSheet', mock: 'mockSheet' }[st.kind]));

  // ---------- learners ----------
  function renderProfiles() {
    const list = Profiles.list(), cur = Profiles.current();
    $('profList').innerHTML = list.length ? list.map(p => {
      const g = progress(p), me = !!cur && cur.id === p.id;
      return `<button class="item" role="radio" aria-checked="${me}" data-id="${p.id}"><span class="no">${esc(p.name[0].toUpperCase())}</span><span><span class="nm">${esc(p.name)}</span><span class="sub">Level ${g.lv} · ${g.done}/${LESSONS.length} lessons · ${g.stars} stars</span></span><span class="tag ${me ? 'ok' : 'new'}">${me ? 'Playing' : 'Switch'}</span></button>`;
    }).join('') : '<p class="muted" style="margin:0">No learners yet. Add your name to start.</p>';
  }
  const chosen = () => { st.kind = 'lesson'; st.lesson = firstOpen(); pick(); $('profileSheet').hidden = true; if (afterProfile) { const f = afterProfile; afterProfile = null; f(); } };
  $('profList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; Profiles.select(b.dataset.id); chosen(); });
  $('profForm').addEventListener('submit', e => { e.preventDefault(); const p = Profiles.create($('profName').value); if (!p) { $('profName').focus(); return; } $('profName').value = ''; chosen(); });

  // ---------- course: icon tiles grouped by unit ----------
  function renderCourse() {
    let n = 0;
    $('lessonList').innerHTML = UNITS.map((u, ui) => `<div class="unit-h">Unit ${ui + 1} · ${esc(u.title)}</div><div class="tiles">` + LESSONS.filter(l => l.unit === u.id).map(l => {
      const [txt, cls] = status(l.id); n++;
      return `<button class="tile ${cls}" role="radio" aria-checked="${st.kind === 'lesson' && st.lesson === l.id}" data-l="${l.id}" aria-label="${n}. ${esc(l.title)}, ${txt}">
        <span class="ic">${ICONS[LESSON_ICON[l.id]] || ICONS.car}</span><span class="no">${n}</span>${cls === 'ok' ? '<span class="tick">✓</span>' : ''}<span class="tt">${esc(l.title)}</span></button>`;
    }).join('') + '</div>').join('');
    const l = LESSONS.find(x => x.id === st.lesson), m = meta('lesson:' + l.id), L = Profiles.lesson(l.id), [txt, cls] = status(l.id);
    $('lessonDetail').innerHTML = `<div class="dh"><span class="dic">${ICONS[LESSON_ICON[l.id]] || ICONS.car}</span><div><h3>${esc(l.title)}</h3><span class="tag ${cls}">${txt}</span></div></div><p>${esc(l.goal)}</p><ul>${l.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="rule"><b>${esc(l.rule.n)}</b><span>${esc(l.rule.t)}</span></div>
      <p class="muted">${esc(l.road)} · ${miles(m.len)} mi${L && L.passed && L.bestD !== null ? ` · best ${L.bestD} faults` : ''}</p>
      <div class="btns"><button class="cbtn go" data-start>Start lesson</button></div>`;
  }
  $('lessonList').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; st.kind = 'lesson'; st.lesson = b.dataset.l; pick(); });

  // ---------- puzzles: tiers, stars, unlocking ----------
  function renderPuzzles() {
    $('puzzleList').innerHTML = TIERS.map((t, ti) => {
      const open = tierOpen(ti), list = PUZZLES.filter(z => z.tier === t.id);
      return `<div class="unit-h tier"><i style="background:${t.colour}"></i>${esc(t.title)}${open ? '' : ` <span class="lk">· pass a ${esc(TIERS[ti - 1].title)} puzzle to unlock</span>`}</div><div class="tiles">` + list.map(z => {
        const s = starsFor(Profiles.lesson(z.id));
        return `<button class="tile pz ${open ? '' : 'locked'}" role="radio" aria-checked="${st.kind === 'puzzle' && st.puzzle === z.id}" data-z="${z.id}" style="--tier:${t.colour}" aria-label="${esc(z.title)}, ${t.title}${open ? `, ${s} stars` : ', locked'}">
          <span class="ic">${open ? ICONS[z.icon] : ICONS.lock}</span><span class="tt">${esc(z.title)}</span>${open ? stars(s) : ''}</button>`;
      }).join('') + '</div>';
    }).join('');
    const z = PUZZLES.find(x => x.id === st.puzzle), t = TIERS.find(x => x.id === z.tier), m = meta('puzzle:' + z.id), open = puzzleOpen(z), L = Profiles.lesson(z.id);
    $('puzzleDetail').innerHTML = `<div class="dh"><span class="dic">${ICONS[z.icon]}</span><div><h3>${esc(z.title)}</h3><span class="tag" style="background:${t.colour};color:#fff">${esc(t.title)}</span> ${stars(starsFor(L))}</div></div>
      <p>${esc(z.goal)}</p><ul>${z.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="rule"><b>${esc(z.rule.n)}</b><span>${esc(z.rule.t)}</span></div>
      <p class="muted">${esc(z.road)} · ${miles(m.len)} mi · ${t.maxD ? `up to ${t.maxD} driving fault${t.maxD > 1 ? 's' : ''}` : 'no faults allowed'}. 3 stars for a clean drive.</p>
      <div class="btns">${open ? '<button class="cbtn go" data-start>Start puzzle</button>' : `<p class="muted" style="margin:0">Locked. Solve any ${esc(TIERS[TIERS.indexOf(t) - 1].title)} puzzle first.</p>`}</div>`;
  }
  $('puzzleList').addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; st.kind = 'puzzle'; st.puzzle = b.dataset.z; pick(); });

  // ---------- mock ----------
  function renderMock() {
    $('routePick').innerHTML = ROUTES.map((R, i) => {
      const s = Profiles.mockStats(R.id), m = meta('route:' + R.id);
      const tag = s ? `<span class="tag ${s.passes ? 'ok' : 'try'}">${s.passes ? 'Passed' : 'Tried'} ${s.tries}×</span>` : '<span class="tag new">New</span>';
      return `<button class="item" role="radio" aria-checked="${st.kind === 'mock' && st.route === i}" data-i="${i}"><span class="no">${i + 1}</span><span><span class="nm">${esc(R.name)}</span><span class="sub">${miles(m.len)} mi · ${m.n} instructions</span></span>${tag}</button>`;
    }).join('');
    const R = ROUTES[st.route], s = Profiles.mockStats(R.id), m = meta('route:' + R.id);
    $('mockDetail').innerHTML = `<h3>${esc(R.name)}</h3><p>${esc(R.blurb)}</p><p class="muted">First instruction: ${esc(m.first)}</p>
      <div class="rule"><b>Marking</b><span>15 or fewer driving faults and no serious or dangerous faults is a pass, like the real test.</span></div>
      ${s ? `<p class="muted">Last try: ${s.last.pass ? 'pass' : 'fail'}, ${s.last.D} driving and ${s.last.S} serious faults.</p>` : ''}
      <div class="btns"><button class="cbtn go" data-start>Start mock test</button></div>`;
  }
  $('routePick').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; st.kind = 'mock'; st.route = +b.dataset.i; pick(); });

  // ---------- Highway Code ----------
  const rules = []; { const seen = new Set(); for (const l of LESSONS.concat(PUZZLES)) if (!seen.has(l.rule.n + l.rule.t)) { seen.add(l.rule.n + l.rule.t); rules.push(l); } }
  rules.sort((a, b) => parseInt(a.rule.n.replace(/\D/g, '')) - parseInt(b.rule.n.replace(/\D/g, '')));
  $('codeList').innerHTML = rules.map(l => `<div class="item" style="cursor:default;grid-template-columns:auto 1fr"><span class="no" style="width:auto;padding:0 8px;font-family:var(--font-mono);font-size:11px">${esc(l.rule.n)}</span><span><span class="nm">${esc(l.title)}</span><span class="sub">${esc(l.rule.t)}</span></span></div>`).join('');

  // ---------- lobby ----------
  function renderLobby() {
    const p = Profiles.current(), g = progress(p);
    $('whoName').textContent = p ? p.name : 'Tap to add learner';
    $('whoAv').textContent = p ? p.name[0].toUpperCase() : '?';
    $('whoLv').textContent = g.lv; $('whoXp').style.width = (g.frac * 100) + '%';
    $('statLessons').textContent = `${g.done}/${LESSONS.length}`; $('statStars').textContent = `${g.stars}/${PUZZLES.length * 3}`; $('statMocks').textContent = g.mockPass;
    const nl = LESSONS.find(l => l.id === firstOpen()), ui = UNITS.findIndex(u => u.id === nl.unit);
    $('passTitle').textContent = g.done === LESSONS.length ? 'Course complete' : UNITS[ui].title;
    $('passUnit').textContent = ui + 1; $('passBar').style.width = (g.done / LESSONS.length * 100) + '%';
    const pl = plan();
    if (pl.kind === 'lesson') {
      const l = pl.lesson, [txt] = status(l.id);
      $('eventKind').textContent = 'Lesson · ' + txt; $('eventTitle').textContent = l.title; $('eventSub').textContent = l.road; $('eventIco').innerHTML = ICONS[LESSON_ICON[l.id]] || ICONS.car;
    } else if (pl.kind === 'puzzle') {
      const z = pl.lesson, t = TIERS.find(x => x.id === z.tier);
      $('eventKind').innerHTML = `Puzzle · ${esc(t.title)} ${stars(starsFor(Profiles.lesson(z.id)))}`; $('eventTitle').textContent = z.title; $('eventSub').textContent = z.road; $('eventIco').innerHTML = ICONS[z.icon];
    } else {
      const R = ROUTES[st.route], m = meta(pl.key);
      $('eventKind').textContent = 'Mock test'; $('eventTitle').textContent = R.name; $('eventSub').textContent = `${miles(m.len)} mi · ${m.n} instructions`;
      $('eventIco').innerHTML = '<svg viewBox="0 0 40 40"><rect x="8" y="7" width="24" height="28" rx="4" fill="#fff" stroke="#8a6ae3" stroke-width="2"/><rect x="14" y="4" width="12" height="7" rx="2.5" fill="#b49cf5" stroke="#8a6ae3" stroke-width="2"/><path d="M13 19l3 3 6-6M13 28h14" stroke="#ef4f97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
  }
  function render() { renderLobby(); renderProfiles(); renderCourse(); renderPuzzles(); renderMock(); }

  function play() {
    if (!Profiles.current()) { afterProfile = play; openSheet('profileSheet'); return; }
    const pl = plan(); if (pl.kind === 'puzzle' && !puzzleOpen(pl.lesson)) { openSheet('puzzleSheet'); return; }
    closeSheets(); onStart(pl);
  }
  $('playBtn').addEventListener('click', play);

  function open() { closeSheets(); render(); onPick(plan()); if (!Profiles.current()) openSheet('profileSheet'); }
  // what comes after this lesson or puzzle (null if none, or the next puzzle is still locked)
  function next(pl) {
    if (pl.kind === 'lesson') { const i = LESSONS.findIndex(l => l.id === pl.lesson.id); return LESSONS[i + 1] ? { kind: 'lesson', id: LESSONS[i + 1].id, title: LESSONS[i + 1].title } : null; }
    if (pl.kind === 'puzzle') { const i = PUZZLES.findIndex(z => z.id === pl.lesson.id), z = PUZZLES[i + 1]; return z && puzzleOpen(z) ? { kind: 'puzzle', id: z.id, title: z.title } : null; }
    return null;
  }
  function select(kind, id) { st.kind = kind; if (kind === 'lesson') st.lesson = id; else if (kind === 'puzzle') st.puzzle = id; return plan(); }
  if (Profiles.current()) st.lesson = firstOpen();
  return { open, render, next, select, plan, openSheet, closeSheets, anyOpen, Profiles, starsFor };
}
