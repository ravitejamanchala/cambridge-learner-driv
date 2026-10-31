# Historical tile-prototype evidence

The standalone tile UI has been removed. These captures record renderer development; use My routes for current testing.

# Local verification

- 258 JavaScript unit/regression tests passed (`npm test`).
- Preview and production builds passed.
- Existing personal-route browser tests passed: search, dragging pins, local saving/restoring, native driving, continuous maps, graded and ungraded modes, voice mute and mobile layout.
- Tile browser test passed against captured Cambridge OSM data centred on **52.20479, 0.13407**. Provider transport and basemap tiles were mocked; these tests do not establish live provider availability or survey accuracy.
- `junction-before.png` and `junction-after.png`: identical camera and source data, before (38618c3) and after continuous road surfaces, pavement subtraction and marking/signal fixes. Guides are switched off for inspection.
- `cambridge-3d.png` and `street-detail.png`: current renderer in the existing My routes interface.
- `browser-result.json`: 1,595 buildings, 10 continuous road polygons, 165 draw calls and checked interactions. Draw calls are a local scene measurement, not an FPS or mobile benchmark. All building heights in this captured square are estimates.
- `synthetic-markings.png` and `synthetic-result.json`: explicitly synthetic junction demonstrating yellow hatching, crossing types, lane arrows and road text. The pixel check confirms yellow paint is rendered. The captured Cambridge base data contains no explicit yellow-box boundaries; this fixture does not establish their real locations.
- Signal tests cover source direction, separate vehicle/pedestrian roles, duplicate approach suppression, coordinated junction crossings, standalone crossings and push-button inputs independent of controller type. This is a static preview, not a live signal-phase simulation.

Current CI checks personal-route interactions, the shared synthetic marking renderer and the live route providers. The retired tile UI and supplementary marking endpoint are no longer tested or deployed.
