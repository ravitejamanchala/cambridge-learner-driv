import { lessonLocation } from './locations.js';
// Existing IDs and assessment handlers remain stable.
export function enrichLesson(lesson) {
  const mode = lesson.questions ? 'theory' : 'practical';
  const location = mode === 'practical' ? lessonLocation(lesson) : null;
  return { ...(location ? { area: location.areaId, waypoints: location.waypoints, startingLocation: location.waypoints[0] } : {}), difficulty: ['roundabouts', 'faster'].includes(lesson.unit) ? 'intermediate' : 'beginner', prerequisites: [], objectives: lesson.steps.slice(),
    description: lesson.goal, mode, vehicle: { transmission: 'simplified' },
    assessmentRules: { focus: lesson.focus || [], maxDrivingFaults: lesson.maxD ?? 2 },
    completionCriteria: { type: mode === 'theory' ? 'quiz' : 'route-and-assessment' }, ...lesson };
}
export function availability(lesson, profile) {
  const missing = profile?.lessons?.[lesson.id]?.passed ? [] : lesson.prerequisites.filter(id => !profile?.lessons?.[id]?.passed);
  return { available: !missing.length, missing };
}
export function recommendedLesson(lessons, profile, afterId) {
  const eligible = lessons.filter(l => availability(l, profile).available && !profile?.lessons?.[l.id]?.passed);
  return eligible.find(l => lessons.indexOf(l) > lessons.findIndex(x => x.id === afterId)) || eligible[0] || null;
}
export function validateCurriculum(lessons) {
  const errors = [], ids = new Set(lessons.map(l => l.id));
  if (ids.size !== lessons.length) errors.push('Duplicate lesson IDs');
  for (const l of lessons) {
    if (!l.id || !l.title || !l.unit || !l.objectives?.length) errors.push(`${l.id}: missing lesson metadata`);
    if (l.mode === 'practical' && (!l.area || l.waypoints?.length < 2 || !l.focus?.length)) errors.push(`${l.id}: missing playable route or assessment`);
    if (l.mode === 'theory' && !l.questions?.length) errors.push(`${l.id}: missing quiz`);
    for (const id of l.prerequisites) if (!ids.has(id)) errors.push(`${l.id}: unknown prerequisite ${id}`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) { if (visiting.has(id)) { errors.push(`Prerequisite cycle at ${id}`); return; } if (visited.has(id)) return;
    visiting.add(id); for (const p of lessons.find(l => l.id === id)?.prerequisites || []) if (ids.has(p)) visit(p);
    visiting.delete(id); visited.add(id);
  }
  for (const id of ids) visit(id);
  return errors;
}
