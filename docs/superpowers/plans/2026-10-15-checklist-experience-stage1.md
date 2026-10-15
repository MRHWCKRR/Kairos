# Checklist Experience Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make checklist drafting fast and stable without changing how task edits are saved.

**Architecture:** Extract one checklist draft editor from task-detail-pane.js and reconcile its rows by step ID. The pane retains task identity, explicit Save, recurrence scope and exact pending-command recovery. Entry is flushed before a fresh command is built; focus is captured before save controls are disabled.

**Tech Stack:** Existing vanilla JavaScript/CSS, Node test runner, LinkeDOM and real Chrome; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-checklist-experience-design.md` (Stage 1 and Global constraints).

**Execution:** Continue the established Native method: one implementer, task-by-task RED/GREEN checks and one fresh whole-branch review. Planning is complete; implementation has not started.

## Global Constraints

- Vanilla JavaScript, HTML and CSS; no new dependencies.
- Reuse the existing planner schema and transaction/receipt path; no migration.
- Maximum 100 checklist steps; maximum 180 characters per step title.
- Explicit Save remains the persistence contract in Stages 1-3.
- Parent completion and recurring series/occurrence semantics remain unchanged.
- Preserve task selection, context menus, cursor hotspots and the desktop/mobile gate.
- Plain text uses safe DOM/text assignment or existing escaping.
- Version changed entry/loader/style/module URLs and declare new public modules in the Cloudflare manifest.

## Review Focus

1. IME Enter, Ctrl/Cmd+Enter and browser text shortcuts must never accidentally append twice or submit the wrong action (Task 2).
2. A delayed Save followed by account/planner/task changes must not restore old draft focus or content in a new workspace (Task 3).
3. Series templates versus dated occurrences must keep their distinct completion and read-only metadata rules (Tasks 1/3).
4. Task selection, native/custom context menus and checkbox label clicks must not swallow checklist editing or focus (Tasks 1/3).
5. Multiline clipboard content and composer text at 100-step / 180-character limits must fail atomically without losing text (Tasks 2/3).

## File and ownership map

| File | Responsibility |
| --- | --- |
| New `task-checklist-editor.js` | One checklist draft, row reconciliation, composer, keyboard/paste and logical focus |
| `task-detail-pane.js` | Mount/dispose editor, task draft reading, Save/dirty integration and focus/scroll restoration |
| `task-list.css` | Checklist controls, hints and stable row geometry only; expanded layout waits for Stage 3 |
| `i18n.js` | Additional checklist hints and validation/status copy through existing translation fallback |
| `cloudflare/public-assets.json` | Declare the new browser module |
| `page-loader.js`, `app.js`, `app-bootstrap.js` | Advance the existing cache version chain |
| New `tests/task-checklist-editor.test.mjs` | Editor behavior and identity/focus assertions |
| `tests/task-detail-pane.test.mjs` | Composer/save/draft/recurrence integration |
| Existing model, recurrence, host, selection and menu tests | Regression gate for preserved contracts |

## Task 1: extract a stable checklist draft editor

**Files:** Create `task-checklist-editor.js`, `tests/task-checklist-editor.test.mjs`; modify `task-detail-pane.js`, manifest/cache chain and checklist CSS if needed. Existing model functions are consumed, not reimplemented.

**Interfaces:**

- Consumes `validateChecklist(entries)` from `task-list-model.js` and the pane's `copy(key)` translation function. Items have `{id:string,title:string,completed:boolean}`.
- Produces `mountTaskChecklistEditor({root,items,canToggle=true,disabled=false,hint='',onChange,onStatus,copy,uuid,document=root.ownerDocument,window=document.defaultView})`.
- Editor methods: `read()` returns a cloned item array; `setDisabled(boolean)`; `hasPendingEntry()` returns whether trimmed composer text is nonempty; `flushEntry()` returns true on success/no pending text, false after reporting a validation error; `captureFocus()`; `restoreFocus(snapshot)`; `dispose()`.
- Focus snapshot is null or `{stepId?,control:'title'|'check'|'up'|'down'|'remove'|'new'|'add',start?,end?}`. It is transient UI state, never stored in a task or receipt.
- `onChange(items)` announces a draft change; the pane reads `editor.read()` as the sole checklist source. `onStatus(message,isError=false)` reports through the pane status area. `uuid()` is injected for deterministic tests, using the app's existing stable-ID generation in production.
- Host supplies an empty checklist section. Editor owns its header/progress/hint/list/composer. `canToggle=false` disables completion only; series template text/structure remains editable. `disabled=true` freezes all mutation controls.

- [ ] **Step 1: Add failing editor tests.** Assert initial values are escaped; changing item a keeps item b's exact DOM node, value, selection range and focus; toggling a updates progress without completing the parent; add/remove/up/down preserve IDs and logical focus; remove last item focuses composer; disabled/series checks enforce the interface; dispose removes handlers. Cover a checkbox-label click and context menu event inside a selected task/detail surface without changing task selection.

  Name the key test `preserves an unaffected checklist row and caret while a sibling changes`. Its assertions include `assert.equal(afterRowB, beforeRowB)`, `assert.equal(document.activeElement, titleB)`, `assert.equal(titleB.selectionStart, 2)` and `assert.equal(titleB.selectionEnd, 4)` after changing a. Use real DOM event dispatch; the fixture supplies browser selection/focus behavior that LinkeDOM lacks.
- [ ] **Step 2: Observe RED.** Run `node --test tests/task-checklist-editor.test.mjs`. Expected: missing editor export or missing reconciliation behavior, not a fixture error.
- [ ] **Step 3: Implement and wire the editor.** Replace checklistDraft/renderChecklist/addStep/list handlers in the pane with this owner. Keep the pane public interface and Save semantics. Use keyed DOM updates, real accessible controls and safe text/value assignment. Preserve current up/down functionality; drag gestures belong to Stage 2. Add the module to the public manifest and bump the loaded pane/module/cache chain from current versions without lowering another branch's versions.
- [ ] **Step 4: Observe GREEN.** Run `node --test tests/task-checklist-editor.test.mjs tests/task-detail-pane.test.mjs tests/task-checklist.test.mjs tests/task-checklist-recurrence.test.mjs tests/task-detail-host.test.mjs`. Expected: all pass, including the audited 38 existing baseline tests.
- [ ] **Step 5: Commit.** `refactor: isolate stable task checklist editing`.

## Task 2: make keyboard and multiline entry predictable

**Files:** Modify the editor and its tests; add concise localized hints to `i18n.js` and styles only when required.

**Interfaces:** Consumes Task 1's editor; `read()/hasPendingEntry()/flushEntry()` signatures stay unchanged. All entry paths share one validated append operation and generate each accepted ID once.

- [ ] **Step 1: Add failing entry tests.** Five plain-Enter additions yield five items and a focused empty composer. Empty Enter adds none; composing Enter adds none and does not prevent composition; Ctrl/Cmd+Enter bubbles to pane Save. Existing title Enter/Shift+Enter moves to next/previous without submitting. Native Tab, selection, Backspace and Delete remain intact. Multiline `Read\r\n\nWrite` creates two ordered items; pasting `Read\nWrite` at the end of composer `Prefix ` yields `Prefix Read` then `Write`; pasting over all of `Review` replaces it with `Read` then `Write`. A 181-character line or 101st total item yields zero inserted items and retains composer text; 100 items and 180-character titles succeed. Single-line paste stays native. Rejection for count/title validation consumes no ID.

  Name the limit test `rejects an entire multiline addition beyond checklist limits`: `assert.deepEqual(editor.read(), beforeItems)`, `assert.equal(composer.value, beforeText)`, `assert.equal(uuidCalls, 0)` after the rejected paste. Name the composition test `composition Enter never adds or submits`: `assert.equal(editor.read().length, 0)` and `assert.equal(submissions, 0)` after the composing key event.
- [ ] **Step 2: Observe RED.** Run `node --test tests/task-checklist-editor.test.mjs`. Expected: missing keyboard/paste/flush semantics with the new assertions failing.
- [ ] **Step 3: Implement the entry contract.** Honor isComposing/modifiers before intercepting Enter. Handle multiline paste only on the composer with text/plain. Splice pasted text into the composer's selected range before normalizing CRLF/LF/CR and discarding blank lines. Prevalidate candidate count/title lengths before allocating IDs, then validate the complete candidate checklist before mutating the draft. Use the shared limits/validator. Existing title inputs remain single-line. Implement pending-entry detection and idempotent flush behavior.
- [ ] **Step 4: Observe GREEN.** Run editor and detail suites from Task 1. Expected: all pass; repeated flush does not append a duplicate, escaped text remains literal and failed validation leaves the draft editable.
- [ ] **Step 5: Commit.** `feat: improve checklist keyboard and paste entry`.

## Task 3: preserve drafts, focus and scroll through Save

**Files:** Modify `task-detail-pane.js`, `tests/task-detail-pane.test.mjs`, editor tests if their focus contract needs additional coverage, and `docs/task-details.md`.

**Interfaces:** Consumes Task 1/2 editor methods. Keep `mountTaskDetailPane` return methods, `commit(command,expected,identity)`, task schema and pending session payload unchanged.

- [ ] **Step 1: Add failing integration tests.** Nonempty composer alone makes closing offer Save/Discard/Stay; Stay retains it, Discard drops it, Save flushes once. Ctrl/Cmd+Enter from composer saves that step once. Invalid composer at 100 existing items produces no commit/pending receipt and focuses the composer. A failed save followed by Retry reuses the same command, IDs and identity. Save from a checklist title restores its step ID, caret and pane scroll after controls were disabled; metadata focus continues to work. Expanding/shrinking retains the same editor/draft/composer. Deferred save resolution after identity or target changes never focuses the old task. Retain recurrence template/occurrence tests and add composer-save coverage for a dated occurrence with metadata disabled.

  Name the retry test `composer saves exactly once across an uncertain retry`: after rejecting the first commit and accepting Retry, assert `assert.deepEqual(calls[1], calls[0])` and `assert.equal(savedTask.checklist.filter(step => step.title === 'Review').length, 1)`. Name the close test `pending composer participates in Save Discard Stay`, asserting the existing choice dialog appears even when no other field changed.
- [ ] **Step 2: Observe RED.** Run `node --test tests/task-detail-pane.test.mjs tests/task-checklist-editor.test.mjs`. Expected: pending composer is currently omitted or focus/scroll restoration is missing.
- [ ] **Step 3: Integrate Save and focus.** dirty() includes pending composer text. Before creating a new pending command, flush entry and return false on validation failure; Retry never flushes or changes its original payload. Read checklist only from editor.read(). Capture logical focus and scrolling before busy disables controls, restore after confirmed canonical refresh under the same revision/identity/target, and dispose replaced editors. Existing requestClose/account/planner guards remain authoritative. Update docs for actual behavior.
- [ ] **Step 4: Observe GREEN and verify the whole flow.** Run Task 1's combined suites plus selection/menu suites, then `npm test`, `npm run build:cloudflare`, `npm run build` and Wrangler dry-run. Expected: all pass; if local Workers startup reproduces the known environment failure, report that exact limitation and require hosted full runtime CI without weakening tests. Run syntax and `git diff --check` checks. In real Chrome verify 0/1/100 steps, 1366x768 and 3440x1440, light/dark, IME, caret/scroll, modal focus, custom menus and reduced motion. Use injected delayed/failing commits for deterministic retry/account scenarios; disclose live account checks not performed.
- [ ] **Step 5: Commit.** `fix: preserve checklist drafts and focus through saves`.

## Completion and handoff

Perform one independent whole-branch review against the spec, including the five Review Focus conditions. Re-grade findings by user impact; reproduce and fix Important/Critical issues with RED/GREEN regressions, rerun the affected/full suite and record unresolved minor issues. Publish a reviewable Stage 1 PR; implementation does not authorize merging or deployment of this feature.

Self-review completed: all Stage 1 spec requirements map to Tasks 1-3; interfaces and ownership agree; limits, recurrence, pending composer, IME, menu/selection, delayed identity changes and scroll restoration each have named checks. Stages 2/3 are intentionally design-only in this plan.
