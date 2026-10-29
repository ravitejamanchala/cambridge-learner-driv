# Pavement visual correction

User feedback prompted fresh screenshots of the uploaded 340-road Cambridge map, from the editor's driving camera and the simulator. The prior height-only checks passed but did not catch the visual defects.

## Findings and changes

- Raised generated pavements inherited flat-decal materials with depth writes disabled. Hidden side faces could draw over the pavement top. Authored pavement, kerb and road surfaces now write depth; default mock-route material behavior is preserved.
- Boolean clipping left millimetre-wide islands and spikes. Their area was negligible, but extruding them produced long false walls. A bounded 2 cm polygon opening removes those render-only fragments before extrusion, including mapped footways.
- Narrow residual gaps could become a kerb with no usable pavement behind it. Generated pavement fragments narrower than about 24 cm are now filtered before separating the kerb rim from the footway. Explicit mapped objects and their JSON remain intact.
- Generated pavements continue around fitted junction corners where all connected arms have pavements on both sides. Explicit `no` and `separate` sidewalk tags prevent this inferred corner extension.

This is a rendering correction, not a survey of kerb geometry. It does not fill every road-data gap or implement dropped-kerb vehicle physics. Road centrelines, building footprints and saved object transforms are unchanged.

## Evidence

- [Before](https://github.com/ravitejamanchala/slayDriveAdmin/blob/development/track-editor/docs/evidence/pavement-visual-fix/before.png)
- [After](https://github.com/ravitejamanchala/slayDriveAdmin/blob/development/track-editor/docs/evidence/pavement-visual-fix/after.png)
- [Editor overview](https://github.com/ravitejamanchala/slayDriveAdmin/blob/development/track-editor/docs/evidence/pavement-visual-fix/after-junction.png)

The actual-map browser test now checks image pixels at the formerly broken pavement corner, in addition to heights, import/export, undo/redo and driving. Unit regressions cover both detached and connected hairline fragments, and a narrow gap between roads that must not produce an isolated raised kerb.

Local suites: 193 simulator tests and 90 admin tests passed (283 total). Both production builds passed. The uploaded map passed the editor visual/interaction check. Simulator import, persistence, exact JSON re-export and driving are verified separately before publication.
