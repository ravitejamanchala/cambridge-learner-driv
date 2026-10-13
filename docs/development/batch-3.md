# Third development batch: parking and manoeuvres

This batch adds three playable lessons: **forward bay parking**, **reverse bay parking**, and **leaving a bay safely**. The course now has **40 lessons in seven populated UI groups**. All earlier lesson IDs and locally saved passes remain valid.

## Actual gameplay

A new authored, synthetic parking area contains painted bays, a highlighted target and facing arrow, two parked-car obstacles, and a visible boundary. Parking begins in an overhead view; C or the pause screen switches cameras. The optional blue guide can be disabled using the existing guide preference. The road-only "Back to last instruction" action is hidden during parking. Controls use the same vehicle dynamics, footbrake, P/R/N/D selector, parking brake and engine state as the previous batch.

Forward parking requires a turn into the bay. Reverse parking requires reversing through a right-angle turn into it. Leaving a bay requires reversing clear, stopping and selecting D after a new observation input, then driving to an exit box. Each exercise ends with the car stopped and secured in P with the parking brake on and engine off. Selecting P at the initial position cannot produce a pass.

The practice layout is not a surveyed location, real test route or DVSA-approved parking exercise. No manual gearbox, clutch, slope dynamics or parallel-parking lesson is claimed in this batch.

## Measured assessment

- Every corner of the nominal 4.3 m × 1.8 m vehicle envelope must fit within the target. A centred car whose nose or side crosses a line does not pass.
- Facing must match the target arrow within 8°, and speed must be below 0.1 m/s for the final stop. These are explicit training tolerances, not a claim about a DVSA pass boundary.
- Stage completion uses actual displacement and the selected direction. Reported speed without displacement is insufficient. Departure requires both reverse and forward stages.
- Observation grading uses recorded B/button inputs; physical head movement is not measured. Inputs are required before moving and during the manoeuvre.
- Low-speed movement is assessed against the 5 mph training cap.
- Rotated rectangle contact and a swept-position check detect parked cars and boundary impacts, including an obstacle crossed between frames. Collision response stops the car at the previous safe pose.
- Sustained contact is one event; another impact is recorded only after the vehicle moves clear. Geometry, stage results, collision objects and input events remain in the existing deterministic fault/report infrastructure.
- The dedicated manoeuvre mode replaces inappropriate road-lane/junction checks inside the closed pad; ordinary lessons and mock tests retain their original marking path.
- The learner can request an assessment of a secured car outside the target and receive a failed attempt with a retry. Failed attempts do not erase an earlier pass or best result.

## Implementation files

Added: `js/parking-layout.js`, `parking-lessons.js`, `parking-geometry.js`, `parking-scenario.js`, `parking-view.js`, `parking-driver.js`; `data/areas/parking.json`; `tests/parking.test.mjs`, `parking-browser.mjs`; this report.

Extended: `tools/layouts.mjs`, `build_demo.mjs`; `js/course.js`, `locations.js`, `net.js`, `world.js`, `main.js`, `test.js`, `ui.js`, `bots.js`; `index.html`; `data/areas/index.json`; `package.json`; `tests/foundation.test.mjs`, `browser.mjs`; `README.md`.

The parking plan (starts, targets, direction and guide paths) is supplied by location metadata so another authored pad can provide its own geometry. Rendering and grading read the same dimensions. The Bot lab follows a rear-axle reference with the actual steering/drive inputs; it does not teleport to targets or modify learner storage.

Release builds version the app script, area index, map requests and car model by the source commit. This prevents a browser with the previous release cached from missing a newly introduced area after an update.

## Validation

```sh
npm test
npm run build
npm run test:browser
npm run test:parking
TEST_SITE=dist npm run test:browser
TEST_SITE=dist npm run test:parking
```

There are 32 automated unit/schema/route/profile tests. Parking browser checks complete all three exercises through real physics in both developer and learner flows, confirm reports/progress survive reloads, verify a collision fails the attempt and sustained contact produces one serious fault, and check mobile selector access. Prior browser flows are retained.

Browser fixtures grant earlier control prerequisites only; parking completion is earned by driving. Tests use the exact pinned Three.js CDN substitutes and omit fonts for local reproducibility. Live deployment is verified separately with real CDN assets and HTTPS verification.

## Remaining scope and next batch

Parallel parking, pulling up on the right, narrow-space corrections, parking on slopes and more complex traffic during departure remain. The next batch should add parallel-parking target/obstacle geometry and assessed manoeuvre stages, without duplicating existing exercises merely to inflate the lesson count. The broader 80+ curriculum and secure external AI coaching service are still incomplete.
