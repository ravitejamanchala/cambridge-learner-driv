// Lesson identities are independent of the verified practice location.
const base = { unit: 'basics', locationId: 'elm-straight', road: 'Elm Road · practice layout',
  focus: ['Control', 'Move off', 'Positioning', 'Use of speed'], maxD: 0,
  rule: { n: 'Rules 97 and 159', t: 'Prepare your vehicle before setting off; check that it is safe before moving away.' } };
export const BASIC_LESSONS = [
  { ...base, id: 'cockpit-drill', title: 'Cockpit preparation', scenario: 'cockpit', operationControls: true,
    completionCriteria: { type: 'stationary-controls' },
    goal: 'Prepare the simulated cockpit while parked. Close the door, confirm seat and mirror setup, and fasten the belt. The car cannot drive until preparation is complete.',
    steps: ['Keep the engine off and parking brake on', 'Use cockpit buttons to close the door and confirm seat and mirrors', 'Fasten the belt; these are simulator acknowledgements, not measured physical adjustments'] },
  { ...base, id: 'engine-control', title: 'Starting and stopping the engine', scenario: 'engine', operationControls: true,
    prerequisites: ['cockpit-drill'], completionCriteria: { type: 'stationary-controls' },
    goal: 'Prepare the cockpit, start the engine with the parking brake on, then switch it off without moving.',
    steps: ['Close the door, confirm seat and mirrors, and fasten the belt', 'Keep the parking brake on and press Engine (I) to start', 'Press Engine again to switch off and secure the vehicle'] },
  { ...base, id: 'mirror-practice', title: 'Mirror and blind-spot inputs', scenario: 'mirrors',
    goal: 'Before moving away, select the interior mirror, right mirror and right blind-spot checks. Repeat the three inputs before pulling up at the end.',
    steps: ['Press the three observation buttons before accelerating', 'Drive along Elm Road without positioning or control faults', 'Use the three inputs again before stopping; only button presses are assessed'] },
  { ...base, id: 'controlled-stop', title: 'Controlled stopping', scenario: 'controlled-stop',
    goal: 'Build up to 10–15 mph. When the stop prompt appears, brake to a halt within 30 metres. Then check and continue to the finish.',
    steps: ['Check round (B) before moving', 'Reach 10–15 mph on the straight', 'At the prompt, stop within 30 metres using the brake, then check and continue'] },
  { ...base, id: 'accel-decel', title: 'Acceleration and deceleration', scenario: 'accel-decel',
    goal: 'Hold 10–15 mph for three seconds, then release the accelerator. Reduce speed below 8 mph before continuing to the finish.',
    steps: ['Check round (B), then accelerate progressively', 'Keep between 10 and 15 mph for three seconds', 'When prompted, release the accelerator and slow below 8 mph'] }
];

BASIC_LESSONS.push(
  { ...base, id: 'steering-control', rule: { n: 'Rules 154 and 160', t: 'Keep left and reduce speed before bends. The training cap is an exercise target, not this road’s legal speed limit.' }, locationId: 'country-bends', road: 'Grantchester Lane · practice bends', title: 'Steering through bends', scenario: 'steering', prerequisites: ['controlled-stop'],
    scenarioVariants: [{ id: 'closed', title: 'Closed practice route', trafficDensity: 'none' }],
    goal: 'Follow the practice bends below 15 mph. Steer both ways smoothly while keeping left; finish the complete route without rerouting.',
    steps: ['Check round (B) before moving', 'Look ahead through each bend and keep below 15 mph', 'Use both left and right steering; stay within your lane and stop at the finish'] },
  { ...base, id: 'automatic-drive', title: 'Automatic: drive and park', scenario: 'automatic-drive', operationControls: true, vehicle: { transmission: 'automatic' }, prerequisites: ['engine-control'],
    scenarioVariants: [{ id: 'closed', title: 'No ambient vehicle traffic', trafficDensity: 'none' }], completionCriteria: { type: 'selector-distance-secure' },
    goal: 'In a prepared automatic car, select D with the footbrake pressed. Check round, release the parking brake, drive 50 metres, stop and secure the car in P.',
    steps: ['Hold S or the brake pedal; select D, check round (B), then release the parking brake (P)', 'Use the accelerator to travel 50 metres; releasing pedals allows idle creep', 'Brake to stop, keep the footbrake pressed, select P and apply the parking brake'] },
  { ...base, id: 'automatic-reverse', rule: { n: 'Rule 202', t: 'Check carefully before reversing and reverse slowly, keeping aware of people and vehicles around you.' }, title: 'Automatic: low-speed reversing', scenario: 'automatic-reverse', operationControls: true, vehicle: { transmission: 'automatic' }, prerequisites: ['automatic-drive'],
    scenarioVariants: [{ id: 'closed', title: 'No ambient vehicle traffic', trafficDensity: 'none' }], completionCriteria: { type: 'selector-distance-secure' },
    goal: 'Select R with the footbrake pressed, check round and reverse straight back six metres at walking pace. Stop, select P and apply the parking brake.',
    steps: ['Hold the brake, select R and check round (B); release the parking brake', 'Use idle creep to reverse six metres; keep below about 4 mph', 'Brake to a complete stop, select P while holding the brake, then apply the parking brake'] }
);
