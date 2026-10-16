import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskListCommand} from '../task-list-model.js';
const state=()=>({boards:[{id:'b',sections:[{id:'s',title:'One',tasks:[{id:'t',notes:'Keep',recurrence:{enabled:true}}]},{id:'q',tasks:[]}]},{id:'c',sections:[]}]});
const move={type:'move_section',target:{boardId:'b',sectionId:'s'},destination:{boardId:'c',index:0}};
const expected={sourceOrder:['s','q'],destinationOrder:[]};
test('section move preserves complete task data and Undo restores location',()=>{
 const before=state(),out=applyTaskListCommand(before,move,expected);
 assert.deepEqual(out.next.boards[1].sections,[before.boards[0].sections[0]]);assert.deepEqual(before,state());
 const restored=applyTaskListCommand(out.next,{type:'undo_task_list',inverse:out.result.inverse,expiresAt:Date.now()+9000},{});
 assert.deepEqual(restored.next,before);
});
test('reorder sections keeps archived positions and all section data',()=>{
 const data=state();data.boards[0].sections.splice(1,0,{id:'arch',archived:true,tasks:[]});
 const out=applyTaskListCommand(data,{type:'reorder_sections',target:{boardId:'b'},sectionIds:['q','arch','s']},{order:['s','arch','q']});
 assert.deepEqual(out.next.boards[0].sections.map(s=>s.id),['q','arch','s']);
 assert.deepEqual(out.next.boards[0].sections[2],data.boards[0].sections[0]);
});
test('rejects stale orders, ambiguous IDs, archived targets and invalid insertion without mutating',()=>{
 for(const alter of [d=>d.boards[0].sections.reverse(),d=>d.boards[1].sections.push({id:'s'}),d=>d.boards[1].archived=true,d=>d.boards[0].sections[0].archived=true]){const data=state();alter(data);const before=structuredClone(data);assert.throws(()=>applyTaskListCommand(data,move,expected));assert.deepEqual(data,before)}
 assert.throws(()=>applyTaskListCommand(state(),{...move,destination:{boardId:'c',index:-1}},expected));
 assert.throws(()=>applyTaskListCommand(state(),{type:'reorder_sections',target:{boardId:'b'},sectionIds:['s','s']},{order:['s','q']}));
});
test('Undo refuses an intervening reorder but permits newer section contents',()=>{
 const out=applyTaskListCommand(state(),move,expected);out.next.boards[1].sections[0].tasks[0].notes='New';
 const undo={type:'undo_task_list',inverse:out.result.inverse,expiresAt:Date.now()+9000};
 assert.equal(applyTaskListCommand(out.next,undo,{}).next.boards[0].sections[0].tasks[0].notes,'New');
 out.next.boards[0].sections.push({id:'new',tasks:[]});assert.throws(()=>applyTaskListCommand(out.next,undo,{}));
});
