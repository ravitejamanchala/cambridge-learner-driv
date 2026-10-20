// Parallel parking at the kerb on a real street in the practice town, between two parked cars.
// The route brings the learner along Elm Road to the space; the manoeuvre itself is assessed against
// the marked target (js/roadside-parking.js).
export const PARKING_LESSONS = [
  { id: 'parallel-park', unit: 'parking', locationId: 'elm-parallel', road: 'Elm Road · 20 mph',
    title: 'Parallel parking at the kerb', scenario: 'parking', manoeuvre: true, parkingKind: 'parallel-park',
    operationControls: true, vehicle: { transmission: 'automatic' },
    focus: ['Control', 'Manoeuvre', 'Move off'], maxD: 0,
    scenarioVariants: [{ id: 'quiet', title: 'Quiet residential street', trafficDensity: 'none' }],
    completionCriteria: { type: 'whole-vehicle-target-and-secure' },
    goal: 'Drive along Elm Road to the gap between two parked cars. Pull up alongside the front car, then reverse into the space. Finish within two car lengths, parallel to and close to the kerb, then secure the car.',
    steps: ['Hold the footbrake, select D, check round (B) and release the parking brake',
      'Drive past the parked cars with room to spare and stop alongside the front one, inside the highlighted box',
      'Select R, check round again, then reverse into the space at walking pace: keep looking round as you go',
      'Finish straight and close to the kerb, then select P, apply the parking brake and switch off the engine'],
    rule: { n: 'Rules 202, 239 and 243', t: 'Before reversing, make sure there are no pedestrians, particularly children, cyclists or obstructions in the road behind you, and look all round. Choose an appropriate place to manoeuvre, and when you park, stop as close as you can to the side of the road. Do not park where you would obstruct a road or a junction.' } }
];
