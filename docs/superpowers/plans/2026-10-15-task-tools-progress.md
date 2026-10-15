# SDD ledger - plan: docs/superpowers/plans/2026-10-15-task-tools-stage4.md

Stage 4 authorised 15 October 2026; Native workflow preserved. Existing isolated worktree reused on task-tools-stage4; base local dd9fce1 / remote befd3b011381cbe400019e004c22409deab21ec8 (unmerged Stage 3).

Pre-flight: Task 1 tool commands feed Task 2 field/Undo adapter; Task 2 dialog/registry feed Task 4 host; Task 3 uses Stage 3 batch Move and Task 4 selection callbacks. One persistence owner and menu owner; no interface conflicts.

Ruling: preserve authorised Native execution and tracked manual ledger in existing isolated worktree - remote skill helper executables are unavailable - cost if wrong: manual bookkeeping/plan revisions.

Ruling: Duplicate follows quick-create without creation Undo; metadata uses guarded Undo - existing create path has no creation inverse - cost if wrong: unwanted copies must be archived.

Ruling: use current creation/field/quota validation without adding task-count tier restrictions - repository search found AI quotas, but no task-count plan limit in creation - cost if wrong: a future task quota needs central enforcement.

Ruling: new bulk metadata tools target ordinary tasks and direct recurring parents to existing Details/Schedule - avoids ambiguous series/occurrence scope - cost if wrong: recurring metadata requires the existing editor.

Task 1: complete - three Duplicate tests observed RED then GREEN; tools/model/store suite 17/17. Fresh IDs, whitelist copy/reset/unscheduling, stale/recurring/collision/51-task rejection and same-receipt lost-response Retry covered.

Task 2: complete - fields/dialog/adapter/registry tests observed RED then GREEN; 51 focused tests pass. Six fields reuse validation and private Undo; dialog cancellation/validation and plan changes, Duplicate through existing dispatcher and exact target eligibility are covered.

Task 3: complete - anchored batch Move and selected-grip/count/cancel tests observed RED then GREEN. Group Move retains visible traversal order, uses original source orders, rejects selected anchors, and shares exact Retry/Undo; Escape/outside/sorted release cancels. Existing single-task drag tests remain green.

Task 4: implemented - section menu/registry/workspace callbacks and dialog navigation tests observed RED then GREEN. Context uses one popup, exact board/section IDs, Add/Select/Collapse and native editor/page behavior. A reproduced collapse-control aria-expanded regression was fixed RED/GREEN; only actual menu invokers now receive menu expanded state. New module assets, translations, themed dialog fields, cache versions and Stage 3 CI base are wired. Full non-runtime suite: 583 tests, 582 pass, 1 skip, 0 fail before final review.

Final self-review: inspected new model, dialogs, registry, section/menu lifecycle, host wiring, group Move and Undo guards against the Stage 3 baseline. No additional Important/Critical finding identified in this pass. This is implementer review, not independent review.

Ruling: retain a draft PR because the one fresh independent reviewer failed to start with a usage-limit error; no review verdict was returned - cost: independent review is still required before marking ready. No additional reviewer was started to bypass the limit.

Verification: final non-runtime rerun 583 tests / 582 pass / 1 skip / 0 fail; changed JavaScript syntax and whole-branch whitespace checks pass. Cloudflare build passed. Full local npm test stalled in the Workers runtime path and the owned run was interrupted; hosted CI remains the runtime gate.

Ruling: use hosted CI for full runtime verification rather than weakening runtime tests to accommodate this local environment - cost: full runtime confidence depends on CI.

Ruling: leave browser appearance and authenticated Firestore smoke checks explicitly unverified; no usable browser automation session was available - cost: live account behavior and rendered appearance still need a manual check. No merge or deployment is included.
