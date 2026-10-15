# Kairos Recurring Tasks — Series, Occurrences and Exceptions

## Status

Approved product direction for implementation in the existing Kairos web application.

## Goal

Add first-class recurring tasks to Kairos without duplicating an entire stored task for every occurrence.

Recurring tasks must work consistently across Boards, Schedule, task creation/editing, completion, skipping, AI planning and future analytics. The system should preserve a single logical series in Boards while rendering individual occurrences in Schedule.

The recurrence system must support both fixed-time routines and flexible recurring work that Kairos AI can place intelligently.

## Product principles

- A recurring task is one logical task series, not hundreds of copied task rows.
- Boards show one row for the series.
- Schedule renders concrete occurrences.
- Completing an occurrence completes only that occurrence.
- Skipping an occurrence affects only that occurrence.
- Editing supports three scopes: this occurrence, this and all future occurrences, or entire series.
- Flexible recurring work is never silently dropped when overdue.
- Fixed-time recurrence remains fixed unless the user explicitly edits or moves it.
- Existing non-recurring tasks must remain fully backward compatible.

## Supported recurrence patterns

The first implementation must support the full approved recurrence set:

- daily;
- every weekday;
- weekly;
- selected weekdays, such as every Wednesday or Monday/Wednesday/Friday;
- every N weeks;
- monthly on the same date, such as the 15th;
- monthly by weekday position, such as the first Monday or last Friday;
- yearly on the same month/day;
- custom intervals such as every 3 days or every 2 months;
- optional end date;
- optional occurrence-count limit.

The UI may expose presets and a custom builder, but all recurrence should normalize into one internal rule shape.

## Scheduling modes

Recurring tasks support two scheduling modes.

### Fixed time

A fixed-time series has an intended start time and duration for each generated occurrence.

Example:

`Gym — every Wednesday at 17:30 for 60 minutes`

Each occurrence appears at that time unless the user applies an occurrence-specific or future-series edit.

AI planning must treat fixed recurring occurrences as occupied/locked time unless the user explicitly asks to move a specific occurrence.

### Flexible time

A flexible series defines the occurrence date pattern but not a mandatory start time.

Example:

`Science revision — every Wednesday — flexible — 60 minutes`

The occurrence belongs to Wednesday, but Kairos or the user may choose a suitable time on that date.

A flexible occurrence that passes unfinished remains overdue until completed or skipped. Kairos must not silently discard it or automatically move it to another date.

## Storage architecture

Use a hybrid **series + virtual occurrences + exception records** model.

### Base task

The existing task object remains the primary series record.

A recurring task gains an optional `recurrence` object. Existing tasks with no recurrence object remain ordinary one-off tasks.

Recommended shape:

```js
{
  recurrence: {
    enabled: true,
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
    interval: 1,
    weekdays: [1, 3, 5],
    monthlyMode: 'date' | 'weekdayPosition' | null,
    monthDay: 15,
    weekdayPosition: 'first' | 'second' | 'third' | 'fourth' | 'last' | null,
    weekday: 1,
    month: 10,
    startDate: '2026-10-10',
    endType: 'never' | 'date' | 'count',
    endDate: null,
    count: null,
    mode: 'fixed' | 'flexible',
    exceptions: {}
  }
}
```

Unused fields should remain null or absent as appropriate.

Weekday numbering should use one consistent convention everywhere. Prefer JavaScript day numbering:

- 0 Sunday
- 1 Monday
- 2 Tuesday
- 3 Wednesday
- 4 Thursday
- 5 Friday
- 6 Saturday

### Rule normalization examples

Every Wednesday:

```js
{
  frequency: 'weekly',
  interval: 1,
  weekdays: [3]
}
```

Monday, Wednesday and Friday every two weeks:

```js
{
  frequency: 'weekly',
  interval: 2,
  weekdays: [1, 3, 5]
}
```

Every three days:

```js
{
  frequency: 'daily',
  interval: 3
}
```

The first Monday of each month:

```js
{
  frequency: 'monthly',
  interval: 1,
  monthlyMode: 'weekdayPosition',
  weekdayPosition: 'first',
  weekday: 1
}
```

Every year on October 10:

```js
{
  frequency: 'yearly',
  interval: 1,
  month: 10,
  monthDay: 10
}
```

## Occurrence identity

Occurrences are generated on demand and must have stable identities derived from the series and logical occurrence date.

Recommended occurrence key:

```text
<taskId>::<YYYY-MM-DD>
```

Example:

```text
task-abc123::2026-10-14
```

The logical occurrence date is the date produced by the recurrence rule before any occurrence-specific override.

This identity must remain stable even if that occurrence is moved to another date/time through an exception. Exceptions are therefore keyed by the original occurrence date, not the overridden display date.

## Occurrence generation

Kairos must not materialize years of future tasks.

Generate occurrences only for the date range currently needed, for example:

- visible Schedule range;
- Schedule AI planning horizon;
- Boards `Next:` summary lookup;
- a small past range when overdue occurrences need to remain visible;
- future analytics/history queries when explicitly requested later.

The recurrence engine should be a pure module that receives a base task and date range and returns normalized occurrence descriptors.

Recommended occurrence descriptor:

```js
{
  occurrenceId,
  seriesId,
  occurrenceDate,
  displayDate,
  startTime,
  endTime,
  durationMinutes,
  status: 'pending' | 'completed' | 'skipped' | 'deleted',
  isOverdue,
  isException,
  mode: 'fixed' | 'flexible',
  task
}
```

For flexible occurrences, `startTime` and `endTime` may be null until manually or automatically scheduled.

## Exception model

Use recurrence exceptions keyed by the original logical occurrence date.

Recommended shape:

```js
recurrence: {
  ...,
  exceptions: {
    '2026-10-14': {
      status: 'completed' | 'skipped' | 'deleted' | null,
      override: {
        title,
        date,
        startTime,
        endTime,
        durationMinutes,
        dueDate,
        priority,
        estimatedMinutes,
        schedulingPreference,
        color,
        notes,
        reminderMinutes,
        scheduleLocked
      },
      completedAt,
      skippedAt
    }
  }
}
```

Only changed values need to be stored inside `override`.

Do not duplicate the entire base task into every exception.

## Completion semantics

Completing a recurring occurrence affects only that occurrence.

Do not set the base recurring task's ordinary `completed` field to true when one occurrence is completed.

Instead:

```js
recurrence.exceptions['2026-10-14'] = {
  ...existing,
  status: 'completed',
  completedAt: <timestamp>
}
```

The next recurrence remains active automatically.

For recurring series, the base task `completed` field should either remain false or be ignored for occurrence completion semantics. Ending the series must be explicit through recurrence controls rather than by completing one occurrence.

## Skip semantics

`Skip occurrence` affects only the selected occurrence.

Recommended exception:

```js
{
  status: 'skipped',
  skippedAt: <timestamp>
}
```

The next recurrence remains active.

The UI should show a compact undo toast after skipping where practical.

## Overdue semantics

Flexible recurring occurrences remain overdue after their logical date passes until the user completes or skips them.

Multiple pending occurrences from the same series may coexist.

Example on October 21:

- October 14 occurrence — overdue;
- October 21 occurrence — current.

Kairos must not merge these into one occurrence or drop the earlier one.

Fixed-time occurrences that pass unfinished may also be marked overdue, but their original fixed placement/history should remain visible through the occurrence model.

## Edit scopes

When editing a recurring occurrence, Kairos must support all three approved scopes.

### This occurrence only

Create or update an exception for the selected occurrence.

The base recurrence rule remains unchanged.

Applicable edits include:

- title;
- date/time;
- duration;
- due date;
- priority;
- estimate;
- preferred time;
- reminder;
- schedule lock;
- color;
- notes.

A one-off recurrence-rule-looking change should still be represented as an occurrence override rather than mutating the series.

### This and all future occurrences

Split the series at the selected occurrence.

The original series ends immediately before the selected occurrence. A new series begins from the selected occurrence using the edited values and recurrence rule.

Example:

Original:

`Every Wednesday from Oct 1 onward`

User edits the Oct 21 occurrence and chooses `This and future` to Thursday.

Result:

- original series ends after Oct 14;
- new recurring series starts Oct 21/22 according to the edited rule;
- prior completion/skip history remains attached to the original series;
- future occurrences come from the new series.

This is preferred over storing an indefinite future-override layer.

### Entire series

Update the base task and recurrence rule.

Historical completed/skipped occurrence records must be preserved when they still map sensibly to prior occurrence keys.

Changing a rule may make some future exceptions unreachable. The implementation should retain historical exceptions but ignore exceptions whose occurrence keys are no longer generated in future ranges.

## Delete semantics

Deleting a recurring occurrence uses the same scope model.

### This occurrence

Store a `deleted` or equivalent skipped/deleted exception for that occurrence.

### This and future

End the original series before the selected occurrence and do not create a replacement series.

### Entire series

Delete/archive the base task series according to Kairos's existing task deletion behavior.

The UI should distinguish `Skip occurrence` from destructive deletion. Skipping is the normal non-destructive way to intentionally not do one occurrence.

## Boards behavior

Boards must show one row for the recurring series, never one row per generated occurrence.

The task row should include a compact recurrence summary where space allows.

Examples:

- `Repeats every Wednesday · Next: Oct 14`
- `Every 2 weeks on Mon/Wed · Flexible · Next: Oct 12`
- `First Monday monthly · 5:30 PM`

The normal task editor opens the base series configuration.

Boards should not render overdue occurrences as duplicate task rows in the first implementation. Overdue occurrence visibility belongs primarily in Schedule and future history/insight surfaces.

## Schedule behavior

Schedule renders occurrences individually.

Recurring occurrence blocks should look like normal task blocks with a restrained recurrence indicator such as `↻`.

The occurrence block must expose enough identity for selection and mutation:

```js
{
  seriesId,
  occurrenceId,
  occurrenceDate
}
```

Selecting a recurring occurrence opens an occurrence-aware inspector.

Recommended primary actions:

- Complete;
- Skip occurrence;
- Reschedule;
- Ask AI;
- Edit.

The inspector should show a concise recurrence summary.

## Task creation UI

The existing Schedule `+ Task` flow and normal task creation/editing surfaces gain a `Repeat` control.

Default:

`Never`

Preset values:

- Never
- Daily
- Every weekday
- Weekly
- Monthly
- Yearly
- Custom…

Choosing a recurrence preset reveals a compact recurrence section.

### Custom recurrence builder

Base control:

`Repeat every [N] [days/weeks/months/years]`

Weekly mode additionally shows weekday toggles:

`M T W T F S S`

Monthly mode supports:

- day of month;
- weekday position, such as first Monday or last Friday.

Yearly mode supports month/day.

Scheduling mode:

- Fixed time
- Flexible time

End condition:

- Never
- On date
- After N occurrences

Show a human-readable summary beneath the builder.

Example:

`Every 2 weeks on Monday and Wednesday · Flexible time · Ends Dec 18, 2026`

## Recurrence editing UI

Normal one-off task editing remains unchanged when recurrence is disabled.

When saving changes to a recurring occurrence, show a compact scope dialog:

**Apply changes to**

- This occurrence
- This and future occurrences
- Entire series
- Cancel

Use the same scope concept for deletion.

Completing and skipping do not require the scope dialog because both are defined to affect only the selected occurrence.

## AI planning model

AI planning must operate on concrete recurring occurrences, not only on abstract series records.

### Fixed occurrences

Fixed recurring occurrences act as occupied/locked commitments unless the user explicitly targets one for movement.

### Flexible occurrences

Flexible occurrences become planning candidates inside the requested planning horizon.

Each AI occurrence candidate should include:

```js
{
  taskId,
  seriesId,
  occurrenceId,
  occurrenceDate,
  title,
  plannedMinutes,
  priority,
  schedulingPreference,
  isOverdue,
  mode: 'flexible'
}
```

AI must schedule the occurrence on its allowed logical date unless the user explicitly requests an occurrence-specific date change.

Do not let the planner create a second schedule proposal for the same occurrence.

Completed, skipped or deleted occurrences must not be offered to AI planning.

### Occupancy and conflicts

Generated recurring occurrences participate in the same deterministic conflict system as ordinary tasks and recurring fixed events.

The validator must reason over occurrence IDs, not only base task IDs, so two occurrences from the same series remain distinct planning entities.

## Conflict handling

Fixed recurring task occurrences that overlap fixed commitments should be shown as conflicts rather than silently shifted.

Flexible recurring occurrences may be placed around:

- fixed recurring schedule events;
- fixed recurring task occurrences;
- ordinary scheduled tasks;
- other recurring task occurrences;
- AI proposal blocks.

If no valid time exists for a flexible occurrence, leave it unscheduled/overdue. Do not drop it.

## History preservation

The data model must preserve enough occurrence history for future reporting.

At minimum retain:

- completed occurrence keys;
- skipped occurrence keys;
- deleted occurrence keys;
- occurrence-specific overrides;
- completion timestamps where available;
- skip timestamps where available.

A dedicated recurrence-history UI is out of scope for the first implementation.

The stored history should make future features possible, such as:

`You completed 7 of the last 8 weekly revision sessions.`

## Backward compatibility

Existing tasks without `recurrence.enabled === true` behave exactly as they do today.

No destructive migration is required.

Normalization helpers may attach default recurrence metadata lazily, but they must not change the behavior of one-off tasks.

Existing `scheduleEvents` remain a separate recurring fixed-event system in the first implementation. Do not silently migrate them into recurring tasks.

## Series splitting and IDs

Splitting `This and future` creates a new task series ID.

The original series keeps its historical identity and exceptions.

The new series should inherit applicable base task metadata but receive:

- a new task ID;
- a new recurrence `startDate`;
- the edited recurrence rule and task fields;
- no historical exceptions from the prior series unless intentionally migrated for occurrences on or after the split point.

Default behavior should be to start the new series with an empty exception map.

## Pure recurrence engine

Create a dedicated pure recurrence module rather than embedding date math in Schedule renderers.

Suggested module:

`recurrence-utils.js`

Responsibilities:

- normalize recurrence rules;
- validate recurrence rules;
- generate occurrence dates for a range;
- apply exceptions to generated occurrences;
- find the next occurrence;
- format recurrence summaries;
- determine whether an occurrence is overdue;
- support series splitting calculations.

The recurrence engine must not own Firebase persistence or DOM rendering.

## Integration boundaries

### Schedule workspace

Schedule consumes generated occurrences and renders them as task-like blocks.

It must not duplicate base tasks into persistent storage merely to display occurrences.

### Schedule inspector

The inspector becomes occurrence-aware when selection contains an occurrence ID.

It should distinguish:

- editing the base series;
- editing one occurrence;
- splitting from this occurrence forward.

### Boards / task UI

Boards continue to work with base task records and show recurrence summaries.

### AI bridge

The AI context builder expands recurring series into the relevant occurrence horizon before producing planner context.

The deterministic validator must validate proposed recurring occurrence placement without confusing multiple occurrences of one series.

## Persistence and rollback

Recurring mutations should follow Kairos's existing optimistic persistence pattern.

Before mutation, snapshot affected records.

For simple occurrence completion/skip:

1. snapshot the base task recurrence object;
2. apply the exception in memory;
3. render;
4. persist the plan;
5. restore the snapshot if persistence fails.

For series splitting:

1. snapshot the source board/section task arrays and source task;
2. update original series end condition;
3. insert the new series task;
4. render;
5. persist once where practical;
6. fully restore both series if persistence fails.

Do not leave half-split series after an error.

## Accessibility

Recurrence controls must remain keyboard accessible.

Requirements:

- weekday toggles are reachable and expose pressed/checked state;
- recurrence summary is text, not icon-only;
- the `↻` visual indicator has an accessible label or is hidden when redundant;
- scope dialogs use clear button labels;
- recurring occurrence blocks include recurrence information in accessible labels where useful.

Example:

`Science revision, recurring task, Wednesday 4 PM to 5 PM.`

## Edge cases

The implementation must define and test these cases.

### Month lengths

A monthly task on the 31st should occur only in months containing the 31st rather than silently changing to the final day of shorter months.

### Leap day

A yearly recurrence on February 29 should occur only in leap years unless a future product decision explicitly adds fallback behavior.

### Last weekday of month

`Last Friday` must be computed from the actual target month.

### DST and timezone

Kairos currently uses local wall-clock task times. Recurrence generation should operate on local calendar dates and local `HH:MM` values, not UTC timestamp arithmetic, to avoid weekday drift across daylight-saving boundaries.

### Recurrence count

`After N occurrences` counts logical generated occurrences before completion/skip state. Skipping an occurrence still consumes one occurrence in the recurrence sequence.

### End date

An occurrence on the end date is included when it matches the recurrence rule.

### Rule edits with history

Changing the entire series must not erase historical completion/skip records.

### Exceptions moved across dates

An occurrence exception moved from Wednesday to Thursday retains the Wednesday occurrence key so it is not regenerated twice.

## Test strategy

Use test-driven development.

### Pure recurrence tests

Add focused tests for:

- daily intervals;
- weekdays;
- selected weekdays;
- every N weeks;
- monthly day-of-month;
- first/second/third/fourth/last weekday monthly rules;
- yearly rules;
- custom intervals;
- end date;
- occurrence count;
- month-end behavior;
- leap day behavior;
- stable occurrence IDs;
- exception application;
- overdue generation;
- next-occurrence lookup;
- series split boundaries.

### Source/integration tests

Add regression coverage proving:

- Schedule task creation exposes Repeat controls;
- rich task inspector exposes recurrence editing;
- Schedule renders recurring occurrences rather than duplicate stored tasks;
- recurring occurrence completion writes an exception rather than completing the base task;
- Skip occurrence writes only an occurrence exception;
- edit scope dialog includes all three approved scopes;
- AI context contains occurrence IDs and excludes completed/skipped occurrences;
- fixed recurring occurrences are included as commitments;
- flexible recurring occurrences appear as planner candidates;
- asset injection includes any new recurrence module/version.

### Persistence rollback tests

Where practical, cover rollback semantics for:

- completion exception failure;
- skip failure;
- occurrence edit failure;
- series split failure.

## Suggested implementation sequence

### Phase 1 — Recurrence engine and task metadata

Implement:

- recurrence normalization;
- recurrence validation;
- occurrence generation;
- summary formatting;
- exception application;
- unit tests.

No UI behavior should depend on untested recurrence date math.

### Phase 2 — Creation and series editing UI

Implement recurrence controls in:

- Schedule `+ Task`;
- rich task inspector;
- existing task creation/editing surfaces where applicable.

Boards remain one series row.

### Phase 3 — Schedule occurrence rendering

Expand recurring series into visible Schedule occurrences.

Add:

- stable occurrence selection;
- recurrence indicator;
- occurrence-aware inspector;
- overdue recurring occurrences.

### Phase 4 — Completion, skip and edit scopes

Implement:

- complete this occurrence;
- skip occurrence;
- this-occurrence exceptions;
- this-and-future series splitting;
- entire-series editing;
- scoped deletion;
- optimistic rollback.

### Phase 5 — AI planning integration

Expand recurrence into AI planning context.

Update proposal validation to use occurrence identities and recurrence constraints.

Test fixed and flexible recurrence planning separately.

### Phase 6 — Boards summaries and polish

Add compact recurrence summaries and `Next:` date display in Boards.

Finish accessibility, copy, responsive layout and visual recurrence indicators.

## Explicitly out of scope for first implementation

- a dedicated recurrence analytics/history page;
- recurrence templates shared across users;
- server-side scheduled materialization of future tasks;
- converting existing `scheduleEvents` into recurring tasks;
- timezone-per-task support;
- complex RFC 5545/RRULE import/export;
- exceptions based on public holidays or school calendars;
- automatic skip/reschedule rules for holidays.

## Success criteria

The feature is successful when:

1. a user can create a recurring task with any approved recurrence pattern;
2. Boards shows one logical series row;
3. Schedule generates the correct individual occurrences;
4. fixed and flexible recurrence behave differently as designed;
5. completing or skipping one occurrence leaves the series active;
6. flexible missed occurrences remain overdue;
7. editing supports this occurrence, this and future, and entire series;
8. series splitting preserves prior history;
9. AI planning understands recurring occurrences without double-scheduling them;
10. existing one-off tasks continue to behave exactly as before;
11. recurrence date math is covered by deterministic automated tests;
12. persistence failures restore the pre-change recurrence state cleanly.
