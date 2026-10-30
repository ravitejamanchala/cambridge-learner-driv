# Cambridge source validation — acceptance incomplete

Checked 30 October 2026. Base: `main` at `e4449195fc27e38d010c335ba256b5969fcffed0`.

## Coverage and reproducibility

Network access is restored. The earlier access-failure evidence is historical, not the current blocker. Overpass resolved Cambridge administrative boundary **relation/295355**, approximately **40.37 km²**, before repeated HTTP 502 failures. A dated Geofabrik regional PBF supplies the reproducible full-region alternative; the snapshot is **2026-10-29T21:21:26Z**. The delivery extent is the administrative polygon plus a **1 km buffer**, divided into **102 one-kilometre inventory tiles**.

Immutable inspection version: `52fdf092cb5e518587df60f81ee649591e457ede6b761af903e7ecf17563bef9`.
Bundle: `data/world/cambridge.json.gz`, with checksum receipt. Exact source URL, PBF hash, boundary metadata and counts: [regional-summary.json](evidence/world/regional-summary.json). Rebuild commands: [pipeline](world-data-pipeline.md).

The geometry-intersection selection accounts for 445,855 nodes, 92,595 ways and 383 relations, with **zero missing dependency references**, zero selection errors and no missing normalized provenance. It retains 98,166 normalized features and 149 structurally complete restriction relations. Source counts include dependencies extending outside the delivery extent; feature counts are not claims about the number of distinct real-world objects. Unsupported categories have ledger records, not fabricated geometry.

Native area assembly fixes two previous importer rejections of valid complex grass/scrub polygons. Point-touching holes are permitted; overlapping segments and unsupported geometry remain rejected. Open BMX tracks and slipways remain lines. An assembler is not allowed to promote an inner-only building relation into an exterior.

## Confirmed upstream defects

The current OSM API was independently checked, and contains the same defects as the pinned snapshot. Evidence: [regional-current-relations.json](evidence/world/regional-current-relations.json). Public user names/IDs are omitted from this review copy.

| Source relation | Defect | Required resolution |
|---|---|---|
| 10402, Shire Hall | Building relation has inner members but no outer boundary | Authoritative footprint/member correction |
| 1116128 | Turn restriction has no `to` member | Confirm the intended exit road and current legal restriction |
| 5546965 | No `from` member | Confirm approach road |
| 10283897 | No `to` member | Confirm exit road |
| 12741856 | No `to` member | Confirm exit road |
| 16075364 | No `via` member | Confirm junction node or via-way sequence |
| 18814223 | Only `to`; no `from` or `via` | Confirm approach and junction |

These seven records remain rejected. Inferring legal turn rules from nearby geometry would not be a verified correction. They prevent structural acceptance. No edits were submitted to OSM.

## Remaining acceptance work

- 1,052 building-overlap candidates need reconciliation (including building-part/member hierarchies); overlap alone does not justify deletion.
- Full populated/drivable tile imagery review remains uncompleted. Actual Google satellite imagery at 52.21829, 0.14688 is visible; image acquisition date is unknown. See the geographic audit for the limited reviewed scope.
- Overture/supporting-source reconciliation, terrain/elevation and horizontal/vertical datum acceptance remain pending. OSM height gaps remain unknown.
- Raw topology and legal tags are preserved; this graph is not yet an accepted city driving router.
- Full-city rendering, continuous driving, asset replacement and performance testing remain deferred by the requested data gate.

The preview is a source-data inspection tool with `accepted:false`. It is not the finished Cambridge driving world. Do not manually promote it to accepted or merge it as the completed city renderer. A full regional download and dependency closure establish source accounting, not ground-truth accuracy or complete real-world coverage.
