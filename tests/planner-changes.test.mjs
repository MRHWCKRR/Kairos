import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerChanges,undoPlannerChanges,plannerChangeRows} from '../planner-changes.js';
const state=()=>({boards:[{id:'b',title:'School',archived:false,sections:[{id:'s',title:'General',tasks:[{id:'t',title:'Read',date:null,notes:'Keep'}]}]}],dayInsights:{},scheduleEvents:[]});
test('Undo only touches changed fields and preserves concurrent unrelated tasks/notes',()=>{
 const before=state(),after=structuredClone(before);after.boards[0].sections[0].tasks[0].date='2026-10-25';
 const changes=plannerChanges(before,after),live=structuredClone(after);
 live.boards[0].sections[0].tasks[0].notes='New notes';live.boards[0].sections[0].tasks.push({id:'other',title:'Other'});
 const restored=undoPlannerChanges(live,changes);assert.equal(restored.boards[0].sections[0].tasks[0].date,null);assert.equal(restored.boards[0].sections[0].tasks[0].notes,'New notes');assert.equal(restored.boards[0].sections[0].tasks.length,2);
 live.boards[0].sections[0].tasks[0].date='2026-10-26';assert.throws(()=>undoPlannerChanges(live,changes),/changed/i);
 assert.match(plannerChangeRows(before,after)[0].title,/Read/);
});
test('Undo creation refuses to delete work edited after creation',()=>{
 const before=state(),after=structuredClone(before);after.boards[0].sections[0].tasks.push({id:'new',title:'New'});
 const changes=plannerChanges(before,after);assert.deepEqual(undoPlannerChanges(after,changes),before);
 after.boards[0].sections[0].tasks[1].title='Edited';assert.throws(()=>undoPlannerChanges(after,changes),/changed/i);
});
test('Undo handles task moves atomically without mutating a conflicting live plan',()=>{
 const before=state();before.boards[0].sections.push({id:'s2',title:'Next',tasks:[]});const after=structuredClone(before);
 after.boards[0].sections[1].tasks.push(after.boards[0].sections[0].tasks.pop());
 assert.deepEqual(undoPlannerChanges(after,plannerChanges(before,after)),before);
});

