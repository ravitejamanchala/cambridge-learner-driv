# Cockpit review verification — 29 October 2026

Local checks ran on the integrated feature branch in Chromium with SwiftShader
software WebGL. Clerk, account and Stripe data in local UI/API tests are fixtures;
their pass results do not establish live provider readiness.

| Check | Result |
| --- | --- |
| Frontend unit suite | 227 passed |
| Worker unit/integration suite | 23 passed; includes local PostgreSQL, Clerk cryptographic checks and Stripe signature checks |
| Worker TypeScript check | Passed |
| Production frontend build | Passed; production account configuration retained and no preview entitlement bypass |
| Visual and billing preview build checks | Passed; isolated test configuration, production/live-key rejection |
| Production and sandbox Worker dry runs | Passed; bundle only, no remote deployment |
| Existing lesson browser regression (`tests/browser.mjs`) | Passed: lesson prerequisites, vehicle controls, forward/reverse, lesson completion/history and map-load errors |
| Cockpit browser check | Passed: speed matches actual physics (14 mph after acceleration), steering follows input, route/instrument readings, hidden-screen update suspension, desktop and phone layouts |
| Drive-feature browser regression | Passed: mirror/shoulder head turns, steering wheel, chase/cockpit mirrors within viewport, emergency approach/pass and responsive HUD/coaching |
| Desktop + Android access browser checks | Passed: free lessons, paid gates, checkout redirect, server-confirmed unlock, revocation; forged success URL does not unlock access |
| Experimental practice browser check | Passed: actual vehicle moved 16 m, physical building collision stops car, zero grading/faults/timed assessment/results, reset and return to normal assessment |
| Local track browser check | Passed: import, select/drive, reload, edit as new revision, invalid JSON preserves saved revisions |
| Three-import Pages build regression | Passed: three JSONs select/drive/export different worlds; actual admin export preserves its 95 m route and 12 retained OSM buildings |
| Junction repair tests | Passed: raw signal/marking indices stay aligned during import repair despite main's newer marking normalization |

The resize tests now wait for the camera's projection to match the viewport
before selecting Driver view. A fixed wait had captured a cleared canvas or the
automatic portrait camera transition, producing misleading failures. The new
test also checks the rear mirror's projected corners and actual Driver-view state.

Screenshots are written to `test-results/cockpit-desktop.png`, `cockpit-844.png`
and `cockpit-390.png`. The hosted preview workflow uploads fresh screenshots,
render counters and sandbox configuration status as `cockpit-preview-evidence`.
Its `deployment/cockpit-review-status` branch (or `deployment/pr-<number>-status`)
records the exact deployed revision and hosted smoke result.

The local desktop sample used a 1600×1000 viewport at DPR 0.75. It recorded roughly
314 main-view draw calls, 285k triangles and 33 textures on the default East Road
world. Software rendering took approximately one second per sampled frame in this
cloud workspace; this is not a claim of acceptable real-device frame rate. Static
cockpit geometry is batched by material, dashboard refreshes are throttled and
low-power mode reduces mirror work. Hardware GPU/mobile performance still needs
review on the target devices.

Live Stripe checkout, Clerk sign-in/email/OAuth and database access require the
isolated sandbox settings described in [COCKPIT-AND-BILLING-REVIEW.md](COCKPIT-AND-BILLING-REVIEW.md).
The workflow reports missing settings without logging their values. No live charge,
production database write, production Worker release or DNS change was performed
by these local checks.
