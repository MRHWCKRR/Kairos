# AI planner reliability

Stage 1 keeps the existing vanilla JavaScript and nested study_plans schema.

- ai-context.js supplies stable task/board/section/event IDs, task times, locks and recurrence. Current work comes before completed history in the bounded context; omitted tasks are explicitly indicated.
- ai-workspace.js stores each chat's last confirmed action target and pending action batch alongside existing messages and memory.
- A batch's owner, plan ID, creation time and operation IDs are saved before any planner mutation, including retries. A retry reuses its original actions rather than requesting another model proposal.
- plan-store.js uses Firestore transactions. Mutation callbacks operate on detached plan state and produce no UI side effects. Notifications occur after a successful commit.
- The plan document has two additive fields: aiActionReceipts (up to 100 compact confirmed operation results) and aiActionReceiptFloor (the greatest creation timestamp evicted). A missing operation at or before that floor fails safely instead of replaying an uncertain old action.
- Receipt comparisons and three-way merges use canonical serialization, so Firestore map ordering cannot change equality.
- UI saves and the Schedule bridge use the same store. Changes to separate entities or fields merge; conflicting edits to the same field fail with a sync notice and preserve the local editor state.
- Legacy sections-only documents normalize into a deterministic legacy-board. Their next save writes boards without deleting the old sections field. No bulk migration is needed.
- First-plan creation uses plan-{uid}, so simultaneous first actions share one document. Existing plan IDs remain unchanged.
- Board creation can reuse a uniquely named existing board; feedback distinguishes reuse from creation. Ambiguous destination names are rejected. A section-only move remains on the task's current board.

Transactions require a connection. Offline or conflicting UI edits show a sync error and need a retry after reconnection or conflict resolution. Reload before a successful save can discard local manual edits. There is no new offline outbox in this change.

Multi-action requests execute in order. Confirmed actions stay applied after a later failure or cancellation. Feedback lists completed actions, and retry skips their receipts. Independent requests stay associated with their originating chats.

## Stage 2

The shared ai-action-schema.js defines supported actions, argument shapes and prompt instructions. Board rename/archive/restore/delete and section create/rename/archive/restore/delete use the same nested objects as the manual UI. Destination boardId/sectionId select exact objects; supplied invalid IDs never fall back to names.

Deleting or archiving a board/section shows child counts and a bounded list of escaped section/task titles. Confirmation pins the IDs, persists the proposal, and records the current contents' canonical signature. The transaction rejects changed contents and requires a fresh review. Confirmed deletion receipts reconcile lost responses even when the original object no longer exists.

resize_task is separate from update_task. Recognised explicit end-time or duration requests allow it; ordinary start-time moves, reminders and refusals do not. Normal moves preserve duration; explicit resizes update estimatedMinutes and lastScheduledMinutes and validate the resulting date/time state. Locks and enabled recurrence still block schedule changes. Unscheduled tasks can receive a duration without inventing dates.

The context catalog includes archived board/section IDs for restoration. Rename follow-ups select the update action matching the confirmed target kind. The current local ISO date uses the configured timezone, including UTC date/year boundaries.

Existing billing, account deletion, verification and anti-abuse paths are unchanged.

## Stage 3

set_task_reminder and remove_task_reminder use the existing task.reminderMinutes field and transactional AI action receipts. Lead times are whole minutes from 1 through 10080. Setting a new lead replaces the old one; removal leaves the task intact. Unscheduled tasks can save a reminder, which activates once they have a scheduled start. Recurring changes apply to the series and clear per-occurrence reminder overrides. The inspector preserves custom lead times.

Task reminders run through the existing app notification minute loop, also checking on focus, visibility and plan load. They require Kairos to remain open. A late check can deliver before the task starts; it does not deliver missed reminders after the start. No email, SMS, standalone absolute-time alarms or closed-app delivery is added. AI feedback distinguishes a saved reminder from enabled delivery; browser permission remains controlled by the user's existing Settings actions.

Delivery uses the profile timezone, including midnight crossings and elapsed-minute offsets across DST. Nonexistent local starts are skipped; ambiguous starts use the earlier instant. Completed tasks/occurrences and archived tasks, boards or sections are excluded. The delivery transaction rechecks the current plan, ownership and notification settings before committing.

The user document has additive taskReminderReceipts entries keyed by task/occurrence, start instant and lead time. Receipts retain every active delivery window, so repeated checks and multiple tabs cannot duplicate an alert. Expired windows are removed on the next delivery; active receipts are not evicted by count or a global timestamp. Notifications retain the existing 50-item limit and merge concurrent panel edits. Legacy sections-only plans remain supported. Notification titles, messages and IDs render as escaped text.

Validation: run npm test, npm run build:cloudflare, npm run test:runtime, then verify planner persistence with a verified test account on a preview deployment. Unit/integration fixtures cover transactions and chat flows but do not verify deployed Firestore rules or notification delivery.
