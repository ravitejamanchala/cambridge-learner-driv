export const FREE_LESSON_IDS = Object.freeze(['mirror-practice','controlled-stop','accel-decel']);
export const isFreeLesson = id => FREE_LESSON_IDS.includes(id);
export function canUsePlan(plan, full=false) {
 // Personal routes are ungraded practice; they never grant access to paid mocks
 // or write learner progress. The configured sign-in gate still applies.
 return full === true || (plan?.kind === 'personal' && !plan.graded) || (plan?.kind === 'lesson' && isFreeLesson(plan.lesson?.id));
}
// Free accounts may retain old paid progress, but cannot change it through the API.
export function basicProgressAllowed(next, previous) {
 const paid = p => Object.fromEntries(Object.entries(p?.lessons || {}).filter(([id])=>!isFreeLesson(id)).sort(([a],[b])=>a.localeCompare(b)));
 const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
 const oldHistory = previous?.history || [];
 return equal(paid(next),paid(previous)) && equal(next.mocks,previous?.mocks || []) &&
  next.history.every(r=>isFreeLesson(r.lessonId) || oldHistory.some(old=>equal(old,r)));
}
