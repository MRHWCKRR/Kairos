# Schedule Plan and My day changed

The calendar Plan button and My day changed now include the profile timezone and saved weekly hours in their AI context. Current date/time, day-change candidates and same-day limits use that profile timezone. With saved hours, generated proposals and manual proposal edits must fit entirely inside a work window; closed days and breaks remain unavailable. The check uses the task's authoritative planned duration, then preserves the existing conflict, fixed-event, recurrence and selected-task validation. Shared window and DST checks are reused. Without a saved week, existing Schedule proposal rules remain in force.

The proposal review identifies the timezone and saved-hour source; Work hours used in the inspector exposes the exact weekly windows. My day changed shows those hours before requesting a preview and still honours its explicit blocked window. No task moves before Apply. Changed settings during an AI response discard that response. Changed hours/timezone while reviewing require a fresh preview, including when the number of proposed rows is unchanged. Account changes close a day-change draft and prevent its submission in another workspace.

Apply forwards the pinned availability through the existing planner save queue. Its Firestore transaction reads current user settings before writing and rejects changed hours/timezone from another device. Persistence failure still restores the previous ordinary/occurrence fields and retains the proposal for review; this retains the existing calendar proposal persistence semantics rather than adding durable action receipts to this flow. Ordinary manual planner edits do not acquire an availability restriction.

Verification covers profile date boundaries, closed days/breaks, malformed model end times, stale responses/settings, proposal edits, transactional settings changes, selected day-change scope, failed-save rollback and existing recurring proposals. Browser checks use the actual calendar/AI/editor modules with simulated model responses and persistence; live inference and authenticated Firebase writes remain a release smoke-check limit.

# Saved weekly availability

Settings > Personal > Weekly availability supports optional saved work hours, with zero to four same-day windows per day. The editor displays Monday first; stored day keys use Sunday=0 through Saturday=6. Hours use the profile timezone. Empty days are unavailable; an entirely empty week never falls back to daily hours. Windows must have valid HH:MM times, end after their start and not overlap. Use separate day windows instead of an overnight interval. Touching windows count as one continuous period for placement.

Hours live in the existing users/{uid}.settings.planning.weeklyAvailability field as a day-keyed map of window arrays, avoiding Firestore nested arrays. Null or missing means no saved weekly schedule. No existing tasks move and no migration or new listener/collection is needed. Settings Save/Cancel, conflict-preserving merge, local failed-save recovery and Retry are reused. Invalid drafts remain editable and cannot be saved. Confirmed settings feed Planning; an unconfirmed local settings save does not replace the cloud planning defaults.

Planning defaults to saved weekly hours when present and offers Custom daily hours for this plan. The same windows constrain session creation, revision, carry-over, conflict alternatives and deadline capacity. A session must fit wholly inside a window. Closed days, breaks, preferences, occupancy and DST stay enforced. Exact windows are disclosed with the preview. Kairos AI chat's structured planning actions use cloud weekly defaults when dayStart/dayEnd are omitted; explicit daily hours override the weekly schedule for that request. Status summaries use the same saved hours. Manual task editing stays independent of automatic proposal bounds. Schedule Plan and My day changed also use saved weekly hours as described above.

Each saved-hours command pins its exact hours. Before the first write, the existing planner transaction reads current user settings and rejects changed weekly hours; it checks the durable receipt first so a lost-response retry still reconciles a previously successful operation. Custom daily previews keep their explicit hours. Timezone and normal schedule stale-preview validation remain in force. Preview payloads omit undefined fields and use the same persistable day map.

Validation covers closed days, separate and adjacent windows, malformed/overlapping hours, preferences and DST, exact command containment, daily overrides, shared AI/capacity defaults, changed-hours rejection, durable retries, invalid settings and failed-save recovery. Chrome checks use actual Settings save/recovery functions and feature modules with simulated persistence; authenticated Firebase writes and live model inference still require a real-account smoke check.

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

Schedule → Planning contains six views:

- Deadlines sorts unfinished ordinary tasks by dueDate, with overdue/today/upcoming labels, missing deadlines, and scheduled-after-deadline warnings. Edit deadline opens the existing Schedule inspector. Scheduled date and deadline remain separate.
- Assignment sessions splits an unscheduled, unlocked ordinary task into up to 40 reviewed sessions within a date range of at most 31 days. Specify effort, session length, availability, and optionally a title for each work step. No partial plan is created when capacity is insufficient. The original task/checklist remain intact; sessions are ordinary tasks in the same section with additive assignmentId and sessionIndex metadata. They share the parent's deadline but do not complete the parent. Existing sessions prevent repeated generation.
- Session plans revises remaining effort or reschedules unfinished sessions with an explicit preview. Completed work stays intact; surplus sessions are archived for recovery.
- Combined plan checks up to 10 assignments and 40 unfinished sessions against one shared pool of free time. It tries all selected work first, then whole assignments in deadline order if a full plan cannot be found. Partial previews explicitly list assignments left unchanged. A failed placement is not proof that every possible arrangement fails. Free minutes are an upper bound, and any quantified minute shortfall is a lower bound. Missing deadlines use the range end; locks stay fixed.
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

Session planning needs a total effort and session length; the assistant asks when these are missing. Placement ranges are inclusive and limited to 31 days. Saved weekly availability is used unless the user requests custom daily hours; without saved hours, daily availability defaults to 07:00-22:00 in the profile timezone. Existing commitments, deadlines, locks, and time preferences still apply. Overdue deadlines must be reviewed before future placements can fit.

Changes open a review with the exact tasks, dates, and times. Nothing changes until **Apply changes**. Cancel or Escape leaves the planner untouched. Fixed or locked overlaps that cannot be resolved are disclosed. Session tasks remain linked to their assignment; finishing sessions does not complete the original assignment or its checklist.

The preview is saved with the chat's pending operation. If a response is lost, retry checks the original receipt and reuses the reviewed session IDs. A changed schedule or timezone requires cancelling the stale request and making a fresh plan. Deadline and weekly questions use a fresh planner snapshot; weekly counts describe the current status of work dated in that week, not historical completion dates.

Ask "Plan my English and Science assignments together before Friday" for a reviewed schedule, or "Will both assignments fit this week?" for a capacity-only report.

Combined requests use one validated `plan_assignments` action with exact parent `assignmentIds`, a placement range, optional daily hours and an optional boolean `checkOnly`. They reuse the same `combinedPlanning` engine as Planning. Individual assignment feasibility results must never be added together to claim a shared plan fits. Missing or ambiguous IDs require clarification; effort and work sessions are never invented.

Capacity-only questions use `checkOnly:true` and return a report without Apply or any planner write. No-fit results also return a report, rather than an uncertain-save error or retry prompt. If a selected assignment has no unfinished sessions, the request returns a report so the user can review or create sessions first. Scheduling requests with a candidate open one review with capacity results, per-assignment status, exact session rows, and explicit disclosure of excluded work. Only reviewed rows move. Partial saves report that sessions outside the preview stayed unchanged. No new AI call, listener, collection, or receipt schema is introduced.

# Optional spacing

Planning offers None (default), 5, 10 or 15 minutes of spacing for each plan. Kairos AI accepts the same choices as `gapMinutes` on session, combined-assignment, carry-over and conflict-planning actions. It defaults to zero unless the user asks for a gap. Spacing is retained in the reviewed command and exact Retry; older previews without the field retain their original zero-gap behavior. It is not a saved account preference.

Every proposed session leaves the chosen elapsed-time gap before or after neighbouring active scheduled tasks, locked/recurring work and fixed commitments. Existing commitments are not moved to add spacing between themselves. No break tasks are created, session effort is not inflated, and no extra padding is required at an otherwise empty work-window edge. Neighbouring days are checked at range boundaries; split weekly windows and timezone transitions still constrain placement. Invalid nearby commitment time boundaries are treated conservatively and may require review.

Capacity free-minute totals remain an upper bound before spacing. Actual candidate placement and Apply both enforce the chosen gap. A spacing-related failure can leave a whole assignment unplaced even when raw free minutes exceed its effort; this does not establish impossibility for every arrangement. Reports disclose the gap and explain when it prevents the checked candidate from fitting. Calculations are cached only for the lifetime of a preview/check/Apply operation and scoped by timezone.
