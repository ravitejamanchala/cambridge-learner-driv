# UK road-marking correction record

Scope: shared admin/simulator renderer, not a council-approved highway design. Corrections apply automatically to existing and generated track geometry, without changing source coordinates, saved revisions, speed limits or assessment behaviour.

## Applied presets (metres)

| Treatment | Previously rendered | New preset |
| --- | --- | --- |
| Centre line, up to 40 mph | 3.2 m mark / 5.8 m gap, 140 mm wide | Diagram 1008: 2 m mark / 4 m gap, 100 mm wide |
| Centre line, over 40 mph | Same pattern at every speed | Diagram 1008.1: 3 m mark / 6 m gap, 150 mm wide |
| Lane divider, up to 40 mph | 3 m mark / 6 m gap, becoming 7 m / 2 m near every junction | Diagram 1005: 2 m mark / 7 m gap, 100 mm wide |
| Lane divider, over 40 mph | Same generic pattern | Diagram 1005.1: 2 m mark / 7 m gap, 150 mm wide |
| Signal stop line | 350 mm solid line | 200 mm solid line |
| STOP-controlled junction | Dashed give-way treatment despite the native STOP flag | 400 mm solid line |
| Give-way line | 550 mm marks / 450 mm gaps, 250 mm thick, rows 700 mm apart | 600 mm marks / 300 mm gaps, 200 mm thick, 300 mm clear between rows |
| One-way give-way approach | Only half the carriageway marked | Full approach width, with kerb clearance |

Complete longitudinal marks stay clear of junction ends and follow native road bends. The generator no longer invents longer warning-style lane dashes at every junction. Road widths remain source measurements or explicit estimates; there is no universal council lane width to impose on every existing street.

## Guidance basis and verification status

These are established UK diagram-based rendering presets. Intended references:

- Department for Transport, Traffic Signs Manual, Chapter 5 (road markings): https://www.gov.uk/government/publications/traffic-signs-manual
- Traffic Signs Regulations and General Directions 2016, as amended: https://www.legislation.gov.uk/uksi/2016/362/contents
- Manual for Streets, for street design context: https://www.gov.uk/government/publications/manual-for-streets
- Standards for Highways / DMRB: https://www.standardsforhighways.co.uk/
- Cambridgeshire County Council local highway requirements: https://www.cambridgeshire.gov.uk/

The current official documents could not be retrieved on 22 October 2026: this executor's network proxy returned CONNECT 403 for GOV.UK. A network configuration draft for the official hosts was saved but has not been applied. Therefore this record does **not** claim a fresh review of those documents, current legal compliance, council approval, or a verified real-world marking layout.

National Highways standards primarily address the strategic road network; applying trunk-road dimensions indiscriminately to Cambridge streets would be inappropriate. Site-specific warning lines, double-white systems, crossing zigzags, junction visibility, lateral allocation and local authority departures are outside this correction. They need authoritative source layouts and the relevant current documents, rather than invented geometry.

## Verification

Tests check exact pattern values at the 40 mph boundary, complete marks and gaps, the width of generated mesh strips, no invented 7 m lane dashes, solid STOP versus dashed give-way, and full-width one-way approaches. Both repositories use the same pure marking module and paint geometry implementation.
