# Reminder reliability

Keep the existing client-side reminder model and Firebase transactions. The review reproduced missed bedtime reminders after delayed checks and across midnight, unscoped task receipts colliding between planners, and late browser notifications after switching planners.

- [x] Reproduce timing, receipt collision, and planner-switch failures before fixing them.
- [x] Collect bedtime windows in the profile timezone and deliver through the durable reminder transaction.
- [x] Scope new receipts and notification IDs to the planner while honoring existing task receipts.
- [x] Guard pending checks by account/planner, coalesce refresh requests, and check after saved edits.
- [x] Verify reload, transaction retry/failure, timezone/DST, rescheduling, and browser permissions.
- [x] Run the full suite and production build, obtain independent review, and prepare a PR.

Reminders still require Kairos to remain open. This change does not add a server push scheduler or a service worker.

Validation: 728 tests total, 727 passed, 1 existing skip; Cloudflare build passed. The 35-test reminder suite is included in both production build paths. Chrome checks used simulated Firestore transactions and browser notifications to verify denied/granted permissions, reload recovery, planner separation, rescheduling, failed transactions, lost responses, and toggles in a browser timezone different from the profile timezone. Independent review completed; the pending bedtime popup race was fixed with a regression test, and no findings remain.
