# My day changed

Open Schedule and choose **My day changed** next to Plan. Describe the change, optionally enter a time window which must stay clear, and choose which tasks Kairos may move. Preview shows the existing proposal review with the old time, proposed time, and reason. Nothing is persisted until Apply.

The first version focuses on today's scheduled, unfinished flexible work, including missed tasks and flexible recurring occurrences. Fixed events, locked tasks, completed work, other days and work underway are excluded. Recurring changes apply only to today's occurrence. Plan continues to place unscheduled tasks.

The description guides the planner. The optional time fields provide an explicit unavailable window which validation enforces. The flow does not create an appointment or change fixed events, task duration or deadlines. If no safe placement fits today, it returns no changes rather than forcing a move. Existing AI authentication, App Check, request budgets and malformed-response retry policy remain in place; there is no new purchase gate.

## Reliability audit

- Rejected proposals previously freed their original time slots during batch validation. Conflict elimination now repeats until accepted changes no longer depend on a rejected move.
- Retained tasks with a start and estimate but no end now reserve their estimated duration.
- Apply now checks the current account/plan, task state, day/time boundaries, fixed commitments and explicit unavailable time. A newly locked, completed, changed or underway task invalidates the preview.
- Apply is single-flight. Failed persistence restores the previous task fields and recurring exceptions, leaving suggestions available for retry.
- Proposal editing preserves the original `from` fields so stale checks remain meaningful. Partial Apply cannot take a slot still occupied by another unapplied task.

The dialog has keyboard labels, native Escape/focus behavior, scrollable expanded sections and an opaque theme surface. Toolbar controls can wrap on narrower desktop windows. Feature assets load with Schedule; versioned parent imports prevent mixed old/new validators.

Automated coverage includes candidate selection, invalid/empty input, selected-task scope, explicit blocked time, recurring occurrence isolation, stale previews, new commitments, account changes, persistence failure, repeated Apply, dependency conflicts and boundary times. Signed-in visual and live Firestore verification are still needed before claiming those manual checks passed.
