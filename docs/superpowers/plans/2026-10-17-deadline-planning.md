# Deadline Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver deadline triage, assignment sessions, conflict alternatives, and weekly review with explicit reviewed writes.

**Architecture:** A pure planning model handles bounded time ranges, occupancy, summaries, proposals, and validated commands. A lazy Schedule dialog consumes the model and uses the existing transactional task store through the Schedule bridge. Existing task dates/deadlines, recurrence data, settings, and AI remain authoritative.

**Tech Stack:** Vanilla JavaScript/HTML/CSS, Firebase transactions, Node test runner, Chrome/Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-deadline-planning-design.md`

## Global Constraints

- No additional framework, cloud collection, AI call, or automatic mutation.
- Keep date as scheduled work and dueDate as the end-of-day deadline.
- At most 40 sessions; 15–2400 total minutes, 15–120 minutes per session; horizon up to 31 days.
- Reuse existing transactional operation receipts and owner/planner guards.
- Completing a session never completes the parent; recurring scope controls remain authoritative.

## Review Focus

- Overnight events and recurrence exceptions must block their actual occupied dates.
- DST gaps/offset changes and a preview applied later must never create past or wrong-duration work.
- A lost successful response must Retry exactly once using the same operation/session IDs.
- Remote note/checklist edits survive schedule changes; changed schedules/locks invalidate previews.
- Weekly statistics describe scheduled work status, not invented completion history.

### Task 1: Deadline and review model

**Files:** create `planning-model.js`, `tests/planning-model.test.mjs`.
**Interfaces:** `planningClock(now,timezone) → {date,time}`, `deadlineSummary(state,today) → rows`, `weeklyReview(state,weekStart,today) → {completed,pending,slipped,nextDeadlines}`.

- [x] Write failing tests for dueDate versus date, overdue boundaries, archived/completed exclusion, valid leap dates, and ordinary/recurring weekly status including moved exceptions.
- [x] Run `node --test tests/planning-model.test.mjs`; observe missing behavior.
- [x] Implement date helpers and summaries using existing recurrence generation, including moved-in exceptions.
- [x] Run focused tests; all pass. Commit the independently testable model.

### Task 2: Safe placements, sessions, and commands

**Files:** extend `planning-model.js`; modify `task-list-model.js`; extend model tests and add `tests/planning-store.test.mjs`.
**Interfaces:** `planningOccupancy(state,from,to) → intervals`, `planningConflicts(state,from,to) → pairs`, `previewSessions(state,input,clock) → {command,expected,rows}`, `previewCarryover(state,input,clock) → same`, `applyPlanningCommand(state,command,expected,{now}) → {next,result}`.

- [x] Write failing tests for touching/overnight intervals, fixed/recurring commitments, locks, preferences, deadline cutoffs, no capacity, 5-minute boundaries, DST gaps, and stale previews.
- [x] Write failing transactional receipt tests for duplicate session IDs, exact Retry, unrelated remote edits, and changed schedules rejecting atomically.
- [x] Implement bounded occupancy/slot search and preview builders. Implement planning_batch command dispatch in the existing task command model; validate generated data and every destination against live occupancy and current clock.
- [x] Run focused planning/task/recurrence/store tests; all pass. Commit validated planning commands.

### Task 3: Planning dialog and Schedule integration

**Files:** create `planning-hub.js`, `planning-hub.css`, `tests/planning-hub.test.mjs`; modify `page-loader.js`, `build-transforms.js`, cache imports, public manifest, and package test scripts.
**Interfaces:** `mountPlanningHub({document,window,getBridge,now}) → {open,dispose}`. Bridge adds `commitTaskCommand(command,expected,identity)` and `getTimezone()` reusing existing app owners.

- [x] Write failing tests for four views, explicit Apply only, no-capacity status, failed-save Retry, pending reload recovery, scope changes, blocked storage, malicious titles, and keyboard Close.
- [x] Implement a single dialog with real deadline editor links, editable session labels/options, conflict alternatives, weekly selection/carry-over, preview tables, and Apply/Retry controls.
- [x] Add lazy loading and public assets. Keep in-flight inputs locked and preview/retry identity stable; close on account/planner changes.
- [x] Run focused tests and inspect actual dialog in Chrome at 1366×768, 960×768, and 3440×1440 in light/dark themes. Commit the complete UI.

### Task 4: Whole-feature verification and review

- [ ] Run `npm test`, `npm run build:cloudflare`, and the legacy build in a disposable copy; check syntax and `git diff --check`.
- [ ] Exercise all four paths in Chrome with failure/delay/retry and normal navigation, confirming no new page errors and no unintended writes.
- [ ] Request independent whole-branch review, fix concrete findings with regression tests, and repeat affected validation.
- [ ] Record evidence and limitations in documentation. Push a reviewable PR; merge/deploy only when requested.
