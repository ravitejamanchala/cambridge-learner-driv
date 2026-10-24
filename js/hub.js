// Game-style lobby: learner chip with level/XP, course (icon tiles), puzzles (tiers and stars), mock tests,
// Highway Code and learner sheets, the course "pass" card, the selected-drive card and START.
import { LESSONS } from './course.js';
import { VISIBLE_LESSONS, VISIBLE_UNITS as UNITS } from './course-menu.js';
import { hasFullAccess, canAccessPlan, isFreeLesson, needsLogin } from './access.js';
import { TIERS, PUZZLES, starsFor } from './puzzles.js';
import { ROUTES } from './config.js';
import { FREE_DRIVES, freeDrive } from './free-drive.js';
import { Profiles } from './profile.js';
import { availability, recommendedLesson } from './curriculum.js';
import { scenariosFor } from './scenarios.js';
import { ICONS, LESSON_ICON, STAR } from './icons.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const miles = m => (m / 1609.34).toFixed(1);
const stars = (n) => `<span class="stars" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => STAR(i <= n)).join('')}</span>`;

// XP: 40 per lesson passed, 15 per puzzle star, 100 per mock pass, 10 per mock attempt. 100 XP per level.
function progress(p) {
  if (!p) return { done: 0, mockPass: 0, stars: 0, xp: 0, lv: 1, frac: 0 };
  const done = VISIBLE_LESSONS.filter(l => (p.lessons[l.id] || {}).passed).length;
  const st = PUZZLES.reduce((a, z) => a + starsFor(p.lessons[z.id]), 0);
  const mockPass = p.mocks.filter(m => m.pass).length;
  const xp = done * 40 + st * 15 + mockPass * 100 + p.mocks.length * 10;
  return { done, mockPass, stars: st, xp, lv: 1 + Math.floor(xp / 100), frac: (xp % 100) / 100 };
}

// meta(key) -> { len, n, first } for 'route:<id>', 'lesson:<id>', 'puzzle:<id>' (from data/areas/index.json)
export function createHub({ meta, onPick, onStart }) {
  Profiles.init();
  window.addEventListener('learner-account-change', () => render());
  const st = { kind: 'lesson', lesson: VISIBLE_LESSONS[0].id, puzzle: PUZZLES[0].id, route: 0, free: FREE_DRIVES[0].id, scenarioId: null };
  const status = (id) => { const L = Profiles.lesson(id); return !L ? ['New', 'new'] : L.passed ? ['Passed', 'ok'] : ['Tried ' + L.attempts + '×', 'try']; };
  const firstOpen = () => (recommendedLesson(hasFullAccess()?VISIBLE_LESSONS:VISIBLE_LESSONS.filter(l=>isFreeLesson(l.id)), Profiles.current()) || VISIBLE_LESSONS[0]).id;
  const tierOpen = (ti) => ti === 0 || PUZZLES.some(z => z.tier === TIERS[ti - 1].id && (Profiles.lesson(z.id) || {}).passed);
  const puzzleOpen = (z) => tierOpen(TIERS.findIndex(t => t.id === z.tier));
  const plan = () => st.kind === 'lesson' ? { kind: 'lesson', key: 'lesson:' + st.lesson, lesson: LESSONS.find(x => x.id === st.lesson), scenarioId: st.scenarioId }
    : st.kind === 'puzzle' ? { kind: 'puzzle', key: 'puzzle:' + st.puzzle, lesson: PUZZLES.find(x => x.id === st.puzzle) }
    : st.kind === 'free' ? { kind: 'free', key: 'free:' + st.free, drive: freeDrive(st.free) }
    : { kind: 'mock', key: 'route:' + ROUTES[st.route].id, index: st.route };
  const isQuiz = (pl) => !!(pl.lesson && pl.lesson.questions);
  const pick = () => { render(); const pl = plan(); if (!isQuiz(pl)) onPick(pl); };

  // ---------- sheets ----------
  let afterProfile = null;
  const protectedSheets = new Set(['mockSheet','puzzleSheet','freeSheet']);
  const SIGN_IN_NOTICE='Sign in to start. Lessons, puzzles and mock tests need an account, and your progress is saved to it.';
  const SUBSCRIBE_NOTICE='Free: Highway Code and the first three practical lessons. Subscribe for £4.99/month to unlock the full course, mock tests and puzzles. Renews monthly until cancelled.';
  function requestAccess() {
    const notice=$('accessNotice'); if(notice){notice.hidden=false;notice.textContent=needsLogin()?SIGN_IN_NOTICE:SUBSCRIBE_NOTICE;}
    openSheet('profileSheet');
  }
  window.addEventListener('learner-access-change', render);
  function renderAccess() {
    const login=needsLogin(), allowed=!login&&hasFullAccess();
    const why=login?'Sign in to start':'Subscribe for £4.99/month to unlock';
    document.querySelectorAll('[data-open=mockSheet],[data-open=puzzleSheet],[data-open=freeSheet]').forEach(b=>{b.setAttribute('aria-disabled',String(!allowed));b.classList.toggle('access-locked',!allowed);b.title=allowed?'':login?why:'Sign in with an account that has full access';});
    for(const id of ['eventCard','playBtn']){const b=$(id),ok=canAccessPlan(plan());b.setAttribute('aria-disabled',String(!ok));b.classList.toggle('access-locked',!ok);b.title=ok?'':why;}
    const notice=$('accessNotice');if(notice){notice.hidden=allowed;notice.textContent=login?SIGN_IN_NOTICE:SUBSCRIBE_NOTICE;}
  }
  const modal = s => s.id === 'pauseSheet' || s.id === 'resultSheet';
  function openSheet(id) { if(protectedSheets.has(id)&&!hasFullAccess()){requestAccess();return;} closeSheets(); const s = $(id); if (!s) return; s.hidden = false; render(); const f = s.querySelector('[aria-checked="true"]') || (matchMedia('(pointer:coarse)').matches ? null : s.querySelector('input[type=text]')) || s.querySelector('.x'); if (f) try { f.focus({ preventScroll: true }); } catch (_) {} }
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
    $('profForm').hidden = Profiles.isAccount();
    const list = Profiles.list(), cur = Profiles.current();
    $('profList').innerHTML = list.length ? list.map(p => {
      const g = progress(p), me = !!cur && cur.id === p.id;
      return `<button class="item" role="radio" aria-checked="${me}" data-id="${p.id}"><span class="no">${esc(p.name[0].toUpperCase())}</span><span><span class="nm">${esc(p.name)}</span><span class="sub">Level ${g.lv} · ${g.done}/${VISIBLE_LESSONS.length} lessons · ${g.stars} stars</span></span><span class="tag ${me ? 'ok' : 'new'}">${me ? 'Playing' : 'Switch'}</span></button>`;
    }).join('') : '<p class="muted" style="margin:0">No learners yet. Add your name to start.</p>';
  }
  const chosen = () => { st.scenarioId = null; st.kind = 'lesson'; st.lesson = firstOpen(); pick(); $('profileSheet').hidden = true; if (afterProfile) { const f = afterProfile; afterProfile = null; f(); } };
  $('profList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; Profiles.select(b.dataset.id); chosen(); });
  $('profForm').addEventListener('submit', e => { e.preventDefault(); const p = Profiles.create($('profName').value); if (!p) { $('profName').focus(); return; } $('profName').value = ''; chosen(); });

  // ---------- course: icon tiles grouped by unit ----------
  function renderCourse() {
    let n = 0;
    $('lessonList').innerHTML = UNITS.map((u, ui) => `<div class="unit-h">Unit ${ui + 1} · ${esc(u.title)}</div><div class="tiles">` + VISIBLE_LESSONS.filter(l => l.unit === u.id).map(l => {
      const access = availability(l, Profiles.current());
      const entitled=!needsLogin()&&(hasFullAccess()||isFreeLesson(l.id));
      const [txt, cls] = needsLogin()?['Sign in','locked']:!entitled?['Subscribe','locked']:access.available ? status(l.id) : ['Locked', 'locked']; n++;
      return `<button class="tile ${cls}" role="radio" aria-checked="${st.kind === 'lesson' && st.lesson === l.id}" data-l="${l.id}" aria-label="${n}. ${esc(l.title)}, ${txt}">
        <span class="ic">${ICONS[LESSON_ICON[l.id]] || ICONS.car}</span><span class="no">${n}</span>${cls === 'ok' ? '<span class="tick">✓</span>' : ''}<span class="tt">${esc(l.title)}${needsLogin()?'':isFreeLesson(l.id)?' · Free':!hasFullAccess()?' · Plus':''}</span></button>`;
    }).join('') + '</div>').join('');
    const l = LESSONS.find(x => x.id === st.lesson), m = meta('lesson:' + l.id), L = Profiles.lesson(l.id), [txt, cls] = status(l.id), qz = !!l.questions;
    $('lessonDetail').innerHTML = `<div class="dh"><span class="dic">${ICONS[LESSON_ICON[l.id]] || ICONS.car}</span><div><h3>${esc(l.title)}</h3><span class="tag ${cls}">${txt}</span></div></div><p>${esc(l.goal)}</p><p class="muted">${esc(l.difficulty)}${l.prerequisites.length ? ' · Prerequisites: ' + l.prerequisites.map(id => esc(LESSONS.find(x => x.id === id).title)).join(', ') : ''}</p><ul>${l.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="rule"><b>${esc(l.rule.n)}</b><span>${esc(l.rule.t)}</span></div>
      <p class="muted">${qz ? `${l.questions.length} questions · pass mark ${Math.round(l.pass * 100)}%${L && L.passed ? ` · best ${l.questions.length - L.bestD}/${l.questions.length}` : ''}. Unofficial practice, not the DVSA theory test.`
        : `${esc(l.road)} · ${miles(m.len)} mi${L && L.passed && L.bestD !== null ? ` · best ${L.bestD} faults` : ''}`}</p>
      <div class="btns">${qz || scenariosFor(l).length < 2 ? '' : `<label class="scenario-field">Practice scenario <select id="scenarioChoice">${scenariosFor(l).map(v => `<option value="${v.id}" ${st.scenarioId === v.id ? 'selected' : ''}>${esc(v.title)}</option>`).join('')}</select></label>`}<button class="cbtn go" data-start ${availability(l, Profiles.current()).available ? '' : 'disabled'}>${needsLogin()?'Sign in to start':!hasFullAccess()&&!isFreeLesson(l.id)?'Subscribe · £4.99/month':qz ? 'Start quiz' : 'Start lesson'}</button></div>`;
  }
  $('lessonList').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; st.kind = 'lesson'; st.lesson = b.dataset.l; st.scenarioId = null; pick(); });

  $('lessonDetail').addEventListener('change', e => { if (e.target.id === 'scenarioChoice') { st.scenarioId = e.target.value; pick(); } });

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
      <p class="muted">${esc(z.road)} · ${miles(m.len)} mi · not giving way or going through a red fails it; ${t.maxD ? `otherwise up to ${t.maxD} driving fault${t.maxD > 1 ? 's' : ''} allowed` : 'no other faults allowed'}. 3 stars for a clean drive.</p>
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

  // ---------- free drive ----------
  // Ungraded practice: the sheet says so plainly, so nobody expects a mark or a record from it.
  function renderFree() {
    $('freePick').innerHTML = FREE_DRIVES.map(d => `<button class="item" role="radio" aria-checked="${st.kind === 'free' && st.free === d.id}" data-f="${d.id}"><span class="no">${d.lanes}</span><span><span class="nm">${esc(d.title)}</span><span class="sub">${esc(d.road)}</span></span><span class="tag new">Ungraded</span></button>`).join('');
    const d = freeDrive(st.free);
    $('freeDetail').innerHTML = `<h3>${esc(d.title)}</h3><p>${esc(d.blurb)}</p>
      <div class="rule"><b>Ungraded</b><span>No marking and nothing added to your record. When you stop, you see how far you drove, for how long, and your longest stretch at or under the limit.</span></div>
      <p class="muted">Pause and choose End drive whenever you like.</p>
      <div class="btns"><button class="cbtn go" data-start>Start free drive</button></div>`;
  }
  $('freePick').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; st.kind = 'free'; st.free = b.dataset.f; pick(); });

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
    $('statLessons').textContent = `${g.done}/${VISIBLE_LESSONS.length}`; $('statStars').textContent = `${g.stars}/${PUZZLES.length * 3}`; $('statMocks').textContent = g.mockPass;
    const nl = LESSONS.find(l => l.id === firstOpen()), ui = UNITS.findIndex(u => u.id === nl.unit);
    $('passTitle').textContent = g.done === VISIBLE_LESSONS.length ? 'Course complete' : UNITS[ui].title;
    const summary = Profiles.summary();
    $('practiceSummary').textContent = `${Math.round(summary.practiceSeconds / 60)} min practice · ${summary.attempts} recorded attempts`;
    $('recentHistory').innerHTML = summary.history.slice(0, 5).map(r => `<li>${esc(LESSONS.find(l => l.id === r.lessonId)?.title || r.lessonId || r.routeId)}: ${r.pass ? 'Passed' : 'Retry'} · ${esc(r.D)} driving / ${esc(r.S)} serious</li>`).join('') || '<li>No recent reports yet.</li>';
    $('passUnit').textContent = ui + 1; $('passBar').style.width = (g.done / VISIBLE_LESSONS.length * 100) + '%';
    const pl = plan();
    if (pl.kind === 'lesson') {
      const l = pl.lesson, [txt] = status(l.id);
      $('eventKind').textContent = (l.questions ? 'Quiz · ' : 'Lesson · ') + txt; $('eventTitle').textContent = l.title; $('eventSub').textContent = l.road; $('eventIco').innerHTML = ICONS[LESSON_ICON[l.id]] || ICONS.car;
    } else if (pl.kind === 'puzzle') {
      const z = pl.lesson, t = TIERS.find(x => x.id === z.tier);
      $('eventKind').innerHTML = `Puzzle · ${esc(t.title)} ${stars(starsFor(Profiles.lesson(z.id)))}`; $('eventTitle').textContent = z.title; $('eventSub').textContent = z.road; $('eventIco').innerHTML = ICONS[z.icon];
    } else if (pl.kind === 'free') {
      const d = pl.drive;
      $('eventKind').textContent = 'Free drive · ungraded'; $('eventTitle').textContent = d.title; $('eventSub').textContent = d.road;
      $('eventIco').innerHTML = document.querySelector('[data-open=freeSheet] .disc').innerHTML;
    } else {
      const R = ROUTES[st.route], m = meta(pl.key);
      $('eventKind').textContent = 'Mock test'; $('eventTitle').textContent = R.name; $('eventSub').textContent = `${miles(m.len)} mi · ${m.n} instructions`;
      $('eventIco').innerHTML = '<svg viewBox="0 0 40 40"><rect x="8" y="7" width="24" height="28" rx="4" fill="#fff" stroke="#8a6ae3" stroke-width="2"/><rect x="14" y="4" width="12" height="7" rx="2.5" fill="#b49cf5" stroke="#8a6ae3" stroke-width="2"/><path d="M13 19l3 3 6-6M13 28h14" stroke="#ef4f97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
  }
  function render() { renderAccess(); renderLobby(); renderProfiles(); renderCourse(); renderPuzzles(); renderMock(); renderFree(); }

  function play() {
    if(!canAccessPlan(plan())){requestAccess();return;}
    if (!Profiles.current()) { afterProfile = play; openSheet('profileSheet'); return; }
    const pl = plan(); if (pl.kind === 'lesson' && !availability(pl.lesson, Profiles.current()).available) { openSheet('courseSheet'); return; } if (pl.kind === 'puzzle' && !puzzleOpen(pl.lesson)) { openSheet('puzzleSheet'); return; }
    if (isQuiz(pl)) { startQuiz(pl.lesson); return; }
    closeSheets(); onStart(pl);
  }
  $('playBtn').addEventListener('click', play);

  // ---------- quiz runner (theory modules) ----------
  const qz = { quiz: null, i: 0, right: 0, answered: false };
  const shuffled = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; // new order every attempt
  function startQuiz(q) { if(!canAccessPlan({kind:'lesson',lesson:q})){requestAccess();return;} closeSheets(); Object.assign(qz, { owner: Profiles.scope() + ":" + Profiles.current()?.id, quiz: q, i: 0, right: 0, answered: false }); $('quizH').textContent = q.title; $('quizSheet').hidden = false; drawQuiz(); }
  function drawQuiz() {
    const q = qz.quiz, n = q.questions.length;
    if (qz.i >= n) {
      const pass = qz.right / n >= q.pass;
      if (qz.owner === Profiles.scope() + ":" + Profiles.current()?.id) Profiles.recordLesson(q.id, { pass, D: n - qz.right, S: 0 });
      const nx = pass ? next({ kind: 'lesson', lesson: q }) : null;
      $('quizBody').innerHTML = `<h3 class="verdict ${pass ? 'pass' : 'fail'}">${pass ? 'Passed' : 'Not yet'}</h3>
        <div class="score"><div><b>${qz.right}/${n}</b><span>Correct</span></div><div><b>${Math.ceil(q.pass * n)}</b><span>Needed to pass</span></div></div>
        <p class="muted" style="margin:0">Unofficial practice questions written from The Highway Code and DVSA guidance. Not the DVSA theory test.</p>
        <div class="btns">${nx ? `<button class="cbtn go" data-qnext="${nx.id}">Next: ${esc(nx.title)}</button>` : ''}<button class="cbtn alt" data-qagain>Try again</button><button class="cbtn lav" data-close>Back to lobby</button></div>`;
      render(); return;
    }
    const it = q.questions[qz.i];
    $('quizBody').innerHTML = `<div class="qprog"><span>Question ${qz.i + 1} of ${n}</span><span class="bar"><i style="width:${qz.i / n * 100}%"></i></span></div>
      <p class="qq">${esc(it.q)}</p><div class="qopts">${shuffled(it.options.length).map((k, pos) => `<button class="qopt" data-k="${k}"><b>${'ABCD'[pos]}</b><span>${esc(it.options[k])}</span></button>`).join('')}</div>
      <div class="qwhy" id="qwhy" hidden></div><div class="btns"><button class="cbtn go" id="qnextBtn" hidden>${qz.i === n - 1 ? 'See result' : 'Next question'}</button></div>`;
    qz.answered = false;
  }
  $('quizSheet').addEventListener('click', e => {
    const o = e.target.closest('.qopt');
    if (o && !qz.answered) {
      qz.answered = true; const it = qz.quiz.questions[qz.i], k = +o.dataset.k, ok = k === it.a; if (ok) qz.right++;
      document.querySelectorAll('.qopt').forEach(b => { b.disabled = true; const kk = +b.dataset.k; if (kk === it.a) b.classList.add('right'); else if (kk === k) b.classList.add('wrong'); });
      const w = $('qwhy'); w.hidden = false; w.className = 'qwhy ' + (ok ? 'ok' : 'no'); w.innerHTML = `<b>${ok ? 'Correct.' : 'Not quite.'}</b> ${esc(it.why)}`;
      $('qnextBtn').hidden = false; $('qnextBtn').focus({ preventScroll: true }); return;
    }
    if (e.target.closest('#qnextBtn')) { qz.i++; drawQuiz(); return; }
    if (e.target.closest('[data-qagain]')) { startQuiz(qz.quiz); return; }
    const nb = e.target.closest('[data-qnext]'); if (nb) { st.kind = 'lesson'; st.lesson = nb.dataset.qnext; const pl = plan(); render(); if (isQuiz(pl)) startQuiz(pl.lesson); else { $('quizSheet').hidden = true; onStart(pl); } }
  });

  function open() { closeSheets(); render(); const pl = plan(); if (!isQuiz(pl)) onPick(pl); if (!Profiles.current()) openSheet('profileSheet'); }
  // what comes after this lesson or puzzle (null if none, or the next puzzle is still locked)
  function next(pl) {
    if (pl.kind === 'lesson') { const l = recommendedLesson(VISIBLE_LESSONS, Profiles.current(), pl.lesson.id); return l ? { kind: 'lesson', id: l.id, title: l.title } : null; }
    if (pl.kind === 'puzzle') { const i = PUZZLES.findIndex(z => z.id === pl.lesson.id), z = PUZZLES[i + 1]; return z && puzzleOpen(z) ? { kind: 'puzzle', id: z.id, title: z.title } : null; }
    return null;
  }
  function select(kind, id) { st.scenarioId = null; st.kind = kind; if (kind === 'lesson') st.lesson = id; else if (kind === 'puzzle') st.puzzle = id; else if (kind === 'free') st.free = id; return plan(); }
  if (Profiles.current()) st.lesson = firstOpen();
  return { open, render, next, select, plan, openSheet, closeSheets, anyOpen, Profiles, starsFor, startQuiz, requestAccess };
}
