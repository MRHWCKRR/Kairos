import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const target={boardId:'b',sectionId:'s'};
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[]}]}]});
const create=(task,data=state())=>applyTaskListCommand(data,{type:'create_task',target,task:{id:'t',title:'Revision',...task}},target);
test('capture saves optional planning fields atomically without scheduling a start time',()=>{
 const data=state(),before=structuredClone(data),result=create({date:'2026-10-22',dueDate:'2026-10-23',estimatedMinutes:45},data);
 assert.deepEqual(data,before);assert.deepEqual(result.result.task,{id:'t',title:'Revision',date:'2026-10-22',dueDate:'2026-10-23',estimatedMinutes:45,completed:false,archived:false});
});
test('title-only section capture retains its existing task shape',()=>{
 assert.deepEqual(create({title:'  Read  '}).result.task,{id:'t',title:'Read',completed:false,date:null,archived:false});
});
test('capture validates dates, estimates, unexpected fields and destination before writing',()=>{
 for(const extra of [{date:'2026-02-30'},{dueDate:'bad'},{estimatedMinutes:0},{estimatedMinutes:1.5},{estimatedMinutes:1441},{date:'2026-10-25',dueDate:'2026-10-24'},{completed:true},{notes:'unreviewed'}])assert.throws(()=>create(extra));
 const archived=state();archived.boards[0].sections[0].archived=true;assert.throws(()=>create({estimatedMinutes:30},archived));
});
test('task and optional fields save once after a lost response or transaction retry',async()=>{
 for(const options of [{failAfterCommit:true},{retryTransaction:true}]){
  const f=await plannerFixture({userID:'one',...state()},options),command={type:'create_task',target,task:{id:'captured',title:'Read',date:'2026-10-22',dueDate:'2026-10-23',estimatedMinutes:25}},time=Date.now();
  if(options.failAfterCommit)await assert.rejects(f.context.persistTaskListCommand('plan','one',command,target,'capture-retry',time),/response lost/);
  await f.context.persistTaskListCommand('plan','one',command,target,'capture-retry',time);
  assert.equal(f.writes.length,1);const tasks=f.data().boards[0].sections[0].tasks;assert.equal(tasks.length,1);assert.equal(tasks[0].estimatedMinutes,25);assert.equal(tasks[0].dueDate,'2026-10-23');
 }
});
