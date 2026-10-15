# Kairos Subscriptions and Access Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build tested subscription, usage and owner-issued access-code flows ready for Stripe sandbox validation and later priced launch.

**Architecture:** Focused server modules resolve trusted entitlements and admit AI requests through atomic Firestore commits. Stripe Checkout/Portal handle payment UI; signed webhooks own paid coverage. A small vanilla Settings module displays status and redeems access codes.

**Tech Stack:** Existing vanilla JavaScript, Firebase Authentication/App Check, Firestore REST conditional commits, Cloudflare Workers, Node test runner; official Stripe SDK only if its current Workers-compatible package passes runtime verification.

**Spec:** ../specs/2026-10-11-kairos-subscriptions-design.md

## Global Constraints

- Current public trial allowance remains 100/account/day and 1,000/site/day until an explicit launch configuration enables tier enforcement.
- Free receives 10 daily AI requests when launch enforcement is enabled.
- Plus starts at a provisional 100 daily requests for sandbox validation; its live allowance is configurable and is not a pricing promise.
- Both initially use GPT-OSS. A more expensive model is not automatically selected for paying accounts.
- No usage overage invoice, automatic top-up or pay-per-request billing is included.
- No real subscription charges or automatic credit purchases occur during development.
- Preserve verified login, App Check and anti-abuse controls.
- One usage credit means one admitted AI provider request, including planner recovery requests and automatic summaries when enabled.
- Do not reset current-day usage on upgrade, downgrade, deployment or policy changes.
- Access passes start at redemption and stack after an existing unexpired access pass; existing Stripe coverage is evaluated independently.
- Redemption codes do not create a subscription, charge a card or change an existing Stripe renewal.
- Use UTC calendar-month arithmetic with end-of-month clamping and display expiry in Brisbane time.
- Keep sandbox/live payment resources and preview/production data isolated. Never publish populated secrets.

## Review Focus

1. January 31/month-end and leap-year grants get a deterministic clamped expiry (Task 1).
2. Two tabs redeeming the final available code produce one grant; retrying does not extend it (Task 2).
3. A deleted account or delayed old Stripe event cannot restore renewing billing/access (Tasks 3–4).
4. Switching accounts while a slow status request returns never shows another account's plan (Task 6).
5. A paid subscriber redeeming a pass sees that Stripe renewal continues; no implied free billing (Tasks 2, 6).

## File structure and shared contracts

Create focused modules:
- `server/plans.js`: trusted catalog and launch policy.
- `server/entitlements.js`: pure resolution, feature grants and calendar-month expiry.
- `cloudflare/billing-store.js`: scoped Firestore reads/conditional commits and durable locks.
- `server/access-codes.js`: owner issuance/revocation and user redemption.
- `server/stripe-client.js`: pinned SDK wrapper, verified price/catalog and resource mapping.
- `server/billing.js`: authenticated account status, Checkout and Portal handlers.
- `server/billing-webhook.js`: bounded raw-body signature verification and durable reconciliation.
- `server/billing-account-deletion.js`: renewing-payment cancellation before identity deletion.
- `plan-usage.js`, `plan-usage.css`: existing Settings integration.
- `scripts/access-codes.mjs`: private operator CLI; no stored plaintext output file by default.
- `docs/billing-operations.md`: schema, sandbox setup, rollout, taxes, code issuance and rollback.

Modify existing `cloudflare/worker.js`, `cloudflare/firebase-services.js`, `cloudflare/firebase-firestore.js`, `cloudflare/http-adapter.js`, `server/ai-budget.js`, `app.html`, `app.js` (only module lifecycle and deletion hooks), `ai-request.js`, `cloudflare/public-assets.json`, `package.json`, `.dev.vars.example`, `wrangler.jsonc`.

Use one explicitly versioned store schema. Scoped collections: `kairosBillingAccounts`, `kairosBillingCustomers`, `kairosBillingEntitlements`, `kairosBillingEvents`, `kairosBillingLocks`, `kairosCreditAccounts`, `kairosCreditGrants`, `kairosAccessCodes`, `kairosCodeRedemptions`. Scope-prefixed IDs; bounded per-account aggregate balances/grants. Do not scan all users. Do not change `kairosAiUsage` IDs or HMAC account keys.

Shared types (milliseconds are integer UTC timestamps):
- `AccountAccess = {tier:'free'|'plus', dailyLimit:number, features:string[], accessUntil:number|null}`.
- `AccountStatus = {access:AccountAccess, usage:{used,remaining,resetsAt,bonusCredits}, billing:{status,paidThrough,cancelAtPeriodEnd}, offers:[], codesEnabled:boolean}`.
- `Grant = {id,sourceId,kind:'plan'|'feature'|'credits',planId?,featureId?,amount?,startsAt,expiresAt,revokedAt:null|number}`.
- `CodeDefinition = {scope,kind:'plan'|'feature',planId?,featureId?,months,redeemBefore,maxUses,perAccountLimit:1,intendedUid:null|string,revokedAt:null|number}`.
- `BillingStore` methods defined in Task 2; inject store/clock/Stripe clients into handlers for deterministic tests.

### Task 1: Trusted plans and entitlement resolution

**Files:** Create server/plans.js, server/entitlements.js; tests/billing-entitlements.test.mjs.
**Interfaces:** `planCatalog(env)->{free,plus,enforced}`; `addCalendarMonths(startMs,months)->number`; `resolveAccess({catalog,billing,grants,now})->AccountAccess`. Feature IDs come from an explicit catalog, initially empty until an actual gated feature is selected.

- [ ] Write failing tests: assert Free dailyLimit=10 with enforcement on; trial accountLimit=100 with it off; expired paid coverage resolves Free; valid plan grant resolves Plus; client tier fields ignored; revoked grants inactive; invalid storage throws.
- [ ] Add exact month-end assertion: `assert.equal(new Date(addCalendarMonths(Date.parse('2027-01-31T12:00:00Z'),1)).toISOString(),'2027-02-28T12:00:00.000Z')`; leap-year Feb29; bounded positive month count.
- [ ] Run `node --test tests/billing-entitlements.test.mjs`; confirm missing exports fail.
- [ ] Implement pure helpers, explicit flags `AI_TIER_ENFORCEMENT=false`, `AI_FREE_DAILY_LIMIT=10`, `AI_PLUS_DAILY_LIMIT=100`; validate all limits and dates.
- [ ] Run the same test command; require pass. Commit `feat: add trusted plan and access resolution`.

### Task 2: Scoped store, credit ledger and access codes

**Files:** Create cloudflare/billing-store.js, server/access-codes.js, scripts/access-codes.mjs; modify cloudflare/firebase-services.js; tests/billing-store.test.mjs, tests/access-codes.test.mjs.
**Interfaces:** `createBillingStore({env,fetchImpl,clock})->BillingStore` with `readAccount(uid)`, `readUsage(uid)`, `redeemCode({uid,digest,now})`, `issueCode({digest,definition,ownerUid})`, `revokeCode({digest,ownerUid,now})`, `withAccountLease(uid,operation)`, `applyBillingSnapshot({uid,snapshot,eventId})`, `markDeleting(uid)`. All mutations use bounded conditional commits. `codeDigest(code,secret,scope)->string`; `redeemAccessCode({uid,code,store,env,now})->{grant,alreadyRedeemed,billingContinues}`.

- [ ] Write failing tests: assert concurrent final redemption grants exactly once; same UID retry returns original grant ID/expiry; intendedUid mismatch/expired/revoked code denies; preview code fails in production; private collection reads/writes cannot be requested by arbitrary path.
- [ ] Add tests: `assert.equal(retry.grant.expiresAt,first.grant.expiresAt)`; paid subscriber retains original billing paidThrough and receives `billingContinues:true`; stack after an unexpired pass, exclude revoked/expired passes; malformed code limits denied.
- [ ] Run `node --test tests/billing-store.test.mjs tests/access-codes.test.mjs`; require failure before implementation.
- [ ] Implement scoped documents/unique redemption IDs, atomic usage+grant commit, bounded conflict retries and aggregate ledger validation. Dedicated `REDEMPTION_HASH_SECRET`; generate 128-bit random codes, normalize ASCII case/separators and bound length. Never log code/key/UID.
- [ ] Implement operator CLI calling authenticated owner-only issue/revoke routes; verify Firebase owner UID from server `ANALYTICS_ADMIN_UID`, App Check and independent rate limits. CLI obtains credentials without command-line secret flags, prints a newly issued code only to the owner's console. No browser issuance UI.
- [ ] Run both tests; require pass. Commit `feat: add atomic access code grants and scoped billing storage`.

### Task 3: Stripe sandbox account flows

**Files:** Create server/stripe-client.js, server/billing.js; tests/billing-checkout.test.mjs; modify package files and environment example.
**Interfaces:** `createStripeClient(env)` exposes `verifyPrice(planId)`, `ensureCustomer(uid,requestId)`, `createCheckout(uid,planId,requestId)`, `createPortal(uid)`, `retrieveBillingSnapshot(customerId)`, `cancelAccountSubscriptions(customerId)`. `createBillingHandlers({env,store,stripe,adminAuth,appCheck,rateLimiter,clock})` exposes status/checkout/portal/issueCode/revokeCode/redeem handlers.

- [ ] Write failing tests: arbitrary price/customer/returnURL/tier denied; duplicate Checkout requests reuse session; concurrent customer creation yields one mapping; already subscribed redirects Portal; unconfigured catalog exposes no upgrade price.
- [ ] Run `node --test tests/billing-checkout.test.mjs`; require failure.
- [ ] Verify official Stripe current API/SDK and Workers compatibility; pin versions. Set server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLUS_PRICE_ID`, `STRIPE_MODE=test`, `BILLING_ENABLED=false`, trusted origin. Reject mode/price mismatches.
- [ ] Implement authenticated server-owned checkout URLs and idempotency. Enable Stripe-hosted promotion-code entry; no client discount amount. Dynamic payment methods; current integration_identifier if required. Use durable account leases for customer creation/deletion races.
- [ ] Run test command; require pass. Commit `feat: add sandbox subscription checkout and portal`.

### Task 4: Signed webhooks and account deletion

**Files:** Create server/billing-webhook.js, server/billing-account-deletion.js; modify cloudflare/http-adapter.js, cloudflare/worker.js and app.js deletion flow; tests/billing-webhook.test.mjs, tests/billing-deletion.test.mjs.
**Interfaces:** `handleStripeWebhook(request,{env,stripe,store,clock})->Response`; `prepareBillingDeletion(uid,{store,stripe})->{safeToDelete:true}`.
**Routes:** GET /api/billing/status; POST /api/billing/checkout, /portal, /redeem, /codes/issue, /codes/revoke, /delete-account (all under /api/billing); POST /api/billing/webhook signature-only.

- [ ] Write failing tests: altered/raw/expired signature denies without writes; duplicate event no duplicate grants; old cancellation/renewal events retrieve authoritative current state; failed durable commit returns retryable 503; unpaid expiry/refund/dispute coverage resolved explicitly.
- [ ] Add tests asserting no customer/Checkout creation after deletion tombstone; cancel renewal before Firebase delete; failed cancellation prevents identity deletion and explains retry; unrelated workspace remains until normal deletion completes.
- [ ] Run `node --test tests/billing-webhook.test.mjs tests/billing-deletion.test.mjs`; require failure.
- [ ] Implement bounded raw-body route before JSON adapter (256KiB), signature verification and authoritative reconciliation under account lease. Refund/dispute policy: disputed or fully refunded covering payment suspends its paid coverage; unrelated access-code grants remain valid. Track durable event IDs, reject mismatched mappings/prices.
- [ ] Implement deletion tombstone+Stripe cancellation verification; allow no-billing accounts to delete normally. Keep account mapping until subscription cancellation is confirmed; document minimal retained event/tombstone retention.
- [ ] Run tests; require pass. Commit `feat: reconcile signed billing events and cancel billing on deletion`.

### Task 5: Tier-aware atomic AI admission

**Files:** Modify server/ai-budget.js, cloudflare/firebase-firestore.js; integrate billing-store.js; tests/ai-tier-budget.test.mjs; extend existing budget suites.
**Interfaces:** Extend `reserveAiUsage(uid)` internally using `resolveAccess`; preserve returned allowed/reason/day/resetsAt/retryAfter contract. Add read-only status usage; use Task 2 store read methods. Add pure `reserveTierBudget({fields,uid,policy,secret,time,access,creditAccount})->{allowed,reason?,fields?,creditAccount?,...window}`.

- [ ] Write failing tests: Free tenth request admits/eleventh denies absent credits; Plus allowance enforced; concurrent final bonus credit spent once; exhausted site cap spends no credit; provider failures retain reservation.
- [ ] Add `assert.equal(afterUpgrade.used,beforeUpgrade.used)`; launch-policy toggle preserves same-day trial counter; midnight Brisbane resets daily usage only; unavailable/malformed entitlement or ledger fails closed; scope separation.
- [ ] Run `node --test tests/ai-tier-budget.test.mjs tests/ai-daily-budget.test.mjs tests/cloudflare-ai-budget.test.mjs`; require new tests fail.
- [ ] Implement one atomic conditional commit covering trusted entitlement versions, current daily site/account counter and bonus credit aggregate. Retry conflicts only; ambiguous network commit does not authorize another provider attempt.
- [ ] Run same suites; require pass. Commit `feat: enforce trusted tier allowances and bonus credits`.

### Task 6: Plan & Usage and code redemption UI

**Files:** Create plan-usage.js, plan-usage.css; modify app.html, app.js, ai-request.js, cloudflare/public-assets.json; tests/plan-usage.test.mjs.
**Interfaces:** `mountPlanUsage({root,auth,request,onStatus})->{refresh,destroy}`; request uses existing Firebase/App Check transport; onStatus updates sidebar badge. No client billing truth.

- [ ] Write failing tests: signed-out/unavailable/pending states; no upgrade when unconfigured; generic code rejection; repeated submits disabled; redeemed expiry displayed; stale account response discarded; paid code warning shown before submit.
- [ ] Run `node --test tests/plan-usage.test.mjs`; require failure.
- [ ] Implement Settings panel with allowance/Brisbane reset/bonus usage/status/verified price/cancellation dates; Upgrade/Portal/redeem actions. Use safe textContent, visible labels/focus, live success/error text and cleanup. Display “Access codes do not change subscription billing” before redemption for paid accounts. No placeholder ad button.
- [ ] Refresh after AI admission/relevant billing actions without permanent listeners. Preserve chat switching/persistence and desktop mobile-block behaviour.
- [ ] Run tests and preview asset build; require pass. Commit `feat: add plan usage and access code settings`.

### Task 7: Rules and configuration verification

**Files:** Create docs/billing-operations.md and tests/billing-rules.test.mjs; modify package.json, wrangler.jsonc, .dev.vars.example and documented Firestore rules source after retrieving actual deployed rules.
**Interfaces:** No new public API; test/build scripts include all new suites.

- [ ] Write rules tests: authenticated owner, other account and unauthenticated browser all denied reads/writes to every new server-only collection; existing legitimate task/chat writes remain permitted.
- [ ] Run rules tests against captured real rules with Firebase emulator; confirm any new-rule regression fails.
- [ ] Implement only necessary deny rules without weakening existing rules. Document schema/flag migration, secrets, mode isolation, operator code commands, access-code overlap, expiry/revocation, Stripe promos, provider-spend cap and rollback.
- [ ] Run emulator rules tests, `npm test`, `npm run build:cloudflare`, `npx wrangler deploy --env preview --dry-run`; require successful runtime/bundle results. Verify secret scanning on patch without printing secret matches. Commit `test: verify private billing storage and launch controls`.

### Task 8: Sandbox acceptance and reviewed release

**Files:** Create verification report in outputs; fix only evidenced issues with corresponding regression tests. Document tested versions and real versus fixture-only checks.

- [ ] Prepare concrete tested branch/PR diff. Request independent whole-branch review per requesting-code-review skill; resolve findings and rerun affected suites.
- [ ] Set up isolated Stripe sandbox, owner claims it if needed; create test product/recurring price chosen solely for sandbox, configure signed webhook via local forwarding or separate sandbox ingress while preview Access remains protected.
- [ ] Test Checkout with Stripe test payment details and promo, webhook-granted coverage, account-owned Portal, renewal failure, cancellation, code issue/redeem/retry/revoke and feature-grant resolution. Empty feature catalog must refuse invented features.
- [ ] In protected preview, verify authenticated status/redemption, actual Firestore mutations, reload, pending/error/exhausted states, keyboard use, task creation and chat switching/persistence. If agent browser auth remains blocked, request the owner's specific live acceptance and label limitation.
- [ ] Finish reviewable commit and checks before exact branch publication/credential transfer approval where automatic approval requires it. Do not activate real payments in this task.
- [ ] Publish only approved destination; attach created PR; merge only after checks/review/preview acceptance. Confirm automatic deployment and unchanged trial limits; billing purchases and tier-enforcement remain disabled.
- [ ] Record remaining live launch inputs: price/currency, real Stripe onboarding, tax registrations decision, approved live keys/price/webhook, allowance selection and final live activation.

## Self-review

All spec sections map to Tasks 1–8; promo and redemption codes map to Tasks 2, 3 and 6. Rewarded ads, credit purchases, additional paid tiers and a public owner dashboard are explicitly deferred. Shared functions/types above are the source of truth across tasks. All five Review Focus conditions have named tests. Development may deliver tested disabled code before Stripe onboarding; report fixture-only results honestly rather than treating them as sandbox acceptance.
