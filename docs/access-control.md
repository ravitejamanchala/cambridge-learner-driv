# Course access

Course lessons, mock tests and puzzles require a signed-in Clerk account with this **private metadata**:

```json
{"learnerAccess":"full"}
```

In Clerk, select the production application/instance, open **Users**, choose the user, and edit **Private metadata**. Merge this property with any existing metadata. Do not use public or unsafe metadata. Save, then have the learner open **Learners → Refresh access** (or reload/sign in again).

Remove the property to revoke access. The API checks current Clerk private metadata on every protected request; the browser locks again on Refresh access or reload. A currently running local exercise may remain visible until then, but cloud requests are denied immediately. Sign-out locks the browser.

The home layout is preserved. These eight lessons are hidden from the course menu: cockpit-drill, engine-control, automatic-drive, automatic-reverse, steering-control, forward-bay, reverse-bay, leave-bay. Saved history is retained.

Web: https://manchala.co.uk/cambridge-learner-driv/
API: https://learner-drive-api.manchala0024.workers.dev

This gate controls the app UI and authenticated API. The static simulator bundle remains publicly downloadable; it is not DRM for lesson assets.
