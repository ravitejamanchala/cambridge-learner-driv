# Cambridge data validation — gate incomplete

Date: 30 October 2026. Base: `e4449195fc27e38d010c335ba256b5969fcffed0`.

## Coverage

The intended extent is the Cambridge city administrative boundary plus 1 km. **Actual boundary ID, polygon, area, snapshot date and real tile count remain unresolved.** The proxy rejected the boundary discovery request before any live source file was acquired. The discovery bounding box is not reported as the city extent. No substitute Roadarium/corridor dataset is labelled complete Cambridge.

`docs/evidence/world/provider-access.json` records the independent browser checks. Proxy-aware HTTP requests to Overpass and Geofabrik returned tunnel `403 Forbidden`; Chromium could not load Google Maps or Roadarium. The acquisition journal records `status:incomplete`, null boundary/snapshot and a failed discovery part. This is an environment access dependency, not missing user authorization.

The environment configuration draft contains the requested host additions, but its saved state does not apply them to the active runtime. Review/save and publish it through environment settings, then rerun `npm run world:acquire`. Do not retry unchanged requests repeatedly or use an unrelated host to bypass the policy.

## Local structural evidence

The committed synthetic fixture has 16 inventory tiles, original test geometry, a building courtyard, two source road components including a grade-separated crossing, a restriction relation and a shelter. Every source feature has one owning shard and resolvable tile references. Unknown dimensions stay unknown. The fixture build passes structural checks, while `accepted:false` and `synthetic:true` prohibit interpreting it as verified Cambridge geography.

`npm run test:world` exercises coordinates/heading/negative tile indices; ring/hole reconstruction and rejection; source conflicts; original node connectivity and restriction preservation; bounded provider retries and explicit denials; incomplete coverage; immutable output; cache deduplication/integrity; administrative relation labels; and empty tiles. Browser checks exercise the connected diagnostic UI with the generated files.

## Acceptance matrix

| Gate | Result |
|---|---|
| Confirmed repository baseline | Complete: owner chose current main |
| Actual Cambridge boundary + source inventory | Blocked: discovery unavailable |
| Full live acquisition and dependency accounting | Not run; no real dataset |
| Structural algorithms | Tested on synthetic fixture; not city-validated |
| Projection absolute geographic accuracy | Round trips/axis conventions tested; survey alignment unverified |
| Source topology and legal restrictions across city | Not reviewed; graph preservation implemented only |
| Supporting sources/elevation and source reconciliation | Pending; no accepted height dataset |
| Google satellite overview per populated/drivable tile | Unavailable; 0 inspected |
| Fixed validated real dataset version | Not produced |
| Renderer refinement and city driving | Deferred until preceding gate passes |

Do not promote this checkpoint by setting `accepted:true` manually. Complete real-source structural checks and the evidence-backed review first. Generic geometric tests cannot establish legal driving rules, imagery age or real-world completeness.
