import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui=readFileSync(new URL('../schedule-recurrence-ui.js',import.meta.url),'utf8');
const create=readFileSync(new URL('../schedule-task-create.js',import.meta.url),'utf8');
const inspector=readFileSync(new URL('../schedule-inspector.js',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../schedule-workspace.js',import.meta.url),'utf8');
const interactions=readFileSync(new URL('../schedule-interactions.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../schedule-workspace.css',import.meta.url),'utf8');

test('shared recurrence UI exposes the full approved repeat controls',()=>{
  for(const text of ['Never','Daily','Every weekday','Weekly','Monthly','Yearly','Custom'])assert.match(ui,new RegExp(text));
  assert.match(ui,/data-recurrence-interval/);assert.match(ui,/data-recurrence-unit/);assert.match(ui,/data-recurrence-weekday/);assert.match(ui,/data-recurrence-monthly-mode/);assert.match(ui,/data-recurrence-position/);assert.match(ui,/data-recurrence-year-month/);assert.match(ui,/data-recurrence-mode/);assert.match(ui,/On date/);assert.match(ui,/After N occurrences/);assert.match(ui,/data-recurrence-summary/);
});

test('creation and inspector share recurrence markup binding and parsing',()=>{
  for(const source of [create,inspector]){assert.match(source,/recurrenceFieldsMarkup/);assert.match(source,/bindRecurrenceFields/);assert.match(source,/readRecurrenceFields/)}
  assert.match(create,/task\.recurrence|recurrence:/);assert.match(inspector,/task\.recurrence/);
});

test('editing a base recurring series preserves completed skipped and overridden occurrence history',()=>{
  assert.match(inspector,/recurrence\.exceptions\s*=\s*structuredClone\(task\.recurrence\?\.exceptions\|\|\{\}\)/);
});

test('recurrence UI provides a reusable edit-scope dialog contract',()=>{
  assert.match(ui,/showRecurrenceScopeDialog/);assert.match(ui,/This occurrence/);assert.match(ui,/This and future/);assert.match(ui,/Entire series/);assert.match(ui,/occurrence/);assert.match(ui,/future/);assert.match(ui,/series/);assert.match(ui,/cancel/);
});

test('recurring occurrence inspector exposes occurrence-only complete and skip actions',()=>{
  assert.match(inspector,/selected\?\.type[^\n]*occurrence|type==='occurrence'/);assert.match(inspector,/Skip occurrence/);assert.match(inspector,/data-occurrence-complete/);assert.match(inspector,/data-occurrence-skip/);assert.match(inspector,/setOccurrenceStatus/);assert.match(inspector,/occurrenceDate/);
});

test('editing or deleting a recurring occurrence asks for one of three scopes',()=>{
  assert.match(inspector,/showRecurrenceScopeDialog/);assert.match(inspector,/scope==='occurrence'/);assert.match(inspector,/scope==='future'/);assert.match(inspector,/scope==='series'/);assert.match(inspector,/splitRecurringSeries/);assert.match(inspector,/applyOccurrenceOverride/);assert.match(inspector,/persistPlan/);
});

test('Schedule expands recurring series into virtual occurrence blocks instead of base task blocks',()=>{
  assert.match(workspace,/generateTaskOccurrences/);
  assert.match(workspace,/RECURRENCE_LOOKBACK_DAYS/);
  assert.match(workspace,/recurrence\?\.enabled/);
  assert.match(workspace,/data-occurrence-id/);
  assert.match(workspace,/data-series-id/);
  assert.match(workspace,/data-occurrence-date/);
  assert.match(workspace,/↻/);
  assert.match(workspace,/status==='pending'/);
  assert.match(workspace,/displayDate/);
});

test('Schedule occurrence selection preserves series and logical occurrence identity',()=>{
  assert.match(workspace,/type:'occurrence'/);
  assert.match(workspace,/seriesId/);
  assert.match(workspace,/occurrenceId/);
  assert.match(workspace,/occurrenceDate/);
  assert.match(workspace,/isOverdue/);
  assert.match(css,/ks-recurring/);
});

test('dragging or resizing one recurring occurrence writes an occurrence override',()=>{
  assert.match(interactions,/applyOccurrenceOverride/);
  assert.match(interactions,/data-occurrence-id/);
  assert.match(interactions,/occurrenceDate/);
  assert.match(interactions,/persistOccurrenceMutation/);
  assert.doesNotMatch(interactions,/Object\.assign\(task,next\).*occurrence/);
});
