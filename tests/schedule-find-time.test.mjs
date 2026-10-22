import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecurrence} from '../recurrence-utils.js';
let model={};try{model=await import('../schedule-find-time-model.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const options={from:'2026-12-01',to:'2026-12-01',dayStart:'09:00',dayEnd:'13:00',availabilitySource:'daily',timezone:'UTC',gapMinutes:5,dailyLimitMinutes:0};
const clock={date:'2026-12-01',time:'08:00'};
const task=()=>({id:'t',title:'Read',estimatedMinutes:30});
const state=(tasks=[task()],events=[])=>({boards:[{id:'b',sections:[{id:'s',tasks}]}],scheduleEvents:events});
const find=(s=state(),target={taskId:'t'},opts=options,now=clock)=>{assert.equal(typeof model.findTaskTimes,'function');return model.findTaskTimes(s,target,opts,now)};
test('finds one placement per free gap with snapping and commitment spacing',()=>{const s=state([task(),{id:'busy',date:options.from,startTime:'10:00',endTime:'11:00'}]);const r=find(s);assert.deepEqual(r.slots.map(s=>s.startTime),['09:00','11:05']);assert.equal(r.duration,30);assert.equal(s.boards[0].sections[0].tasks[0].date,undefined)});
test('honours saved windows, deadlines, and the current minute',()=>{const t=task();t.dueDate=options.from;const week=Object.fromEntries(Array.from({length:7},(_,d)=>[d,d===2?[{start:'10:00',end:'12:00'}]:[]]));const r=find(state([t]),{taskId:'t'},{...options,to:'2026-12-02',weeklyAvailability:week,availabilitySource:'saved'},{date:options.from,time:'10:02'});assert.deepEqual(r.slots.map(s=>s.startTime),['10:05']);assert.equal(r.slots[0].date,options.from)});
test('blocks completed schedules and overnight fixed commitments',()=>{const s=state([task(),{id:'done',date:options.from,startTime:'09:00',endTime:'10:00',completed:true}],[{id:'night',day:1,start:'22:00',end:'10:30'}]);assert.deepEqual(find(s).slots.map(s=>s.startTime),['10:35'])});
test('daily assignment limits do not count the selected dated task twice',()=>{const t={...task(),assignmentId:'p',date:options.from};const s=state([t,{id:'other',assignmentId:'p',date:options.from,estimatedMinutes:30}]);assert.equal(find(s,{taskId:'t'},{...options,dailyLimitMinutes:60}).slots.length,1);assert.equal(find(s,{taskId:'t'},{...options,dailyLimitMinutes:45}).slots.length,0)});
test('flexible recurring placement uses one logical occurrence and its saved duration',()=>{const t={...task(),recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:options.from,mode:'flexible',exceptions:{[options.from]:{override:{durationMinutes:45},focusLoggedSeconds:90}}})};const r=find(state([t]),{taskId:'t',occurrenceDate:options.from});assert.equal(r.duration,45);assert.equal(r.slots[0].endTime,'09:45');assert.equal(r.target.occurrenceDate,options.from)});
test('stale occupancy and changed saved defaults invalidate a placement',()=>{const s=state(),r=find(s),placement={options,signature:r.signature};assert.equal(model.assertFindTimePlacement(s,r.target,r.slots[0],placement,clock),undefined);s.boards[0].sections[0].tasks.push({id:'new',date:options.from,startTime:'09:00',endTime:'10:00'});assert.throws(()=>model.assertFindTimePlacement(s,r.target,r.slots[0],placement,clock),/changed|review/i);assert.throws(()=>model.assertFindTimeSettings(options,{settings:{planning:{gapMinutes:10}}}),/changed/i)});
test('rejects missing ambiguous completed locked and already scheduled targets',()=>{for(const tasks of [[],[task(),task()],[{...task(),completed:true}],[{...task(),scheduleLocked:true}],[{...task(),date:options.from,startTime:'09:00',endTime:'10:00'}]])assert.throws(()=>find(state(tasks)),/task|occurrence|schedule|locked/i)});
import {buildScheduleChange} from '../schedule-change-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
test('guarded save rechecks occupancy and offers exact-once Undo for a single placement',async()=>{const s={...state(),userID:'one'},r=find(s),changes={...r.slots[0],lastScheduledMinutes:r.duration},request=buildScheduleChange(s,r.target,changes);request.command.placement={options,signature:r.signature};const store=await plannerFixture(s,{userData:{settings:{planning:{gapMinutes:5}}},failAfterCommit:true}),save=()=>store.context.persistTaskListCommand('plan','one',request.command,request.expected,'find-op',Date.now());await assert.rejects(save,/lost/);await save();assert.equal(store.writes.length,1);assert.equal(store.data().boards[0].sections[0].tasks[0].startTime,'09:00');await store.context.persistTaskListCommand('plan','one',{type:'schedule_undo',sourceOperationId:'find-op',expiresAt:Date.now()+9000},{sourceOperationId:'find-op'},'undo-op',Date.now());assert.equal(store.data().boards[0].sections[0].tasks[0].startTime,undefined)});
test('transaction rejects a newly occupied slot or remotely changed settings without a write',async()=>{for(const settingsChanged of [false,true]){const s={...state(),userID:'one'},r=find(s),request=buildScheduleChange(s,r.target,{...r.slots[0],lastScheduledMinutes:r.duration});request.command.placement={options,signature:r.signature};if(!settingsChanged)s.scheduleEvents=[{id:'new',day:2,start:'09:00',end:'10:00'}];const store=await plannerFixture(s,{userData:{settings:{planning:{gapMinutes:settingsChanged?10:5}}}});await assert.rejects(()=>store.context.persistTaskListCommand('plan','one',request.command,request.expected,'find-op',Date.now()),/changed|again/i);assert.equal(store.writes.length,0)}});
import {parseHTML} from 'linkedom';
let ui={};try{ui=await import('../schedule-find-time.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
function uiFixture(){assert.equal(typeof ui.mountFindTime,'function');const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><div id="schedule-calendar"><div class="ks-day-column" data-date="2026-12-01"><div class="ks-day-grid"></div></div></div></div></section></body></html>');let s=state(),owner='one',defaults={gapMinutes:5,dailyLimitMinutes:0},saved=[];const workspace={state:{selected:{type:'task',id:'t'}},inspectorSession:null};const controller={isBlocked:()=>false,save:async(...args)=>{saved.push(args);return true}};const root=document.getElementById('schedule-page'),view=ui.mountFindTime({root,getWorkspace:()=>workspace,getBridge:()=>({getBoards:()=>s.boards,getScheduleEvents:()=>s.scheduleEvents,getOwnerId:()=>owner,getPlanId:()=> 'plan',getTimezone:()=> 'UTC',getPlanningPreferences:()=>defaults,getWeeklyAvailability:()=>null}),getController:()=>controller,now:()=>Date.parse('2026-12-01T08:00:00Z')});return {root,document,view,workspace,saved,click:selector=>root.querySelector(selector).click(),setOwner:value=>owner=value,setDefaults:value=>defaults=value,setState:value=>s=value}}
test('choosing a gap only previews; confirmation sends a guarded placement through shared saving',async()=>{const f=uiFixture();f.click('[data-find-start]');assert.ok(f.root.querySelector('.ks-find-time-slot'));f.click('[data-find-slot]');assert.equal(f.saved.length,0);assert.match(f.root.querySelector('[data-find-preview]').textContent,/60|30/);f.click('[data-find-confirm]');await new Promise(r=>setImmediate(r));assert.equal(f.saved.length,1);assert.equal(f.saved[0][0].taskId,'t');assert.ok(f.saved[0][2].signature);f.view.dispose()});
test('settings, account and calendar changes reject stale confirmation and dirty drafts block searching',async()=>{for(const change of ['settings','account','calendar']){const f=uiFixture();f.click('[data-find-start]');f.click('[data-find-slot]');if(change==='settings')f.setDefaults({gapMinutes:10,dailyLimitMinutes:0});if(change==='account')f.setOwner('two');if(change==='calendar')f.setState(state([task(),{id:'busy',date:options.from,startTime:'07:00',endTime:'12:00'}]));f.click('[data-find-confirm]');await new Promise(r=>setImmediate(r));assert.equal(f.saved.length,0);f.view.dispose()}const f=uiFixture();f.workspace.inspectorSession={hasDraft:()=>true,isBusy:()=>false};f.click('[data-find-start]');assert.match(f.root.textContent,/save or discard/i);assert.equal(f.root.querySelector('.ks-find-time-slot'),null);f.view.dispose()});
test('off-cadence completed occurrences still block their stored time',()=>{const busy={id:'completed-series',startTime:'09:00',endTime:'10:00',recurrence:normalizeRecurrence({enabled:true,frequency:'daily',interval:2,startDate:'2026-11-30',mode:'fixed',exceptions:{[options.from]:{status:'completed'}}})};assert.deepEqual(find(state([task(),busy])).slots.map(s=>s.startTime),['10:05'])});
test('calendar redraws retain the highlighted slots and selected preview without duplicates',()=>{const f=uiFixture();f.click('[data-find-start]');f.click('[data-find-slot]');const grid=f.root.querySelector('.ks-day-grid');grid.replaceWith(f.document.createElement('div'));f.root.querySelector('.ks-day-column').firstElementChild.className='ks-day-grid';f.view.sync();assert.ok(f.root.querySelector('.ks-find-time-slot'));assert.equal(f.root.querySelectorAll('.ks-find-time-slot').length,1);assert.equal(f.root.querySelector('[data-find-confirm]').disabled,false);f.view.dispose()});

test('overdue recovery removes only the selected placement and permits an explicitly disclosed missed deadline',()=>{
 const t={...task(),date:options.from,startTime:'09:00',endTime:'12:00',dueDate:'2026-11-30'};
 const s=state([t]),recovery={...options,recovery:true};
 assert.throws(()=>find(s),/scheduled/i);
 const r=find(s,{taskId:'t'},recovery);
 assert.equal(r.afterDeadline,'2026-11-30');assert.equal(r.slots[0].startTime,'09:00');assert.equal(r.duration,180);
 assert.equal(model.assertFindTimePlacement(s,r.target,r.slots[0],{options:recovery,signature:r.signature},clock),undefined);
 assert.throws(()=>find(state([{...t,dueDate:undefined}]),{taskId:'t'},recovery),/overdue/i);
 assert.equal(find(state([{...t,dueDate:options.from}]),{taskId:'t'},{...recovery,to:'2026-12-02'},{...clock,time:'12:01'}).slots.length,0);
});
test('overdue fixed recurring recovery keeps other occurrences busy and preserves history through Undo',async()=>{
 const t={...task(),dueDate:'2020-11-30',date:'2026-11-30',startTime:'09:00',endTime:'10:00',recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-11-30',mode:'fixed',exceptions:{'2026-11-30':{focusLoggedSeconds:90,override:{durationMinutes:45}}}})};
 const s={...state([t]),userID:'one'},target={taskId:'t',occurrenceDate:'2026-11-30'},opts={...options,recovery:true},r=find(s,target,opts);
 assert.equal(r.duration,45);assert.equal(r.previous.endTime,'09:45');assert.equal(r.slots[0].startTime,'10:05');
 const request=buildScheduleChange(s,target,{...r.slots[0],durationMinutes:r.duration});request.command.placement={options:opts,signature:r.signature};
 const store=await plannerFixture(s,{userData:{settings:{planning:{gapMinutes:5}}}});
 await store.context.persistTaskListCommand('plan','one',request.command,request.expected,'recover',Date.now());
 let saved=store.data().boards[0].sections[0].tasks[0];
 assert.equal(saved.startTime,'09:00');assert.equal(saved.recurrence.exceptions['2026-11-30'].override.date,options.from);assert.equal(saved.recurrence.exceptions['2026-11-30'].focusLoggedSeconds,90);
 await store.context.persistTaskListCommand('plan','one',{type:'schedule_undo',sourceOperationId:'recover',expiresAt:Date.now()+9000},{sourceOperationId:'recover'},'recover-undo',Date.now());
 assert.deepEqual(store.data().boards[0].sections[0].tasks[0],{...t,archived:false});
});
test('overdue preview shows the previous placement and missed deadline before guarded confirmation',async()=>{
 const f=uiFixture();f.setState(state([{...task(),date:'2026-11-30',startTime:'09:00',endTime:'10:00',dueDate:'2026-11-30'}]));f.view.sync();
 assert.equal(f.root.querySelector('[data-find-start]')?.textContent,'Find a new time');
 f.click('[data-find-start]');f.click('[data-find-slot]');
 assert.match(f.root.querySelector('[data-find-preview]').textContent,/previous|from/i);
 assert.match(f.root.querySelector('[data-find-preview]').textContent,/after.*deadline/i);
 assert.match(f.root.querySelector('[data-find-preview]').textContent,/2026-11-30/);
 assert.equal(f.saved.length,0);f.click('[data-find-confirm]');await new Promise(r=>setImmediate(r));
 assert.equal(f.saved.length,1);assert.equal(f.saved[0][2].options.recovery,true);assert.equal(f.saved[0][1].dueDate,undefined);f.view.dispose();
});
test('direct recovery action navigates to today and selects without returning to the old date',async()=>{
 const f=uiFixture();f.setState(state([{...task(),date:'2026-11-30',startTime:'09:00',endTime:'10:00'}]));
 const calls=[];f.workspace.setDate=async date=>{calls.push(date);return true};f.workspace.selectItem=async(type,id,opts)=>{calls.push(opts);f.workspace.state.selected={type,id};return true};
 const button=f.document.createElement('button');button.dataset.recoverTask='t';f.root.appendChild(button);button.click();await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['2026-12-01',{keepDate:true}]);assert.ok(f.root.querySelector('[data-find-slot]'));assert.equal(f.saved.length,0);f.view.dispose();
});
test('direct recovery waits for draft navigation and rejects a switched account',async()=>{
 for(const change of ['draft','account','save']){
  const f=uiFixture();let selected=0,navigated=0;
  f.workspace.inspectorSession={hasDraft:()=>change==='draft',isBusy:()=>change==='save'};
  f.workspace.setDate=async()=>{navigated++;if(change==='account')f.setOwner('two');return change!=='draft'};
  f.workspace.selectItem=async()=>{selected++;return true};
  const button=f.document.createElement('button');button.dataset.recoverTask='t';f.root.appendChild(button);button.click();await new Promise(r=>setImmediate(r));
  assert.equal(selected,0);assert.equal(f.saved.length,0);assert.equal(navigated,change==='save'?0:1);
  if(change==='save')assert.match(f.root.querySelector('[data-recover-status]').textContent,/finish.*save/i);
  f.view.dispose();
 }
});
test('remote deadline or schedule edits invalidate an overdue preview without saving',()=>{
 const original={...task(),date:'2026-11-30',startTime:'09:00',endTime:'10:00'},opts={...options,recovery:true};
 for(const change of [{dueDate:'2026-11-29'},{date:options.from,startTime:'12:00',endTime:'13:00'}]){
  const s=state([structuredClone(original)]),r=find(s,{taskId:'t'},opts);Object.assign(s.boards[0].sections[0].tasks[0],change);
  assert.throws(()=>model.assertFindTimePlacement(s,r.target,r.slots[0],{options:opts,signature:r.signature},clock),/changed|overdue/i);
 }
});
