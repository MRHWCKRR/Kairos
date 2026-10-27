# Calendar imports

Open Schedule and choose Calendars. Upload an .ics export or paste a published Google, Outlook or iCloud calendar link. Give it a name, choose the dates, then Preview import. Nothing is saved until Import calendar is confirmed.

Imports are read-only. Busy events reserve planning time on their actual dates; free/transparent events remain visible. All-day events reserve their full dates. Existing weekly events continue to work. Imported events appear in Today, day/week views and the monthly calendar.

Each source has Refresh (published feeds), Replace file (exports), and Remove. Refresh is manual: it previews additions, changes and removals, then replaces only that source. It never writes back to the external calendar. The default import window runs from seven days before today through 90 days after; the displayed window is authoritative. Refresh to extend it. No automatic subscription refresh or provider OAuth is introduced.

A lost save response can be retried with the original operation identity. It cannot create duplicate events or overwrite a later refresh. Clearing recovery keeps the preview available. Switching accounts/planners discards the old visible draft while leaving recovery in its original scope.

Events are materialized in the profile timezone used during import. After changing that timezone, refresh a feed or replace its file before placing tasks again. Progress and notes remain available; mismatched saved timezone is checked in the transaction. Unsupported calendar formats/timezones fail explicitly rather than import guessed times.

Limits: 1 MiB input, 366 days per preview, 1000 dated segments across imported sources, 10 sources and a 700 KiB planner import budget. Removing a source remains available above the import budget. Feed requests require verified sign-in and App Check, use an existing rate limiter without consuming AI credits, and accept only HTTPS published endpoints for supported providers. Redirects and arbitrary hosts are refused. Other providers can use file upload.

Published calendar links may contain private capability tokens. Links are stored with the account's source metadata, omitted from AI context and diagnostics, and sent only to the authenticated import endpoint. Do not share private calendar links publicly. Raw ICS files are parsed locally and not uploaded to a third-party parser.

Implementation: calendar-parser.js and pinned ICAL.js handle calendar expansion; calendar-commands.js owns guarded source replacement/removal; schedule-events.js projects date-specific and weekly commitments; calendar-import.js owns the dialog; calendar-feed-client.js/server/calendar-feed.js provide bounded feed retrieval. calendarSources defaults to an empty list in the existing planner document. No collection migration or billing configuration change.

Recurrence expansion has a bounded search budget, including timezone transitions and iterator initialization. Unsupported or malformed rules fail the entire preview; no partial import is saved. Event times must fall on whole-minute boundaries.

After saving a source, use Review conflicts to see overlapping unfinished tasks. Preview selected moves searches today through the next seven days using saved weekly hours, or 07:00–22:00 when none are saved. Recurring moves affect only the selected occurrence and stay on its day. Locked, fixed recurring, past, underway and farther-future work needs manual review. All selected moves must fit before anything saves. Retry reconciles an unconfirmed save; Undo refuses changed/completed work, missed deadlines or collisions with current commitments. Refreshing a calendar never moves tasks automatically.
