# Kairos Schedule 3.0 — Calendar-First Hybrid Planner

## Status

Approved product direction for implementation on the existing Kairos web application.

## Goal

Replace the current Schedule 2.0 page with a desktop-first scheduling workspace that combines time blocking, dated tasks, recurring/fixed events, deadlines, unscheduled work, contextual task editing, and AI-assisted schedule proposals.

The redesign must feel native to Kairos rather than like a generic calendar SaaS or AI dashboard. The calendar is the dominant working surface.

## Product role

Kairos should have clear responsibility boundaries:

- **Boards / Routines & Tasks** organise work.
- **Schedule** places work in time and adjusts it directly.
- **Kairos AI** helps decide where work should go and proposes changes.

The existing standalone Calendar page remains during the first rollout. It can be consolidated into Schedule later after the new Schedule is proven stable.

## Existing constraints

Kairos is a vanilla HTML/CSS/JavaScript application backed by Firebase. The current plan document stores nested boards, sections and tasks plus `scheduleEvents`.

A task currently supports:

- `id`
- `title`
- `completed`
- `archived`
- `date`
- `startTime`
- `endTime`

Recurring schedule events currently support:

- `id`
- `title`
- `category`
- `day`
- `start`
- `end`

No migration is required for the first phase. Existing fields remain valid and are progressively extended.

## Information architecture

### Main Schedule workspace

The Schedule page becomes a full-width workspace rather than a normal constrained `.page-view` content page.

The workspace has four conceptual areas:

1. compact schedule toolbar;
2. collapsible unscheduled-task panel on the left;
3. central timeline calendar;
4. contextual inspector on the right when a task or event is selected.

The central timeline always has priority over secondary panels.

### Default view

The default view is **3-Day**.

Available views:

- Day
- 3-Day
- Week

3-Day is the default because it provides forward visibility without compressing task blocks too heavily on common laptop widths.

## Layout

### Global navigation

Keep the existing Kairos global sidebar and visual identity.

When available width becomes constrained, the global sidebar may automatically collapse while Schedule is active, using the existing collapsed navigation behaviour.

### Toolbar

The Schedule toolbar should be compact, approximately 44–48px tall, and contain only high-value controls:

- previous period;
- Today;
- next period;
- current date/range;
- Day / 3-Day / Week segmented control;
- filter control;
- AI planning action labelled `Plan`.

Do not use a large Schedule page title, hero section, marketing copy, statistics cards, or decorative widgets.

### Left unscheduled panel

Target width on large desktop: 220–240px.

Contents:

- title `Unscheduled`;
- optional compact search/filter control;
- unscheduled task rows;
- count;
- collapsed state.

Each task row should remain visually light. The default visible hierarchy is:

- task title;
- board/project;
- due date when present;
- estimated duration when present;
- priority indicator when present.

The entire row is draggable. A drag affordance appears on hover/focus.

The panel can collapse to a narrow rail. It should collapse before the central calendar loses useful width.

### Central calendar

The central calendar contains:

- day headers;
- all-day/deadline lane;
- hourly timeline;
- flexible Kairos task blocks;
- fixed/recurring event blocks;
- current-time indicator;
- overlap layout;
- AI proposal blocks when present.

Default timeline density is approximately 56px per hour. The initial scroll position should focus around the start of the user's active day while preserving access to the full 24 hours.

Full-hour lines are stronger than half-hour lines.

### Right inspector

Target width on large desktop: 280–320px.

The inspector opens contextually when a task or event is selected. It is not permanently visible when nothing is selected.

For a Kairos task, show or edit:

- title;
- scheduled date/time;
- duration;
- due date;
- board;
- section;
- priority;
- notes;
- reminder;
- completion state;
- scheduling-related AI information when relevant.

Primary actions:

- Complete;
- Reschedule;
- Move;
- Ask AI.

Destructive actions such as Delete should be secondary and visually separated.

Use progressive disclosure. Do not turn the inspector into a giant form.

## Visual language

Preserve Kairos's current dark theme, accent system and overall identity, but make Schedule flatter, denser and more application-like.

### Principles

- near-black base surfaces;
- subtle separators;
- restrained borders;
- flat or nearly flat surfaces;
- minimal shadows;
- compact controls;
- strong alignment;
- purposeful use of the Kairos accent;
- restrained radius;
- no glow effects;
- no giant gradients;
- no card-inside-card layout;
- no decorative statistics;
- no emoji as interface decoration.

### Radius scale

Recommended Schedule radii:

- 4px: compact chips;
- 6px: calendar blocks;
- 8px: buttons and rows;
- 10px: menus and inspector sections;
- 12px: dialogs.

16–18px should be uncommon.

### Motion

- 120ms: hover/focus interaction;
- 180ms: panel/open-close transitions;
- 220ms maximum for major state transitions.

Respect `prefers-reduced-motion`.

## Calendar block semantics

### Flexible Kairos task

Visual treatment:

- subtle accent-tinted background;
- 2–3px accent leading edge;
- approximately 6px radius;
- task title;
- time/duration when space allows;
- grab cursor;
- resize handle on hover or selection.

Flexible tasks are directly movable and resizable.

### Fixed or recurring event

Visual treatment:

- lower-saturation or neutral background;
- visually quieter than flexible tasks;
- no resize handle in the first implementation;
- fixed/recurring marker available when selected;
- pointer cursor rather than grab cursor unless direct editing is intentionally enabled.

Existing `scheduleEvents` use this treatment.

### Deadline

A deadline is not the same as a scheduled work block.

Deadlines should appear in the day header/all-day lane where appropriate. `dueDate` must remain distinct from the task's scheduled `date`.

When deadline density is high, collapse overflow into a compact `+N deadlines` disclosure.

## Direct manipulation

Timeline interactions should use Pointer Events instead of browser HTML5 drag/drop.

Supported direct manipulation:

- move a flexible task vertically to change time;
- move a flexible task horizontally to change day;
- drag an unscheduled task into the timeline;
- drag a scheduled task back to Unscheduled to clear its scheduled date/time;
- resize a task from the bottom edge to change duration.

### Snapping

Default snap interval: 15 minutes.

Minimum task duration: 15 minutes.

Dragging preserves duration unless the user explicitly resizes the task.

### Interaction state

Maintain temporary pointer interaction state rather than writing during every pointer move:

```js
{
  mode: 'move' | 'resize',
  taskId,
  originDate,
  originStart,
  originEnd,
  previewDate,
  previewStart,
  previewEnd
}
```

Persist only after a successful pointer-up commit.

### Optimistic persistence

On a completed direct manipulation:

1. keep a copy of the original task values;
2. update in-memory state;
3. re-render immediately;
4. persist to Firestore;
5. if persistence fails, restore original values;
6. show a compact error toast.

## Overlap and conflict handling

Use an interval-overlap layout algorithm to place simultaneous blocks side by side.

Conflict is a semantic state, not only a layout condition.

A flexible task conflicting with a fixed event should receive a subtle warning treatment plus an accessible explanation, for example:

`Overlaps Maths class 4:30–5:00 PM`.

Do not fill an entire task red. Use a warning edge/icon plus explanatory text.

## Current time

Show a thin accent current-time line across the visible day column(s), with a small time label where appropriate.

Update it on a timer without causing a full calendar re-render every minute.

## Task metadata extensions

Extend existing task objects with optional fields. Existing tasks without these fields remain valid.

Recommended fields:

```js
{
  dueDate: null,
  estimatedMinutes: null,
  priority: null,
  notes: '',
  reminderMinutes: null,
  scheduleLocked: false,
  schedulingPreference: null
}
```

### Semantics

- `date`, `startTime`, `endTime`: when the user plans to work on the task;
- `dueDate`: when the task must be complete;
- `estimatedMinutes`: expected work duration used for unscheduled planning;
- `scheduleLocked`: whether AI should avoid automatically proposing movement;
- `schedulingPreference`: optional future constraints such as preferred time of day.

When an unscheduled task has no estimate, use 60 minutes as the initial scheduling duration.

## Selection and inspector state

The Schedule workspace maintains one selected item at a time:

```js
{
  type: 'task' | 'event' | null,
  id: string | null
}
```

Selection opens the inspector on sufficiently wide screens.

Clicking empty calendar space clears selection.

Pressing Escape clears transient selection/menus and cancels active drag/resize interactions.

## Keyboard accessibility

Required keyboard affordances:

- Tab reaches toolbar controls, task rows, calendar blocks and inspector actions;
- Enter/Space selects a focused task/event;
- Escape closes transient UI or cancels an in-progress manipulation;
- provide a `Move to…`/Reschedule inspector control as a keyboard alternative to drag-and-drop;
- provide explicit duration input as a keyboard alternative to resize.

Visible focus states must not rely on colour alone.

Accessible labels should describe block identity and time, for example:

`Science revision, Tuesday 4 PM to 5:30 PM, flexible task`.

## Responsive behaviour

The product is desktop-first.

### Large desktop

At roughly 1440px and above:

- global Kairos sidebar may remain expanded;
- Unscheduled panel remains open;
- 3-Day calendar remains dominant;
- inspector can open beside the calendar.

### Common laptop width

Around 1280px:

- the global Kairos sidebar may auto-collapse on Schedule;
- Unscheduled remains visible;
- inspector stays closed until selection;
- opening inspector may collapse Unscheduled to a rail.

### Narrow desktop

When width becomes constrained:

- collapse Unscheduled first;
- inspector becomes a right overlay sheet;
- if 3-Day no longer remains usable, switch/fallback to Day rather than shrinking everything.

Week remains available but may require horizontal scrolling at narrower widths.

## AI scheduling

AI should act on the schedule without becoming a giant embedded chatbot.

### Entry point

The toolbar contains a compact `Plan` action.

The workspace may also show rare, concise prompts such as:

`4 tasks are unscheduled before tomorrow. Plan them?`

### Proposal workflow

AI scheduling changes must not be permanently applied immediately.

Flow:

1. user invokes Plan or accepts a compact planning prompt;
2. Kairos generates proposed task mutations;
3. proposals are stored only in temporary client state;
4. proposed blocks render as translucent/dashed calendar blocks;
5. user reviews what will change and why;
6. user chooses Apply, Change or Dismiss;
7. Apply commits approved mutations in one plan update where practical.

### Proposal representation

Example proposal:

```js
{
  taskId,
  from: { date, startTime, endTime },
  to: { date, startTime, endTime },
  reason,
  conflictIds: []
}
```

### Review UI

Show a slim review strip, not a full chat pane:

`Kairos proposes 3 changes`

Actions:

- Apply all;
- Review;
- Dismiss.

Selecting a proposed block opens inspector details explaining:

- what will change;
- why Kairos chose that slot;
- conflicts avoided or constraints considered.

## AI execution architecture

The existing AI actions layer currently performs plan mutations directly.

Schedule proposals require a preview layer before mutation:

```text
AI request
  -> proposed actions
  -> client proposal state
  -> preview blocks
  -> user approval
  -> apply approved changes
  -> Firestore write
```

AI proposal generation must not call the existing mutation executor until the user approves the proposed change set.

## Component boundaries

The Schedule code should no longer grow as one compressed renderer inside `app.js`.

Create a dedicated module for the workspace, proposed as:

`/schedule-workspace.js`

Responsibilities:

- schedule workspace state;
- view range calculations;
- calendar rendering;
- backlog rendering;
- inspector rendering;
- pointer interaction coordination;
- overlap layout;
- AI proposal rendering;
- current-time indicator.

The module should receive data/access callbacks from the existing app rather than owning Firebase directly where possible.

Suggested public contract:

```js
initScheduleWorkspace({
  getBoards,
  getScheduleEvents,
  savePlan,
  openRecurringEventEditor,
  requestAiPlan,
  onTaskComplete
})
```

Keep plan persistence in existing app/Firebase code initially. The workspace manages interaction, not authentication or Firestore ownership.

## HTML structure

Replace the current Schedule page markup with a stable shell:

```html
<div id="schedule-page" class="page-view schedule-page">
  <div id="schedule-toolbar" class="schedule-toolbar"></div>
  <div class="schedule-workspace-shell">
    <aside id="schedule-backlog" class="schedule-backlog"></aside>
    <section id="schedule-calendar" class="schedule-calendar"></section>
    <aside id="schedule-inspector" class="schedule-inspector" hidden></aside>
  </div>
  <div id="schedule-ai-review" class="schedule-ai-review" hidden></div>
</div>
```

## Styling architecture

Remove the existing appended Schedule 2.0 CSS blocks rather than layering another override set over them.

Schedule-specific styles should live in a dedicated `schedule-workspace.css` file imported from `app.html`.

The Schedule page must override the generic content constraint:

```css
#schedule-page.page-view {
  max-width: none;
}
```

The calendar should consume available width and height inside the existing application shell.

## Loading, empty and error states

### Loading

Use subtle calendar skeletons or a compact toolbar progress state. Do not use a large card spinner.

### No unscheduled work

Show quiet inline text in the left panel:

`No unscheduled tasks.`

Do not use a large success illustration.

### Empty day

Leave the timeline visually empty. Do not place a large empty-state card in the calendar.

### Save error

Restore the prior task state and show a compact toast:

`Couldn't save your change. Restored the previous time.`

## Important visual states

Implement explicit styles for:

- normal task;
- hover;
- selected;
- dragging;
- resizing;
- completed;
- overdue;
- conflicting;
- AI-proposed;
- fixed event;
- loading;
- error;
- collapsed backlog;
- collapsed inspector/overlay inspector.

Colour must not be the only differentiator.

## Rollout phases

### Phase 1 — Workspace foundation

Implement:

- full-width Schedule shell;
- compact toolbar;
- Day / 3-Day / Week range logic;
- left Unscheduled panel;
- timeline rendering;
- task/fixed-event distinction;
- selection;
- contextual inspector shell;
- responsive collapse rules.

Do not implement AI proposals yet.

### Phase 2 — Direct manipulation

Implement:

- Pointer Event move;
- Pointer Event resize;
- cross-day dragging;
- backlog-to-calendar scheduling;
- calendar-to-backlog unscheduling;
- 15-minute snapping;
- overlap layout;
- current-time indicator;
- optimistic save/rollback.

### Phase 3 — Rich scheduling metadata

Add:

- due date;
- estimated duration;
- priority;
- notes;
- reminders;
- deadline lane;
- richer inspector editing.

### Phase 4 — AI proposal planning

Add:

- Plan action;
- proposal generation;
- temporary proposal state;
- preview blocks;
- reason/explanation;
- Apply / Change / Dismiss;
- conflict-aware planning;
- approved batch persistence.

### Phase 5 — Information architecture cleanup

Evaluate removal of the standalone Calendar navigation item after Schedule proves stable.

Potentially add Month as a Schedule view rather than retaining a separate Calendar surface.

## Testing requirements

### Functional

Verify:

- existing tasks and schedule events render without migration;
- Day, 3-Day and Week ranges are correct across month/year boundaries;
- dragging preserves duration;
- resizing updates duration;
- dragging across days updates date;
- unscheduling clears only scheduled date/time and preserves deadline metadata;
- overlapping blocks remain readable;
- fixed events cannot accidentally receive flexible-task interactions;
- completed tasks retain understandable visual state;
- save failures roll back local changes;
- inspector edits update the same underlying task object used by Boards;
- recurring event editing still works.

### Accessibility

Verify:

- keyboard navigation reaches all major controls;
- drag-only actions have keyboard alternatives;
- focus rings are visible;
- selected/conflict/proposal states are understandable without colour;
- reduced-motion preference disables unnecessary animation.

### Responsive

Test at approximately:

- 1280px desktop/laptop;
- 1440px desktop;
- 1920px desktop.

Verify panel-collapse priority and calendar readability.

### Regression

Verify:

- Boards still render and edit tasks;
- existing Calendar page continues to work during rollout;
- AI actions continue to mutate the same plan data;
- Firestore plan loading/saving remains backward-compatible;
- theme accent changes propagate into Schedule.

## Non-goals for the first implementation plan

The initial Schedule 3.0 implementation does not include:

- external Google/Apple/Outlook calendar sync;
- mobile Schedule UI;
- collaborative calendars;
- multiple task blocks for one task;
- automatic recurrence rules for tasks;
- a full Month view replacement;
- background autonomous AI rescheduling without approval.

These can be designed later without blocking the core workspace.

## Definition of success

The redesign succeeds when a user can open Schedule and immediately:

1. understand what work is scheduled;
2. see what remains unscheduled;
3. understand the next several days without excessive density;
4. move and resize flexible work directly;
5. distinguish fixed commitments from flexible tasks;
6. inspect and edit details without leaving Schedule;
7. understand conflicts;
8. ask Kairos to propose a plan without surrendering control;
9. use the product comfortably at common laptop widths;
10. recognise the screen as Kairos rather than a generic calendar clone.
