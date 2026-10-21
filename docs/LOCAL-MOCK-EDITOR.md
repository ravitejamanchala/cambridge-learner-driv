# Local mock-test JSON editing

This is a local integration in the learner simulator repository. Production deployment and DNS are unchanged. Use the existing SlayDrive admin editor to generate and visually edit a world, then export its version 1 track JSON.

## Run

Requires Node 24 and npm.

```sh
npm ci
npm run dev:editor
```

Open **http://127.0.0.1:8000** in your browser. Create a local learner profile if prompted, then open **Mock test**.

1. Under **Local editor routes**, import the JSON exported from https://slaydrive-admin.pages.dev.
2. The server validates the existing native network and checks that the route is connected before saving. After reload, open Mock test and select your route, marked **local**.
3. Press **Start mock test** to drive it using the existing vehicle physics, traffic, examiner instructions and normal mock assessment.
4. **Download JSON** exports the selected revision for backup or another editor import. To change JSON directly in the browser, expand **Edit saved JSON**, choose a revision, edit the JSON, and click **Save as new revision**. For visual changes, re-edit in the admin editor and import another export.
5. Each save is a separate entry in Mock tests; earlier revisions remain selectable. Restarting the server or browser preserves the files.

`PORT=8001 npm run dev:editor` changes the port. The server binds only to 127.0.0.1. It intentionally runs local authoring without Clerk or a subscription; hosted builds keep their existing account and paid-access checks. It does not connect to the learner account backend or sync progress.

## Files and compatibility

Revisions are stored under **.local-tracks/<UUID>.json** in this repository checkout. Each file contains `{id, savedAt, meta, track}`; `track` is the complete unmodified editor export, including the network, spawn, objects, georeference, attribution and plan. Back up this directory to keep your local library. It is gitignored and excluded from the production build. The original `data/areas` and built-in mock routes are never overwritten.

The JSON textarea edits the track envelope, not the disk wrapper. Import accepts editor version 1 puzzle or mock exports with at least two connected waypoints; both appear as local mock tests. Limits: 8 MB per import, 10,000 edges/objects, 2,000 waypoints, 60,000 polyline segments, coordinates within 30 km of origin, individual segments at most 2 km. Invalid JSON/network/routes do not replace earlier revisions.

Roads, lanes, network traffic controls and markings use the existing simulator renderer and assessment network. Authored buildings preserve footprints, holes and transforms; scenery objects retain placement and size. Authored buildings/scenery/signs/lights have physical contact and collision faults. Editor checkpoint/assessment-zone/puzzle-objective metadata is preserved but is not converted into new examiner rules. Decorative object signs/lights do not create traffic rules: assessment uses network `stops`, `giveways`, `zebras`, ways and arrows. Imported OSM tracks omit procedural city fill, as in the editor. Procedural scenery overrides for hand-authored non-OSM tracks are not yet reproduced.

A route section exported by the admin is one mock test. Separate sections do not stream together. Preserve OpenStreetMap attribution when sharing exports. Mapillary remains disabled.

## Local security and deployment

The local server rejects unrecognised Host headers and cross-origin requests, serves no CORS access, and restricts files to its root. Save files use generated UUIDs and atomic writes. It never writes GitHub, uses production database credentials or changes production learner records. Only use it for trusted local authoring. The normal static `npm run dev` does not enable this disk library.

The production workflow deploys on pushes to **main**. This implementation stays on **development/local-mock-library**; do not merge or deploy without approval. No production configuration needs changing for local use.

## Verification

- `npm test`: includes native-format validation, immutable disk revisions, restart persistence, invalid JSON/route rejection, same-origin/Host checks.
- `npm run build`: existing production build includes no local revision files.
- `node tests/local-tracks-browser.mjs`: real Chromium localhost import, mock selection/start with assessment active, vehicle simulation, reload, browser JSON editing and invalid JSON recovery.
- `npm run test:browser`: existing learner simulator interaction regression suite.

Browser tests use the installed matching Three.js files in place of public CDN requests. These are local functional checks, not live routing/provider or production deployment verification.

Local test evidence: the original 79 regression tests plus the new local-library test pass (80 total), and the production build succeeds. The Chromium import/edit test drove the 110.6-metre fixture for 1.5 seconds (4.17 metres), with mock assessment running, then saved and restored an edited revision. The existing learner browser regression suite also passes (prerequisites, cockpit/engine completion, measured control lessons, legacy startup, persisted reports and map-load failure handling). No live provider APIs are required for this local JSON handoff.
