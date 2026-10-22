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

## GitHub Pages browser preview

The existing repository Pages site is https://manchala.co.uk/cambridge-learner-driv/ (GitHub inherits the account’s existing Pages domain). No DNS or custom-domain configuration is changed. It is served from the separate `gh-pages` branch. This preview enables a guest authoring sandbox and has no account-backend configuration. It does not change the Cloudflare learner production deployment.

Open **Mock test**, import an editor JSON, select the route marked **local**, and start. **Edit saved JSON** creates another immutable revision; **Download JSON** makes a portable backup. Pages saves revisions in IndexedDB in this browser on this device, scoped to the site path. It cannot write local disk files or commit to GitHub. Clearing site data removes revisions, and other devices do not see them. Use downloaded exports for transfer. The localhost disk library remains available through `npm run dev:editor`.

Build this sandbox explicitly with `npm run build:pages`. Serve `dist/` over HTTP/HTTPS; the output works under the repository subpath. The regular `npm run build` retains the committed Clerk/API configuration. Publish only the `dist/` output to `gh-pages`, preserving branch history; never push this output to `main`. The existing production workflow only deploys on `main`.

The route starts/finishes at the first/last plan waypoints, snapped to connected road-network nodes by the native router. The precise car placement comes from `spawn.x`, `spawn.z` and `spawn.heading`. In the admin route generator, the administrator chooses A/B, or exports one selected section of the generated route.

`npm run test:pages` checks the built site under `/cambridge-learner-driv/`, import/edit/reload in IndexedDB, real mock driving, immutable revisions, JSON download, rejected invalid JSON, and absence of localhost API calls.

### Imported-route selection and export recovery

After an import or a JSON revision save, the new revision is automatically selected in Mock tests, in the revision dropdown, and in the JSON editor. Its own network/spawn/scenery are loaded when you press Start. Selecting another local mock updates the JSON editor and download; changing the revision dropdown selects that mock. Downloads include the title and revision ID so files with the same title remain distinguishable. The summary shows the selected revision, road/building counts, route endpoints and spawn position. The most recent local route selection survives a page reload. Selecting a built-in mock clears/disables the local JSON editor rather than exporting an unrelated saved track.

This fixes the earlier behaviour where reload returned to the default lesson/built-in mock and the JSON editor silently displayed the first saved revision. The regression test `npm run test:imports` imports three JSONs with different road positions, road lengths and building counts. It checks the automatically selected route, actual loaded network, vehicle spawn, rendered building meshes and downloaded JSON for each file, plus switching through both selectors and reloading.

An actual admin route export revealed an additional compatibility issue: older generated waypoints stored descriptive labels such as `Route start` in the native `road` filter. Local imports now accept those files without rewriting saved JSON. At runtime, waypoints are anchored to their nearest road segment and the native graph is split at interior checkpoints. This avoids snapping a checkpoint to an unrelated nearby junction. Signals, zebras, give-way controls and lane arrows are remapped to the split edges. Native one-way direction and real learner assessment remain active. An actual pre-fix Cambridge export is covered by unit and browser tests, including its rendered buildings and spawn.

Verification of this fix: 82 learner tests passed. The browser regression imported three worlds (60/100/140-metre roads with 1/2/3 buildings), automatically selected each one, drove its own network, checked its spawn, and compared downloaded JSON to the imported envelope. It also imported an actual historical admin download and started its 95.06-metre Cambridge mock route with 25 OSM buildings, with assessment running. The admin separately tested three real downloads against complete editor snapshots. These interaction checks are local browser tests; hosted deployment and CI status are reported separately.
