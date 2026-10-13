import { lessonLocation } from './locations.js';
// Locations are adapters, not assumptions in curriculum or assessment.
export const locationAdapters = new Map();
export function registerLocation(id, adapter) {
  if (!id || typeof adapter?.resolve !== 'function') throw new Error('A location adapter needs an id and resolve function');
  locationAdapters.set(id, adapter);
}
registerLocation('practice', { resolve: (lesson, scenario) => lessonLocation(lesson, scenario.location.locationId) });
export function scenariosFor(lesson) {
  if (lesson.mode === 'theory') return [];
  return (lesson.scenarioVariants || [{ id: 'standard', title: 'Standard traffic', trafficDensity: 'normal' },
    { id: 'quiet', title: 'Quieter traffic', trafficDensity: 'light' }]).map(v => ({
    id: `${lesson.id}:${v.id}`, lessonId: lesson.id, title: v.title, difficulty: lesson.difficulty,
    location: { adapterId: lesson.locationAdapter || 'practice', areaId: lesson.area, locationId: v.locationId || lesson.locationId },
    conditions: { trafficDensity: v.trafficDensity, weather: 'clear', visibility: 'day' },
    objectives: lesson.objectives, events: lesson.scenario ? [lesson.scenario] : [],
    assessmentRules: lesson.assessmentRules, completionCriteria: lesson.completionCriteria
  }));
}
export function resolveScenario(lesson, id) {
  const variants = scenariosFor(lesson), scenario = variants.find(s => s.id === id) || (!id ? variants[0] : null);
  if (!scenario) throw new Error(`Unknown scenario for ${lesson.id}: ${id}`);
  if (!['normal', 'light', 'none'].includes(scenario.conditions.trafficDensity) || scenario.conditions.weather !== 'clear' || scenario.conditions.visibility !== 'day') throw new Error('Unsupported scenario conditions');
  const adapter = locationAdapters.get(scenario.location.adapterId);
  if (!adapter) throw new Error(`Unsupported location adapter: ${scenario.location.adapterId}`);
  const location = adapter.resolve(lesson, scenario);
  if (!location?.areaId || location.waypoints?.length < 2) throw new Error('Scenario has no playable location');
  return { ...scenario, location: { ...scenario.location, ...location } };
}
