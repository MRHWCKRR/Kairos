# Read-only calendar import design

Authorisation: user accepted calendar import with shared event commands and asked to proceed. Implement within existing vanilla JS/Firebase/Cloudflare architecture.

Import .ics files or published Google/Outlook/iCloud feed links. Preview before saving. A source owns read-only dated commitments, refresh replaces that source atomically without duplicates, and removal deletes only that source. Default range is today minus7 through plus90days in profile timezone; show range explicitly and permit choosing up to366days. Refresh is explicit, never a hidden background write. Unsupported/malformed calendars fail clearly without partial imports. Source URLs can be private capability links: persist only in owner planner, never include them in AI context, logs or diagnostics.

Use a vendored pinned ICAL.js parser (MPL2.0 with provenance/license) for recurrence/exceptions/VTIMEZONE rather than a handwritten RRULE engine. Unknown TZID without definition must fail rather than silently shift times; known IANA TZIDs can use Intl with explicit conversion. Respect cancelled/transparent events, all-day exclusive end dates and overnight spans. Bound bytes, event count, recurrence iteration and date range. No silent partial truncation.

Source metadata is calendarSources (default empty) in existing planner document. Imported rows are scheduleEvents with date/start/end, allDay/transparent, calendarSourceId/externalId/readOnly. Keep existing weekly events compatible. One shared date-aware event projection drives rendering, Today and conflict checks; imported events cannot be changed by legacy or AI event editors. Busy intervals block actual transaction validation as well as previews.

Shared commands calendar_sync/calendar_remove validate exact source/event baseline at save, retain unrelated tasks and sources, enforce limits and use existing operation receipts/recovery. Preview refresh/add/update/remove counts; drafts retained on failure; Retry submits exact original payload. Account/planner changes cannot apply old results to new scope.

Network feed fetch is authenticated, verified-email/AppCheck protected and rate-limited. HTTPS only (webcal normalised), restrict known published feed endpoints, no arbitrary host/redirect fetch, no forwarded credentials, bounded response and timeout, no cache. Other providers can use .ics upload. This trades generic feed URLs for a smaller auditable network boundary.

No OAuth/two-way writes, no automatic subscription scheduler, no billing changes. Existing monthly calendar stays available.
