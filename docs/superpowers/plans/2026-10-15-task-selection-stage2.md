# Task Selection - Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add predictable multi-selection to both Tasks views without changing task persistence.

**Architecture:** A focused selection module owns transient IDs, range anchor, delegated gestures and a toolbar. The shared action registry and menu consume selected IDs, while existing interactions retain all mutation ownership. Selection reconciles against visible rows and exact canonical task locations.

**Tech Stack:** Existing vanilla JavaScript/CSS, Node tests and linkedom; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-task-actions-selection-design.md`, Stage 2 only.

## Global Constraints

- Selection is distinct from completion, focus and details; one owner across both Tasks views.
- Plain row-space click replaces; Ctrl/Cmd toggles; Shift replaces with inclusive same-section visible range; Ctrl/Cmd+Shift adds the range. Invalid anchor selects only the clicked task.
- Ctrl/Cmd+A selects visible workspace rows outside text fields. Escape clears only when no menu/dialog/drag owns Escape.
- Inputs, labels, editable content, links, buttons and grips retain their existing interactions.
- Right-click retains a selected set or replaces it with an unselected target. Native editing context menus survive.
- Refresh/reorder retains valid IDs; hidden, archived or missing tasks are pruned; view/account/planner changes clear IDs and anchor. No persistence or reload restoration.
- Stage 3 owns atomic bulk mutations. Stage 2 offers working single-task common actions and Copy titles/Clear for multiple tasks, without issuing sequential pseudo-batches.
- Keep Stage 1 and Stage 2 separately reviewable; Stage 2 PR is based on the Stage 1 feature branch. No merge or production deployment.

## Review Focus

1. A completed filter/collapsed parent or hidden retained surface changes: selection and ranges use only visible canonical rows (Task 1/2).
2. A title editor or nested completion-label SVG receives modified clicks: no selection or text-editing shortcut interception (Task 2).
3. A menu or drag consumes Escape: selection is retained until the next unclaimed Escape (Task 2/3).
4. Refresh replaces rows while a toolbar/menu is focused: no stale task targeting, duplicate listeners or focus loss on normal toolbar updates (Task 3).
5. A selected set changes identity or loses one target before activation: no stale copy or accidental single-task mutation from a multi-task menu (Task 3).

### Task 1: selection state

**Files:** Create `task-selection.js`, `tests/task-selection.test.mjs`.

**Interfaces:** `createTaskSelection()` returns `sync({rows,identity,viewKey})`, `select(taskId,{toggle,range,add})`, `selectAll()`, `clear()`, `ids()`, `has(taskId)`. Rows contain exact `taskId`, `boardId`, `sectionId`; `ids()` follows current visible traversal order. `sync` reports whether selection changed.

- [ ] Write tests for plain/toggle, forward/reverse/additive ranges, cross-board toggles, different-section/removed anchors, traversal after reorder, pruning and identity/view resets.
- [ ] Run `node --test tests/task-selection.test.mjs`; expected missing API failures.
- [ ] Implement pure state and inclusive same-section range calculation. Keep the anchor stable across valid ranges.
- [ ] Run the command; expected all pass. Commit `feat: add transient task selection state`.

### Task 2: gestures, accessible state and toolbar

**Files:** Extend `task-selection.js` and its tests; modify `task-list-workspace.js`, `task-list.css`, `tests/task-list-workspace.test.mjs`.

**Interfaces:** `mountTaskSelection({root,getIdentity,getViewKey,resolveTarget,isBlocked,translate,onChange,document,window})` returns `sync()`, `ids()`, `has(id)`, `toggle(id)`, `clear()`, `contextFor(id,{replaceSelection})`, `setActions(actions,openMenu)`, `dispose()`. It uses the Task 1 state and filters row descriptors through canonical `resolveTarget({taskId})`. `isBlocked()` reports menu/dialog/drag ownership. Toolbar `setActions` receives the existing action registry and a menu-opening callback.

- [ ] Add failing DOM tests for row-space and modifier gestures, editing exclusion, select-all scope, Escape ownership, refresh/collapse/filter pruning, accessible count and disposal. Migrate the old per-section selected-row test to assert no retained competing selection.
- [ ] Run selection/workspace tests; expected failures for missing mounted selection and changed legacy selection behavior.
- [ ] Implement delegated gestures and a normal-flow toolbar before task content, with live count, common available actions, More and Clear. Use row surface/border treatment and menu selection controls instead of listbox semantics. Remove the old per-section selection map. Keep toolbar controls stable and use `textContent` for labels.
- [ ] Run `node --test tests/task-selection.test.mjs tests/task-list-workspace.test.mjs tests/task-list-overview.test.mjs`; expected all pass. Commit `feat: add task selection gestures and toolbar`.

### Task 3: shared menus, host and verification

**Files:** Modify `task-actions.js`, `task-action-menu.js`, `task-list-interactions.js`, `app.js`, `page-loader.js`, `app-bootstrap.js`, `i18n.js`, `cloudflare/public-assets.json`, `.github/workflows/schedule-build.yml`, relevant existing tests and `docs/task-details.md`.

**Interfaces:** Registry optional `selection` callback owner adds `select` and `clear-selection`; multi-context items are `copy-titles`, `select`, `clear-selection`. Single-task actions remain exact-ID commands. Context carries `primaryTaskId` for Select/Deselect. Menu optional `getContext(found,{replaceSelection})` and `getLabel(context)` support selected IDs/count; Stage 1 defaults remain compatible. Menu exposes `isOpen()`. Interactions expose `isDragging()` for Escape ownership. Loader optional `setupTaskSelection` mounts selection once before shared menus. Host syncs selection after rendered visibility updates and on auth/view changes.

- [ ] Write failing registry/menu/integration tests: selected/unselected right-click, count label, accessible Select/Deselect, multi-title copy order, stale identities, no multi-mutation, single dispatch, real workspace visibility changes and repeated lazy preparation.
- [ ] Run selection/actions/menu/workspace/loader tests; expected failures for missing integration.
- [ ] Wire modules and host; update English translations, public assets and affected cache versions. Add Stage 1 branch to CI base filters so the stacked Stage 2 PR receives the existing full checks.
- [ ] Run `npm test`, `npm run build:cloudflare`, `npm run test:runtime`, preview Wrangler dry run and diff/syntax checks. Expected all applicable checks pass; preserve and report local runtime restrictions, and verify hosted full suite/runtime. Attempt available browser checks without bypassing auth; report unavailable checks accurately.
- [ ] Update task docs and progress ledger. Commit `feat: connect selection to task menus and workspace lifecycle`.
- [ ] Request one fresh whole-branch review against Stage 1. Reproduce/fix Important/Critical findings in one pass, rerun regression checks, and publish the stacked Stage 2 PR with passing hosted CI.

## Self-review and handoff

All Stage 2 inputs, pruning rules, accessible menu controls, count/toolbar and refresh/session requirements map to Tasks 1-3. Shared interfaces agree. Stage 3 bulk mutation implementation is excluded. Native execution is preserved from the previous stage and authorised by the user's instruction to continue; do not repeat an execution-method approval gate.
