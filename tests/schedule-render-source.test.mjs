import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../schedule-workspace.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../schedule-ai.js', import.meta.url), 'utf8');
const interactions = readFileSync(new URL('../schedule-interactions.js', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../schedule-inspector.js', import.meta.url), 'utf8');
const responsive = readFileSync(new URL('../schedule-responsive.js', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../schedule-workspace.css', import.meta.url), 'utf8');
const inspectorCss = readFileSync(new URL('../schedule-inspector.css', import.meta.url), 'utf8');
const interactionCss = readFileSync(new URL('../schedule-interactions.css', import.meta.url), 'utf8');

test('calendar task blocks use shared pixel geometry', () => {
  assert.match(workspace, /blockGeometry/);
  assert.match(workspace, /top:\$\{geometry\.topPx\}px/);
  assert.match(workspace, /height:\$\{geometry\.heightPx\}px/);
  assert.doesNotMatch(workspace, /Math\.max\(20,\(item\.endMin-item\.startMin\)\/DAY_MINUTES\*100\)/);
});

test('AI proposal blocks use shared pixel geometry', () => {
  assert.match(ai, /blockGeometry/);
  assert.match(ai, /style\.top=`\$\{geometry\.topPx\}px`/);
  assert.match(ai, /style\.height=`\$\{geometry\.heightPx\}px`/);
  assert.doesNotMatch(ai, /Math\.max\(22,\(end-start\)\/1440\*100\)/);
});

test('calendar re-renders preserve the current vertical scroll position', () => {
  assert.match(workspace, /scrollTop:/);
  assert.match(workspace, /existingScroller\?\.scrollTop/);
  assert.match(workspace, /scroller\.scrollTop=state\.scrollTop/);
  assert.match(workspace, /addEventListener\('scroll'/);
});

test('Schedule responsive code never controls the global sidebar',()=>{
  assert.doesNotMatch(responsive,/sidebarAutoCollapsed/);
  assert.doesNotMatch(responsive,/classList\.(?:add|remove)\('collapsed'\)/);
});

test('manual drag and resize use one-minute precision with a visible placement preview',()=>{
  assert.match(interactions,/SNAP_MINUTES=1/);
  assert.match(interactions,/preserveScheduledDuration/);
  assert.match(interactions,/ks-drag-preview/);
  assert.match(interactionCss,/\.ks-drag-preview/);
});

test('task inspector exposes Unschedule, task color and a functional hidden move panel',()=>{
  assert.match(inspector,/>Unschedule<\/button>/);
  assert.match(inspector,/name="color" type="color"/);
  assert.match(inspector,/preserveScheduledDuration\(task\)/);
  assert.match(inspectorCss,/\.ks-move-fields\[hidden\]\{display:none!important\}/);
});

test('Filter is a real toolbar control with flexible task, event and completed toggles',()=>{
  assert.match(workspace,/data-filter-key="tasks"/);
  assert.match(workspace,/data-filter-key="events"/);
  assert.match(workspace,/data-filter-key="completed"/);
  assert.match(workspaceCss,/\.ks-filter-menu/);
});

test('calendar header and day columns share one scrolling canvas and midnight is inset',()=>{
  assert.match(workspace,/ks-timeline-scroll[^`]*ks-calendar-content[^`]*ks-calendar-head[^`]*ks-calendar-body/s);
  assert.match(workspace,/h===0\?8:h\*HOUR_HEIGHT/);
  assert.match(workspaceCss,/\.ks-hour-label\.is-midnight\{transform:none\}/);
});

test('short task blocks prioritize the title instead of the time text',()=>{
  assert.match(workspace,/is-compact/);
  assert.match(workspaceCss,/\.ks-block\.is-compact \.ks-block-time\{display:none\}/);
});

test('custom task colors feed task blocks, backlog markers and AI previews',()=>{
  assert.match(workspace,/--ks-task-color/);
  assert.match(workspaceCss,/var\(--ks-task-color,var\(--accent-glow\)\)/);
  assert.match(ai,/--ks-task-color/);
});

test('Plan loading state survives workspace rerenders and validates against currentDate',()=>{
  assert.match(ai,/function syncPlanButton/);
  assert.match(ai,/aria-busy/);
  assert.match(ai,/minDate:context\.currentDate/);
  assert.match(ai,/notes:String\(task\.notes\|\|''\)/);
});

test('Schedule workspace uses themed thin scrollbars',()=>{
  assert.match(workspaceCss,/scrollbar-width:thin/);
  assert.match(workspaceCss,/::-webkit-scrollbar-thumb/);
});
