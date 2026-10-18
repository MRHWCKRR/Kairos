import test from 'node:test';import assert from 'node:assert/strict';
import {findPlanningSlot} from '../planning-slots.js';
import {previewSessions,applyPlanningCommand} from '../planning-commands.js';
import {assignmentFeasibility} from '../deadline-feasibility.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {previewAiPlanning,aiPlanningSummary} from '../ai-planning.js';
import {validateUserInput} from '@google-cloud/firestore/build/src/serializer.js';
const week=()=>Object.fromEntries(Array.from({length:7},(_,day)=>[day,[]])),clock={date:'2026-10-18',time:'06:00'},input={from:'2026-10-18',to:'2026-10-19',dayStart:'07:00',dayEnd:'22:00',timezone:'UTC'};
const state=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'p',title:'Essay',dueDate:'2026-10-19'}]}]}],scheduleEvents:[]});
test('weekly hours skip unavailable days and never bridge separate windows',()=>{
 const weeklyAvailability=week();weeklyAvailability[1]=[{start:'15:30',end:'16:00'},{start:'18:00',end:'19:00'}];const r=findPlanningSlot(60,{...input,weeklyAvailability},[],clock);assert.deepEqual(r,{date:'2026-10-19',startTime:'18:00',endTime:'19:00'});assert.equal(findPlanningSlot(90,{...input,weeklyAvailability},[],clock),null);
});
test('weekly session preview pins windows and Apply rejects forged placement into a gap',()=>{
 const weeklyAvailability=week();weeklyAvailability[1]=[{start:'15:30',end:'16:00'},{start:'18:00',end:'19:00'}];const s=state(),p=previewSessions(s,{...input,weeklyAvailability,availabilitySource:'saved',taskId:'p',totalMinutes:60,sessionMinutes:30},clock);assert.equal(p.command.options.availabilitySource,'saved');assert.deepEqual(p.command.options.weeklyAvailability,weeklyAvailability);assert.equal(p.rows[1].startTime,'18:00');assert.doesNotThrow(()=>applyPlanningCommand(s,p.command,p.expected,{now:Date.parse('2026-10-18T06:00Z')}));p.command.rows[1].startTime='16:00';p.command.rows[1].endTime='16:30';assert.throws(()=>applyPlanningCommand(s,p.command,p.expected,{now:Date.parse('2026-10-18T06:00Z')}),/schedule|availability/);
});
test('capacity sums the same weekly windows, excludes breaks and respects preferences',()=>{
 const weeklyAvailability=week();weeklyAvailability[1]=[{start:'15:30',end:'16:00'},{start:'18:00',end:'19:00'}];const s=state();s.boards[0].sections[0].tasks.push({id:'a',assignmentId:'p',estimatedMinutes:120});let r=assignmentFeasibility(s,'p',{...input,weeklyAvailability},clock);assert.equal(r.availableMinutes,90);assert.equal(r.shortfallMinutes,30);assert.equal(r.status,'shortfall');assert.equal(findPlanningSlot(60,{...input,weeklyAvailability,preference:'morning'},[],clock),null);
});
test('closed weeks and invalid overlaps do not fall back to daily availability',()=>{
 assert.equal(findPlanningSlot(30,{...input,weeklyAvailability:week()},[],clock),null);const invalid=week();invalid[0]=[{start:'09:00',end:'11:00'},{start:'10:00',end:'12:00'}];assert.throws(()=>findPlanningSlot(30,{...input,weeklyAvailability:invalid},[],clock),/overlap/i);invalid[0]=[{start:'22:00',end:'07:00'}];assert.throws(()=>findPlanningSlot(30,{...input,weeklyAvailability:invalid},[],clock),/end|overnight|after/i);
});
test('weekly windows follow profile calendar dates and keep existing DST checks',()=>{
 const weeklyAvailability=week();weeklyAvailability[0]=[{start:'02:00',end:'04:00'}];assert.deepEqual(findPlanningSlot(30,{from:'2026-03-08',to:'2026-03-08',weeklyAvailability,timezone:'America/New_York'},[],{date:'2026-03-08',time:'00:00'}),{date:'2026-03-08',startTime:'03:00',endTime:'03:30'});
});

test('AI planning and feasibility use saved hours unless explicit daily hours override them',()=>{
 const s=state(),weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),action={type:'plan_sessions',args:{taskId:'p',totalMinutes:60,sessionMinutes:30,from:input.from,to:input.to}},settings={timezone:'UTC',now:Date.parse('2026-10-18T06:00Z'),weeklyAvailability};const p=previewAiPlanning(s,action,settings);assert.equal(p.rows[0].startTime,'18:00');assert.equal(p.command.options.availabilitySource,'saved');const custom=previewAiPlanning(s,{...action,args:{...action.args,dayStart:'07:00',dayEnd:'08:00'}},settings);assert.equal(custom.rows[0].startTime,'07:00');assert.equal(custom.command.options.availabilitySource,'daily');s.boards[0].sections[0].tasks.push({id:'session',assignmentId:'p',estimatedMinutes:180});const summary=aiPlanningSummary(s,settings);assert.equal(summary.assignmentFeasibility[0].shortfallMinutes,60);assert.deepEqual(summary.capacityAssumptions.weeklyAvailability,weeklyAvailability);
});

test('saved-hour AI approvals contain no undefined fields that would reject chat persistence',()=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),p=previewAiPlanning(state(),{type:'plan_sessions',args:{taskId:'p',totalMinutes:60,sessionMinutes:30,from:input.from,to:input.to}},{timezone:'UTC',now:Date.parse('2026-10-18T06:00Z'),weeklyAvailability});assert.equal(Object.hasOwn(p.command.options,'dayStart'),false);assert.equal(Object.hasOwn(p.command.options,'dayEnd'),false);
});

test('weekly planning commands canonicalise legacy arrays to persistable day maps',()=>{
 const p=previewSessions(state(),{...input,weeklyAvailability:Array.from({length:7},()=>[{start:'18:00',end:'19:00'}]),availabilitySource:'saved',taskId:'p',totalMinutes:60,sessionMinutes:30},clock);assert.equal(Array.isArray(p.command.options.weeklyAvailability),false);assert.doesNotThrow(()=>validateUserInput('approval',p,'Firestore data',{allowUndefined:false}));
});

test('public AI preview uses cloud weekly hours; changed hours reject Apply before a write',async()=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),s=state();s.boards[0].sections[0].tasks[0].dueDate='2099-01-02';const f=await plannerFixture(s,{userData:{settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability}}}}),action={type:'plan_sessions',args:{taskId:'p',totalMinutes:60,sessionMinutes:30,from:'2099-01-01',to:'2099-01-02'}},p=await f.context.previewKairosAction(action,{ownerId:'one',planId:'plan'});assert.equal(p.summary.rows[0].startTime,'18:00');f.setUserData({settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:week()}}});await assert.rejects(f.execute(action,{ownerId:'one',planId:'plan',operationId:'changed-hours',createdAt:Date.now(),confirmation:p.approval}),/availability changed/i);assert.equal(f.writes.length,0);
});

test('manual planning store checks saved hours atomically and exact retries survive later hours changes',async()=>{
 const weeklyAvailability=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),userData={settings:{planning:{weeklyAvailability}}},s=state(),p=previewSessions(s,{...input,weeklyAvailability,availabilitySource:'saved',taskId:'p',totalMinutes:60,sessionMinutes:30},clock),f=await plannerFixture(s,{userData,failAfterCommit:true});f.context.applyTaskListCommand=(s,c,e)=>applyPlanningCommand(s,c,e,{now:Date.parse('2026-10-18T06:00Z')});
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'manual-weekly',Date.now()),/response lost/);assert.equal(f.writes.length,1);f.setUserData({settings:{planning:{weeklyAvailability:week()}}});await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'manual-weekly',Date.now());assert.equal(f.writes.length,1);
 const fresh=await plannerFixture(s,{userData:{settings:{planning:{weeklyAvailability:week()}}}});await assert.rejects(fresh.context.persistTaskListCommand('plan','one',p.command,p.expected,'new-weekly',Date.now()),/availability changed/i);assert.equal(fresh.writes.length,0);
});
