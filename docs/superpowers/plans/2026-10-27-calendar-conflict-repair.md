# Calendar Conflict Repair Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline implementation and one final independent review.

Goal: review and safely repair imported-calendar task conflicts.
Architecture: source-scoped conflict model + deterministic slot preview + guarded shared commands/receipts + a lazily mounted themed dialog.
Tech Stack: vanilla JS/CSS, existing Firebase transactions, Node test runner/linkedom/Chrome.
Spec: docs/superpowers/specs/2026-10-27-calendar-conflict-repair-design.md

## Global constraints
No automatic task moves. Preserve imported events, completion and recurring history. 7-day repair horizon; 40 selected tasks. Saved hours or explicit 07:00–22:00 fallback. Scoped retained retries. No billing/dependency changes.

## Review focus
- Refresh while reviewing invalidates Apply, including calendar source timezone changes.
- An unplaceable selected task cannot free its old occupied time for other proposals.
- Moved recurring exceptions use logical identity and never move the series/history.
- Lost acknowledgements and account changes cannot duplicate or misapply repair/Undo.
- Completed/locked work and neighbouring overnight events retain occupancy; deadline/session order stays valid.

### Task 1: Conflict report and guarded preview
Files: calendar-conflicts.js, calendar-repair.js, tests/calendar-repair.test.mjs.
Interfaces: calendarConflicts(state,sourceId,clock) -> rows; previewCalendarRepair(state,sourceId,taskKeys,settings,now) -> {command,expected,rows}; applyCalendarRepair(state,command,expected,{now}) -> {next,result}; applyCalendarRepairUndo(state,record) -> {next,result}.
- [ ] Write and run RED tests for source-specific busy overlaps, protected tasks, date bounds and recurring exceptions.
- [ ] Implement with eventSegmentsForDate/planningOccurrences, shared findPlanningSlot and schedule change commands; preserve duration and other rows.
- [ ] Run RED/GREEN stale/failed-allocation/deadline/recurring/Undo tests; commit.

### Task 2: Receipt and review integration
Files: task-list-model.js, plan-store.js, calendar-import.js, calendar-conflict-review.js, calendar-import.css, app.js, cloudflare/public-assets.json. Tests: calendar-conflict-review.test.mjs, calendar-import.test.mjs and planner persistence fixtures.
Interfaces: mountCalendarConflictReview({getIdentity,getState,getSettings,commit,session,...}) -> {open(sourceId),sync(),dispose()}; calendar imports dispatch onReviewConflicts(sourceId) only after closing their modal. Shared session retains exact repair and Undo operation identities; transaction verifies settings and owns the source receipt for Undo.
- [ ] Write/run RED integration tests for explicit preview/Apply, saved conflict action, lost-response retry and scope changes.
- [ ] Implement focused dialog, current conflicts and refresh stale checks; route commands and compact Undo receipts; commit green tests.

### Task 3: Release and verification
Files: browser calendar journey, docs/calendar-import.md, versioned module graph.
- [ ] Extend real Chrome journey to conflict preview/Apply/recovery and recurring preservation; observe failure then implement wiring.
- [ ] Refresh only changed module/import-parent cache URLs, package assets, run npm test, production build and Chrome; report any environment failure explicitly.
- [ ] Independent final review, fix substantive findings RED/GREEN, publish PR and await green CI; hold merge.
