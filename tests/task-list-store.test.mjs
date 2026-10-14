import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand} from '../task-list-model.js';
import {stableStringify} from '../plan-merge.js';
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',notes:'Old'}]}]}]});
const command={type:'edit_task',target:{taskId:'t'},changes:{notes:'New'}};
const expected={boardId:'b',sectionId:'s',fields:{notes:'Old'}};
test('uncertain detail saves replay their receipt without applying twice',async()=>{
  const f=await plannerFixture(data(),{failAfterCommit:true});f.context.applyTaskListCommand=applyTaskListCommand;
  assert.equal(typeof f.context.persistTaskListCommand,'function');
  await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'detail-op',Date.now()),/response lost/);
  await f.context.persistTaskListCommand('plan','one',command,expected,'detail-op',Date.now());
  assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'New');
});
test('detail saves reject another owner and changed touched fields',async()=>{
  const f=await plannerFixture(data());f.context.applyTaskListCommand=applyTaskListCommand;
  assert.equal(typeof f.context.persistTaskListCommand,'function');
  await assert.rejects(f.context.persistTaskListCommand('plan','other',command,expected,'owner',Date.now()),/another account/);
  await assert.rejects(f.context.persistTaskListCommand('plan','one',command,{...expected,fields:{notes:'Stale'}},'conflict',Date.now()),/changed/);
  assert.equal(f.writes.length,0);
});
test('a lost checklist add response does not duplicate a step on retry',async()=>{
  const f=await plannerFixture(data(),{failAfterCommit:true});f.context.applyTaskListCommand=applyTaskListCommand;
  const add={type:'add_checklist_item',target:{taskId:'t'},item:{id:'a',title:'Read',completed:false}},baseline={boardId:'b',sectionId:'s',fields:{checklist:[]}},createdAt=Date.now();
  await assert.rejects(f.context.persistTaskListCommand('plan','one',add,baseline,'step-op',createdAt),/response lost/);
  await f.context.persistTaskListCommand('plan','one',add,baseline,'step-op',createdAt);
  assert.equal(f.data().boards[0].sections[0].tasks[0].checklist.length,1);assert.equal(f.writes.length,1);
});
test('durable checklist receipts stay compact even for a full checklist draft',async()=>{
  const f=await plannerFixture(data());f.context.applyTaskListCommand=applyTaskListCommand;
  const checklist=Array.from({length:100},(_,i)=>({id:'step-'+i,title:'X'.repeat(180),completed:false}));
  await f.context.persistTaskListCommand('plan','one',{type:'edit_task',target:{taskId:'t'},changes:{checklist}},{boardId:'b',sectionId:'s',fields:{checklist:[]}},'large-checklist',Date.now());
  assert.ok(f.data().aiActionReceipts[0].fingerprint.length<200,'receipt should store a digest, not full checklist text');
});
test('legacy Stage 1 detail receipts reconcile after command digests are introduced',async()=>{
  const original=data();original.boards[0].sections[0].tasks[0].notes='New';original.aiActionReceipts=[{id:'legacy',fingerprint:stableStringify({command,expected}),result:{type:'edit_task',task:{id:'t',title:'Science'}}}];
  const f=await plannerFixture(original);f.context.applyTaskListCommand=applyTaskListCommand;
  const result=await f.context.persistTaskListCommand('plan','one',command,expected,'legacy',Date.now());
  assert.equal(result.task.id,'t');assert.equal(f.writes.length,0);
  await assert.rejects(f.context.persistTaskListCommand('plan','one',{...command,changes:{notes:'Different'}},expected,'legacy',Date.now()),/different action/);
});
