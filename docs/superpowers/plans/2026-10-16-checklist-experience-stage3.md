# Checklist Experience Stage 3 Implementation Plan

**Goal:** Turn task details into a usable working area while retaining one explicit-save draft.

**Spec:** `docs/superpowers/specs/2026-10-15-checklist-experience-design.md`, Stage 3 and Global constraints. Native execution, test-first tasks and one independent whole-branch review; no merge/deploy.

**Architecture:** The checklist editor owns presentation-only completed visibility and its keyed rows. The pane retains persistence/identity and snapshots editor view state plus open property groups with focus/scroll. One form reads title, location/scope, notes, checklist, then properties in DOM order. CSS adapts that same DOM between pane and expanded view; no second editor or persistence owner.

## Constraints and decisions

Vanilla JS/CSS, no dependencies/schema changes. Keep 100 steps/180 characters, explicit Save/Retry, series versus occurrence completion/read-only metadata, selection/context menus, cursor hotspots and mobile gate. Use escaped markup or safe text. Version changed module/style/loader URLs. Expanded width min(1080px, viewport minus 64px), properties 280px at available width >=900px, otherwise one column. Desktop pane clamp(400px,32vw,520px) and board reservation share one variable. Below 1100px retain automatic expansion. Sticky footer contains state, Save and Close.

Completed steps start visible. Toggling visibility never mutates draft/dirty state or counts; hidden items remain in Save. Enter/Shift+Enter skip hidden rows; arrow/Alt movement addresses visible neighbours in the full underlying order. Hiding a focused completed row moves to the next visible title, previous, then composer. Visibility and open groups survive confirmed Save and expansion within the same task; opening another task resets presentation defaults. Toggle cancels any active drag.

## Review Focus

1. Hidden completed steps must remain in Save/Retry/recurrence payloads and total progress; visibility alone must never dirty a draft.
2. Keyboard, arrow and pointer reordering with hidden steps must not target hidden rows, lose text/caret or reorder the parent task.
3. Expanded/compact layouts, sticky actions and 900px breakpoint must preserve accessible reading/focus order, 36px controls, no horizontal overflow and usable scrolling at 0/1/100 steps.
4. Collapsed reminders/repeat/planning summaries must expose current non-default values, including restored pending commands, without altering data or bypassing occurrence read-only metadata.
5. Save/Retry, expansion, late identity/page changes and Save/Discard/Stay must keep their guarded lifecycle while preserving local view/focus/scroll and open groups.

## Task 1: checklist presentation

Files: editor, its tests and copy. Add `captureView():{showCompleted:boolean}` / `restoreView(view)` and logical focus control `visibility`. Default all visible; retain all draft IDs. Visible neighbours drive keyboard movement; full-array anchored reorder remains the persistence order.

- [x] RED tests: default visibility/progress; toggle changes only presentation and no callback/status; hidden completion focus fallback; Enter/Shift+Enter and Alt/arrow movement skip hidden rows; view snapshots restore without losing source data and disabled/disposed controls do nothing; hidden pointer targets rejected.
- [x] Implement the editor view contract and safe toggle labels; observe GREEN with editor/detail/reorder/model/recurrence/host suites.
- [x] Commit task 1.

## Task 2: task working layout

Files: pane, CSS, labels, loader/cache chain, detail tests, docs and stacked CI branch filter.

- [x] RED tests: DOM field order and shared working/properties regions/footer; three occurrence metadata fieldsets disabled while checklist remains editable; default/non-default/cross-edit/restored-pending summaries; view/open-groups persist through Save/Retry and expand/shrink with focus/caret; visibility alone closes without a dirty prompt; scope date selection is not a persisted edit.
- [x] Reorganize one form into title/context/work+properties/footer. Group reminders, repeat and planning with live safe-text summaries. Preserve group openness and editor view before restoring focus. Keep scope above editing area, basic date/start/duration/deadline/priority labels direct.
- [x] Implement responsive dimensions/reservations and sticky footer. Update docs/cache/CI filter. Run focused/full regression, both builds (legacy in disposable copy), syntax/diff and preview dry-run; hosted real Workers CI is the readiness gate if local runtime startup fails.
- [x] Verify real-browser layout at laptop/ultrawide and below-900px available width, both themes/reduced motion, keyboard-only, long text and 0/1/100 steps, footer availability while scrolling, hide/show, reorder, Save/Retry and modal focus. Disclose any unavailable live account/native checks.
- [x] Commit task 2; one fresh whole-branch review; fix Important/Critical findings with RED/GREEN and rerun suite. Ledger minors/rulings. Publish stacked PR against Stage 2. Final-head hosted CI remains the readiness gate, with its outcome recorded on the PR.
