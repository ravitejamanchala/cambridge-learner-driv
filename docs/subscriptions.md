# Learner Drive subscriptions

## Plans
- Free: Highway Code plus `mirror-practice`, `controlled-stop`, `accel-decel`. Guests can practise locally; signed-in learners can sync basic progress.
- Plus: £4.99 GBP/month, recurring until cancelled. Unlocks the remaining course, mock tests and puzzles. Cancellation through the portal takes effect at the paid period end. Past-due/unpaid subscriptions do not grant Plus access.
- Complimentary: Clerk **private metadata** `{"learnerAccess":"full"}` grants full access independently of Stripe. Payment handlers never edit this tag.

The original home layout remains. Eight previously selected starter/parking drills remain hidden. The subscribe offer appears in Learners and when opening paid content.

## URLs
- Web: https://manchala.co.uk/cambridge-learner-driv/
- API: https://learner-drive-api.manchala0024.workers.dev
- Stripe webhook: https://learner-drive-api.manchala0024.workers.dev/billing/webhook
- Public billing availability: API `/billing/config`
- Authenticated status/checkout/portal: `/api/billing`, `/api/billing/checkout`, `/api/billing/portal`
- Stripe sandbox product: https://dashboard.stripe.com/acct_1SqgpnBtAo1tDaNN/test/products/prod_VRplE8WDguSMsP
- Sandbox price: `price_1UQw6HBtAo1tDaNN6U6zBFT9`

## Secure configuration
`server/.env` is ignored by Git and permission 0600. It holds existing Clerk/Neon/Cloudflare values plus:
- `STRIPE_SECRET_KEY`: secret server API key, never a browser key.
- `STRIPE_PRICE_ID`: active GBP 499 minor-unit monthly licensed price.
- `STRIPE_WEBHOOK_SECRET`: endpoint signing secret.
- `STRIPE_PORTAL_CONFIG_ID`: portal configuration allowing payment-method updates, invoice history and cancellation at period end.

Upload these four Stripe variables as Cloudflare Worker secrets. No Stripe key belongs in `auth-config.js`, GitHub Pages, source control or chat. Hosted Checkout does not need a Stripe publishable key in this app.

Current integration uses **Stripe test mode**. The app labels test checkout clearly. Only test cards should be used; live payments are not enabled.

## Going live
Activate the Stripe live account. Create the same £4.99/month product in live mode, a live webhook with the URL/events below, and a live cancellation portal configuration. Replace all four Stripe variables with their live counterparts and upload Worker secrets. Test keys, price IDs, portal configurations, webhook secrets and customers cannot be mixed with live mode. Customer mappings and subscription state are isolated by Stripe test/live mode in the database. Sandbox subscriptions never grant live-mode access; learners subscribe again in live mode.

The setup tool `server/tools/configure-billing.mjs` intentionally configures **test mode only**. It validates the price and stores the webhook/portal values in the local environment file without printing secrets.

## Webhooks and access
Webhook signatures are verified over the raw body using the Stripe SDK. Events trigger retrieval of the current Stripe subscription and paid invoice; event payloads and browser success redirects cannot grant access. Processing is idempotent. Subscription observations use timestamps to prevent older concurrent reads overwriting newer state. Paid access also checks expiry on every authenticated API request. Refresh access/reload rechecks Stripe and updates the browser. Server checks keep premium result writes restricted; static simulator assets remain public and are not DRM.

Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.

## Verification
- `npm test`
- `npm test --prefix server`
- `npm run check --prefix server`
- `npm run build`
- `npm run dry-run --prefix server`
- `CHROMIUM_PATH=<Chrome executable> node tests/access-browser.mjs`
- `PLAYWRIGHT_BROWSERS_PATH=<installed browser folder> TEST_ENGINE=webkit node tests/access-browser.mjs`
- Opt-in real Stripe sandbox check: after server tests compile `.test-build`, set `BILLING_TEST_DATABASE_URL` to an isolated Neon branch and run `node --env-file=.env tools/test-stripe-sandbox.mjs` from `server`. It refuses the production database/live Stripe keys, uses synthetic test customer data, and cancels the test subscription afterward.

Neon migration `0002_billing.sql` and `0003_billing_modes.sql` were tested on branch `br-blue-field-zaudjka3` before production. The isolated branch retains synthetic sandbox verification data for review.
