import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const transforms=readFileSync(new URL('../build-transforms.js',import.meta.url),'utf8');
const creator=readFileSync(new URL('../schedule-task-create.js',import.meta.url),'utf8');

test('AI planning retries once when the model returns malformed proposal JSON',()=>{
  assert.match(transforms,/parseScheduleAiPayload/);
  assert.match(transforms,/schedule-ai-parser\.js\?v=/);
  assert.match(transforms,/retry/i);
  assert.doesNotMatch(transforms,/parsed = JSON\.parse\(match\[0\]\);/);
});

test('Schedule task creator replaces recurring Add event with Add task',()=>{
  assert.match(creator,/data-add-task/);
  assert.match(creator,/\+ Task/);
  assert.match(creator,/data-event/);
  assert.match(creator,/cloneNode\(true\)/);
});

test('Schedule task creator supports placement and rich task metadata before persistence',()=>{
  assert.match(creator,/data-ks-create-task/);
  assert.match(creator,/name="board"/);
  assert.match(creator,/name="section"/);
  assert.match(creator,/name="title"/);
  assert.match(creator,/name="date"/);
  assert.match(creator,/name="start"/);
  assert.match(creator,/name="duration"/);
  assert.match(creator,/name="priority"/);
  assert.match(creator,/name="estimate"/);
  assert.match(creator,/name="preference"/);
  assert.match(creator,/name="color"/);
  assert.match(creator,/name="notes"/);
  assert.match(creator,/targetSection\.tasks\.push\(task\)/);
  assert.match(creator,/persistPlan/);
});
