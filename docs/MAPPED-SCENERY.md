# Pages map compatibility — 28 October 2026

The Pages sandbox previously advertised source `a1f32d9` in `release.json`.
That predates the mapped-scenery renderer: a complete admin JSON could load while
paths, green areas, trees and street furniture appeared as generic boxes.
`development/mapped-scenery` adds the matching renderer and original procedural
UK building materials. This is a sandbox update only; do not merge into `main`
or deploy `app.slaydrive.com` without approval.

Building appearance reads existing OSM use/material/level/roof tags and optional
`properties.ukStyle` (terrace, buff-brick, render, stone, shop, apartment, industrial).
Fallback styles are estimates, not surveyed facades. Footprints, courtyards,
transforms, collision dimensions and total building heights are retained.
Gabled/hipped roofs are limited to rectangular house outlines; irregular shapes
and courtyards keep their original roof outline. Shared textures are generated
locally, with no third-party asset downloads.

The admin repository's `tests/learner-import-browser.mjs` checks its actual
downloaded Cambridge JSON against this built or live sandbox. It compares every
rendered object ID and X/Z position, polygon geometry, persisted JSON and
re-export, then drives the imported mock with normal assessment active. The
reference file contains 24 roads, 114 buildings and 570 mapped details. The
specific user-reported file was not supplied; this is a reproducible reference
round-trip, not a claim that all possible imports have been checked.

After updating Pages, hard-refresh the simulator and reopen the saved local
mock (or import the admin export again). Existing IndexedDB revisions remain
unchanged. `release.json` identifies the source revision of the deployed build.

Build with `npm run build:pages` from a clean committed source tree. Publish
only `dist/` to the existing `gh-pages` branch, preserving its history. The
normal `npm run build` uses the production configuration and must not be used
for this browser-only sandbox. No DNS, production database or account service
changes are required. See [local mock editor](LOCAL-MOCK-EDITOR.md).
