# Daily Kairos AI allowances

The initial trial policy is **100 provider requests per verified account per day**, with **1,000 requests shared by the production site**. Both reset at midnight in Australia/Brisbane (UTC+10). These are request limits, not dollar spending limits. A frontend action can use more than one provider request.

## Current behavior

- Verified Firebase login, App Check, request validation and the existing per-minute limiter run before daily reservation.
- The backend reserves a request before calling the AI provider. Failed provider attempts count, preventing unlimited retries during outages. Requests rejected before reservation do not count.
- Account and site counters advance together in one conditional Firestore commit. New processes, multiple devices and concurrent chats share the same counters. Conflicting commits reread and retry a bounded number of times; unavailable or malformed counters fail closed.
- Account and site limits return separate `daily-account` and `daily-site` codes, `resetsAt` and `Retry-After`. All existing AI flows show daily reset guidance through the shared transport. Existing short-term rate-limit guidance remains.
- Preview has a separate budget and cannot spend production credits.

## Configuration and storage

`wrangler.jsonc` defines `AI_DAILY_ACCOUNT_LIMIT`, `AI_DAILY_SITE_LIMIT` and `AI_BUDGET_SCOPE` for production and preview. Policies are backend-owned; browser-supplied tier, credits, UID or model choices do not increase the allowance. Limits must be whole numbers from 1 to 5,000. Invalid configuration blocks AI safely.

The existing Standard Firestore database holds two server-only documents, `kairosAiUsage/production` and `kairosAiUsage/preview`. Each contains the Brisbane day, total request count and a map of daily account counts. Account keys are HMACs of scope, day and verified UID, using the existing `ANALYTICS_HASH_SECRET`. No prompt, response, email or raw UID is saved in these counters.

Current deployed Firestore rules have no client permission for this collection. The service account accesses it through IAM. Do not add browser writes or broad wildcard permissions to this collection. No new credentials or populated secrets are committed.

The first request on a new day replaces yesterday's counts and pseudonyms. The existing production cleanup schedule at 13:00 Brisbane removes a previous-day snapshot if it has not already been replaced. It uses an update-time precondition so it cannot delete a concurrently refreshed allowance. Preview has no schedule; its old snapshot is replaced on its next usage. These counters are operational limits, not a historical user analytics store.

Conditional writes use Firestore's [update-time/existence preconditions](https://firebase.google.com/docs/firestore/reference/rest/v1/Precondition) and [atomic commits](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit). Normal admitted requests add one document read and one write; conflicts can add more. One snapshot coordinates the current small site-wide cap. Review contention, latency, database quotas and document size before increasing limits substantially; the policy maximum protects the bounded snapshot size and is not a throughput guarantee.

Keep the hash secret stable during a day: rotating it changes account pseudonyms and therefore individual counters, while the global count remains. Lowering a policy takes effect on the next request without clearing existing usage. Do not delete the current-day production snapshot to change a limit; that resets spent credits.

## Planned freemium direction

The owner intends free and paid subscription tiers. A future free allowance is approximately 10 requests a day, with basic AI; paid tiers receive larger allowances and potentially different models. Both may earn additional usage from rewarded video ads. These remain product plans: the trial policy above still applies to every account, and this change does not implement ads, subscriptions or paid models.

Future tier allowances must come from trusted backend subscription entitlements. Rewarded ad credits must be issued only after verified provider callbacks, with replay protection and a server-side credit ledger. Browser claims must never grant credits or paid models. Keep a site-wide safety ceiling even when introducing tier allowances. Choose final limits and models from real usage and provider costs rather than treating these trial values as permanent pricing promises.

## Verification and rollout

Run `npm test`, `npm run build:cloudflare` and Wrangler's preview dry run. Tests cover persistent account exhaustion, site exhaustion, simultaneous final-credit reservations, midnight rollover, storage failures, configuration validation, cleanup and user-facing daily messages. Use the protected preview for live verification before publishing production. The old Vercel AI path and legacy relay remain retired.
