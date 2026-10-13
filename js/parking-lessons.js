const base = { unit: 'parking', locationId: 'parking-aisle', road: 'Closed parking practice area', scenario: 'parking', manoeuvre: true,
  operationControls: true, vehicle: { transmission: 'automatic' }, focus: ['Control', 'Manoeuvre', 'Move off'], maxD: 0,
  scenarioVariants: [{ id: 'closed', title: 'Closed training area', trafficDensity: 'none' }],
  completionCriteria: { type: 'whole-vehicle-target-and-secure' },
  rule: { n: 'Rules 202 and 239', t: 'Check carefully before reversing, move slowly, and secure the vehicle when parked.' } };
export const PARKING_LESSONS = [
  { ...base, id: 'forward-bay', title: 'Forward bay parking', parkingKind: 'forward-bay', prerequisites: ['automatic-drive', 'steering-control'],
    goal: 'Turn right into the highlighted bay and park the whole car between its lines, facing the arrow. Stop straight, select P, apply the parking brake and switch off the engine.',
    steps: ['Hold the footbrake, select D, check round (B) and release the parking brake', 'Follow the optional guide at walking pace; use C to change camera', 'Fit the whole car in the highlighted bay, stop, select P, apply the parking brake and switch the engine off'] },
  { ...base, id: 'reverse-bay', title: 'Reverse bay parking', parkingKind: 'reverse-bay', prerequisites: ['automatic-reverse', 'steering-control'],
    goal: 'Reverse through a right-angle turn into the highlighted bay. Finish between its lines and facing the arrow, then secure the vehicle.',
    steps: ['Hold the brake, select R, check round (B) and release the parking brake', 'Reverse at walking pace and repeat B observation inputs during the manoeuvre', 'Stop straight inside the bay, select P, apply the parking brake and switch off the engine'] },
  { ...base, id: 'leave-bay', title: 'Leaving a parking bay safely', parkingKind: 'leave-bay', prerequisites: ['forward-bay'],
    goal: 'Reverse clear of the bay into the aisle, stop and check again before selecting D. Drive to the highlighted exit box and stop to finish.',
    steps: ['Check round (B), select R with the brake pressed, then release the parking brake', 'Reverse clear, stop, check again and select D; do not change direction while moving', 'Drive to the exit box, stop and secure the vehicle to end the exercise'] }
];
