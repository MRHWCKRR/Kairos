# Atomic Task Bulk Actions - Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete, mark incomplete, move or archive up to 50 selected tasks through one atomic, recoverable operation.

**Architecture:** Extend the existing pure task command model with a bounded batch and its guarded inverse. The current plan transaction/receipt queue persists it once; existing interactions own confirmation, preview, Retry and Undo. The action registry and selection toolbar expose only eligible batches.

**Tech Stack:** Existing vanilla modules, Node/linkedom tests and Firebase transaction host; no new dependency or persistence path.

**Spec:** `docs/superpowers/specs/2026-10-15-task-actions-selection-design.md`, Stage 3 only.

## Global Constraints

- Maximum 50 unique task IDs, exact ownership/location and affected-value validation; one invalid member rejects the entire batch before any write.
- Explicit Complete and Mark incomplete labels for mixed status. Any recurring parent disables batch completion with Schedule guidance.
- Move preserves selected visible traversal order and appends to destination. Unselected/hidden tasks retain relative order and fields.
- One stable receipt and affected IDs; retries reuse command, expectations and identity. Receipt eviction cannot permit replay.
- One guarded ten-second Undo after confirmation, restoring only affected fields/location/order and preserving newer unrelated metadata.
- Display-only completion/move preview starts only after model conflict/rollback tests pass; canonical data, rewards and Undo remain confirmation-driven.
- Selection/Clear/Copy remain usable during recovery; mutations cannot bypass pending work. No bulk metadata edits, Duplicate or group dragging.
- Keep Stage 3 separate from unmerged Stages 1/2; stacked PR targets Stage 2. No merge or production release.

## Review Focus

1. A second section changes while a multi-source move dialog is open: reject stale orders without moving a subset (Tasks 1/3).
2. Lost response, transaction callback replay, remount and receipt floor eviction: never apply or reward a batch twice (Task 2/3).
3. Undo after an unrelated title edit, affected status change or newer section order: preserve the title and reject stale affected state (Tasks 1/3).
4. A recurring parent, duplicate ID or 51st task enters a selected set: explain ineligibility and never split into individual writes (Tasks 1/3).
5. Account/planner/view changes while confirmation or dirty-details guard awaits: no stale mutation/focus into the new scope; selection remains independent during pending recovery (Task 3).

### Task 1: pure batch model and inverse

**Files:** `task-list-model.js`; new `tests/task-list-batch.test.mjs`.

**Interfaces:** Export `buildTaskBatch(state,action,taskIds,destination?) -> {command,expected}`. Command is `{type:'task_batch',action:'complete'|'incomplete'|'archive'|'move',taskIds,destination?}`. Expectations carry exact task locations/affected flags and, for moves, all affected section orders. `applyTaskListCommand` dispatches batches atomically and returns `result:{type,action,taskIds,completedTaskIds,affectedCount,inverse}`. Private `restore_task_batch` inverses execute only inside the existing expiring Undo wrapper.

- [ ] Write failing tests: mixed explicit status, all-or-nothing conflict, invalid/duplicate/missing/archived IDs, 50/51 bounds, recurring completion, multi-source move including members already at destination, hidden order preservation, metadata-preserving inverse, changed flags/order/expired inverse rejection.
- [ ] Run `node --test tests/task-list-batch.test.mjs`; expected missing builder/batch failures.
- [ ] Implement validation, clone-before-apply and compact ID/order inverses in the current model. Never store full task snapshots in an inverse.
- [ ] Run batch/model/ordering tests; expected all pass. Commit `feat: add atomic bounded task batch commands`.

### Task 2: durable results, replay and confirmed rewards

**Files:** `plan-store.js`, `app.js`, `tests/task-list-store.test.mjs`, `tests/task-detail-host.test.mjs`; extend test fixture only if needed.

**Interfaces:** Existing `persistTaskListCommand` persists batch commands unchanged. `receiptResult` retains batch action, selected IDs and newly completed IDs without full task payloads. Receipt history remains capped at 100 and additionally 65,536 serialized characters; evictions advance the existing floor. `recordTaskListCompletion` handles confirmed batch result IDs through existing counted-task deduplication. `logTaskCompletionForStats(count=1)` aggregates a batch in one statistics update.

- [ ] Add failing tests for lost response after commit, transaction callback replay, one receipt/write, wrong ownership/conflict/size rejection, compact/evicted receipts and exact retry rejection at floor; host rewards count only newly completed IDs once, never Undo/incomplete/archive or unconfirmed previews.
- [ ] Run store/host tests; expected failures for missing batch receipt fields/rewards.
- [ ] Implement compact batch receipts, bounded retention and existing confirmed reward callback extension. Preserve auth/plan queue guards and unrelated edits.
- [ ] Run store/host/batch tests; expected all pass. Commit `feat: persist batch receipts and confirmed completion rewards`.

### Task 3: bulk UI, confirmations and recovery

**Files:** `task-list-interactions.js`, `task-actions.js`, `task-selection.js`, `app.js`, `i18n.js`, `page-loader.js`, `app-bootstrap.js`, CI base filter, task docs and relevant tests.

**Interfaces:** Interactions expose `runTaskBatch(action,{taskIds},sourceElement) -> Promise<boolean>`. Extend the existing destination dialog for captured batch IDs/order expectations; Archive confirms the selected count. Existing execute/reconcile/undo handle the batch and its one inverse/receipt. Registry optional `runTaskBatch` adds `bulk-complete`, `bulk-incomplete`, `bulk-move`, `bulk-archive`, with size/pending/recurrence/sorted explanations. Toolbar exposes Complete/Mark incomplete and Move, with Archive under More. No fake bulk support when no adapter is injected.

- [ ] Add failing tests for menu/toolbar eligibility, mixed/recurring/oversize sets, pending selection vs blocked saves, one command per activation, completion/move preview rollback, exact Retry/remount, confirmed-only Undo, dirty details and Archive count/identity, stale dialog destination/source orders and view changes.
- [ ] Run interactions/actions/selection/menu tests; expected missing batch adapter/UI failures.
- [ ] Implement through existing queue and chooser; capture expectations before awaits. Update relevant cache URLs/translations and allow the Stage 2 PR base in CI. Preserve single-task controls and behavior.
- [ ] Run targeted and full regression/build/runtime/dry-run checks. Expected all applicable checks pass; use hosted CI for the already-observed local Workers startup restriction. Attempt browser checks only with available tools and report unverified browser/account behavior.
- [ ] Update task docs/ledger; commit `feat: connect selected tasks to atomic bulk actions`.
- [ ] Obtain one fresh whole-branch review; fix Important/Critical findings in one RED/GREEN pass; publish the stacked PR and verify full hosted CI. No second review or production release.

## Self-review and handoff

All Stage 3 requirements map to the model, persistence/rewards, or UI/recovery tests. Shared command/result names agree. Native execution continues under the user's instruction; the approved design remains binding. Stage 4 is excluded.
