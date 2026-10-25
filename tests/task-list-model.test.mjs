import test from 'node:test';
import assert from 'node:assert/strict';

const load=()=>import('../task-list-model.js');
const state=()=>({boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Science',notes:'Old',date:'2026-10-15',startTime:'13:00',endTime:'14:00',custom:{keep:true}}]}]}]});
const target={taskId:'t'};
test('detail edits preserve unknown fields and unrelated concurrent changes',async()=>{
  const {applyTaskListCommand}=await load(),data=state();data.boards[0].sections[0].tasks[0].reminderMinutes=15;
  const out=applyTaskListCommand(data,{type:'edit_task',target,changes:{notes:'New'}},{boardId:'b',sectionId:'s',fields:{notes:'Old'}});
  assert.equal(out.next.boards[0].sections[0].tasks[0].notes,'New');
  assert.equal(out.next.boards[0].sections[0].tasks[0].reminderMinutes,15);
  assert.equal(out.next.boards[0].sections[0].tasks[0].custom.keep,true);
  assert.equal(data.boards[0].sections[0].tasks[0].notes,'Old');
});
test('conflicting, missing, archived and ambiguous targets cannot save',async()=>{
  const {applyTaskListCommand}=await load();
  for(const mode of ['conflict','missing','archived','duplicate','moved']){
    const data=state(),task=data.boards[0].sections[0].tasks[0];
    if(mode==='conflict')task.notes='Elsewhere';
    if(mode==='missing')data.boards[0].sections[0].tasks=[];
    if(mode==='archived')data.boards[0].archived=true;
    if(mode==='duplicate')data.boards[0].sections[0].tasks.push({...task});
    if(mode==='moved')data.boards[0].sections[0].id='elsewhere';
    assert.throws(()=>applyTaskListCommand(data,{type:'edit_task',target,changes:{notes:'New'}},{boardId:'b',sectionId:'s',fields:{notes:'Old'}}));
  }
});
test('detail validation rejects unapproved fields, bad dates and overflowing durations',async()=>{
  const {applyTaskListCommand}=await load();
  for(const changes of [{userID:'bad'},{date:'2026-02-30'},{durationMinutes:0},{durationMinutes:1440},{reminderMinutes:0},{priority:'urgent'},{title:''}]){
    const fields=Object.fromEntries(Object.keys(changes).map(key=>[key,key==='durationMinutes'?60:state().boards[0].sections[0].tasks[0][key]??null]));
    assert.throws(()=>applyTaskListCommand(state(),{type:'edit_task',target,changes},{boardId:'b',sectionId:'s',fields}));
  }
});
test('start-only moves preserve duration; explicit duration edits resize',async()=>{
  const {applyTaskListCommand}=await load();
  const moved=applyTaskListCommand(state(),{type:'edit_task',target,changes:{startTime:'14:00'}},{boardId:'b',sectionId:'s',fields:{startTime:'13:00'}});
  assert.equal(moved.next.boards[0].sections[0].tasks[0].endTime,'15:00');
  const resized=applyTaskListCommand(state(),{type:'edit_task',target,changes:{durationMinutes:90}},{boardId:'b',sectionId:'s',fields:{durationMinutes:60}});
  assert.equal(resized.next.boards[0].sections[0].tasks[0].endTime,'14:30');
});
test('series rule changes preserve exceptions and reject occurrence targets',async()=>{
  const {applyTaskListCommand}=await load(),data=state(),task=data.boards[0].sections[0].tasks[0];
  task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:task.date,mode:'fixed',exceptions:{'2026-10-16':{status:'completed'}}};
  const recurrence={...task.recurrence,interval:2};delete recurrence.exceptions;
  const out=applyTaskListCommand(data,{type:'edit_task',target,changes:{recurrence}},{boardId:'b',sectionId:'s',fields:{recurrence:task.recurrence}});
  assert.equal(out.next.boards[0].sections[0].tasks[0].recurrence.exceptions['2026-10-16'].status,'completed');
  assert.throws(()=>applyTaskListCommand(data,{type:'edit_task',target:{...target,occurrenceDate:'2026-10-16'},changes:{notes:'X'}},{fields:{notes:'Old'}}),/Schedule/);
});
test('a repeat rule cannot end before its first occurrence',async()=>{
  const {applyTaskListCommand}=await load();
  assert.throws(()=>applyTaskListCommand(state(),{type:'edit_task',target,changes:{recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',endType:'date',endDate:'2026-10-14'}}},{boardId:'b',sectionId:'s',fields:{recurrence:null}}),/repeat|recurr|end/i);
});
test('clearing a time retains block duration over an older estimate',async()=>{
 const {applyTaskListCommand,taskDetailValues}=await load(),data=state();data.boards[0].sections[0].tasks[0].estimatedMinutes=20;
 const edit=(input,changes)=>applyTaskListCommand(input,{type:'edit_task',target,changes},{boardId:'b',sectionId:'s',fields:taskDetailValues(input.boards[0].sections[0].tasks[0])}).next;
 const cleared=edit(data,{date:null,startTime:null});
 assert.equal(taskDetailValues(cleared.boards[0].sections[0].tasks[0]).durationMinutes,60);
 const placed=edit(cleared,{date:'2026-10-26',startTime:'09:00'});
 assert.equal(placed.boards[0].sections[0].tasks[0].endTime,'10:00');
 assert.equal(data.boards[0].sections[0].tasks[0].estimatedMinutes,20);
});
test('clearing a time keeps missing estimates absent and explicit duration edits take priority',async()=>{
 const {applyTaskListCommand,taskDetailValues}=await load();
 for(const estimate of [undefined,null,20]){
  for(const duration of [undefined,90]){
   const data=state(),task=data.boards[0].sections[0].tasks[0];task.endTime='14:35';if(estimate!==undefined)task.estimatedMinutes=estimate;
   const changes={startTime:null,...(duration?{durationMinutes:duration}:{})};
   const cleared=applyTaskListCommand(data,{type:'edit_task',target,changes},{boardId:'b',sectionId:'s',fields:taskDetailValues(task)}).next.boards[0].sections[0].tasks[0];
   assert.equal(taskDetailValues(cleared).durationMinutes,duration??95);
   if(duration===undefined&&estimate==null)assert.equal(cleared.estimatedMinutes,estimate);
  }
 }
});
