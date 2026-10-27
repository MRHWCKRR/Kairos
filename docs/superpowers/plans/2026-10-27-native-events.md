# Native Schedule Events Implementation Plan

> For agentic workers: execute inline with superpowers:executing-plans and one independent final review.

Goal: native dated/weekly events with reviewed conflicts, durable commands and Undo.
Architecture: native-event-commands.js owns validation/baselines/preview; native-event-editor.js owns dialog and retained state; task-list-model/plan-store provide shared transaction receipts; app delegates existing entry points.
Tech Stack: vanilla JS/CSS, Firebase transaction session, Node/linkedom/Chrome.
Spec: docs/superpowers/specs/2026-10-27-native-events-design.md

## Global constraints
Imported events read-only. No automatic task moves, billing changes or dependencies. Timed overnight <24h; all-day one date/day. Weekly conflict review today through today+30. 500 native events/700KiB upsert limit; deleting remains available above budget.

## Review focus
- Overnight and midnight boundaries reserve correct dates without weekly fallback.
- New tasks or event edits during review invalidate Apply and Undo conflicts.
- Lost save responses/reloads, other shared recovery and scope changes do not duplicate or misattribute saves.
- Imported identity/ownership cannot be overwritten via normal edit, delete or Undo.
- Legacy weekly sleep behavior survives; dated/all-day/free sleep events do not produce wrong weekly reminders.

### Task 1: Guarded event commands and receipt integration
Files: native-event-commands.js, task-list-model.js, plan-store.js, tests/native-event-commands.test.mjs, tests/native-event-persistence.test.mjs, tests/helpers/planner-fixture.mjs.
Interfaces: buildNativeEventChange(state,{eventId,event|null},timezone,now) -> {command,expected,conflicts,range,undoRecord}; applyNativeEventChange(state,command,expected,{now}) -> {next,result}; buildNativeEventUndo(state,sourceOperationId,record,timezone,now) -> preview; applyNativeEventUndo(state,record,command,expected,{now}) -> {next,result}.
- [ ] Write RED cases create/edit/delete/Undo, exact dates, weekly/all-day/overnight, conflicts, imported/duplicate IDs, quota cleanup, staleness.
- [ ] Implement with shared event/task projection and scheduling signature; preserve unknown legacy fields and unrelated data. GREEN tests.
- [ ] RED/GREEN lost-ack one-use owned receipt, stale profile timezone, transaction retry; commit.

### Task 2: Editor and shell integration
Files: native-event-editor.js/css, app.js, app.html, build-transforms.js if needed, public-assets manifest. Tests: native-event-editor.test.mjs and actual host rerender tests.
Interfaces: mountNativeEventEditor({getIdentity,getState,getTimezone,getToday,ensurePlan,commit,session,...}) -> {open(eventId?,date?),sync(),dispose()}.
- [ ] RED tests explicit review/save, input invalidation, escaped conflict evidence, pending retry/discard, scope changes, delete/Undo review.
- [ ] Replace legacy editor/direct saves and markup; lazy load and sync on actual planner renders; GREEN UI tests and existing editor callers. Commit.

### Task 3: Reminders, browser and release
Files: task-reminders.js, tests/bedtime-reminders.test.mjs, tests/browser/native-event-journey.mjs, browser entry, docs/native-events.md, module URL versions.
- [ ] RED/GREEN dated/all-day/free sleep reminders and original weekly coverage.
- [ ] Real Chrome create/conflict review/save/edit/overnight/delete/Undo/lost-ack journey with actual commands/session. Inspect dark/light UI.
- [ ] Fresh cache/import-parent URLs and packaged files; run full npm test, production build and browser. Independent final review, fix substantive findings, publish PR, await green CI and hold merge.
