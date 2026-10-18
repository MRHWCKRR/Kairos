import test from 'node:test';
import assert from 'node:assert/strict';
let m={};try{m=await import('../assignment-order.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Essay',sessionOrder:'sequential'},{id:'a',title:'Research',assignmentId:'p',sessionIndex:1,date:'2026-10-18',startTime:'09:00',endTime:'10:00'},{id:'b',title:'Draft',assignmentId:'p',sessionIndex:2,date:'2026-10-18',startTime:'10:00',endTime:'11:00'}]}]}]});
test('ordered sessions distinguish ready, waiting and completed without changing completion',()=>{
 assert.equal(typeof m.assignmentReadiness,'function');const s=state(),r=m.assignmentReadiness(s);assert.equal(r.get('a').state,'ready');assert.equal(r.get('b').state,'waiting');assert.equal(r.get('b').waitingFor,'a');s.boards[0].sections[0].tasks[1].completed=true;assert.equal(m.assignmentReadiness(s).get('b').state,'ready');assert.equal(s.boards[0].sections[0].tasks[0].completed,undefined);
});
test('moving an earlier ordered session expands the review to unfinished movable successors',()=>{
 assert.equal(typeof m.expandOrderedTaskIds,'function');const s=state();assert.deepEqual(m.expandOrderedTaskIds(s,['a']),['a','b']);assert.deepEqual(m.expandOrderedTaskIds(s,['b']),['b']);s.boards[0].sections[0].tasks[2].scheduleLocked=true;assert.deepEqual(m.expandOrderedTaskIds(s,['a']),['a']);
});
test('order validation rejects reversed times, ambiguous indexes and unscheduled prerequisites',()=>{
 assert.equal(typeof m.assertAssignmentOrder,'function');const s=state();assert.doesNotThrow(()=>m.assertAssignmentOrder(s));s.boards[0].sections[0].tasks[2].startTime='08:00';assert.throws(()=>m.assertAssignmentOrder(s),/order|prerequisite/i);s.boards[0].sections[0].tasks[0].sessionOrder='independent';assert.doesNotThrow(()=>m.assertAssignmentOrder(s));
 const duplicate=state();duplicate.boards[0].sections[0].tasks[2].sessionIndex=1;assert.throws(()=>m.assertAssignmentOrder(duplicate),/index|number|order/i);
});
test('unrelated edits do not get blocked by an existing order problem, but new violations do',()=>{
 assert.equal(typeof m.validateAssignmentOrderChanges,'function');const before=state(),after=structuredClone(before);after.boards[0].sections[0].tasks[1].startTime='11:30';assert.throws(()=>m.validateAssignmentOrderChanges(before,after),/order/i);const invalid=structuredClone(after),notes=structuredClone(invalid);notes.boards[0].sections[0].tasks[1].notes='Keep typing';assert.doesNotThrow(()=>m.validateAssignmentOrderChanges(invalid,notes));
});
test('reopening work stays possible and flags saved times that now need rescheduling',()=>{
 const s=state();s.boards[0].sections[0].tasks[1].completed=true;s.boards[0].sections[0].tasks[1].date='2026-10-19';const reopened=structuredClone(s);reopened.boards[0].sections[0].tasks[1].completed=false;
 assert.doesNotThrow(()=>m.validateAssignmentOrderChanges(s,reopened));assert.equal(m.assignmentReadiness(reopened).get('b').state,'waiting');assert.equal(m.assignmentReadiness(reopened).get('b').needsReschedule,true);
});
test('an overnight prerequisite ends on the following date and allows exact adjacency',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;tasks[1].startTime='23:30';tasks[1].endTime='00:30';tasks[2].date='2026-10-19';tasks[2].startTime='00:30';tasks[2].endTime='01:30';assert.doesNotThrow(()=>m.assertAssignmentOrder(s));assert.deepEqual(m.orderedPlacementClock(s,tasks[2],{date:'2026-10-18',time:'06:00'}),{date:'2026-10-19',time:'00:29'});
});
