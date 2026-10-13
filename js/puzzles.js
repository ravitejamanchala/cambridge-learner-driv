// Puzzles: short drives through the trickiest real layouts, graded Easy → Hardest.
// Same shape as a lesson (see course.js) plus `tier`, an optional `yield` event (traffic timed to arrive
// from your right) and optional `callouts` (examiner instructions for places the route builder can't
// describe, such as a one-way gyratory). Add a puzzle here; tools/split_areas.mjs gives it its own map area.
const wp = (lat, lon, road) => ({ lat, lon, road });

export const TIERS = [
  { id: 'easy', title: 'Easy', colour: '#2fbf71', maxD: 3 },
  { id: 'medium', title: 'Medium', colour: '#ffb21a', maxD: 2 },
  { id: 'hard', title: 'Hard', colour: '#ef4f97', maxD: 1 },
  { id: 'hardest', title: 'Hardest', colour: '#8a6ae3', maxD: 0 }
];

// fail outright for not giving way or running a red; anything else counts towards the tier's allowance
const P = (o) => ({ focus: ['Junctions – observation', 'Response to signals – traffic lights'], maxD: TIERS.find(t => t.id === o.tier).maxD, ...o });

export const PUZZLES = [
  P({ id: 'pz-sturton', tier: 'easy', icon: 'mini2', title: 'Two minis in a row', road: 'Sturton Street → New Street',
    goal: 'Turn right at the first mini-roundabout, then go straight over the second one. A car will come from your right.',
    steps: ['Slow right down: minis come up fast on narrow streets', 'Give way to anything coming from your right', 'Signal right for the first, not for going straight over the second'],
    rule: { n: 'Rule 188', t: 'Approach mini-roundabouts in the same way as normal roundabouts. All vehicles must pass round the central markings.' },
    waypoints: [wp(52.20637, 0.13936, 'Sturton Street'), wp(52.20779, 0.14057, 'New Street')], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-trumpington', tier: 'easy', icon: 'mini', title: 'Right at the mini', road: 'Trumpington Road → Lensfield Road',
    goal: 'Straight over the first mini-roundabout, then turn right onto Lensfield Road at the second. Watch for traffic from the right.',
    steps: ['No signal for straight over', 'Signal right and position just left of centre for the second', 'Give way to the right, then turn round the painted circle'],
    rule: { n: 'Rule 188', t: 'Remember that there is less space to manoeuvre and less time to signal at a mini-roundabout.' },
    waypoints: [wp(52.19591, 0.12231, 'Trumpington Road'), wp(52.19810, 0.12381, 'Lensfield Road')], scenario: 'yield', yieldAt: 1 }),

  P({ id: 'pz-fulbourn', tier: 'medium', icon: 'mini2', title: 'Double mini-roundabout', road: 'Fulbourn · Church End → High Street',
    goal: 'Two mini-roundabouts a few metres apart. Treat each one as its own roundabout: give way to the right at both, then turn right onto High Street.',
    steps: ['Signal right on approach', 'Give way to the right at the first mini, then again at the second', 'Do not stop between them if a car is waiting behind on the far side'],
    rule: { n: 'Rule 189', t: 'At double mini-roundabouts treat each roundabout separately and give way to traffic from the right.' },
    waypoints: [wp(52.19422, 0.17805, 'Church End'), wp(52.19078, 0.17740, 'High Street')], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-dutch', tier: 'medium', icon: 'dutch', title: 'Dutch-style roundabout', road: 'Fendon Road → Queen Edith\'s Way',
    goal: 'The UK\'s first Dutch-style roundabout: cyclists ride round the outside ring and have priority where you cross it. Take the 3rd exit.',
    steps: ['Slow down well before the cycle ring', 'Give way to cyclists on the ring and people on the zebras', 'Then give way to traffic from the right on the roundabout'],
    rule: { n: 'Rule 186', t: 'Give way to cyclists using the roundabout. They may stay in the left-hand lane when they intend to continue across or around it.' },
    waypoints: [wp(52.17748, 0.14677, 'Fendon Road'), wp(52.17948, 0.15097, "Queen Edith's Way")], scenario: 'yield', yieldAt: 0, yieldWith: 'bike' }),

  P({ id: 'pz-fourlamps', tier: 'hard', icon: 'rb5', title: 'Four Lamps', road: 'Victoria Avenue → Jesus Lane',
    goal: 'Five roads and one-way streets meet at Four Lamps. Count the exits, take the 3rd onto Jesus Lane, and give way to the right.',
    steps: ['Count exits as you go round, one-way streets that you cannot enter do not count', 'Signal right on approach, left after the 2nd exit', 'Jesus Lane is narrow: watch for cyclists'],
    rule: { n: 'Rule 186', t: 'When taking an exit to the right: signal right and approach in the right-hand lane; signal left after you have passed the exit before the one you want.' },
    waypoints: [wp(52.21244, 0.12603, 'Victoria Avenue'), wp(52.20792, 0.12642, 'Jesus Lane')], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-eastroad', tier: 'hard', icon: 'rblights', title: 'Roundabout with traffic lights', road: 'Newmarket Road → Elizabeth Way',
    goal: 'This roundabout has traffic lights on the way in and on the ring. Right-hand lane, 3rd exit, and stop for every red.',
    steps: ['Get into the right-hand lane early', 'Obey the lights on the ring as well as on the approach', 'Signal left after the 2nd exit and leave in the correct lane'],
    rule: { n: 'Rule 185', t: 'When reaching the roundabout you should give priority to traffic approaching from your right, unless directed otherwise by signs, road markings or traffic lights.' },
    waypoints: [wp(52.20905, 0.14161, 'Newmarket Road'), wp(52.21203, 0.13637, 'Elizabeth Way')] }),
  P({ id: 'pz-mitcham', tier: 'hard', icon: 'gyratory', title: "Mitcham's Corner one-way system", road: 'Victoria Avenue → Milton Road',
    goal: 'A one-way gyratory: to go ahead onto Milton Road you have to go all the way round it. Follow the arrows and pick lanes early.',
    steps: ['Read the lane arrows before you join', 'Stay in your lane round the gyratory', 'Left-hand lane for Milton Road at the end'],
    rule: { n: 'Rule 143', t: 'Traffic in a one-way street moves in one direction only. Choose the correct lane for your exit as soon as you can.' },
    waypoints: [wp(52.21292, 0.12575, 'Victoria Avenue'), wp(52.21651, 0.12633, 'Milton Road')],
    callouts: [
      { lat: 52.21411, lon: 0.12571, text: "At Mitcham's Corner, join the one-way system and bear left onto Chesterton Road.", short: 'One-way system · bear left', icon: 'left' },
      { lat: 52.21399, lon: 0.12323, text: 'Follow the one-way system round to the right onto Victoria Road.', short: 'Follow one-way · Victoria Road', icon: 'right' },
      { lat: 52.21439, lon: 0.12480, text: 'Get into the left-hand lane and turn left onto Milton Road.', short: 'Left lane · Milton Road', signal: 'L', road: 'Milton Road' }
    ] }),

  P({ id: 'pz-milton', tier: 'hardest', icon: 'interchange', title: 'Milton Interchange', road: 'A14 junction · Milton Road → Cambridge Road',
    goal: 'A huge signal-controlled roundabout over the A14 at up to 50 mph. Right-hand lane, 3rd exit, lights all the way round.',
    steps: ['Right-hand lane from the start', 'Stop at every red on the ring; lanes are marked for exits', 'Check mirrors and signal left before you move across to leave'],
    rule: { n: 'Rule 187', t: 'Watch out for traffic crossing in front of you on the roundabout, especially vehicles intending to leave by the next exit.' },
    waypoints: [wp(52.23422, 0.15063, 'Milton Road'), wp(52.23797, 0.15482, 'Cambridge Road')] }),
  P({ id: 'pz-histon', tier: 'hardest', icon: 'interchange', title: 'Histon Interchange', road: 'A14 junction · Histon Road → Bridge Road',
    goal: 'Another signal-controlled interchange over the A14. Ten sets of lights; take the 2nd exit to Bridge Road.',
    steps: ['Read the lane markings: some lanes are for the A14 only', 'Stop for every red on the ring', 'Signal left after the 1st exit'],
    rule: { n: 'Rule 185', t: 'When reaching the roundabout, give priority to traffic approaching from your right, unless directed otherwise by signs, road markings or traffic lights.' },
    waypoints: [wp(52.23014, 0.11148, 'Histon Road'), wp(52.23827, 0.11195, 'Bridge Road')] })
];

// 3 stars: no driving faults. 2 stars: one. 1 star: solved within the tier's allowance.
export const starsFor = (L) => !L || !L.passed ? 0 : L.bestD === 0 ? 3 : L.bestD <= 1 ? 2 : 1;
