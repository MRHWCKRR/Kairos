# Kairos on Cloudflare

This branch prepares Workers with Static Assets as a replacement for Vercel. Firebase Auth, Firestore, App Check, the waitlist, and the browser app stay on their existing services. The old `kairos` relay Worker is separate; do not overwrite it. Vercel remains the production host until the owner reviews the preview and approves the domain cutover.

## Build and verify

Use Node 22 or newer and install the lockfile with `npm ci`.

```sh
npm run build:cloudflare
npm run test:runtime
npm test
npx wrangler deploy --dry-run --env preview
npm run dev:cloudflare
```

The build writes only explicitly listed browser assets to `dist/`, applies the existing Schedule/relay/tracker transforms, and leaves source unchanged. `/` serves `index.html`; existing `.html` URLs are preserved. Unknown pages return 404. `/api/*` executes the Worker. Private analytics assets and API responses use no-store caching. Add new browser files to `cloudflare/public-assets.json` deliberately.

The runtime test uses a temporary configuration without runtime secrets, starts local workerd, checks real HTTP responses, and closes the test processes. CI verifies both hosting builds and never deploys.

## Runtime configuration

All seven values below belong in runtime bindings, never browser code or Git. Preview bindings are independent of production. `.dev.vars.example` has empty placeholders; copy it to ignored `.dev.vars.preview` for local use. Preserve PEM newlines or use literal `\n` escapes in `FIREBASE_PRIVATE_KEY`.

| Binding | Purpose |
| --- | --- |
| FIREBASE_PROJECT_ID | Existing project `kairos-1a` for production; a separate test project is preferable for preview writes |
| FIREBASE_CLIENT_EMAIL | Service-account identity allowed to access analytics in that project |
| FIREBASE_PRIVATE_KEY | Service-account signing key |
| ANALYTICS_HASH_SECRET | Random secret for rotating daily visitor hashes; preserve production value for consistent daily counting |
| ANALYTICS_ADMIN_UID | Exact Firebase Auth UID allowed to view/delete analytics |
| CRON_SECRET | Random secret for authenticated HTTP cleanup |
| KAIROS_RELAY_SECRET | Existing Hack Club AI upstream key |

Use the Cloudflare dashboard's secret bindings or interactive CLI prompts, for example:

```sh
npx wrangler secret put FIREBASE_PRIVATE_KEY --env preview
```

Repeat for the other bindings. Do not put secret values into shell arguments, PRs, logs, or chat. The service account uses the datastore OAuth scope; server access uses IAM, so browser Firestore rules must continue to deny public analytics access. This implementation restricts its own REST operations to `kairosAnalytics`; IAM still controls the account's actual privileges.

Before live Firebase requests, authenticate to Firebase, confirm the existing database edition and `(default)` database, check service-account access and required query indexes, and verify the existing browser configuration still points to `kairos-1a`. The account and edition could not be verified through the unauthenticated Firebase connector during preparation.

## Preview deployment

```sh
npm run deploy:cloudflare
```

This intentionally deploys `kairos-web-preview`, with no cron and no custom-domain routes. A preview without secrets serves the app shell, rejects private analytics/cleanup, and returns 503 from AI. It does not prove authenticated features work. Configure test credentials before conducting write/delete tests; do not clear production analytics while testing the dashboard's Delete action.

Add the exact preview hostname to Firebase Authentication authorised domains and the existing reCAPTCHA site's allowed domains, then check App Check tokens and enforcement. Keep enforcement, email verification, and Firestore protections enabled. New domains can affect persisted browser sessions; use fresh test accounts and check login, signup, verification, logout, password reset, account deletion, and reload persistence.

Check AI planning/chat, tracking with a bot and normal browser, private analytics rejection for a non-admin and success for the configured admin, and all media and Schedule views. Test scheduled cleanup with expired and fresh fixture events in a test database; only expired records may disappear. Interrupted cleanup must fail visibly and be resumable. Run the existing Vercel path against fixtures as well before calling rollback validated against live services.

The public AI relay preserves the existing behaviour and currently has no explicit per-user authentication or rate limit. This migration does not add either. Leave the preview without an upstream key or protect it with Cloudflare Access before providing a key. Production abuse controls and provider usage monitoring need a separate deliberate change.

## Owner-reviewed cutover

1. Complete the preview checks above and review the PR. Save the last working Vercel deployment and current DNS values.
2. Configure all seven production bindings for `kairos-web` separately (omit `--env preview` when setting production secrets). Use the existing production Firebase project and admin UID.
3. Deploy production deliberately with `npm run build:cloudflare` then `npx wrangler deploy`. This enables `0 3 * * *` UTC (13:00 Brisbane). Do this only after the owner approves production deployment. Preview never runs that schedule.
4. Add the owner-approved custom domain in Cloudflare, check Firebase/reCAPTCHA domain authorisation, and verify HTTPS, login, AI, tracking, admin access, and protected cleanup at the final hostname.
5. Check scheduled execution outcomes and Firestore usage, then disable the Vercel cron after Cloudflare cleanup is verified. Avoid keeping two production cleanup schedules active indefinitely.

The HTTP cleanup route still requires `CRON_SECRET`. Cloudflare's scheduled handler invokes cleanup internally without an HTTP secret and reports unsuccessful runs. Both paths delete batches of at most 400 expired events; preview has no automatic deletes.

Cloudflare hosting does not remove Firebase read/write/storage quotas or upstream AI limits. Compare actual Workers execution, Firestore and provider usage before estimating scaling costs; free service does not imply unlimited usage. The analytics dashboard reads at most 10,000 events per load and signals truncation.

## Rollback

Restore the saved Vercel DNS/domain routing and working deployment. The original `npm run build`, `vercel.json`, thin `api/*.js` wrappers and Firebase Admin integration remain available. Confirm all original Vercel environment variables exist, restore its cron if disabled, and disable the Cloudflare production cron to prevent duplicate cleanup. Firebase data stays in place, so there is no database import to reverse. A domain switch can require users to sign in again because browser storage is scoped to the origin.

## Verification limits

Node tests cover signed Firebase tokens, REST request/response contracts, credential isolation, cleanup batches, request limits and asset safety. Local workerd tests prove actual routing and rejected anonymous API responses. These checks do not replace live service-account, authorised-domain, App Check, AI-provider, cron and owner-admin acceptance tests. Production traffic must remain on Vercel until those pass and the owner approves cutover.
