# Interface guidelines

House rules for anything the learner sees while driving. They come from testing the simulator, and they
are the first thing to check before adding a panel, a message or a control.

## The view is the product

The learner is looking at a road. Everything drawn on top of it costs them something.

- **No large panels during a drive.** A control is a pill or an icon button at the edge of the screen,
  not a card in the corner of the view. The parking control is the model: one small button, bottom
  centre, clear of the touch controls.
- **Never cover the middle of the screen** with text while the car is moving.
- Anything that can be read after the run belongs after the run.

## Say less

- **Instructions belong on the lesson card, before Start.** The learner reads the goal and the steps
  there, chooses to begin, and then wants to drive.
- **During the drive:** at most a short stage label in the HUD — three or four words, a state and not a
  sentence ("Reverse into the space"). No running commentary, and never the same line in two places.
- **Words on screen mid-drive are for things that have gone wrong** ("Come to a stop first"), and they
  go away again.
- **After the run:** all the detail, in the feedback. See below.

## One control, and controls the learner already has

- A manoeuvre gets **one** control. Parallel parking has a single button that releases the parking brake
  to set off and applies it to park. No cockpit drill, no P/R/N/D selector.
- **Reuse the existing inputs rather than adding new ones.** Reverse is the back arrow held down, the
  same as everywhere else in the simulator.
- A new key must not take a key that already means something. `B` records an all-round check, `Z` and
  `X` are held to look left and right, `Q` and `E` are the indicators.

## Camera

- **Looking round never steers the car.** `Z` and `X` swing the camera; the car keeps the heading the
  learner gave it.
- The cockpit is a child of the camera, so anything that yaws the camera must cancel that yaw on the
  cockpit group, or the bonnet swings and the car looks like it is turning.
- **Do not force a camera view on the learner.** Parking does not switch them to the overhead view;
  they choose with `C` or the view buttons.

## Feedback after every run

- The result sheet carries a measured account of the run: how long it took, how far, each stage of a
  manoeuvre with the distance travelled, contacts, the final position and angle, observations, and every
  fault by category.
- **Every line must come from something the drive recorded.** `runDetail()` in `js/reports.js` reads
  scenario events and marked faults. It never flatters, never guesses, and never changes the result.

## On the road

- **UK conventions.** Parking bays are broken white lines. Give-way and stop lines, signals and signs
  follow the Highway Code, and each lesson cites the rule it teaches.
- **Every vehicle comes from the shared catalogue** in `js/cars.js`: the learner's car, the background
  traffic, the parked cars and the blue-light vehicle are all cars the learner could choose in the
  garage. Nothing on the road should be a coloured box once the models have loaded.
- **L plates belong to the learner alone.** `loadCarModel` takes `learner: false` for everyone else.

## Before you call it done

```sh
npm test                 # unit checks
npm run build
npm run test:parking     # the manoeuvre, driven end to end
npm run test:drive       # look cameras and the blue-light vehicle
npm run test:devices     # five viewports, touch targets, no overlap
npm run test:mobile      # three device profiles, against dist/
npm run test:cars
npm run test:access
node tools/screenshots.mjs   # regenerate docs/screenshots and docs/screenshots.md
```

Touch targets are at least 44 px on a coarse pointer, nothing overlaps, and nothing runs off the screen
at 320 px wide. `npm run test:devices` checks all three.

When the course or the interface changes, regenerate the screenshots and commit them: `docs/screenshots.md`
is the quickest way to see what a change did to every case at once.
