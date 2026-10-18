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
const combinedState=()=>{const s=state();s.scheduleEvents=[];s.boards[0].sections[0].tasks.push({id:'a1',title:'Research',assignmentId:'a',estimatedMinutes:60},{id:'q',title:'Science',dueDate:'2026-10-19'},{id:'q1',title:'Research',assignmentId:'q',estimatedMinutes:60});return s};
const combinedAction=(extra={})=>({type:'plan_assignments',args:{assignmentIds:['a','q'],...range,to:range.from,dayEnd:'09:00',...extra}});
test('AI carries explicit spacing into previews and explains it in read-only reports',()=>{
 const s=combinedState(),a=combinedAction({gapMinutes:15}),p=preview(s,a);assert.equal(p.rows.length,1);assert.equal(p.command.options.gapMinutes,15);assert.match(p.capacity.assignments.find(g=>g.status==='not-placed').reason,/15-minute gaps/);const report=preview(s,{...a,args:{...a.args,checkOnly:true}});assert.equal(report.command,null);assert.match(report.notice,/Spacing: 15 minutes/);assert.match(report.notice,/upper bound before.*spacing/);
});
test('combined AI schema accepts explicit bounded assignments and check-only intent',()=>{
 assert.doesNotThrow(()=>validateActionShape(combinedAction()));assert.doesNotThrow(()=>validateActionShape(combinedAction({checkOnly:true})));
 for(const extra of [{assignmentIds:[]},{assignmentIds:['a','a']},{assignmentIds:['a',4]},{assignmentIds:Array.from({length:11},(_,i)=>'p'+i)},{checkOnly:'yes'},{rows:[]},{assignmentIds:undefined}])assert.throws(()=>validateActionShape(combinedAction(extra)));
});
test('AI combined planning uses the same shared engine and preserves state',()=>{
 const s=combinedState(),before=structuredClone(s),p=preview(s,combinedAction());assert.equal(p.rows.length,2);assert.equal(p.capacity.availableMinutes,120);assert.equal(p.capacity.remainingMinutes,120);assert.equal(p.capacity.assignments.every(a=>a.status==='fits'),true);assert.match(p.rows[0].title,/Essay.*Research/);assert.deepEqual(s,before);
});
test('AI partial plan explicitly identifies excluded assignments and remaining effort',()=>{
 const p=preview(combinedState(),combinedAction({dayEnd:'08:00'}));assert.equal(p.rows.length,1);assert.equal(p.capacity.shortfallMinutes,60);assert.match(p.notice,/Partial plan/);assert.match(p.notice,/Science.*unchanged/);assert.equal(p.capacity.assignments.find(a=>a.taskId==='q').status,'not-placed');
});
test('no-fit and check-only combined requests return a report without an executable command',()=>{
 for(const args of [{dayEnd:'07:30'},{checkOnly:true}]){const s=combinedState(),before=structuredClone(s),p=preview(s,combinedAction(args));assert.equal(p.command,null);assert.equal(p.rows.length,0);assert.match(p.notice,/Shared capacity/);assert.match(p.notice,/Essay/);assert.match(p.notice,/Science/);assert.match(p.notice,/Nothing changed/);assert.match(p.notice,/Daily work hours: 07:00-/);assert.deepEqual(s,before)}
 const empty=combinedState();empty.boards[0].sections[0].tasks.push({id:'empty',title:'Empty assignment'});const p=preview(empty,combinedAction({assignmentIds:['a','empty']}));assert.equal(p.command,null);assert.match(p.notice,/No unfinished/);
});
test('public combined preview pins only reviewed rows and exact retry reconciles one partial write',async()=>{
 const s=combinedState();s.boards[0].sections[0].tasks.find(t=>t.id==='a').dueDate='2099-01-03';s.boards[0].sections[0].tasks.find(t=>t.id==='q').dueDate='2099-01-03';const f=await plannerFixture(s,{failAfterCommit:true}),a=combinedAction({from:'2099-01-01',to:'2099-01-01',dayEnd:'08:00'}),p=await f.context.previewKairosAction(a,{ownerId:'one',planId:'plan'});assert.equal(p.summary.capacity.shortfallMinutes,60);assert.equal(p.summary.rows.length,1);assert.match(p.summary.notice,/Science.*unchanged/);assert.equal(f.writes.length,0);
 const options={ownerId:'one',planId:'plan',operationId:'combined-partial',createdAt:Date.now(),confirmation:p.approval};await assert.rejects(f.execute(a,options),/response lost/);const r=await f.execute(a,options);assert.equal(r.combinedPlan,true);assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks.find(t=>t.id==='q1').date,undefined);assert.equal(f.data().boards[0].sections[0].tasks.find(t=>t.id==='a1').title,'Research');
});
test('public check-only result has no approval and cannot execute',async()=>{
 const s=combinedState();for(const task of s.boards[0].sections[0].tasks)if(task.dueDate)task.dueDate='2099-01-03';const f=await plannerFixture(s),a=combinedAction({checkOnly:true,from:'2099-01-01',to:'2099-01-01'}),p=await f.context.previewKairosAction(a,{ownerId:'one',planId:'plan'});assert.equal(p.approval,null);assert.match(p.summary.notice,/Nothing changed/);await assert.rejects(f.execute(a,{ownerId:'one',planId:'plan',operationId:'check',createdAt:Date.now(),confirmation:p.approval}),/reviewed|check-only/);assert.equal(f.writes.length,0);
});
test('combined requests use saved weekly windows and reject stale deadlines before mutation',async()=>{
 const s=combinedState();for(const task of s.boards[0].sections[0].tasks)if(task.dueDate)task.dueDate='2099-01-03';const weekly=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'18:00',end:'19:00'}]])),f=await plannerFixture(s,{userData:{settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:weekly}}}}),a=combinedAction({from:'2099-01-01',to:'2099-01-01'});delete a.args.dayStart;delete a.args.dayEnd;const p=await f.context.previewKairosAction(a,{ownerId:'one',planId:'plan'});assert.equal(p.summary.rows[0].startTime,'18:00');assert.equal(p.summary.rows.length,1);assert.equal(p.approval.command.options.availabilitySource,'saved');const check=await f.context.previewKairosAction({...a,args:{...a.args,checkOnly:true}},{ownerId:'one',planId:'plan'});assert.match(check.summary.notice,/Saved weekly hours:.*18:00.19:00/);
 const changed=structuredClone(s);changed.boards[0].sections[0].tasks[0].dueDate='2099-01-02';const stale=await plannerFixture(changed,{userData:{settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:weekly}}}});await assert.rejects(stale.execute(a,{ownerId:'one',planId:'plan',operationId:'stale-combined',createdAt:Date.now(),confirmation:p.approval}),/changed/);assert.equal(stale.writes.length,0);
});

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

