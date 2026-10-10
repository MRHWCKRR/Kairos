import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ai=readFileSync(new URL('../schedule-ai.js',import.meta.url),'utf8');
const transforms=readFileSync(new URL('../build-transforms.js',import.meta.url),'utf8');

test('AI planning expands recurring series into all pending occurrence-aware candidates and commitments',()=>{
  assert.match(ai,/generateTaskOccurrencesThrough/);
  assert.match(ai,/occurrenceId/);
  assert.match(ai,/seriesId/);
  assert.match(ai,/occurrenceDate/);
  assert.match(ai,/mode==='fixed'/);
  assert.match(ai,/isOverdue/);
  assert.match(ai,/scheduledCommitments/);
});

test('AI validator addresses recurring proposals by occurrence ID instead of base series ID',()=>{
  assert.match(ai,/validationTaskMap/);
  assert.match(ai,/splitOccurrenceId/);
  assert.match(ai,/taskId.*occurrenceId|occurrenceId.*taskId/s);
  assert.match(ai,/validateScheduleProposals/);
});

test('applying an AI proposal to a recurring occurrence stores an exception override',()=>{
  assert.match(ai,/applyOccurrenceOverride/);
  assert.match(ai,/persistOccurrenceProposal/);
  assert.match(ai,/occurrenceDate/);
  assert.match(ai,/recurrence/);
});

test('AI bridge validates occurrence candidates supplied by structured context',()=>{
  assert.match(transforms,/context\.tasks/);
  assert.match(transforms,/context\.scheduledCommitments/);
  assert.match(transforms,/occurrenceId/);
  assert.match(transforms,/occurrenceDate/);
  assert.match(transforms,/Recurring occurrence/);
});
