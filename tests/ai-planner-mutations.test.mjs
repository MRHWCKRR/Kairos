import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const plan=()=>({userID:'one',boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'one',title:'Essay'}]}]}]});
const create={type:'create_task',args:{title:'Revision'}};

test('replaying a confirmed operation returns its result without creating duplicates',async()=>{
  const f=await plannerFixture(plan());
  const options={operationId:'operation-one',ownerId:'one',planId:'plan'};
  const first=await f.execute(create,options);
  const second=await f.execute(create,options);
  assert.equal(first.task.id,second.task.id);
  assert.equal(f.writes.length,1);
});
test('retry after lost response reconciles the committed action',async()=>{
  const f=await plannerFixture(plan(),{failAfterCommit:true});
  const options={operationId:'operation-two',ownerId:'one',planId:'plan'};
  await assert.rejects(f.execute(create,options),/lost/);
  await f.execute(create,options);
  assert.equal(f.data().boards[0].sections[0].tasks.filter(t=>t.title==='Revision').length,1);
});
test('transaction retry does not append the created task twice',async()=>{
  const f=await plannerFixture(plan(),{retryTransaction:true});
  await f.execute(create,{operationId:'retry-one',ownerId:'one',planId:'plan'});
  assert.equal(f.data().boards[0].sections[0].tasks.filter(t=>t.title==='Revision').length,1);
  assert.equal(f.events(),1);
});
test('an operation ID cannot be reused for different arguments',async()=>{
  const f=await plannerFixture(plan());
  const options={operationId:'same-id',ownerId:'one',planId:'plan'};
  await f.execute(create,options);
  await assert.rejects(f.execute({type:'create_task',args:{title:'Other'}},options),/different action/i);
});
test('account change rejects a pending operation before writing',async()=>{
  const f=await plannerFixture(plan());
  await assert.rejects(f.execute(create,{operationId:'account-test',ownerId:'other',planId:'plan'}),/account/i);
  assert.equal(f.writes.length,0);
});
test('shared UI save preserves a concurrent committed AI task',async()=>{
  const f=await plannerFixture(plan());
  const before=structuredClone(plan());
  await f.execute(create,{operationId:'ai-create',ownerId:'one',planId:'plan'});
  const local=structuredClone(before);local.boards[0].sections[0].tasks[0].completed=true;
  assert.equal(typeof f.context.savePlannerEdits,'function','shared store is available');
  await f.context.savePlannerEdits('plan','one',before,local);
  assert.equal(f.data().boards[0].sections[0].tasks.length,2);
  assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);
});

test('replay compares arguments by value after Firestore map key ordering changes',async()=>{
  const f=await plannerFixture(plan());
  const options={operationId:'ordered-replay',ownerId:'one',planId:'plan'};
  const first=await f.execute({type:'create_task',args:{title:'Revision',board:'Study'}},options);
  const second=await f.execute({type:'create_task',args:{board:'Study',title:'Revision'}},options);
  assert.equal(first.task.id,second.task.id);
  assert.equal(f.writes.length,1);
});

test('UI can save an edit to a migrated legacy sections-only plan',async()=>{
  const legacy={userID:'one',sections:[{id:'s',title:'General',tasks:[{id:'one',title:'Essay'}]}]};
  const f=await plannerFixture(legacy);
  const base={boards:[{id:'legacy-board',title:'My Routine',archived:false,sections:legacy.sections}],dayInsights:{},scheduleEvents:[]};
  const local=structuredClone(base);local.boards[0].sections[0].tasks[0].title='Updated essay';
  await f.context.savePlannerEdits('plan','one',base,local);
  assert.equal(f.data().boards[0].sections[0].tasks[0].title,'Updated essay');
});

test('duplicate destination board names are rejected before any save',async()=>{
  const data=plan();
  data.boards.push({id:'other',title:'Study',sections:[]});
  const f=await plannerFixture(data);
  await assert.rejects(f.execute({type:'create_task',args:{title:'Revision',board:'Study'}}),/multiple boards/i);
  assert.equal(f.writes.length,0);
});

test('section-only task moves stay within the original board',async()=>{
  const data=plan();
  data.boards[0].sections.push({id:'next',title:'Next',tasks:[]});
  data.boards.unshift({id:'other',title:'Other',sections:[{id:'other-next',title:'Next',tasks:[]}]});
  const f=await plannerFixture(data);
  const result=await f.execute({type:'update_task',args:{taskId:'one',section:'Next'}});
  assert.equal(result.board,'Study');
  assert.equal(f.data().boards[0].sections[0].tasks.length,0);
  assert.equal(f.data().boards[1].sections[1].tasks[0].id,'one');
});
