# learner-map-engine

Builds driving-sim road networks from OpenStreetMap, enriched with Mapillary sign
detections. Runs entirely locally. Emits the same area JSON the sim already loads,
so nothing in the sim has to change.

Separate from the app on purpose: this can be rewritten, be wrong, or be thrown
away without the shipping product moving.

## Why

A quarter of Cambridge's roads have no speed limit in OpenStreetMap, so
`build_net.py` guesses one from the road class and flags it `assumed`. The sim is
honest about this in two places (it won't draw a speed sign on an assumed road, and
the HUD says "30 mph assumed") — but `test.js` still marks driving and serious
faults against the guess. Mapillary has detected the actual signs. This reads them.

## Use

```sh
node bin/render.mjs       <area.json> out/a1.html [snapped.json]   # see what's assumed
node bin/index-page.mjs   <areas-dir> out/index.html               # all areas at a glance
node bin/mock-features.mjs <area.json> mock.json                   # fake data, no token needed
node bin/snap-report.mjs  <area.json> <features.json> [out.json]   # what would change
node bin/serve.mjs        out 8077                                 # http://127.0.0.1:8077/

MAPILLARY_TOKEN=MLY|... node bin/fetch-mapillary.mjs <area.json> features.json
```

`fetch-mapillary.mjs` needs network, so run it on your own machine.

## How a sign becomes a road attribute

1. `project.mjs` — lon/lat to the sim's local metric plane, using the `origin`,
   `kx`, `kz` stored in every area file. Same transform as `build_net.py`.
2. `net.mjs` — loads the area, buckets every road segment into 40 m cells, answers
   "nearest road to this point" with the local tangent.
3. `snap.mjs` — rejects anything further than 8 m from a road, and abstains where
   two roads are within 4 m of each other. Junctions are exactly where a wrong
   guess produces an unfair fault, so it would rather say nothing.
4. `signs.mjs` — Mapillary encodes the sign in its class string
   (`regulatory--maximum-speed-limit-30--g1`), so the limit is read from the name.

Output per sign: way, distance, which side of the road, how many times it was seen.

## Accuracy, honestly

Mapillary positions come from phone GPS plus structure-from-motion — metres, not
centimetres. Classification is machine learning: good on common signs in good
light, worse on rare ones, in rain, at dusk, behind a van.

So nothing here should promote a limit to "certain" on its own:

- treat detection count as confidence; one sighting proposes, five confirm
- where OSM and a sign agree, that is stronger than either alone
- where they disagree, `snap-report` lists it as a conflict for a human
- a human who drove the road is the only thing that should outrank both

## Tests

`node --test test/snap.test.mjs` — projection round-trip, class parsing, and 800
synthetic signs placed beside real Cambridge roads and snapped back
(99.5% correct road, 99.9% correct side).
