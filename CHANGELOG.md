# Changelog

## Unreleased: motorways, junction markings and pull-request previews

- **Choose how strictly you are marked: Easy, Medium or Hard.** Pick it in the lesson, puzzle or mock-test panel before you start. A pass earns one star on Easy, two on Medium and three on Hard, and each lesson keeps its best. Hard is the standard every drive was marked on before, and for a mock test it is the real test (15 driving faults, no serious faults). Medium allows three more driving faults; Easy six more and one serious fault. Neither ever forgives a collision, and the lesson's goal is always required. The result says which mode it was. Lessons passed before this count as three stars.
- **Slow traffic keeps to the left-hand lane.** Background vehicles used to keep whatever lane they started in, so a slow car could sit in the middle or right-hand lane indefinitely. Now slower vehicles start on the left, move back left once they have nothing to pass, pull out to overtake, and get across in good time for a motorway exit, always into a real gap.
- **Traffic signals, gives way and varies, like people do.** Background vehicles never used an indicator, so you could not tell where anyone was going, and every car behaved alike.
  - **Indicators**: a vehicle about to change lane flashes its indicator for a couple of seconds first, then moves. One driver in twenty never signals. With no gap it keeps signalling and eases off to drop in behind; a lane change abandons itself if someone turns up alongside.
  - **Courtesy**: about half the drivers ease off to let you in when you signal into their lane beside or just ahead of them, and some move over for you on the slip road. The rest hold their speed, so a gap is still yours to judge.
  - **Every driver is a little different**: following distance, accepted gap and patience are drawn per vehicle from the traffic seed.
- **Motorway lane changes are judged less mechanically.** A wobble towards the line that comes back is no longer marked as an unsignalled lane change: the mirror and signal are checked when the car actually crosses the line. Moving into a gap ahead of a slower vehicle you are pulling away from is no longer *too small a gap*; what counts is whether the vehicle behind would have to brake. Moving left and then onto the slip road is *cutting across* only inside the last 100 yards. Joining slowly behind traffic that is itself waiting on the slip road is not *joining too slowly*. When someone moves into the gap in front of you, you get the same few seconds to drop back as after a lane change of your own, and staying close after that is marked as before. Collisions, cutting in and forcing someone to brake are marked as before.
- **The Bot lab can drive in random traffic** (*Traffic: random*, or `BOT_TRAFFIC=random`), so a drive is tested against traffic it has not been tuned to, not only the lesson's scripted cars. The reference driver now reads other drivers' indicators, follows traffic down the slip road, and moves across into a gap as soon as it is alongside one instead of following the slip road to its end.
- **Driving off the road is marked, and the car is easier for a person to steer.**
  - **Leaving the road could pass.** Nothing was marked until the middle of the car was 0.8 m past the edge, and then only as one driving fault, so a car could run onto the verge and still pass. Now the wheels are judged against the road as drawn: a wheel over the edge is *Mounted the kerb* (driving fault), and the car off the road is *Drove off the road* (serious). Free drive still marks nothing, but its summary says how long the wheels were off the road.
  - **Steering is limited by grip.** Full input turns the wheels to full lock at walking pace, then no further than a firm turn of about 7 m/s² sideways. Before, a full press at 30 mph turned the car at about 25 m/s² (no car can), so every tap of a key was a swerve.
  - **No mirror checks to press in the chase view.** The mirrors are always on screen there, so mirror and shoulder checks count as made and are not marked; the run detail says so. The driver's view marks them as before.
  - **Game controllers and wheels** work: left stick or wheel steers, triggers are the pedals, LB and RB indicate, Y checks the mirrors. Keys and touch still work as before and win over an idle controller.
  - **A person-like driver in the Bot lab** (*A person on keys*, *A person on a controller*) runs any drive with a reaction time, a few decisions a second, tapped keys or an unsteady stick. Over all 60 drives, the steering change halved the time a person on keys spent off the road (274 s to 134 s) and cut it fivefold on a controller (88 s to 16 s, serious faults 33 to 6). On keys the pass rate did not move (34 of 60): town turns on on/off keys still clip kerbs.
  - The reference bot now steers by wheel angle through the same grip limit as everyone else, and passes all 60 drives, including the two-lane roundabout that used to stall.
- **Evening motorway driving** (issue #10).
  - **Three lessons at dusk**: *Joining at dusk*, *Following at dusk* and *Leaving the motorway at dusk*, the same motorway lessons set as the light goes, with the time of day saved in the lesson data. A **Motorway at dusk** free drive too.
  - **What changes is only what you see**: a dusk sky, lamps on every vehicle (tail lights always, headlights on), road studs in their proper colours, lit columns at each junction, and signs that glow in the headlights. The road, the traffic and every rule are the same as by day: the same careless drive is given the same faults at dusk, and the Bot lab's careful drives come out the same.
  - **Headlights**: switch dipped headlights on with **H** or the lights button, which only appears at dusk. Driving off without them is marked once, as a driving fault under ancillary controls (Rules 113 and 115).
  - **Fair at dusk**: the fog never closes in nearer than 600 m and every vehicle shows its lamps, so nothing the examiner marks is hidden by the lighting.
  - **Low-power graphics** (Settings → Graphics): no shadows, no headlight beam or light pools on the road, and a lower pixel ratio, with the lamps kept. Menus honour reduced motion.
  - **Fixed along the way:** the headlight beam was left behind in the previous scene whenever a new map area loaded, so it never lit the road.
  - **Cheap enough to draw.** The first measurement put a dusk frame at 2.6× the cost of a day one: every road stud on the 24 km circuit was drawn every frame, 100,000 of the 140,000 triangles in view. Studs are now drawn only within 800 m of the car (about 500 of them), and a dusk frame costs about 1.35× a day one; on low-power graphics it costs less than day.
  - Evidence: clips, day-and-dusk stills from the same spot and frame times in [docs/evidence/10-evening-motorway](docs/evidence/10-evening-motorway/README.md). The frame times are from the headless software renderer, so they compare day, dusk and low power with each other; measuring on real phones and laptops is still to do.
- **Leaving the motorway, and missing your exit** (issue #9).
  - **Exits are signed**: blue advance direction signs at 1 mile and ½ mile, countdown markers at 300, 200 and 100 yards, and the final sign at the slip road, on both carriageways of both motorway worlds.
  - *Leaving the motorway* (two lanes, junction 3): follow the signs, mirror and signal by the 300-yard marker, keep up with the traffic until you are on the slip road, then slow for its bend and give way at the roundabout before driving on along the A301. Leaving without a mirror check or a signal, braking hard on the carriageway before the slip road, and taking the slip road's bend too fast are each marked.
  - *If you miss your exit* (three lanes, junction 3): a solid line of lorries means there is no safe gap. Carrying on to the next junction passes; stopping on the motorway, reversing, or cutting across the hatching to reach the slip road are serious faults.
  - **A missed exit now carries on safely in every exit lesson**: the route continues to the next junction and the instruction box says so, instead of the lesson simply stopping. Not being in lane for an exit is no longer marked when traffic gave you no chance to get there.
  - **Slip roads curve gently now.** The bend where each slip road swept away to its roundabout was as tight as a 27 m radius (it suited about 20 mph); the roundabouts sit closer and the slip roads curve over a longer stretch, so no bend is tighter than about 135 m.
- **Joining the motorway, and traffic joining beside you** (issue #8). Two more motorway lessons:
  - *Joining the motorway*: from the slip road at 30 mph into a left-hand lane where the first gap closes as you reach it and the middle lane is busy. Build up speed, look, signal, and fit into a gap without making anyone brake. Joining beside a car, into a gap that makes the car behind brake, far slower than the traffic, or moving straight out again are all marked; joining is judged as a lane change from the slip road, with the same mirror and signal checks.
  - *Traffic joining from a slip road*: two vehicles come down the slip road as you pass, with a car alongside you in the middle lane. You have priority. Keeping your lane and speed, easing off, or moving over once it is safe all pass, and the result says which you did; moving over into the occupied lane does not.
  - **Joining traffic now gives way** to traffic already on the motorway, the learner included: it fits into a real gap or drops back behind, and with no gap waits at the end of the acceleration lane rather than forcing in. Nothing on the motorway is made to brake or move over for it.
  - **Fixed along the way:** traffic in the outer lanes slowed to the speed of whatever was in the next lane on long bends, because "is it in my lane?" was measured across the car's own heading; it is now measured across the road between the two. The same bends made cars brake for a learner in the next lane, and joining traffic braked hard for a corner that was only the node where the slip road meets the motorway.
- **Motorway lessons: lane discipline, overtaking and following distance** (issue #7). A new **Motorways** unit with four lessons, each with its own scripted traffic so every run is the same:
  - *Keep left, overtake, move back* (three lanes), *Overtaking when the next lane is busy* (two lanes), *Following distance at 70* (traffic slowing and speeding up in every lane) and *Getting into lane for your exit* (from the right-hand lane to junction 2).
  - **Judged in context, not lane by lane.** Being out of the left-hand lane is fine while you are overtaking or waiting for a safe gap to move back; what is marked is a lane change without a mirror check or signal, a gap that makes someone brake, cutting in, sweeping across two lanes, staying out with nothing to pass, sitting under two seconds behind, passing on the left, and not being in lane for an exit. Every rule is in `js/lane-discipline.js`, and `tests/lane-discipline.test.mjs` runs scripted careful and careless traces through it.
  - **Instruments, not sentences:** the lane strip shows the lanes that are right for you and the one you are in; the following lesson shows your gap to the car ahead in seconds.
  - **Feedback itemises every lane change**: speed, which mirror was checked, whether you looked over your shoulder, how long you signalled first, and the gap you moved into; plus your following record and how long you were out of the left-hand lane, and why.
  - The Bot lab's test driver can now drive a motorway: it keeps left, overtakes only into a safe gap, moves back without cutting in, keeps two seconds and gets across for an exit one lane at a time. `npm run test:motorway` drives the careless versions and checks each is marked for what it was, the same way twice.
  - **Fixed along the way:** slip roads began and ended on the carriageway's centre line, so traffic and the route guide swung right across the motorway before taking an exit; they now leave from and join the left-hand lane. And the kerb check could mark a car in lane 1 as off the road where a slip road leaves, because the slip's centre line was nearer than the motorway's; road surface is now judged against every road nearby.
  - **The instruction box no longer runs into the speedometer** on mid-width windows (around 900 px) when it carries a junction name and a lane strip: it slides left just enough to clear the instruments, measured from the real elements, and never into the map.
- **Motorways, and a free drive that goes on as long as you like** (issue #6). Two new worlds, with two and three lanes each way, on a 15-mile circuit of long straights and gentle bends: central reservation and barrier, hard shoulders, 2 m / 7 m lane lines, four junctions with diverge and merge slips, roundabouts and blue advance signs. Pick **Free drive** in the lobby.
  - Free drive is **ungraded**: no faults, no result, and nothing written to the learner's record or account. Leave at a junction and a route back onto the circuit is built from wherever you are; the instruction box counts down to the next junction rather than the end of the route.
  - **End drive** shows a summary of what was measured — distance, time, average speed, laps, junctions passed, the longest stretch kept at or under the limit, and the top speed. Any time over the limit is said plainly, measured against the limit of the road you were on (70 on the motorway, 60 and 40 on the roads at the junctions).
  - **Memory stays bounded however long you drive.** Scenery further than 1.5 km from the car is freed. `npm run test:free` drives for 14 minutes, right round the circuit, sampling memory and frame time, and fails if either keeps growing; the numbers go to `test-results/free-drive-benchmark.json`.
  - Background traffic keeps to its lane on the motorway at lane-appropriate speeds, and bicycles stay off it.
  - Leaving at a junction keeps the directions on the way back (the roundabout at the bottom of the slip road, the turn back on); the junction countdowns are only for the carriageway itself.
  - **Fixed along the way:** the Start button in the Free drive, Mock test and Puzzles sheets started whatever had last been chosen in the lobby, so opening Free drive and pressing Start straight away could begin a graded town lesson. Each sheet's Start now starts what that sheet shows.
  - Evidence: real-time clips of each of the above in [docs/evidence/6-motorway-free-drive](docs/evidence/6-motorway-free-drive/README.md), recorded with the new `npm run evidence -- motorway`.
- **A preview for every pull request.** Each one is deployed to `https://pr-<number>.learner-drive-app.pages.dev/`, with the link posted on the pull request. Previews run as a guest with the whole course open, never touch production, and carry a small "Preview build" label in the lobby. See [deployment](docs/deployment.md#pull-request-previews).

## Unreleased: map corrections, steering wheel, head angles and a mirror in the chase view

- **The Cambridge map is corrected from street-level imagery.** A review of 568 Mapillary features in
  the road inspector, applied to `data/cambridge.json` and kept in
  [data/corrections](data/corrections/) as the provenance of the map:
  - **244 roads have their corners rounded off.** The overrides only add intermediate points — every
    polyline keeps its endpoints, and the centre line moves by at most 6 cm — so every mock-test route
    came out the same length with the same examiner instructions afterwards.
  - **21 zebra crossings and 17 stop lines** that the map did not have. The other 47 markings in the
    file were already on the map within 12 m and were dropped: a second zebra beside an existing one
    would have the examiner mark a learner twice for one crossing.
  - **483 surveyed street lamps**, used in place of the lamp posts the city builder spaces out along
    main roads. A spaced-out pole within 16 m of a surveyed one is dropped rather than standing next
    to it, and each surveyed pole turns to face the road it stands beside.
  - **Lamp posts stood in the road, and their heads were placed from a point that does not exist.**
    `nearest()` reports how far off the centre line you are, not the point on it, so reading `nr.x`
    gave `NaN` and every surveyed lamp head got a nonsense transform. The point is now reconstructed
    from the offset, and a lamp the survey put inside the carriageway is stepped out to the kerb —
    the same 0.9 m stand-off the spaced-out poles use. 65 of 986 needed moving; none now stands
    closer than 0.90 m to a carriageway edge.
- **Roads had unmarked stretches.** A road is cut into one edge per junction, and the centre line and
  lane dividers kept a fixed 9 m clear of each end — so any edge shorter than 18 m got no markings at
  all, and the road looked bare between two marked stretches. A 12 m length of Hills Road and a 17 m
  length of The Fen Causeway were among them. The clearance now scales with the edge, which takes the
  unmarked total on the mock-test maps from 2,274 m to 98 m, all of it stubs under 5 m where a centre
  line would be wrong anyway.
  - The one road-attribute correction in the file (Milton Road's width and lane count) was already
    what the map said, so nothing changed there.

## Unreleased: sign-in gate, blue light vehicles, hold-to-look and parallel parking
- **Sign in before driving.** Where the build is configured with an account service, the lobby, lessons, puzzles and mock tests all stay locked until the learner signs in, and the sign-in sheet says so. A build with no account service configured (local development, the demo build) still runs as a guest on the device, so those builds are not left unusable.
  - Signing out now drops verified paid access with the session, instead of leaving it behind until the next API call.
- **New lesson: blue light vehicle** (Rule 219). An emergency vehicle comes up behind with a flashing blue light bar. Slow right down and pull in on the left to let it past.
  - Not slowing down or making room is a driving fault, as is holding it up for more than 20 seconds, and so is stopping on a crossing or in a junction to get out of its way.
  - **Every mock test** now brings a blue light vehicle up behind the learner part way round the route, marked the same way.
  - The vehicle still obeys traffic lights; real crews may treat a red as a give-way, which this build deliberately does not model.
- **Hold to look left and right.** <kbd>Z</kbd> looks left and <kbd>X</kbd> looks right, held down, in the chase view as well as the driver view. The camera swings; the car keeps going where it is pointed, so you can check a roundabout or a junction without steering into it. Each press is recorded as an observation. <kbd>B</kbd> still records an all-round check. Two held buttons beside the eye do the same on a touch screen.
- **Parallel parking at the kerb** replaces the closed bay-parking area.
  - Elm Road east of Bridge Street is now 9.5 m wide, with a marked space between two parked cars. The lesson route takes the learner along the road to the space.
  - Drive past the parked cars, pull up alongside the front one in the highlighted box, then reverse in, finish parallel and close to the kerb, and secure the car.
  - Striking a parked car or leaving the road is a serious fault; the manoeuvre is assessed on the whole car being inside the space, within 12° of parallel, stopped and secured.
  - The closed training area and the `forward-bay`, `reverse-bay` and `leave-bay` exercises are removed. Saved records for those IDs are left alone and simply unused.
  - The angle allowance is now a property of the target rather than a fixed 8°, so a kerbside park and a marked bay can differ.
- **Every vehicle is a car from the garage.** The background traffic, the parked cars in the parking lesson and the blue-light vehicle are all drawn from the same eight models the learner can choose, instead of coloured boxes. Only the learner's car carries L plates.
- The blue-light vehicle is a **police car**, and it always comes **up behind the learner**, because finding it in the mirrors is the skill being practised. The oncoming case is gone.
  - It no longer follows for ever: after 45 seconds it finds another way and the drive carries on, instead of leaving a siren behind the learner for the rest of the route.
  - It gets past once the learner has made room beside it **or** slowed to a crawl.
- **Parking is one control.** Tap once to release the parking brake, hold the back arrow to reverse, tap once to park. The P/R/N/D selector and the cockpit drill are gone from the manoeuvre, and the control is a small button in the corner rather than a panel across the view.
  - Parking no longer forces the overhead view on the learner.
  - Parking bays are marked with broken white lines, as on a UK road.
- **A steering wheel you can see working.** The cockpit had a thin ring with one bar across it, which
  gave no sense of rotation at all — a bar at 180° looks exactly like a bar at 0°. It is now a rim, a
  centre hub and three spokes on a tilted column, turning with the driver's input (2.3 rad at full
  lock, not the real 450°, which spins out of sight when full lock is one key press away).
- **The cockpit reads as a car.** A dashboard that closes off the bottom of the view instead of
  letting you see the road underneath it, a windscreen header, slimmer A-pillars at the edges of the
  glass, an instrument binnacle behind the wheel, and a roof rail and door waist down each side — so
  the wing mirrors are mounted on something rather than floating in mid-air.
- **How far the head turns now matches what the check is.** A glance in a door mirror swings about
  **45°** (it was 106°); holding the same key until it becomes a blind-spot check opens out to about
  **95°**, over the shoulder; `B` is the interior mirror, so it barely moves the head (15°, down from
  100°). The chase view uses 0.8 of those, because the car is in shot as well. `npm run test:drive`
  measures all three.
- **The rear-view mirror is in the chase view as well**, as a panel under the instruction box. It is
  the same camera and the same render target as the glass on the windscreen, so it costs no extra draw.
- **The blue lights are the police car's own.** The model carries a light bar with a `BlueLights`
  material on the lenses; that is what flashes now, rather than a second bar bolted over the top. The
  lenses pulse together and an additive halo alternates end to end, so something is lit at every
  moment — the old pattern left the bar dark half the time, which is why it was easy to miss in a
  mirror. The halo keeps a floor on its size, so the light still registers far down the road.
- **Mobile.** Anything drawn into the 3D view is now placed from the interface's own measurements
  rather than a guessed share of the screen: a fixed fraction put the rear-view panel straight through
  the speedometer on a phone held sideways. The rear-view mirror in the cockpit is also drawn in
  towards the middle on an upright phone, where it used to sit off the left edge entirely — and that
  is the mirror the whole blue-light exercise depends on. `npm run test:drive` checks both at
  1280×720, 390×844 and 844×390.
- **Coaching, for learners who want it** (Settings → Coaching, off by default). A quiet drive stays what everyone gets: the lesson card before Start, readings on the instruments, detail in the feedback. Switched on, a line appears above the Highway Code tip with the lesson's own brief for the first eight seconds, then whatever the exercise is reporting as it goes — including named stages for the parallel park ("pull up alongside the front one", "reverse into the space"). It lives in the column that already carries the tip card, so it is laid out with that column and can never land on an instrument; measured at 2–5% of the view at 390, 820 and 1280 px.
- **Less to read while driving, more afterwards.** The lesson card carries the instructions before Start; the drive shows a short stage label and nothing else unless something has gone wrong; the result sheet now carries a measured account of the run — how long, how far, each stage with the distance travelled, contacts, final position and angle, observations and every fault.
- **Looking round no longer swings the car.** The cockpit is attached to the camera, so turning the driver's head used to carry the bonnet and dashboard round with it and look like steering. The cockpit now stays with the car.
- Contact with a parked car is logged once per object rather than once per frame: a car pushed back from an obstacle can sit a few centimetres clear, which used to read as a fresh impact every frame.
- Docs: screenshots of a commercial UK driving simulator in [docs/development/reference](docs/development/reference/), kept as the bar to clear, with a section in the interface guidelines on what we took from it and where we deliberately differ.
- Docs: [interface guidelines](docs/development/ui-guidelines.md) for anything the learner sees while driving, and [screenshots](docs/screenshots.md) of every case, generated by `node tools/screenshots.mjs`.
- Checks: `npm run test:bots` drives every lesson, puzzle or mock test with the Bot lab's own driver and reports how each one ended. `lesson:rb-big` stalls on the two-lane roundabout; that predates these changes and is listed as a known stall rather than hidden.
- **Getting started has no overlays at all.** The three-button mirror card is gone, and so is the running commentary in the mirrors, controlled-stop and acceleration lessons. The state now goes on the instruments the car already has: three ticks that fill as each check is recorded, a target band under the speedometer, and the stop countdown in the distance field.
  - **A tap is a mirror glance, holding is a blind-spot check.** `B` is the interior mirror, a tap on `X` the right mirror, and holding `X` the right blind spot over your shoulder — the same gesture, held for longer, matching the real movement. The same works on the touch buttons, so the panel was not needed on a phone either.
  - `npm run test:drive` now fails if a panel or a banner sits over the road in a Getting started lesson at phone size, or if the HUD pieces overlap each other.
- **Everyone makes way for a blue light, not just the learner.** Ordinary traffic within 40 m ahead of an emergency vehicle slows right down, and the emergency vehicle filters past traffic going the same way instead of queueing behind it. Without this it could be stuck in a queue, never reach the learner at all, and the lesson would then mark them for not letting it through.
- **It drives like it is on a shout.** It runs well above the limit (measured in a browser at 22.8 m/s against 13.4 for the quickest other car), takes corners and roundabouts faster than anything else, follows closer and harder, and gives way to nobody — no courtesy stop at a give-way, no waiting for the learner to go first. It still stops at red lights, which this training build deliberately does not let it run.
- **Stopping in a junction is only marked when it really is about the blue light.** The fault needed three guards before it stopped firing on ordinary driving: the vehicle has to be within 30 m behind, the learner has to have been moving when it arrived, and they have to sit there for more than two seconds. A stop forced by a stationary vehicle within 11 m ahead is not marked at all. The junction box is now the junction node and half the widest road meeting it, rather than the kerb corner plus a whole road width, which counted a car waiting 20 m short of a give-way line as being in the junction. A mock test the bot drove clean was carrying this fault every run.
- Time an emergency vehicle spends held up further back — in a queue, or at a red light 60 m away — no longer counts as the learner holding it up, and a vehicle that never got near the learner is never marked against them.
- **The driver's seat now looks like the car you chose.** The bonnet ahead of you was a fixed green box whatever was in the garage. It now takes its paint and width from the selected model, and the eye line sits a little higher in a taller car. `npm run test:cars` checks that all eight give the cockpit their own colour.
- **Nothing is drawn across the road any more.** The banner element is deleted. The blue-light warning, the emergency-stop prompt and the parking warning now appear as a short state on the HUD box — amber for a warning, red for a stop — instead of a slab of text over the windscreen mid-drive. `npm run test:drive` fails if a banner element exists at all, or if anything covers the road while a blue-light vehicle is being dealt with on a phone.
- **The drive no longer repeats the lesson card.** Everything a learner had already read before pressing Start was being said to them again while driving: "Blue lights ahead", "Hold the speed", "Brake to stop", "Reverse into the space", "Release the parking brake". All of it is gone. What stays is what cannot be known otherwise — a distance counting down, a speed band, the `0/3` checks, which way to go at the next junction — plus a warning when something has gone wrong, and the examiner's "STOP", which has nothing to see and no card entry saying when.
- Tests: new unit suites for the sign-in gate and the blue light vehicle, a rewritten roadside parking suite, and a new `npm run test:drive` browser check for the look cameras and the blue light vehicle in both a lesson and a mock test.
  - The browser suites now share an offline sign-in and subscription fixture (`tests/auth-fixture.mjs`) that holds progress across reloads. `npm run test:parking`, `npm run test:devices` and `npm run test:mobile` were failing before this because the paid-access gate blocked the lessons they drive; they pass again.
  - `npm run test:browser` was left behind by the same changes and had been failing at its second assertion: it sat behind the sign-in gate, read state from the deleted banner element, clicked the deleted mirror card and expected progress in `localStorage` rather than the account service. It now signs in through the fixture, drives the mirror lesson with the real gestures (`B`, then `X` held), reads the scenario's own progress line, and reads progress back from the account store.
  - `BOT_SEED` runs a bot sweep on another traffic seed, for comparing a change against the same drive on `main`.

## v1.1 (13 Oct 2026): practice layouts, lanes and new marking
- Lessons and puzzles now run on purpose-built practice layouts instead of Cambridge streets, each designed to teach one thing:
  - Practice town: side roads, traffic lights, a two-lane road with lane arrows, a zebra, a puffin crossing, cycle lanes and a 30-to-20 change.
  - Roundabout road: a mini, a normal roundabout, a two-lane one, a big one with traffic lights, and a Dutch-style one.
  - Faster roads: a 40 mph road, a country lane at 60 and a dual carriageway at 70.
  - Puzzle park: two minis, a staggered double mini, a five-arm roundabout with a one-way arm, a gyratory and a motorway interchange.
  - Mock tests stay on real Cambridge roads.
- Lanes: lane arrows are part of the map. The examiner tells you which lane to use (left, middle, right, or "left or middle") and marks you on it. The road arrows match.
  - New lesson "Choosing your lane": straight on from the left lane at one set of lights and from the right lane at the next.
  - The route guide arrows drift into the lane you need before the junction.
- Roundabouts:
  - Signal left after passing the exit before yours is now marked: missing it, or signalling left too early.
  - Approach signals follow the exit's direction.
  - On the roundabout the screen says "Stay on · 3rd exit", then "Signal left now: your exit is next".
- New lesson "Roundabout with traffic lights": arrows on every entry, lane lines and lights on the ring.
- Dutch-style roundabout: a red cycle track rings it, with cyclists riding round. Cars give way at the crossings, and you are marked if you cut across a cyclist. It is a new lesson and the puzzle.
- Moving off: press B (or the eye button) to check your mirrors and blind spot.
  - The examiner marks moving off without looking, pulling out in front of traffic, or not signalling when someone is coming.
  - The moving-off lesson sends a car past you first.
  - After the emergency stop you move off again.
- Puffin crossings: people wait on amber and cross on red. Driving onto the crossing while someone is on it is a serious fault.
- Marking board redesigned: big driving-fault and serious counts, how many this drive allows, a bar, and the latest faults written out. It flashes when a fault is marked and now shows on phones too.
- Traffic keeps to its lane arrows and doesn't wait for a gap at roundabout entries controlled by lights.

## v1.0.1 (13 Oct 2026): fixes from tester feedback
- Car can now reach 70 mph (it topped out at 38 mph); about 0–60 in 10 s.
- Examiner progress follows the nearest route segment and can't jump ahead to a parallel road (Mitcham's Corner, Mill Road re-routes).
- Re-routing no longer sends you straight back the way you came, and keeps hand-written instructions (callouts).
- Histon Interchange: A14 slip roads kept, so it's the 2nd exit again; the map splitter now checks instruction text, not just counts.
- Roundabout islands follow the ring's real shape (Milton's oval no longer covers the road).
- Traffic: gives way to you at side roads and minis, looks further ahead at speed, passes oncoming learners on narrow roads, and stand-offs clear.
- Marking:
  - No fault for being hit from behind or while stopped.
  - No false "didn't give way" at roundabouts with traffic lights.
  - Amber is only faulted if you could have stopped.
  - Roundabout signals are now marked.
  - The cycle lane lesson fails a left hook.
- Puzzles fail only for not giving way or running a red; other faults count towards the tier allowance (the card says so).
- Results list every fault; "Clean drive" shows only when there were none; the drive ends at the flag.
- The HUD says "Follow the road ahead" until the pull-up is close, and shows the lesson's own rule at the start.
- Quizzes: options shuffled every attempt; two show me questions added; the England/Wales default limit clarified.
- Highway Code fixes: puffin crossing is Rule 199, Rule 185 for the signal roundabout, Rule 187 for Milton, updated 126/163/195 wording, "collision" not "accident".
- Lesson routes:
  - Roundabout lessons start about 200 m away.
  - The right-at-lights and emerge-left lessons end after the taught junction.
  - Dual carriageway and country road start on the fast sections.
- The lobby stat pills have labels.
- Fixed a crash in map areas with no traffic lights.
- Guide arrows go round mini-roundabout discs.
