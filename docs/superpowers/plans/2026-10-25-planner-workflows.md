# Planner workflows implementation plan
Goal: Continue the approved Quick Add Everywhere scope on upstream 528d8f24.
Architecture: Keep vanilla JS, Firebase ownership and existing planner transactions. Extend focused modules; never add a second planner listener. Live Stripe setup remains deferred.
Spec: User's approved four feature priorities and four code priorities in this conversation.
Constraints: Preserve auth, billing, recurrence, concurrent chat requests, and sources/ references.

- [x] Today: today-model.js, today-view.js and today-view.css; group overdue, today's work/events and unscheduled tasks. Dates use the profile timezone. Open Details/Schedule, complete ordinary tasks and schedule work for today through shared commands. Contextual Quick Add defaults preserve drafts.
- [x] Recovery: planner-backup.js extracts versioned exports; archive remains the recovery destination. AI task/section/board deletion archives instead of destroying work. Restore through guarded commands.
- [x] Mutation recovery: mutation-session.js retains owner/plan-scoped pending commands before saving, retries the identical operation, refuses overlaps and clears only its own record. Show offline/error/success and explicit retry controls.
- [x] AI review/undo: every AI mutation gets a before/after preview. Reject stale approvals. Store bounded field-level inverse changes on receipts; undo checks affected fields and preserves unrelated edits. Expose explicit reviewed undo.
- [x] Regression: model, DOM journey and transaction tests for create/complete/plan/archive/recover/retry and AI previews/undo. Run complete suite and Cloudflare build.

Review focus: duplicate submits; lost acknowledgement after commit; account/plan switches mid-save; stale concurrent edits; recurring occurrence identity; malicious titles; large plans and export failures.
Progress: Inspected current upstream; Quick Add, export, Archive and planning Undo already exist. Existing dirty checkout is preserved. A separate local snapshot was prepared via GitHub because shell DNS is unavailable.


Verification: 1,326 tests passed, one skipped with the loopback-dependent Cloudflare runtime test excluded; npm run build:cloudflare passed; git diff --check and changed-module syntax checks passed. The full suite was attempted and the runtime test failed on sandbox EACCES at 127.0.0.1:9229. Headless browser journey and full runtime checks are included in CI.
Review: independent review found three Important issues (schedule dependency guards, moved recurrence projection, creation review completeness); each was reproduced RED and fixed GREEN. A further concurrent-review cancellation regression was reproduced and fixed with a serialized review queue. No Critical issues or deferred minors.
