# Deadline planning

## Outcome

Help a student understand approaching deadlines, break an assignment into scheduled work, resolve overlaps, and review a week. Preserve existing task dates, dueDate, recurring rules, AI actions, payments, and the desktop Kairos design. The user explicitly requested planning followed by implementation and verification in this session.

## Shared approach

Add a Planning button to Schedule, opening a keyboard accessible dialog with Deadlines, Assignment sessions, Conflicts, and Weekly review views. Reuse the current task inspector for editing dates/deadlines. Reuse the existing transactional task command store, ownership guards, and operation receipts for all writes. No additional framework, cloud collection, AI call, or automatic mutation.

All generated placements are previews requiring Apply. Revalidate against current tasks, fixed events, recurring occurrences, locks, due dates, and the current profile timezone at commit. A stale preview fails atomically. Exact Retry retains operation ID and generated session IDs; uncertain saves can be reconciled without adding duplicates. Notes/checklists unrelated to a placement remain intact.

## Deadlines

Keep date as scheduled work and dueDate as the end-of-day deadline. Show unfinished ordinary tasks sorted by deadline, overdue/today/upcoming status, and scheduled-after-deadline warnings. Tasks without deadlines are shown separately for adding one through the existing inspector. Completed and archived work does not appear as overdue. Recurring series are managed as occurrences in Schedule rather than treating their template as a single deadline.

## Assignment sessions

Choose an unfinished, unlocked, unscheduled ordinary assignment, total minutes (15–2400), session length (15–120), date horizon (up to 31 days), daily availability, and optional session titles. At most 40 sessions. Split the estimate into bounded ordinary tasks linked by assignmentId to the original task. Preview every title/date/start/duration; apply only when all sessions fit safely before the assignment deadline. Retain the parent and its checklist; completing a session never completes the parent. Reject repeat generation while linked sessions exist. Editable optional session labels let the user name actual steps such as Research, Outline, and Draft.

## Conflict handling

Show actual overlapping scheduled tasks, recurring occurrences, and weekly fixed commitments, including overnight carry-in. Touching endpoints are not overlaps. Offer alternative slots only for unfinished unlocked ordinary tasks; locked and recurring items remain unchanged. Keep duration and respect dueDate, availability, preferences, timezone transitions, and occupied intervals. If there is no safe slot, report that without forcing a placement.

## Weekly review

Choose a Monday-to-Sunday week. Report current completion status of work scheduled for that week (not historical completion timestamps, which the existing model does not reliably store). Include recurring occurrence status, unfinished/slipped work, and next-week deadlines. Select unfinished unlocked ordinary tasks to carry into a reviewed date range. Carry-over uses the same conflict-safe preview and commit path. Recurring progress is reviewed but edited through Schedule scope controls.

## Safety and verification

Use profile timezone for today/time; never treat a deadline as an appointment. No past-time scheduling. Skip nonexistent DST times and do not schedule a block whose elapsed duration differs across a timezone transition. All draft controls lock during Apply; account/planner changes close the dialog and invalidate async callbacks. Session-only pending retries are account/planner scoped. Escape and Close restore focus and never write data. Tests cover malformed dates, boundary times, midnight/overnight events, recurring exceptions, stale previews, duplicate IDs, lost responses, storage failures, and account switching. Verify Chrome normal/empty/error states, keyboard use, overflow, and light/dark desktop sizes, then full regression and both build paths. Authenticated cloud writes require a real test account and will be disclosed if unavailable.
