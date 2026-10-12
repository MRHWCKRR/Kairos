# Kairos Today Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user approved proceeding; execute natively in this session.

**Goal:** Deliver a privately reviewable working prototype of realistic next actions, changed-day trade-offs and interruption recovery.

**Architecture:** Isolated vanilla modules under `prototypes/today/`. A pure model owns scheduling and reversible state transitions; the browser module renders semantic HTML, sessions and local persistence. No imports from authentication or billing, and no production entry-point edits.

**Tech Stack:** HTML, CSS, native JavaScript modules, Node test runner; existing linkedom for DOM checks.

**Spec:** `docs/superpowers/specs/2026-10-12-today-prototype-design.md`

## Global Constraints

- No new product dependencies or framework migration.
- No production app, billing, authentication, schema or public manifest changes.
- Every task remains visible in Lists; no implicit task splitting or completion.
- Prototype uses labelled fictional days and browser-local data only.
- Preview/cancel do not mutate state; apply offers undo.
- Preserve fixed commitments, breaks and due-day constraints.

## Review Focus

- Fragmented free time is not equivalent to a continuous usable task slot.
- Hard deadlines must prevent deferring urgent work.
- A stale proposal must not overwrite newly edited work.
- Repeated completion/session clicks must not duplicate elapsed work or mutations.
- Corrupt/unavailable browser storage must not break initial render or lose the usable in-memory session.

### Task 1: Model and reversible planning

**Files:** Create `prototypes/today/model.js`; test `tests/today-prototype.test.mjs`.

**Interfaces:** `createScenario(kind)`, `getPlan(state, {day, now, end} = {})`, `recommend(state)`, `proposeChange(state, lostMinutes)`, `applyProposal(state, proposal)`, `updateTask(state, id, patch)`, `addTask(state, input)`, `setCompleted(state, id, done)`, `validateState(value)`. All mutations return new state with incremented revision; proposals carry a base revision.

- [x] Write and run failing behavioural tests for real capacity, priority/deadline ordering, fragmentation, verified tomorrow placement, proposal cancellation/purity, stale proposal rejection, deadline protection, repeated completion, session accounting, and validation of saved data.
- [x] Implement the pure model and run `node --test tests/today-prototype.test.mjs` until green.

### Task 2: Interactive experience

**Files:** Create `prototypes/today/index.html`, `today.css`, `today.js`; test `tests/today-prototype-ui.test.mjs`.

**Interfaces:** Browser module consumes Task 1 exports. `mountPrototype({document, storage, now})` owns rendering, persistence, native dialogs and one timer; returns a destroy function. UI tests use the real model with DOM storage/timer adapters.

- [x] Write behavioural DOM tests for creation, view switching, editing, completion/undo, empty state, storage failure and safe rendering of user text; watch them fail.
- [x] Implement three useful views, labelled sample scenarios, task editor, Make room review, task sessions/notes, reset and confirmation.
- [x] Run model and DOM tests; visually review the private deployment in a browser where supported.

### Task 3: Review and delivery

**Files:** Create `prototypes/today/README.md`; mark this plan's checklist with evidence.

- [x] Run the entire `npm test` regression suite and `npm run build:cloudflare`; inspect failures rather than hiding them.
- [x] Self-review all changed files, verify no production modifications, and fix material findings.
- [x] Publish a private Sites copy with the exact prototype files and verify deployment success. Open a draft GitHub PR with scope, checks and production-integration limits.
- [x] Deliver the private link and draft PR. Do not merge or deploy a replacement of the live Kairos app.

## Execution evidence and limits

- User revised the visual brief to a polished hybrid retaining original Kairos identity; specification and implementation updated.
- Prototype checks: 21 pass. All regression checks excluding the unavailable existing Workers runtime test: 299 pass, one existing skip. Cloudflare build passes.
- Independent review identified repeated-completion reversal and filter/day focus loss. Both reproduced RED and verified GREEN after fixes.
- Private deployment updated successfully. Native visual/keyboard QA remains blocked by the cloud browser sign-in wall; owner review required before production integration.
- Deferred minor: overdue prior-day sample deadlines. Today and future deadlines, including prevented deferral, are covered.
- Deliverable is an isolated prototype and draft PR; production app entry points and public manifest are unchanged.
