# Kairos billing operations

## Current release state

Purchases, code issuance/redemption and tier enforcement ship disabled. Public trial remains 100 requests/account/day and 1,000/site/day. Free launch policy is 10/day; Plus 100/day is provisional until operating costs determine the price and allowance. Both use the existing OpenRouter GPT-OSS model.

There are no real charges, overage invoices, automatic top-ups or credit purchases. Rewarded ads have no claim endpoint or simulated Watch ads button. The internal credit-grant interface is owner checked and has no public route; initial grants are test fixtures only.

## Server configuration

Cloudflare secrets (never browser values or committed populated files):
- STRIPE_SECRET_KEY: prefer a restricted key with required resource permissions.
- STRIPE_WEBHOOK_SECRET: independent signed-webhook secret.
- REDEMPTION_HASH_SECRET: independent random secret, at least 32 random bytes; do not rotate it casually because issued codes are keyed by it.

Public server variables:
- BILLING_ENABLED=false disables new Checkout; existing paid status, Portal and signed-webhook processing remain available with configured Stripe credentials.
- ACCESS_CODES_ENABLED=false disables issue/revoke/redeem routes.
- AI_TIER_ENFORCEMENT=false preserves the existing trial admission path; true uses trusted plan access and credit spending.
- AI_FREE_DAILY_LIMIT=10, AI_PLUS_DAILY_LIMIT=100; accepted range 1–5,000.
- STRIPE_MODE=test for isolated sandbox keys, live only after launch approval.
- STRIPE_PLUS_PRICE_ID: trusted recurring monthly Price, positive amount, one-month interval. No launch price is invented.
- BILLING_ORIGIN: exact trusted production, protected preview or localhost origin.
- AI_BUDGET_SCOPE: production or preview; never share payment resources across modes/scopes.
- Existing ANALYTICS_ADMIN_UID is the trusted owner; profile fields cannot confer operator access.

Use Cloudflare's secret store for keys. Configure matching values in wrangler.jsonc for each environment: automatic builds apply its public variables. Dashboard-only flag changes may be overwritten by the next deployment.

Stripe 23.0.0 is pinned to API 2026-09-30.endive. Configure webhook delivery with that version. Read-only permissions: Prices, Subscriptions, Invoices, Invoice Payments, PaymentIntents, Charges and Disputes. Write permissions: Customers, Checkout Sessions, Billing Portal Sessions and cancellation of Subscriptions. Verify actual sandbox restricted-key access before live activation.

## Storage and consistency

Schema version 1 uses server-only collections:
kairosBillingAccounts (UID/customer and pending Checkout mapping), kairosBillingCustomers (reverse customer ownership), kairosBillingEntitlements (billing snapshot, access/feature grants and deletion tombstone), kairosBillingEvents (processed event IDs), kairosBillingLocks (short account operation leases), kairosCreditAccounts (bounded grant/spend aggregates), kairosCreditGrants (unique grant sources), kairosAccessCodes (hashed definitions/use counts), kairosCodeRedemptions (per-account unique claims).

Documents use scope-prefixed IDs. Account IDs are HMAC pseudonyms. Each document stores a bounded JSON payload in a Firestore string field; this avoids public field indexes for private billing data. No migration of existing tasks, profiles or chats is needed.

Retain kairosAiUsage document IDs and day-specific account HMAC keys. Deployment, upgrades, codes and policy changes do not reset spent requests. One admitted upstream call consumes one request even if the provider fails. Planner retries/summaries count independently. Brisbane reset is midnight UTC+10.

Conditional commits cover code counters/grants and AI counter/bonus spending. Only explicit Firestore conflicts retry; uncertain network commit results fail closed. No automatic provider retry occurs after uncertain spending. Malformed/unavailable entitlement or credit storage does not default to extra access.

Account deletion requires recent Firebase reauthentication and App Check. It first marks deletion, expires every open customer Checkout session, cancels and verifies all renewing Stripe subscriptions, then clears personal customer mappings and access grants. A customer tombstone retains only an opaque account HMAC and deletion flag, without the Firebase UID; signed delayed completion events use it to cancel late subscriptions. Keep that tombstone while delayed delivery or reconciliation can occur; no automated tombstone purge is provided. Failure stops before Firebase identity/data deletion and allows retry. Stripe retains its required payment records. Do not remove cancellation/webhook handling while subscriptions can renew.

Billing mutations inside account leases conditionally commit the current lease ownership alongside the account changes. Expired or superseded operations fail; webhook retry must fetch fresh Stripe state. The 90-second lease bounds successful mutations even if slow external reads continue longer. Checkout parameters and browser retry IDs are stable across retries of the same operation.

## Rules evidence

docs/firestore-rules.snapshot.rules captures deployed Kairos rules on 11 October 2026. They already deny all unmatched billing collections. No production rules deployment is needed.

Run test:billing-rules with FIREBASE_TOOLS_LIB pointing to the authenticated Firebase CLI lib directory. The script fetches the deployed ruleset, requires an exact normalized snapshot match, and uses Firebase's non-persistent rules test API. It runs 158 read/list/create/update/delete cases for signed-out, owner and other-account identities, plus workspace permission controls. Normal offline test runs explicitly skip this network-only test.

A deliberately permissive mutation is used only inside the non-persistent test engine to prove the tests catch leaked access. It is never deployed. Re-fetch and re-test rules before live activation if the deployed source changes.

## Owner-issued access codes

Codes contain 128 random bits. Plaintext is returned once to the owner, never logged by the Worker or stored in client-readable documents. Store the delivered code privately until sharing it. Code hashes include environment scope and a dedicated secret.

Authenticated owner-only routes issue/revoke; all account routes use verified login and App Check (deletion separately permits an unverified account after recent login). Independent billing rate-limit keys cap attempts at approximately 10/minute/account/route. Issuance is not exposed as a public app dashboard.

The private operator CLI reads a short-lived owner session JSON file containing origin, idToken and appCheckToken. Save it outside tracked/public assets, never paste its tokens into chat, and delete it after use. The CLI sends tokens only to the allowlisted Kairos origins:
    node scripts/access-codes.mjs issue --months 3 --uses 1 --session-file <private-session-file>
    node scripts/access-codes.mjs revoke --code <issued-code> --session-file <private-session-file>

The optional --expires argument controls the last redemption time (default 30 days), --uid binds to an intended Firebase UID, and --uses sets a global cap. Each account can redeem once. The owner session must come from a real authenticated owner browser; service-account credentials are not browser App Check tokens.

Plan codes grant Plus for 1–120 calendar months, clamping month ends in UTC; expiry displays in Brisbane time. A new pass starts at redemption or after an existing unexpired pass. It does not pause/cancel an existing Stripe renewal. The UI warns paying users before redemption. Use Stripe discounts to reduce actual subscription charges.

Feature-code schemas and resolution are implemented, but the allowed feature catalog is empty until actual gated features are selected. A feature ID must be added to the trusted catalog and enforced at its real endpoint before an owner can issue that code. Arbitrary feature strings are rejected.

Code expiry for redemption is distinct from access expiry. Repeated claims return the original grant rather than extending it. Concurrent claims cannot exceed the final available use. Revocation removes the associated code access without removing independent Stripe paid coverage. Grant aggregates are bounded to 256 entries; archive expired entries with an approved retention design before that limit is reached.

## Stripe promotions and lifecycle

Hosted Checkout supports Stripe promotion-code entry. Create discount coupons/promotions in the isolated Stripe sandbox first; Stripe controls percentage/amount, eligibility and duration. Checkout shows the final price before purchase. Kairos never accepts an arbitrary browser-provided discount, Price, customer, model or tier.

The success URL shows payment confirmation pending until signed billing events verify access. Stripe does not need Firebase login/App Check for its webhook; only the bounded original raw body and valid signing secret are accepted. App/account route protections remain intact.

Reconciliation retrieves current subscriptions, paid invoices and covering payment/refund/dispute state. Period-end cancellation preserves already paid coverage; terminal cancellation ends it. Pending/unpaid billing without paid coverage uses Free. Fully refunded or disputed covering payments invalidate only their invoice coverage; independent clean paid coverage remains. Payment risk is stored separately from subscription lifecycle, so refund/dispute does not hide continuing renewal or the access-code billing warning. A won dispute can restore current paid coverage. Independent access-code grants survive billing risk events. Event IDs and fenced account leases prevent replay/stale snapshot overwrite.

The webhook route handles subscription, paid/failed invoice, Checkout/asynchronous completion, refund and dispute events. Configure only documented supported events and the pinned API version. Unknown unrelated events/customers are acknowledged without access changes; processing errors return retryable failures.

## Sandbox acceptance

Use a separate Stripe sandbox, not the live account or its shared test data. Stripe CLI can create an unclaimed test sandbox before business onboarding; the owner claims it before any Stripe connector use. Only test payment details are allowed.

Protected preview stays behind Cloudflare Access. For webhook testing, forward Stripe CLI events to a local Worker, or design a separate signed test webhook ingress. Do not disable preview protection or upload live credentials for convenience.

Prove: Checkout plus promo; signed fulfillment; renew/fail/cancel; account-owned Portal; owner code issue/redeem/retry/revoke; parallel last-credit admission; authenticated preview status and reload. Check ordinary task mutations, persistent AI chat and chat switching too. Record whether each check used a real Stripe sandbox, REST/DOM fixture or authenticated browser.

## Launch and rollback

Remaining inputs: live Stripe onboarding, monthly price/currency, selected paid allowance, isolated live keys/Price/webhook and explicit live activation. Review taxes/registrations before charging: https://docs.stripe.com/billing/taxes/collect-taxes . automatic_tax is not enabled without confirmed active registrations.

First activate only the protected sandbox preview. Obtain live acceptance, review/CI and exact publication/credential-transfer approvals if required. Then enable production purchases and tier enforcement through an explicit config change. Confirm deployed flags and build version.

Emergency purchase disablement sets BILLING_ENABLED=false while preserving configured signed-webhook processing, customer cancellation and verified paid-through access. Disabling tier enforcement restores trial allowances rather than deleting billing data. Do not roll back to a version that drops billing/account-deletion handling while customers can renew.

Before increasing the global ceiling, benchmark the existing single-document daily counter and design tested sharding if needed. Provider spending caps remain a separate safety control.
