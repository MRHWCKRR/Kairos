# Weekly event occurrences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Edit, skip and restore individual weekly native event occurrences in Schedule and AI.
**Architecture:** Keyed series exceptions projected through shared schedule-events; reuse native changes and owned receipts.
**Tech Stack:** Vanilla JS, Firebase transactions, Node tests, Chrome.
**Spec:** docs/superpowers/specs/2026-10-27-weekly-event-occurrences-design.md

## Global Constraints
Imported events read-only. No dependencies or provider/billing changes. 200 exceptions per series; existing 500 native event/700 KiB bounds. Preserve original logical date across moves. Hold merge/deploy.

## Review Focus
- Moved overnight tails retain original date and restore correct weekly source.
- Multiple occurrences on one visible date remain independently selectable.
- Skipped events remain discoverable and restore busy time/reminders.
- Full-series Undo rejects later exceptions; lost responses reconcile before timezone check.
- Series edits preserve exception snapshots; invalid cadence conversions cannot orphan them.

### Task 1: Shared occurrence projection and commands
**Files:** event-occurrences.js (new), schedule-events.js, native-event-commands.js, task-reminders.js; tests/weekly-event-occurrences.test.mjs.
**Interfaces:** eventOccurrence(event,logicalDate,{includeSkipped}) returns effective dated event or null; eventOccurrencesForDate(event,date) projects logical sources on display date; buildNativeEventChange accepts optional occurrenceDate/occurrenceOperation and produces existing native command/receipt; buildNativeEventUndo returns occurrence-focused beforeEvent/afterEvent and range.
- [x] Write and run failing projection/command/reminder tests.
- [x] Implement validated exceptions, shared projection and occurrence commands/Undo.
- [x] Run focused tests and commit.

### Task 2: Native editor and view identity
**Files:** native-event-editor.js/css, schedule-workspace.js, schedule-month.js, app.js, build-transforms.js; tests/native-event-editor.test.mjs, tests/weekly-event-views.test.mjs.
**Interfaces:** editor.open(id,date,occurrenceDate) receives logical date from projected blocks; scope controls build existing commands with optional occurrence fields; exception list selects skipped/moved originals.
- [x] Write and run failing scope/skip/restore/selection tests.
- [x] Implement editor scope, exception picker, projected inspector identities and legacy/month bridges.
- [x] Run focused tests and commit.

### Task 3: AI integration and complete verification
**Files:** ai-action-schema.js, ai-event-actions.js, ai-context.js, plan-store.js; tests/weekly-event-ai.test.mjs, tests/browser/weekly-event-journey.mjs, packaging/version references, docs.
**Interfaces:** update/delete accept occurrenceDate; update restoreOccurrence:true; shared native preview summaries use effective occurrence dates and disclose scope; native Undo summary uses beforeEvent/afterEvent.
- [x] Write and run failing schema/preview/persistence/retry/Undo/context tests.
- [x] Implement AI adapter/context and browser journey, refresh release graph/assets.
- [x] Run focused/full/browser/build checks, independent whole-branch review and necessary fixes.
- [x] Commit; publish draft PR from merged main78aad916, await CI, mark ready. Hold merge/deploy.
