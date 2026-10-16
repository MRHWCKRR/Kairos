# Checklist Experience Stage 2 Implementation Plan

> **For agentic workers:** Use the established Native executing-plans workflow: test-first implementation and one independent whole-branch review. This is the recovered plan from the unavailable Windows workspace.

**Goal:** Reorder checklist steps with a grip or Alt+Up/Down, retaining explicit Save.

**Architecture:** The editor owns checklist data. A focused pointer controller owns transient drag state and invokes one editor reorder operation on a valid changed drop. Keyboard and existing arrow buttons share the same movement operation. The pane retains identity and persistence.

**Spec:** `docs/superpowers/specs/2026-10-15-checklist-experience-design.md`, Stage 2 and Global constraints. Stage 3 layout remains separate.

## Global constraints

Vanilla JavaScript/CSS, no dependencies or schema changes. Preserve the 100-step / 180-character limits, explicit Save, parent completion, recurring series/occurrence rules, selection/context menus, cursor hotspots and mobile gate. Use safe text assignment. Declare new public modules and version the changed module/style/loader chain.

## Review Focus

1. Pointer capture, pointer-ID mismatches and release outside a valid row must never apply a stale drop.
2. Escape must cancel reordering before the pane's guarded close handler; lost capture, blur, page/identity change and disposal must remove feedback and animation frames.
3. Auto-scroll in a long expanded checklist must update the insertion target without moving draft items before release.
4. Alt+Up/Down in titles/grips must retain caret/focus and never reorder a parent task; IME and modified text shortcuts remain native.
5. Reordered ordinary/series/occurrence drafts must persist only via explicit Save, preserving exact retry IDs and recurrence completion restrictions.

## Task 1: shared movement and keyboard

Files: `task-checklist-editor.js`, `tests/task-checklist-editor.test.mjs`.

Internal `moveStep(id,index,focus)` changes the draft once only for an actual move and announces the 1-based position. Add focus control `grip`; preserve all existing editor methods.

- [x] Add RED tests `Alt arrows reorder only checklist titles and grips` and `keyboard reorder boundaries composition and disabled state do not mutate`. Check stable IDs/nodes, caret 2..4, focus, one change per move, consumed boundary shortcuts, no parent key event, native modifier/IME behavior, 0/1/100 lists and disabled grips.
- [x] Implement a labeled 36px grip and plain Alt+Up/Down in titles/grips; share movement with arrow buttons and localized fallback status. No persistence.
- [x] Run combined editor/detail/model/recurrence/host suites GREEN and commit.

## Task 2: pointer reordering and lifecycle

Files: new `task-checklist-reorder.js` and `tests/task-checklist-reorder.test.mjs`; editor, pane, CSS, manifest/cache chain, detail integration tests and docs.

`mountChecklistReorder({root,list,getItems,onReorder,isEnabled,document,window,requestFrame,cancelFrame})` returns `{cancel,dispose}`. `onReorder({stepId,anchorId,after})` runs once on a valid changed drop. The controller holds source/pointer IDs, original order and coordinates, never a competing draft. Editor exposes `cancelReorder()` for pane navigation; disabling and disposal cancel automatically.

The pane supplies the editor's `isActive()` callback from the owning page plus current account/planner identity. The editor includes that callback in the controller's `isEnabled()` predicate. This remains authoritative when the expanded pane moves into a document-level dialog; cancellation must not depend solely on DOM ancestry or a host sync call.

- [x] RED pointer tests: primary grip only; below 4px idle/exactly 4px starts; safe preview and before/after markers; no draft callback during movement; valid drop once; no-op/source/outside/wrong pointer ignored. Escape precedes pane close; capture/cancel/blur/disable/page/order/dispose cleanup cancels frames. Expanded preview stays in the dialog and scrolling recalculates the destination.
- [x] RED detail integration: identity/page cancellation and Escape, explicit Save only, exact failed-save Retry order/IDs and dated-occurrence scope.
- [x] Implement threshold/feedback/hit-testing/capture. Auto-scroll the closest pane/dialog near 40px edges by 12px/frame. Recalculate at release; cancel on every exit, hidden/inactive page and changed order/source. Keep title/checkbox gestures native.
- [x] Wire manifest/cache versions, pane cancellation, English labels, existing stacked PR workflow filter and docs. Run focused/full tests, both builds, syntax/diff, preview dry-run and real Chrome checks.

## Completion

One fresh independent review against all five Review Focus items. Fix Important/Critical issues with RED/GREEN and rerun the suite; ledger rulings/minors. Publish a stacked Stage 2 PR against `codex/checklist-experience-stage1`, requiring hosted full runtime/build CI. No merge or deployment.
