# SDD ledger - plan: docs/superpowers/plans/2026-10-16-checklist-experience-stage2.md

Native execution. Original Windows base e4e4788; original implementation commits 5cef663 and 30870fd became inaccessible when that environment disconnected before push. Stage 1 remains published in PR60, remote head 91ca3f0. Recovery uses a clean linked worktree based on that exact remote head. Original whole-branch reviewer never accessed source, so no review judgment was made.

Pre-flight: editor owns movement/focus; pointer controller holds transient state only. Pane remains the persistence owner. No shared-interface conflict.

Ruling: interpret continue as authorization to implement approved Stage 2; derive the detailed plan inline and retain Native execution rather than request a repeated design gate - the spec already fixes the interaction - cost if wrong: review may require a bounded implementation adjustment.

Ruling: stack Stage 2 against the unmerged Stage 1 feature branch and retain an isolated worktree/manual ledger - protects production and avoids republishing Stage 1 as new changes - cost if wrong: retarget/rebase after Stage 1 integration and manual bookkeeping.

Task 1: complete in Windows - baseline 59 tests; keyboard RED then GREEN, combined suite 61/61. Stable nodes/caret/focus, boundaries, IME/modifiers, disabled grips, 0/1/100 lists and isolated parent shortcuts covered.

Task 2: complete in Windows - pointer and pane cancellation RED then GREEN; reorder/editor/detail suite 48/48. Full non-runtime suite 629 tests: 628 pass, one skip. Both builds, preview dry-run and syntax/diff passed. Real Chrome 1366x768 and 3440x1440, light/dark, reduced motion, 0/1/100 lists, long titles, threshold/feedback/drop/cancellation, caret, exact Retry, expanded auto-scroll/stopping and native checkbox passed. Windows full npm test reproduced real-Workers startup failure and cleanup stall; owned test session interrupted. No authenticated Firestore or physical IME/clipboard permission smoke check.

Recovery: restored tests first from the conversation; observed RED against published Stage 1, then restored implementation and observed 48/48 GREEN. Recovered manifest/cache, labels, workflow and docs. Full verification and fresh review are being rerun on this Linux workspace.

Ruling: recover the inaccessible Windows-only work from the recorded patches onto published Stage 1, then rerun verification and independent review - avoids losing authorized work or pretending an unavailable commit was recovered - cost if wrong: patch reconstruction differences may require correction during verification/review.

Recovered verification: 48/48 focused tests passed. Full local run: 630 tests, 628 pass, one existing skip, one real Workers startup failure (`uv_interface_addresses returned Unknown system error 1`). Both builds and preview dry-run passed; syntax/diff checks passed. Linux browser installation returned a truncated download, so the earlier Windows browser pass was not repeated. PR61 is stacked on PR60. Initial hosted run 38836516626 passed full regression, runtime, both builds and bundle checks without weakening tests.

Final review: fresh independent reviewer reviewed 91ca3f0..69416d0 and independently passed all 48 focused tests. One Important finding: expanded drag outlives page navigation because ancestry loses the owning page and actual navigation does not invoke pane sync. No other Critical/Important/Minor findings. Grade Important accepted; no deferred minors.

Final: fixed expanded-navigation drag lifecycle - regression `expanded navigation cancels drag without relying on host sync` observed RED (preview survived) then GREEN. Pane now passes owning-page/account/planner activity to the editor/controller. Focused editor/detail/model/recurrence/host/selection/menu suite 110/110 after the fix. Full hosted regression/runtime/build checks on the final fix remain the readiness gate; outcomes are recorded on PR61.

Final: Ruling: retain live authenticated persistence and physical IME/clipboard permissions as disclosed smoke-check limits; keep Stage 3 layout outside this Stage 2 change - changed reorder contracts are covered by deterministic tests and the prior browser pass, with hosted runtime/build verification required - cost if wrong: an unexercised native integration may need a follow-up fix; layout remains a separate implementation stage.

Handoff: keep the worktree for PR iteration; mark ready only after final-head hosted CI passes. No merge/deployment in this task.
