import test from 'node:test';import assert from 'node:assert/strict';import {plannerFixture} from './helpers/planner-fixture.mjs';
const state=()=>({userID:'one',boards:[{id:'b',title:'School',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Read',date:null,completed:false,archived:false}]}]}],scheduleEvents:[]});
test('all AI mutations require review in chat, and create preview never writes',async()=>{
 const f=await plannerFixture(state()),action={type:'create_task',args:{boardId:'b',sectionId:'s',title:'New',date:'2026-10-25'}};
 assert.equal(f.context.actionNeedsConfirmation(action),true);const preview=await f.context.previewKairosAction(action,{planId:'plan'});assert.equal(f.writes.length,0);assert.equal(preview.summary.kind,'changes');assert.equal(preview.summary.rows[0].after,'New');
 const result=await f.execute(preview.action,{planId:'plan',confirmation:preview.approval,operationId:'create-new',createdAt:1000});assert.equal(result.task.title,'New');assert.ok(f.data().aiActionReceipts[0].result.plannerUndo.length);
});
test('stale ordinary AI preview refuses to overwrite new planner changes',async()=>{
 const f=await plannerFixture(state()),action={type:'update_task',args:{taskId:'t',newTitle:'Revision'}},preview=await f.context.previewKairosAction(action,{planId:'plan'});
 const next=f.data();next.boards[0].sections[0].tasks[0].title='Edited elsewhere';f.setData(next);
 await assert.rejects(f.execute(preview.action,{planId:'plan',confirmation:preview.approval}),/changed|stale/i);assert.equal(f.writes.length,0);
});
test('AI deletion goes to Archive and persistent reviewed Undo survives a lost acknowledgement',async()=>{
 const f=await plannerFixture(state()),action={type:'delete_task',args:{taskId:'t'}},preview=await f.context.previewKairosAction(action,{planId:'plan'});
 await f.execute(preview.action,{planId:'plan',confirmation:preview.approval,operationId:'archive',createdAt:1000});assert.equal(f.data().boards[0].sections[0].tasks[0].archived,true);
 const review=await f.context.loadActionUndoPreview('plan','one');f.setFail(true);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',review.command,review.expected,'undo-archive',1001),/lost/i);
 await f.context.persistTaskListCommand('plan','one',review.command,review.expected,'undo-archive',1001);
 assert.equal(f.data().boards[0].sections[0].tasks[0].archived,false);assert.equal(f.data().aiActionReceipts.length,2);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',review.command,review.expected,'second-undo',1002),/unavailable|used/i);
});
test('Undo leaves concurrent notes intact and rejects a later edit to an affected field',async()=>{
 const f=await plannerFixture(state());await f.execute({type:'update_task',args:{taskId:'t',newTitle:'Revision'}},{operationId:'rename',createdAt:1000});
 const review=await f.context.loadActionUndoPreview('plan','one'),next=f.data();next.boards[0].sections[0].tasks[0].notes='Keep';f.setData(next);
 await f.context.persistTaskListCommand('plan','one',review.command,review.expected,'undo-name',1001);assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Keep');assert.equal(f.data().boards[0].sections[0].tasks[0].title,'Read');
});


test('AI creation reviews include scheduled date, times and destination',async()=>{
 const f=await plannerFixture(state()),preview=await f.context.previewKairosAction({type:'create_task',args:{boardId:'b',sectionId:'s',title:'Call',date:'2026-10-25',startTime:'09:00',endTime:'10:00'}},{planId:'plan'});
 for(const value of ['2026-10-25','09:00','10:00','School / General'])assert.ok(preview.summary.rows.some(row=>row.after===value),'Missing review value: '+value);
 const event=await f.context.previewKairosAction({type:'create_schedule_event',args:{title:'Ride',day:0,start:'16:30',end:'17:30'}},{planId:'plan'});
 for(const value of ['Sunday','16:30','17:30'])assert.ok(event.summary.rows.some(row=>row.after===value));
});
test('AI Undo refuses new times, locks, deadlines or recurrence instead of saving an invalid schedule',async()=>{
 for(const changes of [{startTime:'09:00',endTime:'10:00'},{scheduleLocked:true},{dueDate:'2026-10-26'},{recurrence:{enabled:true,frequency:'daily',startDate:'2026-10-25',mode:'fixed'}}]){
  const f=await plannerFixture(state());await f.execute({type:'update_task',args:{taskId:'t',date:'2026-10-25'}},{operationId:'dated',createdAt:1000});
  const review=await f.context.loadActionUndoPreview('plan','one'),next=f.data();Object.assign(next.boards[0].sections[0].tasks[0],changes);f.setData(next);
  await assert.rejects(f.context.persistTaskListCommand('plan','one',review.command,review.expected,'undo-date',1001),/changed|schedule/i);
  assert.equal(f.data().boards[0].sections[0].tasks[0].date,'2026-10-25');assert.equal(f.writes.length,1);
 }
});


test('AI completion uses the shared rule for recurring series and reminder edits use task validation',async()=>{
 const initial=state();initial.boards[0].sections[0].tasks[0].recurrence={enabled:true,frequency:'daily',startDate:'2026-10-25',mode:'flexible'};
 const f=await plannerFixture(initial);await assert.rejects(f.execute({type:'complete_task',args:{taskId:'t'}}),/occurrence|recurring/i);assert.equal(f.writes.length,0);
});

