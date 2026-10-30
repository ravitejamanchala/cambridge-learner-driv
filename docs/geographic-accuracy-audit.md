# Geographic accuracy audit

**No satellite comparison has passed.** Actual Google satellite imagery could not load in this runtime. The browser returned `ERR_TUNNEL_CONNECTION_FAILED`; proxy-aware HTTP returned tunnel `403 Forbidden`. Evidence: `evidence/world/provider-access.json`.

| Location/source | Simulator/data revision | Google link / image date | Feature checked | Observation | Verdict | Confidence | Measurement/tolerance | Cause | Action / evidence |
|---|---|---|---|---|---|---|---|---|---|
| 52.21829, 0.14688; source IDs unresolved | main e444919; no acquired city dataset | [Satellite reference](https://www.google.com/maps/@?api=1&map_action=map&center=52.21829%2C0.14688&zoom=19&basemap=satellite); acquisition date unknown | roads, footprints, water/transport layout | No imagery visible; no geometry comparison possible | CANNOT VERIFY | High confidence in access failure; no geography confidence assigned | No metric measurement justified | environment proxy rejection | Restore configured host access, rerun matched north-up review; provider-access.json |

Roadarium's supplied Cambridge URL also failed browser navigation. The prior captured reference files were located under attachments; they are inspection material, not a source with established rights for redistribution. They are not bundled or used to declare geographic correctness.

## Review procedure before acceptance

1. Load actual satellite imagery, confirm the coordinates and visible scale, keep attribution, and record acquisition date only if actually provided. Copyright year is not image age.
2. Open the generated city index in `world-inspector.html`, choose the same tile and north-up extent, and show source footprints plus tile boundaries. This stage compares normalized data, before styling.
3. Pick at least three well-separated visible controls (junction, bridge, low-building corner). Establish common shift/scale/rotation uncertainty before measuring individual geometry. Do not shift individual objects to compensate for a projection error.
4. Define feature-class tolerances **before scoring**. No numeric tolerances are assigned here because imagery resolution/alignment uncertainty could not be observed. Use metre offsets only where scale alignment can be reproduced; otherwise use qualitative verdicts. Footprints must account for roof displacement/overhang and shadows. Small posts/signs typically need street-level or survey evidence.
5. Complete an overview row for every populated/drivable tile in `review-grid.json`. Record unavailable/unreviewed tiles separately. Record detailed samples for junctions, bridges/water, residential/commercial blocks, boundaries and suspected discrepancies.
6. Each inspected feature gets exactly one of MATCHES, MISMATCH, CANNOT VERIFY; record source ID, revisions, reference URL, image date/unknown, evidence, confidence, tolerance, likely cause and correction/leave rationale. Overview coverage is not object-level accuracy.
7. Confirm corrections using licensed structured sources or authorized survey evidence. Never scrape/trace Google into game geometry or textures. Keep reviewed exceptions tied to source version, IDs and evidence.
8. Rebuild affected tiles and repeat matched before/after checks. After data acceptance, repeat the comparison for rendered mesh vs source geometry, collision, roads and height alignment. Keep renderer defects separate from source defects.

The synthetic diagnostic screenshot demonstrates hole preservation and selection only. It is not a matched Cambridge before/after comparison. Building heights, bridge clearance, legal directions/speed, friction and live signals cannot be established from satellite imagery alone.
