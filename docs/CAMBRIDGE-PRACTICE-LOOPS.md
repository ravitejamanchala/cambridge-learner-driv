# Cambridge pilot: reusable generated practice loops

This development version adds two experimental Cambridge (Brookmount Court) area loops and an opt-in ungraded driving mode. It does not publish new production learner content or alter the normal assessment rules.

## Try the pilot

Use this repository's `development/local-mock-library` branch:

```sh
npm ci
npm run dev:editor
```

Open the printed localhost URL. Open **Mock tests → Cambridge (Brookmount Court) experimental loops**, then select **Load clockwise practice** or **Load anticlockwise practice**. Each load saves a new local revision and reloads the app. Open Mock tests, choose the imported route, and click **Start practice**. Pause → **Reset to spawn** resets the drive. Use the other load button to try the second direction.

The local/browser-preview authoring environment is isolated from paid production accounts. Ordinary production sign-in/subscription rules are unchanged. The samples are also included by `npm run build:pages` for the existing browser authoring preview; standard production builds do not bundle the sample files. This work does not itself deploy that preview.

Files:

- [Clockwise JSON](../examples/cambridge-pilot/brookmount-clockwise.json): 6.24 km.
- [Anticlockwise JSON](../examples/cambridge-pilot/brookmount-anticlockwise.json): 6.13 km.
- [Route overview](../examples/cambridge-pilot/overview.svg).
- [Manifest and source/output checksums](../examples/cambridge-pilot/manifest.json).

Both are around 15 minutes **at an assumed average 25 km/h**, not a traffic-aware travel-time promise. Use the updated development simulator: old builds ignore the experimental flag and may grade the drive.

## What is real, generated and unverified

The roads are connected geometry from the existing Cambridge OSM network. The directions were searched separately, retaining one-way direction and excluding motorway/trunk/service/track roads from the itinerary. This is not the earlier straight schematic route.

The centre entrance has not been independently verified. The preset references the Kirkwood Road/Kings Hedges Road area and places the vehicle at a provisional lane position away from the immediate graph junction. Road width, current signs and physical spawn safety still need review. Buildings/scenery are procedural SlayDrive assets, not exact surveyed buildings. Existing physical vehicle and authored-object collision behaviour remains; this change does not create a new collision system for every procedural building.

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

`sceneryMode: "procedural"` explicitly requests normal generated city scenery. It cannot be combined with authored building objects, preventing duplicate buildings. Other imported tracks remain authored by default.

## Test evidence

- Simulator unit suite: **91 passed** (includes both pilot round trips and unchanged normal mock assessment).
- Admin generation/export tests and existing unit suite: **46 passed**.
- Browser `tests/cambridge-pilot-browser.mjs`: both load buttons, two distinct saved revisions, correct non-default worlds, actual vehicle movement (16.17 m each in the test), route lengths 6235.608/6126.732 m, elapsed assessment time 0, faults 0.
- Browser `tests/experimental-practice-browser.mjs`: import, drive, collision, reset, no result/progress changes and normal mock restored.
- These are local software-Chromium checks, not full-route manual drives, live-provider verification, physical mobile tests or instructor review.

No production deployment, database migration or DNS change. Earlier unfinished mobile layout edits are excluded from this feature's commits.
