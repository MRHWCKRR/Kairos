# Durable Planner Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in order.

**Goal:** Preserve ordinary planner saves across closing/reopening without automatic replay or overwriting newer work.

**Architecture:** A local recovery module owns validated, scoped records. Existing planner persistence owns restoration, queueing, merge and explicit retry/discard; a focused feedback module renders its state.

**Tech Stack:** Vanilla JS, localStorage, existing Firestore transaction adapter, Node tests and packaged Chrome.

**Spec:** `docs/superpowers/specs/2026-11-05-durable-planner-recovery.md`

## Global Constraints

No automatic replay, dependencies or Firestore schema changes. Verified local retention precedes cloud writes. Preserve auth, App Check, billing, mobile blocking and current UI style. Use existing three-way conflict detection. Keep sources/ read-only.

## Review Focus

- Late completions after account or planner changes must not publish data or clear another record.
- New edits during a save or queue wait must remain recoverable.
- Invalid, unavailable or externally replaced recovery storage must not cause an overwrite or false saved claim.
- A missing planner or policy conflict must not be recreated or silently bypassed.
- Confirmed acknowledgement loss must not duplicate a create or resurrect a deleted entity.

## Task 1: Recovery controller

Create `planner-save-recovery.js`; extend `app-planner-persistence.js`. Interface: controller `state`, `save`, `load`, `retry`, `discard`, `clear`, `subscribe`, `assertReady`. Recovery exposes scoped read/stage/clear with expected-record checks.

- [ ] Write failing behavioral tests in `tests/planner-durable-recovery.test.mjs` for all Review Focus conditions, reopen, explicit retry, discard and storage errors.
- [ ] Implement retention, restore/merge, queue reconciliation and scope checks.
- [ ] Run targeted persistence/host/recovery tests; update memory storage adapters in existing fixtures.

## Task 2: Review UI and app wiring

Create `planner-save-feedback.js`, reuse `sync-status.css` for a compact feedback panel. Update app shell, asset manifest and account deletion cleanup. Global Review selects durable planner recovery; preserve live-only retry priority on storage errors.

- [ ] Add failing UI tests for summaries, keyboard controls, pending/busy/conflict and confirmed discard.
- [ ] Wire real controller state with cleanup and existing confirm dialog.
- [ ] Run UI, scope, app and asset checks.

## Task 3: Real document close/reopen journey and delivery

Extend packaged fixture storage/server/host and CDP driver to test real ordinary saves. Close and reopen a tab within the same isolated browser profile after a failed save, retain unrelated remote edits and verify explicit retry/conflict/discard. No production test hooks.

- [ ] Add fixture tests and packaged browser journey.
- [ ] Run full local suite, lint, source browser checks and hosted CI.
- [ ] Obtain one independent final review, fix important findings, publish a focused PR, merge after green checks and verify deployment.
