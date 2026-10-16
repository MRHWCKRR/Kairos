# SDD ledger - plan: docs/superpowers/plans/2026-10-16-checklist-experience-stage3.md

Stage 3 explicitly authorized. Base 2bac718 (Stage 2 PR61, hosted CI green); Stage 1 PR60 and Stage 2 remain unmerged. Existing isolated linked worktree reused on codex/checklist-experience-stage3. Baseline 70 focused tests pass.

Pre-flight: editor owns visibility/draft and exposes view snapshots; pane consumes those snapshots without a second state owner. Pane remains persistence owner. CSS changes only presentation of the shared form. No interface conflict.

Ruling: implement the approved Stage 3 spec with a derived test-first Native plan and stacked PR against Stage 2, retaining the isolated worktree/manual ledger - user explicitly authorized the next stage - cost if wrong: review adjustments, retargeting/rebase after dependency integration and manual bookkeeping.

Ruling: keyboard/arrow reordering uses visible neighbours but applies moves to the full underlying checklist, and visibility resets on opening another task - keeps filtered editing predictable without dropping completed data - cost if wrong: these presentation defaults may need a bounded follow-up adjustment.

Task 1: complete - three visibility/editor tests and hidden drag-source regression observed RED then GREEN; combined editor/reorder/detail/model/recurrence/host suite 74/74. Presentation-only toggling, total counts/IDs, stable rows, disabled/disposed controls, hidden completion focus fallback, visible-neighbour keyboard/arrow movement, view snapshots and hidden pointer targets covered. Author CSS explicitly hides hidden checklist rows.

Task 2: complete - five layout/summary/view/occurrence/pending tests observed RED then GREEN, plus a Retry group/focus regression RED then GREEN. Editor/detail/model/recurrence/host/selection/menu suite 120/120. One form now follows title/context/notes/checklist/properties/footer order, with three occurrence metadata fieldsets, safe live collapsed summaries and view/group restoration. Presentation changed during an uncertain Save remains current on Retry. Scope date input does not mark an edit. Explicit Save/Retry and identity guards retained.

CSS uses the specified shared clamp(400px,32vw,520px) pane/reservation, centered min(1080px,viewport minus 64px) dialog and 280px properties column only at >=900px available width. Sticky state/action footer, 36px controls, both native control color schemes and reduced motion preserved. Browser centering assertion observed RED before adding explicit modal auto margins against the app-wide margin reset, then GREEN.

Verification: real headless Chrome 131/Playwright passed laptop 1366x768, ultrawide 3440x1440 and 960x768, real app dark/light themes, 0/1/100 steps, dimensions/reservations, breakpoint, no horizontal overflow, sticky footer at both scroll extremes, native controls, stable hidden-row DOM/progress, filtered caret, Save view/groups/focus, modal Tab/Shift+Tab, exact Retry, occurrence read-only controls, trusted grip/Escape and reduced motion. Screenshots inspected. Clipboard uses injected text; authenticated Firestore and physical IME/OS clipboard permissions remain unverified.

Full local suite: 641 tests, 639 pass, one existing skip, one environment failure in real Workers startup (`uv_interface_addresses`). Both builds passed, with legacy build in a disposable copy; preview dry-run and syntax/diff checks passed. New public modules were not needed; changed module/style/loader cache chain bumped. Existing PR workflow filter includes the stacked Stage 2 base.

Final whole-branch review and hosted full runtime/build CI pending. No merge/deploy authorized in this task.
