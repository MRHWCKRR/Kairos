# Weekly event occurrences

Open a weekly event in Schedule. **This occurrence** is selected by default. The original occurrence date identifies that week even if you move it to another date or across midnight. Change its title, category, date, times, All day or busy/free status, then review overlaps and save. Other weeks keep their series settings.

**Skip occurrence** removes that week only. The editor lists changed and skipped original dates; choose one, then **Restore occurrence** to return it to the current weekly template. Both skip and restore require review. You can open any visible week of the series to find skipped dates. The original-date input also selects a different week.

Choose **Entire series** to edit the template or delete the whole series. Existing exceptions retain their reviewed details. Restore all exceptions before changing the series weekday or converting to a one-off event. Each series supports up to 200 exceptions; the planner's existing event and size bounds still apply.

AI update/delete actions accept occurrenceDate for the original weekly date. date is a moved destination. Delete with occurrenceDate skips; update with restoreOccurrence:true restores and accepts no other changed fields. Without occurrenceDate the action edits/deletes the entire series. Chat context and confirmation identify the scope, including after reload/retry.

Projection is shared by timelines, Month, Today, planning, conflicts and sleep reminders. Skips remove occupied time and reminders; moves reserve the destination and overnight tail. Imported calendars remain read-only. Saving never moves tasks automatically.

Native receipt Undo restores the series before-state once, previews restored occurrence overlaps and refuses later series edits. Exact-command recovery prevents duplicate exceptions after lost responses. Profile timezone, account and planner guards remain in place.

Verification uses isolated persistence and model responses; Chrome exercises the production editor/adapter/shared save and Undo. These checks do not establish live inference or authenticated production Firebase writes.

Schedule AI receives effective occupied segments over its planning horizon, including skipped/moved dates, overnight tails and busy overrides. Legacy day commentary uses the same projection over a labelled 31-day range. Today links preserve the original week when multiple occurrences land on one date. Coincident weekly sleep reminders retain separate logical identities.
