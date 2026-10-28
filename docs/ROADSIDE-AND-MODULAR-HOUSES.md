# Roadside clearance and modular UK houses

## Reproduction

The user's `Start_pin___Destination_pin-a29fb54a51.json` is retained as
`tests/fixtures/hills-road-user.json`. It covers the Hills Road / Station Road
area in Cambridge: 184 road segments, 327 buildings, 18 signal entries and
921 editor objects. Existing building exclusions in that file predate this fix.
The uploaded modular house/shop kit was inspected in a local Three.js viewer.

The reproduced faults were:

- Clearance used only the nearest road centreline. A point could be clear of
  that narrow road while still standing in an adjacent wider road or corner.
- Signal placement used the first unsafe candidate if every search failed.
- OSM signal nodes created reverse-facing signals on one-way roads.
- Fixed-radius corner geometry extended into three otherwise valid buildings.
- Independent pavement ribbons overlapped and produced seams at complex junctions.
- Waypoint cubes, route lines and the editing grid stayed visible in free drive.

## Implementation

`road-space.js` describes the actual road ribbons and corner polygons in metres.
Signals, upright signs, beacons and imported scenery now use this shared boundary,
including other intersecting roads. Placement also checks buildings. Signal
placement returns no position when no clear candidate is found; no unsafe fallback
is rendered. Stop lines and native signal timing retain their source positions
and clusters, apart from removing wrong-way entries from OSM one-way approaches.

`roadside-clearance.js` adjusts generated corners to fit mapped buildings, moves
movable street objects at most 15 metres, and excludes remaining intersecting
obstacles from the playable scene. It preserves their source objects and reasons
in `roadsideClearance.excluded`; relocated coordinates and original positions
are recorded in `roadsideClearance.adjustments`. Route topology, waypoints, spawn,
building footprints and building heights are unchanged. This is a driving-preview
cleanup with estimated placements, not a claim of surveyed pole/tree locations.
OSM access restrictions are not relaxed.

New OSM worlds, generated route handoffs and JSON imports apply clearance. Road
geometry edits recompute it. For an existing open draft use **Clear roadside
obstructions**. Import and manual clearance can be undone; save a new revision
when satisfied. The learner sandbox uses the same cleanup at runtime and keeps
its original saved/imported JSON intact.

`road-surfaces.js` merges authored-road polygons by render chunk, subtracts them
from pavement and adds a narrow kerb border. Integer millimetre clipping avoids
near-coincident coordinate slivers. Three recent surface configurations are
cached so moving a tree or changing a facade doesn't repeat the polygon merge.
Clipper 6.4.2 is bundled locally with its Boost/JSBN notices; browser-local source
loading does not require an extra CDN. See `THIRD-PARTY-LICENSES.txt`.

## Recreated housing

Reference: **FREE Game-Ready Kit: Modular UK House + Shop**, by Жирбек / TapGrade,
[Sketchfab model](https://sketchfab.com/3d-models/free-game-ready-kit-modular-uk-house-shop-7068cf47097e41b0b24c2797a0e64f65).
The uploaded archive identifies the Sketchfab Standard licence. The shipped
frontages are newly constructed procedural geometry; the reference glTF/bin
remain in the inspection workspace.

`uk-architecture.js` creates bay fronts, pale window frames, sills, lintels,
panelled doors, string courses, gutters and framed shopfronts. Street-facing
facades use the closest road as an orientation hint. Brick, buff brick, render,
stone, shop and apartment styles share the construction system. Slate texture
scale is finer; OSM roof orientation and supported roof-colour/material tags are
used. Slightly skewed four-corner buildings can retain pitched roofs.

Frontage details occupy a shallow recess inside the existing footprint. Source
transforms, maximum height and courtyard gaps stay intact. Details are combined
into one vertex-colour mesh per frontage and hidden beyond 160 m; tall buildings,
very long facades and irregular outlines retain the lighter facade treatment.
The resulting architecture is an estimated UK style, not an exact reconstruction
of the real house. Normal learner car and assessment behaviour is unchanged.

## Evidence and test commands

On the submitted map, local unit/browser tests retain all 184 road segments and
327 buildings, move **27** objects, archive **18** remaining obstructions, and
remove **5** reverse-facing one-way signal entries (18 → 13). The exported scene
has **882 rendered objects: 327 buildings + 555 mapped details**; route helper
objects also remain in JSON, but are hidden while driving.

The reference Cambridge example now retains 24 roads, 114 buildings and 550
mapped details after clearance. Every retained object's ID and X/Z position is
compared with the simulator scene. Saved JSON and downloads are compared to the
actual admin snapshot. Tests also check polygon geometry, safe pole placement,
original-object recovery, unchanged building geometry, idempotence, no positive
pavement/road overlap, rotated frontage bounds and distance LOD.

```sh
# Admin
npm test                       # 76 tests
npm run build
node tests/uk-assets-browser.mjs
node tests/roadside-user-browser.mjs
TRACK_JSON=test-results/hills-road-cleared.json \
  SIMULATOR_DIST=/absolute/path/to/simulator/dist \
  node tests/learner-import-browser.mjs
node tests/map-details-browser.mjs
npm run test:browser

# Simulator development worktree
npm test                       # 175 tests
npm run build
npm run build:pages
node tests/pages-browser.mjs
node tests/three-imports-browser.mjs
```

Browser tests cover undo/redo, saving/export, the actual user JSON, newly recreated
frontages, free-drive with assessment disabled, and simulator imports with normal
assessment active. Local provider requests are distinct from live provider checks.
The tagged admin release runs live OSM checks and both actual live-admin downloads
through the live Pages simulator. Its receipt records `frontend`, `smoke`,
`providers`, and `learner` separately on `deployment/admin-preview-status`.

## Release boundary

Simulator source stays on `development/mapped-scenery`; only the existing
`gh-pages` JSON sandbox is published at
https://manchala.co.uk/cambridge-learner-driv/.
Admin source stays on `development/track-editor`, deployed to
https://slaydrive-admin.pages.dev by an explicit preview tag.
Simulator `main`, `app.slaydrive.com`, DNS and learner records are untouched.
