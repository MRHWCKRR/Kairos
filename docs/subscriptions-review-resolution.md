# Subscription review resolution — 11 October 2026

Independent read-only review covered base `3cb3380` through `b4af5ee`. The reviewer independently ran the billing suite: 42 passed, one explicit network-only skip. Six Critical/Important findings were verified with failing regression tests and corrected in one pass. No second review was requested.

| Finding | Resolution and evidence |
| --- | --- |
| Checkout surviving account deletion | Expire all open customer sessions before cancellation, handle completion winning expiration, retain only an opaque deleted-customer routing tombstone and cancel delayed subscriptions through signed events. Actual SDK HTTP-boundary regression failed before the fix and passed afterward, including signed late completion. |
| Expired lease overwriting current billing | Account mutations conditionally commit lease ownership together with affected documents. Expired or superseded holders fail and delivery retries fetch current Stripe state. Fixture clock advanced 90,001 ms; stale active snapshot could not overwrite successor cancellation. RED→GREEN. |
| Refunded invoice removing independent clean coverage | Track invoice risk separately from lifecycle; invalidate only that invoice's coverage. Clean replacement coverage remains; active renewal still triggers redemption warnings. Two covering-invoice and risk-state regressions RED→GREEN. |
| Changing idempotent Checkout parameters | Derive the integration identifier from the existing scope/account/request HMAC; retain the browser's operation ID during retries. Mapping persistence failure followed by retry sends identical creation parameters. RED→GREEN. |
| Concurrent redemption exceeding 256 grants | Check capacity and validate the complete aggregate against the exact reloaded version committed. Interleaved last-slot test RED→GREEN. |
| Zero-decimal price misstatement | Format the amount using Stripe charge units, including its special ISK/UGX conventions. JPY 1,000 displays 1,000. RED→GREEN. Reference: [Stripe currency conventions](https://docs.stripe.com/currencies). |

Final automated verification: 235 passed, one explicitly skipped network-only rules test in the offline suite. The same rules check separately passed against current deployed rules using 158 nonpersistent cases. Cloudflare build and preview dry-run passed; no deployment occurred.

Deferred minor findings: previous-account sidebar badge can remain while a new account's status is loading (panel and response identity guards remain); Plan CSS uses two undefined theme tokens (actual dark-theme browser fixture remains readable).

The reviewer declined to judge test-to-live data migration and actual sandbox/preview acceptance. Rulings: reserve production billing scope for first live data, with an explicit migration design required if that boundary is violated; require real sandbox and authenticated preview evidence before merge. Fixture evidence is not live acceptance.

## Implementation rulings

1. Reuse the dedicated clone/new branch instead of another worktree. Cost if wrong: local branch interference.
2. Refine the narrow store adapter for atomic entitlement/counter updates. Cost: adapter complexity.
3. Implement usage/credit spending with tier admission in Task 5. Cost: later status integration.
4. Pin Stripe 23.0.0/API 2026-09-30.endive after current official/installed verification. Cost: newer API compatibility.
5. Handle raw webhooks natively and bring the deletion browser transport forward. Cost: another browser module to verify.
6. Preserve recent-login deletion for unverified accounts; restore won-dispute access only from current coverage. Cost: suspension timing requires careful checks.
7. Use LinkeDOM only in tests. Cost: browser behavior still needs separate acceptance.
8. Use Firebase's nonpersistent Rules API when Java/emulator is unavailable. Cost: live client context must still be validated before launch.
9. Reserve production for first live billing data; do not migrate test mappings implicitly. Cost if wrong: mode/customer conflicts.
10. Treat external sandbox and preview checks as a separate acceptance gate. Cost: merge waits for that evidence.
