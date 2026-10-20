import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../task-list-model.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../recurrence-utils.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const date='2026-10-21',target={taskId:'t'};
const initial=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',date,startTime:'10:00',endTime:'11:00',notes:'Keep',checklist:[]}]}]}]});
const task=state=>state.boards[0].sections[0].tasks[0];
const changes={date,startTime:'11:05',endTime:'12:05'};
function prepare(state=initial(),selected=target,next=changes){assert.equal(typeof model.buildScheduleChange,'function');return model.buildScheduleChange(state,selected,next)}
function apply(state,selected=target,next=changes){const request=prepare(state,selected,next);return model.applyTaskListCommand(state,request.command,request.expected)}
function undo(state,record){assert.equal(typeof model.applyScheduleUndo,'function');return model.applyScheduleUndo(state,record)}

test('schedule changes capture an inverse without mutating source data',()=>{
 const state=initial(),before=structuredClone(state),result=apply(state);
 assert.deepEqual(state,before);assert.equal(task(result.next).startTime,'11:05');assert.deepEqual(undo(result.next,result.result.scheduleUndo).next,state);
});
test('Undo preserves later notes, checklist, focus and reminder edits',()=>{
 const result=apply(initial());Object.assign(task(result.next),{notes:'New',checklist:[{id:'c',title:'Step',completed:true}],focusLoggedSeconds:45,reminderMinutes:10});
 const restored=task(undo(result.next,result.result.scheduleUndo).next);
 assert.equal(restored.startTime,'10:00');assert.equal(restored.notes,'New');assert.equal(restored.checklist[0].completed,true);assert.equal(restored.focusLoggedSeconds,45);assert.equal(restored.reminderMinutes,10);
});
test('stale scheduling, completion, membership and recurrence changes block save and Undo',()=>{
 for(const change of [s=>task(s).endTime='13:00',s=>task(s).completed=true,s=>task(s).archived=true,s=>s.boards[0].sections[0].id='moved',s=>task(s).recurrence=normalizeRecurrence({enabled:true,startDate:date,mode:'fixed'})]){
  const state=initial(),request=prepare(state);change(state);assert.throws(()=>model.applyTaskListCommand(state,request.command,request.expected));
  const saved=apply(initial());change(saved.next);assert.throws(()=>undo(saved.next,saved.result.scheduleUndo));
 }
});
test('legacy tasks restore absence of an end time and duration fields',()=>{
 const state=initial();delete task(state).endTime;const result=apply(state);assert.deepEqual(undo(result.next,result.result.scheduleUndo).next,state);
});
test('invalid dates, times, extra fields and impossible durations are rejected',()=>{
 for(const values of [{...changes,date:'2026-02-30'},{...changes,startTime:'24:10'},{...changes,endTime:'10:00'},{...changes,title:'No'},{date:null,startTime:'11:00',endTime:'12:00'}])assert.throws(()=>apply(initial(),target,values));
});
function recurring(mode='fixed'){
 const state=initial();task(state).recurrence=normalizeRecurrence({enabled:true,startDate:date,mode,frequency:'daily'});return state;
}
test('moving a recurring occurrence changes and restores only its original logical date',()=>{
 const state=recurring(),selected={taskId:'t',occurrenceDate:date};const result=apply(state,selected,{date:'2026-10-22',startTime:'13:00',endTime:'13:45',durationMinutes:45});
 const occurrences=generateTaskOccurrences(task(result.next),date,'2026-10-22');assert.equal(occurrences[0].displayDate,'2026-10-22');assert.equal(occurrences[0].durationMinutes,45);assert.equal(occurrences[1].startTime,'10:00');assert.equal(task(result.next).startTime,'10:00');
 task(result.next).recurrence.exceptions[date].override.checklist=[{id:'c',title:'Keep',completed:true}];task(result.next).recurrence.exceptions[date].focusLoggedSeconds=55;
 const restored=task(undo(result.next,result.result.scheduleUndo).next);assert.equal(generateTaskOccurrences(restored,date,date)[0].startTime,'10:00');assert.equal(restored.recurrence.exceptions[date].override.checklist[0].completed,true);assert.equal(restored.recurrence.exceptions[date].focusLoggedSeconds,55);
});
test('flexible occurrences keep explicit placement at template times and Undo removes it',()=>{
 const state=recurring('flexible'),selected={taskId:'t',occurrenceDate:date};const result=apply(state,selected,{date,startTime:'10:00',endTime:'11:00',durationMinutes:60});
 assert.equal(generateTaskOccurrences(task(result.next),date,date)[0].startTime,'10:00');assert.equal(generateTaskOccurrences(task(undo(result.next,result.result.scheduleUndo).next),date,date)[0].startTime,null);
});
test('occurrence duration survives unscheduling and later placement',()=>{
 const state=recurring(),selected={taskId:'t',occurrenceDate:date};task(state).recurrence.exceptions[date]={override:{durationMinutes:25}};
 const unscheduled=apply(state,selected,{date,startTime:null,endTime:null,durationMinutes:25});
 assert.equal(generateTaskOccurrences(task(unscheduled.next),date,date)[0].durationMinutes,25);
 const placed=apply(unscheduled.next,selected,{date,startTime:'14:00',endTime:'14:25',durationMinutes:25});assert.equal(generateTaskOccurrences(task(placed.next),date,date)[0].endTime,'14:25');
});
test('a different occurrence can change without blocking selected occurrence Undo',()=>{
 const result=apply(recurring(),{taskId:'t',occurrenceDate:date},{...changes,durationMinutes:60});
 task(result.next).recurrence.exceptions['2026-10-22']={status:'completed',override:{startTime:'16:00'}};
 const restored=task(undo(result.next,result.result.scheduleUndo).next);assert.equal(restored.recurrence.exceptions['2026-10-22'].status,'completed');
});
test('midnight endings preserve the full occurrence duration',()=>{
 const result=apply(recurring(),{taskId:'t',occurrenceDate:date},{date,startTime:'23:00',endTime:'00:00',durationMinutes:60});assert.equal(generateTaskOccurrences(task(result.next),date,date)[0].durationMinutes,60);
});
test('save and Undo reconcile lost responses exactly once and consume the source receipt',async()=>{
 const f=await plannerFixture(initial()),request=prepare(initial()),time=Date.now();f.setFail(true);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',request.command,request.expected,'move-once',time),/lost/i);
 const saved=await f.context.persistTaskListCommand('plan','one',request.command,request.expected,'move-once',time);assert.equal(f.writes.length,1);assert.ok(saved.scheduleUndo);
 const command={type:'schedule_undo',sourceOperationId:'move-once',expiresAt:time+10000},expected={sourceOperationId:'move-once'};f.setFail(true);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'undo-once',time+1),/lost/i);
 await f.context.persistTaskListCommand('plan','one',command,expected,'undo-once',time+1);assert.equal(f.writes.length,2);assert.equal(task(f.data()).startTime,'10:00');
 await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'undo-again',time+2),/already|unavailable/i);
});
test('an expired Undo window or missing source receipt cannot issue a fresh Undo',async()=>{
 const f=await plannerFixture(initial()),request=prepare(initial()),time=Date.now();await f.context.persistTaskListCommand('plan','one',request.command,request.expected,'source',time-20000);
 for(const id of ['source','missing'])await assert.rejects(f.context.persistTaskListCommand('plan','one',{type:'schedule_undo',sourceOperationId:id,expiresAt:time-1},{sourceOperationId:id},'undo-'+id,time),/expired|unavailable/i);
 assert.equal(f.writes.length,1);
});
