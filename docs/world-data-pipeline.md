# Reproducible city data pipeline

Node 24 and the repository lockfile are used. No new dependency or Three.js upgrade is required.

```sh
npm ci --cache /tmp/npm-cache
npm run world:acquire
npm run world:build
npm run world:fixture
npm run world:inspector
npm run test:world
npm run test:world:browser
```

Serve the checkout using `npm run dev`, then open `world-inspector.html`. A standalone diagnostic build is produced in `dist-world-inspector`; serve that directory to review its bundled synthetic example. It is intentionally separate from the learner production build. The inspector loads a real generated index by its URL, including under a deployment subpath. Its current synthetic example is not Cambridge geography and must not be used as evidence of map accuracy.

The defaults are `configs/world/cambridge.json`, `.world-sources/cambridge` and `.world-datasets/cambridge`. These raw/generated city directories are ignored. Override them with:

```sh
node --use-env-proxy tools/world/cli.mjs acquire configs/world/cambridge.json SOURCE_DIRECTORY
node tools/world/cli.mjs build configs/world/cambridge.json SOURCE_DIRECTORY OUTPUT_ROOT
```

## Extent and snapshot

Discovery finds exactly one administrative level 8 relation named Cambridge in the configured search box. The search box is **not** the city boundary. Full relation geometry is fetched at the provider's discovery timestamp and records its source ID/version, timestamp, area, polygon, coordinate bounds and 1 km buffer. An ambiguous or absent result fails the job for investigation.

A conservative circumscribed 64-sided circle approximates the buffer, with at most 1.21 m radial excess for 1 km. Exterior and courtyard/boundary holes are retained. Acquisition uses 1.5 km grid cells; delivery uses 1 km cells. Cells intersecting the buffered polygon receive inventory entries. No city inventory is invented while boundary acquisition is unavailable.

Requests run sequentially, at least 1.5 seconds apart; 429/5xx have bounded retries and Retry-After handling. A longer cooldown stops and saves the job for later resumption. HTTP denials do not initiate login loops or alternative-host bypasses. Responses with provider remarks, missing timestamps, oversized bodies or invalid JSON fail explicitly. Raw source files are separately checksummed; changed configuration requires a new snapshot directory.

Full downward dependencies are acquired, including nodes and ways outside the boundary. Missing references are reported at build time. Overpass bbox semantics, unsupported nested polygon relation members, unusual relation roles, source conflicts and invalid geometry remain explicit limitations. A regional-extract comparison is required before a complete city coverage claim.

## Provenance and precedence

OSM is the only geographic source implemented in this checkpoint. Keep its original IDs, tags, version, timestamp, source node/member references and checksummed snapshot. Missing metric height/width is `null`, not a fabricated verified value. Building levels are separate from height. No procedural styling alters normalized positions.

Same-ID conflicting responses are a gate failure rather than silently selecting the newest. Building overlap candidates are reported, not automatically deleted: building parts, multipolygon members and genuinely separate structures need distinct rules. Supporting datasets (elevation, Overture or council data) have no default overwrite authority. Before adding one, record source coverage/date/CRS/license and define attribute-specific precedence and evidence-backed reconciliation. Source-derived footprint confidence must not be reused as height confidence.

## Coordinates and ownership

`js/world-data/projection.js`: geographic coordinates are `[longitude, latitude]`, legacy origins are `[latitude, longitude]`; metres use X east, Z south, Y up. Cambridge config uses origin `[52.205, 0.119]` and the existing simulator's local equirectangular scales. This is a local approximation, not survey-grade British National Grid. Test projection error against suitable reference coordinates before quantitative accuracy scoring. Round-trip consistency does not establish geographic accuracy.

A feature's whole geometry is stored once in an owning tile. Bounding-box tile references conservatively include every overlapped inventory tile; they may include a tile the actual polygon does not intersect. The viewer resolves owners and deduplicates by source ID. There are no clipped fragments to accidentally drop or duplicate. The future driving coordinator must reference-count shared IDs across tile eviction. Road topology is retained in `navigation.json` independently of visual ownership. It preserves source direction/access tags and restriction members; it is not yet an integrated route engine.

## Files and validation

Each immutable version directory includes `index.json`, `tiles/*.json`, `navigation.json`, `ledger.json`, `validation.json` and `review-grid.json`. SHA-256 of the canonical manifest (excluding its version) identifies the dataset; the manifest contains hashes and sizes for every other file. Output reuse requires identical content. Do not edit generated version files; change source/evidence and rebuild.

`schemas/world/*.schema.json` describes interchange shapes. `schema.js` validates diagnostic indices and tile bounds; normalization checks ring closure, holes, intersections and references. The fixture tests exercise ownership, source conflicts, requests, immutable outputs and coordinate conversion. More complex real-source cases must be added as redistributable regression fixtures when discovered.

To inspect a missing object, find its stable ID in `ledger.json`, then check rejection/dependency/outside-extent status in the validation report. If accepted, resolve its owner tile, inspect geometry and provenance in the browser, and only then investigate its future render adapter. A visible category in the schema is not proof of a rendered asset.

## Another city later

Use a separate config, boundary selector/origin, sources directory and output root. Reuse the normalizer, projection, inventory and inspection reader. Supply a regional traffic/asset profile during later renderer integration. Do not reuse Cambridge's accepted review records for another city. This task acquires no other city.
