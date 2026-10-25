# Map corrections

`cambridge-1.json` is a correction set for `data/cambridge.json`, produced in the road inspector
(`tools/road-inspector` branch) from Mapillary street-level imagery and reviewed by hand: 568 features
accepted, none dismissed.

It is kept here as the provenance of the map, not as something the build reads. What was taken from it:

| | In the file | Applied |
| --- | --- | --- |
| Edge geometry (extra points to round off corners) | 244 | 244 |
| Edge attributes (Milton Road width and lanes) | 1 | 0 — the map already matched |
| Zebra crossings | 31 | 21 |
| Stop lines | 54 | 17, as give-ways with the stop flag |
| Street lamps | 483 | 483 |

The markings that were not applied are ones the map already carried within 12 m. A second zebra beside
an existing one would have the examiner mark a learner twice for one crossing, so they are dropped
rather than merged.

The geometry overrides only add intermediate points: every polyline keeps its endpoints, and the
centre line moves by at most 6 cm. Every mock-test route came out the same length with the same
examiner instructions afterwards.
