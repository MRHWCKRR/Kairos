# Kairos live billing preparation

Prepared 23 October 2026. Active production remains STRIPE_MODE=test. Real purchases have not been enabled or tested.

## Live resources

Account: Byte By Byte, acct_1U77MSBomvKO9FIz (livemode=true).
Product: prod_V7MATm8atEwsPj, renamed Kairos Plus.
Monthly: price_1U77phBomvKO9FIzhMj3zClC, AUD 799 cents per month (reused existing live price).
Yearly: price_1UThVxBomvKO9FIzYAVHQqQP, AUD 7,990 cents per year.
Portal: bpc_1UThW4BomvKO9FIzaVodKEUy, active default; invoice history, payment-method updates and period-end cancellation enabled; subscription price/quantity changes disabled.
Webhook: we_1UThWNBomvKO9FIzRFs4UiId, currently DISABLED; https://kairos-web.kirosapp.workers.dev/api/billing/webhook, API 2026-09-30.endive, only the 19 supported billing events. Signing secret is staged in kairos-web encrypted STRIPE_LIVE_WEBHOOK_SECRET; never copy its value into source, chat or logs.

## Staging and isolation

STRIPE_LIVE_PLUS_PRICE_ID and STRIPE_LIVE_PLUS_YEARLY_PRICE_ID are committed non-secret bindings. Live mode uses these and the encrypted STRIPE_LIVE_SECRET_KEY / STRIPE_LIVE_WEBHOOK_SECRET. Test mode ignores live bindings and continues using existing sandbox credentials, prices and webhook.

Live billing documents use production-live- or preview-live- prefixes. Existing test records retain their existing production- and preview- prefixes. The transport rejects cross-mode paths. Customer mappings, entitlements, grants, events, leases and deletion tombstones stay isolated. Test subscriptions do not grant paid coverage in live mode. AI usage counters remain shared across the mode switch so usage cannot reset through a billing cutover. Never delete usage snapshots or copy sandbox billing records into live namespaces.

## Remaining activation blockers

Stripe reported charges_enabled=false, payouts_enabled=false and requirements.disabled_reason=requirements.past_due. The account owner must resolve outstanding requirements in Stripe Dashboard; do not submit guessed business or identity details. Recheck the account before enabling real payments.

The owner must create a LIVE restricted API key in acct_1U77MSBomvKO9FIz and store it directly in the production Worker as encrypted STRIPE_LIVE_SECRET_KEY (rk_live_ prefix). The existing sandbox STRIPE_SECRET_KEY stays in place. Read permissions: Prices, Invoices, Invoice Payments, PaymentIntents, Charges and Disputes. Write permissions: Customers, Checkout Sessions, Billing Portal Sessions and Subscriptions. Never paste the key into chat. The Stripe MCP connection does not supply application API credentials.

Once account activation and the live key are verified, a controlled cutover changes STRIPE_MODE to live in source and deployment, enables the staged live webhook, disables sandbox webhook delivery to production, and validates price retrieval, signed fulfillment and portal return. Verify the live key against the live prices before making checkout available. Keep billing disabled during any partial cutover; do not describe a successful return URL as paid fulfillment. Retain sandbox resources for preview testing. No real charge or subscription is authorized by this preparation alone.
