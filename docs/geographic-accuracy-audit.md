# Geographic accuracy audit — limited source review, gate incomplete

Inspection date: 30 October 2026. Baseline simulator `e4449195fc27e38d010c335ba256b5969fcffed0`; data version `52fdf092cb5e518587df60f81ee649591e457ede6b761af903e7ecf17563bef9`.

The earlier proxy failure in `evidence/world/provider-access.json` is historical. In the restored environment, Chromium displayed **actual Google satellite imagery** around Water Street/Water Lane, Fallowfield, Green Dragon Bridge and the River Cam. The managed CA was trusted without disabling TLS verification. The image capture date is **unknown**; copyright 2026 is not an acquisition date.

Reference: https://www.google.com/maps/@?api=1&map_action=map&center=52.21829%2C0.14688&zoom=19&basemap=satellite . The satellite view was north-up/untilted with a visible **50 ft** scale. The source view is north-up, centred on the same coordinates at **100 m = 300 px**, showing a wider extent. This is a qualitative comparison, not a pixel-aligned survey or measured positional error. Reference imagery is not bundled as an application texture or used to trace new geometry.

Source screenshot: [regional-reference.png](evidence/world/regional-reference.png). Source identifiers: [regional-reference-features.json](evidence/world/regional-reference-features.json). This inspector draws roads as centre lines; it does not assert measured road widths, kerbs or rendered pavement surfaces.

| Location / source IDs | Feature and observed agreement | Verdict / confidence | Measurement and cause | Action / evidence |
|---|---|---|---|---|
| Water Lane `way/36812316`, `way/1114698314`; Water Street `way/36812317` | North-west approach, eastward continuation and the triangular arrangement of streets are visible in both source view and imagery | MATCHES at coarse layout level / moderate | No numeric positional tolerance established; differing scale and roof displacement limit comparison | Retain source centre lines; inspect detailed widths, islands and markings separately |
| Fallowfield `way/4008069` | Approach leaves the Water Street/Water Lane meeting point toward the north-east in both views | MATCHES at coarse alignment level / moderate | Qualitative bearing/connectivity only; legal turns not inferable from aerial imagery | Leave source geometry unchanged |
| Green Dragon Bridge `way/4008103`; River Cam `way/144555404` | Bridge crosses the river southwest of the reference junction; river runs below the northern bank housing in both views | MATCHES at coarse layout level / moderate | No elevation, bridge clearance or bank-edge error measurement | Keep source feature identity and bridge/layer tags; terrain remains unverified |
| Terraced houses around reference junction | Footprint rows are present on the expected sides of the streets; roofs/trees obscure wall boundaries | CANNOT VERIFY exact footprints/heights / low | No surveyed ground outlines or image capture date | Do not warp footprints to roof pixels; reconcile source building parts and inspect suitable licensed evidence |
| Signs, bollards, markings, signals and legal turn restrictions | Small objects/paint are not consistently resolved in the reference image | CANNOT VERIFY | Satellite does not establish current legal rules | Obtain dated street-level or authoritative evidence; seven malformed source relations remain rejected |

No geographic corrections were inferred from Google imagery. This limited source review is **not** the requested full-city tile review and is not a renderer comparison. The immutable dataset's review grid still records all 102 tiles as unreviewed; one local qualitative observation does not complete a tile. Full structural/source reconciliation, measured control checks where justified, all drivable/populated tile overviews and matched rendered-world checks are pending.

For continuation, open the inspector, enter the reference coordinates and click **Inspect location**. Compare at matched north-up extent/scale, identify source IDs, then record MATCHES/MISMATCH/CANNOT VERIFY with confidence, image date, tolerances only when justified, and a source-backed correction if needed. Repeat the same view after correction. Do not label the geographic gate passed because screenshots exist.

## Follow-up: generated Water Street overlay

The actual My routes generated road boundaries, OSM centreline and old inferred paint were overlaid in a browser on Google satellite at 52.21829, 0.14688, zoom 20. This uses requested north-up Web Mercator extent and viewport dimensions; independent registration control points were not established, so no metric-accuracy claim is made. Capture date is unknown and reference imagery is not bundled with the application.

Qualitative finding: old automatic centre paint is not supported on the visibly unmarked section of source way 43666131. New source-normalized maps now keep missing `lane_markings` as unknown rather than paint it automatically. Road edges still use an estimated 6.4 m width where no width is supplied; `parking:both=lane` does not establish parking-lane dimensions. Parking width, private access, junction controls and complete geographic review remain open. The visible alignment is useful for identifying discrepancies, not sufficient to close the city-accuracy gate.
