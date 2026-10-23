# Kairos AI allowances

| Plan | Per Brisbane day | Per week |
| --- | ---: | ---: |
| Free | 15 | 50 |
| Plus | 50 | 350 |

Daily windows reset at midnight Australia/Brisbane. Weekly windows reset Monday 00:00 UTC (Monday 10:00 Brisbane). Both limits apply; the first exhausted allowance stops new provider requests. The production site also retains its shared 1,000-request daily safety ceiling. Explicit bonus-credit grants retain their existing one-credit-per-extra-request behavior; they never bypass the site ceiling.

Verified Firebase authentication, App Check, validation and burst rate limiting run before reservation. Failed provider attempts count once admitted. Browser-supplied plan claims cannot increase allowances. Paid coverage and access grants resolve the trusted tier; cancellation retains coverage through paid-through time.

Production and preview enable AI_TIER_ENFORCEMENT with AI_FREE_DAILY_LIMIT=15, AI_FREE_WEEKLY_LIMIT=50, AI_PLUS_DAILY_LIMIT=50 and AI_PLUS_WEEKLY_LIMIT=350. Stripe remains in test mode. AI_DAILY_ACCOUNT_LIMIT remains the legacy trial fallback only when enforcement is disabled.

The server-only kairosAiUsage/production and kairosAiUsage/preview documents hold daily and weekly HMAC account counters, updated in the same conditional atomic commit as credit and entitlement checks. Concurrent requests cannot overspend either cap. Daily account keys rotate daily; weekly keys rotate weekly. No prompt, response, email or raw UID is stored in usage counters. Do not rotate ANALYTICS_HASH_SECRET within a week or delete an active snapshot to change limits.

Old daily-only snapshots migrate in place, including the current day's usage. Older days were discarded by the previous implementation and cannot be recovered, so the first weekly window counts from migration plus retained current-day usage. Existing weekly counts survive daily rollover, plan changes, and cleanup; cleanup deletes only after both windows expire. Maps remain bounded to 5,000 pseudonymous accounts, and malformed or unavailable counters fail closed. Review document size and contention before raising site limits.

Billing status exposes daily and weekly usage, remaining allowance and reset timestamps. Plans and account usage display both allowances. The AI transport uses daily-account, weekly-account and daily-site errors with the relevant resetsAt and Retry-After. Saved notices stay outside model input.

Verify with npm test and npm run build:cloudflare; hosted CI additionally tests the Workers runtime and bundles. Coverage includes migration, weekly/daily boundaries, concurrency at the last allowance, tier changes, malformed counters, site limits, bonus credits, cleanup and reset guidance.
