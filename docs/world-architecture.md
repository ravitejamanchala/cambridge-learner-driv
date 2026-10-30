# Cambridge world implementation — data-stage checkpoint

Base confirmed by the owner: `main`, `e4449195fc27e38d010c335ba256b5969fcffed0`.
Repository: https://github.com/ravitejamanchala/cambridge-learner-driv
Branch: `feature/roadarium-world-and-assets`. Isolated worktree: `/workspace/simulator-world`.
The older simulator and UI worktrees have unrelated edits and were not modified.

## Implemented

- Offline, resumable, timestamp-pinned Overpass acquisition with boundary discovery, full downward relation dependencies, bounded requests, 429/5xx backoff, checksummed raw responses and explicit failures.
- Normalization into point, line and polygon source features with stable IDs, courtyard holes, metadata and unknown dimensions. Unsupported and rejected features have ledger entries.
- Source-node navigation graph separate from visual features. Coordinate crossings do not manufacture graph junctions. Access, direction, bridge/layer and restriction members are retained.
- Boundary plus metric buffer, complete declared tile inventory, single geometry owner plus cross-tile references, versioned outputs and immutable rebuild checks.
- Separate north-up diagnostic browser with layers, selection, provenance, tile switching, failure/retry states and a geographic comparison link. This is the minimum data inspection adapter, not a new game engine.
- Projection module shared by the diagnostic pipeline and the existing personal-route conversion API. Its existing origin/scale values are preserved. Remaining renderer/minimap/terrain adapters must adopt this service during the later integration stage.

## Deliberately deferred by the requested acceptance gate

No new driving city provider, 3D tile coordinator, terrain elevation, asset gallery, asset redesign or production entry point has been enabled. Existing physics, grading, accounts, payments and road rendering have no modifications. The personal-route conversion import is the only existing application logic touched.

The Cambridge regional source extract is acquired and its boundary is **relation/295355**. Actual Google satellite imagery is accessible again. Source acceptance is still incomplete: malformed upstream relations, source reconciliation, supporting data and the full geographic review remain unresolved. `accepted:false` is mandatory for every dataset produced at this stage; a successful structural fixture test does not promote a dataset. The future review/acceptance operation must bind decisions to an immutable source version and refuse unresolved critical findings.

## Remaining stages after source acquisition

1. Resolve the documented malformed source relations and reconcile overlapping footprints.
2. Review the regional geometry-intersection coverage report. No dependency references are missing, but unsupported categories and underlying OSM omissions still require review.
3. Evaluate elevation and additional footprint sources, including license, dates, coverage and horizontal/vertical datums. No supporting dataset is currently accepted.
4. Perform the tracked imagery review, record critical fixes with evidence, and freeze a validated real dataset.
5. Adapt existing `createAuthoredTiles` and `buildWorld` for stable city graph residency, bounded CPU/GPU residency, cancelled requests, driving-ground safety and actual terrain/bridge surfaces. Keep the car, examiner and traffic alive across tile boundaries.
6. Implement/import assets against accepted source geometry, then measure driving performance and rendering fidelity.

`Dataset` is an inspection reader with deduplicated requests, checksum validation and bounded parsed-file cache. It does not claim to implement cancellation, concurrent driving prefetch, byte-budgeted GPU residency or a production city stream coordinator.
