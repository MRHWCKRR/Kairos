# Calendar conflict review and repair

User authorised the proposed conflict review/repair feature. Retain vanilla JS/Firebase/Cloudflare and existing Schedule design.

After an import or refresh saves, Calendars shows clashes between that source's busy events and unfinished dated tasks/occurrences. Also provide a persistent Review conflicts action per source so reload/retry never loses access. Preview does not move tasks. Transparent events do not conflict; all-day and overnight segments retain existing date projection.

Review lists the task, calendar event/date/time, and why a task is immovable. Completed/skipped/archived work is excluded. Locked tasks, fixed recurring occurrences, past/underway work and invalid/overnight task placements are shown but not moved. Flexible recurring changes affect only the logical occurrence and remain on its current day. Selected ordinary tasks can move forward from their current date within today through today+7, respecting deadlines, saved hours, gaps, assignment order and daily assignment-work limits. Outside this horizon, conflicts remain visible with manual-review guidance. Without saved hours use 07:00–22:00, shown explicitly. At most 40 selected tasks per repair. Keep other tasks and all calendar events unchanged.

Approaches: extend the today-only AI day-change flow (would miss future conflicts), add another planner (duplicates occupancy and persistence), or a focused deterministic review using shared slot search, date projection and scheduling commands. Choose the last as the implementation decision; no inference/API key required.

A guarded calendar_repair command rechecks all scheduling/source inputs and current clock/settings in the existing receipt transaction. Lost acknowledgements retry the exact identity, account/planner changes discard visible drafts, and changed tasks/events/hours/timezone require a fresh preview. A source-scoped result offers Undo through the same receipt/session infrastructure. Undo preserves later notes/completion, rejects changed placements/locks and refuses unsafe restored collisions. Repair and Undo never modify imported events or source metadata. User reviews proposed before/after times and explicitly applies the entire selected batch; no partial unsafe application.

No automatic movement, new subscription jobs, billing changes or provider writes. Publish a reviewed PR with focused tests, complete regression/build/browser checks; hold broad change before merge.
