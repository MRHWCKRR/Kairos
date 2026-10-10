import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../boards-recurrence.js',import.meta.url),'utf8');

test('Boards decorates one stored recurring series row without generating occurrence rows',()=>{
  assert.match(source,/getBoards/);
  assert.match(source,/recurrence\?\.enabled/);
  assert.doesNotMatch(source,/generateTaskOccurrences/);
  assert.match(source,/formatRecurrenceSummary/);
  assert.match(source,/nextOccurrenceDate/);
  assert.match(source,/Next:/);
  assert.match(source,/data-recurrence-series-meta/);
});

test('Boards does not expose whole-series completion as an ordinary checkbox action',()=>{
  assert.match(source,/checkbox\.disabled\s*=\s*true/);
  assert.match(source,/Recurring series/);
});

test('Boards recurring series can open the normal rich task editor',()=>{
  assert.match(source,/data-edit-recurrence/);
  assert.match(source,/schedule-page/);
  assert.match(source,/selectItem\?\.\('task'/);
});
