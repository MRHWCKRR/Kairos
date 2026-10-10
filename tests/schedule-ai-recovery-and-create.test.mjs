import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const transforms=readFileSync(new URL('../build-transforms.js',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../schedule-workspace.js',import.meta.url),'utf8');
const inspector=readFileSync(new URL('../schedule-inspector.js',import.meta.url),'utf8');

test('AI planning retries once when the model returns malformed proposal JSON',()=>{
  assert.match(transforms,/parseScheduleAiPayload/);
  assert.match(transforms,/schedule-ai-parser\.js\?v=/);
  assert.match(transforms,/retry/i);
  assert.doesNotMatch(transforms,/parsed = JSON\.parse\(match\[0\]\);/);
});

test('Schedule toolbar exposes Add task instead of recurring Add event',()=>{
  assert.match(workspace,/data-add-task/);
  assert.match(workspace,/\+ Task/);
  assert.match(workspace,/kairos-schedule-create-task/);
  assert.doesNotMatch(workspace,/data-event>\+ Event/);
});

test('Schedule task creator supports placement and rich task metadata before persistence',()=>{
  assert.match(inspector,/kairos-schedule-create-task/);
  assert.match(inspector,/data-ks-create-task/);
  assert.match(inspector,/name="board"/);
  assert.match(inspector,/name="section"/);
  assert.match(inspector,/name="title"/);
  assert.match(inspector,/name="date"/);
  assert.match(inspector,/name="start"/);
  assert.match(inspector,/name="duration"/);
  assert.match(inspector,/name="priority"/);
  assert.match(inspector,/name="estimate"/);
  assert.match(inspector,/name="preference"/);
  assert.match(inspector,/name="color"/);
  assert.match(inspector,/name="notes"/);
  assert.match(inspector,/targetSection\.tasks\.push\(task\)/);
  assert.match(inspector,/persistPlan/);
});
