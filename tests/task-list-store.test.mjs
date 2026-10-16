import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand,buildTaskBatch} from '../task-list-model.js';
import {stableStringify} from '../plan-merge.js';
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',notes:'Old'}]}]}]});
const command={type:'edit_task',target:{taskId:'t'},changes:{notes:'New'}};
const expected={boardId:'b',sectionId:'s',fields:{notes:'Old'}};

test('a section move lost response replays one compact durable receipt',async()=>{
 const input=data();input.boards.push({id:'other',sections:[]});const f=await plannerFixture(input,{failAfterCommit:true});f.context.applyTaskListCommand=applyTaskListCommand;
 const command={type:'move_section',target:{boardId:'b',sectionId:'s'},destination:{boardId:'other',index:0}},expected={sourceOrder:['s'],destinationOrder:[]},createdAt=Date.now();
 await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'section-op',createdAt),/response lost/);
 await f.context.persistTaskListCommand('plan','one',command,expected,'section-op',createdAt);assert.equal(f.writes.length,1);assert.equal(f.data().boards[1].sections[0].tasks[0].notes,'Old');assert.ok(JSON.stringify(f.data().aiActionReceipts[0]).length<500);
});
const batchData=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'A',notes:'X'.repeat(3000)},{id:'c',title:'C'}]}]}]});
test('a lost batch response and transaction callback replay return one compact receipt',async()=>{
 for(const options of [{failAfterCommit:true},{retryTransaction:true}]){
  const input=batchData(),f=await plannerFixture(input,options);f.context.applyTaskListCommand=applyTaskListCommand;const op=buildTaskBatch(input,'complete',['a','c']),createdAt=Date.now();
  if(options.failAfterCommit)await assert.rejects(f.context.persistTaskListCommand('plan','one',op.command,op.expected,'batch',createdAt),/response lost/);
  const result=await f.context.persistTaskListCommand('plan','one',op.command,op.expected,'batch',createdAt);assert.deepEqual(Array.from(result.taskIds),['a','c']);assert.deepEqual(Array.from(result.completedTaskIds),['a','c']);assert.equal(result.action,'complete');assert.equal(f.writes.length,1);assert.ok(JSON.stringify(f.data().aiActionReceipts[0]).length<1000);assert.equal(f.data().boards[0].sections[0].tasks[0].notes.length,3000);
 }
});
test('batch ownership, one-member conflicts, oversize and quota errors never partially write',async()=>{
 const input=batchData(),f=await plannerFixture(input);f.context.applyTaskListCommand=applyTaskListCommand;const op=buildTaskBatch(input,'complete',['a','c']);
 await assert.rejects(f.context.persistTaskListCommand('plan','other',op.command,op.expected,'wrong',Date.now()),/another account/);
 const stale=structuredClone(op.expected);stale.tasks[1].value=true;await assert.rejects(f.context.persistTaskListCommand('plan','one',op.command,stale,'stale',Date.now()),/changed/);assert.equal(f.writes.length,0);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',{...op.command,taskIds:Array.from({length:51},(_,i)=>'t'+i)},op.expected,'size',Date.now()),/50/);assert.equal(f.writes.length,0);
 f.context.runTransaction=async(_,callback)=>callback({get:async()=>({exists:()=>true,data:()=>structuredClone(input)}),set(){throw Error('Quota exceeded')}});await assert.rejects(f.context.persistTaskListCommand('plan','one',op.command,op.expected,'quota',Date.now()),/Quota/);assert.deepEqual(f.data(),input);
});
test('receipt size eviction advances the floor and refuses an evicted batch replay',async()=>{
 const input=batchData(),createdAt=Date.now()-1000;input.aiActionReceipts=Array.from({length:90},(_,i)=>({id:'old'+i,createdAt:createdAt+i,fingerprint:'X'.repeat(2000),result:{type:'edit_task'}}));const f=await plannerFixture(input);f.context.applyTaskListCommand=applyTaskListCommand;const op=buildTaskBatch(input,'complete',['a','c']);
 await f.context.persistTaskListCommand('plan','one',op.command,op.expected,'new',Date.now());assert.ok(JSON.stringify(f.data().aiActionReceipts).length<=65536);assert.ok(f.data().aiActionReceiptFloor>=createdAt);assert.equal(f.data().aiActionReceipts.at(-1).id,'new');
 await assert.rejects(f.context.persistTaskListCommand('plan','one',op.command,op.expected,'old0',createdAt),/too old/);assert.equal(f.writes.length,1);
});
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
