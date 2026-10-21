// Parallel parking at the kerb on a real street in the practice town, between two parked cars.
// The route brings the learner along Elm Road to the space; the manoeuvre itself is assessed against
// the marked target (js/roadside-parking.js).
export const PARKING_LESSONS = [
  { id: 'parallel-park', unit: 'parking', locationId: 'elm-parallel', road: 'Elm Road · 20 mph',
    title: 'Parallel parking at the kerb', scenario: 'parking', manoeuvre: true, parkingKind: 'parallel-park',
    focus: ['Control', 'Manoeuvre', 'Move off'], maxD: 0,
    scenarioVariants: [{ id: 'quiet', title: 'Quiet residential street', trafficDensity: 'none' }],
    completionCriteria: { type: 'whole-vehicle-target-and-secure' },
    goal: 'Park at the kerb between two cars: pull up alongside the front one, then reverse in.',
    steps: ['Tap Release parking brake to set off',
      'Stop in the marked box alongside the front car',
      'Hold the back arrow to reverse into the space',
      'Tap Park when you are straight and close to the kerb'],
    rule: { n: 'Rules 202, 239 and 243', t: 'Before reversing, make sure there are no pedestrians, particularly children, cyclists or obstructions in the road behind you, and look all round. Choose an appropriate place to manoeuvre, and when you park, stop as close as you can to the side of the road. Do not park where you would obstruct a road or a junction.' } }
];
