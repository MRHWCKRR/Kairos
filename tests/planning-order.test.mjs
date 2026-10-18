import test from 'node:test';import assert from 'node:assert/strict';
import {previewSessions,previewCarryover,previewSessionRevision,applyPlanningCommand} from '../planning-commands.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const now=Date.parse('2026-10-18T06:00:00Z'),clock={date:'2026-10-18',time:'06:00'},range={from:'2026-10-18',to:'2026-10-20',dayStart:'07:00',dayEnd:'09:00',timezone:'UTC'};
const state=()=>({userID:'one',boards:[{id:'board',sections:[{id:'section',tasks:[{id:'p',title:'Essay',sessionOrder:'sequential',dueDate:'2026-10-20'},{id:'a',title:'Research',assignmentId:'p',sessionIndex:1,date:'2026-10-18',startTime:'09:00',endTime:'10:00'},{id:'b',title:'Draft',assignmentId:'p',sessionIndex:2,date:'2026-10-18',startTime:'10:00',endTime:'11:00'}]}]}],scheduleEvents:[]});
test('opt-in session creation keeps a short final session after earlier longer work',()=>{
 const s=state();s.boards[0].sections[0].tasks.splice(1);delete s.boards[0].sections[0].tasks[0].sessionOrder;s.scheduleEvents=[{id:'fixed',day:0,start:'07:30',end:'08:00'}];
 const p=previewSessions(s,{...range,taskId:'p',totalMinutes:75,sessionMinutes:60,ordered:true},clock);assert.equal(p.rows[0].startTime,'08:00');assert.equal(p.rows[1].date,'2026-10-19');const next=applyPlanningCommand(s,p.command,p.expected,{now}).next;assert.equal(next.boards[0].sections[0].tasks[0].sessionOrder,'sequential');
});
test('moving an earlier session previews its downstream work and permits adjacent sessions',()=>{
 const s=state(),p=previewCarryover(s,{...range,from:'2026-10-19',taskIds:['a']},clock);assert.equal(p.rows.length,2);assert.equal(p.rows[0].taskId,'a');assert.equal(p.rows[1].startTime,p.rows[0].endTime);const next=applyPlanningCommand(s,p.command,p.expected,{now}).next;assert.equal(next.boards[0].sections[0].tasks[2].date,'2026-10-19');
});
test('locked downstream and unscheduled prerequisites reject unsafe previews without mutation',()=>{
 const s=state();s.boards[0].sections[0].tasks[2].scheduleLocked=true;assert.throws(()=>previewCarryover(s,{...range,from:'2026-10-19',taskIds:['a']},clock),/order|locked|prerequisite/i);
 s.boards[0].sections[0].tasks[2].scheduleLocked=false;s.boards[0].sections[0].tasks[1].date=null;assert.throws(()=>previewCarryover(s,{...range,taskIds:['b']},clock),/prerequisite/i);
});
test('revisions preserve ordering by default and can explicitly opt out',()=>{
 const s=state(),p=previewSessionRevision(s,{...range,taskId:'p',remainingMinutes:75,sessionMinutes:60},clock);assert.equal(p.command.ordered,true);const out=previewSessionRevision(s,{...range,taskId:'p',remainingMinutes:75,sessionMinutes:60,ordered:false},clock);assert.equal(applyPlanningCommand(s,out.command,out.expected,{now}).next.boards[0].sections[0].tasks[0].sessionOrder,'independent');
});
test('an unreviewed AI move cannot break sequence, while unrelated notes remain editable',async()=>{
 const f=await plannerFixture(state());await assert.rejects(f.execute({type:'update_task',args:{taskId:'a',date:'2026-10-19',startTime:'09:00',endTime:'10:00'}}),/order/i);assert.equal(f.writes.length,0);
});
test('changing sequence metadata invalidates a preview and forged reversed rows cannot apply',()=>{
 const s=state(),p=previewCarryover(s,{...range,taskIds:['a']},clock);s.boards[0].sections[0].tasks[2].sessionIndex=3;assert.throws(()=>applyPlanningCommand(s,p.command,p.expected,{now}),/changed/);
 const original=state(),forged=previewCarryover(original,{...range,taskIds:['a']},clock);[forged.command.rows[0].startTime,forged.command.rows[1].startTime]=[forged.command.rows[1].startTime,forged.command.rows[0].startTime];[forged.command.rows[0].endTime,forged.command.rows[1].endTime]=[forged.command.rows[1].endTime,forged.command.rows[0].endTime];assert.throws(()=>applyPlanningCommand(original,forged.command,forged.expected,{now}),/order/);
});
test('public AI planning previews include and disclose later sessions before saving',async()=>{
 const s=state();s.boards[0].sections[0].tasks[0].dueDate='2099-01-05';const f=await plannerFixture(s),action={type:'plan_carryover',args:{taskIds:['a'],from:'2099-01-01',to:'2099-01-03',dayStart:'07:00',dayEnd:'09:00'}};
 const p=await f.context.previewKairosAction(action,{ownerId:'one',planId:'plan'});assert.equal(p.summary.rows.length,2);assert.match(p.summary.notice,/1 later session/);assert.equal(f.writes.length,0);
 await f.execute(action,{ownerId:'one',planId:'plan',operationId:'ordered-ai',createdAt:Date.now(),confirmation:p.approval});assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks[2].date,'2099-01-01');
});
test('ordinary planner saves cannot introduce a reversed ordered session schedule',async()=>{
 const s=state(),local=structuredClone(s),f=await plannerFixture(s);local.boards[0].sections[0].tasks[1].date='2026-10-19';await assert.rejects(f.context.savePlannerEdits('plan','one',s,local),/order/i);assert.equal(f.writes.length,0);
});
test('AI session creation visibly discloses optional ordering in its approval preview',async()=>{
 const s=state();s.boards[0].sections[0].tasks.splice(1);delete s.boards[0].sections[0].tasks[0].sessionOrder;s.boards[0].sections[0].tasks[0].dueDate='2099-01-05';const f=await plannerFixture(s);
 const p=await f.context.previewKairosAction({type:'plan_sessions',args:{taskId:'p',totalMinutes:60,sessionMinutes:30,ordered:true,from:'2099-01-01',to:'2099-01-03'}},{ownerId:'one',planId:'plan'});assert.match(p.summary.notice,/numbered sequence/);assert.equal(f.writes.length,0);
});
