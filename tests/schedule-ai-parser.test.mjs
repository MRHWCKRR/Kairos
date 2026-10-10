import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleAiPayload } from '../schedule-ai-parser.js';

test('parses strict planner JSON',()=>{
  assert.deepEqual(parseScheduleAiPayload('{"proposals":[]}'),{proposals:[]});
});

test('parses fenced planner JSON with surrounding prose',()=>{
  const parsed=parseScheduleAiPayload('Here is the plan:\n```json\n{"proposals":[{"taskId":"a"}]}\n```');
  assert.equal(parsed.proposals[0].taskId,'a');
});

test('repairs common harmless JSON formatting slips without executing code',()=>{
  const parsed=parseScheduleAiPayload("{proposals: [{taskId: 'a', reason: 'ok',}],}");
  assert.equal(parsed.proposals[0].taskId,'a');
  assert.equal(parsed.proposals[0].reason,'ok');
});

test('throws a planner-format error when content cannot be safely repaired',()=>{
  assert.throws(()=>parseScheduleAiPayload('{ definitely not recoverable'),/planner-format/);
});
