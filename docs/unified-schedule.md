# Schedule views and planning settings

Schedule owns Day, 3 days, Week and Month. Month mounts the existing Calendar DOM, preserving its month navigation, day details and daily AI insights. The day panel offers a direct transition to the timeline. Legacy `?page=calendar` links resolve to Schedule Month; the selected view uses `scheduleView` without discarding billing return parameters. Switching views protects inspector drafts.

The workspace's `focusDate` is the shared date cursor. Month navigation, day selection, timeline task selection and Today update it through the bridge; changing views keeps that date in the visible range. Explicit Month navigation brings the selected day into view. Date changes use the same inspector draft and account guards as view changes.

`schedule-month.js` projects visible ordinary tasks and recurring occurrences once per month render. Each day shows up to two task previews and a remaining count that opens the existing day panel. Clicking a preview opens the Day inspector at the current task time, preserving a recurring occurrence's logical identity even when its display date has moved. The day panel retains ordinary task controls and daily insights; recurring entries open their occurrence details, with totals computed from the same projected work.

Settings → Planning & Schedule groups planning defaults, weekly availability, timezone, clock format and the completed-task scheduling preference. Schedule has a shortcut to that panel. The existing settings save, merge and recovery flow persists these values.

`settings.planning.rescheduleCompleted` defaults to false. Only the confirmed cloud settings snapshot unlocks manual date, start-time and duration changes. The command and legacy save transactions independently read the saved preference before changing completed schedules. Receipt replay occurs first, so a lost response can still reconcile after the preference is disabled. A new Undo must pass the current preference check.

Completion flags, timestamps, checklists and focus records remain intact. Completed occurrence edits are scoped to the logical occurrence, including when completion arrives while an edit or scope dialog is open. AI planning retains its existing completed-task exclusions.

`schedule-policy.js` compares effective completed schedules. Stored historical occurrences are projected independently of subsequent cadence changes. Schedule opts into completed history and shares one occurrence expansion within each render; default recurrence expansion remains pending-only for planning callers.

Coverage includes the Schedule integration, settings, completed scheduling, pointer and inspector lifecycle tests. DOM and simulated transaction checks do not establish rendered appearance or real authenticated production writes.
