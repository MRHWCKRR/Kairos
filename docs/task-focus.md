# Focus time linked to tasks

The existing dashboard timer and a shared timer bar now use one controller. Start focus from an ordinary task or assignment session in Tasks details or the Schedule inspector. The editors show planned minutes and logged seconds; an assignment rolls up its own logged time plus retained linked sessions, including archived sessions. Planned assignment minutes count active linked sessions, including completed sessions. Logging time never adjusts estimates or automatically completes a parent assignment.

Pause/Resume preserves elapsed time. **Log time** saves time without changing completion; **Log and complete** saves time and marks the selected ordinary task complete in the same Firestore transaction. General focus remains available on the dashboard and contributes only to overall totals. The bar stays available when switching pages. Existing task notes/checklists and editor draft guards are preserved. Recurring-series/occurrence focus attribution is not included in this version; those editors do not offer the task-linked entry point.

## Persistence and recovery

A local record scoped by account retains the captured planner, task ID/location/assignment identity, accumulated milliseconds, checkpoints and any pending log. Every running second checkpoints locally. Page exit pauses synchronously; crash/reload recovery uses only the last checkpoint and stays paused. Resume is explicit. A single log is limited to 24 hours, after which the timer pauses. The browser must provide persistent local storage and Web Locks for safe shared-tab control; unavailable recovery storage prevents starting rather than silently losing work. Web Locks coordinate tabs in the same browser profile, not independent devices.

The immutable pending request is saved before the cloud transaction. Uncertain results retain the exact ID, duration, target and mode across reload/retry. Starting another session cannot replace active/pending work. Discard is confirmed and unavailable while an uncertain save may already have committed. A known pre-commit unavailable target can fall back to Log time; expired receipt history can be reviewed and discarded without replaying old time. Account switches isolate records and late callbacks cannot clear another account's timer. Logging to a captured planner requires that planner to remain active in the app.

## Additive data

- Task `focusLoggedSeconds`: cumulative seconds attributed to that ordinary task. Archive preserves it; deleting a task removes its task-level total. Overall user time remains retained.
- User `focusData`: existing total, longest session and daily focus log, updated from authoritative values. The profile timezone determines the log's end-day; absent profiles use the browser timezone. A session crossing midnight is attributed to its log end-day, as with the previous timer.
- User `focusLogReceipts` and `focusLogReceiptFloor`: atomic retry receipts, bounded to 100 entries/64 KiB. A matching retry returns its original result without writing again. Evicted logs cannot be replayed. No collection migration or additional Firestore listener is needed.

The transaction reads both the user and owned planner before writing. Log and complete never completes an archived, missing, ambiguous, moved/reassigned or recurring target. Log time can retain such a session in overall user totals with no task attribution. Content and unrelated metadata stay intact. Existing task-count statistic saves write only their own daily task counts so they cannot overwrite a newer focus total. Completion achievement feedback uses the existing confirmed-completion path.

Verification covers clock/recovery, local storage failures, concurrent tabs, account changes, receipt eviction, exact retries, moved/deleted targets, metadata preservation, stats concurrency and both editor entry points. Browser QA exercises the actual app focus adapters/controller/store with mocked Firebase transport and controlled time; live verified-account writes remain outside that test.
