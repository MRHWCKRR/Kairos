# Durable recovery for ordinary planner saves

The approved change closes the remaining tab-close recovery gap for ordinary board, section, task and schedule edits. Existing task commands and settings retain their separate recovery owners.

Use a focused local recovery module and extend the existing ordinary persistence controller. Store a versioned record scoped to the authenticated owner and planner, containing the merge baseline, submitted planner state and save options. Retain it synchronously before a queued write; require verified retention before sending a cloud write. Storage failures keep a volatile draft and the keep-open warning, with an explicit retry after storage becomes available. No dependencies or Firestore schema changes.

Restore records during planner loading, merge unrelated confirmed remote changes, and retain conflicting edits for review. A confirmed remote state already containing all submitted changes clears recovery without another write. Never replay automatically. Never apply a record to another account or planner. Missing/replaced planners require review and must not be recreated by a retry. Account deletion removes the owner's recovery record.

Preserve any uncertain in-flight attempt separately from newer edits: a later deletion or revert must not disappear when the earlier write committed without an acknowledgement. Confirm restore/discard decisions with a server-only Firestore query; offline cached query results are not confirmation.

Review uses a small existing-style feedback panel with pending change summaries, Retry and confirmed Discard. Discard loads the last confirmed planner; a failed discard read leaves recovery intact. No force overwrite. LocalStorage records may contain planner data just as existing task/settings recovery does. Do not show private content in the global status label.

Approach considered: migrating every older UI handler to task commands is broader and changes unrelated behavior; using Firestore automatic offline writes obscures explicit conflict handling. Reuse the current three-way merge and queue, adding durable retention and explicit review.

Verification covers failure/reopen/retry, acknowledgement loss, edits during an in-flight save, queued work, quota/invalid/replaced storage, policy options, scope changes, missing planners, deletion cleanup and conflicts. Packaged Chrome must close the first document, reopen the same origin/profile, restore pending edits and explicitly retry or discard. This does not add an offline application shell or claim signed-in Firebase validation.
