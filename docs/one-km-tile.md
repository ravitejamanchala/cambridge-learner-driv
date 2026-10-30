# One kilometre tile prototype

This is a fresh branch from `main` (`e444919`), not a continuation of the deleted world-inspector branch. Open **`/?tile`** on its PR preview, or **My routes → 1 km tile**. This uses the existing simulator panel, fonts, colours, search and map; there is no restyled page.

1. Search for a town, street or postcode and select a result. Cambridge is selected initially.
2. The pink square shows exactly **1,000 × 1,000 metres in the simulator's local projection**. Click the street map or drag its centre pin to reposition it.
3. Choose **Generate 3D tile**. The app downloads a bounded 1,200 × 1,200 metre area, processes it in a worker and displays only the central 1 km tile.
4. Drag to orbit, right-drag to pan, scroll/pinch to zoom. **Reset view** frames the whole tile. Return to **Map** to choose another area.

The prototype shows joined roads, flat pavements, mapped water/green spaces and simple extruded building footprints. Mapped trees, fences, walls, hedges, gates, bollards, lamps, benches, bins, post boxes, cycle parking and bus-stop assets reuse the simulator’s procedural geometry. A separate names/direction guide can be switched off. It uses the existing simulator OSM converter, coordinate conventions and road-surface geometry. The preview retains source building geometry rather than applying driving-clearance edits. Existing simulator import behavior is unchanged.

Buildings and street furniture are each batched into a mesh; roads and land are grouped by material. The viewer renders when the camera or viewport changes, rather than continuously when idle. Changing the selected square cancels in-flight work and invalidates the old result. Generation runs outside the UI thread. Partial provider responses, empty road coverage and excessive data return visible errors instead of showing a default map.

This first version deliberately excludes routing, driving, audits, satellite interpretation, publication, persistence and detailed house assets. Widths and untagged heights remain estimates; terrain has no elevation and bridges are not vertically separated. This is a geometry prototype, not a complete or survey-accurate digital twin. Large/high-density responses are bounded by the existing broker and a 60,000-element client limit.

## CityGen3D manual review

Reviewed the uploaded **CityGen3D v1.20** manual. Page numbers below refer to its printed page numbers.

- **Requirements (p. 3–6):** CityGen3D is a Unity asset requiring Unity 6000.0.66f2 or later and package setup. The manual is documentation, not the asset package. It is not a JavaScript library that can be installed in this simulator. This prototype uses our code and assets; it does not claim to run CityGen3D.
- **Selection and origin (p. 8–11):** a visible map selection establishes the origin; neighbouring tiles retain that origin. Data is fetched with a 100 m margin and complete referenced geometry. Small areas are recommended for iteration. This is the strongest approach to adopt first: one visible tile with an explicit boundary and a separate data buffer.
- **Data versus generator (p. 11–13):** source processing is separate from generating the 3D scene. Our prototype follows that separation with a worker-produced tile and a replaceable renderer.
- **Terrain (p. 14–16):** flat tiles are the starting point. Elevation comes from another dataset, such as NASADEM (~30 m resolution), rather than OSM. Elevation is deferred here.
- **Roads (p. 22–24):** CityGen3D forms non-road blocks and treats intervening terrain as road space; markings are separate. Gap hatching may require manual orientation. This is useful evidence for continuous surfaces, not proof that the tool knows every real lane marking. We reuse our joined road surfaces; we have not recreated its proprietary generator or changed lane rules.
- **Buildings (p. 25–37):** footprints determine shape, with blueprints/prefabs chosen using tags, land use and size. Low-poly batching reduces draw calls. It cannot recover unrecorded facade details merely from an OSM outline. Our first version preserves footprints/holes and batches simple extrusions, with estimated heights identified.
- **Runtime (p. 38–41):** scene streaming and floating-origin management address large worlds. Neither is necessary for this bounded single tile. The stable projection and buffer leave room for adjacent tiles later.
- **Builds (p. 47–48):** the manual describes standalone Unity builds and excluding editor-only components. It does not establish that its editor generation workflow can run inside our existing WebGL app.

**Assessment:** adopt the small-tile workflow now. Evaluate the actual licensed Unity package separately only if an engine migration becomes the goal. A manual alone cannot establish its speed, accuracy or suitability for our mobile browsers.

## Run and verify

```
npm ci
node tools/build_demo.mjs . dist-tile --preview
npm run dev:routes -- dist-tile 8000
```

Open `http://127.0.0.1:8000/?tile`. The existing source broker handles search and base OSM requests; no new key is required. The same Pages Worker makes a supplementary fixed Overpass query for standalone road markings and parking spaces, limited to a 1,250 m bounding extent, with a one-hour cache, client throttling, timeouts and response-size limits. It accepts bounds, never arbitrary query text. If the detail provider fails, the base tile remains usable and the missing details are reported. OSM map tiles are displayed directly with attribution. No satellite imagery is fetched or analysed.

```
npm test
TEST_SITE=dist-tile node tests/tile-builder-browser.mjs
```

The browser test uses fixture map tiles and provider responses. It verifies visible selection, search, pin dragging, buffered bounds, 3D rendering, orbit/reset, invalidation, cancellation, provider errors/retry and mobile overflow. `LIVE_TILE=1` adds a separate live street-map/search/generation check on the deployed preview. These are distinct from verifying geographic accuracy.

A separate live Cambridge source request returned 28,719 elements (~3.1 MB); local generation produced 1,050 building footprints, with 1,047 heights estimated, and 121 clipped road surface polygons. The source response reported 2026-08-10, so it must not be described as a fresh survey. Local browser evidence generated from this response is in `docs/evidence/one-km-tile/`; the basemap in deterministic tests is explicitly a fixture. Live-provider screenshots/results are GitHub Actions artifacts.

## Street detail coverage

- Directional lane arrows read explicit `turn:lanes` tags; BUS LANE reads designated/only bus or PSV lanes. Inconsistent directional counts and unsupported turn values are reported instead of silently choosing a lane. `oneway=-1` is handled after native geometry reversal. Lane separators require explicit `lane_markings=yes`. Marking placement and lane widths are approximations, not measurements.
- Explicit closed `road_marking=box_junction`/`yellow_box` polygons produce yellow hatching. `keep_clear` and `word` markings become road text. Closed `amenity=parking_space` polygons produce individual bay outlines. Missing boundaries are not replaced by guessed boxes.
- Existing mapped signals, stop/give-way controls and zebra crossings are shown. Signal phases are static preview colours. Supported source upright signs include UK stop, give-way, no-entry and speed signs. Unsupported signs stay in the coverage report. Pole placement/orientation is estimated using the native roadside-clearance code.
- OSM turn restrictions and their original relation members/tags are retained; their labels and blue one-way guides are reference overlays. This preview has no driving/routing enforcement. Road names are labels, not invented painted inscriptions.
- Roadside furniture whose base intersects a road is omitted with a count. Barriers/gates/bollards remain because they can intentionally obstruct traffic. Source data is not mutated.
- The supplied central Cambridge base response has 69 named/restriction labels, 17 generated signal positions, 4 signs and thousands of street-detail segments, but **zero explicit directional lane arrows, yellow-box polygons or parking-space polygons in that response**. The separate query can retrieve additional mapped details; it cannot recover features absent from OSM. This does not certify every real street marking.

Pure tests cover reverse one-way lanes, asymmetric counts, malformed lane tags, KEEP CLEAR/BUS LANE, explicit yellow-box and parking polygons, fence/tree/lamp assets, turn restrictions, road-overlap suppression and provider validation/rate-limit errors. Synthetic tests demonstrate supported features without adding fictional markings to the Cambridge dataset. Browser tests also verify the guide toggle and asset coverage controls.
