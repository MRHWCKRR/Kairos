import test from 'node:test';
import assert from 'node:assert/strict';
import { setOccurrenceStatus, applyOccurrenceOverride, splitRecurringSeries } from '../recurrence-utils.js';

function baseTask(){
  return {id:'series-a',title:'Revision',completed:false,priority:'low',estimatedMinutes:60,notes:'base',recurrence:{enabled:true,frequency:'weekly',interval:1,weekdays:[3],startDate:'2026-10-07',endType:'never',endDate:null,count:null,mode:'flexible',exceptions:{'2026-10-07':{status:'completed',completedAt:'old'},'2026-10-14':{status:'skipped',skippedAt:'old'},'2026-10-28':{override:{priority:'high'}}}}};
}

test('sets status on one occurrence without completing the base series',()=>{
  const original=baseTask();
  const completed=setOccurrenceStatus(original,'2026-10-21','completed','2026-10-21T18:00:00Z');
  assert.equal(completed.completed,false);
  assert.equal(completed.recurrence.exceptions['2026-10-21'].status,'completed');
  assert.equal(completed.recurrence.exceptions['2026-10-21'].completedAt,'2026-10-21T18:00:00Z');
  assert.equal(completed.recurrence.exceptions['2026-10-14'].status,'skipped');
  assert.equal(original.recurrence.exceptions['2026-10-21'],undefined);
  const skipped=setOccurrenceStatus(original,'2026-10-21','skipped','2026-10-21T18:00:00Z');
  assert.equal(skipped.recurrence.exceptions['2026-10-21'].skippedAt,'2026-10-21T18:00:00Z');
  const deleted=setOccurrenceStatus(original,'2026-10-21','deleted','2026-10-21T18:00:00Z');
  assert.equal(deleted.recurrence.exceptions['2026-10-21'].status,'deleted');
});

test('stores only effective occurrence override changes and preserves status metadata',()=>{
  const original=baseTask();
  const changed=applyOccurrenceOverride(original,'2026-10-14',{title:'Revision',priority:'high',notes:'base',date:'2026-10-15',startTime:'16:00',endTime:'17:00'});
  assert.deepEqual(changed.recurrence.exceptions['2026-10-14'].override,{priority:'high',date:'2026-10-15',startTime:'16:00',endTime:'17:00'});
  assert.equal(changed.recurrence.exceptions['2026-10-14'].status,'skipped');
  assert.equal(original.recurrence.exceptions['2026-10-14'].override,undefined);
});

test('splits this-and-future into historical original and a clean new series',()=>{
  const task=baseTask();
  const {originalTask,newTask}=splitRecurringSeries(task,'2026-10-21',{title:'Revision v2',priority:'high',recurrence:{frequency:'weekly',interval:1,weekdays:[4],mode:'flexible'}},'series-b');
  assert.equal(originalTask.id,'series-a');
  assert.equal(originalTask.recurrence.endType,'date');
  assert.equal(originalTask.recurrence.endDate,'2026-10-20');
  assert.equal(originalTask.recurrence.exceptions['2026-10-07'].status,'completed');
  assert.equal(originalTask.recurrence.exceptions['2026-10-14'].status,'skipped');
  assert.equal(originalTask.recurrence.exceptions['2026-10-28'],undefined);
  assert.equal(newTask.id,'series-b');
  assert.equal(newTask.title,'Revision v2');
  assert.equal(newTask.priority,'high');
  assert.equal(newTask.recurrence.startDate,'2026-10-21');
  assert.deepEqual(newTask.recurrence.weekdays,[4]);
  assert.deepEqual(newTask.recurrence.exceptions,{});
  assert.deepEqual(task.recurrence.exceptions['2026-10-28'].override,{priority:'high'});
});
