import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const data=()=>({userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Science',date:'2026-10-15',startTime:'13:00',endTime:'14:00',scheduleLocked:true}]}]}]});
test('AI creates, updates and removes the same reminderMinutes field as the schedule editor',async()=>{
  const f=await plannerFixture(data());
  await f.execute({type:'set_task_reminder',args:{taskId:'t',minutesBefore:30}});
  assert.equal(f.data().boards[0].sections[0].tasks[0].reminderMinutes,30);
  await f.execute({type:'set_task_reminder',args:{taskId:'t',minutesBefore:10}});
  assert.equal(f.data().boards[0].sections[0].tasks[0].reminderMinutes,10);
  await f.execute({type:'remove_task_reminder',args:{taskId:'t'}});
  assert.equal(f.data().boards[0].sections[0].tasks[0].reminderMinutes,null);
});
test('invalid lead times and ambiguous targets never save reminders',async()=>{
  const f=await plannerFixture(data());
  for(const minutesBefore of [0,-1,1.5,10081,'30'])await assert.rejects(f.execute({type:'set_task_reminder',args:{taskId:'t',minutesBefore}}),/invalid/i);
  await assert.rejects(f.execute({type:'set_task_reminder',args:{taskId:'missing',title:'Science',minutesBefore:15}}),/not found/i);
  assert.equal(f.writes.length,0);
});
test('reminder retries reuse the saved action receipt without duplicate writes',async()=>{
  const f=await plannerFixture(data(),{failAfterCommit:true}),action={type:'set_task_reminder',args:{taskId:'t',minutesBefore:15}},options={operationId:'reminder-retry',ownerId:'one',planId:'plan'};
  await assert.rejects(f.execute(action,options),/lost/);
  await f.execute(action,options);
  assert.equal(f.writes.length,1);
});
