# SDD ledger — plan: docs/superpowers/plans/2026-10-17-deadline-planning.md

Base: 8b84a1b, branch codex/deadline-planning. Spec and plan reviewed for interface consistency; summaries and proposals share one pure model, UI consumes those signatures, command dispatch reuses the existing transactional store.

Ruling: use the already established feature-branch checkout and native Node/PowerShell verification rather than Bash workspaces — Git Bash scripts fail with NtCreateDirectoryObject access denial in this environment, and the user authorized execution in this session — cost: task bookkeeping is recorded manually here rather than by skill scripts.

Ruling: weekly completion means current completion state of work scheduled in the selected week — ordinary tasks have no reliable completion timestamp — cost: this is not a historical completion-date report, stated explicitly in the UI.

Task 1: complete (f196bcb). Five deadline/date/recurrence summary tests observed RED then GREEN. Existing dueDate and date retained. Full-suite base was the previously verified 755-test onboarding release.

Task 2: in progress. Ruling: split pure placement search and command validation into planning-slots.js and planning-commands.js beside planning-model.js — each has one responsibility and avoids a large model file — cost: two additional lazy public modules and import edges to verify.

Task 2: complete (911294f). 21 planning tests observed RED→GREEN; combined planning/task-list/detail/recurrence regression 194/194 passed. Transaction fixture confirms a lost successful response retries one receipt without duplicated sessions. No optimistic planner mutation is introduced.

Task 3: in progress. Four-view Schedule dialog and account/planner-scoped pending preview.

Task 3: complete. Planning dialog integrated through lazy Schedule modules and the existing command/inspector bridge. 31 planning tests pass, including all whole-branch review regressions. Chrome passed deadline editor, reviewed sessions, lost-response exact Retry, conflicts, weekly carry-over, no capacity, invalid-input view recovery, native dialog/focus, account switching, blocked-storage Close/reopen, light/dark and three desktop widths. Cloud persistence was simulated; no live data was written.

Final: fixed recurring overnight undercount — overnight recurring work blocks following day RED→GREEN; effective wrapping start/end duration now used unless the occurrence has an explicit duration override.

Final: fixed blocked-storage Retry loss — uncertain save remains retryable after Close/reopen RED→GREEN; pending operations retained in memory per owner/planner as well as session storage.

Final: fixed invalid-range view errors — invalid range input stays recoverable across views RED→GREEN; only validated ranges replace shared filters.

Task 4: in progress. Final local non-runtime suite: 785 tests, 784 pass, one existing billing skip. Full-suite Workers runtime stalls in this Windows sandbox (also with a test timeout), while the host node_repl service is unavailable. Stalled runtime held the original dist directory; both build paths are being verified in a disposable ignored copy. Hosted Linux CI will verify the full runtime suite.

Final: Ruling: use hosted Linux CI for Workers runtime verification and a disposable copy for both builds — local runtime stalls and locks dist, while the host runtime tool transport is closed — cost: runtime confidence depends on the final hosted check; no claim of a passing local runtime test.

Final: Ruling: authenticated Firebase timing remains a disclosed smoke-check limit — transaction/lost-response fixtures and actual Chrome interactions cover changed contracts, but no verified test-account credentials were supplied — cost: deployed permissions/integration still need a real-account smoke check before release.

Task 4: both Cloudflare and legacy builds passed in the disposable copy. Final Chrome checks passed, including the two UI review regressions, with zero page errors. Syntax and diff checks passed. No deferred review findings. Git credential helpers also cannot start under the sandbox; use the authenticated GitHub connector to publish the exact committed tree and verify its tree SHA, preserving local commits — cost: remote publication may be represented by one commit instead of the local staged history.

Task 4: complete. PR #73 published with an exact matching source tree. Hosted Linux run 38995571466 passed full regression, Cloudflare build, Workers runtime and bundle, and legacy build. All review findings fixed; no deferred minors. Both local builds and final Chrome checks passed. No merge/deploy performed.
