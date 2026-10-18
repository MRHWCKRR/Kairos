import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionShape} from '../ai-action-schema.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {applyPlanningCommand} from '../planning-commands.js';
let planning={};try{planning=await import('../ai-planning.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const now=Date.parse('2026-10-17T06:00:00Z');
const range={from:'2026-10-17',to:'2026-10-19',dayStart:'07:00',dayEnd:'18:00'};
const state=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Essay',dueDate:'2026-10-19'},{id:'b',title:'Revision',date:'2026-10-17',startTime:'09:00',endTime:'10:00'}]}]}],scheduleEvents:[{id:'e',title:'Class',day:6,start:'09:00',end:'10:00'}]});
const action=()=>({type:'plan_sessions',args:{taskId:'a',totalMinutes:120,sessionMinutes:30,...range}});

test('AI on-track context uses the same bounded feasibility calculations and discloses assumptions',()=>{
 const s=state();s.boards[0].sections[0].tasks.push({id:'child',assignmentId:'a',estimatedMinutes:60});const summary=planning.aiPlanningSummary(s,{timezone:'UTC',now});assert.equal(summary.assignmentFeasibility[0].remainingMinutes,60);assert.equal(summary.assignmentFeasibility[0].status,'fits');assert.equal(summary.capacityAssumptions.dayStart,'07:00');assert.match(summary.capacityAssumptions.meaning,/individually|separately/);assert.equal(summary.assignmentFeasibilityOmitted,0);
});

test('capacity context bounds expensive checks and prioritises the nearest deadlines',()=>{
 const s=state(),tasks=s.boards[0].sections[0].tasks;for(let i=0;i<15;i++){tasks.push({id:'p'+i,title:'Assignment '+i,dueDate:i===14?'2026-10-17':'2026-10-19'});tasks.push({id:'s'+i,assignmentId:'p'+i,estimatedMinutes:30})}const r=planning.aiPlanningSummary(s,{timezone:'UTC',now});assert.equal(r.assignmentFeasibility.length,10);assert.equal(r.assignmentFeasibility[0].taskId,'p14');assert.equal(r.assignmentFeasibilityOmitted,5);
});
function preview(s,a=action()){assert.equal(typeof planning.previewAiPlanning,'function');return planning.previewAiPlanning(s,a,{timezone:'UTC',now})}

test('chat planning schema accepts bounded requests and rejects model supplied commands',()=>{
 assert.doesNotThrow(()=>validateActionShape(action()));
 for(const args of [{...action().args,rows:[]},{...action().args,totalMinutes:0},{...action().args,to:'2026-02-30'},{...action().args,from:null}])assert.throws(()=>validateActionShape({type:'plan_sessions',args}),/invalid|required|unsupported/i);
 assert.throws(()=>validateActionShape({type:'plan_carryover',args:{...range,taskIds:['a','a']}}),/invalid/i);
});
test('session proposals have exact rows, preserve state and respect deadlines',()=>{
 const s=state(),before=structuredClone(s),p=preview(s);assert.equal(p.rows.length,4);assert.deepEqual(s,before);
 const saved=applyPlanningCommand(s,p.command,p.expected,{now}).next;assert.equal(saved.boards[0].sections[0].tasks.length,6);
 assert.ok(p.rows.every(row=>row.date<='2026-10-19'));
});
test('conflict proposals move only eligible conflicting tasks and respect fixed commitments',()=>{
 const s=state(),p=preview(s,{type:'plan_conflicts',args:range});assert.deepEqual(p.rows.map(row=>row.taskId),['b']);assert.notEqual(p.rows[0].startTime,'09:00');
 s.boards[0].sections[0].tasks[1].scheduleLocked=true;assert.throws(()=>preview(s,{type:'plan_conflicts',args:range}),/no.*movable|locked/i);
});
test('a partial conflict fix explicitly reports overlaps that require manual editing',()=>{
 const s=state();s.scheduleEvents.push({id:'locked-event',title:'Other class',day:6,start:'09:15',end:'09:45'});
 const p=preview(s,{type:'plan_conflicts',args:range});assert.equal(p.remainingConflicts,1);assert.deepEqual(p.rows.map(row=>row.taskId),['b']);
});
test('carry-over defaults to unfinished ordinary work from the specified week',()=>{
 const s=state();s.boards[0].sections[0].tasks.push({id:'c',title:'Done',completed:true,date:'2026-10-17'});
 const p=preview(s,{type:'plan_carryover',args:{...range,from:'2026-10-19',to:'2026-10-25',week:'2026-10-17'}});assert.deepEqual(p.rows.map(row=>row.taskId),['b']);
});
test('planning context reports deadlines and dated-week status from the whole active planner',()=>{
 assert.equal(typeof planning.aiPlanningSummary,'function');
 const s=state();s.boards[0].sections[0].tasks.push({id:'overdue',title:'Late',dueDate:'2026-10-16'});
 s.boards.push({archived:true,sections:[{tasks:[{id:'hidden',title:'Hidden',dueDate:'2026-10-15'}]}]});
 const summary=planning.aiPlanningSummary(s,{timezone:'UTC',now});
 assert.equal(summary.deadlineCount,2);assert.equal(summary.deadlines[0].status,'overdue');assert.equal(summary.week.pending,1);assert.equal(summary.conflicts,1);
});
test('context and planning share cloud then account-scoped cached timezone precedence',()=>{
 assert.equal(typeof planning.resolveAiPlanningTimezone,'function');
 const storage={getItem:key=>key.endsWith('_uid')?'one':JSON.stringify({profile:{timezone:'Pacific/Honolulu'}})};
 assert.equal(planning.resolveAiPlanningTimezone({},'one',storage),'Pacific/Honolulu');
 assert.equal(planning.resolveAiPlanningTimezone({settings:{profile:{timezone:'Australia/Brisbane'}}},'one',storage),'Australia/Brisbane');
 assert.notEqual(planning.resolveAiPlanningTimezone({},'other',storage),'Pacific/Honolulu');
});
test('ambiguous titles, impossible capacity and stale previews never change data',()=>{
 const s=state();s.boards[0].sections[0].tasks.push({id:'copy',title:'Essay'});
 assert.throws(()=>preview(s,{type:'plan_sessions',args:{...action().args,taskId:undefined,title:'Essay'}}),/ambiguous|multiple/i);
 assert.throws(()=>preview(state(),{type:'plan_sessions',args:{...action().args,dayStart:'09:00',dayEnd:'09:15',to:range.from}}),/room|fit/);
 const original=state(),p=preview(original);original.boards[0].sections[0].tasks[0].dueDate='2026-10-18';assert.throws(()=>applyPlanningCommand(original,p.command,p.expected,{now}),/changed/);
});
test('AI save requires the reviewed command and lost replies reconcile without generating more sessions',async()=>{
 const s=state(),a=action(),p=preview(s),f=await plannerFixture(s,{failAfterCommit:true});
 f.context.applyPlanningCommand=(s,c,e)=>applyPlanningCommand(s,c,e,{now});
 f.context.planningTimezone=async()=> 'UTC';
 const options={ownerId:'one',planId:'plan',operationId:'ai-session',createdAt:Date.now(),confirmation:{request:JSON.stringify(a),...p}};
 // The public preview supplies the canonical request fingerprint.
 options.confirmation.request=f.context.stableStringify(a);
 await assert.rejects(f.execute(a,{...options,confirmation:null}),/review|preview/i);
 assert.equal(f.writes.length,0);
 await assert.rejects(f.execute(a,options),/response lost/);
 const result=await f.execute(a,options);assert.equal(result.taskIds.length,4);assert.equal(f.writes.length,1);
});
test('public AI preview pins a real current command and rejects changed accounts or timezones',async()=>{
 const s=state();s.boards[0].sections[0].tasks[0].dueDate='2099-01-03';
 const f=await plannerFixture(s),a={type:'plan_sessions',args:{taskId:'a',totalMinutes:60,sessionMinutes:30,from:'2099-01-01',to:'2099-01-03'}};
 const p=await f.context.previewKairosAction(a,{ownerId:'one',planId:'plan'});
 assert.equal(p.summary.kind,'planning');assert.equal(p.summary.rows.length,2);assert.equal(f.writes.length,0);assert.equal(f.context.actionNeedsConfirmation(a),true);
 const options={ownerId:'one',planId:'plan',operationId:'public',createdAt:Date.now(),confirmation:p.approval};
 await assert.rejects(f.execute(a,{...options,ownerId:'other'}),/account changed/);
 f.context.planningTimezone=async()=> p.summary.timezone==='UTC'?'Australia/Brisbane':'UTC';await assert.rejects(f.execute(a,options),/timezone changed/);assert.equal(f.writes.length,0);
 f.context.planningTimezone=async()=>p.summary.timezone;
 await f.execute(a,options);assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks.length,4);
});

