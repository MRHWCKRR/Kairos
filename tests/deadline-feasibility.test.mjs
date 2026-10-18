import test from 'node:test';import assert from 'node:assert/strict';
import * as model from '../deadline-feasibility.js';
const clock={date:'2026-10-18',time:'06:00'},options={dayStart:'07:00',dayEnd:'09:00',timezone:'UTC'};
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Essay',dueDate:'2026-10-18'},{id:'a',title:'Research',assignmentId:'p',sessionIndex:1,estimatedMinutes:60},{id:'b',title:'Draft',assignmentId:'p',sessionIndex:2,estimatedMinutes:60}]}]}],scheduleEvents:[]});
const check=(s,opts=options,c=clock)=>model.assignmentFeasibility(s,'p',opts,c);
test('a complete feasible plan reports remaining effort without mutating or counting its own placements twice',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;Object.assign(tasks[1],{date:clock.date,startTime:'07:00',endTime:'08:00'});const before=structuredClone(s),r=check(s);assert.equal(r.status,'fits');assert.equal(r.remainingMinutes,120);assert.equal(r.availableMinutes,120);assert.equal(r.canPreview,true);assert.deepEqual(s,before);
});
test('overlapping commitments are merged and a proven capacity shortfall is quantified',()=>{
 const s=state();s.scheduleEvents=[{id:'one',day:0,start:'07:00',end:'08:00'},{id:'two',day:0,start:'07:30',end:'08:30'}];const r=check(s);assert.equal(r.status,'shortfall');assert.equal(r.availableMinutes,30);assert.equal(r.shortfallMinutes,90);assert.equal(r.canPreview,false);
});
test('fragmented capacity does not claim sessions fit or invent a minute shortfall',()=>{
 const s=state();s.scheduleEvents=[{id:'gap',day:0,start:'07:30',end:'08:30'}];s.boards[0].sections[0].tasks.pop();const r=check(s);assert.equal(r.availableMinutes,60);assert.equal(r.status,'needs-review');assert.equal(r.shortfallMinutes,0);assert.equal(r.canPreview,false);
});
test('completed and archived work is excluded; the parent estimate is never added to session effort',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;tasks[0].estimatedMinutes=500;tasks[1].completed=true;tasks.push({id:'hidden',assignmentId:'p',archived:true,estimatedMinutes:999});assert.equal(check(s).remainingMinutes,60);tasks[2].completed=true;assert.equal(check(s).status,'no-work');
});
test('past deadlines, missing deadlines and distant deadlines have honest bounded states',()=>{
 const s=state(),p=s.boards[0].sections[0].tasks[0];p.dueDate='2026-10-17';assert.equal(check(s).status,'overdue');delete p.dueDate;assert.equal(check(s).status,'no-deadline');p.dueDate='2026-12-01';assert.equal(check(s).status,'outside-range');
});
test('today uses the current clock and recurring overnight occupancy blocks the following day',()=>{
 const s=state();s.scheduleEvents=[{id:'overnight',day:6,start:'23:00',end:'08:00'}];const r=check(s);assert.equal(r.availableMinutes,60);assert.equal(r.shortfallMinutes,60);const late=check(state(),options,{...clock,time:'08:04'});assert.equal(late.availableMinutes,55);
});
test('locked sessions remain occupied and invalid fixed placements require review',()=>{
 const s=state(),task=s.boards[0].sections[0].tasks[1];Object.assign(task,{scheduleLocked:true,date:clock.date,startTime:'07:00',endTime:'08:00'});let r=check(s);assert.equal(r.status,'fits');assert.equal(r.remainingMinutes,120);assert.equal(r.availableMinutes,60);assert.equal(r.movableMinutes,60);task.date='2026-10-19';r=check(s);assert.equal(r.status,'needs-review');assert.equal(r.canPreview,false);
});
test('child deadlines, preferences and numbered order constrain the candidate plan',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;tasks[0].sessionOrder='sequential';tasks[2].schedulingPreference='evening';assert.equal(check(s).status,'needs-review');delete tasks[2].schedulingPreference;tasks[1].dueDate='2026-10-17';assert.equal(check(s).status,'needs-review');tasks[1].dueDate='bad';assert.equal(check(s).status,'needs-review');
});
test('DST gaps cannot produce a fits result from wall-clock capacity alone',()=>{
 const s=state();s.boards[0].sections[0].tasks[0].dueDate='2026-03-08';assert.equal(check(s,{dayStart:'02:00',dayEnd:'04:00',timezone:'America/New_York'},{date:'2026-03-08',time:'00:00'}).status,'needs-review');
});
test('ambiguous identities and excessive session counts never receive feasibility assurance',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;tasks.push({...tasks[1]});assert.equal(check(s).status,'needs-review');tasks.pop();for(let i=0;i<40;i++)tasks.push({id:'extra'+i,assignmentId:'p',estimatedMinutes:15});assert.equal(check(s).status,'needs-review');
});
