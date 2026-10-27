# Native events in Schedule

Choose + Event in Schedule or Edit event from a native event inspector. Events default to the selected Schedule date. Use Does not repeat for one date, or Every week for an existing weekly commitment. All day covers the whole date/day. A timed end earlier than its start ends the next day; the editor labels this explicitly. Show as busy reserves time; free events remain visible.

Review event lists unfinished task overlaps before Save event. Dated reviews include overnight continuation; weekly reviews check today through 30 days ahead and state that later weeks are not checked. Saving does not move tasks or require appointments to fit task work hours. Schedule/timezone changes invalidate a review. Imported events remain read-only and are managed through Calendars.

Delete event opens a deletion review. Preview Undo shows the prior event and any restored overlaps, then Apply Undo confirms it. Undo uses one owned receipt once, refuses intervening event edits/identity reuse, and preserves unrelated tasks/events. Lost responses retry the original command identity. Account/planner switches clear the visible draft; clearing recovery retains inputs but requires a new review. Dirty drafts request confirmation before closing or reloading.

One-off sleep events produce bedtime reminders only on their stored date; all-day/free events do not. Existing weekly sleep reminders retain their behavior. Event upserts/restores are bounded to 500 native events and 700 KiB planner state; deletion stays available for cleanup. Exceptionally large legacy event metadata may omit Undo rather than block cleanup. No provider writes, billing changes or new dependencies.
