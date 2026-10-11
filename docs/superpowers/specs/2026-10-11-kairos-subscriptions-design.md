# Kairos subscription and usage design

Approved 11 October 2026, including the owner's addition of promo and subscription/feature redemption codes. Implementation has not started.

## Purpose and agreed constraints

Prepare Kairos for a paid launch, proposed for 31 October with 30 November as the fallback. The owner intends a freemium app: approximately 10 daily requests for free accounts, larger paid allowances, and eventually optional rewarded ads for additional usage on either tier. Monthly prices will be chosen from measured operating costs. Stripe is the chosen payment provider, but the live business account is not set up yet. Model routing currently uses OpenRouter/GPT-OSS 120B.

Keep the existing vanilla web app, Firebase identity/data and Cloudflare hosting. Preserve verified login, App Check and anti-abuse controls. The current public trial allowance remains 100/account/day and 1,000/site/day until an explicit launch configuration enables tier enforcement. No real subscription charges or automatic credit purchases occur during development.

## Recommended first release

Two configurable tiers: `free` and `plus`, with Plus a provisional display name. Multiple paid tiers can be added through the same trusted catalog later, but are not needed for the first integration. Free receives 10 daily AI requests when launch enforcement is enabled. Plus starts at a provisional 100 daily requests for sandbox validation; its live allowance is configurable and is not a pricing promise. Both initially use GPT-OSS. A more expensive model is not automatically selected for paying accounts.

Use a flat monthly Stripe subscription with included usage. No usage overage invoice, automatic top-up or pay-per-request billing is included. This keeps spending predictable. Hosted Checkout and the Customer Portal are preferred over a custom payment form. Standalone credit sales and metered billing would require a separate pricing decision and design.

One usage credit means one admitted AI provider request, including planner recovery requests and automatic summaries when enabled. Show this definition alongside the allowance, so 10 requests is not advertised as 10 chat messages. Preserve the existing rule that an attempt consumes allowance once reserved, even when the provider fails; the error message explains this. Count and token caps remain separate cost controls.

## User flow

Add a Plan & Usage panel within Settings, using existing controls and visual conventions. Display the current tier, daily requests used/remaining, next reset in Brisbane time, additional credit balance, subscription status and next renewal or cancellation date. Replace the hard-coded AI sidebar Free badge with the server-reported tier.

An eligible signed-in account selects Upgrade and is redirected to Stripe Checkout. The server chooses an allowlisted recurring price; the browser cannot submit an arbitrary price, customer identity, tier or model. After returning, display confirmation pending until the backend verifies payment and subscription state. Returning to a success URL alone never grants access.

Paid accounts use Manage subscription to open their own Stripe Customer Portal for payment-method changes and cancellation. Cancellation at period end keeps paid access through the paid-through date. Terminal cancellation, expiration, unpaid or failed renewal without paid-through coverage uses Free allowances. Do not delete workspace data on downgrade. Loading, unavailable billing, rejected login, exhausted usage and pending payment have clear states. Hide or disable upgrade actions while live billing is unconfigured.

## Backend and billing trust

Add focused billing modules and same-origin endpoints for account status, Checkout, Customer Portal and Stripe webhook delivery. Reuse Firebase token verification and App Check for account routes. Bind every request to the verified UID. Use server-owned return URLs and authenticated idempotency keys to prevent duplicate Checkout/customer creation. Existing customers with an active subscription go to the portal instead of purchasing another subscription.

Use a Stripe client instance with a pinned, currently supported API version and restricted server key with only the required permissions. Keep sandbox and live keys, price IDs, webhook secrets, customer mappings and entitlements isolated. Verify price recurrence, currency, amount and mode before offering Checkout; display amounts supplied by the verified catalog, not invented defaults.

Webhooks are required. Read their bounded, unmodified raw body before signature verification; the existing JSON-only HTTP adapter cannot handle this path unchanged. The webhook endpoint uses Stripe signature/timestamp verification, not Firebase login or App Check. It must be reachable by Stripe without changing protection on app or account routes. Prefer local CLI forwarding for the owner-protected preview; use a separate test webhook ingress if remote sandbox delivery is needed.

Handle subscription changes, checkout completion, asynchronous payment success/failure, paid/failed invoices, cancellations, refunds and disputes. Confirm expected Stripe customer, subscription and allowlisted price against the trusted mapping. Retrieve authoritative subscription/payment state rather than trusting a browser callback or applying an old webhook snapshot blindly. Apply events idempotently, with bounded Firestore conditional writes/leases to prevent duplicate or concurrent grants and stale overwrites. Record success only after durable processing; on processing failure return a retryable error. A stopped or canceled subscription must not regain access from a delayed older event.

## Entitlements and credit storage

Create server-only, scope-separated documents for billing account mappings, subscription entitlements and credit grants. Account status is read through the authenticated backend. Client-writable profile fields do not confer paid access. Confirm the deployed Firestore rules deny browser reads/writes to these new collections before any live entitlement or credit is trusted. Extend account-deletion handling to cancel billing safely and remove personal mappings, while retaining only legally required payment records in Stripe; deletion must not leave an orphan renewing subscription.

Daily allowance selection happens on the server for every AI admission. Missing entitlement means Free; unavailable or malformed entitlement storage fails safely. Paid access expires at the stored verified paid-through boundary unless extended by a verified renewal. Never accept tier, model or balance from the request body.

Retain the current daily site counter and account pseudonyms during migration. Read a trusted entitlement to select the account allowance. When the daily included allowance is exhausted, spend one extra credit if available. Reserve site usage and any credit deduction in one atomic conditional commit, so concurrent final-credit requests cannot both succeed. Do not reset current-day usage on upgrade, downgrade, deployment or policy changes. Existing trial usage carries forward when tier enforcement is enabled.

Credit grants have immutable source IDs, an amount, an explicit expiry (nullable), and a replay-protected ledger entry. The first implementation supports fixture grants only in isolated tests; there is no public endpoint to claim an arbitrary reward and no privileged grant button in production. Tests prove that grants and consumption are idempotent. Rewarded-ad credits are added only after selecting a provider with verifiable server callbacks and measuring revenue against AI cost. Until then, do not show a working Watch ads button or award credits from browser claims.

Read account status on demand and after relevant requests; avoid a permanent Firestore listener and avoid reading all users. Retain the site-wide safety ceiling and operator provider spending cap. The single daily site document remains suitable only for the current small launch; benchmark contention before increasing traffic or allowances substantially. Any future sharding needs a separate tested design preserving the hard site cap.

## Promo and redemption codes

Stripe promotion codes provide subscription discounts through hosted Checkout. Stripe owns discount amounts, duration and eligibility; the browser cannot invent them. Display the resulting Stripe checkout total before purchase.

Owner-issued Kairos redemption codes grant `plus` access for a specified number of calendar months, or access to an allowlisted feature for a defined duration. They do not create a subscription, charge a card or change an existing Stripe renewal. Clearly explain this before a paying account redeems an access pass. Access passes start at redemption and stack after an existing unexpired access pass; existing Stripe coverage is evaluated independently. Discounts on an existing subscription require a Stripe promotion rather than an access pass.

Use UTC calendar-month arithmetic with end-of-month clamping and display expiry in Brisbane time. Code definitions specify scope, benefit, expiry for redemption, global and per-account limits, optional intended UID and revocation state. Feature grants specify their own access expiry; redemption expiry and granted-access expiry are distinct.

Generate high-entropy codes in an owner-only local issuance tool; store a keyed hash using a dedicated redemption secret, never plaintext codes in client-readable storage or logs. Only the verified owner may issue or revoke codes. No public owner dashboard is needed for launch. Authenticate redemption with verified Firebase login and App Check, rate-limit attempts and return a generic invalid/unavailable-code error.

Commit code usage, a unique per-account redemption record and the access/feature grant atomically. Retrying a successful redemption returns the original grant without extending it again. Concurrent claims cannot exceed the final available redemption. Scope all documents and hashes to preview or production. Revocation affects the associated grant but never rewrites unrelated paid-through access or workspace data.

Keep a typed credit-grant ledger ready for future rewarded ads. Initial production grants come only from implemented, verified sources; no browser-claimed ad rewards or standalone credit sales are included.

## Implementation boundaries

Suggested units: trusted plan catalog; billing authentication/service; Stripe client and webhook processor; Firestore billing/credit repository; entitlement resolver; tier-aware admission; Plan & Usage frontend module and small stylesheet. Extend Worker routing and public asset manifest deliberately. Avoid placing the subsystem in the already-large app.js or client-side privileged code.

Development uses separate Stripe sandboxes. A temporary Stripe sandbox can be explored before live business onboarding; account creation/claiming is handled separately from enabling real payments. Do not populate a real subscription price or charge a customer until the owner selects price/currency, completes the business account and approves live activation. Tax configuration is a launch decision: do not enable automatic tax without confirming applicable active registrations.

## Acceptance and rollout

Automated checks must exercise spoofed identity/tier/model/credits, raw-body signatures, tampered/expired/duplicate/out-of-order webhooks, parallel customer/Checkout creation, renewal, canceled-at-period-end access, unpaid expiry, refunds/disputes, account deletion, concurrent last-credit spend, midnight reset, policy changes without resetting usage, scope isolation and unavailable dependencies. Verify read/write permissions with Firestore rules tests or equivalent live rejection evidence.

In a Stripe sandbox, complete Checkout with test payment details, confirm webhook-granted access, renew/fail/cancel a subscription, and verify the portal belongs to the correct account. In the protected Kairos preview, test Plan & Usage display, usage exhaustion, persistence, chat switching and unchanged task workflows. Fixture-only results must be labeled as such if no sandbox is available.

Rollout stays disabled on public production until sandbox and preview acceptance pass. Activation then requires configured live Stripe credentials/prices/webhook, selected allowances and tax/account decisions. A failed billing integration must not reset balances, make paid promises or silently switch providers. Emergency purchase disablement can stop new Checkout sessions while preserving verified existing paid-through access. Full rollback must preserve billing state and cancellation processing; do not simply remove webhooks while subscriptions can renew.

## Sources

- [Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Webhook signature and raw-body handling](https://docs.stripe.com/webhooks)
- [Stripe sandboxes](https://docs.stripe.com/sandboxes)
- [Stripe keys](https://docs.stripe.com/keys)

## Review decision

Approval of this design permits a written implementation plan. The plan will break the work into testable steps and identify the precise deployment configuration. No new billing product code, external Stripe resources or live purchase flow has been created at this stage.
