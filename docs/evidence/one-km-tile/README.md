# Local verification

- 251 JavaScript unit/regression tests passed (`npm test`).
- Preview and production builds passed.
- Existing personal-route browser tests passed: search, dragging pins, local saving/restoring, native driving, continuous maps, graded and ungraded modes, voice mute and mobile layout.
- Tile browser test passed against a captured real Cambridge OSM response. Map tiles and search/provider transport were mocked; these screenshots do not establish live provider availability or survey accuracy.
- `cambridge-3d.png`: complete 1 km square in the unchanged My routes interface.
- `street-detail.png`: closer camera view of the same generated data.
- `browser-result.json`: counts, draw-call measurement and checked interactions. The 86 draw calls are a local scene measurement, not an FPS or mobile benchmark.

The PR workflow additionally checks the deployed preview with live OSM map tiles, search and generation. Its screenshots and results are uploaded separately in the GitHub Actions `cockpit-preview-evidence` artifact.
