import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui=readFileSync(new URL('../schedule-recurrence-ui.js',import.meta.url),'utf8');
const create=readFileSync(new URL('../schedule-task-create.js',import.meta.url),'utf8');
const inspector=readFileSync(new URL('../schedule-inspector.js',import.meta.url),'utf8');

test('shared recurrence UI exposes the full approved repeat controls',()=>{
  for(const text of ['Never','Daily','Every weekday','Weekly','Monthly','Yearly','Custom'])assert.match(ui,new RegExp(text));
  assert.match(ui,/data-recurrence-interval/);
  assert.match(ui,/data-recurrence-unit/);
  assert.match(ui,/data-recurrence-weekday/);
  assert.match(ui,/data-recurrence-monthly-mode/);
  assert.match(ui,/data-recurrence-position/);
  assert.match(ui,/data-recurrence-year-month/);
  assert.match(ui,/data-recurrence-mode/);
  assert.match(ui,/On date/);
  assert.match(ui,/After N occurrences/);
  assert.match(ui,/data-recurrence-summary/);
});

test('creation and inspector share recurrence markup binding and parsing',()=>{
  for(const source of [create,inspector]){
    assert.match(source,/recurrenceFieldsMarkup/);
    assert.match(source,/bindRecurrenceFields/);
    assert.match(source,/readRecurrenceFields/);
  }
  assert.match(create,/task\.recurrence|recurrence:/);
  assert.match(inspector,/task\.recurrence/);
});

test('recurrence UI provides a reusable edit-scope dialog contract',()=>{
  assert.match(ui,/showRecurrenceScopeDialog/);
  assert.match(ui,/This occurrence/);
  assert.match(ui,/This and future/);
  assert.match(ui,/Entire series/);
  assert.match(ui,/occurrence/);
  assert.match(ui,/future/);
  assert.match(ui,/series/);
  assert.match(ui,/cancel/);
});
