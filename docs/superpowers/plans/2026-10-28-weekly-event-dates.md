# Weekly event dates Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans. Implement inline and perform one independent whole-branch review.
**Goal:** Bound weekly native events by optional inclusive dates.
**Architecture:** Extend shared occurrence predicate and existing native commands, receipts, editor and AI adapter.
**Spec:** docs/superpowers/specs/2026-10-28-weekly-event-dates-design.md
**Constraints:** Keep exceptions inactive without deletion; no imported edits, dependencies or provider/billing changes. Hold merge/deploy.
## Review focus
Original versus moved date; overnight last-date tails; clearing bounds; inactive exception cleanup; scope/AI mismatch and retry/Undo.
### Task1: Shared model and commands
- [ ] Write failing tests in tests/weekly-event-dates.test.mjs for inclusive projection, overnight/moved exceptions, commands, inactive impact, restore, stale Undo and sleep reminders.
- [ ] Implement bounds in event-occurrences.js/native-event-commands.js and planning signature; run focused tests and commit.
### Task2: UI and AI
- [ ] Write failing editor/schema/adapter/transaction tests.
- [ ] Add native date controls, impact review and AI fields/context, reuse receipts and Undo. Run focused tests and commit.
### Task3: Release
- [ ] Independent review and substantive RED/GREEN fixes. Refresh cache graph, docs and Chrome journey. Full tests/build/browser checks.
- [ ] Publish PR from merged main, await CI, mark ready. Hold merge/deploy.
