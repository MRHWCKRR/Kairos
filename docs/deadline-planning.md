# Assignment deadline feasibility

Planning > Deadlines checks remaining active, unfinished session effort against the free time from now through the assignment deadline. Capacity checks use the selected daily start/end and the profile timezone. Kairos AI receives the same calculations with the stated 07:00–22:00 default. These are planned minutes, not measured work or predicted completion dates.

Each assignment is checked independently against existing tasks, recurring occurrences, and fixed commitments. Its own movable sessions are excluded from occupancy so they are not counted twice; locked sessions remain fixed and occupied. A parent estimate is never added to its session effort. Archived/completed sessions are excluded. Several assignments may compete for the same free time, so individual fits results are not a combined plan.

Fits means the shared scheduling preview found a complete valid placement, respecting session durations, child/parent deadlines, ordering, preferences, timezone/DST and locks. It may require rescheduling; it does not certify current saved times. Free minutes are an upper bound before session fragmentation and preference/DST constraints, and a quantified shortfall is a lower bound. Needs review is shown if the search cannot produce a full plan without a proven total-minute deficit. Missing/past deadlines, deadlines beyond 31 days, invalid fixed work and more than 40 active unfinished sessions receive explicit guidance rather than an assurance. No unfinished sessions does not complete the assignment.

To bound synchronous work, the ten nearest active assignment deadlines are checked; omitted assignments are disclosed in the UI and AI summary. Check capacity refreshes the snapshot after edits. Preview session reschedule recomputes against the current planner and opens exact reviewed rows; Apply uses the existing stale-state validation, durable receipts and retry handling. Checking capacity and asking whether work is on track never write data.

Validation covers overlap merging, overnight carry-in, current-time clipping, completed/archived work, locked placements, earlier child deadlines, preferences/order, fragmented gaps, DST, bounded summaries, escaped titles, invalid inputs, stale previews and exact Retry. Browser checks use actual modules with simulated persistence; authenticated Firebase writes still require a verified test-account smoke check.

# Deadline planning

## Optional session ordering

Keep numbered session order is opt-in when creating sessions. Existing plans stay independent until you enable it in Session plans and apply a reviewed effort preview. It follows the session numbers shown in the linked-session list; this is a linear sequence rather than an arbitrary dependency graph. Session titles entered during creation follow that same sequence.

Ordered sessions show Ready when all earlier active sessions are complete, or Waiting for the first unfinished prerequisite. Ready describes prerequisites, not whether the scheduled time has arrived. Completing a later session or reopening work remains possible; if reopening creates conflicting saved times, an order-needs-rescheduling warning appears. The assignment is never completed automatically. Archived sessions are excluded from the active sequence.

Planning and AI carry-over previews include movable later unfinished sessions when an earlier session is selected. Every affected task and time is reviewed before Apply. Completed work and locked sessions remain fixed. A fixed successor that prevents the requested sequence, or an unscheduled prerequisite outside the request, produces an error with guidance to review the lock/range or reschedule the whole assignment. Session-plan rescheduling uses the saved ordering setting; change that setting through Preview effort changes.

Both task duration and overnight end dates constrain order. Occupancy, deadlines, profile timezone, and DST validation still apply. The transactional planner store rejects scheduling or ordering writes that would introduce a reversed sequence, including direct AI moves. Unrelated notes/reminders and completion-only edits remain editable when an existing order needs repair. Sequence settings and session numbers are included in stale-preview checks; retries retain the reviewed operation and session IDs.

Assignment task rows and both task inspectors show active session progress, remaining planned minutes, and the parent deadline status. Linked-session buttons open the existing editor with its Save/Discard/Stay draft guard. Counts exclude archived sessions; they measure planned work rather than time tracked. Completing sessions never completes the parent assignment automatically.

In Schedule → Planning → Session plans, select an assignment to revise its remaining effort or reschedule unfinished work. Effort excludes completed sessions. Revisions reuse unfinished task IDs and preserve notes and checklists. Increasing effort can add sessions; reducing effort explicitly lists surplus sessions for archival. Zero remaining minutes archives every unfinished session without completing the assignment. Archived tasks remain recoverable in Archive. There may be at most 40 active sessions, including completed sessions.

Effort revisions require unfinished sessions to be unlocked and ordinary. Reschedule preserves duration and leaves locked or recurring sessions in place, with a preview notice. Both task and parent deadlines constrain placements. Every change uses a reviewed preview, stale-state validation, and exact operation/session IDs for uncertain retries.

Schedule → Planning contains five views:

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
