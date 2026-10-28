# Calendar Export Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans inline, with independent final review.
**Goal:** Download reviewed date-range planner snapshots as .ics.
**Architecture:** Pure projection/serialization module plus lazy dialog, exposed from Calendars. Shared recurrence and fixed-event projection only.
**Spec:** docs/superpowers/specs/2026-10-28-calendar-export-design.md
**Constraints:** No dependencies, persistence/provider/billing changes. 366days,5000items,5MiB. Private notes never exported. Hold merge/deploy.
## Review focus
Overnight range edges; moved recurrence identity and term bounds; UTF8 injection; timezone gap and fold behavior; state/account changes during preview/download.
### Task1: Export model
- [ ] Write failing tests/calendar-export.test.mjs for shared projection, RFC parse roundtrip, UID/privacy, DST/bounds and quotas.
- [ ] Implement buildCalendarExport(state,options) in calendar-export.js and downloadCalendarExport(result,deps). Verify focused tests; commit.
### Task2: Dialog/integration
- [ ] Write failing tests/calendar-export-view.test.mjs for explicit download, stale state/inputs/identity, errors and race/disposal.
- [ ] Implement mountCalendarExport in calendar-export-view.js; expose Export schedule from calendar-import.js and lazy app host. Reuse calendar-import styles. Verify tests and commit.
### Task3: Verification/release
- [ ] Add Chrome export review/download-capture journey and docs. Fresh assets/import URLs. Independent review, fix substantive findings RED/GREEN.
- [ ] Full tests/build/browser/CI; publish PR from merged main, mark ready. Hold merge/deploy.
