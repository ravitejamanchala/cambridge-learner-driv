# Mapped building detail release

The admin OSM converter now preserves tagged heights, derives heights from tagged storeys (3 m per storey, plus a tagged roof height, minus the tagged raised base), and records the method. Untagged buildings use the median tagged storey count of at least three nearby buildings of the same explicit use and comparable footprint area, within 500 m. At most nine neighbours contribute. Where evidence is insufficient, conservative building-use defaults remain explicitly unverified. This is a deterministic local heuristic, not a trained model or survey.

Named OSM shops and selected amenities on building ways become shopfront records. Named point features attach only to a containing footprint, excluding courtyard holes. Ambiguous overlaps choose the smallest containing footprint. Unmatched points are counted, not snapped across roads. One sign per building is currently supported; shopping centres with multiple tenants need a separate facade-authoring pass. Signs face the road using the shared renderer's facade direction and are labelled as estimated placements. Existing tagged names are rendered on imported tracks too.

The same original renderer is included in the admin and GitHub Pages simulator. Signs use bounded canvas text (no HTML), a single plane and a 100 m visibility distance; textures are released on rebuild. Footprints, road geometry, vehicle physics and assessment behavior are unchanged. Overture tagged storey counts now also reach the facade renderer. Existing terrain support is retained; this release does not add elevation-aware driving.

## Try it

Generate a new OSM world to get the expanded POI query and height evidence, then export JSON and import it into the simulator's Mock tests. Existing saved drafts are not silently regenerated or overwritten. A sample generated from the repository's existing OSM fixture is available at `/examples/cambridge-street-details.json` on the admin site. It includes ten retained mapped shopfronts after the existing road-clearance filter. Estimated height/placement metadata survives the complete JSON round trip.

## Sources

© OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright . The sample carries attribution. Roadarium's supplied HAR informed the feature comparison only. No HAR headers, cookies, runtime code, assets, inferred storey dataset or storefront dataset are included in this release.

## Verification

Unit checks cover explicit height precedence, raised bases, neighbour thresholds, footprint containment/courtyards, sign orientation/bounds and texture disposal. Browser checks cover mapped signs, export equality, local save/restore and the existing UK-style undo/redo flow. The simulator import check covers JSON persistence, complete scenery delivery and actual driving. Local Chromium uses software WebGL; it does not establish real-device FPS or live provider availability.
