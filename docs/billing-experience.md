# Billing display and subscription discovery

## Status requests

The browser shares in-flight status reads and retains a successful response in memory for 30 seconds. No account status or tokens are persisted by the requester. Authentication changes clear that memory, and old-account responses cannot update the new account.

A 429 establishes an account/route cooldown, including manual refreshes. The billing server sends Retry-After: 60. The browser accepts a bounded positive seconds value or HTTP date and falls back to 60 seconds if invalid. Status, Portal and deletion now use independent rate-limit keys while retaining the existing per-route protections.

Temporary refresh errors retain only the same account's last successful display with a stale warning. That display cannot grant access. Checkout rechecks a fresh server-verified offer. Successful billing mutations invalidate the status cache. Payment-return polling bypasses age caching, coalesces requests and respects cooldowns.

AI usage invalidates the cache and schedules a coalesced refresh no more often than every ten seconds for background notifications. Navigation uses the same status path.

## Product behaviour

Account and AI Helper include View plans. Plan comparison uses non-sensitive values from the trusted server catalog. With tier enforcement disabled, the UI explains the current equal trial allowance and labels future Free/Plus allowances as planned launch policy.

Purchases disabled: Plus coming soon.
Sandbox enabled: Test checkout, with an explicit no-real-money notice.
Live enabled: Upgrade to Plus with the verified currency, total charge and selected monthly/yearly interval. Missing intervals are unavailable; the browser cannot supply a Stripe Price or amount.

The standalone Plans page includes a semantic feature comparison, current allowance and subscription attention/renewal details. Checkout and Portal return directly to Plans. Canceled checkout clears only the signed-in account’s local purchase intent. Success polling stops after five retries with a useful pending message and manual refresh; no return URL grants access.
Unknown/stale offer: no purchase until a successful fresh status check.
Existing subscription: management remains available rather than another purchase prompt.

Only a meaningful enforced Free daily limit can show a contextual View plans action. Plus limits, the equal-allowance trial, site-wide caps and provider/minute limits do not imply that a purchase solves the error. Daily notices remain excluded from model context. Limit actions are attached outside the markdown bubble so rendering does not remove them.

The near-limit notice begins at 80% usage after successful AI transport, for Free allowances of at least five requests. It requires a genuinely higher Plus allowance and is shown once per account/reset period using session storage; dismissal persists for that period within the session. No extra popup or new analytics pipeline is introduced.

The existing purchase welcome still requires account-bound purchase intent and verified paid coverage. Access passes do not stop Stripe renewal.

## Acquisition experiments

First prove one repeatable use case: turn an assignment deadline into a workable week. Demonstrate the real planner, then compare exam-revision and busy-work-week messaging. Assess verified signup, first saved scheduled task and seven-day return before expanding acquisition.

When live billing and meaningful tier differences are enabled, compare plan views, checkout starts, server-confirmed live purchases, renewals and cancellations. Exclude sandbox payments from revenue and conversion. Use the existing analytics capabilities where they support these measurements; extending the tracking contract is separate work.

Use actual feature demonstrations and pilot feedback. Do not publish campaigns, send outreach or spend on ads from this implementation. Final price and Plus allowance require measured model/context costs and heavy-user distributions. The global 1,000-request daily cap remains a capacity constraint for paid customers; validate capacity before promising broader availability.

File uploads, token purchases, different models and priority access are not purchase benefits in this release. Production flags, allowances, webhook fulfillment, Stripe SDK/API versions and credentials are unchanged.

## Release checks

Run the full npm test suite and both existing hosting builds/runtime checks. Also verify the rendered Plan panel in light/dark themes, keyboard focus and reduced motion. Use an authenticated protected preview for sandbox Checkout, delayed confirmation, Portal cancellation, code redemption and task/chat persistence.

Before any preview deployment, inspect its deployed flags: dashboard-enabled sandbox flags differ from the committed disabled defaults and can be overwritten by deployment. Do not change production purchases or tier policy during this UI release.
