# Deadline planning

Schedule → Planning contains four views:

- Deadlines sorts unfinished ordinary tasks by dueDate, with overdue/today/upcoming labels, missing deadlines, and scheduled-after-deadline warnings. Edit deadline opens the existing Schedule inspector. Scheduled date and deadline remain separate.
- Assignment sessions splits an unscheduled, unlocked ordinary task into up to 40 reviewed sessions within a date range of at most 31 days. Specify effort, session length, availability, and optionally a title for each work step. No partial plan is created when capacity is insufficient. The original task/checklist remain intact; sessions are ordinary tasks in the same section with additive assignmentId and sessionIndex metadata. They share the parent's deadline but do not complete the parent. Existing sessions prevent repeated generation.
- Conflicts explains overlaps across tasks, recurring occurrences, and weekly fixed commitments. Only unlocked unfinished ordinary tasks receive proposed alternatives; recurring and locked items stay unchanged. Overnight carry-in, moved/skipped recurrence exceptions, deadlines, preferred time of day, daily availability, and profile timezone are respected. Nonexistent DST times and blocks whose elapsed duration changes across a transition are not suggested.
- Weekly review shows the current completion status of work dated/scheduled within a Monday–Sunday week, including recurring occurrence statuses. It does not invent completion timestamps. Selected unfinished ordinary tasks can be carried into a reviewed range; expired deadlines must be deliberately edited before future work can fit.

Every placement is a preview followed by explicit Apply. The shared transactional task store checks planning-relevant fields and occupancy again before writing atomically. Concurrent notes/checklists are preserved; changed schedules, deadlines, completion state, or locks reject stale previews. Durable operation receipts make retries idempotent. The same generated IDs and operation ID are retained for uncertain saves, in owner/planner-scoped session storage plus in-memory fallback when storage is unavailable. Discard preview never means Undo.

No new collection, listener, paid AI call, framework, or automatic scheduling is introduced. Existing AI and manual task/date editing remain authoritative. Sessions inherit no automatic completion relationship or reminder opt-in. Recurring occurrences must be changed through the existing scope-aware Schedule editor.

Validation uses planning model, slot, command, transaction, and UI tests, plus Chrome with actual Schedule/inspector modules and simulated cloud persistence. Both build paths and full hosted CI are required before merge. Authenticated Firebase writes/permissions still need a real-account smoke check.
# Planning through Kairos AI

In AI chat, request an assignment session plan, carry unfinished work to a new range, or find safe alternatives for clashes. Examples:

- “Split my science assignment into four 30-minute sessions before Friday.”
- “Move unfinished work from this week to next week.”
- “Fix today's clashes.”
- “Which deadlines should I focus on?”

Session planning needs a total effort and session length; the assistant asks when these are missing. Placement ranges are inclusive and limited to 31 days. Default daily availability is 07:00–22:00 in the profile timezone. Existing commitments, deadlines, locks, and time preferences still apply. Overdue deadlines must be reviewed before future placements can fit.

Changes open a review with the exact tasks, dates, and times. Nothing changes until **Apply changes**. Cancel or Escape leaves the planner untouched. Fixed or locked overlaps that cannot be resolved are disclosed. Session tasks remain linked to their assignment; finishing sessions does not complete the original assignment or its checklist.

The preview is saved with the chat's pending operation. If a response is lost, retry checks the original receipt and reuses the reviewed session IDs. A changed schedule or timezone requires cancelling the stale request and making a fresh plan. Deadline and weekly questions use a fresh planner snapshot; weekly counts describe the current status of work dated in that week, not historical completion dates.
