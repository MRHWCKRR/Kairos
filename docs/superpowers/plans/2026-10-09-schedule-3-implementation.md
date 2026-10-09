# Kairos Schedule 3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Schedule 2.0 with the approved desktop-first Kairos Schedule 3.0 workspace: 3-Day by default, left unscheduled queue, central time-blocking calendar, contextual inspector, pointer-based direct manipulation, rich task metadata, conflict handling, and user-approved AI schedule proposals.

**Architecture:** Keep Firestore ownership and the canonical `boardsData` / `scheduleData` arrays in `app.js`, but move Schedule rendering and interaction state into a dedicated `schedule-workspace.js` module. Put deterministic date/time/overlap math in `schedule-utils.js` so it can be tested with Node's built-in test runner. Schedule receives live data and persistence callbacks from `app.js`; it never owns authentication or directly writes Firestore.

**Tech Stack:** Vanilla HTML/CSS/JavaScript ES modules, Firebase Firestore, existing Kairos AI relay, Node `node:test` for pure scheduling logic. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-schedule-redesign-design.md`

## Global Constraints

- Desktop-first; preserve the existing mobile access gate rather than building a mobile Schedule UI.
- Default view is **3-Day**; supported views are Day, 3-Day and Week.
- The central timeline must remain the dominant surface; collapse secondary panels before shrinking the calendar.
- Existing `boards`, nested `sections/tasks`, and `scheduleEvents` remain backward-compatible; no Firestore migration is required.
- `date/startTime/endTime` represent scheduled work; `dueDate` is a separate deadline.
- Flexible tasks move and resize; recurring/fixed events are visually quieter and are not accidentally treated as flexible tasks.
- Pointer interactions snap to 15 minutes; minimum task duration is 15 minutes; unscheduled tasks with no estimate default to 60 minutes.
- AI changes are preview-only until explicit user approval; no autonomous background rescheduling.
- Preserve Kairos's theme variables and dark visual identity; no generic AI dashboard styling, glow-heavy UI, oversized hero, or card-inside-card layout.
- Existing standalone Calendar page remains functional during this implementation.
- Small follow-up fixes may continue directly on `main`; this implementation is also committed incrementally to `main` per the project's current workflow.

## Review Focus

1. **Month/year boundaries:** Day/3-Day/Week range navigation must produce correct local dates without UTC date drift.
2. **Overnight/fixed events:** events whose end time is earlier than start time must render across midnight without creating a flexible-task interaction target.
3. **Save failure during direct manipulation:** local task date/time must roll back exactly and the user must see `Couldn't save your change. Restored the previous time.`
4. **Crowded/overlapping timelines:** simultaneous tasks/events must remain selectable and readable rather than painting directly on top of each other.
5. **Narrow desktop state:** opening the inspector around 1280px must collapse/overlay secondary panels before making the 3-Day columns unusably narrow.

---

## File Structure

### Create
- `schedule-utils.js` — pure date/time, snapping, duration, overlap and visible-range functions. No DOM or Firebase access.
- `schedule-workspace.js` — Schedule state, rendering, selection, pointer interactions, inspector, proposals, current-time indicator and responsive panel logic.
- `schedule-workspace.css` — all Schedule 3.0 styles and responsive states.
- `tests/schedule-utils.test.mjs` — Node tests for pure scheduling logic.

### Modify
- `app.html` — replace Schedule 2.0 markup with the approved stable shell; load `schedule-workspace.css`; cache-bump assets.
- `app.js` — initialize the Schedule module with callbacks/data access, expose a throwing persistence path for optimistic rollback, retain recurring-event modal ownership, extend task normalization, remove Schedule 2.0 rendering code, provide AI-plan callback.
- `app.css` — remove the old recurring-grid and appended Hybrid/Schedule 2.0 CSS blocks; keep unrelated global/calendar styles.
- `package.json` — add a dependency-free `test:schedule` script using `node --test`.

### Keep unchanged unless a regression requires it
- `ai-workspace.js` / `ai-actions.js` — normal chat actions continue to mutate the same plan data. Schedule proposal generation will call the relay through `app.js` without executing AI actions.
- standalone Calendar implementation — remains available during rollout.

---

### Task 1: Pure Schedule Math and Tests

**Files:**
- Create: `schedule-utils.js`
- Create: `tests/schedule-utils.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `toDateKey(date) -> string`
- Produces `parseTime(value) -> number | null`
- Produces `formatTime(minutes, hour12 = true) -> string`
- Produces `snapMinutes(minutes, interval = 15) -> number`
- Produces `taskDurationMinutes(task, fallback = 60) -> number`
- Produces `getVisibleDates(anchor, view) -> Date[]` where view is `day | three-day | week`
- Produces `shiftAnchor(anchor, view, direction) -> Date`
- Produces `layoutOverlaps(items) -> Array<{...item,column,columnCount}>`
- Produces `findConflicts(taskInterval, fixedIntervals) -> fixed interval[]`

- [ ] **Step 1: Write tests for date ranges and navigation**
  - Day returns one date.
  - 3-Day returns anchor + next two local dates.
  - Week returns the seven-day Sunday-through-Saturday week containing anchor.
  - `shiftAnchor` crosses month and year boundaries correctly.

- [ ] **Step 2: Run the range tests and verify they fail**

Run: `node --test tests/schedule-utils.test.mjs`
Expected: FAIL because `schedule-utils.js` does not exist yet.

- [ ] **Step 3: Implement the date/time helpers**

Use local `Date(year, month, day)` construction for date arithmetic; do not round-trip calendar dates through UTC ISO strings.

- [ ] **Step 4: Add tests for snapping and duration**
  - 09:07 snaps to 09:00, 09:08 snaps to 09:15.
  - explicit 16:00–17:30 gives 90 minutes.
  - missing duration gives 60.
  - minimum returned duration is 15.

- [ ] **Step 5: Add tests for overlap layout and conflicts**
  - non-overlapping items share full width (`columnCount === 1`).
  - simultaneous intervals receive separate columns.
  - touching intervals (10:00 end / 10:00 start) are not conflicts.
  - flexible task overlapping a fixed interval is returned by `findConflicts`.

- [ ] **Step 6: Run schedule utility tests**

Run: `node --test tests/schedule-utils.test.mjs`
Expected: all PASS.

- [ ] **Step 7: Add package script**

Add: `"test:schedule": "node --test tests/schedule-utils.test.mjs"`.

- [ ] **Step 8: Commit**

Commit message: `Add tested schedule date and layout utilities`

---

### Task 2: Schedule 3.0 Shell and Module Boundary

**Files:**
- Create: `schedule-workspace.js`
- Create: `schedule-workspace.css`
- Modify: `app.html` Schedule section and asset imports
- Modify: `app.js` imports, `renderApp()`, navigation hook and Schedule initialization
- Modify: `app.css` remove old Schedule-specific blocks

**Interfaces:**
- `schedule-workspace.js` exports `initScheduleWorkspace(options) -> workspace`.
- `workspace.render()` re-reads data from callbacks and updates the Schedule UI.
- `workspace.activate()` handles initial scroll/current-time work when navigation enters Schedule.
- `workspace.destroy()` clears timers/listeners if ever needed.
- Options:
  - `getBoards: () => boardsData`
  - `getScheduleEvents: () => scheduleData`
  - `persistPlan: () => Promise<void>`
  - `openRecurringEventEditor: (eventId?: string) => void`
  - `requestAiPlan: (context) => Promise<proposal[]>`
  - `onTaskComplete: (taskId, completed) => Promise<void> | void`
  - `getLocale: () => string`

- [ ] **Step 1: Replace Schedule markup with the approved stable shell**

Use `schedule-toolbar`, `schedule-backlog`, `schedule-calendar`, `schedule-inspector`, and `schedule-ai-review`; remove the current hero, Today cards and Schedule 2.0 container markup.

- [ ] **Step 2: Add `schedule-workspace.css` with structural layout only**

Required first-pass properties:
- `#schedule-page.page-view { max-width: none; padding-top: 0; }`
- compact 44–48px toolbar;
- 220–240px left queue on large desktop;
- flexible central calendar;
- 280–320px inspector only when open;
- flat surfaces, restrained separators, no hero cards.

- [ ] **Step 3: Remove obsolete Schedule CSS from `app.css`**

Delete both the legacy `SCHEDULE (recurring weekly events)` renderer styles and appended `Hybrid Schedule` / `Schedule 2.0` blocks only after equivalent Schedule 3.0 styling exists.

- [ ] **Step 4: Create the workspace module state and lifecycle**

Initial state:
`view: 'three-day'`, `anchor: new Date()`, `selected: {type:null,id:null}`, `backlogCollapsed:false`, `inspectorOpen:false`, `proposals:[]`, `interaction:null`.

- [ ] **Step 5: Wire `app.js` to initialize once and call `workspace.render()` from `renderApp()`**

Do not move Firestore ownership into the module.

- [ ] **Step 6: Replace the nav call to `scrollScheduleToDefault()` with `workspace.activate()`**

Around common laptop width, Schedule activation may auto-collapse the existing global Kairos sidebar; leaving Schedule restores only sidebar state that Schedule auto-changed, not a user-manual collapse.

- [ ] **Step 7: Verify build and module loading**

Run: `npm run build`
Expected: build succeeds with no syntax/module resolution errors.

Browser check: Schedule loads without the old hero/dashboard UI; Tasks and standalone Calendar still render.

- [ ] **Step 8: Commit**

Commit message: `Create Schedule 3.0 workspace shell`

---

### Task 3: Day / 3-Day / Week Rendering, Backlog, Selection and Inspector Shell

**Files:**
- Modify: `schedule-workspace.js`
- Modify: `schedule-workspace.css`
- Test: `tests/schedule-utils.test.mjs`

**Interfaces:**
- Consumes Task 1 date/overlap helpers.
- Workspace internal functions: `renderToolbar()`, `renderBacklog()`, `renderCalendar()`, `renderInspector()`, `selectItem(type,id)`, `clearSelection()`.

- [ ] **Step 1: Render the compact toolbar**

Controls: previous, Today, next, date/range label, Day / 3-Day / Week segmented control, Filter placeholder/control, `Plan`, and `+ Event` action that calls `openRecurringEventEditor()`.

- [ ] **Step 2: Render Unscheduled on the left**

Include incomplete, unarchived tasks with no scheduled `date/startTime`. Derive board and section names while traversing nested data. Row hierarchy: title, board/section, deadline and estimated duration when present. Empty copy: `No unscheduled tasks.`

- [ ] **Step 3: Render timeline columns for the selected visible range**

Use 56px/hour, full and half-hour separators, sticky day headers, a deadline/all-day lane and initial scroll near 07:00. Day/3-Day/Week changes must not destroy selected data.

- [ ] **Step 4: Render flexible tasks and recurring fixed events with distinct semantics**

Task blocks: accent-tinted, leading accent edge, selectable/focusable, `role="button"`, grab affordance.
Fixed events: subdued category-derived treatment, selectable/focusable, no resize handle and no task drag semantics.
Overnight recurring events render the before-midnight and after-midnight portions on their respective dates.

- [ ] **Step 5: Apply overlap layout and conflict state**

Use `layoutOverlaps()` for shared columns. Flexible tasks overlapping fixed events get a warning marker/accessible description, not a solid red fill.

- [ ] **Step 6: Add current-time indicator**

Only show it on columns representing today. Update position once per minute without full calendar re-render.

- [ ] **Step 7: Add selection and inspector shell**

Click/focus selection opens task/event details; clicking empty timeline clears. Event inspector exposes Edit via existing recurring event modal. Task inspector initially shows title, board/section and scheduled time plus action placeholders for later task metadata work.

- [ ] **Step 8: Add Review Focus tests for overnight and dense overlap math**

Extend pure tests so overnight interval splitting and at least three simultaneous intervals have deterministic columns.

- [ ] **Step 9: Verify**

Run: `npm run test:schedule && npm run build`
Expected: PASS.

Browser checks at 1280, 1440 and 1920 widths: 3-Day is default and remains dominant; Week can horizontally scroll rather than crush columns.

- [ ] **Step 10: Commit**

Commit message: `Render Schedule 3.0 calendar workspace`

---

### Task 4: Pointer Move, Resize, Scheduling and Rollback

**Files:**
- Modify: `schedule-workspace.js`
- Modify: `schedule-workspace.css`
- Modify: `app.js` persistence functions
- Test: `tests/schedule-utils.test.mjs`

**Interfaces:**
- Add `persistPlanOrThrow() -> Promise<void>` in `app.js` that performs the existing plan `updateDoc` and rejects on failure.
- Keep `updatePlanInFirestore()` as the compatibility wrapper that logs/swallow errors for existing callers.
- Schedule receives `persistPlan: persistPlanOrThrow`.

- [ ] **Step 1: Refactor persistence so Schedule can detect failure**

`persistPlanOrThrow()` must reject if no plan document exists or Firestore update fails. Existing callers continue using `updatePlanInFirestore()` to avoid unrelated behaviour changes.

- [ ] **Step 2: Implement Pointer Event interaction state for scheduled task move**

On `pointerdown`, capture task and original date/start/end. Use pointer capture. During move, update only preview state and transform/preview block. On pointerup, snap to 15 minutes and commit the new date/time while preserving duration.

- [ ] **Step 3: Implement resize from the task block bottom handle**

Minimum duration 15 minutes; show a compact live duration label while resizing. Fixed events must never expose or respond to this handle.

- [ ] **Step 4: Implement backlog-to-calendar scheduling**

Pointer dragging an unscheduled row into a timeline slot sets date/start/end using `estimatedMinutes` or 60 minutes.

- [ ] **Step 5: Implement calendar-to-backlog unscheduling**

Dropping a flexible task onto Unscheduled clears `date`, `startTime`, and `endTime` only; preserve `dueDate`, metadata and completion state.

- [ ] **Step 6: Implement optimistic save and exact rollback**

Clone the original scheduling fields before commit. Render immediately, await `persistPlan()`, and on rejection restore originals and show the exact toast: `Couldn't save your change. Restored the previous time.`

- [ ] **Step 7: Handle pointer cancellation and Escape**

`pointercancel` or Escape restores the visual preview with no mutation. Keyboard `Move to…`/Reschedule remains available from inspector as the non-drag alternative.

- [ ] **Step 8: Add helper tests for cross-day duration preservation and 15-minute clamps**

Run: `npm run test:schedule`
Expected: PASS.

- [ ] **Step 9: Browser regression checks**

Verify move within day, move across day, resize, schedule from backlog, unschedule back to backlog, overlapping fixed event warning, and simulated failed save rollback.

- [ ] **Step 10: Commit**

Commit message: `Add direct Schedule task manipulation`

---

### Task 5: Rich Task Metadata, Deadline Lane and Useful Inspector

**Files:**
- Modify: `app.js` task normalization/default creation paths
- Modify: `schedule-workspace.js`
- Modify: `schedule-workspace.css`
- Test: `tests/schedule-utils.test.mjs`

**Interfaces:**
- Optional task fields: `dueDate`, `estimatedMinutes`, `priority`, `notes`, `reminderMinutes`, `scheduleLocked`, `schedulingPreference`.
- No migration write is required when loading; normalize missing fields in memory to safe defaults.

- [ ] **Step 1: Extend task normalization in `normalizeArchiveFields()`**

Defaults: `dueDate:null`, `estimatedMinutes:null`, `priority:null`, `notes:''`, `reminderMinutes:null`, `scheduleLocked:false`, `schedulingPreference:null`. Do not overwrite existing values.

- [ ] **Step 2: Update task creation paths to remain compatible**

New manually/AI-created tasks may omit these fields; Schedule normalization must still work. Do not require metadata to save a task.

- [ ] **Step 3: Render deadline lane**

Tasks with `dueDate` appear in the matching visible day header. Keep scheduled task time separate. Collapse excess deadlines behind `+N deadlines`.

- [ ] **Step 4: Build progressive-disclosure task inspector**

Always-visible: editable title, schedule date/start/duration, due date, board/section, completion.
Secondary disclosure: priority, estimated duration, notes, reminder, schedule lock.
Actions: Complete, Reschedule, Move, Ask AI, secondary Delete.

- [ ] **Step 5: Persist inspector edits optimistically**

Use the same underlying task object used by Boards, call `persistPlan()`, refresh Schedule plus `renderCalendar()`/Boards through app callback after successful changes, and rollback changed fields on failure.

- [ ] **Step 6: Add keyboard alternatives**

Explicit date/time/duration inputs make all drag/resize operations achievable without pointer input. Enter/Space selects blocks; Escape closes inspector/transient UI.

- [ ] **Step 7: Add due-date helper tests**

Verify `dueDate` is never cleared by unscheduling and that deadline grouping uses local calendar date keys.

- [ ] **Step 8: Verify**

Run: `npm run test:schedule && npm run build`.
Browser: edit metadata in Schedule, navigate to Tasks and confirm title/completion remains the same underlying task; standalone Calendar still sees `date`.

- [ ] **Step 9: Commit**

Commit message: `Add Schedule task inspector and deadlines`

---

### Task 6: Responsive, Accessibility and Visual-State Pass

**Files:**
- Modify: `schedule-workspace.js`
- Modify: `schedule-workspace.css`
- Modify: `app.js` Schedule/global-sidebar activation state if needed

**Interfaces:**
- Workspace responsive states: `wide`, `laptop`, `narrow` derived from available Schedule width, not mobile breakpoints.

- [ ] **Step 1: Implement collapse priority**

At large widths: backlog + calendar + inspector can coexist.
Around 1280px: keep backlog until inspector opens, then collapse backlog to rail.
Narrow desktop: backlog collapses first; inspector becomes a right overlay sheet; if 3-Day columns no longer meet minimum readable width, temporarily render Day without deleting the user's selected view preference.

- [ ] **Step 2: Implement explicit interaction states in CSS**

Normal, hover, selected, dragging, resizing, completed, overdue, conflicting, AI-proposed, fixed event, loading, error, collapsed backlog, overlay inspector. Avoid colour-only differentiation.

- [ ] **Step 3: Add accessible focus and labels**

Calendar blocks must expose labels such as `Science revision, Tuesday 4 PM to 5:30 PM, flexible task`; fixed event labels identify them as recurring/fixed. Focus rings must remain visible on every theme.

- [ ] **Step 4: Respect reduced motion**

Disable nonessential transforms/transitions under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Verify browser widths and keyboard path**

1280 / 1440 / 1920: calendar readable, no horizontal page overflow outside Week calendar scroller, correct panel collapse.
Keyboard-only: toolbar -> backlog -> blocks -> inspector actions; no drag-only required action.

- [ ] **Step 6: Commit**

Commit message: `Refine Schedule responsiveness and accessibility`

---

### Task 7: AI Schedule Proposal Layer

**Files:**
- Modify: `schedule-workspace.js`
- Modify: `schedule-workspace.css`
- Modify: `app.js`
- Modify: `build.js` only if the AI relay URL moves into a new file (prefer keeping relay request in `app.js` to avoid this change)

**Interfaces:**
- `requestAiPlan(context) -> Promise<Proposal[]>`
- Proposal shape:
  `{ taskId, from:{date,startTime,endTime}, to:{date,startTime,endTime}, reason, conflictIds:[] }`
- Schedule proposal generation never calls `executeKairosAction`.

- [ ] **Step 1: Build the Plan request context in the workspace**

Include incomplete unscheduled/flexible tasks with ids, due dates, estimates, schedule locks and current scheduled times; visible/future fixed recurring commitments; local current date; and requested planning horizon. Exclude archived/completed tasks. Mark all user task text as data, not instructions.

- [ ] **Step 2: Add `requestScheduleAiPlan(context)` in `app.js` using the existing Kairos relay pattern**

Prompt requires raw JSON in the existing relay envelope and only proposal objects for existing task IDs. AI must not create/delete tasks in this flow. Reject malformed IDs, invalid dates/times, durations under 15 minutes, or moves of `scheduleLocked` tasks.

- [ ] **Step 3: Render proposals without mutating tasks**

Translucent/dashed preview blocks overlay the calendar. A slim review strip reads `Kairos proposes N changes` with Apply all / Review / Dismiss.

- [ ] **Step 4: Add proposal inspector reasoning**

Selecting a proposal shows from/to, reason and avoided/conflicting commitments. `Change` converts the proposal into normal manual reschedule controls without first applying it.

- [ ] **Step 5: Apply approved proposals as one optimistic batch**

Snapshot all affected task scheduling fields, mutate in memory, render, perform one `persistPlan()` call, rollback the whole approved set on failure.

- [ ] **Step 6: Dismiss is guaranteed non-mutating**

Clearing proposals removes only proposal client state; task objects and Firestore remain unchanged.

- [ ] **Step 7: Verify AI safety and user control**

Browser checks: Plan returns preview only; Dismiss changes nothing; Apply persists; malformed proposal is rejected; locked task is not proposed/moved; relay failure leaves schedule untouched and shows an inline/toast error.

- [ ] **Step 8: Commit**

Commit message: `Add preview-first AI scheduling proposals`

---

### Task 8: Remove Schedule 2.0 Dead Code, Regression Pass and Deploy Cache Bumps

**Files:**
- Modify: `app.js`
- Modify: `app.css`
- Modify: `app.html`
- Modify: `schedule-workspace.js` / `.css` only for verified fixes

**Interfaces:**
- No old `renderScheduleWeek`, `renderScheduleToday`, Schedule 2.0 drag/drop or legacy Schedule CSS should remain after the new workspace owns those behaviours.
- Keep recurring-event modal functions and bedtime-reminder helpers that are still shared outside the workspace.

- [ ] **Step 1: Remove obsolete Schedule 2.0 renderer and browser HTML5 drag/drop code from `app.js`**

Retain `SCHEDULE_CATEGORIES`, recurring-event modal CRUD, `buildScheduleSummaryForAI`, bedtime reminder helpers and any utility still used elsewhere; migrate duplicated time helpers to imports from `schedule-utils.js` where safe.

- [ ] **Step 2: Remove all obsolete Schedule CSS from `app.css`**

Confirm old selectors such as `.schedule-v2-*`, `.schedule-modern-header`, `.schedule-view-tabs`, legacy `.schedule-week-grid` renderer-only rules are gone unless intentionally reused by Calendar-independent code.

- [ ] **Step 3: Full automated verification**

Run:
- `npm run test:schedule`
- `npm run build`
- `node --check app.js`
- `node --check schedule-utils.js`
- `node --check schedule-workspace.js`

Expected: all exit 0.

- [ ] **Step 4: Full browser regression checklist**

Schedule: Day / 3-Day / Week, navigation, current time, backlog, move, resize, unschedule, inspector, metadata, overlap/conflict, recurring event edit, responsive panels, AI preview/apply/dismiss.
Other app: Dashboard, Tasks/Boards edit and complete, standalone Calendar month/day panel, AI chat task action, Settings theme/accent, bedtime recurring schedule reminder data.

- [ ] **Step 5: Cache bump only after verified code is final**

Increment `app.js` from `v=10` to the next unused version; add/version `schedule-workspace.css` and module imports; bump `app.css` only if it changed. Avoid touching `ai-workspace.js?v=23` unless that file actually changes.

- [ ] **Step 6: Commit**

Commit message: `Complete Schedule 3.0 redesign`

---

## Final Acceptance Checklist

- [ ] Schedule opens directly into a compact 3-Day planning workspace.
- [ ] Unscheduled work is on the left and can collapse.
- [ ] Calendar is the visually dominant surface.
- [ ] Tasks and fixed events are immediately distinguishable.
- [ ] Tasks move between times/days and resize with 15-minute snapping.
- [ ] Dragging back to Unscheduled preserves deadline/metadata.
- [ ] Conflicts and overlaps are understandable.
- [ ] Inspector edits the same task data Boards uses.
- [ ] Deadlines are distinct from scheduled work time.
- [ ] Current time is visible without minute-by-minute full re-renders.
- [ ] AI planning is preview-first and requires approval.
- [ ] Save failures roll back cleanly.
- [ ] 1280, 1440 and 1920 desktop widths are usable.
- [ ] Keyboard alternatives exist for drag and resize.
- [ ] Old Schedule 2.0 rendering/CSS is removed rather than overridden again.
- [ ] Tests/build/syntax checks pass and existing Boards, Calendar and AI task actions regress cleanly.
