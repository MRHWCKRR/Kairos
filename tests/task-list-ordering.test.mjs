import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
import {mergePlanEdits} from '../plan-merge.js';
const data=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Same',checklist:[{id:'step',title:'Read',completed:true}],unknown:42},{id:'hidden',title:'Done',completed:true},{id:'c',title:'Same'}]},{id:'empty',tasks:[]},{id:'other',tasks:[]}]}]});
const tasks=d=>d.boards[0].sections[0].tasks;
const reorder={type:'reorder_tasks',target:{boardId:'b',sectionId:'s'},taskIds:['c','a','hidden']};
const order={boardId:'b',sectionId:'s',order:['a','hidden','c']};
const moving={type:'move_task',target:{taskId:'a'},destination:{boardId:'b',sectionId:'empty',index:0}};
const moveExpected={boardId:'b',sectionId:'s',sourceOrder:['a','hidden','c'],destinationOrder:[]};
test('reordering uses exact IDs and preserves unknown fields and concurrent text',()=>{
  const input=data();tasks(input)[0].notes='Remote';const out=applyTaskListCommand(input,reorder,order);
  assert.deepEqual(tasks(out.next).map(t=>t.id),['c','a','hidden']);assert.equal(tasks(out.next)[1].notes,'Remote');assert.equal(tasks(out.next)[1].unknown,42);assert.equal(tasks(input)[0].id,'a');
});
test('competing order changes and malformed permutations reject without mutation',()=>{
  const input=data();tasks(input).reverse();assert.throws(()=>applyTaskListCommand(input,reorder,order),/order/i);
  for(const taskIds of [['a','c'],['a','a','c'],['a','hidden','missing']])assert.throws(()=>applyTaskListCommand(data(),{...reorder,taskIds},order));
});
test('moving to an empty section carries checklist and rejects a second concurrent move',()=>{
  const out=applyTaskListCommand(data(),moving,moveExpected);assert.equal(out.next.boards[0].sections[1].tasks[0].checklist[0].completed,true);assert.equal(out.next.boards[0].sections[1].tasks[0].unknown,42);
  assert.throws(()=>applyTaskListCommand(out.next,{...moving,destination:{boardId:'b',sectionId:'other',index:0}},moveExpected),/moved/i);
  const remote=structuredClone(out.next);remote.boards[0].sections[1].tasks[0].notes='After move';const undo=applyTaskListCommand(remote,{type:'undo_task_list',inverse:out.result.inverse,expiresAt:10000},{},{now:5000});assert.equal(tasks(undo.next)[0].notes,'After move');assert.deepEqual(tasks(undo.next).map(t=>t.id),order.order);
});
test('moves validate global task identity and destination state',()=>{
  const duplicate=data();duplicate.boards[0].sections[2].tasks.push({id:'a'});assert.throws(()=>applyTaskListCommand(duplicate,moving,moveExpected),/ambiguous|duplicate/i);
  for(const mutate of [d=>d.boards[0].sections[1].archived=true,d=>d.boards[0].sections.splice(1,1)]){const input=data();mutate(input);assert.throws(()=>applyTaskListCommand(input,moving,moveExpected));}
  assert.throws(()=>applyTaskListCommand(data(),{...moving,destination:{boardId:'b',sectionId:'empty',index:1}},moveExpected));
});
test('completion and archive Undo preserve newer unrelated text but reject affected-field changes or expiry',()=>{
  for(const type of ['complete_task','archive_task']){
    const key=type==='complete_task'?'completed':'archived',command={type,target:{taskId:'a'},value:true},expected={boardId:'b',sectionId:'s',value:false};
    const out=applyTaskListCommand(data(),command,expected);assert.equal(tasks(out.next)[0][key],true);
    tasks(out.next)[0].notes='Remote';const inverse={type:'undo_task_list',inverse:out.result.inverse,expiresAt:10000};
    const undone=applyTaskListCommand(out.next,inverse,{},{now:5000});assert.equal(tasks(undone.next)[0][key],false);assert.equal(tasks(undone.next)[0].notes,'Remote');
    assert.throws(()=>applyTaskListCommand(out.next,inverse,{},{now:10000}),/expired/i);tasks(out.next)[0][key]=false;assert.throws(()=>applyTaskListCommand(out.next,inverse,{},{now:5000}),/changed/i);
  }
});
test('Undo order guards refuse newer reorders and unsupported inverse fields',()=>{
  const out=applyTaskListCommand(data(),reorder,order);tasks(out.next).reverse();assert.throws(()=>applyTaskListCommand(out.next,{type:'undo_task_list',inverse:out.result.inverse,expiresAt:10000},{},{now:5000}),/order/i);
  assert.throws(()=>applyTaskListCommand(data(),{type:'undo_task_list',inverse:{command:{type:'edit_task',target:{taskId:'a'},changes:{title:'Unsafe'}}},expiresAt:10000},{},{now:5000}));
});
test('plan rebases reject different concurrent reorders but merge a reorder with text edits',()=>{
  const base=data(),local=data(),remote=data();tasks(local).reverse();tasks(remote)[0].notes='Remote';assert.equal(tasks(mergePlanEdits(base,local,remote))[2].notes,'Remote');
  tasks(remote).push(tasks(remote).shift());assert.throws(()=>mergePlanEdits(base,local,remote),/order/i);
});
test('rebasing two moves of one task cannot duplicate it into different sections',()=>{
  const base=data(),local=data(),remote=data();local.boards[0].sections[1].tasks.push(tasks(local).shift());remote.boards[0].sections[2].tasks.push(tasks(remote).shift());assert.throws(()=>mergePlanEdits(base,local,remote),/duplicate|moved/i);
});
