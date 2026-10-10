import test from 'node:test';
import assert from 'node:assert/strict';
import {
  taskDurationMinutes,
  preserveScheduledDuration,
  clearScheduledFields,
  validateScheduleProposals
} from '../schedule-utils.js';

test('unscheduling preserves prior duration separately from explicit estimate', () => {
  const task={id:'science',startTime:'14:07',endTime:'15:42',estimatedMinutes:null};
  preserveScheduledDuration(task);
  clearScheduledFields(task);
  assert.equal(task.lastScheduledMinutes,95);
  assert.equal(task.estimatedMinutes,null);
});

test('planning duration falls back to last scheduled duration when no explicit estimate exists', () => {
  assert.equal(taskDurationMinutes({lastScheduledMinutes:95}),95);
  assert.equal(taskDurationMinutes({estimatedMinutes:45,lastScheduledMinutes:95}),45);
});

test('AI proposals use the task planned duration instead of trusting the model end time', () => {
  const task={id:'essay',estimatedMinutes:45,scheduleLocked:false};
  const raw=[{taskId:'essay',to:{date:'2026-10-12',startTime:'16:00',endTime:'16:05'},reason:'Free after school'}];
  const result=validateScheduleProposals(raw,new Map([['essay',task]]),[],{minDate:'2026-10-10'});
  assert.equal(result.length,1);
  assert.deepEqual(result[0].to,{date:'2026-10-12',startTime:'16:00',endTime:'16:45'});
});

test('AI proposals preserve an existing scheduled task duration when rescheduling it', () => {
  const task={id:'science',date:'2026-10-10',startTime:'15:00',endTime:'16:30',scheduleLocked:false};
  const raw=[{taskId:'science',to:{date:'2026-10-12',startTime:'17:00',endTime:'17:15'}}];
  const result=validateScheduleProposals(raw,new Map([['science',task]]),[],{minDate:'2026-10-10'});
  assert.deepEqual(result[0].to,{date:'2026-10-12',startTime:'17:00',endTime:'18:30'});
});

test('AI proposals are rejected when the enforced task duration would cross midnight', () => {
  const task={id:'essay',estimatedMinutes:90,scheduleLocked:false};
  const raw=[{taskId:'essay',to:{date:'2026-10-12',startTime:'23:00',endTime:'23:15'}}];
  assert.deepEqual(validateScheduleProposals(raw,new Map([['essay',task]]),[],{minDate:'2026-10-10'}),[]);
});
