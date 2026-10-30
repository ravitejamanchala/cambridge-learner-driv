World inspector now owns the complete map workflow: choose pins or the Cambridge example, generate a native map, compare its geometry with satellite imagery, record a visual review, and save an immutable local revision. My routes restores that exact map without regenerating it. Esri World Imagery is available as a reference without a user key; Google remains optional. Unknowns and mismatches are retained; this does not implement automatic satellite correction or certify geographic accuracy.

Test instructions and evidence: [World inspector → My routes](docs/world-inspector-to-drive.md). New browser coverage verifies generation, satellite failure/review states, local persistence, exact restored geometry and actual car movement; provider loading is tested separately from fixture-based integration checks.

# Connect My routes source data, Bot lab and geographic review overlays

My routes previously used a separate simplified OSM conversion path, so improvements visible in the city inspector did not reach the simulator. This PR connects the source normalizer and versioned Cambridge tiles to the existing My routes generator, preserving search, pins, saved routes, the car/physics and the app’s building assets.

**Try it without merging:** https://pr-25.learner-drive-app.pages.dev/?bots

Click **Cambridge example**, then **Start** to watch the existing bot. Or use **Open My routes**, load/generate a practice route, and choose **Current My routes map**. Watch speeds, pause, screenshots, point picking, notes and export are reused from Bot lab. The satellite reference link follows the selected point/car. Personal bot results are driving checks with `pass:null`, not learner scores or geographic accuracy claims.

- The shared normalizer preserves source rings, holes, IDs and provenance. The previous duplicate building-ring parser and rectangle clipping are removed.
- Covered Cambridge corridors use the same checksummed immutable tiles as the inspector; other locations use the existing live broker through the same normalizer. A dataset failure does not silently substitute a default world.
- Consistent tagged 2+1 lane splits now reach the lane model and dividing-line placement. Unknown centre-line paint is no longer automatically enabled on newly generated maps; authored lesson behaviour is retained.
- Ten original lightweight UK street-furniture assets replace placeholders; tagged bus shelters now reach the adapter. Preview gallery: https://pr-25.learner-drive-app.pages.dev/street-assets.html . No competitor models/textures are used.
- Google satellite overlay displays our actual generated geometry through the official Maps JavaScript API: opacity/layers, source inspection and geographic pan/zoom. Requires a restricted browser API key; live Google imagery is not verified.
- Full 102-tile accuracy-coverage audit reports missing width/paint/parking evidence. Experimental CLIPSeg tooling produces licensed-image proposals for a separate review layer; synthetic inference found false positives, so no automatic map correction is enabled. Setup, limitations and evidence: `docs/google-overlay-and-vision.md`.
- Whole-route preparation, existing scenery tiles, UK simulator buildings, native driving and local saved recipes are retained. No new roaming flow was added.
- The preview includes the 102-tile Cambridge source dataset, data inspector and reproducible PBF extraction/validation tools. Production builds exclude that diagnostic dataset/example, while using the shared normalizer for live My routes generation.

Validation: 277 unit tests; production/preview builds; source extraction/fixture checks; existing My routes browser regression (save/reload, retry, native driving, grading, courses/voice and mobile); real Cambridge generated-map Bot lab browser check (movement, pause/stop, one-click example completion, versioned export, no grading; existing controlled-stopping lesson regression). Evidence: `docs/evidence/world/`, setup and test steps: `docs/my-routes-source-generator.md`.

A provisional browser overlay of actual generated road geometry over Google satellite imagery helped identify unverified centre-line painting at Water Street. It is not surveyed registration. Unknown road widths, parking lanes, junction details, private/restricted-road rules, terrain/supporting sources, full-city imagery review and six malformed restriction relations plus one building relation remain unresolved. The dataset stays `accepted:false`. Bot completion does not approve geography, and no WASM/model-based automatic correction is claimed.

Branch `feature/roadarium-world-and-assets`, base main `e4449195fc27e38d010c335ba256b5969fcffed0`. No main push, merge, production deployment, DNS or billing changes. No Roadarium code/assets or Google imagery is bundled.
