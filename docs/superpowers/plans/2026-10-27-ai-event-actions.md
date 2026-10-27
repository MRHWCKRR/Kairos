# AI Native Event Actions Implementation Plan

> For agentic workers: execute inline with superpowers:executing-plans and one final independent reviewer.

Goal: AI event parity through existing native event commands and reviewed saves.
Architecture: ai-event-actions.js adapts action args to native event preview/apply; ai-actions.js orchestrates authenticated preview/transaction; shared schema and chat UI retain/render approval; plan-store/ai-undo-view provide native receipt Undo.
Tech Stack: vanilla JS, existing Firebase receipts/transactions and OpenRouter relay, Node/linkedom/Chrome.
Spec: docs/superpowers/specs/2026-10-27-ai-event-actions-design.md

## Global constraints
No new provider/secrets/dependencies/billing or automatic writes. Imported events read-only. Date XOR weekday. Explicit time bounds for new timed events; start-only moves preserve duration. Native quotas, DST and finite weekly conflict review remain authoritative. Every mutation requires review.

## Review focus
- Retained/reloaded preview must preserve creation ID, pinned action and operation identity.
- A changed native event/timezone/calendar/task cannot apply stale approval or Undo.
- Ambiguous title, wrong IDs, imported ownership and all-day transitions fail without mutation.
- Native AI Undo cannot be repeated through generic planner Undo or a reused identity.
- Existing task/planning actions and mixed batches keep confirmations, result memory and truthful success text.

### Task 1: Schema and pure event adapter
Files: ai-action-schema.js, ai-event-actions.js, tests/ai-event-actions.test.mjs, ai-chat-response.test.mjs.
Interfaces: isAiEventAction(type); previewAiEventChange(state,action,timezone,{now,eventIdFactory}) -> {action,approval,summary}; applyAiEventChange(state,action,approval,{now}) -> {next,result}; aiEventPreviewMarkup(summary) -> escaped HTML.
- [ ] RED schema/parser/mapping tests dated/weekly/all-day/overnight/update duration/ownership/ambiguous IDs.
- [ ] Implement using native-event-commands and plannerChangeRows, bind action and native payload. GREEN and commit.

### Task 2: Authenticated execution, durable review and Undo
Files: ai-actions.js, ai-workspace.js, plan-store.js, ai-undo-view.js, ai-context.js if needed; planner fixture. Tests: ai-event-workflows.test.mjs and chat confirmation/reload tests.
- [ ] RED tests no approval/no mutation, stale approval, fixed ID exact retries, timezone changes, native one-use Undo and no generic inverse.
- [ ] Replace legacy event mutation branch with adapter; verify profile timezone transactionally, return event result and native Undo. Retain event preview in pending batch and render conflict evidence.
- [ ] Native-aware Undo AI load/apply/display; keep generic Undo for other actions. GREEN and commit.

### Task 3: Browser and release
Files: browser AI event journey, docs/ai-event-actions.md, public assets and versioned import graph.
- [ ] Real Chrome create/review/retry/date move/overnight/all-day/weekly/delete/native Undo and imported guard through production adapter/review UI; inspect dark/light.
- [ ] Run full regression, production build, Chrome and module graph; independent whole-branch review, fix substantive findings RED/GREEN.
- [ ] Publish PR and await green CI. Preserve existing provider/billing, hold merge/deploy.
