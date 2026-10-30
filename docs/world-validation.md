# Validation and delivery

This branch is a **data-stage implementation checkpoint**, not the completed city renderer. The brief explicitly requires a validated real dataset before broad rendering work. Network access is restored. That gate remains incomplete because confirmed malformed source relations and the wider geographic/source review are unresolved.

## Verification

Environment: Node 24.19.0, Linux cloud execution, system Chromium through Playwright 1.56.1. Browser runs use software/emulated hardware; they do not establish performance on a physical phone.

| Check | Result / scope |
|---|---|
| New pipeline unit tests | 22 passing: geometry, provenance, topology, restrictions, ownership, invalid imports, provider retries, successful resume, tamper checks, cache/integrity and empty inventory |
| Existing and new frontend suite | See `evidence/world/checks.json` and `unit.txt` for final count and exact outcome |
| Production build | Built successfully; diagnostic page excluded |
| Preview build | Built successfully; diagnostic page included at `world-inspector.html` |
| Source/standalone/preview inspector in Chromium | Passed selection/provenance, courtyard hole display, pan/zoom, layers, outside extent, stale tile response, failure/retry and 390px layout |
| Existing personal-route browser suite against production build | Passed search/pin drag, save/reload, provider 429, native drive, continuous route geometry, ungraded practice, graded custom mock pass/fail, course road lessons, voice mute, mobile and deletion |
| Real Cambridge acquisition | Dated regional PBF acquired; complete selected dependency closure; see Cambridge report |
| Google satellite browser access | Actual Cambridge satellite imagery visible with TLS verification; full matched review not passed |
| Full-city rendering/terrain/asset gallery/driving | Not implemented or tested; deferred by data gate |
| Full-city desktop/mobile fps, GPU memory and backtracking budgets | Not measured; 60/30 fps are future targets, not results |
| Live provider reliability/auth/backend/Stripe | Not tested by these changes; no backend modifications |

Screenshots in `evidence/world/` show the synthetic diagnostic fixture, a tile failure state and the phone layout. The later `regional-*` evidence records the actual normalized Cambridge source dataset; no city driving claim is made. The prior personal-route regressions exercise the existing simulator with deterministic fixtures; they are not live map-provider verification.

## Review

Base `main`: `e4449195fc27e38d010c335ba256b5969fcffed0`.
Branch: `feature/roadarium-world-and-assets`.

Run the inspector:

```sh
npm ci --cache /tmp/npm-cache
npm run world:fixture
npm run world:inspector
python3 -m http.server 8000 --directory dist-world-inspector
```

Open `world-inspector.html` on that server. For a real acquired dataset, serve its immutable version directory within the same server and enter its `index.json` URL. The standalone build's SlayDrive link requires the simulator alongside it; normal preview builds include both. No localhost URL is claimed as a hosted preview.

`world-data.yml` checks the pipeline, deterministic fixture output and browser inspector, and uploads the diagnostic build/evidence as an Actions artifact. It has read-only repository permissions and no deployment step. The existing Cloudflare production workflow deploys on `main` or explicit manual dispatch. This branch does not push to main or dispatch it. The existing PR preview workflow is separate; a successful local build/push is not evidence of a deployed PR URL.

The full deliverable remains at the real-data acceptance gate. Resolve the recorded source defects, source reconciliation and per-tile satellite review before city streaming/elevation/renderer integration. Network permissions are no longer the blocker. PR #25 and its preview are available without merging.

## Regional-source update evidence

The latest local suite passes **267 tests**. `regional-unit.txt` and `regional-extractor-test.txt` record the unit and synthetic PBF regression results. `regional-browser.json` and `regional-reference.png` exercise the actual packaged Cambridge dataset (102 inventory tiles, reference location, provenance and three tile transitions). Production and preview builds pass; production output excludes `world-data/` and `world-inspector.html`. Synthetic fixture browser interactions were repeated against the preview build. The existing personal-route/browser regression remains the earlier checkpoint result; it was not rerun for these isolated data tools.

Live source access: Geofabrik PBF and current OSM relation API successfully retrieved. Google satellite imagery visible with trusted managed CA and normal TLS verification. Source defects, supporting datasets and geographic review remain unresolved; this is not a city-driving performance result.

PR: https://github.com/ravitejamanchala/cambridge-learner-driv/pull/25 . Test link: https://pr-25.learner-drive-app.pages.dev/world-inspector.html . No merge is needed.

## My routes replacement and Bot lab follow-up

The owner requested connecting this generator to existing My routes and the existing Bot lab. `docs/my-routes-source-generator.md` describes the integration and remaining accuracy limits. The source normalizer is now shared with the runtime worker. Source geometry/footprints and known directional lane splits are preserved; unknown paint is not automatically promoted to source-backed centre lines. The existing personal-route regression was rerun successfully after this change. A real-data browser check demonstrates the native car moving under the existing bot, pause/stop, source version export and ungraded behaviour. It is not a full-route or full-city accuracy certificate.

The real Water Street bot check now also completes the 155 m example (148 m reached, finish tolerance, seed 7), and the original controlled-stopping lesson completes D0/S0. Ten original street assets have geometry-budget/envelope tests and a WebGL gallery capture. These are local checks until the corresponding PR preview CI is confirmed. Total unit suite: 275 passing. See `docs/evidence/world/replacement-*` and `my-routes-bot.json`.
