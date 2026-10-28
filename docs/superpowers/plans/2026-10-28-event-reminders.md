# Event Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reviewed, configurable native event reminders through existing while-open delivery.
**Architecture:** event-reminders.js projects custom candidates using shared occurrence/timezone helpers. Native commands, editor and AI preserve explicit reminder state. Existing notification transactions and host runner deliver candidates.
**Tech Stack:** Vanilla JS, node:test, linkedom, existing Chrome harness.
**Spec:** docs/superpowers/specs/2026-10-28-event-reminders-design.md

## Global Constraints
Allowed custom leads exactly 5,15,30,60; null Off; 'default'/omission legacy sleep default. Timed native events only. Existing notification receipts/settings/ownership guards, task behavior and mobile block stay intact. No dependencies, scheduling service, email/SMS, exported alarms or permission grants. Hold merge.

## Review Focus
- Custom sleep replaces bedtime delivery and transitions do not replay the same 15-minute window.
- Midnight, DST gap/ambiguity and moved overnight original identity produce correct reminder instants.
- Deletion, skip, timezone/reminder edit or owner switch after scanning cancels stale delivery.
- Reset default, Off, all-day conversion, occurrence inheritance, Retry and Undo preserve intended state.
- UI and AI disclose while-open/permission limits without claiming successful delivery after save.

### Task 1: Projection, delivery and host runner
**Files:** new event-reminders.js; task-reminders.js, reminder-notifications.js, app.js; tests/event-reminders.test.mjs, tests/reminder-notifications.test.mjs, tests/reminder-runner.test.mjs.
**Interfaces:** dueEventReminders(events,now,timeZone) returns existing candidate shape with eventId/occurrenceDate. validEventReminder(value) accepts default/Off/presets. deliverEventReminder(planId,uid,candidate,options) returns {delivered,title,message}.
- [ ] Write/run failing custom projection tests: presets, windows, midnight/DST, cadence, moved/skipped/default/Off/free/all-day/imported, stable logical IDs. Expected missing function/off-week/default suppression failures.
- [ ] Implement projection and default bedtime suppression.
- [ ] Write/run failing transaction tests for once across tabs/reload/retry, stale event/settings/timezone, old default receipt alias and planner scope; host runner tests for event delivery/owner guards.
- [ ] Integrate transaction and host; run projection/reminder suite, expected pass. Commit.

### Task 2: Reviewed editing, AI and release
**Files:** native-event-commands.js, native-event-editor.js, ai-action-schema.js, ai-event-actions.js, ai-context.js; tests/event-reminder-actions.test.mjs, tests/native-event-editor.test.mjs, tests/ai-planner-context.test.mjs; existing browser journey; public assets/import URLs; docs/native-events.md.
**Interfaces:** event.reminderMinutes default/Off/presets flows through existing commands/receipts/Undo and UI/AI review. Occurrence projection inherits series value when old override omits it; explicit default resets legacy behavior.
- [ ] Write/run failing command/editor/AI tests for validation, scope, save/reopen, default reset, Off, all-day conversion, preserved metadata, receipt replay/Undo and context/review. Expected rejection/missing control/metadata failures.
- [ ] Implement strict field validation, selector and review disclosure, AI shape/proposal/context and all-day handling.
- [ ] Extend real Chrome flow to save/reopen custom/removal/default/occurrence reminder and verify projected candidates, no actual OS notifications/live Firebase writes.
- [ ] Refresh public assets/transitive module URLs; document defaults/settings/while-open and no exported alarms. Run npm test, npm run build:cloudflare, npm run test:planner-browser. Known local inspector EACCES must pass hosted CI.
- [ ] Independent review; fix substantive findings RED/GREEN; publish feature PR, await green CI, hold merge.
