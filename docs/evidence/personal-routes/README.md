# Personal routes, road lessons and voice review

These captures run the real UI, converter, storage and simulator against deterministic provider fixtures. Leaflet tiles are explicitly labelled **Map fixture**. They are not evidence of live map-service availability or real-world geometric accuracy. The Cambridge junction capture uses the user's frozen OSM export.

- [Route creation](create-desktop.png), [phone creator](create-mobile.png), [creation clip](route-flow.mp4): search, pin placement/drag, naming, saving and restoring.
- [Driving](drive.png), [continuous boundary](next-section.png), [driving clip](route-drive.mp4): one prepared world, fixed origin and continuous traffic across the former loading boundary, with provider requests disabled after Start. The test accelerates using native inputs, then advances along native lane geometry to exercise the boundary; this is not a hardware FPS benchmark or a manually driven whole journey.
- [Cambridge pavement](cambridge-flat-junction.png), [measured report](cambridge-surfaces.json): exact reported A/B area in the supplied export. Flat pavement, 24 flat surface meshes, zero measured road/pavement/kerb polygon overlap after millimetre separation. Pins in this source are approximately 18 m and 16 m from a road centreline; choosing a map pin does not itself define a driving lane.
- [Road lesson on phone](course-road-lesson.png), [lesson/voice clip](course-voice.mp4): all nine former puzzles are selectable under Courses; the first launches through its original assessment. Settings voice mute persists, and muted lessons make no speech calls. The browser test captures speech calls with a test double; it does not measure audible output from a physical device.
- [Custom mock result](graded-mock-result.png), [mock clip](graded-mock.mp4): a cached six-plus-mile route uses Hard marking. A serious fault fails, a clean completed run passes, and quitting is incomplete. The test places the car at the finish to verify native assessment/result wiring; it is not an end-to-end drive of every mile.
- [Phone course list](course-list.png), [lesson detail](course-detail.png), [settings](settings.png): list/detail/back navigation and controls without overlap.

Reproduce with `npm run evidence -- personal` (Chromium and ffmpeg required), plus `node tests/cambridge-surfaces-browser.mjs` for the exact junction. Every committed video is shorter than one minute. Setup, provider terms, access gates, storage limits and deployment instructions are in [PERSONAL-ROUTES.md](../../PERSONAL-ROUTES.md).

## Verification

- Frontend unit suite: **245 passed**, including scenery-tile residency/release/return and mixed motorway/town surface coverage. Voice tests cover UK voice preference, cancellation, mute persistence and unsupported browsers.
- Backend: 23 tests and TypeScript check passed. Production build passed.
- Route browser: search, draggable pins, save/reload, quota recovery, 429 retry, complete-map preparation failure/retry, native acceleration, ungraded practice, no network/world reset at the old boundary, mock pass/fail/incomplete, local result persistence, moved lessons, voice mute and confirmed delete passed.
- 12 panels × four viewports (320×568, 390×844, 844×390, 768×1024) passed, plus touch list/detail/back and the wider fallback font at 320 px.
- Existing course/progress, controller/marking, parking, camera/blue-light, five device layouts, car assets, box junctions, motorway lessons, JSON import/save/reload and experimental practice checks passed locally. An initial device navigation timeout under concurrent rendering passed when rerun by itself.
- Basic accounts remain blocked from road lessons and graded mocks; signed-in personal practice stays available. Desktop and Android access/checkout fixture checks passed. These do not charge a live card.

The simulator's public-CDN and account requests are replaced with explicit test fixtures. The built mobile suite's fixture now also matches versioned `auth-config.js` URLs; otherwise it attempted the live sign-in configuration rather than the offline test account. The corrected built suite passed all three Chromium profiles (Pixel 7 portrait/landscape and Galaxy S9), including touch, rotation, saved progress and reconnect. WebKit and physical iOS devices were not verified in this run. Browser emulation is not physical iOS/Android certification.

Live providers are checked separately by preview CI at the exact reported Cambridge pins. Local managed networking blocks those hosts, Cloudflare and the GitHub API; a local policy denial is not counted as a provider failure. The deployment receipt records the tested revision and hosted results.

## Known baseline failures

The automated sweep completed eight of the nine road lessons. The reference bot stalls in `pz-fourlamps` at 397/803 m with no recorded faults. A focused run reproduced the identical stall on an unchanged `main` snapshot (`00d82655812fb3e8f2c97b0c63b215cff4aac156`) and on this branch. Moving the lesson did not fix this existing bot/scenario interaction; the full bot sweep is **not green**. Manual lesson launching and marking checks pass.

The previous full motorway free-drive soak stopped at a courtesy-driver final-speed assertion. It was not repeated for this update; focused motorway lessons, controls and native traffic checks passed. That full soak is not claimed as passing.
