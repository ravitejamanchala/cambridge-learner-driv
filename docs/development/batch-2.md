# Second development batch: steering and automatic controls

The catalog now contains **37 lessons**, preserving all 29 original IDs and the first batch's five additions.

## Implemented exercises

- `steering-control`: uses the existing, verified Grantchester practice bends. Measured left and right steering are required; the driver must keep below the 15 mph exercise cap, stay within the lane, and finish without rerouting. Prerequisite: controlled stopping.
- `automatic-drive`: prepared automatic vehicle starts in P with the parking brake on. The learner holds the footbrake, selects D, records an observation input, releases the parking brake, drives 50 metres, stops, selects P and secures the vehicle. Prerequisite: engine start/stop.
- `automatic-reverse`: the same explicit selector mechanics, with six metres of measured backwards travel at walking pace and a stop/secure sequence. Selecting D or moving forwards cannot satisfy the reverse target. Prerequisite: automatic drive.

New exercises use a scenario that removes ambient vehicle traffic; other lessons keep their standard/quiet variants. Existing graph coordinates are reused. This does not establish the safety or accuracy of a real UK road or test route.

## Mechanics and preservation

`automatic.js` implements directional acceleration, D/R idle creep, brake-only stopping, reverse speed limits, and engine/parking-brake interlocks. P and N prevent propulsion. Shifts require a stop and the footbrake. The original brake-hold-to-reverse behaviour remains in legacy simplified vehicles. No manual clutch, hill dynamics, torque-converter fidelity or parking-bay assessment is claimed.

`control-scenarios.js` assesses captured inputs, real positions, speed, steering angle and objective sequences. Results retain selector events, distance milestones and observation inputs. The original fault infrastructure and profile IDs are preserved. The Bot lab can operate and assess all eight new exercises without changing learner progress.

The build now writes `.nojekyll` and `release.json` with source commit, clean/dirty state and lesson count. `tools/publish_pages.py` provides branch-based GitHub Pages publication through existing Git/gh authentication, using a separate temporary Git index rather than switching the source checkout or creating a worktree. It publishes only the generated static artifacts to `gh-pages`, preserves prior deployment history, pushes source to `v1.1`, and configures Pages. It does not overwrite `main` or disable verification. A live release must be verified independently after GitHub finishes its build.

## Files changed in this batch

Added: `js/automatic.js`, `js/control-scenarios.js`, `tests/automatic.test.mjs`, `tools/publish_pages.py`, this report.
Extended: `js/vehicle-state.js`, `js/basic-lessons.js`, `js/locations.js`, `js/car.js`, `js/course.js`, `js/main.js`, `js/traffic.js`, `js/scenarios.js`, `js/bots.js`, `index.html`, `data/areas/index.json`, `tests/foundation.test.mjs`, `tests/browser.mjs`, `tools/build_demo.mjs`, `README.md`.

## Verification

- Unit/schema/route/profile checks: 22 passed, zero failed or skipped.
- Source browser checks complete the new D/R selector exercises and the steering route through real physics; all original first-batch checks remain.
- Bot lab tests run all eight new exercises and check that learner storage remains identical.
- Production build and built-demo browser checks exercise the same flow, including map-switch failure/recovery, mobile controls and prerequisite persistence.

## Remaining scope and next batch

The 80+ curriculum and secure external AI backend remain incomplete. Next: angled moving-off and assessed steering/low-speed target exercises, followed by parking target geometry and manoeuvre assessment. Manual/clutch and hill-start lessons require their actual physics first. Production instructor/DVSA review and full cross-browser/device testing remain outstanding.
