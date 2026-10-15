# Kairos Cloudflare migration design

Date: 10 October 2026  
Repository: MRHWCKRR/Kairos  
Inspected baseline: 91de02b (main)

## Outcome

Move Kairos's website and server endpoints from Vercel to Cloudflare Workers with Static Assets. Remove the current Vercel deployment bottleneck and avoid requiring Vercel Pro for commercial hosting. Preserve Firebase accounts, email verification, account deletion, App Check, planner data, persistent chats, and private analytics.

Preparation is authorised. Production domain cutover happens only after a Cloudflare preview passes the acceptance checks and the owner approves the result. This document is the design for review; implementation and deployment have not happened.

## What the repository actually contains

- A vanilla HTML/CSS/JavaScript frontend, with browser Firebase SDK modules.
- `build.js` modifies source files to install the Schedule 3.0 shell, bridge, versioned module imports, same-origin AI URL, and visitor tracker.
- `api/ai.js` relays to Hack Club AI using a server-only `KAIROS_RELAY_SECRET`. It fixes the model to `qwen/qwen3-32b` and disables streaming.
- `api/track.js` writes visitor events to `kairosAnalytics`, using a daily HMAC visitor identifier and 90-day expiry. Raw IP addresses are not stored.
- `api/analytics.js` verifies a Firebase ID token and restricts dashboard reads and deletion to `ANALYTICS_ADMIN_UID`. Reads are capped at 10,000 events.
- `api/cleanup-analytics.js` deletes expired visitor events in batches of 400. Vercel schedules it at `0 3 * * *` (03:00 UTC).
- The Firebase Admin helper currently relies on `firebase-admin` and service-account credentials.
- The waitlist uses an independent Google Apps Script integration.

Baseline verification: all 111 existing Node tests passed. Cloudflare compatibility, production secrets, Firebase console settings, and live behaviour have not yet been verified.

## Approaches considered

1. **One Cloudflare Worker with Static Assets and all four APIs — recommended.** Preserves same-origin browser requests, moves scheduled cleanup, and removes the hosting dependency on Vercel. Static requests can bypass the Worker so normal website traffic does not become function traffic.
2. **Cloudflare frontend with APIs left on Vercel.** Less backend work initially, but retains Vercel's commercial-plan requirement and adds cross-origin configuration. It does not achieve the intended migration.
3. **Cloudflare Pages plus functions.** Can host the frontend, but its free 500-build monthly allowance may be unsuitable for the owner's frequent deployments. Workers' build-minute allowance is a better candidate, subject to measuring actual build duration.

## Recommended design

### Static build and deployment

Add a dedicated Cloudflare build that writes transformed browser assets to `dist/` without modifying tracked source files. Reuse the existing build transforms; do not reproduce Schedule injection logic.

Publish only root browser HTML/CSS/JavaScript and the known public media directories (`images`, `backgrounds`, `ambient`, `cursors`). Exclude `api`, server/Worker implementation, tests, repository metadata, documentation, build tooling, Google Apps Script source, dependency files, and local secrets. Verify the output against an explicit file policy.

Use Workers Static Assets with an `ASSETS` binding, normal 404 behaviour, and HTML handling that preserves existing `.html` URLs. Route `/api/*` through the Worker first. Serve static assets directly by default. Preserve no-store headers for the analytics page/dashboard script via static asset header configuration.

Use a new migration Worker name, provisionally `kairos-web`, rather than overwrite the older `kairos.kirosapp.workers.dev` relay referenced in source code. Confirm available account/name during deployment preparation. No production custom-domain route is added initially.

### Server endpoints

Preserve `/api/ai`, `/api/track`, `/api/analytics`, and `/api/cleanup-analytics`, including their methods, response formats, status codes, and cache behaviour.

Extract endpoint logic into shared handlers with explicit configuration/services. Keep Vercel entrypoints as thin adapters for rollback. Add a Fetch Request/Response adapter for Workers, with bounded body reading and JSON parsing. Preserve the tracking endpoint's 2 KB body limit; reject malformed/oversized input without crashing the Worker. Unknown API routes return an API 404 rather than an HTML page.

The Cloudflare AI endpoint uses the same upstream, model, payload fields, and response handling. The API key stays in a runtime secret. Do not switch AI providers, introduce paid AI plans, or change chat/planning behaviour as part of hosting migration.

### Firebase server compatibility

Do not assume Firebase Admin's Node/gRPC dependencies work in Workers just because Node compatibility exists. Isolate Firebase operations behind the shared handlers' service boundary.

The recommended Worker implementation uses Firebase's documented HTTPS REST interfaces for the limited analytics operations: adding an event, querying events, and batch deletion. Obtain short-lived OAuth access tokens from the existing service account using server-side signing. Preserve collection names, timestamp types, filters, ordering, limits, and batch sizes. Cache tokens with expiry and isolate caches by credential configuration.

Verify analytics dashboard Firebase ID tokens with a maintained edge-compatible JWT library and Google's signing keys. Validate signature, algorithm, expiry, issued-at time, Firebase project audience and issuer, subject, and auth-time requirements before applying the exact admin UID restriction. Do not merely decode tokens or trust browser-supplied identity. Keep the current Firebase Admin implementation for Vercel rollback.

Use Cloudflare's trusted client IP and country metadata for tracking rather than trusting arbitrary forwarded-IP headers. Preserve daily HMAC rotation, bot filtering, 90-day retention, and failure isolation. No raw IP or secret is returned to the browser or stored in event documents.

### Scheduled cleanup

Replace the Vercel cron with a Cloudflare scheduled handler using the same UTC expression. Reuse the expired-event cleanup operation; scheduled invocation does not call an unprotected public URL. Preserve `CRON_SECRET` authorisation on the HTTP cleanup endpoint.

A preview must not activate automatic deletion against production analytics until deployment configuration is ready. Test cleanup against isolated fixture events or a test Firebase project. Handle runtime limits explicitly and report incomplete cleanup; do not silently claim all events were removed.

### Secrets and external settings

Cloudflare runtime needs:

- `KAIROS_RELAY_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `ANALYTICS_HASH_SECRET`
- `ANALYTICS_ADMIN_UID`
- `CRON_SECRET`

The Firebase project remains `kairos-1a`. Preserve the analytics hash secret if continuity with current visitor identifiers matters. Transfer secrets through account settings or an authenticated secret command; never include values in committed files, build output, logs, or chat. Ignore local environment/credential files.

Register the exact Cloudflare preview hostname in Firebase Authentication authorised domains and the existing reCAPTCHA Enterprise key's allowed domains as required. Keep App Check enforcement and existing Firebase authentication protections enabled. Retest Google popup login, email/password signup, verification, persistence, and account deletion. Keeping the same production hostname at cutover avoids changing browser storage origin; a different preview origin may require users to sign in again.

### Deployment workflow

Work on an isolated migration branch and publish a reviewable PR once the code and local tests are ready. Avoid commits to main during preparation because main currently triggers Vercel deployments.

Configure Cloudflare Git builds against that branch for preview verification, with explicit test/build and deploy commands. Do not create parallel automated deployments for every commit through both Cloudflare Builds and another CI deployment workflow. Existing GitHub tests remain useful and should also cover the Cloudflare build.

Only after preview acceptance: merge the reviewed changes, configure the production custom domain, switch traffic, check production behaviour, and disable redundant Vercel automatic deployment. Retain the Vercel deployment for rollback during the transition.

## Acceptance checks

- Existing 111 tests remain green.
- Cloudflare build preserves Schedule 3.0, recurrence imports, tracker injection, and same-origin AI routing.
- Building twice produces equivalent output and leaves tracked source unchanged.
- No server files, credential material, or local configuration appears in published assets.
- Worker bundles and starts in the actual local Workers runtime, not just Node.
- Static pages, media, `.html` links, missing pages, and analytics cache headers behave correctly.
- AI method errors, invalid input, missing configuration, upstream failure, and successful replies behave correctly without leaking secrets.
- Tracking stores the existing event shape, uses trusted platform metadata, filters bots, and never stores raw IPs.
- Anonymous, tampered, expired, wrong-project, and non-admin dashboard requests are rejected. The intended admin can read and clear isolated test analytics.
- Cleanup preserves non-expired events, requires HTTP authorisation, and works through the scheduled handler.
- Cloudflare preview passes verified-user login, signup/verification, planner save/reload, chat save/reload, two concurrent chats, and AI scheduling.
- Inspect browser console and network errors during preview testing.
- Production cutover is reviewed separately after these checks; retain a documented rollback route.

## Scope and known limits

No database migration, Firebase security-rule weakening, CAPTCHA-provider replacement, frontend framework migration, UI redesign, or AI-provider change. The current AI relay has no explicit user authentication/rate limiting in its handler; the migration must not claim to add that protection. Any public-preview access restriction or abuse-control change must be documented and tested rather than assumed to be provided by same-origin routing.

Cloudflare account access and the current secret values are not available from this repository. Live verification cannot be marked complete until account configuration is supplied through a secure account flow. Hosting migration does not eliminate Firebase or AI upstream costs. Cloudflare build-minute and runtime allowances still apply.

## References

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Asset routing: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- Workers build limits: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- Workers Node compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Cron triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Firestore REST authentication: https://firebase.google.com/docs/firestore/use-rest-api
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens

