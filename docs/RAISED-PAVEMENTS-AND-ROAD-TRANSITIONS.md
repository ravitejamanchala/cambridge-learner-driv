# Raised pavements and road transitions

Changes apply to imported/authored maps in both the admin and the Pages simulator. Existing default mock-route buildings are retained unchanged. No source map coordinates, road widths, building footprints or JSON schema were changed.

## Causes and corrections

- Generated pavements were flat at 0.02 m while asphalt was at 0.04 m. Pavements and kerb tops now stand at 0.19 m, with vertical faces down to their base: a visible 0.15 m kerb above asphalt.
- Mapped footways/pedestrian surfaces use the same height. Their visible geometry is clipped against all nearby road arms and junction patches, avoiding raised slabs across the carriageway. Original objects remain selectable/editable and retain their saved transforms, footprints and IDs.
- Kerb offsets are computed before cutting polygons into 400 m render tiles. New vertical walls are omitted at tile cuts, so adding raised geometry does not introduce artificial walls along square render-chunk boundaries.
- Exposed generated pavement tips and isolated mapped path tips are rounded by up to 0.25 m. Thin isolated polygons are retained when too narrow to round. Existing shared path mitres stay joined.
- Two-arm bends have circular outer shoulders within the existing half-width of the shared node, replacing flat bevel edges.
- Nearly straight, two-arm road connections with differing widths now receive short cubic shoulder transitions rather than perpendicular width steps. The transition is limited to 6 m or one quarter of the narrower segment, whichever is shorter, and is included in the shared road-clearance geometry.
- Offset arcs use 5 mm tolerance to avoid excessive geometry for sub-pixel curves.

## Scope

Kerb height is a visual default, not surveyed elevation. These changes do not implement suspension response to kerbs, terrain elevation, or a complete set of surveyed dropped kerbs. Road ends at the imported geographic boundary still end at that boundary; this change does not invent missing roads. Shoulder transitions interpolate incomplete map width data; they are not surveyed road-edge geometry.

## Verification

`tests/pavement-surfaces.test.mjs` covers connected road-width transitions, unchanged source coordinates, transverse tile seams, rounded tips, raised tops and vertical faces, clipped mapped footways, and preserving their transforms/material groups.

The existing actual-user-map browser test now checks raised pavement heights in the live scene, in addition to import, unchanged road/building data, selection, undo/redo, save/export and free-drive checks. The simulator browser check verifies full import, browser persistence, exact re-export and normal assessment-mode driving.

Both repository unit suites and production builds are run before publication. Simulator changes remain on `development/mapped-scenery`, with the static sandbox on `gh-pages`; simulator `main`, learner production and DNS are untouched.

Local results: 191 simulator tests and 88 admin tests passed (279 total), both production builds passed, and the uploaded 340-road/309-building map passed editor and simulator browser checks. The existing clearance pass archived one gate overlapping a newly rounded shoulder; its full source object remains recoverable through the clearance archive and Undo. No buildings or road segments were removed.

The software-WebGL simulator sample measured a 0.7 ms median simulation step and 1.9 ms P95. These are local CPU-step measurements, not an end-user FPS guarantee. Pavement walls share their existing surface mesh, avoiding a separate draw call for every kerb face.
