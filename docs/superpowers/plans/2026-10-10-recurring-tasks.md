# Recurring Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class recurring tasks with virtual occurrences, per-occurrence completion/skip/edit exceptions, three edit scopes, fixed/flexible scheduling, Boards summaries, Schedule rendering, and AI-planning support without materializing every occurrence as a stored task.

**Architecture:** Keep one base task series in the existing nested Boards data and add a pure `recurrence-utils.js` engine that normalizes rules, generates stable virtual occurrences, applies exception records, computes summaries, and supports series splitting. Schedule and AI consume occurrence descriptors; Boards continues to render one base series row. Persistence remains through the existing plan document and Schedule bridge.

**Tech Stack:** Vanilla ES modules, HTML/CSS, Firebase/Firestore through the existing Kairos persistence bridge, Node `node:test` regression suite.

**Spec:** `docs/superpowers/specs/2026-10-10-recurring-tasks-design.md`

## Global Constraints

- Existing tasks without `recurrence.enabled === true` must behave exactly as they do today.
- Existing `scheduleEvents` remain a separate recurring fixed-event system; do not migrate them.
- Weekday numbering is JavaScript convention: Sunday `0` through Saturday `6`.
- Occurrence identity is stable as `<taskId>::<YYYY-MM-DD>` using the logical recurrence date, even when an exception moves the displayed date/time.
- Boards render one row per recurring series; Schedule renders concrete occurrences.
- Completing, skipping, or deleting one occurrence must not mark the base recurring task complete or terminate the series.
- Flexible missed occurrences remain overdue until completed, skipped, or deleted.
- `This and future` must split the series into a historical original and a new series with a new task ID and empty exception map.
- All recurrence date math lives in a pure module; DOM modules and Firebase code must not duplicate recurrence algorithms.
- Continue TDD: each task begins with a failing regression and ends with the relevant focused tests passing before commit.

## Review Focus

- Month-end rules such as the 31st in shorter months must have one deterministic behavior and never drift across subsequent months; Task 2 pins this.
- Yearly Feb 29 recurrence must have explicit leap-year behavior; Task 2 pins this.
- Moving one occurrence to another date must preserve its original occurrence ID/key and must not create a duplicate on the destination date; Task 3 pins this.
- Series splitting must preserve prior completed/skipped history while preventing future exceptions from leaking into the new series; Task 5 pins this.
- Overdue flexible occurrences and current occurrences from the same series must coexist and remain distinct AI candidates/blocks; Tasks 3, 6 and 8 pin this.

---

## File Structure

- **Create `recurrence-utils.js`** — pure recurrence rule normalization, validation, date generation, exception application, next-occurrence lookup, human-readable summaries, overdue determination, and split-boundary helpers.
- **Modify `schedule-utils.js`** — expose or reuse shared date/time helpers needed by recurrence without duplicating schedule math; keep one-off scheduling behavior unchanged.
- **Modify `schedule-workspace.js`** — render virtual recurring occurrences and recurring metadata in the backlog/timeline selection model.
- **Modify `schedule-inspector.js`** — edit recurring occurrences/series, complete/skip occurrences, and invoke scope selection.
- **Modify `schedule-task-create.js`** — add Repeat presets/custom builder and persist normalized recurrence on new tasks.
- **Create `schedule-recurrence-ui.js`** — shared recurrence form markup/state parsing/summary rendering and recurring edit-scope dialog so creation and editing use one UI contract.
- **Modify `schedule-ai.js`** — expand recurring series into concrete AI candidates/occupancy and validate proposals by occurrence ID.
- **Modify `build-transforms.js`** — include the new recurrence UI/module assets, AI context bridge support if needed, and bump Schedule cache version.
- **Modify `app.js`** — Boards/base-task surfaces show recurrence summary and route recurring-series edits through the shared recurrence UI without rendering occurrence duplicates.
- **Modify `ai-actions.js` only if recurrence fields are already passed through generic task creation/update paths during implementation** — preserve recurrence fields rather than stripping them; do not add a separate natural-language recurrence product unless required by existing flows.
- **Add `tests/recurrence-utils.test.mjs`** — pure rule/date/exception/splitting tests.
- **Add `tests/schedule-recurrence-source.test.mjs`** — Schedule/create/inspector/AI/Boards integration-source regressions.
- **Modify `tests/build-transforms.test.mjs` and `package.json`** — include recurrence tests and asset/cache assertions in the deployment gate.

---

### Task 1: Recurrence rule model and normalization

**Files:**
- Create: `recurrence-utils.js`
- Create: `tests/recurrence-utils.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing task objects and date strings in `YYYY-MM-DD` form.
- Produces: `normalizeRecurrence(taskOrRule, fallbackDate?)`, `validateRecurrence(rule)`, `occurrenceId(seriesId, occurrenceDate)`, and canonical recurrence rule objects used by all later tasks.

- [ ] **Step 1: Write failing tests for canonical recurrence normalization**

Cover exact normalized shapes for: daily, weekday preset as weekly `[1,2,3,4,5]`, every Wednesday, Mon/Wed/Fri every 2 weeks, monthly by date, monthly by weekday position, yearly, custom every N days/months/years, and end conditions `never`, `date`, `count`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/recurrence-utils.test.mjs`

Expected: FAIL because `recurrence-utils.js`/exports do not exist.

- [ ] **Step 3: Implement normalization and validation**

Create these exports in `recurrence-utils.js`:

```js
export function normalizeRecurrence(input={}, fallbackDate=null)
export function validateRecurrence(rule)
export function occurrenceId(seriesId, occurrenceDate)
```

Canonical rule fields must match the approved spec: `enabled`, `frequency`, `interval`, `weekdays`, `monthlyMode`, `monthDay`, `weekdayPosition`, `weekday`, `month`, `startDate`, `endType`, `endDate`, `count`, `mode`, `exceptions`.

- [ ] **Step 4: Add the test file to `test:schedule` and verify GREEN**

Run: `npm run test:schedule`

Expected: all existing Schedule tests plus recurrence normalization tests PASS.

- [ ] **Step 5: Commit**

```bash
git add recurrence-utils.js tests/recurrence-utils.test.mjs package.json
git commit -m "Add recurring task rule normalization"
```

---

### Task 2: Pure occurrence generation and calendar edge cases

**Files:**
- Modify: `recurrence-utils.js`
- Modify: `tests/recurrence-utils.test.mjs`

**Interfaces:**
- Consumes: canonical recurrence rule from Task 1 plus inclusive date range.
- Produces: `generateOccurrenceDates(rule, rangeStart, rangeEnd)` and `nextOccurrenceDate(rule, afterDate)`.

- [ ] **Step 1: Write failing occurrence-generation tests**

Assert exact date arrays for daily intervals, weekly selected weekdays, every-N-weeks anchoring from `startDate`, monthly same-date rules, monthly first/last weekday rules, yearly rules, `endDate`, and occurrence-count termination.

Also pin review-focus cases:
- day 31 monthly must **skip months that do not contain day 31** rather than clamp and drift;
- Feb 29 yearly must **occur only in leap years** rather than shift to Feb 28/Mar 1.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/recurrence-utils.test.mjs`

Expected: FAIL on missing generation functions.

- [ ] **Step 3: Implement range-bounded date generation**

Add:

```js
export function generateOccurrenceDates(rule, rangeStart, rangeEnd)
export function nextOccurrenceDate(rule, afterDate)
```

Generation must be deterministic from `startDate`, never materialize outside the requested range except minimal internal stepping, and respect both end-date and count limits.

- [ ] **Step 4: Run focused tests and full Schedule suite**

Run: `node --test tests/recurrence-utils.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add recurrence-utils.js tests/recurrence-utils.test.mjs
git commit -m "Generate recurring task occurrence dates"
```

---

### Task 3: Exception application, overdue state and occurrence descriptors

**Files:**
- Modify: `recurrence-utils.js`
- Modify: `tests/recurrence-utils.test.mjs`

**Interfaces:**
- Consumes: base task, generated logical dates, `recurrence.exceptions`, current date/time.
- Produces: `generateTaskOccurrences(task, rangeStart, rangeEnd, options?)` returning occurrence descriptors from the spec and `formatRecurrenceSummary(taskOrRule, options?)`.

- [ ] **Step 1: Write failing tests for occurrence descriptors and exceptions**

Assert:
- fixed occurrences inherit time/duration;
- flexible occurrences have null time until overridden;
- completed/skipped/deleted exceptions preserve stable `occurrenceId` and status;
- an override moving `2026-10-14` to `2026-10-15` still has ID `taskId::2026-10-14` and appears once;
- overridden metadata wins only for supplied fields;
- multiple overdue flexible occurrences coexist with the current occurrence;
- completed/skipped/deleted occurrences are not pending;
- recurrence summaries produce stable text for weekly, custom weekly, monthly-position, yearly, fixed/flexible and end conditions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/recurrence-utils.test.mjs`

Expected: FAIL on missing descriptor/summary functions.

- [ ] **Step 3: Implement descriptor generation and exception merge**

Add:

```js
export function generateTaskOccurrences(task, rangeStart, rangeEnd, options={})
export function formatRecurrenceSummary(taskOrRule, options={})
```

Each descriptor must include: `occurrenceId`, `seriesId`, `occurrenceDate`, `displayDate`, `startTime`, `endTime`, `durationMinutes`, `status`, `isOverdue`, `isException`, `mode`, and a task view with effective overridden fields.

- [ ] **Step 4: Run focused and full Schedule tests**

Run: `node --test tests/recurrence-utils.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add recurrence-utils.js tests/recurrence-utils.test.mjs
git commit -m "Apply recurring task occurrence exceptions"
```

---

### Task 4: Shared recurrence form UI for creation and base-series editing

**Files:**
- Create: `schedule-recurrence-ui.js`
- Modify: `schedule-task-create.js`
- Modify: `schedule-inspector.js`
- Create: `tests/schedule-recurrence-source.test.mjs`

**Interfaces:**
- Consumes: canonical rules from Tasks 1–3.
- Produces: `recurrenceFieldsMarkup(rule, context?)`, `bindRecurrenceFields(form, options?)`, `readRecurrenceFields(form, fallbackDate)`, and `showRecurrenceScopeDialog(options)`.

- [ ] **Step 1: Write failing source/integration regressions for the recurrence controls**

Assert creation and inspector flows expose:
- Repeat presets `Never`, `Daily`, `Every weekday`, `Weekly`, `Monthly`, `Yearly`, `Custom…`;
- interval/unit inputs;
- weekday toggles;
- monthly date/weekday-position modes;
- yearly month/day;
- fixed/flexible mode;
- end condition `Never`, `On date`, `After N occurrences`;
- a human-readable summary;
- shared parsing/binding functions rather than duplicate rule-building logic.

- [ ] **Step 2: Run the new source test and verify RED**

Run: `node --test tests/schedule-recurrence-source.test.mjs`

Expected: FAIL because shared recurrence UI does not exist.

- [ ] **Step 3: Implement the shared recurrence UI module**

Create:

```js
export function recurrenceFieldsMarkup(rule={}, context={})
export function bindRecurrenceFields(form, options={})
export function readRecurrenceFields(form, fallbackDate=null)
export function showRecurrenceScopeDialog({title, actionLabel, allowEntireSeries=true})
```

Keep presets compact; reveal custom controls only when recurrence is enabled/customized. The scope dialog resolves one of `occurrence`, `future`, `series`, or `cancel`.

- [ ] **Step 4: Integrate recurrence controls into `+ Task` and base-series task editing**

New tasks persist the canonical `recurrence` object. Existing tasks with no recurrence stay unchanged unless the user enables Repeat.

- [ ] **Step 5: Run recurrence source tests and full Schedule suite**

Run: `node --test tests/schedule-recurrence-source.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schedule-recurrence-ui.js schedule-task-create.js schedule-inspector.js tests/schedule-recurrence-source.test.mjs
git commit -m "Add recurring task form controls"
```

---

### Task 5: Recurring occurrence mutations and edit scopes

**Files:**
- Modify: `recurrence-utils.js`
- Modify: `schedule-inspector.js`
- Modify: `tests/recurrence-utils.test.mjs`
- Modify: `tests/schedule-recurrence-source.test.mjs`

**Interfaces:**
- Consumes: selected `seriesId`, `occurrenceDate`, proposed field/rule changes, existing nested board/section/task location.
- Produces: pure mutation helpers for occurrence exceptions and series splitting, then Schedule inspector actions that persist through `bridge.persistPlan()` with rollback.

- [ ] **Step 1: Write failing pure tests for mutation helpers**

Define and test:

```js
export function setOccurrenceStatus(task, occurrenceDate, status, timestamp)
export function applyOccurrenceOverride(task, occurrenceDate, changes)
export function splitRecurringSeries(task, occurrenceDate, edits, newTaskId)
```

Assert:
- complete/skip/delete touch only one exception;
- base `completed` remains false/unchanged;
- occurrence override stores only changed values;
- split ends original immediately before the split occurrence;
- historical exceptions before split remain on original;
- new series has a new ID/start date, edited fields/rule, and empty exceptions;
- future exceptions do not leak to the new series.

- [ ] **Step 2: Run recurrence tests and verify RED**

Run: `node --test tests/recurrence-utils.test.mjs`

Expected: FAIL on missing mutation helpers.

- [ ] **Step 3: Implement pure mutation helpers**

Keep Firebase/DOM out of these helpers. `splitRecurringSeries` returns `{originalTask, newTask}` clones suitable for insertion/replacement by the caller.

- [ ] **Step 4: Write failing inspector source tests for occurrence actions/scopes**

Assert recurring occurrence inspector exposes `Complete`, `Skip occurrence`, edit, delete and the three scopes `This occurrence`, `This and future`, `Entire series`; completing/skipping bypasses the scope dialog; save/delete uses it.

- [ ] **Step 5: Implement inspector mutation/persistence flow**

Use the selected occurrence identity and pure helpers. For `future`, insert the new series next to the original task in the same section. For any persist failure, restore the original task/section snapshots and re-render.

- [ ] **Step 6: Run recurrence and Schedule suites**

Run: `node --test tests/recurrence-utils.test.mjs tests/schedule-recurrence-source.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add recurrence-utils.js schedule-inspector.js tests/recurrence-utils.test.mjs tests/schedule-recurrence-source.test.mjs
git commit -m "Add recurring occurrence edit scopes"
```

---

### Task 6: Schedule rendering and selection of virtual occurrences

**Files:**
- Modify: `schedule-workspace.js`
- Modify: `schedule-inspector.js`
- Modify: `schedule-interactions.js`
- Modify: `schedule-workspace.css`
- Modify: `tests/schedule-recurrence-source.test.mjs`

**Interfaces:**
- Consumes: `generateTaskOccurrences()` and stable occurrence descriptors from Task 3.
- Produces: Schedule blocks/backlog items selectable by `{type:'occurrence', seriesId, occurrenceId, occurrenceDate}` while preserving ordinary one-off task selection.

- [ ] **Step 1: Write failing source regressions for Schedule occurrence rendering**

Assert:
- recurring base tasks are not rendered as duplicate ordinary task blocks;
- generated occurrences are range-bounded to visible Schedule dates plus the overdue lookback used by the UI;
- blocks expose series/occurrence identity and a restrained `↻` indicator;
- moved occurrence overrides render on `displayDate` while preserving original occurrence identity;
- two overdue/current flexible occurrences from one series can both render;
- completed/skipped/deleted occurrences follow the approved visibility semantics and are not treated as pending work.

- [ ] **Step 2: Run source tests and verify RED**

Run: `node --test tests/schedule-recurrence-source.test.mjs`

Expected: FAIL on missing occurrence rendering/selection.

- [ ] **Step 3: Integrate virtual occurrences into Schedule range rendering**

Keep ordinary `taskSegmentsForDate` behavior for non-recurring tasks. Add a recurrence path that expands recurring series for the required date range and feeds occurrence descriptors through existing layout/conflict geometry.

- [ ] **Step 4: Make drag/reschedule occurrence-aware**

Dragging/resizing a recurring occurrence must create/update an occurrence override rather than mutate the base series unless the user explicitly chooses a broader edit scope through the inspector. Do not change global series time by dragging one block.

- [ ] **Step 5: Add visual/accessibility treatment**

Include `↻` and aria labels that identify the block as recurring while keeping task color/conflict/completed/overdue states accessible without relying on color alone.

- [ ] **Step 6: Run focused and full Schedule tests**

Run: `node --test tests/schedule-recurrence-source.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add schedule-workspace.js schedule-inspector.js schedule-interactions.js schedule-workspace.css tests/schedule-recurrence-source.test.mjs
git commit -m "Render recurring task occurrences in Schedule"
```

---

### Task 7: Boards series summaries without occurrence duplication

**Files:**
- Modify: `app.js`
- Modify: `tests/schedule-recurrence-source.test.mjs`

**Interfaces:**
- Consumes: base recurring tasks plus `formatRecurrenceSummary()` and `nextOccurrenceDate()`.
- Produces: one Boards row per series with recurrence summary/next-occurrence metadata; existing one-off task rows unchanged.

- [ ] **Step 1: Write failing source regressions for Boards behavior**

Assert Boards/task rendering imports or calls recurrence summary/next-occurrence helpers, does not expand a series into occurrence rows, and routes editing to the base task series configuration.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/schedule-recurrence-source.test.mjs`

Expected: FAIL because Boards does not yet surface recurrence.

- [ ] **Step 3: Add compact recurrence metadata to Boards task rows/editor**

Examples must match the spec style such as `Repeats every Wednesday · Next: Oct 14` and `Every 2 weeks on Mon/Wed · Flexible · Next: Oct 12`. Do not add a separate recurring-tasks page.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/schedule-recurrence-source.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/schedule-recurrence-source.test.mjs
git commit -m "Show recurring task series in Boards"
```

---

### Task 8: AI planning over concrete recurring occurrences

**Files:**
- Modify: `schedule-ai.js`
- Modify: `build-transforms.js`
- Modify: `schedule-utils.js` only if validator interfaces need occurrence-aware IDs
- Modify: `tests/schedule-planning.test.mjs`
- Modify: `tests/schedule-ai-review-source.test.mjs`
- Modify: `tests/schedule-recurrence-source.test.mjs`

**Interfaces:**
- Consumes: `generateTaskOccurrences()` and occurrence IDs from Task 3.
- Produces: AI planning context and proposal validation keyed by concrete occurrence identity while preserving the existing one-off task proposal contract.

- [ ] **Step 1: Write failing planning tests for recurring candidates and occupancy**

Assert:
- fixed recurring occurrences are deterministic occupied/locked commitments;
- flexible pending occurrences inside the planning horizon become candidates;
- overdue and current flexible occurrences from the same series are distinct candidates;
- completed/skipped/deleted occurrences are excluded;
- AI cannot emit two proposals for one occurrence;
- two occurrences of one series remain distinct because validation keys by occurrence ID, not just base task ID;
- flexible occurrence proposals remain on their allowed logical date unless the request explicitly targets a date change.

- [ ] **Step 2: Run planning tests and verify RED**

Run: `node --test tests/schedule-planning.test.mjs tests/schedule-recurrence-source.test.mjs`

Expected: FAIL on missing occurrence-aware context/validation.

- [ ] **Step 3: Expand recurring series in `buildContext()`**

AI candidate shape must include `taskId`, `seriesId`, `occurrenceId`, `occurrenceDate`, `title`, `plannedMinutes`, `priority`, `schedulingPreference`, `isOverdue`, and `mode:'flexible'` for recurring flexible candidates. Fixed occurrences go into occupied commitments.

- [ ] **Step 4: Make proposal validation occurrence-aware**

Preserve current deterministic duration/current-time/conflict protections. Ordinary tasks continue to key by task ID; recurring proposals key by occurrence ID and apply to the occurrence exception rather than mutating the base series by default.

- [ ] **Step 5: Update planner system prompt/bridge contract**

Tell the planner occurrence IDs are authoritative, fixed recurring occurrences are occupied, flexible occurrences are constrained to their occurrence date, and completed/skipped/deleted occurrences are absent.

- [ ] **Step 6: Run AI planning and full Schedule suites**

Run: `node --test tests/schedule-planning.test.mjs tests/schedule-ai-review-source.test.mjs tests/schedule-recurrence-source.test.mjs && npm run test:schedule`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add schedule-ai.js build-transforms.js schedule-utils.js tests/schedule-planning.test.mjs tests/schedule-ai-review-source.test.mjs tests/schedule-recurrence-source.test.mjs
git commit -m "Plan recurring task occurrences with AI"
```

---

### Task 9: Asset integration, cache bump and deployment gate

**Files:**
- Modify: `build-transforms.js`
- Modify: `tests/build-transforms.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: all modules created/modified in Tasks 1–8.
- Produces: production build that loads recurrence modules exactly once and runs the recurrence regressions in the Vercel build gate.

- [ ] **Step 1: Write/update failing build-transform assertions**

Assert `schedule-recurrence-ui.js` is injected once, any directly loaded recurrence module has the same new Schedule asset version, stale Schedule versions are normalized, and both recurrence test files are present in `test:schedule`.

- [ ] **Step 2: Run build-transform tests and verify RED**

Run: `node --test tests/build-transforms.test.mjs`

Expected: FAIL until the asset list/cache version is updated.

- [ ] **Step 3: Add assets and bump the Schedule cache version once**

Increment the current Schedule asset version from the version present at implementation time. Do not hard-code the plan's historical version; normalize all Schedule CSS/JS assets to the single new version.

- [ ] **Step 4: Run the complete gated build locally if network/runtime permits**

Run: `npm run build`

Expected: all Schedule/recurrence tests PASS, then `node build.js` completes successfully. If local execution is blocked by environment/network, record that fact and rely on Vercel only after its exact commit status is GREEN.

- [ ] **Step 5: Commit**

```bash
git add build-transforms.js tests/build-transforms.test.mjs package.json
git commit -m "Ship recurring tasks in Schedule build"
```

- [ ] **Step 6: Verify the exact final commit deployment**

Check the combined status for the final SHA. Expected: Vercel `success`. Do not claim live browser/manual interaction testing unless it was actually performed.

---

## Self-Review Result

- **Spec coverage:** The plan covers the recurrence rule set, fixed/flexible modes, virtual occurrence identity/generation, exception/history records, completion/skip/delete semantics, overdue behavior, all three edit scopes, series splitting, Boards one-row behavior, Schedule occurrence rendering, creation/edit UI, AI planning, conflict participation, backward compatibility, and build rollout. Dedicated analytics/history UI remains intentionally out of scope per spec.
- **Type consistency:** All later tasks consume the canonical rule and occurrence descriptor produced by `recurrence-utils.js`; occurrence identity remains based on original logical date throughout UI, Schedule and AI.
- **Review-focus coverage:** Month-end, leap-day, moved occurrence identity, split-history isolation, and concurrent overdue/current occurrences each have explicit tests in their owning tasks.
- **Scope:** Existing `scheduleEvents` remain separate. No Firestore schema migration or bulk materialization of occurrences is introduced.
