# Shared Planner Workflows Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development to implement tasks with independent reviews.

Goal: finish shared mutation paths, standardise retained save recovery, extract focused shell modules, and test persistence interactions.
Architecture: preserve vanilla JS and Firebase transactions. Translate UI intent into validated commands rather than mutating live planner objects. Reuse operation receipts and owner/plan-scoped recovery; keep settings, notifications and dashboard orchestration in focused modules with explicit dependencies.
Tech Stack: JavaScript ES modules, Firebase, node:test, linkedom, browser CI, Cloudflare.
Spec: user's authorised four priorities in this conversation (2026-10-26).

## Global Constraints
- Preserve Firebase auth, verification, App Check, planner ownership, saved completed-task rescheduling policy and Stripe test mode.
- Preserve per-occurrence recurrence identity, scope previews, finite series and split behaviour.
- Retain edits across interrupted saves; never replay another account's work, duplicate an acknowledged command, or overwrite conflicting edits.
- Use existing controls and visual language, keyboard access and accessible save feedback.
- Keep source files under sources/ read-only and leave existing untracked logs untouched.

## Review Focus
- Account/plan switch during submission cannot update the new account's UI or submit retained work there.
- Lost acknowledgements retry the same command identity and apply once.
- Recurring occurrence edits, series splits and Undo preserve unrelated edits and history.
- Conflicts preserve drafts and expose recovery instead of optimistic rollback of somebody else's work.
- Extracted modules retain setup order, lazy pages and teardown rather than creating duplicate listeners.

### Task 1: Shared Schedule inspector commands
- [ ] Add pure inspector/recurrence command builders and validators; use existing edit/complete/archive/move/schedule commands wherever suitable.
- [ ] Route regular inspector saves and recurring status/edit/delete actions through persistTaskListCommand via the existing bridge. Bulk actions already using task_batch must stay there; migrate any actual bypass discovered.
- [ ] Validate expected source data/locations, saved scheduling policy, recurrence scope and generated IDs at transaction application. Do not trust arbitrary replacement state.
- [ ] Preserve drafts, scope previews and explicit delete/archive semantics. Tests must first fail for a real missing command or unsafe path, then pass.
- [ ] Verify focused inspector, recurrence, bulk and plan-store persistence tests, commit and review.

### Task 1b: Remaining Schedule entry points (audit addition)
- [ ] Route rich Schedule task creation and default-section creation through one atomic validated command.
- [ ] Route reviewed ordinary/occurrence AI proposal batches through shared commands, preserving safe dependent moves and rechecking saved availability on transaction state.
- [ ] Retain exact IDs and command payloads for explicit retry; preserve forms/previews until confirmation.
- [ ] Verify invalid/archived/stale inputs, work hours, safe swaps and lost acknowledgements; commit and review.
### Task 2: Shared mutation recovery
- [ ] Harden createMutationSession and integrate a single account/plan-scoped retained operation into inspector/task mutation callers while preserving caller identities on retries.
- [ ] Standardise pending/offline/conflict/interrupted feedback, retry, draft preservation and prevention of overlapping saves. No automatic replay on reconnect.
- [ ] Add integration tests with real planner command persistence and receipt handling for lost acknowledgement, stale edits and account switch; verify then commit and review.

### Task 3: Extract app shell responsibilities
- [ ] Extract notification persistence/rendering, settings recovery orchestration and dashboard orchestration into focused modules using explicit dependency injection.
- [ ] Retain one existing listener/render path for each responsibility, setup order, lazy loading, error states and account reset.
- [ ] Register new public modules in build assets and update release import versions consistently.
- [ ] Verify behaviour using existing coverage plus meaningful integration tests for extracted lifecycle boundaries; build then commit and review.

### Task 4: Persistence and browser regression coverage
- [ ] Extend the in-memory Firebase transaction fixture and actual production-module browser journey for recurrence, concurrent edits, lost acknowledgements, account/plan switches and guarded Undo.
- [ ] Run npm test, browser journey and Cloudflare build/runtime CI; record environment limitations faithfully.
- [ ] Independent whole-branch review; fix Important/Critical findings and rerun affected checks.
- [ ] Publish reviewable PR; this is a broad architectural change, so present the checked PR before merge/deploy.
