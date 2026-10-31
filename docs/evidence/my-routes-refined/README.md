# Refined generator in My routes

The existing My routes panel now builds personal drives with the shared generator's continuous road geometry and marking renderer. The separate 1 km tile tool has been removed. Open My routes, search, place A/B, Generate route, then Save & drive. Previously saved routes are regenerated with the refined renderer on Drive.

Verified locally:
- 257 unit/regression tests passed; preview and production builds passed.
- A >2 km generated route retains road coverage and paint outside the inspector's ±500 m boundary.
- Browser flow saves a recipe, reloads it, then drives with native physics and simulator building assets. It asserts refined marking chunks exist in the live scene.
- Crossing the former 600 m section boundary preserves the network, traffic and test objects with map providers deliberately unavailable after preparation.
- Existing graded/ungraded modes, course lessons, voice mute, quota errors, cancellation, mobile layout and deletion pass.
- Source-mode cockpit and synthetic marking-renderer checks passed during renderer integration; the route browser check also confirms the standalone tool is absent.

`drive.png`, `next-section.png`, `create-desktop.png` and `result.json` come from deterministic provider fixtures with real converter, storage and physics. They are not screenshots of surveyed Cambridge or a mobile performance benchmark. No live-provider success is claimed here. The prototype-only supplementary marking endpoint has been removed. My routes uses the existing base source broker, and its live provider checks remain in CI.

After removing the standalone tool, the current regression suite contains 257 tests (two tests belonged to its removed supplementary endpoint). Source/build and browser verification remain separate from live-provider availability.
