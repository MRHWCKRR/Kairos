# Weekly event occurrences

User authorised single-occurrence edits, skip/restore, series scope, AI parity, reviewed conflicts and native Undo. Keep vanilla JS/Firebase/Cloudflare, mobile blocking and Kairos styles. Imported events remain read-only. No provider writes or new dependencies.

Use an exceptions map on each weekly native event keyed by its original weekday date. Each entry is skipped:true or override: a complete dated event snapshot of editable fields. Original date remains identity after moving across dates/weeks; duplicate visible slots remain separate occurrences. Untouched weekly dates inherit the series. Projection is shared by timeline/month/Today, planning, conflicts and sleep reminders. Imported exceptions are ignored by native projection.

Approaches: detached replacement events duplicate identity and lose series linkage; a new recurrence engine adds unnecessary migration; keyed exceptions extend current fixed-event projection and reuse commands/receipts. Choose keyed exceptions (implementation choice). Existing records need no migration.

Weekly editor defaults to This occurrence on a valid selected date, with Entire series available. Original date is editable to select or restore a skipped occurrence, and an exceptions list makes skipped/moved dates discoverable. Single edits show a dated form and Skip/Restore; series deletion is explicitly labelled. Changing series weekday/cadence with saved exceptions is rejected until exceptions are restored; other series edits preserve complete exception overrides. One-off editor unchanged.

Native change commands pin original occurrenceDate and operation (update/skip/restore), exact full-series before-state and planning signature. Apply rebuilds and validates; receipt-first retries and timezone/account guards remain. Bounded exceptions (200 per series), existing 500 event/700 KiB planner limits. DST gaps rejected for dated overrides. Conflicts inspect only changed/restored occurrence and overnight tail. Undo stores full before/after series and refuses intervening edits, with occurrence-focused overlap review. Large receipts may omit Undo with existing disclosure.

AI update/delete retain existing action names; occurrenceDate is the logical original date. update with occurrenceDate changes only that date, delete with occurrenceDate skips; update restoreOccurrence:true plus occurrenceDate removes an exception. Missing occurrenceDate retains explicit series behavior. New instructions require original date for single-week requests and clarification when ambiguous. Reviews state scope and original date; saved exceptions are included in bounded context.

Tests cover moved/overnight/skip projection, imported ownership, malformed dates, quotas, stale/forged approval, DST, series edits, native and AI retry/Undo, UI scope/discovery, planning/reminders, Chrome journeys and release graph. Independent final review; publish PR and await CI, hold merge/deploy.
