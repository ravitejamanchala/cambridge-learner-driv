# Authentication and API deployment

## Hosting on Cloudflare Pages (app.slaydrive.com)

The simulator deploys the same way as the SlayDrive marketing site. `.github/workflows/deploy.yml` runs on every push to `main`: install, root and Worker tests, type check, build, then `wrangler pages deploy dist` to the Cloudflare Pages project `learner-drive-app`. Failed tests stop the deploy.

GitHub environment `cloudflare` (Settings > Environments):

| Name | Kind | Value |
| --- | --- | --- |
| `CLOUD_FLAIR_API_TOKEN` | secret | Token with Cloudflare Pages: Edit and Workers Scripts: Edit on account `eab4a0a8ec80610eb37fc56768e971dc` |
| `CLOUD_FLAIR_ID` | secret | `eab4a0a8ec80610eb37fc56768e971dc` |
| `CLERK_PUBLISHABLE_KEY` | variable | Public production key for the slaydrive.com Clerk domain |
| `API_BASE_URL` | variable | `https://learner-drive-api.manchala0024.workers.dev` |

If the two variables are unset, the committed `auth-config.js` is deployed unchanged. The Worker is deployed only when the workflow is run manually with **Deploy API Worker** ticked; its secrets stay in Cloudflare and are not touched.

Cut-over order (sign-in is unavailable between steps 3 and 5, so do them together):

1. Add the secrets, merge to `main`, confirm the first Pages deploy, then add custom domain `app.slaydrive.com` to the Pages project.
2. Check the app loads on `https://app.slaydrive.com/` as a guest.
3. In Clerk, change the production domain to `slaydrive.com`, add the DNS records Clerk lists in Cloudflare DNS, update the Google OAuth redirect URI, and copy the new publishable key.
4. Set `CLERK_PUBLISHABLE_KEY` as the environment variable above.
5. Run the workflow manually with **Deploy API Worker** ticked. This redeploys the app with the new key and switches the Worker's `FRONTEND_URL` to `https://app.slaydrive.com`.
6. Replace the `gh-pages` branch contents with `tools/gh-pages-redirect/` so the old address forwards to the new one, then test sign-in, Google sign-in, subscribe, manage subscription and cancel on the new domain.

The Stripe webhook stays at the Worker URL and needs no change.

## Pull request previews

Every pull request from a branch in this repository is built and deployed by
`.github/workflows/preview.yml` to its own Cloudflare Pages branch deployment:

    https://pr-<number>.learner-drive-app.pages.dev/

The link is posted as a comment on the pull request and updated on every push. Branch deployments never
touch production — the project's production branch is `main`, which only `deploy.yml` deploys.

A preview is built with `node tools/build_demo.mjs . dist --preview`. It writes
`window.LEARNER_CONFIG = {"PREVIEW":true}` instead of the committed account configuration, because the
production sign-in key is bound to the production domain and would leave a preview stuck at the sign-in
gate. The preview runs as a guest with the whole course open, syncs nothing, and shows a small
"Preview build · <commit>" label in the lobby (never while driving). `tests/preview-build.test.mjs`
checks that a production build never carries the flag or the label.

**Do not publish previews to GitHub Pages.** The local-mock sandbox (`development/local-mock-library`)
publishes there and replaces the whole tree each time, so anything else put there is wiped.

## Merging a stack of pull requests

When several pull requests build on each other, each is opened against the branch below it, so its diff
shows only its own change and its preview shows everything up to and including it. Merge from the
bottom up: once the lowest one is merged into `main`, change the next one's base to `main` (GitHub does
this automatically if the merged branch is deleted) and merge that. Each merge to `main` is a production
deploy, so check the preview first.

## Original GitHub Pages notes

The simulator remains vanilla JavaScript on GitHub Pages. The independent Hono Worker in `server/` uses Clerk session tokens and Neon PostgreSQL through Drizzle and the Neon HTTPS driver. No React/Next.js is introduced. This recovery branch does not deploy either service.

## Configuration and prerequisites

Use Node.js 24+ and `npm ci` in the repository root, then `npm ci --prefix server`. Root and server lockfiles are committed. `server/.env`, `.dev.vars`, `.env.*`, `.wrangler/` and build output are ignored. Never put server credentials in `auth-config.js`, browser code, GitHub Pages, logs or commits.

| Variable | Consumer |
| --- | --- |
| `CLERK_PUBLISHABLE_KEY` | Public frontend configuration generator |
| `CLERK_SECRET_KEY` | Worker secret; Clerk production instance matching public key |
| `CLOUDFLARE_API_TOKEN` | Deployment shell only; account-scoped Worker edit permissions |
| `DATABASE_URL` | Worker secret, pooled Neon endpoint |
| `DATABASE_URL_UNPOOLED` | Migration shell only, direct Neon endpoint |
| `FRONTEND_URL` | Worker variable, exactly `https://app.slaydrive.com` |
| `API_BASE_URL` | Public frontend configuration, actual deployed Worker URL |

The explicitly configured Cloudflare account is `eab4a0a8ec80610eb37fc56768e971dc`, Worker `learner-drive-api`. Neon project is `tiny-voice-54838966`, organization `org-bitter-river-15275983`, production branch `br-long-darkness-zacav6fi`.

Supply credentials using secure local environment configuration or a secret manager. Do not paste them into chat. The connected Neon account can retrieve connection strings without an OAuth loop. Clerk and Cloudflare credentials from the previous cloud workspace were not available in this fresh desktop workspace.

## Verify and migrate

```sh
npm test
npm test --prefix server
npm run check --prefix server
npm run build
cd server
WRANGLER_LOG_PATH=/tmp/wrangler-setup.log \
  XDG_CONFIG_HOME=/tmp/learner-wrangler-config WRANGLER_SEND_METRICS=false \
  npm run dry-run
node --use-env-proxy --env-file=.env tools/migrate.mjs
node --use-env-proxy --env-file=.env tools/verify-live.mjs
```

The migration runner uses a direct connection and Neon HTTPS queries. It executes all versioned SQL in one PostgreSQL `DO` statement/transaction: transaction-scoped advisory lock, migration table, checksum validation and application. A failure rolls back all changes. Do not add `BEGIN/COMMIT/ROLLBACK` to migration files or edit previously applied files. Add a new numbered migration instead. Test future migrations on an isolated Neon branch first. Node `--use-env-proxy` honors the configured HTTPS proxy; TLS verification remains enabled. The direct endpoint cannot contain `-pooler`.

`verify-live.mjs` creates one UUID-named fixture user, verifies persistence and retry behavior, then deletes that fixture and its dependent rows in `finally`. It never deletes real application users. Do not interrupt it during cleanup; if interrupted, inspect only users whose Clerk identifier starts with `recovery-verification:`.

## Production release — explicit user approval required

Before executing these steps, obtain approval for the reviewed recovery commit and restore deployment credentials through secure configuration. The schema has already been applied to the specified Neon production database as authorized; no Worker or Pages release has occurred.

1. Enable Google and email authentication in the matching Clerk instance. Configure `https://manchala.co.uk` as the production application origin and the Pages path as a valid post-login destination. Verify Google OAuth provider settings and email delivery in Clerk; these have not been browser-tested here.
2. From `server/`, set `CLERK_SECRET_KEY` and pooled `DATABASE_URL` with `wrangler secret put` or your deployment secret manager. Wrangler uses `CLOUDFLARE_API_TOKEN`; retain the explicit `account_id` in `wrangler.toml`. Keep `WRANGLER_LOG_PATH=/tmp/wrangler-setup.log` and a writable `XDG_CONFIG_HOME` where needed.
3. After approval, run `wrangler deploy`. Capture the actual URL reported by Cloudflare; do not guess it from the account ID. Verify `/health` and `/health/ready` return 200. An unauthenticated `/api/me` must return 401; an authenticated token must return the internal UUID.
4. Set public `CLERK_PUBLISHABLE_KEY` and actual `API_BASE_URL` in the shell, run `node tools/configure-auth.mjs` from the repository root, then `npm run build`. Only public values enter `auth-config.js`. With empty config, the simulator remains guest-only and does not load Clerk.
5. Review and publish `dist/` through the existing `gh-pages` process after approval. Do not push recovery source files to `gh-pages` by accident.
6. In a real browser on `https://manchala.co.uk/cambridge-learner-driv/`, verify email and Google sign-in, avatar/account management, sign-out, consent-based guest import, reload persistence, completion of lessons and mock tests, offline/reconnect retry, two-device revision conflict choices, two-account isolation, and duplicate session retries. Check cloud history through paginated `/api/sessions` and verify foreign-user session IDs return 404.

The only existing deployment workflow found on GitHub was dynamic `pages-build-deployment`, with recent runs on `gh-pages`. Neither `v1.1` nor `main` contained checked-in workflows. The added recovery CI workflow only tests/builds and performs a dry run; it contains no credentials, migrations or deployment command. The recovery branch avoids `gh-pages`.

## API and operational behavior

`GET /health` is liveness; `GET /health/ready` checks configuration and all six database relations. All `/api/*` handlers require a verified Clerk bearer session, including `sid` and authorized party matching the frontend origin. Internal UUID ownership is derived server-side; clients cannot choose a user ID.

`GET /api/me`; `GET/POST /api/progress`; `GET/POST /api/sessions`; `GET /api/sessions/:id` are implemented. Progress writes carry `{revision, profile}`; stale revisions return 409. Session creation carries a UUID `id`, ISO `startedAt`, bounded duration, kind, data, faults and optional feedback. Same-user identical retries return 200, first insert 201, inconsistent IDs return 409. Detail queries conceal other users' records with 404. Pagination accepts `limit` (1–100) and `offset` and returns `nextOffset`.

CORS permits only the exact frontend origin. Requests use bearer headers, not cookies. A Cloudflare rate-limit binding enforces 120 requests/minute per IP and per verified user; platform limits are local to Cloudflare locations, not an exact globally synchronized quota. Body size is limited to 256 KiB. Zod validates request shape and bounds. Errors contain safe codes and do not include SQL, tokens, configuration or provider internals. Responses disable caching.

Cloud outboxes and cached profiles are stored per Clerk user. Tokens are never persisted. Sign-out restores untouched guest storage. A drive/quiz begun under another learner is not recorded into the new learner after account switching. Revision conflicts pause progress upload until the user chooses the device or cloud copy; there is no automatic destructive merge. First-login import is an explicit button and confirmation; it copies the selected guest learner and retains the guest original. Background retry runs every 30 seconds and on reconnect. History snapshots keep the existing 50-entry limit, while server session records persist and are paginated by the API.

The `ai_feedback` table currently stores the simulator's deterministic evidence-based coaching report. No external AI service or generated advice is added. Browser quotas/private mode can prevent durable localStorage writes; the outbox warns and retains in-memory state while the page remains open.
