import test from 'node:test';import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const target={boardId:'b',sectionId:'s'},creation={type:'create_task',target,task:{id:'new',title:'Read',estimatedMinutes:30}};
const initial=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[]}]}]});
const undo={type:'undo_create_task',target:{taskId:'new'},sourceOperationId:'capture-source'};
function created(){const result=applyTaskListCommand(initial(),creation,target);return {data:result.next,expected:{...target,task:structuredClone(result.result.task)}}}
test('Undo archives only the unchanged created task without mutating its source snapshot',()=>{
 const {data,expected}=created(),before=structuredClone(data);const result=applyTaskListCommand(data,undo,expected);
 assert.deepEqual(data,before);assert.equal(result.next.boards[0].sections[0].tasks[0].archived,true);assert.equal(result.next.boards[0].sections[0].tasks[0].completed,false);
});
test('Undo blocks later content, scheduling, completion, focus and membership changes',()=>{
 for(const patch of [{title:'Edited'},{notes:'Keep this'},{checklist:[]},{completed:true},{date:'2026-10-21'},{estimatedMinutes:45},{focusSeconds:5}]){
  const {data,expected}=created();Object.assign(data.boards[0].sections[0].tasks[0],patch);assert.throws(()=>applyTaskListCommand(data,undo,expected),/changed|review/i);
 }
 const {data,expected}=created();data.boards[0].sections[0].id='moved';assert.throws(()=>applyTaskListCommand(data,undo,expected));
});
test('Undo requires its creation receipt and a lost-response retry writes once',async()=>{
 const f=await plannerFixture(initial()),time=Date.now();
 const result=await f.context.persistTaskListCommand('plan','one',creation,target,'capture-source',time);
 const expected={...target,task:result.createdTask};
 await assert.rejects(f.context.persistTaskListCommand('plan','one',{...undo,sourceOperationId:'missing'},expected,'undo-missing',time+1),/creation|receipt/i);
 const transaction=f.context.runTransaction;let lose=true;f.context.runTransaction=async(...args)=>{const value=await transaction(...args);if(lose){lose=false;throw Error('Lost response')}return value};
 await assert.rejects(f.context.persistTaskListCommand('plan','one',undo,expected,'undo-once',time+2),/Lost response/);
 await f.context.persistTaskListCommand('plan','one',undo,expected,'undo-once',time+2);
 assert.equal(f.writes.length,2);assert.equal(f.data().boards[0].sections[0].tasks[0].archived,true);
 assert.equal(f.data().aiActionReceipts.find(item=>item.id==='capture-source').creationUndoUsedBy,'undo-once');
 await assert.rejects(f.context.persistTaskListCommand('plan','one',undo,expected,'different-undo',time+3),/already undone/);
});
