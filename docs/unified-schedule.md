# Schedule views and planning settings

Schedule owns Day, 3 days, Week and Month. Month mounts the existing Calendar DOM, preserving its month navigation, day details and daily AI insights. The day panel offers a direct transition to the timeline. Legacy `?page=calendar` links resolve to Schedule Month; the selected view uses `scheduleView` without discarding billing return parameters. Switching views protects inspector drafts.

Settings → Planning & Schedule groups planning defaults, weekly availability, timezone, clock format and the completed-task scheduling preference. Schedule has a shortcut to that panel. The existing settings save, merge and recovery flow persists these values.

`settings.planning.rescheduleCompleted` defaults to false. Only the confirmed cloud settings snapshot unlocks manual date, start-time and duration changes. The command and legacy save transactions independently read the saved preference before changing completed schedules. Receipt replay occurs first, so a lost response can still reconcile after the preference is disabled. A new Undo must pass the current preference check.

Completion flags, timestamps, checklists and focus records remain intact. Completed occurrence edits are scoped to the logical occurrence, including when completion arrives while an edit or scope dialog is open. AI planning retains its existing completed-task exclusions.

`schedule-policy.js` compares effective completed schedules. Stored historical occurrences are projected independently of subsequent cadence changes. Schedule opts into completed history and shares one occurrence expansion within each render; default recurrence expansion remains pending-only for planning callers.

Coverage includes the Schedule integration, settings, completed scheduling, pointer and inspector lifecycle tests. DOM and simulated transaction checks do not establish rendered appearance or real authenticated production writes.
