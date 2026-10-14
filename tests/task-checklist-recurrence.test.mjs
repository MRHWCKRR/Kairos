import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand,taskDetailValues,resolveTaskDetail} from '../task-list-model.js';
import {generateTaskOccurrences,applyOccurrenceOverride} from '../recurrence-utils.js';
const task=()=>({id:'t',title:'Study',date:'2026-10-15',checklist:[{id:'a',title:'Read',completed:false}],recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{'2026-10-15':{status:'completed',override:{date:'2026-10-17',notes:'Special',reminderMinutes:10}}}}});
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[task()]}]}]});
const stored=data=>data.boards[0].sections[0].tasks[0];
test('Schedule-created recurring templates clear old progress without clearing occurrence snapshots',()=>{
  const data=state(),series=stored(data);series.checklist[0].completed=true;
  series.recurrence.exceptions['2026-10-15'].override.checklist=[{id:'a',title:'Read',completed:true}];
  const baseline=taskDetailValues(series);
  assert.equal(baseline.checklist[0].completed,false);
  const target={taskId:'t',occurrenceDate:'2026-10-15'};
  assert.equal(taskDetailValues(resolveTaskDetail(data,target).task,target).checklist[0].completed,true);
  const next=applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t'},changes:{checklist:[{id:'a',title:'Read again',completed:false}]}},{boardId:'b',sectionId:'s',fields:baseline}).next;
  assert.equal(stored(next).checklist[0].completed,false);
  assert.equal(stored(next).checklist[0].title,'Read again');
  assert.equal(generateTaskOccurrences(stored(next),'2026-10-15','2026-10-15')[0].task.checklist[0].completed,true);
});
test('occurrence checklist progress stays with its logical date and retains other overrides',()=>{
  const data=state();
  const out=applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t',occurrenceDate:'2026-10-15'},changes:{checklist:[{id:'a',title:'Read',completed:true}]}},{boardId:'b',sectionId:'s',fields:{checklist:[{id:'a',title:'Read',completed:false}]}}).next;
  const series=stored(out),a=generateTaskOccurrences(series,'2026-10-15','2026-10-15')[0],b=generateTaskOccurrences(series,'2026-10-16','2026-10-16')[0];
  assert.equal(a.task.checklist[0].completed,true);assert.equal(b.task.checklist[0].completed,false);
  assert.equal(a.displayDate,'2026-10-17');assert.equal(a.task.notes,'Special');assert.equal(a.task.reminderMinutes,10);assert.equal(a.status,'completed');
});
test('template edits affect untouched occurrences while historical checklist snapshots stay intact',()=>{
  const data=state(),series=stored(data);series.recurrence.exceptions['2026-10-15'].override.checklist=[{id:'a',title:'Old step',completed:true}];
  const next=applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t'},changes:{checklist:[{id:'a',title:'New step',completed:false}]}},{boardId:'b',sectionId:'s',fields:{checklist:series.checklist}}).next;
  assert.equal(generateTaskOccurrences(stored(next),'2026-10-15','2026-10-15')[0].task.checklist[0].title,'Old step');
  assert.equal(generateTaskOccurrences(stored(next),'2026-10-16','2026-10-16')[0].task.checklist[0].title,'New step');
});
test('shared occurrence overrides preserve fields not included in a later edit',()=>{
  const input=task(),updated=applyOccurrenceOverride(input,'2026-10-15',{checklist:[{id:'a',title:'Read',completed:true}]});
  assert.equal(updated.recurrence.exceptions['2026-10-15'].override.notes,'Special');
  const again=applyOccurrenceOverride(updated,'2026-10-15',{startTime:'13:00',endTime:'14:00'});
  assert.equal(again.recurrence.exceptions['2026-10-15'].override.checklist[0].completed,true);
});
test('series templates cannot store completion; invalid occurrence dates cannot edit metadata',()=>{
  const data=state();
  assert.throws(()=>applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t'},changes:{checklist:[{id:'a',title:'Read',completed:true}]}},{boardId:'b',sectionId:'s',fields:{checklist:stored(data).checklist}}),/template/i);
  assert.throws(()=>applyTaskListCommand(data,{type:'edit_task',target:{taskId:'t',occurrenceDate:'2026-02-30'},changes:{checklist:[]}},{boardId:'b',sectionId:'s',fields:{checklist:[]}}));
});
