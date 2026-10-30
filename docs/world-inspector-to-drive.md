# Create a map, review it, drive the saved revision

PR #25 preview: https://pr-25.learner-drive-app.pages.dev/world-inspector.html

1. Open **World inspector**. **Cambridge example · Water Street** generates a small real-source map immediately. Alternatively search a place, click **Place start A** and a road, then place finish B and choose **Generate map**. The entire route corridor must be covered by the selected dataset; no partial map is substituted.
2. Choose **Compare generated map with satellite**. This displays Esri World Imagery beneath the same generated roads, paint, parking extents and building outlines. Toggle geometry, adjust opacity, zoom and inspect source features. The optional Google viewer uses the existing restricted Maps JavaScript API browser-key configuration.
3. After satellite tiles load, record roads, junctions, markings, parking and buildings as visually aligned, mismatched or unknown. Enter notes and confirm the comparison. Unavailable imagery leaves review pending. The image acquisition date is not supplied by this viewer and is recorded as unknown.
4. **Save exact map to My routes** writes a new immutable native track revision and its review to localStorage. Saving without a completed comparison is allowed, explicitly marked pending. The save includes the full generated navigation/render networks, surface tiles, objects, spawn, plan, georeference and provenance. It does not store satellite imagery.
5. **Open My routes & test drive** opens the existing simulator with this saved map selected. Choose **Save & drive** or its saved-card **Drive** button. It loads that exact revision, without requesting OSM data or regenerating the world. Existing graded-mock eligibility and learner access rules still apply.
6. Use **Review map** on a saved card to reopen the same map in the inspector. A subsequent save creates another revision and records its parent; it does not overwrite the previous geometry.

Maps are local to this browser and website origin. A preview and production do not share localStorage. Clearing site data deletes them. localStorage capacity is finite: large maps can fail to save. Quota failures keep earlier maps and remove only the incomplete new revision. Missing/corrupt map payloads produce an error; the simulator never silently generates a replacement. Checksums detect damaged storage, not malicious tampering or geographic inaccuracies.

## What the review establishes

This is a connected **visual review workflow**, not automatic satellite segmentation or correction. Source completeness, native routing checks, drivability and human visual observations are distinct. Unknown widths, paint or parking remain unknown. A completed comparison is not a survey, a lane-accuracy certificate or full Cambridge acceptance. The experimental vision CLI is not connected to automatic edits because its synthetic test produced false positives and no independently licensed Cambridge orthophoto dataset has been supplied.

Esri's public World Imagery reference service currently loads without a user API key; availability, coverage, resolution and source dates vary. Provider attribution is retained on the map and in the review record. Source/service terms: https://goto.arcgisonline.com/maps/World_Imagery. Google requires a restricted public browser key configured as described in `google-overlay-and-vision.md`. Neither viewer reads pixels, extracts geometry, exports provider imagery or sends imagery to a model.

## Verification

- 282 JavaScript tests passed, including saved-world round trips, immutable revisions, missing/corrupt/mismatched payload rejection, quota rollback and no regeneration on restore.
- `tests/world-workflow-browser.mjs`: real Cambridge packaged-source generation (414 objects), pending review, satellite-error gate, overlay visibility, mismatch/unknown records, two immutable revisions, reload, exact comparison of every restored road edge, zero map-provider requests on restore, and native car movement over 8 metres.
- The deterministic satellite test uses fixture tiles. It tests integration, not geographic accuracy. `LIVE_SATELLITE=1` separately tests real provider loading and records `test-results/world-flow/live-satellite.json` and a screenshot; it does not mark any map accurate.
- Source inspector browser regression and production/preview builds passed locally. Additional My routes/Bot lab regressions run in the preview workflow.

Run locally: `node tools/build_demo.mjs . dist-preview --preview`, then `node tests/world-workflow-browser.mjs`. To browse with map-provider search/routing, use the existing `npm run dev:routes -- dist-preview 8000` server. A plain static server supports the packaged Cambridge example but not `/map-api` place search/routing.
