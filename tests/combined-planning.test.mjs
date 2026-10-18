import test from 'node:test';
import assert from 'node:assert/strict';
import {combinedPlanning} from '../combined-planning.js';
import {applyPlanningCommand} from '../planning-commands.js';
const clock={date:'2026-10-18',time:'06:00'},options={from:clock.date,to:clock.date,dayStart:'07:00',dayEnd:'09:00',timezone:'UTC'};
const state=()=>({boards:[{id:'board',sections:[{id:'section',tasks:[{id:'p',title:'Essay',dueDate:clock.date},{id:'a',title:'Research',assignmentId:'p',sessionIndex:1,estimatedMinutes:60},{id:'q',title:'Exam',dueDate:'2026-10-19'},{id:'b',title:'Research',assignmentId:'q',sessionIndex:1,estimatedMinutes:60}]}]}],scheduleEvents:[]});
const tasks=s=>s.boards[0].sections[0].tasks,check=(s,input={})=>combinedPlanning(s,{...options,...input,assignmentIds:input.assignmentIds||['q','p']},clock);
test('combined check shares free time, uses deadline priority, and is immutable',()=>{
 const s=state(),before=structuredClone(s),r=check(s);assert.equal(r.assignments.length,2);assert.equal(r.availableMinutes,120);assert.equal(r.remainingMinutes,120);assert.equal(r.assignments.every(a=>a.status==='fits'),true);assert.deepEqual(r.proposal.rows.map(row=>row.taskId),['a','b']);assert.match(r.proposal.rows[0].title,/Essay.*Research/);assert.deepEqual(s,before);
 const applied=applyPlanningCommand(s,r.proposal.command,r.proposal.expected,{now:Date.parse(clock.date+'T06:00:00Z')});assert.equal(tasks(applied.next).find(t=>t.id==='a').startTime,'07:00');assert.equal(tasks(applied.next)[0].completed,undefined);
});
test('partial plans contain whole assignments and disclose unchanged work',()=>{
 const s=state(),r=check(s,{dayEnd:'08:00'});assert.equal(r.shortfallMinutes,60);assert.equal(r.proposal.rows.length,1);assert.equal(r.proposal.rows[0].taskId,'a');assert.equal(r.assignments.find(a=>a.taskId==='q').status,'not-placed');assert.match(r.proposal.notice,/Exam.*unchanged/);assert.match(r.proposal.notice,/60 minutes/);
 tasks(s).push({id:'c',title:'More',assignmentId:'p',estimatedMinutes:60});const none=check(s,{dayEnd:'07:30'});assert.equal(none.proposal,null);
});
test('failed groups keep their original slots occupied in a partial plan',()=>{
 const s=state();Object.assign(tasks(s)[3],{date:clock.date,startTime:'07:00',endTime:'08:00',schedulingPreference:'evening'});const r=check(s);assert.equal(r.proposal.rows[0].taskId,'a');assert.equal(r.proposal.rows[0].startTime,'08:00');assert.equal(r.assignments[1].status,'not-placed');
});
test('global attempt vacates all selected work before fallback',()=>{
 const s=state();Object.assign(tasks(s)[3],{date:clock.date,startTime:'07:00',endTime:'08:00'});tasks(s)[1].schedulingPreference='morning';const r=check(s);assert.equal(r.proposal.rows.length,2);assert.equal(r.proposal.rows[0].startTime,'07:00');
});
test('missing deadlines use range end; completed and archived sessions are excluded',()=>{
 const s=state();delete tasks(s)[0].dueDate;tasks(s)[1].completed=true;tasks(s).push({id:'c',assignmentId:'p',estimatedMinutes:30},{id:'hidden',assignmentId:'p',estimatedMinutes:900,archived:true});const r=check(s);assert.equal(r.remainingMinutes,90);assert.match(r.proposal.notice,/No deadline.*range end/i);assert.equal(r.proposal.rows.length,2);
});
test('unsafe groups are excluded, never silently moved',()=>{
 for(const mutate of [s=>tasks(s)[0].startTime='07:00',s=>tasks(s)[1].dueDate='bad',s=>tasks(s)[1].recurrence={enabled:true},s=>tasks(s).push({...tasks(s)[1],archived:true}),s=>{tasks(s)[0].sessionOrder='sequential';tasks(s)[1].sessionIndex=0}]){const s=state();mutate(s);const r=check(s);assert.equal(r.assignments.find(a=>a.taskId==='p').status,'needs-review');assert.deepEqual(r.proposal.rows.map(row=>row.taskId),['b']);assert.match(r.proposal.notice,/Essay.*unchanged/)}
});
test('locks stay fixed and invalid or conflicting locks require review',()=>{
 const s=state();Object.assign(tasks(s)[1],{scheduleLocked:true,date:clock.date,startTime:'07:00',endTime:'08:00'});let r=check(s);assert.equal(r.proposal.rows.length,1);assert.equal(r.availableMinutes,60);assert.equal(r.remainingMinutes,120);assert.match(r.proposal.notice,/1 locked/);tasks(s)[1].date='2026-10-17';r=check(s);assert.equal(r.assignments[0].status,'needs-review');
});
test('ordered sessions retain prerequisites across a combined proposal',()=>{
 const s=state();tasks(s)[0].sessionOrder='sequential';tasks(s).push({id:'c',title:'Draft',assignmentId:'p',sessionIndex:2,estimatedMinutes:30});const r=check(s,{dayEnd:'10:00'}),a=r.proposal.rows.find(x=>x.taskId==='a'),c=r.proposal.rows.find(x=>x.taskId==='c');assert.ok(c.startTime>=a.endTime);
});
test('a movable session can resolve its own assignment lock conflict',()=>{
 const s=state();Object.assign(tasks(s)[1],{scheduleLocked:true,date:clock.date,startTime:'07:00',endTime:'08:00'});tasks(s).push({id:'c',title:'Draft',assignmentId:'p',date:clock.date,startTime:'07:30',endTime:'08:30'});const r=check(s,{dayEnd:'10:00'});assert.equal(r.assignments.find(a=>a.taskId==='p').status,'fits');assert.equal(r.proposal.rows.find(row=>row.taskId==='c').startTime,'08:00');assert.equal(r.proposal.rows.some(row=>row.taskId==='a'),false);
});
test('weekly split windows, overlapping commitments and fragmentation do not double count capacity',()=>{
 const s=state(),weekly=Object.fromEntries(Array.from({length:7},(_,d)=>[d,d===0?[{start:'07:00',end:'07:30'},{start:'08:00',end:'08:30'}]:[]]));let r=check(s,{weeklyAvailability:weekly});assert.equal(r.availableMinutes,60);assert.equal(r.proposal,null);s.scheduleEvents=[{id:'one',day:0,start:'07:00',end:'07:20'},{id:'two',day:0,start:'07:10',end:'07:30'}];r=check(s,{weeklyAvailability:weekly});assert.equal(r.availableMinutes,30);
});
test('selection and range limits fail without a partial or mutated command',()=>{
 const s=state();for(const assignmentIds of [[],['p','p'],['missing'],Array.from({length:11},(_,i)=>'p'+i)])assert.throws(()=>check(s,{assignmentIds}));assert.throws(()=>check(s,{to:'2026-12-01'}));for(let i=0;i<40;i++)tasks(s).push({id:'extra'+i,assignmentId:'p',estimatedMinutes:15});assert.throws(()=>check(s),/40/);
});
