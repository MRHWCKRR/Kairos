# Task actions, context menus and selection

Status: design approved by the user on 15 October 2026. No product implementation is included in this document.

## Goal and agreed direction

Make task organisation quicker and easier to discover in the Tasks board overview and expanded section. Keep completion and dragging directly accessible, consolidate secondary actions into one consistent menu, support custom right-click actions, then add multi-selection and reliable bulk actions. The user approved the proposed four-stage direction on 15 October 2026.

The interaction should feel like a desktop productivity application: readable labels, usable targets, predictable selection, and immediate feedback. Preserve Kairos styling, inline editing, keyboard access, recurring-task scope, and confirmed-save recovery. Schedule, Home, AI chats, billing and mobile blocking are outside this change.

## Current implementation constraints

The design was checked against main commit ed1a6c35851707e69b359f2b3d64dbcfb56ca64c.

- task-list-workspace.js renders rows and maintains section navigation, drafts and keyed overview reconciliation.
- task-list-interactions.js owns individual completion, archive, reorder, move, pending receipts and guarded Undo.
- Completion and within-section reordering already expose a display-only preview. Canonical planner state remains separate until the host confirms a save.
- task-detail-pane.js owns explicit-save metadata drafts and Save/Discard/Stay navigation checks.
- task-list-model.js validates single-task commands. Bulk commands and bulk inverses do not exist yet.
- app.js supplies account/planner identity and the existing transaction queue. New feature state belongs in focused modules, with small host callbacks.

## Stage 1: shared task menus

### Row layout

Keep the completion checkbox, task title, existing date field and drag grip. Replace the individual up/down, move, archive and details buttons with one clearly labelled three-dot menu button. Keep the existing Enter/F2 details opening and Alt+Up/Down reorder shortcuts. Inline title/date editing continues to work.

Use the same row controls in both Tasks views. Give the menu button a minimum 36 by 36 CSS-pixel target and an accessible name containing the task title. Use consistent 18-pixel SVG icons and readable menu labels; do not depend on an icon or colour alone.

### Initial menu actions

| Group | Action | Behaviour |
| --- | --- | --- |
| Open | Task details | Open the existing editor for the exact task ID. |
| Open | Rename | Open that editor and focus its title field; retain explicit Save. |
| Open | Open in Schedule | Use the existing navigation and exact-task selection callback. |
| Status | Complete / Mark incomplete | Label reflects current canonical status; reuse completion command and preview. |
| Organise | Move up / Move down | Reuse full-array ordering and hidden-task anchors. |
| Organise | Move to section. | Open the existing destination chooser, preserving explicit board/section IDs. |
| Copy | Copy title | Copy the current task title as plain text; show an actionable error if clipboard access fails. |
| Archive | Archive task. | Reuse confirmation, dirty-draft guard, receipt and confirmed Undo. |

Do not show unimplemented Duplicate, Select, bulk fields or permanent-delete options in Stage 1. Recurring series cannot be completed as a parent task: keep the action unavailable with a short explanation directing users to occurrences in Schedule. Sorted views and first/last rows retain the existing reorder restrictions.

### Entry points and target rules

- Clicking the three-dot button opens the menu anchored to that button.
- Right-clicking task row space or a non-editing row control opens it at the pointer. Prevent the browser context menu only when the custom menu actually opens.
- Preserve native context menus inside inputs, textareas, editable content, and links. Users can always use the three-dot button for task actions while editing a title.
- Shift+F10 or the Context Menu key opens the menu for the focused row or its task menu button. Do not intercept typing and text-editing shortcuts.
- There is only one open task menu. Opening another closes the previous one.
- Capture task ID and account/planner identity when opening. Re-resolve the target and eligibility immediately before invoking an action; never address a task by row index, title, pointer location or a detached DOM node.

### Menu interaction

Render a fixed-position overlay outside clipping and scroll containers. Clamp it inside the viewport, opening above or left when needed, and allow internal scrolling when the available height is short. Match current Kairos background, foreground, borders and focus states, including customised themes.

Focus enters the first menu item on open. Up/Down move between items; Home/End jump to the bounds; Enter/Space activate; Escape closes and restores the invoker if it still exists. Tab closes the menu and continues normal document navigation. Disabled items remain identifiable and cannot execute. Use menu/menuitem semantics, aria-haspopup, aria-expanded and an accessible menu label.

Outside pointer-down, task-workspace scroll, viewport resize, section navigation, target removal/archive and account/planner changes close the menu. A popup menu click must not start a drag, toggle completion, edit a title or leak into legacy body handlers. Opening and dismissing a menu does not change saved task data.

If an action opens a dialog/editor, focus transfers to that surface. When an action moves or archives the invoking task, use the existing logical focus restoration instead of restoring a removed control.

### Save and pending states

Use existing validated commands and the host save queue. Do not create a second persistence implementation. While an action is pending, mutation items are disabled; details and plain-text copying remain available when the target still exists. Actions needing draft confirmation keep the original account/planner/task identity across the await.

Preserve completion/reorder previews, original operation IDs on Retry, confirmed-only Undo and completion rewards, and the existing Discard warning. A failed action keeps an explicit status message and never claims success. A stale or missing target closes the menu with a clear notice.

### Stage 1 module boundaries

- task-actions.js: shared action definitions, labels, eligibility, disabled explanations and dispatch through injected feature callbacks.
- task-action-menu.js: one accessible menu, positioning, focus, keyboard handling and dismissal lifecycle.
- task-list-interactions.js: expose a small invocation interface around existing completion/move/reorder/archive paths; retain persistence and drag ownership.
- task-list-workspace.js: render the consolidated grip/menu controls; preserve keyed nodes and active drafts.
- task-detail-pane.js and app.js: minimal callbacks for opening details with a requested title focus and existing Schedule navigation.
- task-list.css and page-loader.js: scoped styling, lazy loading, cache-version updates and single-instance lifecycle.

Action definitions accept explicit target IDs rather than capturing DOM elements. The interface accepts a target collection so later selection support can use the same action definitions; Stage 1 accepts exactly one task and rejects multiple targets.

## Stage 2: multi-selection

Selection is distinct from completion, keyboard focus and the task currently open in details. Keep one selection owner for both Tasks views.

| Input | Result |
| --- | --- |
| Plain click on non-interactive row space | Replace selection with that task and establish a range anchor. |
| Ctrl-click on Windows/Linux or Cmd-click on macOS | Toggle that task in the selected set and establish an anchor. |
| Shift-click within the anchor section | Replace selection with the inclusive visible range from anchor to clicked task. |
| Ctrl/Cmd+Shift-click within the anchor section | Add that visible range to the existing selection. |
| Shift-click without a valid same-section anchor | Select only the clicked task and establish a new anchor. |
| Ctrl/Cmd+A while focus is in task workspace, outside text fields | Select all visible task rows in that workspace. |
| Escape with no menu/dialog/drag open | Clear selection. |

Ctrl/Cmd selection can span visible sections and boards in the overview. A focused section only selects its own visible tasks. Completion controls, date inputs, title editing and drag grips do not implicitly change selection.

Right-click on a selected task retains the selection; right-click on an unselected task replaces it before opening the menu. The menu names the affected count. Native text editing remains available. Include explicit Select task / Deselect task actions so selection is accessible without a modifier key.

Use selected-row surface/border treatment and a count announcement. Expose selection through accessible controls rather than placing editable rows inside an inappropriate listbox. The selection toolbar provides the selected count, common actions, More and Clear. It must not cover the last task or the existing save/Undo status.

Retain valid selected IDs on ordinary refresh and reorder; prune missing, archived or newly hidden tasks. Hiding completed tasks removes hidden selections. Collapsing a section removes its hidden selections. Changing overview/focused workspace, account or planner clears selection and its anchor. Selection is session UI state and is not persisted to Firestore or restored after reload.

## Stage 3: atomic bulk operations

Ship bulk Complete, Mark incomplete, Move to section and Archive first. Labels are explicit for mixed completion states; never infer a toggle that reverses every task separately. Selection controls and toolbar remain available while recovering an uncertain batch, but further mutations cannot bypass the pending operation.

Add a bounded batch command to the existing plan transaction path, initially up to 50 tasks. Larger selections receive an explanation and cannot trigger a partially applied series of requests. Validate ownership, unique IDs, eligibility, affected values and relevant section order for the entire batch before committing. One conflicting or ineligible target rejects the whole batch; explain why rather than silently skipping it.

Each batch has one stable operation receipt and explicit affected IDs. Retry is idempotent. Bulk move preserves selected relative order in visible traversal order and appends to the destination; unrelated and hidden tasks retain their existing order. Bulk archive confirms the affected count. Undo is a single guarded inverse for the confirmed batch within the existing ten-second window. It checks affected fields/order and preserves unrelated edits.

Mixed selections containing recurring parent series cannot use bulk Complete/Mark incomplete; the disabled explanation identifies that occurrence completion belongs in Schedule. Do not create virtual occurrences in the Tasks board view. Cross-account/planner batches are impossible.

Retain the Stage 1 action definitions, now receiving the selected target collection. Use the display-only preview mechanism for eligible reversible batches only after batch command tests prove its conflict and rollback behaviour. Canonical data, rewards and Undo remain confirmation-driven.

## Stage 4: additional tools

Add Duplicate, bulk scheduled date/deadline/priority/duration/reminder/AI-lock edits, and dragging a selected group in that order. Each new field action changes only that field and checks the relevant existing validation, recurrence scope and scheduling constraints.

Duplicate creates fresh task and checklist IDs, resets completion/checklist progress, excludes operation history and occurrence exceptions, and creates an unscheduled ordinary task. Duplicating a recurring series is a separate later action with its own explicit scope; the ordinary Duplicate action remains unavailable for recurring parent series. Reuse applicable creation/plan-limit checks before committing a duplicate batch.

Group dragging starts only from a selected task's grip, previews the selected set and count, retains its defined relative order, and commits through the same bulk-move operation. Dragging an unselected task retains normal single-task dragging. Escape and release outside a valid destination cancel without a write. Do not add group reordering to sorted views.

Section-space context actions (Add task, Select tasks in section, Collapse section) belong after task menus and selection are stable. Do not override browser menus for the entire page.

## Verification and release criteria

Stage 1 must cover button/right-click/keyboard entry, target IDs after reorder, repeated opening, menu bounds, scroll dismissal, theme contrast, readable labels, disabled actions, native editing menus, outside clicks, focus restoration, dirty drafts, recurring series, pending saves, exact Retry and no duplicate listeners.

Stage 2 must cover forward/reverse ranges, modifier combinations, overview versus focused scope, hidden/completed/collapsed tasks, refreshed DOM nodes, editable fields, keyboard selection and account/planner changes.

Stage 3 must cover mixed eligibility, whole-batch validation failure, lost response after commit, same-operation retry, receipt expiry recovery, quota/size rejection, concurrent unrelated edits, order conflicts, batch Undo, and exactly-once confirmed completion rewards.

Run relevant regression tests and hosted build/runtime checks. A real browser pass is required before describing pointer feel, focus, menu positioning, theme contrast or screen-reader behaviour as verified. Check at 1366x768, 1920x1080 and 3440x1440, with menus opened near all viewport edges and at 200% zoom. Use a verified preview account for persistence and reload checks; do not weaken authentication to obtain a passing smoke test.

Implement and review each stage separately. Merge and production deployment remain explicit release actions. Stage 1 does not include bulk mutations or duplicate tasks.

## Reference

W3C WAI-ARIA APG Menu and Menubar Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/menubar/ (consulted 15 October 2026).
