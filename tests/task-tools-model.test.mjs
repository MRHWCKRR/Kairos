import test from 'node:test';import assert from 'node:assert/strict';import * as model from '../task-list-model.js';import {plannerFixture} from './helpers/planner-fixture.mjs';
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'A',notes:'Keep',completed:true,date:'2026-10-15',startTime:'13:00',endTime:'14:00',priority:'high',operationHistory:{secret:'omit'},occurrenceOverrides:{omit:true},checklist:[{id:'old-step',title:'Step',completed:true}]},{id:'c',title:'C'}]}]}]});
let counter=0;const options=()=>({uuid:()=>String(++counter)}),task=(state,id)=>state.boards[0].sections[0].tasks.find(task=>task.id===id);
const build=(state,action,ids,extra={})=>{assert.equal(typeof model.buildTaskTool,'function');return model.buildTaskTool(state,action,ids,{...options(),...extra})};
const apply=(state,op)=>model.applyTaskListCommand(state,op.command,op.expected);
test('Duplicate creates fresh ordinary task/checklist IDs and resets scheduling/progress/history',()=>{
 const input=data(),op=build(input,'duplicate',['a','c']),out=apply(input,op),copy=task(out.next,out.result.taskIds[0]);assert.notEqual(copy.id,'a');assert.equal(copy.title,'A');assert.equal(copy.notes,'Keep');assert.equal(copy.priority,'high');assert.equal(copy.completed,false);assert.equal(copy.archived,false);assert.equal(copy.date,null);assert.ok(!copy.startTime&&!copy.endTime&&!copy.recurrence&&!copy.operationHistory&&!copy.occurrenceOverrides);assert.notEqual(copy.checklist[0].id,'old-step');assert.equal(copy.checklist[0].completed,false);assert.equal(task(input,'a').completed,true);assert.equal(out.result.inverse,undefined);
});
test('Duplicate rejects changed sources, recurrence, generated-ID collisions and oversized selections',()=>{
 const input=data(),op=build(input,'duplicate',['a','c']);task(input,'c').title='Changed';assert.throws(()=>apply(input,op),/changed/i);assert.equal(input.boards[0].sections[0].tasks.length,2);
 const recurring=data();task(recurring,'a').recurrence={enabled:true};assert.throws(()=>build(recurring,'duplicate',['a','c']),/recurr|Schedule/i);
 const collide=build(data(),'duplicate',['a']);collide.command.copies[0].id='c';assert.throws(()=>apply(data(),collide),/ID|exist/i);assert.throws(()=>build(data(),'duplicate',Array.from({length:51},(_,i)=>'t'+i)),/50/);
});
test('lost Duplicate response retries the same fresh IDs with one receipt and no extra copies',async()=>{
 const input=data(),op=build(input,'duplicate',['a','c']),f=await plannerFixture(input,{failAfterCommit:true});f.context.applyTaskListCommand=model.applyTaskListCommand;const createdAt=Date.now();await assert.rejects(f.context.persistTaskListCommand('plan','one',op.command,op.expected,'duplicate',createdAt),/lost/);const result=await f.context.persistTaskListCommand('plan','one',op.command,op.expected,'duplicate',createdAt);assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks.length,4);assert.deepEqual(Array.from(result.taskIds),op.command.copies.map(copy=>copy.id));
});
test('one-field batches reuse metadata validation and guarded Undo while retaining unrelated edits',()=>{
 for(const [field,value] of [['date','2026-10-20'],['dueDate','2026-11-01'],['priority','low'],['durationMinutes',90],['reminderMinutes',15],['scheduleLocked',true]]){
  const input=data(),op=build(input,'edit',['a','c'],{field,value}),out=apply(input,op);assert.equal(model.taskDetailValues(task(out.next,'a'))[field],value);assert.equal(task(out.next,'a').notes,'Keep');task(out.next,'a').title='New title';const undo=model.applyTaskListCommand(out.next,{type:'undo_task_list',inverse:out.result.inverse,expiresAt:10000},{},{now:5000});assert.equal(model.taskDetailValues(task(undo.next,'a'))[field],model.taskDetailValues(task(input,'a'))[field]);assert.equal(task(undo.next,'a').title,'New title');
  const stale=structuredClone(out.next);if(field==='date')task(stale,'a').date='2026-10-21';else if(field==='durationMinutes')task(stale,'a').endTime='15:00';else task(stale,'a')[field]=field==='scheduleLocked'?false:null;assert.throws(()=>model.applyTaskListCommand(stale,{type:'undo_task_list',inverse:out.result.inverse,expiresAt:10000},{},{now:5000}),/changed/i);
 }
});
test('field tools reject partial invalidity, unsupported fields, recurrence and unsafe schedule clearing',()=>{
 for(const [field,value] of [['date','2026-02-30'],['priority','urgent'],['durationMinutes',0],['reminderMinutes',0],['scheduleLocked','true'],['notes','bad']])assert.throws(()=>apply(data(),build(data(),'edit',['a','c'],{field,value})));
 const input=data();task(input,'a').startTime='23:50';task(input,'a').endTime='23:59';const op=build(input,'edit',['a','c'],{field:'durationMinutes',value:30});assert.throws(()=>apply(input,op),/midnight/);assert.equal(task(input,'c').estimatedMinutes,undefined);
 assert.throws(()=>apply(data(),build(data(),'edit',['a','c'],{field:'date',value:null})),/date/i);for(const field of ['dueDate','priority','reminderMinutes'])assert.equal(model.taskDetailValues(task(apply(data(),build(data(),'edit',['a','c'],{field,value:null})).next,'a'))[field],null);
 const recurring=data();task(recurring,'c').recurrence={enabled:true};assert.throws(()=>build(recurring,'edit',['a','c'],{field:'priority',value:'high'}),/recurr|Schedule/i);
});
