# Planner capture, Today and recovery

Kairos keeps one planner document and the existing Firebase ownership checks.

- New task stays available in the sidebar and through the existing configurable keyboard shortcut. It defaults to the current task section, today's date on the dashboard, or the selected date in Schedule. An existing draft or unconfirmed save keeps its original destination and dates.
- The dashboard now groups unfinished work into Needs attention, On today and To plan. It uses the profile timezone, includes weekly events and recurring occurrences by their effective date, and keeps overdue occurrences visible. Ordinary tasks can be completed or planned for today directly. Recurring work opens the selected logical occurrence in Schedule.
- AI mutations show a review before applying. Creation reviews include dates, times and destination. Existing batch processing still reports saved actions separately from an unconfirmed remainder.
- AI task, board and section deletion moves work into Archive. Restore preserves the saved object and children, and refuses stale reviewed contents.
- Undo AI change opens a review of the last supported unconsumed AI receipt. Reversal checks affected values and scheduling dependencies, and preserves unrelated fields. A receipt stores at most 250 field changes and 16 KiB of inverse data; larger changes explicitly report that automatic Undo is unavailable. The existing 100-receipt / 64 KiB history bounds still apply. Archive remains available independently.
- Today actions, Archive restore and reviewed AI Undo share an owner/plan-scoped mutation session. It retains the command before submitting, blocks overlaps and retries with the original operation identity. A lost acknowledgement cannot create a second mutation. Recovery is cleared only for the matching saved request. Pending requests are never automatically replayed on reconnect.
- Export Your Data downloads a versioned `kairos-backup` JSON file containing the currently loaded planner, including Archive, settings, achievements and focus totals. Existing top-level export keys remain available. It refuses to export while the planner is unavailable. It does not provide full-account restoration or export the separate AI chat history.

Task creation, ordinary completion and archiving reuse the task command model across manual/AI entry points. Schedule interactions and detail edits keep the existing guarded command transaction. Composite AI updates, explicit resizes, task moves and reminders now use ai-task-commands.js to translate requests into those same commands on a private draft. Existing duration, destination, lock and explicit-resize rules stay in force; completed-task scheduling reads the saved preference in both preview and transaction. An invalid later step cannot partially save an earlier rename or completion.

## Verification

`npm test` runs the unit, DOM journey and transaction regressions. The Cloudflare runtime test needs loopback access and a working local Workers runtime.

`npm run test:planner-browser` builds an isolated, self-contained browser fixture from the production modules and runs it in headless Chrome. Set `CHROME_BIN` to an alternative Chrome binary if needed. The normal GitHub build workflow runs this check after the regression suite. The fixture covers capture, Today, completion with a lost acknowledgement, identical-operation retry, Archive/restore, reviewed Undo and backup. It uses isolated test data and an in-memory transaction adapter, never a live Firebase account.

No Firestore collection migration or live billing configuration is introduced.

