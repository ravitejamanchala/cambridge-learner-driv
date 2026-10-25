import { starsOf } from './assessment.js';
// Puzzles: short drives through tricky layouts of the kind found across the UK, graded Easy → Hardest.
// Each layout is a practice copy of a real type of junction (tools/layouts.mjs), not the real place.
// Same shape as a lesson (see course.js) plus `tier`, an optional `yield` event (traffic timed to arrive
// from your right) and optional `callouts` (examiner instructions for places the route builder can't describe).
const pt = (x, z, road) => ({ x, z, road });

export const TIERS = [
  { id: 'easy', title: 'Easy', colour: '#2fbf71', maxD: 3 },
  { id: 'medium', title: 'Medium', colour: '#ffb21a', maxD: 2 },
  { id: 'hard', title: 'Hard', colour: '#ef4f97', maxD: 1 },
  { id: 'hardest', title: 'Hardest', colour: '#8a6ae3', maxD: 0 }
];

// fail outright for not giving way or running a red; anything else counts towards the tier's allowance
const P = (o) => ({ focus: ['Junctions – observation', 'Response to signals – traffic lights'], maxD: TIERS.find(t => t.id === o.tier).maxD, ...o });

export const PUZZLES = [
  P({ id: 'pz-trumpington', tier: 'easy', area: 'rbs', icon: 'mini', title: 'Right at the mini', road: 'Ring Road → Queens Road',
    goal: 'Turn right at the mini-roundabout into Queens Road. A car will come from your right.',
    steps: ['Signal right and position just left of the centre', 'Give way to anything coming from your right', 'Go round the painted circle, not over it'],
    rule: { n: 'Rule 188', t: 'Remember that there is less space to manoeuvre and less time to signal at a mini-roundabout.' },
    waypoints: [pt(-450, 0, 'Ring Road'), pt(-200, 380, 'Queens Road')], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-sturton', tier: 'easy', area: 'park', icon: 'mini2', title: 'Two minis in a row', road: 'Sturton Street → Market Street',
    goal: 'Turn left at the first mini-roundabout, then go straight over the second one. A car will come from your right at the first.',
    steps: ['Slow right down: minis come up fast on narrow streets', 'Signal left for the first; no signal for straight over the second', 'Give way to the right at each one'],
    rule: { n: 'Rule 188', t: 'Approach mini-roundabouts in the same way as normal roundabouts. All vehicles must pass round the central markings.' },
    waypoints: [pt(-800, -350, 'Sturton Street'), pt(-400, 0, 'Market Street')], scenario: 'yield', yieldAt: 0 }),

  P({ id: 'pz-fulbourn', tier: 'medium', area: 'park', icon: 'mini2', title: 'Double mini-roundabout', road: 'Church End → High Street',
    goal: 'Two mini-roundabouts 30 metres apart, staggered. Right at the first, left at the second, so you end up straight across onto High Street. Treat each one as its own roundabout.',
    steps: ['Give way to the right at the first mini, then again at the second', 'Do not stop between them in a way that blocks the first', 'Watch for traffic from the right at both'],
    rule: { n: 'Rule 189', t: 'At double mini-roundabouts treat each roundabout separately and give way to traffic from the right.' },
    waypoints: [pt(-200, 380, 'Church End'), pt(-170, -350, 'High Street')], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-dutch', tier: 'medium', area: 'rbs', icon: 'dutch', title: 'Dutch-style roundabout', road: 'Ring Road → Fendon Road',
    goal: 'Cyclists ride round the outside ring and have priority where you cross it, both in and out. Take the 3rd exit. A cyclist will be on the ring as you arrive.',
    steps: ['Slow down well before the red cycle crossing', 'Give way to cyclists on the ring and people on the zebras', 'Then give way to traffic from the right on the roundabout'],
    rule: { n: 'Rule 186', t: 'Give way to cyclists using the roundabout. They may stay in the left-hand lane when they intend to continue across or around it.' },
    waypoints: [pt(-450, 0, 'Ring Road'), pt(-700, -380, 'Fendon Road')], scenario: 'yield', yieldAt: 0, yieldWith: 'bike' }),

  P({ id: 'pz-fourlamps', tier: 'hard', area: 'park', icon: 'rb5', title: 'Five-arm roundabout', road: 'Market Street → Jesus Lane',
    goal: 'Five roads meet here, and one is one-way INTO the roundabout, so it is not an exit. Count the exits, take the 3rd onto Jesus Lane, and give way to the right.',
    steps: ['Count exits as you go round: a road you cannot enter does not count', 'Signal right on approach; signal left once you pass the 2nd exit', 'Jesus Lane is narrow: watch for cyclists'],
    rule: { n: 'Rule 186', t: 'When taking an exit to the right: signal right and approach in the right-hand lane; signal left after you have passed the exit before the one you want.' },
    waypoints: [pt(100, 0, 'Market Street'), { x: 500 + 360 * Math.sin(160 * Math.PI / 180), z: -360 * Math.cos(160 * Math.PI / 180), road: 'Jesus Lane' }], scenario: 'yield', yieldAt: 0 }),
  P({ id: 'pz-eastroad', tier: 'hard', area: 'rbs', icon: 'rblights', title: 'Roundabout with traffic lights', road: 'Ring Road → Cherry Hinton Road',
    goal: 'Traffic lights on the way in and on the ring. Right-hand lane, 3rd exit, and stop for every red.',
    steps: ['Read the arrows and get into the right-hand lane early', 'Obey the lights on the ring as well as on the approach', 'Signal left after the 2nd exit and leave in your lane'],
    rule: { n: 'Rule 185', t: 'When reaching the roundabout you should give priority to traffic approaching from your right, unless directed otherwise by signs, road markings or traffic lights.' },
    waypoints: [pt(1150, 0, 'Ring Road'), pt(1700, 600, 'Cherry Hinton Road')] }),
  P({ id: 'pz-mitcham', tier: 'hard', area: 'park', icon: 'gyratory', title: 'One-way gyratory', road: 'Market Street round the one-way loop',
    goal: 'A one-way gyratory: to carry on along Market Street you have to go most of the way round it. Follow the one-way arrows and get into the left lane for your exit.',
    steps: ['Turn left into the one-way system: you cannot turn right here', 'Stay in your lane round the loop; read the lane arrows early', 'Left-hand lane, then left onto Market Street'],
    rule: { n: 'Rule 143', t: 'Traffic in a one-way street moves in one direction only. Choose the correct lane for your exit as soon as you can.' },
    waypoints: [pt(800, 0, 'Market Street'), pt(1700, 0, 'Market Street')],
    callouts: [
      { x: 1225, z: 0, text: 'At the end of the road, join the one-way system: turn left and follow it round.', short: 'One-way system · turn left', signal: 'L', icon: 'left' },
      { x: 1240, z: -60, text: 'Follow the one-way system round to the right.', short: 'Follow one-way · bear right', icon: 'right' }
    ] }),

  P({ id: 'pz-milton', tier: 'hardest', area: 'park', icon: 'interchange', title: 'Motorway interchange', road: 'Market Street → Histon Road',
    goal: 'A big traffic-light roundabout over a motorway, three lanes in. The right-hand lane only for the 3rd exit. Lights all the way round; slip roads in and out.',
    steps: ['Three lanes: left for the 1st exit, middle ahead, right ahead or right', 'Stop at every red on the ring', 'Check mirrors and signal left after the 2nd exit before you move across to leave'],
    rule: { n: 'Rule 187', t: 'Watch out for traffic crossing in front of you on the roundabout, especially vehicles intending to leave by the next exit.' },
    waypoints: [pt(1850, 0, 'Market Street'), pt(2400, 800, 'Histon Road')] }),
  P({ id: 'pz-histon', tier: 'hardest', area: 'park', icon: 'interchange', title: 'Interchange: middle lane ahead', road: 'Cambridge Road → Market Street',
    goal: 'The same interchange from the east. The arrows are different here: the middle lane is the only one for straight on. 2nd exit to Market Street.',
    steps: ['Left lane is left only, right lane is right only: take the middle', 'Stop for every red on the ring', 'Signal left after the 1st exit'],
    rule: { n: 'Rule 185', t: 'When reaching the roundabout, give priority to traffic approaching from your right, unless directed otherwise by signs, road markings or traffic lights.' },
    waypoints: [pt(3200, 0, 'Cambridge Road'), pt(1850, 0, 'Market Street')] })
];

// 3 stars: no driving faults. 2 stars: one. 1 star: solved within the tier's allowance.
export const starsFor = (L) => starsOf(L, 'puzzle'); // js/assessment.js: stars come from the marking a puzzle was passed on
