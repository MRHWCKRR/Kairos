# Packaged planner journeys implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Exercise task creation, inspector editing, settings saving and actual reload persistence using the packaged application modules in Chrome.

**Architecture:** Extend the existing local HTTP harness with an isolated, owner-scoped fixture store. Use the real task model, mutation session, task workspace, capture dialog, inspector and settings sync/form modules; replace only authenticated storage and the application bootstrap. Reload the document and read the store again before reporting success.

**Tech Stack:** Existing vanilla JavaScript, Node test runner, headless Chrome. No dependencies.

**Spec:** The approved next-step recommendation in the conversation: full packaged user journeys, starting with task and settings persistence.

## Global constraints

- No production asset, authentication, Firebase, billing or application UI changes.
- Fixture endpoints exist only in the local test server; no user data is accessed.
- Keep generated release URL and missing-module checks.
- Describe fixture persistence separately from live Firestore verification.

## Review focus

- Lost acknowledgement after a successful write: retry must preserve the operation and avoid duplication.
- Owner mismatch: a command must not write another fixture account.
- Reload: assertions must use newly loaded state and real rendered controls.
- Settings write failure: pending edits must survive reload and retry.
- Fixture requests must never enter the deployable asset list.

### Task 1: Isolated persistence boundary

Files: `scripts/packaged-fixture-store.mjs`, `scripts/packaged-smoke-server.mjs`, `tests/packaged-fixture-store.test.mjs`, `tests/packaged-smoke-server.test.mjs`.

Interface: `createPackagedFixtureStore({date})` exposes `read(ownerId)`, `commit(ownerId,{command,expected,identity})`, `saveSettings(ownerId,settings)`. Commands use the real task model; receipts are fixture-only.

- [ ] Write tests for persistence, detached read values, rejected owner mismatches, rejected changed retries and idempotent receipt replay; run RED.
- [ ] Implement the fixture boundary and bounded JSON endpoints; run tests GREEN.

### Task 2: Packaged Chrome mutation and reload journeys

Files: `tests/browser/packaged-smoke-entry.mjs`, `tests/browser/packaged-planner-host.mjs`, `scripts/run-packaged-smoke.mjs`.

Interface: packaged host mounts real controls and returns controller handles and current state. Harness serves its fixture module with the generated release version.

- [ ] Create a task via Quick Add, edit its title/notes through the inspector, simulate a committed write with lost acknowledgement, and retry through the same inspector.
- [ ] Change the existing reschedule-completed setting; save through real settings-sync, simulate a failed settings write, reload, restore and retry.
- [ ] Reload the document using session storage only for test phase and expected IDs; assert newly read task values, settings controls, one copy of the task, and unchanged other-owner data.
- [ ] Fail the runner if a successful normal journey did not request the shell twice. Preserve missing-module mode.
- [ ] Run local Node tests, checks, full regression suite and existing Chrome journeys. Run the HTTP Chrome journey in hosted CI if local networking remains blocked.

### Task 3: Review and delivery

- [ ] Update coverage documentation and CI step name.
- [ ] Publish an isolated draft PR using byte-verified blobs against current main; review the full change independently.
- [ ] Fix blocking findings with covering tests, verify hosted checks, and mark ready. Merge remains a separate user instruction.
