# Personal routes and mobile panels

## Try it

Open **My routes** in the learner lobby. Search for **Cambridge**, choose a result, then click/tap the map to place **A** (start) and **B** (finish). Pins can be dragged, swapped, or placed at the map centre with keyboard-accessible buttons. Select **Generate route**, give it a name, and **Save & drive**. Saved routes can be viewed, renamed through the name field, driven again or deleted with confirmation.

This is experimental, ungraded practice. The actual player vehicle, cameras, traffic and collision handling are reused. Lesson objectives, assessment timing, fault recording, pass/fail, XP and account progress are not run for personal routes. Existing paid mocks and lessons retain their original access rules and assessments. In an authenticated deployment, starting a personal drive still requires sign-in; it does not require paid entitlement.

On phones, Course, Puzzles, Mock test and Free drive now use list → details → Back. Their lists no longer collapse over the details pane. Other panels keep independent scrolling with reachable close buttons, wrapped controls and at least 44 px touch targets. The same cream, teal and pink simulator theme is retained.

## Local storage only

`slaydrive.personal-routes.v1` holds versioned route recipes in **localStorage**: UUID, title, timestamps, selected and snapped endpoints, compact geographic road geometry and attribution. There is no track database, migration, account upload, publishing operation or learner-record change in this PR.

`slaydrive.personal-map-cache.v1` is a disposable localStorage cache, bounded to roughly 850,000 UTF-16 code units. It caches generated native map sections. Cache eviction never deletes the saved route recipe. On reopening a route, missing sections are regenerated from providers. This is not a promise that an entire long journey works offline.

Saves report storage/quota failures. A failed save preserves previous data; malformed saved data is retained instead of silently overwritten. Routes belong to this browser origin and device, not the signed-in account. A different PR preview URL has a separate store. Clearing site data removes saved routes. Backend syncing can later use these versioned UUID recipes through a new authenticated API.

## Roads, buildings and performance

The geographic recipe stays in longitude/latitude. There is **no fixed route-distance limit in this application**. Routes are divided into 600 m driving sections, with 150 m overlap and bounded OSM requests no wider or taller than 2 km. The next section is prefetched; active scenes are replaced with a local geographic origin while preserving position, heading and speed. If a section is unavailable, the car pauses with Retry / End drive, rather than driving into empty space. Provider limits, disconnected road networks, invalid coordinates and browser storage still apply.

Generation runs in a Web Worker, and Leaflet is loaded only when the route creator opens. Only adjacent sections are retained in memory. Native road/junction/pavement rendering, continuous original road geometry, lane directions, control-point placement and roadside/building clearance are reused from current main and the admin converter. Missing or substantially mismatched road geometry is rejected; it is never filled with an invented straight road.

Building footprints remain mapped. Their facades use the **existing default simulator house/shop/block kit**, shared textures and palette. Simple pitched roofs stay inside suitable footprints. This does not introduce another detailed architectural asset pack or decorate unmapped roadside plots with guessed buildings. Mapped details may be incomplete and are not validated representations of DVSA test routes.

Converter provenance: `js/personal/geo/` adapts the project's own admin converter from `ravitejamanchala/slayDriveAdmin`, commit `b2e17d16f10b5f320f171596db31f0afd8e00094`. Clearance and native routing are imported from this simulator. The Cambridge regression fixture is an existing OSM extract from 21 October 2026, under ODbL; it is not a live-provider check. Leaflet and polygon-clipping licences are retained in `js/vendor/THIRD-PARTY-LICENSES.txt`.

## Map providers and deployment

The Pages advanced-mode Worker (`server/map/pages-worker.js`, built to `_worker.js`) handles only `/map-api/*`. Other traffic goes to static assets. This is a read-only map gateway; it does not store personal routes. Search and bounded OSM data go through the existing `slaydrive-world-sources.manchala0024.workers.dev` public SourceBroker, retaining its global Nominatim/Overpass throttling and shared cache. The private admin and Mapillary endpoints are not exposed. No keys are placed in browser bundles.

Searches are explicit submissions, not autocomplete. The client respects 429 Retry-After (bounded retry count), cancels stale requests, and exposes provider errors. Map tiles are requested only for the displayed Leaflet view; there is no tile scraping or offline tile prefetch. OSM/ODbL and OSRM credits are displayed.

The isolated `*.pages.dev` preview and localhost use the FOSSGIS OSRM demonstration endpoint for low-volume review. It is not a production capacity commitment. OSRM's official policy reference links the current FOSSGIS terms: https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy and https://routing.openstreetmap.de/about.html . Do not sell or depend on the public demo service as paid infrastructure. The map feature is unpaywalled, requests identify this application, repeated routes are cached, and client requests are paced. The proxy's short per-IP cache guard is best-effort; it is not a global billing/abuse quota.

**Before enabling route generation at `app.slaydrive.com`, configure `PERSONAL_ROUTER_URL` in the Cloudflare Pages production environment** to an OSRM-compatible HTTPS car-routing base, including the `/route/v1/driving` path (or provider equivalent). Use an operator/provider with capacity and terms appropriate for the application's traffic. Until configured, production explains that a routing provider is pending; built-in drives remain available. Providers have their own maximum responses and route capabilities. Search, endpoints and requested geographic areas are transmitted to the named map services; personal titles and learner progress are not.

No DNS or production deployment is performed by a feature push. `.github/workflows/deploy.yml` still deploys only a push to main or its manually dispatched production workflow. Review and merge remain the release gate. The preview workflow accepts this development branch and assigns `routes-review`; once a PR exists it uses `pr-N`. It never invokes the production API Worker deployment.

## Run locally

```sh
npm ci
npm ci --prefix server
npm run dev:routes
# Open http://127.0.0.1:8000
npm test
npm run test:routes
node tests/modal-layout-browser.mjs
npm test --prefix server
npm run check --prefix server
npm run build
```

`dev:routes` uses Node's proxy-aware HTTP support. A plain static server can render the application but cannot serve the map gateway; use this command or Wrangler Pages for live providers. For Chromium outside Playwright's managed browser install, set `CHROMIUM_PATH=/usr/bin/chromium` for tests. Static GitHub Pages does not execute this gateway; the supported live preview is Cloudflare Pages.

## Verification and evidence

See [the review evidence](evidence/personal-routes/README.md). `tests/personal-routes-browser.mjs` uses explicit provider fixtures and exercises actual search, Leaflet pin dragging, localStorage save/reload/quota recovery, native driving, section transitions, ungraded state and mobile layout. It is not a live-provider claim.

`tools/check-personal-providers.mjs` is a separate hosted check of Cambridge search, OSRM routing, bounded OSM import and native generation. Its output is saved as `test-results/personal-providers-live.json` in preview CI. A local networking restriction must not be reported as a provider outage. No Stripe checkout or production database write is part of these checks.
