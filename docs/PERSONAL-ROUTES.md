# Personal routes, Courses and voice guidance

## Try the update

Open **My routes** in the learner lobby. Search **Cambridge**, choose a result, then click/tap the map to place **A** (start) and **B** (finish). Drag, swap or place pins at the map centre using the keyboard-accessible buttons. Select **Generate route**, name it, then **Save & drive**. Saved routes can be viewed, renamed, driven again or deleted with confirmation.

The complete route corridor is prepared **before driving begins**. Preparation has progress, cancellation and retryable errors. It takes longer for a large uncached route, but there is no “load next section” pause while driving. Current, surrounding and approaching scenery tiles render; distant scenery stays as data. The surrounding ring supports mirrors, turns and reversing. Roads, traffic, vehicle state and the geographic origin continue unchanged across tiles.

**Drive** is experimental, ungraded practice using the existing player vehicle, cameras, traffic and collisions. Routes **strictly longer than six miles (9,656.064 m)** also offer **Mock test**. Eligibility uses decoded route geometry, not an editable distance label. Custom mocks use the native assessor on **Hard**: at most 15 driving faults, no serious faults, and the finish must be reached. Ending early is incomplete and cannot pass. Real fault checking and assessment timing run; these routes do not add the built-in mock's scripted emergency event. Generated roads may differ from real roads, and a pass is not a prediction of a DVSA result.

Personal practice requires sign-in on an authenticated deployment but no subscription. Custom graded mocks require the same full entitlement as built-in mocks. Preview guest access remains isolated to the visual preview. Other lessons, paid mocks and learner assessment behavior retain their existing rules.

## All puzzles are now lessons

Open **Courses**. The nine former puzzles follow the existing course units as road lessons, grouped into their existing difficulty tiers. They have **Start lesson**, the usual marking selector, stars, prerequisites and next-lesson progression. There is no separate Puzzles lobby button or panel. All original scenario IDs, assessment handlers, stored passes, best stars and earned XP are preserved. Course completion now counts these lessons too; the UI move does not award new XP.

**Settings → Voice guidance → On / Off** controls lesson narration and spoken navigation. Lesson cards also have **Read lesson aloud**. The preference is stored under `slaydrive.voice.v1` and applies across drives/reloads on that browser. Muting, pausing, leaving the drive or hiding the page cancels speech immediately. Navigation replaces stale instructions rather than queuing them. Browser speech synthesis prefers an installed British English voice and needs no application API key or microphone. Voice availability and sound depend on the browser, operating system voices and device audio; written instructions remain usable if synthesis is unavailable.

On phones, Courses, Mock test and Free drive use list → details → Back, including the moved lessons. Other panels retain independent scrolling, reachable close buttons and wrapped controls. The existing cream, teal and pink theme is retained.

## Local storage and preparation

`slaydrive.personal-routes.v1` holds versioned recipes in **localStorage**: UUID, title, timestamps, selected/snapped endpoints, compact longitude/latitude road geometry and attribution. A custom mock stores its most recent result (`lastMock`: completion, pass, driving/serious fault counts, duration, date and marking mode) on its saved recipe. Custom mock results do not write account progress, XP, official lesson completion or backend records. Built-in lessons continue recording progress normally.

`slaydrive.personal-map-cache.v1` is a disposable raw OSM cache, bounded to about 850,000 UTF-16 code units. Generator version 2 invalidates the old generated-section cache without deleting recipes. Cache eviction does not delete saved routes. All source data for the current drive is held in memory after preparation; **that prepared drive can continue without provider requests**. Reopening later may need downloads because the disk cache is bounded. Browser assets and the Leaflet map are not installed as an offline application.

Saves report quota failures and preserve prior data on failure. Malformed saved recipes are retained instead of silently overwritten. Routes/results belong to the browser origin and device, not an account; a different PR URL has separate storage, and clearing site data deletes them. Backend sync can later use these versioned UUID recipes through an authenticated API. No database migration or learner-record rewrite is part of this update.

## Geometry and rendering

There is **no fixed route-distance cap in the application**. The entire selected corridor is fetched in bounded requests: 600 m of route with 150 m overlap and 180 m roadside coverage, each bounded area at most 2 km wide/high. Provider requests remain paced and cancellable. Overlapping source objects are deduplicated by OSM type/ID before conversion. Whole-route safety guards limit response elements, geometry and browser work; they report an error rather than starting with a partial world. Providers have their own route and usage limits.

A Web Worker converts the combined source, validates dense route samples against the native road network and prepares unified road/pavement polygons. It preserves a single geographic origin for the whole drive. Missing or substantially mismatched roads are rejected, not replaced with invented straight connectors. Roads are clipped into 400 m render tiles. Scenery meshes are prepared incrementally ahead of the visible area and released when far behind; source data remains available for returning. Existing physical collisions use the full authored object index, independently of visual tile visibility.

Generated pavement and mapped ground footpaths form **one flat surface per tile**, with road space removed. There are no raised kerb walls. Road, pavement and kerb polygons are separated after rounding so overlapping coplanar layers do not glitter. A small rendering offset keeps the surface distinct from the terrain; source IDs and positions stay intact. Elevated paths/bridges are not flattened indiscriminately.

Building footprints remain mapped and use the existing simulator house/shop/block kit, shared textures and palette. Simple pitched roofs stay within suitable footprints. No new detailed asset pack or guessed roadside buildings is introduced.

Converter provenance: `js/personal/geo/` adapts this project's admin converter from `ravitejamanchala/slayDriveAdmin`, commit `b2e17d16f10b5f320f171596db31f0afd8e00094`. Clearance and routing reuse this simulator. Test sources include the existing Cambridge OSM extract and the user's Hills Road export; they are frozen fixtures, not live checks. Road/building data is © OpenStreetMap contributors (ODbL). Third-party notices remain in `js/vendor/THIRD-PARTY-LICENSES.txt`.

## Providers and deployment

The Pages Worker (`server/map/pages-worker.js`, built to `_worker.js`) handles `/map-api/*`; other requests serve static assets. Search and bounded OSM requests use the existing public SourceBroker at `slaydrive-world-sources.manchala0024.workers.dev`, with its Nominatim/Overpass throttling and shared cache. The private admin and Mapillary APIs are not exposed. Backend/provider secrets are not shipped to browsers.

Search is explicit, not autocomplete. Clients honor 429 Retry-After with bounded retries, cancel stale requests and display errors. Leaflet requests only visible tiles; there is no tile scraping or offline tile prefetch. OSM/ODbL and routing attribution remain visible. Searches and coordinates go to the map providers; learner progress and route names do not.

Isolated `*.pages.dev` previews and localhost use FOSSGIS's OSRM demonstration endpoint for low-volume review. This is not production capacity. Policy: https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy and https://routing.openstreetmap.de/about.html . Production must use a routing operator with suitable capacity and terms.

**Before enabling route generation on `app.slaydrive.com`, set `PERSONAL_ROUTER_URL` in the Cloudflare Pages production environment** to an OSRM-compatible HTTPS car-routing base, including `/route/v1/driving` or the provider equivalent. Until configured, the feature explains that routing is pending; built-in drives remain available.

Feature pushes deploy only the isolated preview (`routes-review`, or `pr-N` when a PR exists). Production remains gated by the existing main-branch/manual workflow. This update does not merge main, change DNS or deploy the production API Worker.

## Run and verify

```sh
npm ci
npm ci --prefix server
npm run dev:routes
# Open http://127.0.0.1:8000
npm test
npm run test:routes
node tests/modal-layout-browser.mjs
node tests/cambridge-surfaces-browser.mjs
npm test --prefix server
npm run check --prefix server
npm run build
```

`dev:routes` uses Node's proxy-aware HTTP support. A plain static server cannot serve the map gateway; use this command or Wrangler Pages for live providers. For a system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium`. GitHub Pages cannot execute the gateway; Cloudflare Pages is the supported live preview.

See [review evidence](evidence/personal-routes/README.md). The route browser test uses deterministic provider responses and actual UI, converter, storage and vehicle physics. It checks preflight failure/recovery, continuous driving with provider access disabled, stable world/traffic/origin across the former boundary, course launches, mute controls and graded mock pass/fail. Speech calls are captured by a test double; these are not acoustic playback measurements. Graded result checks place the car at the finish to exercise assessment/result wiring; they do not claim a bot drove the entire long route.

The junction regression renders the user's exact Cambridge export around **52.20420, 0.13327 → 52.20197, 0.13089**, checks pavement heights and polygon overlaps, and captures a screenshot. Selected pins may be beside a road; the provider snaps them to a nearby driving lane and the UI reports the displacement.

`tools/check-personal-providers.mjs` separately checks live Cambridge search, routing for those exact pins, complete bounded OSM import and native conversion through the deployed gateway. Its report is `test-results/personal-providers-live.json` in preview CI. A local networking restriction must not be reported as a provider outage. No live Stripe checkout or production database write is part of these tests.
