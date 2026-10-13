# v1.1 development audit and first implementation batch

Audited starting commit: `9866ec64b4ba3b720a575a94b8a9eab6e176d52b`.
The source catalog contains **29** lessons: 25 practical drives and four quizzes, not the 26 mentioned in the master request or the README. There are also ten puzzle drives and five Cambridge mock routes; these are not counted as additional curriculum lessons.

## Existing curriculum mapped to the requested units

| Requested unit | Existing lesson IDs | Coverage and gaps |
| --- | --- | --- |
| 1 — Familiarisation and basic control | `move-off`, `estop` | Moving away and emergency braking exist. New batch adds `cockpit-drill`, `engine-control`, `mirror-practice`, `controlled-stop`, `accel-decel`. Steering exercises, explicit automatic selector, clutch/gears, slopes and angled starts remain. |
| 2 — Junctions and lights | `turn-left`, `turn-right`, `lights`, `amber`, `emerge-left`, `emerge-right`, `lane-choice`, `right-lights` | Real routing, scripted amber and yield events, lane-arrow and signal checks. Closed junction visibility, stop-sign behaviour, filter arrows, box junctions and richer crossroads scenarios need mechanics and assessment. |
| 3 — Roundabouts | `mini`, `rb-left`, `rb-ahead`, `rb-right`, `rb-big`, `rb-lights`, `dutch` | Mini, multi-lane, signal-controlled and cyclist-ring drives exist. Spiral lane geometry/assessment and further scenarios remain. Existing puzzle drives include double minis, a gyratory and interchanges. |
| 4 — Positioning and road types | `speed`, `country`, `dual`, `follow` | Speed changes, rural bends, dual carriageways and following-distance events exist. One-way puzzle exists; independent lane-change, parked-vehicle, meeting, joining/exiting and blind-bend exercises remain. |
| 5 — Vulnerable users | `zebra`, `cyclists`, `ped-crossing`, `cycle-left` | Cyclists, zebras and puffin pedestrians are simulated. Motorcycles, horses, buses, school zones and pedestrian junction priority need additional agents/events. |
| 6 — Manoeuvres and parking | None | Bicycle-model steering and reversing exist. No parking bays, manoeuvre targets, reversing observation assessment, slope dynamics or parking completion checks. |
| 7 — Hazard awareness | None as dedicated lessons | Event infrastructure exists but no weather-dependent braking, slippery surfaces, night lighting, fog exercises, emergency vehicles or roadworks. |
| 8 — Independent driving | None as dedicated lessons | Navigation and rerouting exist; mock routes can be driven. Independent tasks need route/sign-only modes and auditable lane/missed-turn objectives. |
| 9 — Theory and vehicle knowledge | `q-showme`, `q-signs`, `q-stopping`, `q-priority` | Interactive shuffled quizzes exist. Additional interactive vehicle inspections, markings and safety checks remain. No claim that quiz answers demonstrate operation of a real control. |
| 10 — Mock tests | Five entries in `ROUTES` (outside `LESSONS`) | Same engine and fault infrastructure are used. Difficulty-specific, rural, mixed, randomised and independent formats remain. Road data is not proof of a verified DVSA test route. |

The existing six UI groups are retained to avoid empty curriculum screens. Add new groups when their mechanics and lessons are playable, rather than publishing empty placeholder units.

## Repository and reusable engine inventory

- `main.js`: area loading, plan selection, physics ticks, touch/keyboard input, pause/retry/results and test hooks. Area-switch errors now stop the previous drive, show the load error and return to the lobby; retries recover the loading chain rather than starting a lesson on a stale network.
- `course.js`, `quiz.js`, `puzzles.js`, `hub.js`: lesson definitions, event handlers, assessment, quizzes, tier gating and lobby. Existing IDs/pass conditions are retained.
- `net.js`, `config.js`, `data/cambridge.json`, `data/areas/*`: compact road graph, waypoint snapping, route instructions, lane geometry and area index. Synthetic practice locations are separate from Cambridge coordinates.
- `car.js`: glTF loading, wheel animation, indicators, bicycle-model movement, reverse and creep. Creep is not a manual gearbox or clutch model.
- `traffic.js`: lane-following agents, lights, pedestrians, puffin/cycle-ring crossings, scripted actors and learner yielding. Ambient agent choices retain the existing random behaviour; fault decisions operate on measured state, not AI output.
- `test.js`: route progress, speed/position/light/clearance/collision/signalling marking, deduplication, re-routing and finish detection. Only driving and serious severities are currently implemented. No dangerous-fault capability is claimed. Observation inputs are explicit simulator actions, not measured physical head movements.
- `world.js`, `city.js`, `signs.js`, `guide.js`, `mirrors.js`, `icons.js`, `ui.js`, `index.html`: rendering, static city assets, markings, route guide, live mirrors, HUD and learner screens. No physics-grade terrain, weather or inspection model.
- `profile.js`: version-1 browser storage. New optional history/report fields are additive; existing lesson IDs, best scores, attempts and mock results survive.
- `bots.js`: developer test driver and localStorage reports (`?bots`). It does not alter learner progress. The test driver now operates the new cockpit, engine and observation inputs and responds to basic-control prompts; browser checks cover these runs without changing learner progress.
- `tools/layouts.mjs`, `split_areas.mjs`: build synthetic layouts and compact map areas, verify routes/instructions. Only the area index changes in this batch.
- `build_net.py`: offline GeoJSON conversion using Python standard library. `restyle_rx7.py`: optional Pillow model-artwork utility, not a runtime dependency. `build_demo.mjs`: esbuild bundle and asset copy. `README.md`, `CHANGELOG.md`, `docs/qa/2026-10-13-tester-feedback.md`, and `info-sheet.release.html` explain the current workflow, tester defects and release credits.
- No backend, AI provider, authentication, automated suite or pinned project package manifest existed in the initial checkout. Tests and pinned development tooling are added in this batch.

## Phase B and first Unit 1 batch implemented

- `curriculum.js`: metadata contract, validation, prerequisites and recommendations. Passed lessons remain accessible even if new prerequisites are introduced. Legacy lessons have no new retroactive locks.
- `locations.js` and `scenarios.js`: reusable location IDs/adapters plus standard/quiet scenario definitions. New Unit 1 definitions own no geographic coordinates. Legacy definitions use an adapter without rewriting their routes. Only clear daytime and supported traffic densities are accepted; unsupported weather is rejected.
- Scenario selection changes the actual ambient car/bike population to one-third for quiet drives. Scripted agents and cycle-ring cyclists are retained. This is a modest first scenario dimension, not completion of the rich scenario system.
- `vehicle-state.js`: explicit door/seat/mirror/belt preparation, engine state and parking-brake interlocks used by cockpit lessons. Seat/mirror confirmations are acknowledgements, not simulated adjustment geometry. Legacy driving retains its simplified input behaviour.
- `basic-lessons.js` and `basic-scenarios.js`: five distinct exercises and measurable objectives. Stationary drills complete only after required controls; driving drills require route completion and their control goals. Controlled-stop overshoot records a fault. Mirror practice requires separate captured observation inputs before moving and again later.
- Faults retain category/severity and add elapsed time, source key and lesson/scenario/area context. Existing cooldown marking behaviour is unchanged.
- `reports.js` supplies deterministic evidence-based local feedback. Assessment results cannot be overridden by this report. This is **not an AI provider integration**.
- Profile history retains the latest 50 reports and cumulative completed-drive practice seconds; failed completed attempts count too. Paused time does not count. Abandoned drives and theory time are not yet tracked.
- UI supports scenario choice, prerequisite explanation, cockpit/observation controls, retry/next actions, report text and recent history/practice time. Existing learner/puzzle/mock/theory flows remain.

## Validation and reproduction

```sh
npm ci
npm test
npm run build
npm run test:browser
TEST_SITE=dist npm run test:browser
```

Browser integration uses a Python static server on port 8765, Playwright and Chromium. Set `CHROMIUM_PATH` to a compatible installed browser if `/usr/bin/chromium` is unavailable. The runner substitutes the app's exact Three.js 0.128.0 library/loader from the pinned npm development dependency and omits optional fonts. It checks functionality, not CDN availability. Production still uses the existing CDN URLs.

Tests cover metadata/IDs, missing and cyclic prerequisites, every practical scenario's real graph route, location adapters, control interlocks, successful and incomplete objectives, overshoot, mirror evidence, fault deduplication/context, fail boundaries, report evidence, old-profile migration, history bounds and storage failures. Browser checks operate the five new exercises, drive three through real physics without teleporting, test retry/unlock/history, scenario density/scripted cyclists, legacy move-off startup/pause/resume, mobile controls, the five new Bot lab runs without learner-data writes and HTTP-503 map startup and area-switch/recovery errors. A completed route does not automatically imply a pass.

Official reference for assessment terminology: https://www.gov.uk/driving-test/driving-test-faults-result . Highway Code references: https://www.gov.uk/guidance/the-highway-code . The environment denied the GOV.UK read request (HTTP 403), so no current-page verification is claimed. Existing fault rules and the 15-driving-fault/zero-serious mock boundary are preserved; instructor/DVSA review remains necessary before claiming production assessment fidelity.

## Next batches and outstanding work

1. Finish Unit 1 with assessed steering, explicit automatic drive/reverse selection and safe-control exercises; add a genuine drivetrain and slope model before manual-clutch/hill-start lessons.
2. Expand junction/roundabout scenarios with reusable event registrations and deterministic seeds, extend area-loading validation and annotate compatibility requirements.
3. Add manoeuvre target geometry and reverse/parking assessment before parking lessons.
4. Add agents and physical weather/visibility effects before vulnerable-user and hazard curricula.
5. Extend auditable assessment and curriculum content to 80+ distinct validated experiences. Existing lesson/puzzle duplication is not used to inflate the count.
6. Introduce a secure provider-neutral backend, response validation and network-failure fallback. No API key belongs in browser code. Provider credentials/configuration are a later external prerequisite, not invented by this batch.
7. Extend dashboards, keyboard/modal accessibility, cloud-sync adapters, browser/device coverage and performance checks.

This batch does not complete Phases C–G, the full 80+ curriculum or external AI coaching. Nothing has been committed, pushed or deployed.

## Completed batch verification (13 October 2026)

- Frozen dependency installation (`npm ci`): passed.
- Automated unit/schema/route/profile checks (`npm test`): **16 passed, zero failed or skipped**.
- Area generation: all five Cambridge mock routes and four practice layouts generated with no route/instruction mismatch warnings.
- Production demo build: passed (204,397-byte app bundle).
- Source and built-demo browser integration: passed, including all five new exercises, five Bot lab runs, prerequisite/retry/persistence flows, scenario density/scripted cyclists, mobile controls and failed-map recovery.
- `git diff --check`: passed. Branch remains `v1.1`; changes are uncommitted.

Files added: `js/basic-lessons.js`, `js/basic-scenarios.js`, `js/curriculum.js`, `js/locations.js`, `js/scenarios.js`, `js/vehicle-state.js`, `js/reports.js`, `tests/foundation.test.mjs`, `tests/profile.test.mjs`, `tests/browser.mjs`, `package.json`, `package-lock.json`, `.gitignore`, and this audit.
Files extended: `js/course.js`, `js/main.js`, `js/car.js`, `js/traffic.js`, `js/test.js`, `js/profile.js`, `js/hub.js`, `js/bots.js`, `index.html`, `data/areas/index.json`, `README.md`.
