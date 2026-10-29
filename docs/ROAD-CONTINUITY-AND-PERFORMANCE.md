# Road continuity and imported-map performance

28 October 2026. Applies to the existing manchala.co.uk Pages simulator and the
shared admin renderer. Simulator production/main is not changed.

## Reproduction and fixes

The new user JSON (`Start_pin___Destination_pin-fb0e72ccce.json`) has 340 road
segments, 309 buildings and 1,278 rendered mapped details. All are retained.

Separately imported road ribbons ended at a shared node without joining their
outer edges. This left small triangular notches at bends and changes in width.
A bounded bevel now joins their cross-sections. It changes neither centreline
coordinates nor declared road widths. The same surface polygons feed rendering,
obstruction clearance and junction checks. On the uploaded file, 141 joins had
more than 0.01 m² of missing surface, about 84.08 m² altogether, after accounting
for the existing rounded corners. The unit suite raycasts actual road triangles
across sampled lanes and render-tile boundaries. An initial denser inspection of
19,440 lane points found no central carriageway holes; the new fill is at joins.
The edge of the imported geographic bounds remains the actual end of its data.

The simulator's overview camera extended its far range without extending the
road visibility radius. The road draw/unload radius now follows the overview
range; normal driving retains its existing distance budget.

Imported collisions previously transformed/tested every solid object on every
simulation step. An immutable spatial index now selects candidates intersecting
the swept vehicle envelope; the existing polygon, courtyard and tree-trunk tests
still decide collisions. Tests compare indexed results against the full scan,
including fast movement and rotated objects. Static imported meshes also retain
cached transforms. Native non-imported scenes keep their original transform mode.

Building triangles using the same material are grouped into one draw group per
material. Tests verify triangle positions, normals, UVs and material assignments
are unchanged. The brick mortar, roof tile and window-frame contrast is reduced;
side-window texture repetition is less dense. Imported asphalt changes from
`#444a4e` to `#343a3e`. No extra shadows, shader noise or post-processing are added.
A separate roof-direction reference error discovered during inspection is fixed.

## Local evidence

A single software-WebGL Chromium sample on the same host and fixture:

| Fixture | Median simulation step before → after | Sampled draw calls before → after |
|---|---:|---:|
| New 340-road file | 1.9 ms → 0.6 ms | 356 → 310 |
| Earlier 184-road file | 2.8 ms → 0.3 ms | 1,492 → 1,209 |

These are local samples, not a device FPS guarantee. Traffic/model readiness can
vary draw counts. Raw measurements are in `evidence/render-performance/`.
The code change reduces material draw groups without removing building geometry.

83 admin and 186 simulator unit/regression tests passed. Both production builds
and the Pages build passed. Browser checks on the new file passed import,
undo/redo, unchanged roads/buildings/spawn, save/export, free-drive, simulator
persistence and exact re-export. All 1,587 renderable objects reached the learner
scene; actual vehicle physics moved 4.16 m with normal assessment active.
Building style editing, transforms, undo and restore also passed.

```sh
# Admin repository, after building the simulator Pages output
TRACK_JSON=tests/fixtures/hills-road-cutoff-user.json \
  EXPORT_JSON=test-results/cutoff-cleared.json node tests/roadside-user-browser.mjs
TRACK_JSON=test-results/cutoff-cleared.json \
  SIMULATOR_DIST=/path/to/simulator/dist \
  RENDER_PROFILE_OUTPUT=test-results/performance.json node tests/learner-import-browser.mjs
```

The local learner test now uses a fresh ephemeral server port and checks the
served release against the requested build, preventing stale test servers from
silently serving a different build. Hosted verification uses the existing URLs
and pins the simulator source revision in the release workflow.
