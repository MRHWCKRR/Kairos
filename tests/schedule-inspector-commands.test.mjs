import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../task-list-model.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../recurrence-utils.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const date='2026-10-02';
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',notes:'Old',date:'2026-10-01',startTime:'10:00',endTime:'11:00',recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-01',mode:'fixed',endType:'count',count:4,exceptions:{'2026-10-03':{status:'completed',completedAt:'keep',focusLoggedSeconds:60}}})}]}]}]});
const task=s=>s.boards[0].sections[0].tasks[0];
const op=(state,intent)=>{assert.equal(typeof model.buildRecurringInspectorCommand,'function');return model.buildRecurringInspectorCommand(state,{taskId:'t',occurrenceDate:date},intent)};
test('recurring status is a pure validated command preserving concurrent focus and other dates',()=>{
 const state=data(),p=op(state,{action:'status',status:'skipped',timestamp:'2026-10-02T10:00:00.000Z'});task(state).recurrence.exceptions[date]={focusLoggedSeconds:120};task(state).notes='Remote';
 const result=model.applyTaskListCommand(state,p.command,p.expected);assert.equal(task(state).recurrence.exceptions[date].status,undefined);assert.equal(task(result.next).recurrence.exceptions[date].skippedAt,'2026-10-02T10:00:00.000Z');assert.equal(task(result.next).recurrence.exceptions[date].focusLoggedSeconds,120);assert.equal(task(result.next).notes,'Remote');
 task(state).recurrence.exceptions[date].status='completed';assert.throws(()=>model.applyTaskListCommand(state,p.command,p.expected),/changed/);
});
test('recurring edits guard touched fields and locations but preserve unrelated metadata',()=>{
 const state=data(),p=op(state,{action:'edit',scope:'occurrence',changes:{title:'New'}});task(state).notes='Concurrent';const result=model.applyTaskListCommand(state,p.command,p.expected);assert.equal(generateTaskOccurrences(task(result.next),date,date)[0].task.title,'New');assert.equal(task(result.next).notes,'Concurrent');task(state).title='Conflict';assert.throws(()=>model.applyTaskListCommand(state,p.command,p.expected),/changed/);task(state).title='Read';state.boards[0].sections[0].id='moved';assert.throws(()=>model.applyTaskListCommand(state,p.command,p.expected),/moved|changed/);
});
test('future commands preserve finite slots, completed history, stable split IDs and reject collisions',()=>{
 const state=data(),p=op(state,{action:'edit',scope:'future',changes:{title:'New'},newTaskId:'split'}),result=model.applyTaskListCommand(state,p.command,p.expected);const list=result.next.boards[0].sections[0].tasks;assert.equal(list[1].id,'split');assert.equal(list[0].recurrence.exceptions['2026-10-03'].completedAt,'keep');assert.equal(list[0].recurrence.exceptions['2026-10-03'].focusLoggedSeconds,60);assert.equal(generateTaskOccurrences(list[1],date,'2026-10-10').filter(o=>o.status!=='deleted').length,2);state.boards[0].sections[0].tasks.push({id:'split'});assert.throws(()=>model.applyTaskListCommand(state,p.command,p.expected),/ID/);
});
test('recurring commands reject arbitrary state, malformed values, missing dates and invalid scopes',()=>{
 for(const intent of [{action:'edit',scope:'invalid',changes:{title:'X'}},{action:'edit',scope:'series',changes:{userID:'bad'}},{action:'edit',scope:'occurrence',changes:{durationMinutes:0}},{action:'status',status:'completed',timestamp:'bad'},{action:'edit',scope:'future',changes:{notes:'X'},newTaskId:'t'}])assert.throws(()=>op(data(),intent));
 assert.throws(()=>model.buildRecurringInspectorCommand(data(),{taskId:'t',occurrenceDate:'2026-11-20'},{action:'status',status:'completed',timestamp:'2026-10-02T10:00:00.000Z'}));
 const p=op(data(),{action:'edit',scope:'occurrence',changes:{title:'New'}});p.command.next={boards:[]};assert.throws(()=>model.applyTaskListCommand(data(),p.command,p.expected));
});
test('saved completed scheduling policy is read for recurring inspector transactions',async()=>{
 const state=data();task(state).recurrence.exceptions[date]={status:'completed',completedAt:'keep'};const p=op(state,{action:'edit',scope:'occurrence',changes:{date,startTime:'14:00',endTime:'15:00',durationMinutes:60}}),f=await plannerFixture(state);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'blocked',Date.now()),/Completed/);assert.equal(f.writes.length,0);f.setUserData({settings:{planning:{rescheduleCompleted:true}}});await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'allowed',Date.now());assert.equal(task(f.data()).recurrence.exceptions[date].override.startTime,'14:00');
});
test('lost acknowledgements and transaction retries apply one recurring split with the submitted ID',async()=>{
 const state=data(),p=op(state,{action:'edit',scope:'future',changes:{title:'New'},newTaskId:'stable-split'}),f=await plannerFixture(state,{failAfterCommit:true,retryTransaction:true}),createdAt=Date.now();await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'split-op',createdAt),/response lost/);await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'split-op',createdAt);assert.equal(f.writes.length,1);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['t','stable-split']);
});
test('explicit delete guards the whole task while archive semantics remain separate',()=>{
 const state=data();task(state).recurrence=null;assert.equal(typeof model.buildInspectorDelete,'function');const p=model.buildInspectorDelete(state,'t');task(state).notes='Changed';assert.throws(()=>model.applyTaskListCommand(state,p.command,p.expected),/changed/);task(state).notes='Old';assert.equal(model.applyTaskListCommand(state,p.command,p.expected).next.boards[0].sections[0].tasks.length,0);assert.equal(state.boards[0].sections[0].tasks.length,1);
});

test('normal inspector estimate edits use the detail command and validate integer minutes',()=>{const state=data();task(state).recurrence=null;const expected={boardId:'b',sectionId:'s',fields:{estimatedMinutes:null}};const next=model.applyTaskListCommand(state,{type:'edit_task',target:{taskId:'t'},changes:{estimatedMinutes:90}},expected).next;assert.equal(task(next).estimatedMinutes,90);assert.throws(()=>model.applyTaskListCommand(state,{type:'edit_task',target:{taskId:'t'},changes:{estimatedMinutes:1.5}},expected));});

test('recurring deletes apply only the reviewed occurrence, future range or complete series',()=>{for(const scope of ['occurrence','future','series']){const state=data(),p=op(state,{action:'delete',scope,timestamp:'2026-10-02T10:00:00.000Z'}),next=model.applyTaskListCommand(state,p.command,p.expected).next;const tasks=next.boards[0].sections[0].tasks;if(scope==='series')assert.equal(tasks.length,0);else if(scope==='occurrence'){assert.equal(task(next).recurrence.exceptions[date].status,'deleted');assert.equal(task(next).recurrence.exceptions['2026-10-03'].completedAt,'keep')}else assert.deepEqual(generateTaskOccurrences(task(next),'2026-10-01','2026-10-10').map(o=>o.occurrenceDate),['2026-10-01']);}});

test('a flexible future duration edit persists its interval and keeps concurrent progress',()=>{const state=data();task(state).startTime=null;task(state).endTime=null;task(state).recurrence.mode='flexible';const p=op(state,{action:'edit',scope:'future',changes:{durationMinutes:90},newTaskId:'flexible'});task(state).recurrence.exceptions['2026-10-04']={focusLoggedSeconds:30};const next=model.applyTaskListCommand(state,p.command,p.expected).next;assert.equal(generateTaskOccurrences(next.boards[0].sections[0].tasks[1],date,date)[0].durationMinutes,90);assert.equal(task(next).recurrence.exceptions['2026-10-04'].focusLoggedSeconds,30)});
