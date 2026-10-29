# Personal routes and responsive panel review

The browser checks use deterministic geographic provider fixtures. The map tiles in these pictures are explicitly labelled “Map fixture”; the Leaflet map, pin dragging, converter, localStorage and simulator are real application code. Live provider verification is a separate CI step, not inferred from these captures.

- [Desktop route creation](create-desktop.png): search Cambridge, move both pins, generate and save.
- [Phone route creation](create-mobile.png): map and form fit the viewport and scroll together.
- [Driving](drive.png): existing simulator house designs on mapped footprints, current road renderer and native vehicle controls.
- [Next section](next-section.png): different projected world origin after an automatic section transition.
- [Phone course list](course-list.png) and [lesson detail](course-detail.png): separate views, no overlapping cards, reachable Back and Start.
- [Phone settings](settings.png): controls wrap and sliders fit the panel.
- [Interaction clip](route-flow.mp4): creation, saving/reloading and opening a drive.
- [Driving clip](route-drive.mp4): native driving and section transition. The test advances along lane geometry to exercise the boundary; this is not a manually driven journey or a hardware performance benchmark.

Reproduce: `npm run evidence -- personal` (Chromium and ffmpeg required). Individual checks: `npm run test:routes` and `node tests/modal-layout-browser.mjs`.

## Recorded checks

- 237 frontend unit tests; 23 backend tests and TypeScript check.
- Personal route UI: actual pin drag, save/reload, quota failure preserving the saved recipe, 429 retry, failed section pause/retry, native acceleration, ungraded/no-scenario state, position and speed surviving a section change, mobile viewport and confirmed delete.
- Existing Cambridge OSM fixture converts to native roads and mapped buildings.
- A route over 150 km splits into bounded, overlapping sections with no application distance cap.
- 13 panels × four viewports (320×568, 390×844, 844×390, 768×1024), plus touch list/detail/back in Course, Puzzles, Mock test and Free drive. Camera-choice wrapping is also checked with the wider Linux fallback font at 320 px.
- The fixture first section has 26 buildings and rendered 117 calls / 8,252 triangles in the sampled frame. This is evidence of bounded scene work, not a mobile FPS promise.

Existing course, camera/blue-light, device controls, parking, access/billing gates, car assets, steering/controller and imported/experimental track browser suites also passed locally. Additional build and hosted verification results are recorded in PR CI artifacts. Local network policy denies the live map hosts, Cloudflare and GitHub API, so live checks run explicitly in the authorised preview workflow.

The deployed preview at commit `23925d1` passed the cockpit smoke check, route interaction/recovery check and all 52 panel layouts. Its separate **live** provider check found Cambridge, routed a 95 m street section, and converted current OSM data into 97 native road edges and 169 buildings. This small live sample does not establish accuracy or service capacity for every location.

An additional rendered motorway free-drive suite stopped at its courtesy-driver final-speed assertion (the driver yielded, but its final speed had increased). Focused native traffic/courtesy/rejoining checks then passed on both untouched `main` and this branch. The full motorway soak is not claimed as passing; its traffic code was not changed here.
