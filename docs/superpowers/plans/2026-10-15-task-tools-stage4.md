# Additional Task Tools - Stage 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task with RED/GREEN verification.

**Goal:** Add ordinary-task duplication, field-specific bulk edits, selected-group dragging and section-space context actions.

**Architecture:** A focused tools model delegates existing creation/metadata validation through the current atomic command model. Existing interactions retain one pending receipt, guarded Undo and recovery; a small field dialog gathers one value. Group dragging uses the same batch Move. The shared menu gains section context through injected section callbacks.

**Tech Stack:** Existing vanilla modules/CSS, Node/linkedom, current Firebase transaction queue. No framework/dependency/auth/billing changes.

**Spec:** `docs/superpowers/specs/2026-10-15-task-actions-selection-design.md`, Stage 4.

## Global Constraints

- Up to 50 exact, unique task IDs per operation; all-or-nothing validation, one stable receipt/Retry and ownership guards.
- Duplicate creates fresh task/checklist IDs once, resets all progress, excludes recurrence/exceptions/history, and creates unscheduled ordinary tasks. Reuse ordinary creation/metadata checks; do not invent plan tiers or task-count limits.
- Field tools change scheduled date, deadline, priority, duration, reminder or AI lock only, using existing field validation and scheduling constraints. Ordinary-task tools direct recurring parent edits to Details/Schedule.
- Metadata Undo restores guarded field values; Duplicate follows current quick-create behavior without creation Undo.
- Group dragging begins only on a selected task grip; preserve visible traversal order, show group/count, use batch Move and its guarded inverse, cancel without writes on Escape/outside/identity/view/sorted changes.
- Section menus only override real section space; offer Add task, Select tasks in section and Collapse. Preserve native editors and page menus.
- Retain pending Move editor protection, confirmed rewards and exact Retry. No production merge/deploy; stack on Stage 3.

## Review Focus

1. Duplicate source metadata/checklists change or generated IDs collide before save: reject the entire batch and never regenerate IDs on Retry (Task 1).
2. One duration overflows midnight, one date cannot be cleared, or a recurring parent enters a field batch: reject all, preserve unrelated fields/drafts (Task 2).
3. Undo follows a concurrent field/start/order change: validate relevant values without overwriting unrelated edits (Task 2/3).
4. Selection changes, a member disappears or view/account/planner changes during a drag/dialog: retain captured targets or cancel safely (Task 3/4).
5. Section blank-space versus nested task/editor/control right-clicks: route one menu with correct scope and preserve native behavior/focus (Task 4).

### Task 1: ordinary Duplicate

**Files:** New `task-tools-model.js`, `tests/task-tools-model.test.mjs`; extend model dispatch, interaction command acceptance, action registry and asset manifest.

**Interfaces:** `buildTaskTool(state,action,taskIds,options)` exported from `task-list-model.js` delegates to focused helpers. `{type:'task_tool',action:'duplicate',taskIds,copies}` captures generated task/checklist IDs plus expected source locations/metadata. `applyTaskListCommand` applies atomically using existing `create_task`/`edit_task` validation; compact result exposes newly created IDs and no completion awards.

- [x] Write failing tests: reset/unschedule/whitelist copy, fresh checklist IDs, recurring/duplicate/collision/stale source rejection, 50/51 bounds and lost-response replay.
- [x] Run tools/model/store tests; expected missing tools API failures.
- [x] Implement deterministic command generation and validated creation on a clone; no creation Undo, matching quick-add.
- [x] Run tests; expected all pass. Commit `feat: add ordinary task duplication through atomic commands`.

### Task 2: bulk field tools and dialog

**Files:** Extend tools model; new `task-tools-dialog.js`, tests; modify interactions, action registry, host, translations and assets.

**Interfaces:** `task_tool` action `edit` carries one `field` and `value`, with expected per-task normalized field values/locations. Private `restore_task_fields` runs only inside expiring Undo. `openTaskFieldDialog({field,label,count,initialValue,onSubmit,onClose,document})` returns a disposable dialog; invalid input stays with a readable status. Interactions expose `runTaskTool(id,{taskIds},sourceElement)`; registry IDs `duplicate`, `set-date`, `set-dueDate`, `set-priority`, `set-durationMinutes`, `set-reminderMinutes`, `set-scheduleLocked` are offered only when adapter exists.

- [x] Add failing tests for each field, mixed values, clear/null rules, recurrence/scheduling conflicts, metadata preservation/Undo, cancellation and stale dialog/session guards.
- [x] Run tools/dialog/interaction/registry tests; expected missing field/dialog/adapter failures.
- [x] Implement through existing command queue, pending receipts and dirty-details guard; disable mutations while pending. Preserve original expectations across dialog awaits. Field edits are confirmed, without unsafe schedule previews.
- [x] Run tests; expected all pass. Commit `feat: add guarded bulk task field tools`.

### Task 3: selected-group dragging

**Files:** Extend batch Move builder/model with optional anchor; interactions selection injection/count styling; tests.

**Interfaces:** `getSelectedTaskIds()` injected into interactions. Drag captures valid visible IDs, identity/view and source/destination orders at pointer-down. Optional batch Move destination `anchorTaskId`/`after` inserts the group as a unit; menu Move still appends.

- [x] Add failing tests: visible group order, same/cross-section insertion, hidden anchors, unselected single drag, count, selected-anchor rejection, size/sorted restrictions, Escape/outside and stale order/session cancellation, one Retry/Undo.
- [x] Run batch/interactions tests; expected missing group behavior.
- [x] Implement using the existing drag lifecycle and atomic batch Move; pending editor protection applies unchanged.
- [x] Run tests; expected all pass. Commit `feat: drag selected tasks as one guarded group`.

### Task 4: section context and final integration

**Files:** Shared menu, workspace/selection callbacks, host/loader/cache versions, i18n/CSS/manifest, CI base filter, task docs and tests.

**Interfaces:** Optional menu `resolveSection` and `sectionActions` consume `{scope:'section',section:{boardId,sectionId},taskIds:[],ownerId,planId}`. Section callbacks use existing open/collapse/navigation and selection owner. No second popup/listener owner.

- [x] Add failing tests for blank-space/native contexts, exact section IDs across boards, Add/Select/Collapse, pending/identity/view navigation, repeated mounting and all existing task menu paths.
- [x] Run relevant suites; expected missing section support.
- [x] Wire callbacks, add translations and cache/asset updates; enable hosted CI against Stage 3 base. Update docs/ledger.
- [x] Run full tests/build/runtime/dry-run/diff/syntax; report unavailable live browser/auth checks. Commit `feat: complete task tools and section context actions`.
- [ ] One fresh whole-branch review; fix Important/Critical findings in one RED/GREEN pass, then publish stacked PR and verify hosted CI. No second review or merge/deploy.

## Self-review and execution

Each approved Stage 4 feature maps to one task and its tests; command/result interfaces agree. Native execution continues under the user's request. Creation/field validation is reused, persistence remains central, and recurring-series duplication remains a later explicit scope.
