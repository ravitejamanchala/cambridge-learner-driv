# Interface guidelines

House rules for anything the learner sees while driving. They come from testing the simulator, and they
are the first thing to check before adding a panel, a message or a control.

## Learner Drive is dopamine-driven

Learners come back because driving here *feels* like progress. Every feature has to earn that feeling,
and it has to be earned honestly: a reward only ever comes from something the drive measured. Nothing
may flatter, and nothing may turn a fail into a pass (`CLAUDE.md`). The two rules don't pull against
each other — a reward is only worth having when the learner knows it can't be faked.

Every lesson, puzzle, mock test and free drive goes through this check before it ships, and the check
is written into its pull request:

1. **A clear goal before Start.** The lesson card says what "done" looks like, in one line.
2. **Progress you can feel while driving** — on the instruments, never as a sentence over the road:
   ticks filling, a distance counting down, a target band going green, a junction number coming up.
3. **A payoff moment at the end.** The result shows what was earned *as it is earned*: the XP added,
   the stars, the level bar moving, the unit filling. A pass is a moment, not a line of text.
4. **Praise that is specific and measured.** "You held a two-second gap for 4.1 miles" beats "Well
   done". Name the thing they did, with the number the drive recorded.
5. **One next thing.** Never a list of faults on its own: the most useful single thing to practise,
   and a button that goes straight to it.
6. **A reason to go again.** The next lesson unlocking, a star still to win, a personal best to beat.

What it must never be: a reward for nothing, a streak that punishes a missed day, a timer that pushes
someone into driving faster, confetti over a fail, or a nag mid-drive. Ungraded practice (free drive)
still gets a payoff — a session summary of what was measured — but never writes to lesson progress or
the learner's record.

## The view is the product

The learner is looking at a road. Everything drawn on top of it costs them something.

- **Nothing is drawn across the road. Ever.** There is no banner element any more: it was a slab of
  text over the windscreen. Anything that must reach the learner mid-drive goes to the HUD box as
  `test.alert = { label, tone }`, where `tone` is `info`, `warn` or `stop`, and the label is a few
  words. That is where they already look for what to do next.
- **No large panels during a drive.** A control is a pill or an icon button at the edge of the screen,
  not a card in the corner of the view. The parking control is the model: one small button, bottom
  centre, clear of the touch controls.
- **Never cover the middle of the screen** with text while the car is moving.
- Anything that can be read after the run belongs after the run.

## Never say twice what the lesson card already said

This is the rule most often broken, and the easiest to break by accident. The learner reads the goal
and the steps on the lesson card, chooses to begin, and then drives. Repeating any of it while they
are driving is clutter, and they skip it anyway.

Before adding any text to a drive, ask two questions. If either answer is yes, it does not go on.

1. **Is it on the lesson card?** "Let it through", "Hold the speed", "Reverse into the space",
   "Check before moving" — all of these were already read before Start.
2. **Can the learner see it for themselves?** A police car with its lights on does not need a caption
   saying there is a police car. Nor does a highlighted parking bay need a label.

What is left, and all that is left:

- **Readings the learner cannot otherwise know** — a distance counting down, a speed band, `0/3`
  checks recorded, metres to the target. Numbers and marks, not sentences.
- **Navigation** — which way to go at the next junction. The card never said that.
- **Something has gone wrong and needs recovery** — "Stop first" when Park is tapped on the move.
- **A stimulus with nothing to see** — the examiner's "STOP" in the emergency stop. There is no police
  car to notice and no card entry that says *when*: the moment is the exercise.

A label that merely names the stage is not state, it is the card again. The parking lesson shows the
distance to the target and nothing else: the one button names the action and the highlighted bay shows
where it is.

## Say less

- **Instructions belong on the lesson card, before Start.** The learner reads the goal and the steps
  there, chooses to begin, and then wants to drive.
- **During the drive:** at most a short stage label in the HUD — three or four words, a state and not a
  sentence ("Reverse into the space"). No running commentary, and never the same line in two places.
- **Words on screen mid-drive are for things that have gone wrong** ("Come to a stop first"), and they
  go away again.
- **After the run:** all the detail, in the feedback. See below.

## Instruments, not sentences

A line of text that updates while the learner drives is an instrument we failed to build. The car
already has a distance field, a speedometer and an eye button; use them.

| Don't | Do |
| --- | --- |
| "Brake to stop: 18 metres left" | The distance field, which already reads in yards and metres |
| "Hold 10–15 mph: 1.4 / 3 seconds" | A target band under the speed, and a count in the distance field |
| "Repeat Interior, Right and Blind spot" | Three ticks that fill as each check is recorded |
| "Blue lights behind you…" | Nothing. It is on the card, and the mirrors are the exercise |
| "It is past. Carry on when it is safe." | Nothing. The event is over |
| "Release the parking brake" as a stage label | Nothing. The button already says it, right below |

The one exception is **Coaching** (Settings → Coaching, off by default). A learner who asks to be
talked through a drive gets `test.coach` on a card in the `.hud-bl` column, above the Highway Code
tip. Two rules hold it in place: it goes in that column, never a new absolutely-positioned box, so
the column's own layout keeps it off the instruments at every width; and the default stays silent, so
nothing above changes for anyone who has not asked. `npm run test:drive` checks both — hidden with
the setting off, and clear of the map, speedometer, look buttons, instruction box and touch controls
at 390, 820 and 1280 px when it is on.

Scenarios report state through `test.basicStatus` — `{ label, value, band, checks }` — and `ui.hud()`
draws it. `ui.banner()` still exists for the scenarios that call it, but it now writes `test.alert`
rather than painting anything over the road, and its text must be short enough for the HUD box.

## One control, and controls the learner already has

- A manoeuvre gets **one** control. Parallel parking has a single button that releases the parking brake
  to set off and applies it to park. No cockpit drill, no P/R/N/D selector.
- **Reuse the existing inputs rather than adding new ones.** Reverse is the back arrow held down, the
  same as everywhere else in the simulator.
- A new key must not take a key that already means something. `B` is the interior mirror, `Z` and `X`
  look left and right, `Q` and `E` are the indicators.
- **Prefer a gesture that matches the real movement over another button.** A mirror glance and a
  blind-spot check are the same head movement held for different lengths, so a tap on `X` records the
  right mirror and holding it records the blind spot. That deleted a three-button panel outright.

## Camera

- **Looking round never steers the car.** `Z` and `X` swing the camera; the car keeps the heading the
  learner gave it.
- The cockpit is a child of the camera, so anything that yaws the camera must cancel that yaw on the
  cockpit group, or the bonnet swings and the car looks like it is turning.
- **Do not force a camera view on the learner.** Parking does not switch them to the overhead view;
  they choose with `C` or the view buttons.
- **How far the head turns is the point.** A glance in a door mirror is about **45°**; holding the
  same key until it becomes a blind-spot check opens out to about **95°**, over the shoulder; `B` is
  the interior mirror, so it barely moves the head at all (**15°**). The chase view uses 0.8 of those,
  because the car is in shot as well. `LOOK` in `js/main.js` holds all three, and
  `npm run test:drive` measures them.
- **The steering wheel turns with the driver's hands, not the road wheels.** `WHEEL_LOCK` is 2.3 rad
  at full lock — not the real 450°, which spins out of sight when full lock is one key press away.
- **The rear-view mirror belongs in the chase view too.** It is the same camera and the same render
  target as the glass on the windscreen, shown as a panel under the instruction box.

## Mirrors and panels on a phone

Anything drawn into the 3D view has to be placed from the interface's own measurements, not from a
guessed share of the screen. A fraction that looks right on a desktop window goes straight through the
speedometer on a phone held sideways, where the same controls take a far taller share.

- Place it from `getBoundingClientRect()` on the real elements — see `hudChaseBox()` in `js/main.js`,
  which hands `layoutChase` the bottom of the instruction box and the inside edges of the map and the
  speedometer cluster — and never cache the measurement: it goes stale the moment the phone is turned.
- **An upright phone starts in the chase view**, so anything that only exists in the cockpit has to be
  reachable from the chase view as well, or a phone learner never sees it.
- The driver's view is much narrower upright than it is on a desktop, so things off to the side fall
  off the edge. `mirrors.fitView()` draws the rear-view mirror in towards the middle until it fits,
  because that mirror is what the blue-light exercise is about.
- `npm run test:drive` checks the lot at 1280×720, 390×844 and 844×390: on screen, clear of the map,
  the speedometer, the look buttons, the instruction box and the touch controls.

## Feedback after every run

- The result sheet carries a measured account of the run: how long it took, how far, each stage of a
  manoeuvre with the distance travelled, contacts, the final position and angle, observations, and every
  fault by category.
- **Every line must come from something the drive recorded.** `runDetail()` in `js/reports.js` reads
  scenario events and marked faults. It never flatters, never guesses, and never changes the result.
- **A fault must be the learner's to own.** Before marking something, rule out the cases where they had
  no choice: held in a queue, stopped behind a stationary vehicle, waiting at a give-way line, or sat at
  a red light while the thing being judged is still a long way off. Geometry is the usual trap — a test
  of the form "within the corner radius plus a road width" calls a car waiting 20 m short of a junction
  "in the junction". Prefer the junction node and half the widest road meeting it, require the state to
  hold for a second or two rather than a single frame, and check it by running `npm run test:bots` on a
  clean drive: a fault the bot collects on a route it otherwise drives well is almost always ours, not
  its. `BOT_SEED` runs the same sweep on another traffic seed, which separates a real regression from
  one drive diverging.

## On the road

- **The Cambridge map is surveyed, not guessed.** `data/corrections/` holds the correction sets the
  road inspector produced from street-level imagery, and what was taken from each. Anything that adds
  a marking the examiner marks against — a zebra, a stop line — is de-duplicated against what the map
  already carries, because two crossings in one place means two faults for one mistake.
- **UK conventions.** Parking bays are broken white lines. Give-way and stop lines, signals and signs
  follow the Highway Code, and each lesson cites the rule it teaches.
- **Every vehicle comes from the shared catalogue** in `js/cars.js`: the learner's car, the background
  traffic, the parked cars and the blue-light vehicle are all cars the learner could choose in the
  garage. Nothing on the road should be a coloured box once the models have loaded.
- **L plates belong to the learner alone.** `loadCarModel` takes `learner: false` for everyone else.
- **The driver's seat belongs to the car that was chosen.** The cockpit is a hand-built impression
  rather than a model of an interior, so its proportions stay as they are, but its paint and width come
  from the selected car via `carMetrics()`. A textured model carries its colour in the image, not the
  material, so the colour is sampled from the texture; and the body is the part with the most
  triangles, not the biggest box, or a black roof panel wins over the body around it.

## Motorways

The motorway worlds (`m2`, `m3`) are a closed 24 km circuit drawn by `motorway()` in
`tools/layouts.mjs` from the constants in `js/motorway.js`, so a drive can go on as long as the learner
likes without the road network ever growing. Scenery chunks further than `WORLD.freeRadius` from the car
are freed, and `npm run test:free` checks over a 14-minute drive that memory levels off.

- **Markings follow the Traffic Signs Manual, chapter 5.** Lane lines over 40 mph are diagram 1005.1:
  2 m marks with 7 m gaps, 150 mm wide. The edge line beside the hard shoulder and the broken line along
  a deceleration or acceleration lane are close approximations of 1012.1 and 1010 — we could not reach
  the published drawings when this was built, so treat their widths as ours, not the manual's.
- **Free drive is ungraded.** It never marks a fault, never decides a result and never writes to the
  learner's record or account. Leaving at a junction is not "off route": a way back onto the circuit is
  built from wherever the car is. Ending the drive shows a summary of what was measured, and says plainly
  that nothing was added.
- **Navigation names the next junction, not the end of the circuit.** The instruction box counts down
  to `J2 · Ashwell`; the turn beacon stays hidden, because you pass most junctions straight by.

## What we are aiming at

`docs/development/reference/` holds screenshots of a commercial UK driving simulator, kept as the bar
to clear. They are reference material, not a style to copy: the house rules above win wherever the two
disagree, and the quiet drive is deliberately quieter than theirs.

| | |
| --- | --- |
| ![Chase view](reference/competitor-chase-view.webp) | ![Cockpit view](reference/competitor-cockpit-view.webp) |
| ![Residential chase view](reference/competitor-chase-residential.webp) | |

What they get right, and what we took from it:

- **A rear-view mirror in the chase view**, not only in the cockpit. Ours is the panel under the
  instruction box.
- **A cockpit that reads as a car**: a real steering wheel with a rim, a hub and three spokes that
  turns as you steer, a dashboard that closes off the bottom of the view, a windscreen header and
  A-pillars, and door tops for the wing mirrors to sit on.
- **Instruments, not prose** — the same conclusion as our own rules: speed, limit, a route map and
  mirrors, with nothing written across the road.

Where we deliberately differ: their screen carries a pedal and gear strip, a keyboard hint and a
delivery timer. We do not. The view is the product, and everything the learner needs to be told is on
the lesson card before Start or in the feedback afterwards.

## Before you call it done

```sh
npm test                 # unit checks
npm run build
npm run test:parking     # the manoeuvre, driven end to end
npm run test:drive       # look cameras and the blue-light vehicle
npm run test:devices     # five viewports, touch targets, no overlap
npm run test:mobile      # three device profiles, against dist/
npm run test:cars
npm run test:access      # needs a server on 127.0.0.1:8000
npm run test:browser     # the course end to end: prerequisites, control lessons, saved progress
npm run test:bots        # BOT_PICK=all:lesson | all:mock | all:puzzle
npm run test:free        # motorway free drive: both layouts, a 14-minute drive with memory sampled
node tools/screenshots.mjs   # regenerate docs/screenshots and docs/screenshots.md
npm run evidence -- <group>  # real-time videos of a feature, into docs/evidence/
```

Touch targets are at least 44 px on a coarse pointer, nothing overlaps, and nothing runs off the screen
at 320 px wide. `npm run test:devices` checks all three. `npm run test:drive` checks that the banner
element does not exist at all, that no panel sits over the road during the Getting started lessons or
while a blue-light vehicle is being dealt with at phone size, that the alert is short enough for the
HUD, and that the HUD pieces do not overlap each other.

**Every feature pull request carries video evidence.** Add a group to `GROUPS` in
`tools/record_evidence.mjs` with one short clip per thing the issue asks for, run
`npm run evidence -- <group>`, commit the clips and the `README.md` it writes under `docs/evidence/`, and
link that folder from the pull request. Keep each clip under a minute: they are evidence, not a film.

When the course or the interface changes, regenerate the screenshots and commit them: `docs/screenshots.md`
is the quickest way to see what a change did to every case at once.
