import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../planning-commands.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyTaskListCommand} from '../task-list-model.js';
const now=Date.parse('2026-10-18T06:00:00Z'),clock={date:'2026-10-18',time:'06:00'};
const state=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Essay',dueDate:'2026-10-22'},{id:'done',assignmentId:'p',completed:true,sessionIndex:1,title:'Research',estimatedMinutes:30},{id:'a',assignmentId:'p',sessionIndex:2,title:'Draft',estimatedMinutes:30,notes:'Keep notes',checklist:[{id:'step',title:'Keep step',completed:false}]},{id:'b',assignmentId:'p',sessionIndex:3,title:'Review',estimatedMinutes:30}]}]}],scheduleEvents:[]});
const input={taskId:'p',remainingMinutes:90,sessionMinutes:30,from:'2026-10-18',to:'2026-10-22',dayStart:'07:00',dayEnd:'22:00',timezone:'UTC'};
function preview(s,args={}){assert.equal(typeof m.previewSessionRevision,'function');return m.previewSessionRevision(s,{...input,...args},clock)}
test('increasing effort reuses unfinished session IDs and preserves completed sessions and notes',()=>{
 const s=state(),p=preview(s),next=m.applyPlanningCommand(s,p.command,p.expected,{now}).next,tasks=next.boards[0].sections[0].tasks;
 assert.equal(p.rows.length,3);assert.deepEqual(tasks.find(t=>t.id==='done'),s.boards[0].sections[0].tasks[1]);assert.equal(tasks.find(t=>t.id==='a').notes,'Keep notes');assert.equal(tasks.find(t=>t.id==='a').checklist[0].title,'Keep step');assert.equal(tasks.length,5);assert.equal(tasks[0].completed,undefined);
});
test('reducing effort archives reviewed surplus sessions without deleting their data',()=>{
 const s=state(),p=preview(s,{remainingMinutes:15}),next=m.applyPlanningCommand(s,p.command,p.expected,{now}).next;
 assert.deepEqual(p.command.archiveIds,['b']);assert.equal(next.boards[0].sections[0].tasks.find(t=>t.id==='b').archived,true);assert.equal(next.boards[0].sections[0].tasks.find(t=>t.id==='a').estimatedMinutes,15);
 const zero=preview(s,{remainingMinutes:0});assert.equal(zero.rows.length,0);assert.equal(m.applyPlanningCommand(s,zero.command,zero.expected,{now}).next.boards[0].sections[0].tasks.filter(t=>t.archived).length,2);
});
test('locked, stale and forged revisions never change data',()=>{
 const s=state(),p=preview(s);s.boards[0].sections[0].tasks[2].scheduleLocked=true;assert.throws(()=>preview(s),/locked/i);assert.throws(()=>m.applyPlanningCommand(s,p.command,p.expected,{now}),/changed/);
 const original=state(),forged=preview(original);forged.command.archiveIds=['done'];assert.throws(()=>m.applyPlanningCommand(original,forged.command,forged.expected,{now}),/invalid|completed|session/i);
});
test('blank remaining effort is invalid rather than an instruction to archive sessions',()=>{
 assert.throws(()=>preview(state(),{remainingMinutes:''}),/remaining|effort/i);assert.throws(()=>preview(state(),{remainingMinutes:null}),/remaining|effort/i);
});
test('a completed or independent task cannot be archived through a session revision',()=>{
 const s=state(),p=preview(s,{remainingMinutes:15});p.command.archiveIds=['p'];assert.throws(()=>m.applyPlanningCommand(s,p.command,p.expected,{now}),/invalid|session/i);
});
test('session rescheduling respects an earlier parent deadline even when a child deadline is later',()=>{
 const s=state();s.boards[0].sections[0].tasks[0].dueDate='2026-10-18';s.boards[0].sections[0].tasks[2].dueDate='2026-10-22';
 assert.throws(()=>m.previewCarryover(s,{...input,taskIds:['a'],from:'2026-10-19'},clock),/deadline|safe time/);
});
test('mixed carry-over places sessions by the effective assignment deadline first',()=>{
 const s={boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Parent',dueDate:'2026-10-18'},{id:'a',title:'Session',assignmentId:'p',dueDate:'2026-10-20',estimatedMinutes:60},{id:'b',title:'Other',dueDate:'2026-10-19',estimatedMinutes:60}]}]}],scheduleEvents:[]};
 const p=m.previewCarryover(s,{...input,taskIds:['b','a'],to:'2026-10-19',dayStart:'07:00',dayEnd:'08:00'},clock);assert.equal(p.rows[0].taskId,'a');assert.equal(p.rows[0].date,'2026-10-18');assert.equal(p.rows[1].date,'2026-10-19');
});
test('a lost revision response reconciles the same operation without duplicating added sessions',async()=>{
 const s={userID:'one',...state()},p=preview(s),f=await plannerFixture(s,{failAfterCommit:true});f.context.applyTaskListCommand=(s,c,e)=>applyTaskListCommand(s,c,e,{now});
 const save=()=>f.context.persistTaskListCommand('plan','one',p.command,p.expected,'revise-once',Date.now());await assert.rejects(save(),/lost/);await save();assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks.length,5);
});
