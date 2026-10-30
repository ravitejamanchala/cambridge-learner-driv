# My routes generator replacement and Bot lab preview

The existing **My routes** search, start/finish pins, saved recipes, route generation and Drive flow are retained. No new roaming mode or search UI was added.

## Test without merging

Open the PR preview with `?bots`: https://pr-25.learner-drive-app.pages.dev/?bots

- Click **Cambridge example** to load a real Water Street route through the same My routes pipeline, or **Open My routes** to generate/load your own practice route.
- Choose **Current My routes map**, select **1× watch** or **4× watch**, and click **Start**.
- Pause, pick a point, capture a screenshot or save a note. **Google satellite** opens the picked position (or car position) in aerial view. Export JSON retains dataset version and source-validation findings.

The example shortcut is present only when the preview has the packaged Cambridge dataset. It saves its named recipe locally and does not overwrite other routes. Bot runs do not write learner lesson/mock progress. Personal-map results say **completed**, with `pass:null`; completion is not geographic validation. Existing lesson and mock bot sweeps retain their original behaviour.

## What now generates the world

`js/world-data/normalize.js` is shared by the offline dataset builder, inspector pipeline and **actual My routes generation worker**. The old duplicated building ring assembly and rectangle clipping have been removed from the personal importer. Whole building footprints, holes, source IDs and provenance reach the existing simulator building adapter; explicit relation members are not rendered again as duplicate standalone buildings. Existing car physics, rendering assets, collision handling and preloaded scenery tiles are reused.

For routes whose complete requested corridor is covered by the packaged Cambridge boundary buffer, `city-source.js` reads checksummed owner tiles and reconstructs source road-node identity. It passes normalized features through the same native adapter; the route remains in its geographic frame. Routes outside coverage use the existing throttled live OSM broker through the same normalizer. Builds without the city bundle use that live path directly, without probing a missing data endpoint. An integrity/load failure for a configured city dataset is shown as an error; it does not silently substitute a default map.

New maps carry `generator:source-normalized-v1` and explicit validation/uncertainty metadata. Missing `lane_markings` no longer automatically enables painted centre lines. Explicit `lane_markings=yes/no` is honoured; old authored lessons retain their paint behaviour. Consistent `lanes:forward/backward` splits now preserve 2+1 layouts and their offset dividing line instead of silently producing one lane in each direction. Widths without source measurements still use a labelled estimate.

## Accuracy review and limits

A browser overlay was drawn over actual Google satellite imagery at 52.21829, 0.14688, showing the generated road outlines, OSM source lines and old inferred paint. The overlay uses the requested north-up Web Mercator centre/zoom and the visible viewport; registration is **provisional**, not surveyed or independently calibrated. It supports visible discrepancy review, not centimetre measurements or an accuracy percentage. Imagery capture date is unknown. Reference imagery is not distributed in the application or used as game textures.

The Water Street review identifies a concrete problem with the old automatic centre-line painting on an otherwise visibly unmarked stretch. It also shows that a generic 6.4 m width does not establish actual carriageway edges or parking-lane widths. `parking:both=lane` exists on source way 43666131, but parking lane layout/width is not fully represented by this change. Junction islands, control placement, private/restricted-road routing and unknown dimensions still require source-backed review. Six malformed restrictions and one building relation remain rejected in the city data. This is **not** the completed city-accuracy gate or full-city streaming renderer.

The existing automatic clearance pass still archives buildings/objects that overlap estimated carriageways and can relocate small roadside objects; those changes remain in the generated track's clearance records. Source footprints are retained, but the rendered scene therefore still needs overlay review. We have not changed geography to force it to fit the aerial image.

## Repeated checks

The Bot lab's existing Runs, Seed and Keep going controls can repeat a driving check on the loaded map. A successful run only demonstrates completion under that bot/traffic configuration. It does not verify legal signs, current lane rules or OSM completeness. No WASM model, automatic Google-image tracing, self-training system or autonomous geographic correction is claimed.

Local checks: `npm test`; `npm run build`; `node tools/build_demo.mjs . dist-preview --preview`; `TEST_SITE=dist-preview node tests/personal-routes-browser.mjs`; `TEST_SITE=dist-preview node tests/generated-map-bot-browser.mjs`. The real-data bot browser check loads the packaged Cambridge route, verifies the existing simulator scene, watches the car travel more than 8 metres, pauses and stops it, runs the example to completion, and verifies exported provenance with no grading. The one-click Cambridge example also completes its 155 m route at seed 7, reaching 148 m and stopping within the finish tolerance, with no off-road excursion. This is one short route/seed, not a city-wide driving benchmark. The existing controlled-stopping lesson bot also completes with D0/S0. The separate fixture suite checks saving/reload, provider errors, graded mocks, mobile panels and course voice.

## Original missing street assets

The **Street assets** link in Bot lab opens `street-assets.html` in the isolated preview. Ten original, procedural models replace placeholder scenery: street lamp, timber bench, litter bin, reflective bollard, gate, pillar post box, Sheffield-style cycle stands, bus-stop flag/timetable, bus shelter, and a blank unknown sign face. Each is one vertex-colour mesh, within its native collision envelope, with no image textures or external model downloads. Legal signs and signals continue using the existing simulator controls; this pack does not invent restrictions or route numbers. Existing simulator building assets remain unchanged.

Mapped node shelters tagged `amenity=shelter` and `shelter_type=public_transport` now reach the scenery adapter (eight such nodes in the Cambridge source). Other shelter types and polygon shelters are not inferred as bus shelters. Missing dimensions and appearance remain estimates; source `direction` is retained when usable, otherwise orientation is marked unknown. Buildings/road furniture still undergo the existing recorded clearance pass described above. The gallery is illustrative asset review, not a claim that these exact designs are surveyed at each location.

Verification includes finite geometry, source/transform preservation, collision-envelope bounds and a budget below 1,800 triangles per asset, plus a WebGL gallery screenshot. Runtime performance is not inferred from headless maximum-speed simulation timings.
