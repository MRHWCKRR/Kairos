# Fortnightly native events

The user requested the missing event recurrence after confirming task recurrence already supports intervals. Add Every 2 weeks to native events in the existing vanilla editor and AI commands; retain weekly and dated behavior.

Use optional `intervalWeeks` (integer 1 or 2; omission means 1) and `anchorDate` (profile-local YYYY-MM-DD, required for 2, same weekday as day). An anchor identifies an occurrence, not a lower bound: matching weeks before it also occur unless startDate restricts them. Keep optional first/last date bounds independent so extending a term never silently flips alternating weeks. Do not reuse the task recurrence schema or expand imported events again.

The editor exposes a Reference occurrence date for fortnightly events and explains that it determines alternating weeks. Default new anchors to the selected date aligned forward to the selected weekday; existing anchors are retained. Review and AI context display the cadence and reference date. AI must request an explicit anchor for new fortnightly events or a conversion, and preserve it on ordinary updates. Only series edits accept cadence fields; one-off conversions remove them.

Shared original-date projection drives timeline, month, Today, task planning, conflicts, bedtime reminders and calendar export. Moved exceptions keep original identity and full overnight continuation. Existing exceptions must be restored before changing weekday, interval or anchor, matching the current safe cadence-change policy. Bounds may still deactivate/restore exceptions without deletion. Retry, receipts, Undo and stale previews retain and validate cadence.

Approaches: use startDate as cadence origin (fewer fields but changing bounds flips weeks), expand fortnightly events into separate dated entries (breaks series identity), or add explicit cadence and anchor to shared event projection (chosen implementation call, preserves existing semantics). No dependencies, provider/billing changes, task recurrence changes, imported event edits or mobile web changes.

Deliver model, UI, AI/persistence and browser coverage, production build/full regression, independent review, feature PR with green CI. Hold merge until requested. No live Firebase or external calendar writes needed.
