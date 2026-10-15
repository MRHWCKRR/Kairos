# SDD ledger — plan: docs/superpowers/plans/2026-10-15-task-action-menus-stage1.md

Spec approved; Native execution authorised on 15 October 2026. Feature worktree: Kairos-taskmenus, branch task-action-menus-stage1. Remote baseline ed1a6c35851707e69b359f2b3d64dbcfb56ca64c. Local baseline synced to merged instant feedback at 4b3bbb9.

Pre-flight: Tasks 1/2 share items/invoke and TaskContext; Tasks 1/3 share runTaskAction/getActionState and details focus options; Tasks 2/4 share menu mount/sync/dispose; Task 5 verifies all integrations. Interfaces agree.

Ruling: use this tracked progress ledger instead of unavailable environment-owned shell helpers — the skill package is remotely read and Windows does not expose its executable helper paths — cost if wrong: manual ledger needs careful maintenance.

Setup: native git worktree created successfully; existing installed dependencies copied after a workspace-local junction was denied. Browser/auth checks will be reported by evidence, never inferred from DOM-only tests.

Task 1: complete — registry tests observed RED (missing API) then GREEN: 6/6. Exact live task resolution, guarded callbacks and clipboard error identity covered. Dependency junction was denied; dependency copy is used instead.

Task 2: complete — component tests observed RED (missing API) then GREEN, combined registry/menu 13/13. Geometry, native contexts, events, focus, live labels, dismissal and disposal covered.

Task 3: complete — adapter tests RED/GREEN; account switch during dirty details and Schedule navigation reproduced RED then fixed GREEN. Combined registry/menu/interactions/pane/host: 64/64 pass. Ruling: Rename reuses existing pane title focus rather than adding a redundant focus option — both normal opening and Rename already focus the title — cost if wrong: later focus differentiation needs a small API extension.

Task 4: complete — renderer and lazy-menu tests RED/GREEN, 77 relevant tests pass. Real menu-to-command integration verifies one mutation and keyed invoker retention. Existing direct-button command tests now invoke the same real adapter because those standalone controls intentionally no longer exist. Ruling: menu sync accepts an optional view key to close on expanded-section navigation — needed to enforce spec dismissal without new global events — cost if wrong: one optional callback.

Task 5 verification: full npm test hit the existing Workers runtime startup failure and stalled in process cleanup; interrupted that owned test session. Full non-runtime suite completed: 529 tests, 528 pass, 1 skip, 0 fail. 77 targeted tests pass. Isolated bundled local Chrome smoke exited without DOM or screenshot output; no visual or verified-account claims. Hosted CI must validate the runtime.

Whole-branch review: one fresh reviewer found four Important issues, no Critical or Minor issues. All accepted and fixed in one pass: hidden retained section rows influenced menu movement; page/history navigation retained an actionable popup; keyboard focus did not reveal overflowed items; Details/Rename crossed planner identity during lazy preparation. Five regression tests reproduced RED before fixes; 47 focused tests then passed. The existing Statistics host fixture now supplies the new optional menu dependency.

Final local verification: full non-runtime suite 534 tests, 533 pass, 1 skip, 0 fail. Cloudflare production build and preview deployment dry run pass. JavaScript syntax and git diff checks pass. Runtime startup remains a local environment limitation; real-browser visual and verified-account checks remain unverified. Hosted CI is recorded in the PR. No deferred review findings. No merge or deployment authorised by this implementation plan.
