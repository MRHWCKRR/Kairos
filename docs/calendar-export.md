# Calendar export

Open Schedule > Calendars > Export schedule. Choose inclusive dates (up to366days) and whether to include scheduled tasks, events, completed tasks or imported events. Imported/completed entries are off by default. Review, then Download .ics. Import that file into your other calendar app. No live subscription or two-way sync is created, and repeated imports may duplicate items depending on the receiving app.

Only titles, dates/times and busy/free status are exported. Notes, board/section names, feed URLs, alarms, attendees and raw account/planner/entity IDs stay out of the file. Stable opaque hashed UIDs distinguish tasks and logical recurring occurrences. The file is generated on your device; no new server upload or planner save occurs.

Exports include complete occurrences intersecting the selected dates, including overnight continuations. Recurring skips, moved dates and weekly date limits follow Schedule projection. Free events remain transparent. Date-only tasks are omitted; scheduled task duration uses the same Schedule helper when only an estimate supplies an end. Invalid timezone-transition times are omitted with a disclosed count. Timed entries are UTC; all-day dates use an exclusive next-date end. Empty results require changing dates/filters before download. Over5000items or5MiB is rejected, never partially exported.

Changing the planner, timezone or filters invalidates a reviewed export. Account/planner switches close the dialog and discard prepared results. No imported source or original planner data is changed.

Format reference: https://www.rfc-editor.org/rfc/rfc5545.html. Automated checks parse emitted files using existing ICAL and exercise the production dialog/exporter in Chrome with isolated data. They do not establish actual import UX in Google, Apple or Outlook, authenticated Firebase writes, or live model behavior.

Imported calendars whose source timezone differs from the profile must be refreshed/replaced before inclusion; native-only export remains available. Source metadata is part of the pinned review.
