// Parallel parking at the kerb on Elm Road, a quiet 20 mph residential street in the practice town.
// The geometry below is authored training layout in the town area's own metres; it is not a surveyed
// road. East of Bridge Street Elm Road runs east-west at z = 350 and is 9.5 m wide, so the nearside
// kerb for a car heading east sits at z = 345.25 and the centre line at z = 350.
const EAST = -Math.PI / 2; // heading: forward is +x

// The space between two parked cars, a little over two car lengths, and the spot alongside the front
// car where the learner stops before reversing in.
// parked at a kerb, 'parallel enough' is a wider allowance than squaring up inside a marked bay
const BAY = { x: 120, z: 346.35, width: 2.6, length: 7.6, th: EAST, angleTolerance: 12 };
const READY = { x: 126.9, z: 349.3, width: 3.2, length: 6.6, th: EAST };

export const ROADSIDE_PARKING = {
  road: 'Elm Road',
  // the stretch of road the exercise happens on: leaving it means mounting the kerb or crossing to the far side
  bounds: { x: 128, z: 349.3, width: 9.4, length: 80, th: EAST },
  bay: BAY,
  ready: READY,
  kerb: { z: 345.25, from: 88, to: 168 },
  obstacles: [
    { id: 'parked-front', x: 126.9, z: 346.35, width: 1.8, length: 4.3, th: EAST },
    { id: 'parked-rear', x: 113.1, z: 346.35, width: 1.8, length: 4.3, th: EAST }
  ],
  boundaryText: 'Mounted the kerb or crossed to the far side of the road',
  obstacleText: 'Struck a parked car',
  // where the lesson route runs: along Elm Road, past the parked cars
  waypoints: [{ x: -250, z: 350, road: 'Elm Road' }, { x: 700, z: 350, road: 'Elm Road' }]
};

// The approach swings out well before the parked cars so there is room to pass them, and ends
// alongside the front one. The reverse leg then swings the back of the car in behind it.
const approach = [{ x: 95, z: 347.6 }, { x: 103, z: 348.3 }, { x: 110, z: 349.25 }, { x: 120, z: 349.3 }, { x: 126.9, z: 349.3 }];
const reverse = [{ x: 126.9, z: 349.3 }, { x: 123.5, z: 348.9 }, { x: 121, z: 347.6 }, { x: 120, z: 346.35 }];

ROADSIDE_PARKING.manoeuvres = {
  'parallel-park': {
    start: { x: 95, z: 347.6, th: EAST },
    legs: [
      { gear: 'D', path: approach, target: READY, minTravel: 20 },
      { gear: 'R', path: reverse, target: BAY, minTravel: 6 }
    ],
    target: BAY
  }
};

export function parkingPlan(kind, layout = ROADSIDE_PARKING) {
  const plan = layout.manoeuvres?.[kind];
  if (!plan) throw new Error('Unknown parking manoeuvre: ' + kind);
  return plan;
}
