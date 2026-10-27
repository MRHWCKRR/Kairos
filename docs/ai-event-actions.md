# AI event actions

Ask Kairos AI to add, move, rename or delete native appointments and weekly commitments. One-off appointments use a date; weekly commitments use a weekday. New timed events need both start and end times; if one is missing, Kairos should ask rather than invent duration. All-day events use midnight boundaries. An end earlier than its start means next day. Free events remain visible without reserving task time.

Date-only moves keep times. Start-only timed moves keep duration, including overnight events. Converting an all-day event to timed needs both boundaries. Date or weekday changes explicitly choose one-off or weekly behavior. Imported/read-only calendar events cannot be changed; use Calendars to refresh/remove their source.

Every change opens a native event review with before/after, timezone and unfinished-task overlaps. Tasks stay unchanged. Dated reviews include overnight tails; weekly reviews label today through 30 days ahead. The first 50 overlaps are shown with the total count and omitted count; task notes are not copied into retained review summaries.

Apply uses the same native event command validation as Schedule. Changed schedules, targets or profile timezone require a fresh preview. Cancel and request a new change if an approval is stale. Retried pending chat batches preserve the original event ID, command and operation identity across reloads; confirmed receipts are reconciled before another review. Success wording and follow-up IDs come from confirmed results.

Undo AI change uses a one-use native event receipt and shows restored overlaps before applying. It refuses later event edits or imported identity reuse and preserves unrelated tasks/notes. New event receipts do not expose a second generic Undo path. Existing task/planning actions retain their prior review and Undo behavior. OpenRouter/provider/budget settings remain unchanged.

Automated verification uses production action/schema/chat/transaction code with isolated persistence and model responses. Chrome covers the production event adapter/review renderer/shared save/native Undo flow. Live inference and authenticated production Firebase writes are separate checks, not established by fixtures.
