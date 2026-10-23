
# Connected Stripe sandbox

Test account: Byte By Byte sandbox, acct_1U77MZPX3ScSvSEm.
Product: prod_V7MATm8atEwsPj (Kairos Plus, sandbox).
Monthly: price_1U77RyPX3ScSvSEmRHfq8vUQ, AUD 7.99.
Yearly: price_1UTdu1PX3ScSvSEmLQ08zosd, AUD 79.90.
These are test amounts, not approved launch prices.

Only env.preview enables billing with these Prices. Production purchases and tier enforcement remain disabled. The connected sandbox differs from the old preview sandbox; its API key must replace STRIPE_SECRET_KEY on kairos-web-preview. ChatGPT's Stripe connection does not install application credentials.

Create a sandbox restricted API key in the Stripe Dashboard. Grant read access to Prices, Invoices, Invoice Payments, PaymentIntents, Charges and Disputes; write access to Customers, Checkout Sessions, Billing Portal Sessions and Subscriptions (needed for account deletion cancellation). Put it directly into the Cloudflare preview Worker's encrypted STRIPE_SECRET_KEY binding. Never put keys in chat, source files, browser code or logs.

The public kairos-billing-sandbox-webhook Worker accepts only POST /api/billing/webhook and a bounded payload with a Stripe-Signature header. It forwards only the original payload/signature to the private kairos-web-preview service binding. The preview handler verifies the signature, test mode, API version, customer ownership and durable event processing as before. Other routes, browser cookies and authorization headers cannot pass through this endpoint. Cloudflare Access on the preview remains enabled.

Deploy the ingress using wrangler deploy --config wrangler.sandbox-webhook.jsonc. It is a separate Worker from the app and has no production service binding. Configure the Stripe sandbox webhook at https://kairos-billing-sandbox-webhook.kirosapp.workers.dev/api/billing/webhook using API 2026-09-30.endive and only the events handled in server/billing-webhook.js. Its signing secret belongs only in the preview STRIPE_WEBHOOK_SECRET binding.

Actual signed fulfillment, Checkout, declined payment and Portal cancellation verification must be recorded after the preview key is installed. Do not describe mock/DOM checks as completed Stripe payments.

Portal: bpc_1UTdzbPX3ScSvSEmARupbShA is the active default sandbox configuration. Invoice history, payment method updates and period-end cancellation are enabled. Price/quantity changes are disabled pending dedicated proration coverage tests.

Validation: 1,284 local regression tests passed with one network-only rules skip; the Cloudflare build passed. The webhook route tests verify body bounds, signature forwarding, credential stripping and fixed preview scope. Actual Checkout and signed fulfillment are still pending installation of the connected sandbox API key.
