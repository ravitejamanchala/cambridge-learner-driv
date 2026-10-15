# Recovery handover — 15 October 2026

## Starting point and scope

Fresh clone of `ravitejamanchala/cambridge-learner-driv`, `v1.1` commit `612a5699ac3c139b33b21def229d181c46db926e`. The old failed cloud environment was not accessed, modified or deleted. Its uncommitted work could not be recovered from GitHub. Neither `server/`, `docs/deployment.md` nor this handover existed in the committed branch. The requested `cloud-environment-onboarding:setup` skill was not installed; the available Neon PostgreSQL skill was used instead.

This rebuild keeps the existing simulator, curriculum, driving physics, mock tests and guest localStorage key. New public auth configuration is deliberately empty until a real API URL is available and deployment is approved.

## Files changed

- `server/package.json`, lockfile, `tsconfig.json`, `wrangler.toml`: independent Node 24 Hono Worker tooling, explicit account ID and Cloudflare rate-limit binding.
- `server/src/app.ts`, `index.ts`, `validation.mjs`: all required endpoints, official Clerk verification, origin controls, request limits, safe errors, validation, pagination and internal user authorization.
- `server/src/schema.ts`, `store.ts`: six-table Drizzle schema and parameterized SQL; atomic progress revisions and session/fault/feedback writes; unique session UUIDs and ownership checks.
- `server/migrations/0001_initial.sql`, `server/tools/migrate.mjs`: versioned standard PostgreSQL DDL and HTTPS migration runner with transaction lock/checksum protection.
- `server/tools/test.mjs`, `verify-live.mjs`, `server/tests/*`: API tests, local signed Clerk token verification, embedded PostgreSQL tests, repeatable live Neon persistence checks.
- `js/cloud-sync.js`, `auth.js`, `profile.js`: official vanilla Clerk SDK UI, account-specific durable outbox, guest consent import, retries, explicit conflict resolution and guest restoration.
- `js/main.js`, `hub.js`, `index.html`: auth initialization, learner-sheet account controls, refresh after account changes, prevention of recording a drive/quiz into a learner selected after it began, escaped history score output.
- `auth-config.js`, `tools/configure-auth.mjs`, `tools/build_demo.mjs`: public-only configuration and inclusion in the existing frontend build.
- `.gitignore`, `.env.example`, `.github/workflows/verify.yml`: secret exclusion, variable names only, recovery/PR CI without deployment.
- `tests/cloud-sync.test.mjs`, `tests/profile.test.mjs`: outbox restart/retry, account isolation, conflicting revision resolution, concurrent saves and guest preservation.

## Verification in this workspace

| Check | Result | Scope |
| --- | --- | --- |
| Existing simulator tests | 45 passed before integration | Local logic/assets |
| Simulator + sync/profile regression tests | 50 passed | Local; includes five added regression tests |
| API/Clerk/PostgreSQL suite | 11 passed | API dependencies mocked; Clerk verifier uses real signatures with local fixture keys; database tests use embedded PostgreSQL (PGlite) |
| TypeScript `tsc --noEmit` | Passed | Static server check |
| Frontend build | Passed | Existing esbuild pipeline, auth config copied |
| Wrangler deployment dry run | Passed | Bundle and config validation only; no Cloudflare authentication or deployment |
| Server dependency audit | Zero known vulnerabilities | Drizzle upgraded to fixed 0.45.4; current Clerk backend 3.x |
| Neon project lookup | Passed | Live connected provider; correct project, organization and production branch confirmed |
| Neon HTTPS `SELECT 1` | Passed | Live, not mocked |
| Application migration | Applied successfully | Live specified Neon production branch, direct endpoint; no TLS weakening |
| Neon progress/session persistence | Passed | Live insert/read/update; stale revision rejection; duplicate session retry; history, fault and feedback rows; fixture removed |
| Existing browser simulator regression | Blocked | Chrome launch aborted with SIGABRT / sandbox EPERM before page tests ran |
| Google/email sign-in, avatar, account UI | Not verified | No Clerk configuration in this environment; real browser login not performed |
| Cloudflare live authentication/Worker deployment | Not performed | No Cloudflare token in environment; production deployment requires explicit approval |

The initially retrieved Neon connection was pooled; the migration runner correctly rejected it. Configuring the direct counterpart resolved that failure. Unlike the historical cloud workspace, this desktop environment could connect to Neon over HTTPS. Node proxy support remains enabled for scripts; no assumption is made that DNS failure implies an allowlist failure.

Wrangler initially failed writing `~/Library/Preferences/.wrangler`. Setting `XDG_CONFIG_HOME=/tmp/learner-wrangler-config` resolved the filesystem issue while keeping `WRANGLER_LOG_PATH=/tmp/wrangler-setup.log`.

## Configuration presence and remaining work

At start, none of the seven listed variables were present in the shell. The connected Neon provider supplied a connection string securely; ignored `server/.env` now contains pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED`, with restrictive file permissions. `FRONTEND_URL` is configured in Wrangler as `https://manchala.co.uk`. No secret values have been logged or committed. Clerk public/secret keys and the Cloudflare token remain unavailable. `API_BASE_URL` cannot be set to an actual deployed URL until the Worker is deployed after approval.

The production release is blocked on deployment approval and secure provider configuration. Do not repeat OAuth loops or ask for credentials in chat. Use the existing account/secret configuration mechanism. Follow `docs/deployment.md` for the exact release order and live browser acceptance checks. The auth UI has been implemented but must not be described as working Google/email login before those checks pass.

Known limits: progress conflicts require an explicit device/cloud choice, the learner sheet shows the latest five reports from a 50-record snapshot, full history is available through the paginated API, and the Cloudflare limiter is per-location. Offline persistence depends on browser storage availability. No AI provider is configured; stored coaching is the existing deterministic report.

## Delivery

Recovery branch: `recovery/cloud-auth-2026-10-15`. No force push and no changes to `v1.1`, `main` or `gh-pages`. Remote CI inspection found the dynamic Pages deployment workflow; recent runs use `gh-pages`. The new recovery CI only runs tests, static checks, build and Worker dry run. It never deploys or applies migrations. See the GitHub branch for the committed source and the chat delivery message for final commit/push status.
