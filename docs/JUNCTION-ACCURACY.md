# Junction and footpath accuracy correction

This pass addresses geometry, not lighting or textures. No captured Roadarium
application code or visual assets are included. The comparison uses attributed
OSM-derived data in the supplied capture, SHA-256
`517ace13ad4b03b0878f66b46928b380cab8b8ed3899e127e291316c4f4380d9`.

## Actual findings in the uploaded Hills Road / Station Road map

542 coordinate samples on 113 shared OSM ways have a median separation of
0.0241 m, 95th percentile 0.0531 m and maximum 0.0677 m from the captured
centrelines. This verifies coordinate conversion for these roads, not surveyed
road edges. [Per-way comparison](evidence/hills-road-accuracy/hills-road-comparison.json)
and [coordinate evidence](evidence/hills-road-accuracy/hills-road-comparison.csv).

The earlier importer positioned controls 2.5 m before a signal node without
checking the cross-road or junction corner. Ten retained stop positions in this
file intersected other road geometry. They now move upstream until their full
bar clears intersecting carriageways and corner polygons with 0.5 m clearance.
Two controls require traversal onto a connected upstream edge of the same road.
Traversal respects one-way direction and refuses ambiguous branches. Signal poles
use the corrected approach and the existing whole-carriageway obstacle check.
Control locations remain geometric estimates, not verified real signal surveys.
Unresolvable controls in other maps are recorded rather than silently deleted.

284 existing footpath segments now meet at shared bounded mitre vertices instead
of independent rectangular ends. Very short/acute joins are limited to prevent
folded polygons. Each segment keeps its ID, source tags and original segment
transform in metadata and remains editable. Export uses existing native footprint
polygons; editor and learner decode identical geometry. Isolated terminal segments
are unchanged. Source roads, building footprints and spawn remain unchanged.

Source `lane_markings=no` now suppresses invented longitudinal lane/centre paint;
required stop/give-way/crossing paint is separate. `sidewalk=left/right/no`,
`sidewalk:left/right/both`, separately mapped footways and supported metric sidewalk
widths determine which guessed pavement strips are generated. Separate paths no
longer get duplicate generic pavement. These tags travel in the existing `osm.ways`
metadata; there is no incompatible track format change. Native lessons without
source metadata retain their existing defaults.

## Remaining accuracy limits

99 matched ways have a width or lane-count difference from the capture. Many
values are inferred in one or both datasets. For example OSM way 4040899 has no
width or lane count: the current importer uses 3.2 m / one lane, while the capture
uses 8.5 m / two lanes. Copying that estimate would not establish real-world
accuracy. Source widths remain authoritative; missing width inference, lane arrows,
kerb surveys and traffic-island geometry need further work with supporting data.
A good centreline match alone does not validate any of these features.

No lighting, texture, house styling, production learner branch or DNS changes are
included. Changes to imported geometry are undoable on admin import; original
stop tuples and path transforms are retained in correction metadata. Previously
saved JSON remains readable. Reimport it or use “Clear roadside obstructions” to
apply the geometry corrections, then save/export a new revision.

## Verification

`npm test` in both repositories covers the actual file, upstream controls,
idempotence, unchanged road/building geometry, matching path joins, sharp short
bends, explicit road tags and actual absence of duplicate pavement polygons.
`node tests/roadside-user-browser.mjs` exercises import, undo/redo, save/export,
stop/pole clearance and free drive. `tests/learner-import-browser.mjs` imports the
same exported file in the Pages simulator and checks all rendered objects.
These are local checks until the release receipt confirms hosted verification.

Local verification on 28 October 2026: admin 82/82 tests, simulator 181/181;
admin production build and simulator production/Pages builds passed. The actual
user export imported into the local Pages build with all 184 roads, 327 buildings
and 555 mapped details; persisted JSON and re-export were byte-data equivalent,
and the actual car moved 4.16 m with normal assessment active. Admin free-drive
remained assessment-free. No live provider verification is implied by these results.
