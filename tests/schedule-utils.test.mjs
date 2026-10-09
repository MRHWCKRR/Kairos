import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateKey, parseTime, formatTime, snapMinutes, taskDurationMinutes,
  getVisibleDates, shiftAnchor, layoutOverlaps, findConflicts, splitOvernightInterval,
  applyScheduledMove, applyResize, clearScheduledFields, normalizeTaskMetadata,
  scheduleFieldsFromDuration, validateScheduleProposals
} from '../schedule-utils.js';

test('three-day range stays in local calendar dates across month boundary', () => {
  const dates = getVisibleDates(new Date(2026, 9, 31, 12), 'three-day');
  assert.deepEqual(dates.map(toDateKey), ['2026-10-31','2026-11-01','2026-11-02']);
});

test('week range is Sunday through Saturday containing anchor', () => {
  const dates = getVisibleDates(new Date(2026, 9, 9, 12), 'week');
  assert.deepEqual(dates.map(toDateKey), ['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10']);
});

test('shiftAnchor crosses year boundary for three-day view', () => {
  assert.equal(toDateKey(shiftAnchor(new Date(2026,11,31,12),'three-day',1)), '2027-01-03');
});

test('time parsing, formatting and 15 minute snapping are deterministic', () => {
  assert.equal(parseTime('09:07'), 547);
  assert.equal(snapMinutes(parseTime('09:07')), 540);
  assert.equal(snapMinutes(parseTime('09:08')), 555);
  assert.equal(formatTime(555, false), '09:15');
});

test('task duration uses explicit interval then estimate then fallback with 15 minute minimum', () => {
  assert.equal(taskDurationMinutes({startTime:'16:00',endTime:'17:30'}), 90);
  assert.equal(taskDurationMinutes({estimatedMinutes:45}), 45);
  assert.equal(taskDurationMinutes({estimatedMinutes:5}), 15);
  assert.equal(taskDurationMinutes({}), 60);
});

test('touching intervals do not overlap but simultaneous intervals receive columns', () => {
  const laid = layoutOverlaps([
    {id:'a',startMin:540,endMin:600},
    {id:'b',startMin:600,endMin:660},
    {id:'c',startMin:570,endMin:630}
  ]);
  const a=laid.find(x=>x.id==='a'), b=laid.find(x=>x.id==='b'), c=laid.find(x=>x.id==='c');
  assert.equal(a.columnCount,2);
  assert.equal(b.columnCount,2);
  assert.notEqual(a.column,c.column);
  assert.notEqual(b.column,c.column);
});

test('findConflicts returns only fixed intervals with real overlap', () => {
  const fixed=[{id:'class',startMin:600,endMin:660},{id:'later',startMin:720,endMin:780}];
  assert.deepEqual(findConflicts({startMin:630,endMin:690},fixed).map(x=>x.id),['class']);
  assert.deepEqual(findConflicts({startMin:660,endMin:720},fixed),[]);
});

test('overnight interval splits into before and after midnight pieces', () => {
  assert.deepEqual(splitOvernightInterval({id:'sleep',start:'22:00',end:'06:00'}),[
    {id:'sleep',startMin:1320,endMin:1440,part:'start'},
    {id:'sleep',startMin:0,endMin:360,part:'end'}
  ]);
});

test('scheduled move preserves duration across day change and clamps to day', () => {
  const moved=applyScheduledMove({date:'2026-10-09',startTime:'16:00',endTime:'17:30'},'2026-10-10',18*60+7,15);
  assert.deepEqual(moved,{date:'2026-10-10',startTime:'18:00',endTime:'19:30'});
});

test('resize snaps end time and enforces 15 minute minimum',()=>{
  assert.deepEqual(applyResize({startTime:'16:00',endTime:'17:00'},16*60+7,15),{endTime:'16:15'});
  assert.deepEqual(applyResize({startTime:'16:00',endTime:'17:00'},17*60+38,15),{endTime:'17:45'});
});

test('unscheduling clears only schedule fields and preserves deadline metadata',()=>{
  const task={date:'2026-10-09',startTime:'16:00',endTime:'17:00',dueDate:'2026-10-10',priority:'high'};
  clearScheduledFields(task);
  assert.deepEqual(task,{date:null,startTime:null,endTime:null,dueDate:'2026-10-10',priority:'high'});
});

test('task metadata normalization adds safe defaults without overwriting values',()=>{
  const task={title:'Essay',priority:'high',notes:'Keep me'};
  normalizeTaskMetadata(task);
  assert.equal(task.dueDate,null);
  assert.equal(task.estimatedMinutes,null);
  assert.equal(task.priority,'high');
  assert.equal(task.notes,'Keep me');
  assert.equal(task.reminderMinutes,null);
  assert.equal(task.scheduleLocked,false);
  assert.equal(task.schedulingPreference,null);
});

test('scheduleFieldsFromDuration creates keyboard-equivalent start and end fields',()=>{
  assert.deepEqual(scheduleFieldsFromDuration('2026-10-12','16:10',90),{date:'2026-10-12',startTime:'16:10',endTime:'17:40'});
  assert.deepEqual(scheduleFieldsFromDuration('2026-10-12','',90),{date:'2026-10-12',startTime:null,endTime:null});
});

test('AI schedule proposals reject unknown, locked and invalid task moves',()=>{
  const tasks=new Map([
    ['open',{id:'open',date:null,startTime:null,endTime:null,scheduleLocked:false}],
    ['locked',{id:'locked',date:null,startTime:null,endTime:null,scheduleLocked:true}]
  ]);
  const raw=[
    {taskId:'missing',to:{date:'2026-10-12',startTime:'16:00',endTime:'17:00'}},
    {taskId:'locked',to:{date:'2026-10-12',startTime:'16:00',endTime:'17:00'}},
    {taskId:'open',to:{date:'bad-date',startTime:'16:00',endTime:'17:00'}},
    {taskId:'open',to:{date:'2026-10-12',startTime:'16:00',endTime:'16:10'}}
  ];
  assert.deepEqual(validateScheduleProposals(raw,tasks),[]);
});

test('AI schedule proposals preserve prior schedule and normalise a valid proposal',()=>{
  const task={id:'science',date:'2026-10-10',startTime:'15:00',endTime:'16:00',scheduleLocked:false};
  const proposals=validateScheduleProposals([{taskId:'science',to:{date:'2026-10-12',startTime:'16:00',endTime:'17:30'},reason:'Best free block',conflictIds:['class-1']}],new Map([['science',task]]));
  assert.deepEqual(proposals,[{
    taskId:'science',
    from:{date:'2026-10-10',startTime:'15:00',endTime:'16:00'},
    to:{date:'2026-10-12',startTime:'16:00',endTime:'17:30'},
    reason:'Best free block',
    conflictIds:['class-1']
  }]);
});
