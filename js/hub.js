// Learner hub: profile picker, the course (units and lessons with progress) and the mock test route list.
import { UNITS, LESSONS } from './course.js';
import { Profiles } from './profile.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const miles = r => (r.len / 1609.34).toFixed(1);

export function createHub({ routes, lessonRoute, onPick, onStart }) {
  Profiles.init();
  const st = { tab: 'course', lesson: LESSONS[0].id, route: 0 };

  // ---------- profiles ----------
  function renderProfiles() {
    const list = Profiles.list();
    $('profList').innerHTML = list.length ? list.map(p => {
      const done = Object.values(p.lessons).filter(l => l.passed).length;
      return `<button class="ropt" data-id="${p.id}"><span class="rn">${esc(p.name)}</span><span class="rm">${done} of ${LESSONS.length} lessons</span></button>`;
    }).join('') : '<p class="small">No learners yet. Add your name to start.</p>';
  }
  function showProfiles() { renderProfiles(); $('startOv').hidden = true; $('profileOv').hidden = false; setTimeout(() => { try { $('profName').focus({ preventScroll: true }); } catch (_) {} }, 50); }
  $('profList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; Profiles.select(b.dataset.id); open(); });
  $('profForm').addEventListener('submit', e => { e.preventDefault(); const p = Profiles.create($('profName').value); if (!p) { $('profName').focus(); return; } $('profName').value = ''; open(); });
  $('whoBtn').addEventListener('click', showProfiles);

  // ---------- course and mock lists ----------
  const status = (id) => { const L = Profiles.lesson(id); return !L ? ['New', 'new'] : L.passed ? ['Passed', 'ok'] : ['Tried ' + L.attempts + '×', 'try']; };
  function renderCourse() {
    const done = LESSONS.filter(l => (Profiles.lesson(l.id) || {}).passed).length;
    $('progTxt').textContent = `${done} of ${LESSONS.length} lessons passed`;
    $('progBar').style.width = (done / LESSONS.length * 100) + '%';
    $('lessonList').innerHTML = UNITS.map((u, ui) => {
      const items = LESSONS.filter(l => l.unit === u.id);
      return `<div class="unit"><div class="uhead"><b>Unit ${ui + 1}</b>${esc(u.title)}</div>${items.map(l => {
        const [txt, cls] = status(l.id);
        return `<button class="ropt lesson" role="radio" aria-checked="${st.lesson === l.id && st.tab === 'course'}" data-l="${l.id}"><span class="rn">${esc(l.title)}</span><span class="pill ${cls}">${txt}</span><span class="rb">${esc(l.road)}</span></button>`;
      }).join('')}</div>`;
    }).join('');
  }
  function renderMock() {
    $('routePick').innerHTML = routes.map((r, i) => {
      const s = Profiles.mockStats(r.R.id);
      const tag = s ? `<span class="pill ${s.passes ? 'ok' : 'try'}">${s.passes ? 'Passed' : 'Tried'} ${s.tries}×</span>` : '<span class="pill new">New</span>';
      return `<button class="ropt" role="radio" aria-checked="${st.route === i && st.tab === 'mock'}" data-i="${i}"><span class="rn">${esc(r.R.name)}</span>${tag}<span class="rb">${miles(r.route)} mi · ${r.route.instructions.length} instructions · ${esc(r.R.blurb)}</span></button>`;
    }).join('');
  }
  function renderDetail() {
    const d = $('planDetail');
    if (st.tab === 'course') {
      const l = LESSONS.find(x => x.id === st.lesson), r = lessonRoute(l);
      d.innerHTML = `<h3>${esc(l.title)}</h3><p>${esc(l.goal)}</p><ul>${l.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="rulebox"><b>${esc(l.rule.n)}</b><span>${esc(l.rule.t)}</span></div><p class="small">${esc(l.road)} · ${miles(r)} mi</p>`;
      $('startBtn').firstChild.textContent = 'Start lesson ';
    } else {
      const r = routes[st.route];
      d.innerHTML = `<h3>${esc(r.R.name)}</h3><p>First instruction: ${esc(r.route.instructions[0].text)}</p><p class="small">Marked like the real test: 15 or fewer driving faults and no serious faults is a pass.</p>`;
      $('startBtn').firstChild.textContent = 'Start mock test ';
    }
  }
  function render() {
    const p = Profiles.current(); $('whoName').textContent = p ? p.name : 'Guest';
    $('tabCourse').setAttribute('aria-selected', st.tab === 'course'); $('tabMock').setAttribute('aria-selected', st.tab === 'mock');
    $('paneCourse').hidden = st.tab !== 'course'; $('paneMock').hidden = st.tab !== 'mock';
    renderCourse(); renderMock(); renderDetail();
  }
  const plan = () => st.tab === 'course' ? { kind: 'lesson', lesson: LESSONS.find(x => x.id === st.lesson) } : { kind: 'mock', index: st.route };
  function pick() { render(); onPick(plan()); const ovl = $('startOv'), btn = $('startBtn'); ovl.scrollTo({ top: Math.max(0, btn.offsetTop + btn.offsetHeight - ovl.clientHeight + 40), behavior: 'smooth' }); }
  $('lessonList').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (b) { st.lesson = b.dataset.l; pick(); } });
  $('routePick').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { st.route = +b.dataset.i; pick(); } });
  $('tabCourse').addEventListener('click', () => { st.tab = 'course'; pick(); });
  $('tabMock').addEventListener('click', () => { st.tab = 'mock'; pick(); });
  $('startBtn').addEventListener('click', () => onStart(plan()));

  function open() {
    $('profileOv').hidden = true; $('endOv').hidden = true;
    if (!Profiles.current()) { showProfiles(); return; }
    render(); onPick(plan()); $('startOv').hidden = false;
  }
  function nextLesson(id) { const i = LESSONS.findIndex(l => l.id === id); return LESSONS[i + 1] || null; }
  function selectLesson(id) { st.tab = 'course'; st.lesson = id; }
  return { open, render, nextLesson, selectLesson, Profiles };
}
