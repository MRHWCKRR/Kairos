import test from 'node:test';import assert from 'node:assert/strict';
import {applyAiTaskMutation} from '../ai-task-commands.js';
import {applyTaskListCommand,taskDetailValues} from '../task-list-model.js';
const state=()=>({boards:[{id:'b',title:'School',archived:false,sections:[{id:'s',title:'General',archived:false,tasks:[{id:'t',title:'Read',date:'2026-10-25',startTime:'09:00',endTime:'10:00',estimatedMinutes:20,completed:false,archived:false,notes:'Keep',checklist:[{id:'step',title:'Notes',completed:false}]}]},{id:'next',title:'Later',tasks:[]}]}],dayInsights:{},scheduleEvents:[]});
const request=(type,args={},destination)=>({type,args,target:{taskId:'t'},...(destination?{destination}:{})});
test('AI title/date/time edits produce the same state as the shared detail command',()=>{
 const original=state(),task=original.boards[0].sections[0].tasks[0],changes={title:'Revision',date:'2026-10-26',startTime:'11:00'};
 const expected={boardId:'b',sectionId:'s',fields:taskDetailValues(task)};
 const manual=applyTaskListCommand(original,{type:'edit_task',target:{taskId:'t'},changes},expected).next;
 const ai=applyAiTaskMutation(original,request('update_task',{newTitle:'Revision',date:'2026-10-26',startTime:'11:00'})).next;
 assert.deepEqual(ai,manual);assert.equal(ai.boards[0].sections[0].tasks[0].endTime,'12:00');assert.equal(original.boards[0].sections[0].tasks[0].title,'Read');
});
test('explicit AI resize shares duration storage with manual edits',()=>{
 const original=state(),task=original.boards[0].sections[0].tasks[0],changes={durationMinutes:90,date:task.date};
 const manual=applyTaskListCommand(original,{type:'edit_task',target:{taskId:'t'},changes},{boardId:'b',sectionId:'s',fields:taskDetailValues(task)}).next;
 const ai=applyAiTaskMutation(original,request('resize_task',{durationMinutes:90}),{allowDurationChange:true}).next;
 assert.deepEqual(ai,manual);assert.throws(()=>applyAiTaskMutation(original,request('resize_task',{durationMinutes:90})),/explicit/i);
});
test('reminder edits use shared validation and preserve unrelated recurrence exceptions',()=>{
 const original=state(),task=original.boards[0].sections[0].tasks[0];
 task.recurrence={enabled:true,frequency:'daily',startDate:task.date,mode:'fixed',exceptions:{'2026-10-26':{status:'completed',override:{reminderMinutes:5,title:'Keep override'}}}};
 const ai=applyAiTaskMutation(original,request('set_task_reminder',{minutesBefore:30})).next.boards[0].sections[0].tasks[0];
 assert.equal(ai.reminderMinutes,30);assert.equal(ai.recurrence.exceptions['2026-10-26'].override.reminderMinutes,undefined);assert.equal(ai.recurrence.exceptions['2026-10-26'].override.title,'Keep override');assert.equal(ai.recurrence.exceptions['2026-10-26'].status,'completed');
 assert.throws(()=>applyAiTaskMutation(original,request('set_task_reminder',{minutesBefore:1.5})),/reminder/i);
});
test('compound edits, movement, completion and archive succeed atomically on one draft',()=>{
 const original=state(),result=applyAiTaskMutation(original,request('update_task',{newTitle:'Moved',completed:true,archived:true},{boardId:'b',sectionId:'next'}));
 const task=result.next.boards[0].sections[1].tasks[0];assert.equal(task.title,'Moved');assert.equal(task.completed,true);assert.equal(task.archived,true);assert.equal(task.notes,'Keep');assert.equal(result.next.boards[0].sections[0].tasks.length,0);
 assert.throws(()=>applyAiTaskMutation(original,request('update_task',{newTitle:'Do not save'},{boardId:'b',sectionId:'missing'})),/missing|archived|section/i);assert.equal(original.boards[0].sections[0].tasks[0].title,'Read');
});
test('archived tasks must be restored before editing and archived parents cannot be bypassed',()=>{
 const original=state();original.boards[0].sections[0].tasks[0].archived=true;
 assert.throws(()=>applyAiTaskMutation(original,request('update_task',{newTitle:'Hidden'})),/archived/i);
 const restored=applyAiTaskMutation(original,request('update_task',{archived:false,newTitle:'Restored'})).result.task;assert.equal(restored.archived,false);assert.equal(restored.title,'Restored');
 original.boards[0].archived=true;assert.throws(()=>applyAiTaskMutation(original,request('update_task',{archived:false,newTitle:'No'})),/archived/i);
});
test('shared schedule rules reject completed edits, partial time clearing and implicit resize',()=>{
 const original=state();original.boards[0].sections[0].tasks[0].completed=true;
 assert.throws(()=>applyAiTaskMutation(original,request('update_task',{date:'2026-10-26'})),/completed/i);
 assert.equal(applyAiTaskMutation(original,request('update_task',{date:'2026-10-26'}),{allowCompleted:true}).result.task.date,'2026-10-26');
 original.boards[0].sections[0].tasks[0].completed=false;
 assert.throws(()=>applyAiTaskMutation(original,request('update_task',{startTime:null})),/invalid|time/i);
 assert.throws(()=>applyAiTaskMutation(original,request('update_task',{endTime:'09:30'})),/duration/i);
});

test('AI unscheduling and later placement retain block length over a stale estimate',()=>{
 const cleared=applyAiTaskMutation(state(),request('update_task',{date:null,startTime:null,endTime:null})).next;
 const placed=applyAiTaskMutation(cleared,request('update_task',{date:'2026-10-26',startTime:'11:00'})).next;
 assert.equal(placed.boards[0].sections[0].tasks[0].endTime,'12:00');
});
