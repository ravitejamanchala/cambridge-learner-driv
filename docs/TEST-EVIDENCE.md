
### 2026-10-22: imported building clearance

Editor-track imports use authored scenery only. Runtime clearance excludes building footprints intersecting native carriageways while preserving the original saved JSON. Geometry tests cover crossing roads, rotated buildings, courtyards, elevated structures and immutable source data. The three-import browser regression checks distinct worlds and the historical Cambridge export's remaining authored buildings. A local cross-repository 30 km generated admin export passed learner validation with route length 30,000 m; this is synthetic test evidence, not live OSM coverage.

Local three-import browser test passed: each distinct JSON drives its own world; historical Cambridge export remains unchanged in storage/download and renders 12 authored buildings after overlap exclusions. Both production and Pages builds passed.
