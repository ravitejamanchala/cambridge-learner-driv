# Cockpit and billing review

This branch combines the latest `main` lesson/assessment logic with the existing
`development/mapped-scenery` import and world-rendering changes, and adds an
original SlayDrive interior. The Roadarium screenshot is a visual reference;
no Roadarium code, textures, dashboards or captured private data are included.

## Try the driving view

The feature branch publishes an isolated review build at
`https://cockpit-review.learner-drive-app.pages.dev/`. Once a same-repository PR
is opened, the PR workflow also publishes `https://pr-<number>.learner-drive-app.pages.dev/`
and comments with the link. These URLs are usable after their workflow succeeds.
The production deployment workflow still triggers only from `main` or a manual run.

1. Open the preview and enter a local learner name if prompted.
2. Open **Mock tests**, choose **East Road and Elizabeth Way**, and start.
3. Choose **Driver view** in settings, or press **C** to cycle cameras.
4. Drive with the arrow keys or WASD. **Q/E** signal, **B** checks the interior
   mirror, and holding **Z/X** checks mirrors then the blind spot.

The learner preview has the normal course and built-in mock tests. JSON upload,
local revision editing and experimental import samples belong to the dedicated
testing build (`--pages-preview`) and local editor server, not this learner flow.

The physical dashboard displays actual speed, selected automatic gear or driving
direction, known speed limit, temporary motorway restrictions, turn instructions,
route progress, indicators, lights and enabled vehicle-control warnings. It does
not invent engine RPM or add a manual gearbox. The original simulator physics,
assessment and lesson controls remain authoritative.

Desktop driver view uses the dashboard for navigation and speed. Touch/portrait
layouts retain the existing HUD. The rear and door mirrors render the real scene.
Static interior trim is combined by material; screens refresh at 10 Hz, or 4 Hz
in low-power mode, and stop updating when hidden. Low-power mirrors use smaller
render targets and fewer updates. Car selection still adjusts seat height,
interior width and bonnet colour. The dashboard map reads the same pink route and
map colour palette as the chase-view map. The larger rear-view mirror faces the
driver's eye and fits within narrow viewports. Both views render the same world,
route and vehicle.

## Two separate previews

| Build | Purpose | Accounts/payments |
| --- | --- | --- |
| `--preview` | Learner UI, cockpit, lessons and built-in mocks | Guest, all content open; no JSON authoring or production account sync |
| `--pages-preview` | Dedicated JSON testing page | Browser-local imports/revisions; no account service |
| `--billing-preview` | Clerk/Stripe integration review | Development Clerk + isolated Neon + Stripe test mode; no guest entitlement bypass |
| Default production build | `app.slaydrive.com`, after merge/release approval | Existing production configuration and access policy |

The visual preview cannot verify payment access. Its open course is deliberate.
The billing preview refuses live Stripe/Clerk keys and production/arbitrary origins.
Checkout and portal return URLs come from the server's configured origin. A forged
`?subscription=success` cannot unlock access; the browser rechecks the server a
bounded number of times while a real webhook is pending. Signed webhooks must
match test/live mode and reconcile current Stripe state rather than trust a
possibly stale event payload.

## Configure the optional billing sandbox

In this repository's GitHub **cloudflare** environment, configure the following
securely. Do not paste secret values into chat, commits or frontend files.

| Name | GitHub type | Required value |
| --- | --- | --- |
| `CLOUD_FLAIR_API_TOKEN` | Secret, existing | Pages and Worker deployment permissions |
| `CLOUD_FLAIR_ID` | Secret, existing | Existing Cloudflare account ID |
| `PREVIEW_DATABASE_URL` | Secret | Pooled URL of a separate Neon branch with the existing schema |
| `PREVIEW_DATABASE_HOST` | Variable | Exact hostname of that isolated branch; a `-pooler` suffix is normalized |
| `PRODUCTION_DATABASE_HOST` | Variable, recommended | Production hostname, explicitly rejected by the sandbox tool |
| `PREVIEW_CLERK_SECRET_KEY` | Secret | `sk_test_…` for a Clerk development instance |
| `PREVIEW_CLERK_PUBLISHABLE_KEY` | Variable | Matching `pk_test_…` public key |
| `PREVIEW_STRIPE_SECRET_KEY` | Secret | `sk_test_…` for the Stripe sandbox |
| `PREVIEW_STRIPE_PRICE_ID` | Variable | Active, licensed GBP £4.99 monthly test price |

Use [server/.env.preview.example](../server/.env.preview.example) as a naming
reference. No schema migration is introduced by the cockpit/billing changes.
Prepare a **separate** database branch and apply the existing migrations using
`server/tools/migrate.mjs` with that branch's direct connection string. The preview
workflow checks schema readiness and never migrates a database automatically.
Use synthetic users, not a copy of personal learner records, for testing.

Allow the exact preview frontend origin in the Clerk development application.
The branch review origin is `https://cockpit-review-billing.learner-drive-app.pages.dev`;
each PR uses `https://pr-<number>-billing.learner-drive-app.pages.dev`.

When all values exist, the workflow:

1. Deploys only `learner-drive-<alias>-billing` with the isolated origin.
2. Creates a Stripe **test** webhook and a cancellation portal configuration.
3. Uploads Worker secrets without logging their values.
4. Checks database readiness and test-mode billing configuration.
5. Exercises real Stripe sandbox checkout, a test subscription/payment, duplicate
   subscription prevention, portal, cancellation and revocation. It sends signed
   webhook requests, duplicate events and an invalid signature to the preview Worker.
6. Publishes the separate authenticated billing frontend.

If values are missing, the visual preview still publishes and the workflow records
the missing **names** in `billing-preview.json`. If configured integration fails,
the workflow fails and uploads diagnostics. Sandbox verification leaves labelled
synthetic customer/database records for inspection and cancels its subscription.
It does not make a live charge. Remove obsolete PR Workers/webhooks/Pages branches
after review; the workflow deliberately does not delete environments automatically.

For browser verification, sign in with a test Clerk account, check free/locked
content, subscribe using a Stripe test card, return to the app, verify server-granted
access, open **Manage subscription**, and check cancellation/revocation. Google
OAuth, email delivery and a real user Checkout completion require that configured
test account; fixture tests do not establish these provider behaviors.

## Production release

Opening the PR or pushing this branch does not deploy production. Merging into
`main` triggers the existing production **frontend** deployment. The production
Worker requires a separately approved manual deployment with `deploy_worker`.
There is no DNS change in this branch.

Before approving production, review the preview and test account/payment flow.
Keep the existing Clerk production instance, database and learner identities.
For real charges, activate the Stripe live account and install matching live
secret key, approved £4.99 price, signed webhook secret and portal configuration
in the production Worker. Verify `FRONTEND_URL=https://app.slaydrive.com`, the
matching production Clerk public key and production API URL. Existing database
test/live billing namespaces prevent sandbox subscriptions granting live access.
Live keys and domain cut-over are an explicit release step, not part of this push.

## Local verification

Use Node 24+, `npm ci`, and `npm ci --prefix server`. Chromium is needed for the
browser tests. `CHROMIUM_PATH` can point at an existing browser; CI uses Playwright's
installed Chromium.

```sh
npm test
npm test --prefix server
npm run check --prefix server
npm run build
node tools/build_demo.mjs . dist-review --preview
CHROMIUM_PATH=/usr/bin/chromium node tests/cockpit-browser.mjs
CHROMIUM_PATH=/usr/bin/chromium TEST_DPR=.35 TEST_LOW_POWER=1 node tests/drive-features-browser.mjs
CHROMIUM_PATH=/usr/bin/chromium node tests/experimental-practice-browser.mjs
CHROMIUM_PATH=/usr/bin/chromium node tests/local-tracks-browser.mjs
```

The cockpit test writes desktop/phone screenshots and a bounded render sample to
`test-results/`. Software WebGL timings describe the headless test environment;
they are not a mobile or hardware GPU frame-rate claim. The preview workflow
uploads these as `cockpit-preview-evidence`. It also writes a safe deployment
receipt to `deployment/<alias>-status` for review when GitHub API access is unavailable.
