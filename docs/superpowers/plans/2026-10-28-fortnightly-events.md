# Fortnightly Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Allow native events every two weeks across normal and AI workflows.
**Architecture:** Extend original-date projection with explicit interval and anchor; reuse all existing consumers and mutation receipts.
**Tech Stack:** Vanilla JS, node:test, linkedom, existing Chrome harness.
**Spec:** docs/superpowers/specs/2026-10-28-fortnightly-events-design.md

## Global Constraints
No dependencies, provider/billing changes, task recurrence changes, imported event edits or mobile web changes. Omitted intervalWeeks means 1. intervalWeeks accepts only integer 1 or 2; interval 2 requires a real same-weekday anchorDate. First/last bounds never reset cadence. Hold merge until requested.

## Review Focus
- Dates before the reference date must alternate consistently across year boundaries.
- Moved and skipped exceptions must keep original identity across overnight tails.
- Missing, stale or forged cadence must never apply a different reviewed schedule.
- One-off conversion, Undo and retry must not lose or retain inappropriate cadence metadata.
- Selecting an off-week date must still open an appropriate occurrence or series safely.

### Task 1: Shared model and commands
**Files:** event-occurrences.js, native-event-commands.js, planning-commands.js; tests/fortnightly-events.test.mjs.
**Interfaces:** isEventOccurrenceDate(event,date), eventOccurrence(event,date,options), buildNativeEventChange(state,input,timezone,now) retain existing signatures; add cadence fields.
- [ ] Add failing projection/validation/exception/Undo/signature/reminder/export tests and run node --test tests/fortnightly-events.test.mjs (expected failures for off weeks and cadence input).
- [ ] Use modulo 14 calendar days from anchor, independent inclusive bounds; validate merged events and disallow cadence changes with saved exceptions; clear metadata on one-off conversions.
- [ ] Run new and weekly date/occurrence tests; expected pass. Commit.

### Task 2: Editor and AI parity
**Files:** native-event-editor.js, ai-action-schema.js, ai-event-actions.js, ai-context.js; tests/native-event-editor.test.mjs, tests/fortnightly-events-ai.test.mjs.
**Interfaces:** editor values and AI proposal carry optional intervalWeeks/anchorDate into Task 1 commands; context and preview disclose both.
- [ ] Add failing tests for editor create/reopen/series changes, invalid anchor, off-week open and AI create/update/invalid scope/context/receipt replay/Undo.
- [ ] Implement Every 2 weeks, reference-date field/default, reviewed cadence, strict schema and propagation. Keep occurrence edits dated.
- [ ] Run new UI/AI plus existing event tests; expected pass. Commit.

### Task 3: Browser and release
**Files:** tests/browser/weekly-event-journey.mjs, public module import versions, docs/native-events.md.
**Interfaces:** existing real Chrome journey creates/saves/reloads/projections/exports using actual modules and isolated persistence.
- [ ] Extend browser journey with fortnightly creation, excluded off-week, bounds/overnight/export and series reopening; verify actual production components.
- [ ] Refresh changed module URLs and transitive parents consistently; update documentation.
- [ ] Run npm test, npm run build:cloudflare and npm run test:planner-browser; expected all pass except known local Workers inspector permission limitation, report explicitly if present.
- [ ] Independent whole-branch review; fix substantive findings with RED/GREEN tests; publish feature PR and await green CI. Hold merge.
