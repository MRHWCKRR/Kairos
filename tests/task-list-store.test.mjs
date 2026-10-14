import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand} from '../task-list-model.js';
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
