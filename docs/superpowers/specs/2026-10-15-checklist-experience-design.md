# Task and checklist experience

Status: researched design proposal; implementation has not started.

## Intent

Make working inside a task feel calm, direct and quick: enter several checklist steps without reaching for the mouse, edit and reorder them without losing the caret, and expand a task into a useful working area. This develops the user's Planify reference within Kairos's existing desktop UI and planner.

## Evidence and present behavior

Audited Kairos at local `4e4203c` (production equivalent release `e96618c`), 15 October 2026. The focused detail/checklist/recurrence/host baseline passed 38 tests.

| Area | Existing Kairos behavior | Consequence for this work |
| --- | --- | --- |
| Entry | Enter in Add step already appends a step and retains composer focus | Improve this flow; do not present it as a missing feature |
| Editing | Step titles and checkboxes are editable in the detail draft | Retain inline editing and explicit Save |
| Reconciliation | Add/remove/reorder replaces the entire checklist list with innerHTML | Unaffected rows lose DOM identity; focus/selection needs stable reconciliation |
| Save | Successful Save removes and recreates the whole pane; only named metadata fields are considered for refocus | Capture checklist focus and scroll before disabling controls, then restore after confirmation |
| Composer | Text in Add step is not part of read()/dirty() until Add/Enter | Save and close must account for a nonempty composer |
| Organization | Small up/down/remove buttons on each step | Add deliberate drag/keyboard reordering after the editor is stable |
| Hierarchy | Checklist follows schedule, reminders, recurrence and advanced metadata | Make the checklist prominent in a later layout stage |
| Width | 380px pane and 760px expanded dialog | Give expanded editing more usable width without disturbing board spacing |
| Persistence | Stable IDs, 100-step / 180-character limits, checklist merge checks, exact Retry and recurrence scopes | Reuse these contracts; no data migration is needed for these stages |

Primary Planify references inspected on 15 October 2026:

- [Official features](https://useplanify.com/): rapid keep-adding entry, expandable task details and direct organization.
- [Official changelog](https://useplanify.com/changelog/): caret preservation, keyboard focus and drag feedback have explicit fixes, reinforcing their importance as acceptance criteria.
- [ItemRow](https://github.com/alainm23/planify/blob/main/src/Layouts/ItemRow.vala): separate editing/expanded state and subitem access.
- [EditableTextView](https://github.com/alainm23/planify/blob/main/src/Widgets/EditableTextView.vala): explicit focus transitions.
- [ReorderChild](https://github.com/alainm23/planify/blob/main/src/Widgets/ReorderChild.vala): insertion feedback and cancellation lifecycle.

These inform interaction goals. The stages below are Kairos design decisions, not claims of exact Planify parity. Research used public documentation/source, not a hands-on Planify session.

## Stage 1: dependable, fast checklist editing

### Entry and keyboard contract

- Plain Enter in Add step appends one trimmed nonempty step and leaves focus in the cleared composer. Empty Enter does nothing. IME composition Enter never inserts a step or submits the task form.
- Plain Enter in an existing step title moves to the next title, or the composer after the final step. Shift+Enter moves to the previous title; on the first step it stays there. Neither creates an empty step or saves the task.
- Ctrl/Cmd+Enter keeps the existing Save shortcut, including from the composer. Flush a valid nonempty composer into the draft before building the command.
- Escape retains the existing guarded close behavior. Backspace/Delete retain native text editing; an empty title is never silently removed.
- Multiline plain-text paste into Add step first replaces the current text selection as native paste would (composer prefix + pasted text + composer suffix), then appends trimmed nonempty lines in order and clears the composer only on success. Single-line paste stays native. Validate the entire addition first: a 181-character line or a total of 101 steps rejects the whole addition with no partial insertion and retains the original composer.
- A nonempty composer participates in dirty state. Save adds it exactly once; Save/Discard/Stay on closing covers it too. Invalid input stays editable and never creates a pending receipt.

### Stability and state

- One focused checklist editor owns the draft list. The detail pane owns the task draft, target/identity, validation, persistence and recovery.
- Reconcile rows by stable step ID. Title input events update draft text without replacing the row or moving its caret. Checking updates that checkbox and progress; other inputs keep identity.
- After removing a focused step, focus the next surviving step title, otherwise the previous, otherwise Add step. Existing arrow-button movement retains the moved step/control as its logical focus target.
- Capture checklist step ID/control, selection range and pane scroll before Save disables controls. After confirmed Save restore the corresponding surviving control and scroll without scrolling the page. Capture general metadata focus using its existing name when focus was outside the checklist.
- The existing expanded dialog reuses the same pane and checklist editor instance. Expanding/shrinking must preserve draft text, caret, checked state and composer text.
- Busy or uncertain pending saves disable draft mutation. Exact Retry reuses the captured command/step IDs. Account, planner or task changes invalidate old focus/async results.

### Persistence and scope

Keep explicit Save and current Save/Discard/Stay, failed-save recovery, session receipt and Firestore transaction behavior. Completing every checklist step does not complete the parent. Series templates remain unchecked; dated occurrence progress stays occurrence-specific. Recurring occurrence metadata stays read-only.

Stage 1 completion: enter five steps and edit one entirely by keyboard; multiline paste is atomic; adding/removing/moving never steals the caret from an unaffected row; Save and closing cannot silently lose composer text; all current recurrence/retry/host tests remain green.

## Stage 2: deliberate reordering

Add a grip for each checklist step, a visible before/after insertion marker and a drag preview. Start dragging only from the grip after a 4px movement threshold. Moving text selection or pressing the checkbox must never start dragging. Commit the draft order once on valid drop; Escape, pointer cancellation, outside drop, disabled state or identity change restores the original draft order. No network request happens on drag or drop.

Alt+Up/Down within a checklist title/grip moves that step one position, retains focus and announces its position. Retain accessible up/down controls as a discoverable alternative. These shortcuts stop before the task-row reorder handler. Empty/first/last/100-step lists, expanded-dialog scrolling, canceled drags and reduced motion are explicit verification cases.

## Stage 3: task as a working area

Use the same task draft in both pane and expanded view. Reading order is title, location/scope, notes, checklist, then task properties. A sticky action footer keeps Save, state and Close available. In expanded view, notes/checklist occupy the main column and properties a 280px side column. At available width below 900px use one column. Target expanded width is min(1080px, viewport minus 64px); retain the app's desktop/mobile gate.

The side pane uses clamp(400px, 32vw, 520px) on desktop; update its board-space reservation with the same CSS variable. Below the existing 1100px threshold continue opening the expanded dialog. Keep normal labels for scheduled date, start, duration, deadline and priority; group reminders/recurrence/AI preferences in clearly named expandable areas. A non-default value remains discoverable in the collapsed summary. Recurring scope remains visible above the editable area.

Completed checklist steps remain visible by default. A Show/Hide completed toggle changes only presentation and progress still counts all steps. Use existing Kairos surfaces, fonts and icons. Hover actions retain keyboard visibility, 36px targets and visible focus. Motion is optional, short and disabled with reduced motion. Confirmed state and unsaved state must remain distinguishable.

## Global constraints

- Vanilla JavaScript, HTML and CSS; no new dependencies.
- Reuse the existing planner schema and transaction/receipt path; no migration.
- Maximum 100 checklist steps; maximum 180 characters per step title.
- Explicit Save remains the persistence contract in Stages 1-3.
- Parent completion and recurring series/occurrence semantics remain unchanged.
- Preserve task selection, context menus, cursor hotspots and the desktop/mobile gate.
- Plain text uses safe DOM/text assignment or existing escaping.
- Version changed entry/loader/style/module URLs and declare new public modules in the Cloudflare manifest.

## Later decisions

True nested subtasks with their own dates, reminders and scheduling need a separate model proposal: current checklist steps are flat items. Instant checkbox persistence/autosave also needs a separate queue/conflict design because checklist and metadata drafts currently share one explicit-save command. Stage 1 should establish reliable editing before either extension.

## Verification and release

Run editor, detail, checklist, recurrence, selection/context and host suites plus full hosted regression/runtime/build checks. Inspect real Chrome at 1366x768 and 3440x1440, keyboard-only, long titles, 0/1/100 steps, IME, clipboard permission/native paste, expanded dialogs and both themes. Verify slow save, lost response/Retry, competing edits and account/planner switching through injected integration fixtures; live authenticated persistence remains a separate smoke check.

Stage 1 implementation plan: [checklist editing](../plans/2026-10-15-checklist-experience-stage1.md). Stage 2/3 receive their own detailed implementation plans after Stage 1 has been exercised. This document and plan do not change production.
