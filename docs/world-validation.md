# Validation and delivery

This branch is a **data-stage implementation checkpoint**, not the completed city renderer. The brief explicitly requires a validated real dataset before broad rendering work. That gate cannot pass while boundary/source acquisition and satellite imagery are unavailable.

## Verification

Environment: Node 24.19.0, Linux cloud execution, system Chromium through Playwright 1.56.1. Browser runs use software/emulated hardware; they do not establish performance on a physical phone.

| Check | Result / scope |
|---|---|
| New pipeline unit tests | 16 passing: geometry, provenance, topology, restrictions, ownership, invalid imports, provider retries, successful resume, tamper checks, cache/integrity and empty inventory |
| Existing and new frontend suite | See `evidence/world/checks.json` and `unit.txt` for final count and exact outcome |
| Production build | Built successfully; diagnostic page excluded |
| Preview build | Built successfully; diagnostic page included at `world-inspector.html` |
| Source/standalone/preview inspector in Chromium | Passed selection/provenance, courtyard hole display, pan/zoom, layers, outside extent, stale tile response, failure/retry and 390px layout |
| Existing personal-route browser suite against production build | Passed search/pin drag, save/reload, provider 429, native drive, continuous route geometry, ungraded practice, graded custom mock pass/fail, course road lessons, voice mute, mobile and deletion |
| Real Cambridge acquisition | Blocked before boundary discovery by proxy access; no data claimed |
| Google and Roadarium browser inspection | Tunnel failure; CANNOT VERIFY |
| Full-city rendering/terrain/asset gallery/driving | Not implemented or tested; deferred by data gate |
| Full-city desktop/mobile fps, GPU memory and backtracking budgets | Not measured; 60/30 fps are future targets, not results |
| Live provider reliability/auth/backend/Stripe | Not tested by these changes; no backend modifications |

Screenshots in `evidence/world/` show the synthetic diagnostic fixture, a tile failure state and the phone layout. No screenshot is presented as real Cambridge geography or a city driving recording. The prior personal-route regressions exercise the existing simulator with deterministic fixtures; they are not live map-provider verification.

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

The full deliverable remains blocked at the real-data gate. Once network configuration is applied, resume acquisition, real-source structural checks, source reconciliation and the per-tile satellite review. Only then begin city streaming/elevation/renderer integration and the corresponding driving/performance evidence.
