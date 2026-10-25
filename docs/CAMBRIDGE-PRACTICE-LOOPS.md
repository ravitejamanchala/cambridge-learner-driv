# Cambridge pilot: reusable generated practice loops

This development version adds two experimental Cambridge (Brookmount Court) area loops and an opt-in ungraded driving mode. It does not publish new production learner content or alter the normal assessment rules.

## Try the pilot

Use this repository's `development/local-mock-library` branch:

```sh
npm ci
npm run dev:editor
```

Open the printed localhost URL. Open **Mock tests → Cambridge (Brookmount Court) experimental loops**, then select **Load clockwise practice** or **Load anticlockwise practice**. Each load saves a new local revision and reloads the app. Open Mock tests, choose the imported route, and click **Start practice**. Pause → **Reset to spawn** resets the drive. Use the other load button to try the second direction.

The local/browser-preview authoring environment is isolated from paid production accounts. Ordinary production sign-in/subscription rules are unchanged. The samples are also included by `npm run build:pages` for the existing browser authoring preview; standard production builds do not bundle the sample files. The build script does not itself deploy the preview; release status is recorded below.

Files:

- [Clockwise JSON](../examples/cambridge-pilot/v2-buildings/brookmount-clockwise.json): 6.24 km.
- [Anticlockwise JSON](../examples/cambridge-pilot/v2-buildings/brookmount-anticlockwise.json): 6.13 km.
- [Route overview](../examples/cambridge-pilot/v2-buildings/overview.svg).
- [Manifest and source/output checksums](../examples/cambridge-pilot/v2-buildings/manifest.json).

Both are around 15 minutes **at an assumed average 25 km/h**, not a traffic-aware travel-time promise. Use the updated development simulator: old builds ignore the experimental flag and may grade the drive.

## What is real, generated and unverified

The roads are connected geometry from the existing Cambridge OSM network. The directions were searched separately, retaining one-way direction and excluding motorway/trunk/service/track roads from the itinerary. This is not the earlier straight schematic route.

The centre entrance has not been independently verified. The preset references the Kirkwood Road/Kings Hedges Road area and places the vehicle at a provisional lane position away from the immediate graph junction. Road width, current signs and physical spawn safety still need review. The v2 files include 330 clockwise / 324 anticlockwise editable buildings using SlayDrive facade textures. They are synthetic scenery, not surveyed building footprints. Generation checks full footprints against all source roads with 2.6 m clearance, rejects overlapping buildings and keeps junction corners open. Existing authored-building collision handling applies.

Fresh provider access was blocked by this execution environment. The cached OSM snapshot has no recorded capture date and does not retain access, barrier, conditional or turn restrictions. Metadata therefore says `restrictionValidation: "unavailable"` and `locationVerified: false`. These are **experimental simulator routes, not verified road-legal itineraries or official examiner routes**. Do not activate them as reviewed assessments without obtaining the missing data and review.

## Reusable engine

The admin repository owns the reusable generation code, not the simulator controller:

- `src/practice-loops.js`: directed loop search.
- `src/practice-world.js`: compatible track export, metadata, provisional spawn and context network.
- `tools/generate-practice-loops.mjs`: file-based CLI with non-overwriting output directories.
- `presets/cambridge-brookmount.json`: Cambridge configuration.
- `docs/PRACTICE-LOOP-ENGINE.md`: API, configuration, limitations and expansion procedure.

Supply a covering native map and another centre preset to reuse the engine. Cambridge coordinates are not embedded in the engine. A nationwide directory, fresh OSM retrieval and restriction-aware routing are future adapters, not silently claimed features of this offline pilot.

## Experimental mode

Opt in with top-level `practiceMode: "experimental"`. Normal `kind: "mock"` tracks without this field retain assessment. Practice shows a persistent notice and has no faults, pass/fail, assessment timer, emergency assessment scenario or persisted learner result. Route guidance and physical driving continue. Switching back to a normal lesson/mock restores normal assessment.

The original files used `sceneryMode: "procedural"` with an empty object list. Older simulator builds suppress generated scenery for every imported network, so those files appeared as bare roads. The new `v2-buildings` revision uses `sceneryMode: "authored"` and includes buildings in the JSON. Its display works with the earlier authored-object importer, though experimental mode still requires this updated simulator. Original files and saved local revisions are retained.

Imported roads are now rendered from the original graph. Interior waypoint splits are only used for navigation and physics, so route anchors no longer create artificial gaps in road paint. This restores existing generated/map markings; it does not claim missing real-world paint has been surveyed. The source contains no explicit lane-arrow records for these loops.

## Test evidence

- Simulator unit suite: **93 passed** (includes both pilot round trips and unchanged normal mock assessment).
- Admin generation/export tests and existing unit suite: **51 passed**.
- Browser `tests/cambridge-pilot-browser.mjs`: verifies every included building reaches the actual textured Three.js scene, buildings near each spawn, and both load buttons, two distinct saved revisions, correct non-default worlds, actual vehicle movement (16.17 m each in the test), route lengths 6235.608/6126.732 m, elapsed assessment time 0, faults 0.
- Browser `tests/experimental-practice-browser.mjs`: import, drive, collision, reset, no result/progress changes and normal mock restored.
- `tests/editor-world-paint.test.mjs` exercises actual Three.js road paint geometry and signal phase metadata before/after waypoint splits.
- These are local software-Chromium checks, not full-route manual drives, live-provider verification, physical mobile tests or instructor review.

No production deployment, database migration or DNS change. Earlier unfinished mobile layout edits are excluded from this feature's commits.

## Preview delivery — 25 October 2026

- Source implementation: `7e951319a6147c82a356325a77701f477e27f044`. Built from a clean detached worktree (`sourceDirty: false`), excluding the paused mobile UI edits.
- GitHub Pages branch: `757cce2496dfda3723416fae1338b19f8ddd62f6`. Pushed the browser-only JSON sandbox to the existing preview at https://manchala.co.uk/cambridge-learner-driv/. No production branch or DNS change.
- Static Pages browser check passed with the actual release bundle under the repository subpath: both new JSON resources available, IndexedDB import/edit/reload, immutable revisions, export, invalid-save recovery and actual mock driving.
- Pilot browser scenes contained all 330 / 324 textured buildings; 14 / 11 were within 100 m of each spawn. Both drives moved 16.17 m with zero assessment time/faults. The experimental and ordinary mock regression browser suites also passed.
- Local suites: admin 51 tests; simulator 93 tests. Both production builds and the Pages build passed.
- The environment proxy returned HTTP 403 when reading the public preview, so live rollout and remote CI status were not independently verified. A successful branch push is not evidence that Pages deployment has finished.

Mapillary remains disabled. Add `MAPILLARY_ACCESS_TOKEN` securely to the admin repository's `cloudflare` GitHub environment, never into JSON, source or chat. Private imagery also needs the matching Clerk secret and explicit private administrator grant documented in the admin setup guide. Its photo coverage and current provider terms could not be verified here.
