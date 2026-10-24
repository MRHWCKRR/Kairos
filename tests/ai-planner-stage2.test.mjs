import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';

const plan=()=>({userID:'one',boards:[
  {id:'b1',title:'Study',sections:[{id:'s1',title:'General',tasks:[{id:'t1',title:'Revision',date:'2026-10-14',startTime:'13:00',endTime:'15:00',estimatedMinutes:30}]}]},
  {id:'b2',title:'Study',sections:[{id:'s2',title:'General',tasks:[]}]}
]});

test('board ID permits exact rename when names are duplicated',async()=>{
  const f=await plannerFixture(plan());
  const r=await f.execute({type:'update_board',args:{boardId:'b2',newTitle:'Science'}});
  assert.equal(r.board.id,'b2');
  assert.equal(f.data().boards[0].title,'Study');
  assert.equal(f.data().boards[1].title,'Science');
});
test('section creation, rename, archive and restoration use the existing nested schema',async()=>{
  const f=await plannerFixture(plan());
  const created=await f.execute({type:'create_section',args:{boardId:'b2',title:'Research'}});
  const sectionId=created.section.id;
  await f.execute({type:'update_section',args:{sectionId,newTitle:'Drafting'}});
  let preview=await f.context.previewKairosAction({type:'update_section',args:{sectionId,archived:true}},{planId:'plan'});
  await f.execute(preview.action,{confirmation:preview.approval});
  assert.equal(f.data().boards[1].sections[1].archived,true);
  await f.execute({type:'update_section',args:{sectionId,archived:false}});
  assert.equal(f.data().boards[1].sections[1].title,'Drafting');
  assert.equal(f.data().boards[1].sections[1].archived,false);
});
test('task moves use precise board and section IDs without duplication',async()=>{
  const f=await plannerFixture(plan());
  await f.execute({type:'update_task',args:{taskId:'t1',boardId:'b2',sectionId:'s2'}});
  assert.equal(f.data().boards[0].sections[0].tasks.length,0);
  assert.equal(f.data().boards[1].sections[0].tasks[0].id,'t1');
});
test('invalid or cross-board section IDs never fall back to names or create a destination',async()=>{
  const f=await plannerFixture(plan());
  for(const args of [
    {taskId:'t1',boardId:'missing',board:'Study'},
    {taskId:'t1',boardId:'b1',sectionId:'s2'},
    {taskId:'t1',boardId:'b1',sectionId:'missing',section:'General'}
  ])await assert.rejects(f.execute({type:'update_task',args}),/not found|belong/i);
  assert.equal(f.writes.length,0);
});
test('board deletion previews children and cannot execute without matching confirmation',async()=>{
  const f=await plannerFixture(plan()),action={type:'delete_board',args:{boardId:'b1'}};
  await assert.rejects(f.execute(action),/confirmation/i);
  const preview=await f.context.previewKairosAction(action,{planId:'plan'});
  assert.equal(preview.summary.taskCount,1);
  assert.equal(preview.summary.sectionCount,1);
  assert.equal(preview.summary.sections[0].tasks[0].title,'Revision');
  await f.execute(preview.action,{confirmation:preview.approval});
  assert.deepEqual(f.data().boards.filter(b=>!b.archived).map(b=>b.id),['b2']);
  assert.equal(f.data().boards[0].sections[0].tasks[0].id,'t1');
});
test('section deletion archives only the confirmed section and retains its tasks',async()=>{
  const f=await plannerFixture(plan());
  const preview=await f.context.previewKairosAction({type:'delete_section',args:{sectionId:'s1'}},{planId:'plan'});
  await f.execute(preview.action,{confirmation:preview.approval});
  assert.equal(f.data().boards[0].sections[0].archived,true);
  assert.equal(f.data().boards[0].sections[0].tasks[0].id,'t1');
  assert.equal(f.data().boards[1].sections.length,1);
});
test('changed board contents require another preview before deletion',async()=>{
  const f=await plannerFixture(plan());
  const action={type:'delete_board',args:{boardId:'b1'}};
  const preview=await f.context.previewKairosAction(action,{planId:'plan'});
  await f.execute({type:'create_task',args:{title:'New work',boardId:'b1',sectionId:'s1'}});
  await assert.rejects(f.execute(preview.action,{confirmation:preview.approval}),/changed.*review/i);
  assert.equal(f.data().boards.length,2);
  assert.equal(f.data().boards[0].sections[0].tasks.length,2);
});
test('archive keeps children intact and restore can find an archived board by ID',async()=>{
  const f=await plannerFixture(plan());
  const preview=await f.context.previewKairosAction({type:'update_board',args:{boardId:'b1',archived:true}},{planId:'plan'});
  await f.execute(preview.action,{confirmation:preview.approval});
  assert.equal(f.data().boards[0].sections[0].tasks[0].id,'t1');
  await f.execute({type:'update_board',args:{boardId:'b1',archived:false}});
  assert.equal(f.data().boards[0].archived,false);
});
test('ordinary start-time move preserves duration and explicit resize changes it',async()=>{
  const f=await plannerFixture(plan());
  await f.execute({type:'update_task',args:{taskId:'t1',startTime:'14:00'}});
  assert.equal(f.data().boards[0].sections[0].tasks[0].endTime,'16:00');
  await f.execute({type:'resize_task',args:{taskId:'t1',endTime:'17:00'}},{allowDurationChange:true});
  const task=f.data().boards[0].sections[0].tasks[0];
  assert.equal(task.endTime,'17:00');
  assert.equal(task.lastScheduledMinutes,180);
  assert.equal(task.estimatedMinutes,180);
});
test('duration changes require explicit user intent and respect locks and recurrence',async()=>{
  const f=await plannerFixture(plan());
  await assert.rejects(f.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:90}}),/explicit.*duration/i);
  const data=plan();data.boards[0].sections[0].tasks[0].scheduleLocked=true;
  const locked=await plannerFixture(data);
  await assert.rejects(locked.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:90}},{allowDurationChange:true}),/locked/i);
  data.boards[0].sections[0].tasks[0].scheduleLocked=false;
  data.boards[0].sections[0].tasks[0].recurrence={enabled:true};
  const recurring=await plannerFixture(data);
  await assert.rejects(recurring.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:90}},{allowDurationChange:true}),/recurring/i);
});
test('invalid durations, inverted times and calendar dates fail without writes',async()=>{
  const f=await plannerFixture(plan());
  for(const args of [{durationMinutes:0},{durationMinutes:1.5},{endTime:'12:00'},{endTime:'25:00'},{date:'2026-02-30',endTime:'17:00'}])
    await assert.rejects(f.execute({type:'resize_task',args:{taskId:'t1',...args}},{allowDurationChange:true}),/invalid/i);
  assert.equal(f.writes.length,0);
});
test('unscheduled task duration can be explicitly set without inventing a date',async()=>{
  const data=plan();const task=data.boards[0].sections[0].tasks[0];
  task.date=null;task.startTime=null;task.endTime=null;
  const f=await plannerFixture(data);
  await f.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:45}},{allowDurationChange:true});
  const saved=f.data().boards[0].sections[0].tasks[0];
  assert.equal(saved.estimatedMinutes,45);assert.equal(saved.date,null);assert.equal(saved.startTime,null);
});

test('moving to an existing empty board creates a valid destination section',async()=>{
  const data=plan();data.boards[1]={id:'b2',title:'Science',sections:[]};
  const f=await plannerFixture(data);
  await f.execute({type:'create_board',args:{title:'Science',moveTaskId:'t1'}});
  assert.equal(f.data().boards[0].sections[0].tasks.length,0);
  assert.equal(f.data().boards[1].sections[0].tasks[0].id,'t1');
});

test('duration-only resize validates unscheduled dates and rejects partial time clearing',async()=>{
  for(const scheduled of [true,false]){
    const data=plan(),task=data.boards[0].sections[0].tasks[0];
    if(!scheduled){task.startTime=null;task.endTime=null;task.date=null}
    const f=await plannerFixture(data);
    await assert.rejects(f.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:45,date:'2026-02-30'}},{allowDurationChange:true}),/invalid/i);
    await assert.rejects(f.execute({type:'resize_task',args:{taskId:'t1',durationMinutes:45,startTime:null}},{allowDurationChange:true}),/invalid/i);
    assert.equal(f.writes.length,0);
  }
});
