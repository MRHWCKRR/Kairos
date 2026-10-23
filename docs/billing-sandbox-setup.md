
# Connected Stripe sandbox

Test account: Byte By Byte sandbox, acct_1U77MZPX3ScSvSEm.
Product: prod_V7MATm8atEwsPj (Kairos Plus, sandbox).
Monthly: price_1U77RyPX3ScSvSEmRHfq8vUQ, AUD 7.99.
Yearly: price_1UTdu1PX3ScSvSEmLQ08zosd, AUD 79.90.
The owner has provisionally approved the same AUD 7.99/month and AUD 79.90/year amounts for live billing; see billing-live-setup.md.

Both kairos-web and kairos-web-preview currently enable sandbox checkout with these Prices and STRIPE_MODE=test. Daily/weekly tier allowances are enforced. Real payments are not enabled. Each Worker's STRIPE_SECRET_KEY must belong to the connected sandbox; ChatGPT's Stripe connection does not install application credentials.

Create a sandbox restricted API key in the Stripe Dashboard. Grant read access to Prices, Invoices, Invoice Payments, PaymentIntents, Charges and Disputes; write access to Customers, Checkout Sessions, Billing Portal Sessions and Subscriptions (needed for account deletion cancellation). Put it directly into the Cloudflare preview Worker's encrypted STRIPE_SECRET_KEY binding. Never put keys in chat, source files, browser code or logs.

The public kairos-billing-sandbox-webhook Worker accepts only POST /api/billing/webhook and a bounded payload with a Stripe-Signature header. It forwards only the original payload/signature to the private kairos-web-preview service binding. The preview handler verifies the signature, test mode, API version, customer ownership and durable event processing as before. Other routes, browser cookies and authorization headers cannot pass through this endpoint. Cloudflare Access on the preview remains enabled.

Deploy the ingress using wrangler deploy --config wrangler.sandbox-webhook.jsonc. It is a separate Worker from the app and has no production service binding. Configure the Stripe sandbox webhook at https://kairos-billing-sandbox-webhook.kirosapp.workers.dev/api/billing/webhook using API 2026-09-30.endive and only the events handled in server/billing-webhook.js. Its signing secret belongs only in the preview STRIPE_WEBHOOK_SECRET binding.

The owner reported successful monthly/yearly sandbox checkout, declined-payment handling and portal cancellation on the main site. These are user-reported browser checks, not an independently audited live payment. Production sandbox webhook: we_1UTgtjPX3ScSvSEm0Ofev6wu, delivering directly to the main site /api/billing/webhook with a separate signing secret.

Portal: bpc_1UTdzbPX3ScSvSEmARupbShA is the active default sandbox configuration. Invoice history, payment method updates and period-end cancellation are enabled. Price/quantity changes are disabled pending dedicated proration coverage tests.

Validation: 1,284 local regression tests passed with one network-only rules skip; the Cloudflare build passed. The webhook route tests verify body bounds, signature forwarding, credential stripping and fixed preview scope. The connected sandbox API key is installed. See the user-reported test results above and billing-live-setup.md for the staged live cutover.
