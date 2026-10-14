# Task details — Stage 1

In Tasks, use **Task details** on a task row, or focus the row and press Enter/F2. Wide desktop windows show a side pane; smaller desktop windows use the expanded dialog. Expand opens the same draft in a larger dialog.

The editor saves title, notes, scheduled date/start/duration, deadline, priority, reminder lead, repeat rule, colour, preferred time and AI schedule lock. Ordinary start-time moves preserve duration; an explicit duration edit resizes the task. Existing fields not exposed here are retained. Repeat changes apply to the entire series; individual occurrence actions remain in Schedule. Move/completion/archive/permanent-delete actions continue through their existing controls or **More actions in Schedule**.

Save is explicit. Closing or selecting another task with a draft offers Save, Discard draft or Stay. A network failure retains the draft and pins Retry to its original operation identity; session storage retains pending saves for reconciliation after reload. Discarding an uncertain draft does not undo a save that may already have succeeded: inspect the task afterward. Validation failures remain editable. Account or planner changes invalidate the editor.

Commands use the existing Firestore transaction store and bounded action receipt fields; no new collection or bulk migration is introduced. Only deliberately changed fields are persisted. Schedule-dependent edits check the baseline start/duration as well. Same-field edits, moved/archived/deleted targets and invalid recurrence dates fail with a notice. New accounts initialise their normal planner before capturing an edit identity.

The host waits for queued saves, captures the current local state, applies the transactional command and rebases subsequent local changes against the server result. This avoids treating Schedule metadata normalisation as an unrelated edit conflict. User text and attributes are escaped; task modules load once when Tasks is prepared.

Checklist items, section focus and reordering are later stages. Known polish items: focus wrapping can include advanced inputs in collapsed details; a pending repeat-rule change restored after reload is retried correctly but the Repeat controls may still show the pre-save rule.

Verification covers model validation, unknown-field preservation, concurrent changes, uncertain response/retry, first-planner creation, legacy normalisation, canonical title baselines, drafts, escaping, account changes and module load-once behaviour. Real-browser layout/focus and verified-account Firestore smoke checks still require a preview session.
