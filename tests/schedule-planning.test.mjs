import test from 'node:test';
import assert from 'node:assert/strict';
import {
  taskDurationMinutes,
  preserveScheduledDuration,
  clearScheduledFields,
  validateScheduleProposals
} from '../schedule-utils.js';

test('proposal previous schedule comes from workspace state, not model claims', () => {
  const task = { id: 'essay', date: null, startTime: null, endTime: null, estimatedMinutes: 45 };
  const proposals = [{ taskId: 'essay', from: { date: '2026-10-12', startTime: '09:00', endTime: '09:45' }, to: { date: '2026-10-12', startTime: '11:00', endTime: '11:45' } }];
  const result = validateScheduleProposals(proposals, new Map([['essay', task]]), [], { minDate: '2026-10-10' });
  assert.deepEqual(result[0].from, { date: null, startTime: null, endTime: null });
});

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

test('rejecting a move does not free its original slot for another proposal',()=>{
  const tasks=new Map([
    ['a',{id:'a',date:'2026-10-13',startTime:'08:00',endTime:'09:00'}],
    ['b',{id:'b',date:'2026-10-13',startTime:'10:00',endTime:'11:00'}],
    ['fixed',{id:'fixed',date:'2026-10-13',startTime:'12:00',endTime:'13:00',scheduleLocked:true}]
  ]);
  const raw=[{taskId:'a',to:{date:'2026-10-13',startTime:'10:00',endTime:'11:00'}},{taskId:'b',to:{date:'2026-10-13',startTime:'12:00',endTime:'13:00'}}];
  assert.deepEqual(validateScheduleProposals(raw,tasks,[],{minDate:'2026-10-13'}),[]);
});

test('day-change proposals respect their date boundary and explicitly unavailable time',()=>{
  const tasks=new Map([['a',{id:'a',estimatedMinutes:60}]]);
  const constraints={minDate:'2026-10-13',maxDate:'2026-10-13',blockedWindows:[{date:'2026-10-13',startTime:'14:00',endTime:'15:00'}]};
  assert.deepEqual(validateScheduleProposals([{taskId:'a',to:{date:'2026-10-14',startTime:'10:00',endTime:'11:00'}}],tasks,[],constraints),[]);
  assert.deepEqual(validateScheduleProposals([{taskId:'a',to:{date:'2026-10-13',startTime:'14:30',endTime:'15:30'}}],tasks,[],constraints),[]);
});

test('a one-hour proposal can finish exactly at midnight without crossing into the next day',()=>{
  const tasks=new Map([['a',{id:'a',estimatedMinutes:60}]]);
  const raw=[{taskId:'a',to:{date:'2026-10-13',startTime:'23:00',endTime:'00:00'}}];
  const result=validateScheduleProposals(raw,tasks,[],{minDate:'2026-10-13'});
  assert.equal(result.length,1);assert.equal(result[0].to.endTime,'00:00');
});

test('a retained task with a start and estimate still reserves time when its end is missing',()=>{
  const tasks=new Map([['a',{id:'a',estimatedMinutes:30}],['keep',{id:'keep',date:'2026-10-13',startTime:'14:00',estimatedMinutes:60}]]);
  assert.deepEqual(validateScheduleProposals([{taskId:'a',to:{date:'2026-10-13',startTime:'14:30',endTime:'15:00'}}],tasks,[],{minDate:'2026-10-13'}),[]);
});
