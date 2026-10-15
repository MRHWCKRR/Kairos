# Kairos AI protection

All deployed browser AI calls (chat/actions, plan generation, schedule proposals and day insights) use `ai-client.js` and the same-origin `/api/ai` endpoint. The browser obtains its current Firebase ID token and App Check token; neither is persisted by the transport or logged.

The Worker checks Firebase signatures, project, expiration, verified email, and App Check signatures, project number and the exact Kairos web app ID. An anonymous request receives 401; an unverified account or invalid App Check receives 403. These requests never call the AI provider. App Check token consumption/replay protection is not enabled; tokens remain reusable until expiration, with account rate limits applied separately.

The native `AI_RATE_LIMITER` binding permits approximately 10 requests per 60 seconds per verified Firebase UID, shared across all AI features. Requests over the limit receive 429 with `Retry-After: 60`. Missing or failed limiter configuration closes the endpoint with 503. Production and preview use distinct namespace IDs. Cloudflare's counters are local to a Cloudflare location and eventually consistent: this is burst protection, not an exact global daily quota or spending cap. No Firestore reads/writes are added for AI usage counting.

The Worker caps the JSON body at 128 KiB, accepts 1–40 text messages with system/user/assistant roles, strips unexpected message fields, restricts response format to text/json_object, and always supplies a server-owned 8,192 output-token limit. Requests cannot select the model, upstream address, credentials or output limit. The existing response byte cap and timeout remain in place. A shorter prompt or smaller plan is required if the input limit is reached; unusually long completions can reach the output cap.

Public configuration `FIREBASE_PROJECT_NUMBER` and `FIREBASE_WEB_APP_ID` lives in `wrangler.jsonc`, repeated in the preview environment along with its limiter binding. Existing Firebase/reCAPTCHA domain allowlists and backend secrets remain required. There is no fallback to the old relay if attestation fails. Browser privacy blockers may require refreshing Kairos or permitting its Firebase/reCAPTCHA security check.

Cloudflare Builds automatically deploys merges to main using `npm run build:cloudflare` and `npx wrangler deploy`. Build tests include AI protection and client transport checks. `npm test` also verifies the local Workers runtime. Use `npm run deploy:cloudflare` for the owner-protected preview before production.

Scope: this protects `kairos-web` and `kairos-web-preview`. The retained old Vercel deployment and legacy `kairos` Worker have separate protection/configuration and are not changed by this feature. The legacy Vercel source wrapper does not provide the native limiter; rebuilding this branch there fails closed for AI. Roll back to the retained pre-change deployment if necessary.

References: [Firebase custom backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend), [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
