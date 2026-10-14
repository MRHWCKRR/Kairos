# Task details and checklists - Stages 1 and 2

In Tasks, use **Task details** on a task row, or focus the row and press Enter/F2. Wide desktop windows show a side pane; smaller desktop windows use the expanded dialog. Expand opens the same draft in a larger dialog.

The editor saves title, notes, scheduled date/start/duration, deadline, priority, reminder lead, repeat rule, colour, preferred time and AI schedule lock. Ordinary start-time moves preserve duration; an explicit duration edit resizes the task. Existing fields not exposed here are retained. Repeat changes apply to the entire series; individual occurrence actions remain in Schedule. Move/completion/archive/permanent-delete actions continue through their existing controls or **More actions in Schedule**.

Save is explicit. Closing or selecting another task with a draft offers Save, Discard draft or Stay. A network failure retains the draft and pins Retry to its original operation identity; session storage retains pending saves for reconciliation after reload. Discarding an uncertain draft does not undo a save that may already have succeeded: inspect the task afterward. Validation failures remain editable. Account or planner changes invalidate the editor.

Commands use the existing Firestore transaction store and bounded action receipt fields; no new collection or bulk migration is introduced. Only deliberately changed fields are persisted. Schedule-dependent edits check the baseline start/duration as well. Same-field edits, moved/archived/deleted targets and invalid recurrence dates fail with a notice. New accounts initialise their normal planner before capturing an edit identity.

The host waits for queued saves, captures the current local state, applies the transactional command and rebases subsequent local changes against the server result. This avoids treating Schedule metadata normalisation as an unrelated edit conflict. User text and attributes are escaped; task modules load once when Tasks is prepared.

Checklists support adding, renaming, checking, removing and moving steps up/down in the same explicit-save draft. Each step has a stable ID, title and completion flag. The product limits are 100 steps per task and 180 characters per step title. Completing steps does not complete the parent task, create scheduled tasks, trigger reminders or consume task quota. Task rows show progress counts.

Recurring tasks expose an unchecked **Series template**. Choose a logical date with **Open occurrence** to track that occurrence's checklist; its other metadata remains editable in Schedule. Edited occurrences store a checklist snapshot alongside their existing exceptions, so moving an occurrence preserves its progress. Untouched occurrences inherit the current template unchecked; template edits retain historical snapshots. Converting a checked ordinary checklist into a recurring series displays an unchecked template, including conversions made in Schedule.

Independent changes to different step IDs merge. Conflicting changes to the same field or competing existing-step orders fail with a notice and preserve the draft. New steps retain their chosen insertion position when saved. Lost-response retries use the same operation and step identities. Durable receipts store a compact SHA-256 command fingerprint and accept existing Stage 1 receipts for retry compatibility. AI context includes checklist counts but omits step titles and historical checklist snapshots.

Section focus and section/task reordering are later stages. Known polish items: focus wrapping can include advanced inputs in collapsed details; a pending repeat-rule change restored after reload is retried correctly but the Repeat controls may still show the pre-save rule.

Verification covers model validation, unknown-field preservation, concurrent changes, uncertain response/retry, first-planner creation, legacy normalisation, canonical title baselines, drafts, escaping, account changes, module load-once behaviour, checklist limits/order, compact receipts and recurring snapshots. Real-browser layout/focus and verified-account Firestore smoke checks still require a preview session.
