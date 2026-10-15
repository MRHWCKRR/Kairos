import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ai=readFileSync(new URL('../schedule-ai.js',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../schedule-workspace.js',import.meta.url),'utf8');

test('Plan targets unscheduled tasks by default while still exposing occupied scheduled tasks',()=>{
  assert.match(ai,/targetTaskId\?[^:]+:\s*\(!task\.date\|\|!task\.startTime\)/);
  assert.match(ai,/scheduledCommitments/);
});

test('proposal review mode can focus each reviewed proposal in the calendar',()=>{
  assert.match(ai,/function focusProposal\(/);
  assert.match(ai,/data-prev-proposal/);
  assert.match(ai,/data-next-proposal/);
  assert.match(workspace,/focusDateTime/);
});

test('Change edits a proposal in place instead of removing it',()=>{
  const changeBody=ai.match(/function changeProposal\(index\)\{([\s\S]*?)\n\}/)?.[1]||'';
  assert.ok(changeBody,'changeProposal function should exist');
  assert.doesNotMatch(changeBody,/splice\(index,1\)/);
  assert.match(ai,/data-proposal-date/);
  assert.match(ai,/data-proposal-start/);
  assert.match(ai,/data-save-proposal-change/);
});
