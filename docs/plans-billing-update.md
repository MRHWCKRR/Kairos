# Plans and billing update

Scope: finish the existing Plans page with monthly/yearly choices, a useful Free/Plus comparison, visible account status, and checkout/portal return feedback. Keep the vanilla frontend and existing authenticated, App Check protected billing routes.

Extend the current controller and Stripe client rather than adding a second billing implementation. Prices and purchase availability come only from server-verified Stripe Prices. No price or paid benefit is invented. Optional STRIPE_PLUS_YEARLY_PRICE_ID uses a one-year licensed recurring Price. Existing monthly configuration remains compatible. Both prices reconcile the same Plus entitlement, including old annual paid invoices.

Checkout returns directly to Plans. Cancellation clears local purchase intent; success remains pending until server-confirmed paid coverage; payment problems link to the account-owned portal. Block duplicate actions, stale-account updates and unknown destinations. The selected interval is rechecked before checkout.

Use calm existing surfaces, clear spacing, a semantic comparison table, a keyboard-accessible interval selector and light/dark tokens. Public purchases and tier enforcement remain disabled.

Validation: behavioral DOM tests, checkout request/price/concurrency tests, annual invoice/refund reconciliation, full hosted tests/builds, rendered UI and actual Stripe sandbox verification when a sandbox connection is available. Record the distinction between fixtures and actual Stripe results.

## Verification

- Local regression suite: 1,277 passing; one network-only rules check skipped. Windows Workers runtime is checked in hosted Linux CI.
- Chromium rendered the actual Plans HTML/CSS/controller with fake account and Stripe responses, in light/dark mode at 1120, 1366 and 1920 pixels. Keyboard Tab/Enter selected the billing interval; no horizontal overflow or JavaScript exceptions. Fixture prices are examples, not configured Kairos prices.
- Annual invoice/refund coverage, canceled/pending returns, withdrawn offers, account guards, repeated clicks, interval replacement, and lost mapping recovery have behavioral tests.
- Actual Stripe sandbox checkout is outstanding: the available connector currently exposes only a live-mode account. No live charges, prices, credentials, policy flags or tier enforcement were changed.
