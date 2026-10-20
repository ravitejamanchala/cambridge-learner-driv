import { loadCarModel } from './car.js';
import { TRAFFIC_CAR_IDS, modelSpec } from './cars.js';
// Loading side of the vehicle catalogue. Kept apart from cars.js because this needs a 3D context.

// Loads one model. Resolves to null rather than rejecting, so a missing asset only costs variety.
export function loadVehicleModel(id, assetURL = url => url, decorate = model => model, options = {}) {
  const spec = modelSpec(id);
  return loadCarModel(assetURL(spec.url), { ...spec.options, ...options }).then(decorate).catch(() => null);
}
// Loads every background car model that is available.
export function loadTrafficModels(assetURL = url => url, decorate = model => model) {
  // no L plates on anyone else's car
  return Promise.all(TRAFFIC_CAR_IDS.map(id => loadVehicleModel(id, assetURL, decorate, { learner: false }))).then(list => list.filter(Boolean));
}
