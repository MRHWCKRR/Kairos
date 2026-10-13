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

Existing billing, account deletion, verification and anti-abuse paths are unchanged. Board/section CRUD expansion, reminder commands and explicit task duration changes are later stages.

Validation: run npm test, npm run build:cloudflare, npm run test:runtime, then verify planner persistence with a verified test account on a preview deployment. Unit/integration fixtures cover transactions and chat flows but do not verify deployed Firestore rules or notification delivery.
