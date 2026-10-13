import { PARKING_LAYOUT } from './parking-layout.js';
// Verified practice-layout locations. Curriculum records refer to these IDs rather than owning coordinates.
// Synthetic layouts are not surveyed roads or verified real test routes.
export const PRACTICE_LOCATIONS = {
  'parking-aisle': { areaId: 'parking', waypoints: PARKING_LAYOUT.aisle },
  'country-bends': { areaId: 'roads', waypoints: [
    { x: 3500, z: 48, road: 'Grantchester Lane' }, { x: 3500, z: 1650, road: 'Grantchester Lane' }
  ] },
  'elm-straight': { areaId: 'town', waypoints: [
    { x: -640, z: 350, road: 'Elm Road' }, { x: -330, z: 350, road: 'Elm Road' }
  ] }
};
export function lessonLocation(lesson, locationId = lesson.locationId) {
  if (locationId) {
    const location = PRACTICE_LOCATIONS[locationId];
    if (!location) throw new Error(`Unknown practice location: ${locationId}`);
    return location;
  }
  // Compatibility adapter for v1.1 definitions; migrate them individually when expanded.
  return { areaId: lesson.area, waypoints: lesson.waypoints };
}
