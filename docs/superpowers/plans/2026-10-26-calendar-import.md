# Calendar Import Implementation Plan

> For agentic workers: use focused parallel implementation tasks and independent whole-branch review. User authorised implementation; avoid further confirmation for routine design choices.

Goal: import read-only dated commitments from .ics and published feeds, refresh/remove through retained shared commands, and block planning conflicts.
Architecture: bounded ICS parser -> preview -> calendar command -> existing transaction/session; focused UI and authenticated Cloudflare feed fetch. Preserve vanilla JS, ownership and Stripe.
Spec: docs/superpowers/specs/2026-10-26-calendar-import-design.md

## Review focus
- Lost acknowledgement retry must not duplicate/import old source content over later refresh.
- Account/planner changes while reading/fetching/parsing/saving must not leak drafts or mutate new scope.
- Recurrence, exceptions, DST, midnight and exclusive all-day end dates must project correctly or fail explicitly.
- Every scheduling validator and monthly/weekly/Today view must honour date specificity; no imported commitment may repeat every week accidentally.
- Feed URLs and hostile calendar text remain untrusted; no SSRF, token logging, markup injection or unbounded expansion.

### Task1 parser
- [ ] Vendor official pinned ICAL.js with license/provenance; parseCalendar(text,{sourceId,timezone,from,to}) async -> {events,warnings,name}; events {externalId:64hex,title,date,start,end,allDay,transparent}, overnight segmented per date, date inclusive range. Test real ICS including overrides/cancel/exdate/timezone/all-day/limits.
### Task2 commands and dated event projection
- [ ] calendar-commands.js buildCalendarSync(state,source,events)/buildCalendarRemove(state,id) -> {command,expected,summary}; applyCalendarCommand pure validates baseline and max10sources/1000events/700KB snapshot. Source {id<=64,name<=120,kind:file|feed,url?<=2048,timezone,from,to,updatedAt}. Imported events deterministic sourceId+'-'+externalId; readOnly/calendarSourceId flags.
- [ ] planState includes calendarSources default []; task-list-model routes calendar commands. Reject AI imported event update/delete. Shared eventSegmentsForDate(events,date,{busyOnly=false}) -> {event,startMin,endMin,continued}[]; migrate planning occupancy/proposal conflict validators, weekly/month/Today/AI context event projections and planning signatures. Keep old weekly events unchanged. Test read-only/dates/conflicts/receipts.
### Task3 feed endpoint
- [ ] shared calendar-feed-url.js normaliseCalendarFeedUrl(value) -> https URL string or throws; known provider published feed paths only. server/calendar-feed.js createCalendarFeedHandler({adminAuth,appCheck,rateLimiter,fetchImpl,timeoutMs}) -> native Request->Response, POST {url}, authenticated verified/AppCheck, rate limit, timeout/1MiB cap/no redirects/no logs/cache. Wire worker route; tests invalid URLs/auth/limits/upstream failure.
### Task4 UI and shell (root)
- [ ] calendar-import.js mountCalendarImport({document,window,getIdentity,getState,getTimezone,getToday,ensurePlan,commit,session,fetchFeed,confirmRemove}) -> {open,sync,dispose}; existing dialog language, file/feed inputs, source list, preview counts/range, explicit apply/refresh/remove, pending retry/clear through shared session. Never rebuild exact retained command on retry.
- [ ] Bridge supplies getCalendarSources/session/fetchFeed; app tracks calendarSources through hydration/rebase/ordinary saves and account reset, lazily mount dialog from Schedule toolbar. Register assets and versions. Tests UI cancellation/account switch/retry + browser journey.
### Task5 final verification
- [ ] Focused tests, npm test, real Chrome journey, builds and runtime CI. Independent whole-branch review and fix actual regressions. Publish PR for broad change review, do not merge/deploy until authorised.
