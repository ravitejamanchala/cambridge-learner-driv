# Cambridge source dataset and browser inspector — acceptance pending

The simulator has no validated complete Cambridge city dataset. This PR adds a reproducible source pipeline and a preview-only data inspector, before broad renderer work required by the data-first brief.

**Test without merging:** https://pr-25.learner-drive-app.pages.dev/world-inspector.html

The preview includes the real Cambridge administrative boundary plus a 1 km buffer, 102 delivery tiles and a pinned 29 October 2026 OSM regional snapshot. It preserves whole geometry, source IDs, provenance, unknown dimensions, restrictions and dependency accounting. The dataset has 98,166 normalized features and zero missing dependency references. A checksummed compressed bundle expands only in diagnostic/PR builds; production builds exclude it.

Import fixes cover open leisure tracks/slipways, complex source multipolygons, point-touching holes, inner-only malformed building relations, and roads/polygons crossing or containing the selection without interior source vertices. Large ledgers are sharded to respect Cloudflare file limits. Coordinate navigation centres on the requested position. Full source accounting and rejected records remain inspectable.

**Not ready as the completed city renderer:** six malformed turn restrictions and one building relation are confirmed in current OSM as well as the snapshot. They remain rejected; legal rules are not guessed. Building-overlap reconciliation, supporting data/elevation, the full geographic review, city streaming, rendering and performance validation are pending. The dataset remains `accepted:false`. Network access is restored and no longer the blocker.

Validation: 267 frontend/pipeline unit tests; a real synthetic-PBF extraction regression; production/preview builds; synthetic inspector interactions and real Cambridge inspector smoke checks. Exact outcomes and scope are documented in `docs/world-validation.md` and `docs/evidence/world/`. Existing personal-route/graded-mock/mobile browser regression passed at the earlier checkpoint. Actual Google satellite imagery was viewed; only a limited qualitative source comparison was completed, not a city accuracy gate.

Branch: `feature/roadarium-world-and-assets`; confirmed base main `e4449195fc27e38d010c335ba256b5969fcffed0`. No merge, main push, production deployment, DNS change, learner-record migration or billing change. No Roadarium code/assets or satellite textures are bundled.
