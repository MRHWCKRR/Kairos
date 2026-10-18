import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {parseHTML} from 'linkedom';
import * as schedule from '../schedule-utils.js';import * as recurrence from '../recurrence-utils.js';import * as dayChange from '../schedule-day-change.js';
import {planningClock,shiftPlanningDate} from '../planning-model.js';import {mountDayChange} from '../schedule-day-change-ui.js';import {plannerFixture} from './helpers/planner-fixture.mjs';
let availability={};try{availability=await import('../schedule-planning-availability.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const week=()=>Object.fromEntries(Array.from({length:7},(_,day)=>[day,[{start:'08:00',end:'09:00'},{start:'10:00',end:'11:00'}]]));
const instant=Date.parse('2026-10-18T06:00:00Z');class FixedDate extends Date{constructor(...args){super(...(args.length?args:[instant]))}static now(){return instant}}
async function fixture({weekly=week(),timezone='UTC',scheduled=false,fail=false,gate=null}={}){
 const {document,window}=parseHTML('<html><body><div id="schedule-toolbar"><button data-plan>Plan</button></div><div id="schedule-ai-review"></div><div class="schedule-workspace-shell"><div id="schedule-inspector"></div></div></body></html>');
 const task={id:'a',title:'Essay',estimatedMinutes:30,...(scheduled?{date:'2026-10-18',startTime:'08:00',endTime:'08:30'}:{})},boards=[{id:'b',sections:[{id:'s',tasks:[task]}]}];let hours=weekly,zone=timezone,calls=0,writes=[],raw=[];
 window.__kairosScheduleAiBooted=true;window.__kairosScheduleWorkspace={state:{anchor:new FixedDate(),view:'day'},render(){},focusDateTime(){}};
 window.__kairosScheduleBridge={getBoards:()=>boards,getScheduleEvents:()=>[],getOwnerId:()=> 'one',getPlanId:()=> 'plan',getTimeFormat:()=> '24',getWeeklyAvailability:()=>hours,getTimezone:()=>zone,requestAiPlan:async()=>{calls++;if(gate)await gate;return raw},persistPlan:async options=>{if(fail)throw Error('Offline');writes.push(structuredClone(options))},refreshAppViews(){}};
 const c=vm.createContext({...schedule,...recurrence,...dayChange,...availability,planningClock,shiftPlanningDate,schedulePlanningClock:(bridge,now=instant)=>availability.schedulePlanningClock(bridge,now),mountDayChange,document,window,console:{error(){}},Date:FixedDate,Intl,structuredClone,CSS:{escape:x=>x},requestAnimationFrame:()=>{},setTimeout:()=>{},MutationObserver:window.MutationObserver,aiErrorMessage:error=>error.message});const source=await readFile(new URL('../schedule-ai.js',import.meta.url),'utf8');vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),c);
 const proposal=(start='08:00',end='08:30',date='2026-10-18')=>({taskId:'a',from:{date:task.date??null,startTime:task.startTime??null,endTime:task.endTime??null},to:{date,startTime:start,endTime:end},reason:'Fits the saved work window.'});
 return {c,document,task,boards,writes,calls:()=>calls,proposal,setRaw:value=>raw=value,setHours:value=>hours=value,setZone:value=>zone=value};
}
test('Schedule context uses the profile calendar date and exact saved hours',async()=>{
 const f=await fixture({timezone:'Pacific/Honolulu'}),context=f.c.buildContext();assert.equal(context.currentDate,'2026-10-17');assert.equal(context.currentTime,'20:00');assert.equal(context.availability.timezone,'Pacific/Honolulu');assert.deepEqual(JSON.parse(JSON.stringify(context.availability.weeklyAvailability)),week());
});
test('generated Schedule proposals reject closed days, breaks and crossing a work-window boundary',async()=>{
 const f=await fixture();let context=f.c.buildContext();assert.equal(f.c.validateGeneratedProposals([f.proposal('09:30','10:00')],context).length,0);assert.equal(f.c.validateGeneratedProposals([f.proposal('08:45','09:15')],context).length,0);assert.equal(f.c.validateGeneratedProposals([f.proposal()],context).length,1);const closed=week();closed[0]=[];f.setHours(closed);context=f.c.buildContext();assert.equal(f.c.validateGeneratedProposals([f.proposal()],context).length,0);
});

test('model end times cannot hide an authoritative duration crossing a break',async()=>{
 const f=await fixture(),context=f.c.buildContext();assert.equal(f.c.validateGeneratedProposals([f.proposal('08:45','09:00')],context).length,0);assert.equal(f.c.validateGeneratedProposals([f.proposal('08:00','10:00')],context).length,1);
});
test('hours changed during a model request discard the response without showing or saving it',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=await fixture({gate});f.setRaw([f.proposal()]);const pending=f.c.requestPlan();await Promise.resolve();f.setHours(Object.fromEntries(Array.from({length:7},(_,day)=>[day,[]])));release();const result=await pending;assert.equal(result.ok,false);assert.match(result.message,/hours|availability|changed/i);assert.equal(f.writes.length,0);assert.equal(f.document.querySelector('[data-apply-all]'),null);
});
test('review and manual proposal edits use pinned hours; changed timezone blocks Apply',async()=>{
 const f=await fixture();f.setRaw([f.proposal()]);assert.equal((await f.c.requestPlan()).ok,true);assert.match(f.document.body.textContent,/Saved weekly hours/);assert.equal(f.c.validateProposalDrafts([f.proposal('09:00','09:30')]),null);assert.equal(f.c.validateProposalDrafts([f.proposal('10:00','10:30')]).length,1);f.setZone('Australia/Brisbane');await f.c.applyAll();assert.equal(f.writes.length,0);assert.equal(f.task.date,undefined);
});

test('a replacement preview with the same row count refreshes its hours label',async()=>{
 const f=await fixture();f.setRaw([f.proposal()]);await f.c.requestPlan();f.setZone('Africa/Abidjan');assert.equal((await f.c.requestPlan()).ok,true);assert.match(f.document.querySelector('.ks-review-hours').textContent,/Africa\/Abidjan/);
});
test('safe Apply forwards the reviewed availability to persistence and failed saves restore task fields',async()=>{
 const f=await fixture();f.setRaw([f.proposal()]);await f.c.requestPlan();await f.c.applyAll();assert.equal(f.writes.length,1);assert.equal(f.writes[0].scheduleAvailability.timezone,'UTC');assert.deepEqual(f.writes[0].scheduleAvailability.weeklyAvailability,week());assert.equal(f.task.startTime,'08:00');const failed=await fixture({fail:true});failed.setRaw([failed.proposal()]);await failed.c.requestPlan();await failed.c.applyAll();assert.equal(failed.task.date,null);assert.equal(failed.task.startTime,null);assert.match(failed.document.body.textContent,/Restored/);
});
test('My day changed intersects blocked time with saved hours and keeps selected work on today',async()=>{
 const f=await fixture({scheduled:true}),change={description:'Appointment moved',taskIds:['a'],currentDate:'2026-10-18',blockedWindows:[{date:'2026-10-18',startTime:'10:00',endTime:'10:30'}]};f.setRaw([f.proposal('10:00','10:30')]);assert.equal((await f.c.requestPlan(null,change)).ok,false);f.setRaw([f.proposal('10:30','11:00')]);assert.equal((await f.c.requestPlan(null,change)).ok,true);assert.equal(f.writes.length,0);await f.c.applyAll();assert.equal(f.task.startTime,'10:30');assert.equal(f.task.date,'2026-10-18');
});
test('Schedule saved-hours changes on another device reject the planner transaction',async()=>{
 const base={userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'a',title:'Essay'}]}]}]},local=structuredClone(base);Object.assign(local.boards[0].sections[0].tasks[0],{date:'2026-10-18',startTime:'08:00',endTime:'08:30'});const f=await plannerFixture(base,{userData:{settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:week()}}}});assert.equal(typeof availability.schedulePlanningAvailability,'function');const options={scheduleAvailability:{timezone:'UTC',weeklyAvailability:week()}};f.setUserData({settings:{profile:{timezone:'UTC'},planning:{weeklyAvailability:null}}});await assert.rejects(f.context.savePlannerEdits('plan','one',base,local,options),/availability|hours|changed/i);assert.equal(f.writes.length,0);
});
