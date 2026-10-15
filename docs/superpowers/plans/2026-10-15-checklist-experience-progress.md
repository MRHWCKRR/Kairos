# SDD ledger - plan: docs/superpowers/plans/2026-10-15-checklist-experience-stage1.md

Stage 1 authorized 15 October 2026. Native execution, existing isolated linked worktree on checklist-experience-stage1; local base 75f717d (includes researched spec/plan). Tasks 1-3 implemented; final review and hosted checks pending.

Pre-flight: Task 1 owns editor draft/read/focus/disabled APIs consumed unchanged by Task 2 and Task 3. Task 2 flushEntry/hasPendingEntry are the Task 3 save/dirty contract. Pane remains the only persistence owner; no shared-interface conflict found.

Ruling: reuse the isolated worktree and tracked manual ledger because remote skill helper resources are unavailable in this environment - preserves established execution and reviewability - cost if wrong: manual bookkeeping or plan corrections.

Ruling: user authorized executing the published Stage 1 plan and publishing a reviewable feature branch; finish with a PR without merge/deploy - respects the plan's feature release boundary - cost if wrong: a separate release instruction is needed.

Task 1: complete - editor export/behavior tests observed RED before implementation; editor and existing detail/model/recurrence/host tests GREEN. Keyed row identity, caret, isolated draft, progress, logical move/remove focus, disabled/series controls, disposal and selection-safe editor surfaces covered. Existing 38-test baseline remains green. Pane now consumes one editor owner; public manifest/cache chain and accessible checkbox/button styling wired.

Task 2: complete - empty/IME Enter, title navigation and multiline paste tests observed RED then GREEN; combined editor/detail/model/recurrence/host suite 50/50. Five-step repeat entry, Ctrl/Cmd delegation, native text keys, selection-aware CRLF/CR/LF paste, atomic count/title rejection without ID allocation, boundaries and idempotent flush covered. Hint uses existing English fallback.

Task 3: complete - composer close/save/retry, composition-safe Save, validation, focus/caret/scroll, expansion identity, delayed owner/planner/disposal/page changes and occurrence composer tests observed RED then GREEN (58 focused tests). Site-menu beforeinput paste gap reproduced RED then GREEN; native and custom paste share atomic entry logic. Full non-runtime suite: 619 tests, 618 pass, one existing skip. Syntax and diff checks pass. Cloudflare build and preview dry-run pass. Real headless Chrome: 1366x768 and 3440x1440, light/dark, 0/1/100 steps, checkbox label, synthetic IME, native/custom paste, modal focus, caret/scroll, exact failed-save Retry and late identity change passed; wide run used reduced motion. Screenshots inspected. No authenticated Firestore or OS clipboard permission checks performed. Full npm test reproduces local real-Workers startup failure then cleanup stall; interrupted owned test process. Hosted full-runtime CI remains a readiness gate.
