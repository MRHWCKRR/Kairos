# Kairos on Cloudflare

## Production cutover completed — 10 October 2026

The owner approved the production cutover after confirming the protected preview worked. Kairos is now published at **https://kairos-web.kirosapp.workers.dev**. The Vercel-owned hostname cannot be transferred to Cloudflare, so the owner selected this free address. Existing users will need to sign in on the new origin.

All seven production bindings are configured and verified as secrets on Worker `kairos-web`. The exact production hostname was appended to Firebase Authentication and the existing reCAPTCHA allowlists without changing prior domains or protection settings. Live checks passed for the app/login/signup assets, excluded backend/secret paths, anonymous admin rejection, AI completion and authenticated Firebase cleanup (zero expired events). Production version: `882a7e64-02d9-45a9-b05e-9ea02fb0a51a`. The Cloudflare daily schedule is `0 3 * * *` UTC, or 13:00 Brisbane. Vercel's duplicate schedule was disabled and verified; the protected preview has no schedule. The first automatic scheduled execution has not yet been observed.

Vercel Git deployments are disabled in `vercel.json` so future commits no longer trigger the old host. The old deployment remains available for rollback: `dpl_GKYLDFmhDiCXmCjEX642ifzXFzKp`, https://kairos-3ucvm3r5t-mrhwckrrs-projects.vercel.app, with alias https://kairos-xi-two.vercel.app. Rollback requires restoring Vercel cleanup and disabling Cloudflare cleanup; re-enable Git deployments if Vercel becomes the active host again.

Cloudflare deployment currently uses Wrangler. Automatic Cloudflare Builds repository integration is still pending. The notes below retain preparation history and operating instructions; statements about pre-cutover status describe earlier checkpoints.

This branch prepares Workers with Static Assets as a replacement for Vercel. Firebase Auth, Firestore, App Check, the waitlist, and the browser app stay on their existing services. The old `kairos` relay Worker is separate; do not overwrite it. Vercel remains the production host until the owner reviews the preview and approves the domain cutover.

Verified preparation on 10 October 2026: [draft PR #30](https://github.com/MRHWCKRR/Kairos/pull/30), [isolated preview](https://kairos-web-preview.kirosapp.workers.dev), 141 passing tests, 18 passing live HTTP checks, and successful GitHub build checks. The deployed preview has only the ASSETS binding and zero cron schedules. A fresh read-only reviewer found no blocking defects. Authenticated features remain pending secure configuration and live acceptance. Initial preview publication used Wrangler; automatic Cloudflare Builds repository integration is still pending.

Follow-up on 10 October 2026: Firebase owner login completed. Confirmed the existing `(default)` Standard database in `australia-southeast1`, the matching registered web app, enabled email/password and Google sign-in, and matching reCAPTCHA Enterprise App Check registration. Both analytics REST queries were accepted read-only with a one-result limit; no document contents were retained. With explicit owner approval, added only `kairos-web-preview.kirosapp.workers.dev` to Firebase Authentication and the existing reCAPTCHA key's allowed domains, then verified the additions and preservation of existing settings. Authentication App Check remains enforced; Firestore and OAuth App Check retain their existing unenforced state. No backend credentials have been transferred and no live user login/save/delete or AI acceptance has been claimed.

## Build and verify

Additional acceptance on 10 October 2026: the owner supplied a valid service-account JSON through a local file. Its RSA key, project and service identity were validated before import into ignored `.dev.vars.preview`. Firebase OAuth and both bounded analytics reads succeeded; the configured admin exists. In the real local Workers runtime, Firebase reads, anonymous/invalid-token admin rejection, bot tracking exclusion and an AI completion passed. No database writes or deletions were performed.

With explicit owner approval, enabled Zero Trust and email-code login, then configured the `Kairos migration preview` Access application to protect only Worker `kairos-web-preview`, including its version URLs. Its sole Allow rule matches the owner's connected email. Anonymous requests to the app and every API route redirect to Access login. Uploaded all seven backend settings with explicit owner approval and verified their `secret_text` bindings on deployed version `b96e3e64-7d5d-44c5-aaf5-94354acc46a8`; preview still has no cron schedules. An unintended CLI-created draft with a duplicated environment suffix had no public routes or references and was removed. Hosted authenticated backend acceptance remains pending owner login. Production remains on Vercel.

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

The owner account, existing Standard `(default)` database, browser app identity, service-account key access and required query compatibility are now verified. Preview runtime bindings are configured behind owner-only Access. Authorised hosted backend responses still require verification before backend acceptance.

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
