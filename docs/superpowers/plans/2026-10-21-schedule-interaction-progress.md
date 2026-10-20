# Schedule refinement recovery and validation

Approved scope: easier drag/resize targets, five-minute pointer snapping, full time/duration preview, short-lived Undo, and recurring edits scoped to the selected occurrence. Preserve the current design and shared guarded save infrastructure.

The interrupted checkout was unavailable. Restored all 428 upstream blobs at main `8ce5b81cdbd679f8625dbe309dad18d381bc0058` through the GitHub connector and verified their Git blob hashes before implementation. Work is isolated on `feat/schedule-interaction-refinement`.

- Model/store: guarded scheduling command, narrow inverse receipt, source receipt consumption, idempotent response-loss retry. Twelve model/transaction tests were observed failing before implementation and then passing.
- Feedback: confirmed save, ten-second Undo, exact-identity Retry, Dismiss, initialization snapshot recheck and account suppression. Controller regressions were observed failing before implementation and then passing.
- Pointer: grabbed offset, five-minute movement, duration-preserving day-end clamp, both-time preview, occurrence label, larger grip and midnight resize. Original lifecycle cases still pass. New pointer regressions were observed failing before implementation and then passing.
- Independent read-only review found two Important issues: backlog round trips preferred estimates, and slow confirmations exhausted Undo. Both received failing regressions and were fixed. Undo expires ten seconds after confirmation and accepts clicks initiated inside that window even if the save queue takes longer. No Critical findings or deferred code issues.
- Browser connection could not open the local QA server; rendered appearance, touch ergonomics and real authenticated production writes remain unverified. DOM/transaction fixtures do not establish those results.

Final verification and hosted CI results are recorded in the pull request. No production merge or deployment is implied by local checks.
