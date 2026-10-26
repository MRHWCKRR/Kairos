import {buildReviewedSchedule,applyTaskListCommand} from '../task-list-model.js';
import * as availability from '../schedule-planning-availability.js';
import {shiftPlanningDate} from '../planning-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
import * as changes from '../schedule-day-change.js';
import {aiErrorMessage} from '../ai-request.js';

const source=(await readFile(new URL('../schedule-ai.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
function setup({planner,persist}={}) {
  let epoch=Date.parse('2026-10-13T10:00:00');
  class Clock extends Date {constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
  const {document,window}=parseHTML('<div id="schedule-page"><div id="schedule-toolbar"><button data-plan>Plan</button></div><div class="schedule-workspace-shell"><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review" hidden></div></div>');
  Object.defineProperty(document,'readyState',{value:'loading'});
  const tasks=[{id:'a',title:'Revision',date:'2026-10-13',startTime:'15:00',endTime:'16:00'},{id:'keep',title:'Lunch',date:'2026-10-13',startTime:'12:00',endTime:'13:00',scheduleLocked:true}];
  const boards=[{id:'board',title:'Study',sections:[{id:'section',tasks}]}],events=[];let saves=0,owner='one',sentContext;
  window.__kairosScheduleBridge={getBoards:()=>boards,getScheduleEvents:()=>events,getTimeFormat:()=> '24',getOwnerId:()=>owner,getPlanId:()=> 'plan',
    requestAiPlan:async context=>{sentContext=context;return planner?planner(context):[{taskId:'a',to:{date:'2026-10-13',startTime:'16:00',endTime:'17:00'},reason:'After the appointment.'}];},
    commitScheduleCommand:async(command,expected)=>{const result=applyTaskListCommand({boards,scheduleEvents:events},command,expected,{now:epoch});saves++;if(persist)await persist();tasks.splice(0,tasks.length,...result.next.boards[0].sections[0].tasks)},refreshAppViews:()=>{}};
  window.__kairosScheduleWorkspace={state:{anchor:new Clock(),view:'day',selected:{type:null,id:null}},render:()=>{},focusDateTime:()=>{}};
  const context=vm.createContext({document,window,Date:Clock,console:{error:()=>{}},CSS:{escape:String},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,structuredClone,
    ...utils,...recurrence,...changes,...availability,shiftPlanningDate,buildReviewedSchedule:(s,i,o)=>buildReviewedSchedule(s,i,o,{now:epoch}),schedulePlanningClock:(bridge,now=epoch)=>availability.schedulePlanningClock(bridge,now),aiErrorMessage,mountDayChange:()=>({setBusy:()=>{}})});
  vm.runInContext(source,context);
  return {document,context,tasks,events,boards,saves:()=>saves,sent:()=>sentContext,advance:time=>epoch=Date.parse('2026-10-13T'+time),switchOwner:()=>owner='two',
    preview:(taskId='a')=>{context.selectedTaskIds=Array.isArray(taskId)?taskId:[taskId];return vm.runInContext("requestPlan(null,{description:'Appointment changed',currentDate:'2026-10-13',taskIds:selectedTaskIds,blockedWindows:[{date:'2026-10-13',startTime:'15:00',endTime:'16:00'}]})",context);},
    apply:()=>vm.runInContext('applyAll()',context)};
}
test('day-change preview is read-only and Apply persists only reviewed flexible changes',async()=>{
  const f=setup();assert.equal((await f.preview()).ok,true);
  assert.equal(f.tasks[0].startTime,'15:00');assert.equal(f.saves(),0);
  assert.equal(f.sent().mode,'replan-day');assert.equal(f.sent().tasks.length,1);assert.equal(f.sent().scheduledCommitments[0].id,'keep');
  await f.apply();assert.equal(f.saves(),1);assert.equal(f.tasks[0].startTime,'16:00');assert.equal(f.tasks[1].startTime,'12:00');
});
test('new locks, changed task times, underway tasks and account changes invalidate a preview',async()=>{
  for(const mutate of [f=>f.tasks[0].scheduleLocked=true,f=>f.tasks[0].startTime='15:30',f=>f.advance('15:30:00'),f=>f.advance('15:00:00'),f=>f.switchOwner()]) {
    const f=setup();await f.preview();mutate(f);await f.apply();assert.equal(f.saves(),0);
  }
});
test('new fixed commitments are checked again at Apply',async()=>{
  const f=setup();await f.preview();f.events.push({id:'new',title:'Meeting',day:2,start:'16:00',end:'17:00'});
  await f.apply();assert.equal(f.saves(),0);assert.equal(f.tasks[0].startTime,'15:00');
});
test('blocked time, other dates and tasks outside the selected scope cannot enter the preview',async()=>{
  for(const proposal of [{taskId:'a',to:{date:'2026-10-13',startTime:'15:30',endTime:'16:30'}},{taskId:'a',to:{date:'2026-10-14',startTime:'16:00',endTime:'17:00'}},{taskId:'keep',to:{date:'2026-10-13',startTime:'17:00',endTime:'18:00'}}]) {
    const f=setup({planner:()=>[proposal]});assert.equal((await f.preview()).ok,false);assert.equal(f.saves(),0);
  }
});
test('failed persistence leaves the task untouched and retains the proposal for retry',async()=>{
  const f=setup({persist:async()=>{throw Error('offline');}});await f.preview();await f.apply();
  assert.equal(f.tasks[0].startTime,'15:00');assert.equal(f.tasks[0].endTime,'16:00');
  assert.equal(vm.runInContext('proposals.length',f.context),1);
});
test('repeated Apply cannot submit a second persistence request',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve),f=setup({persist:()=>pending});await f.preview();
  const first=f.apply();await f.apply();assert.equal(f.saves(),1);finish();await first;
});

test('replanning a flexible recurring task changes only today’s occurrence',async()=>{
  const f=setup({planner:()=>[{taskId:'series::2026-10-13',to:{date:'2026-10-13',startTime:'16:00',endTime:'17:00'},reason:'After the appointment.'}]});
  f.tasks[0]=recurrence.applyOccurrenceOverride({id:'series',title:'Read',date:'2026-10-13',estimatedMinutes:60,recurrence:{enabled:true,frequency:'daily',startDate:'2026-10-13',mode:'flexible'}},'2026-10-13',{date:'2026-10-13',startTime:'15:00',endTime:'16:00'});
  assert.equal((await f.preview('series::2026-10-13')).ok,true);await f.apply();
  const today=recurrence.generateTaskOccurrences(f.tasks[0],'2026-10-13','2026-10-13',{today:'2026-10-13'})[0];
  assert.equal(today.startTime,'16:00');assert.equal(f.saves(),1);
  const tomorrow=recurrence.generateTaskOccurrences(f.tasks[0],'2026-10-14','2026-10-14',{today:'2026-10-14'})[0];
  assert.equal(tomorrow.startTime,null);assert.equal(f.tasks[0].recurrence.mode,'flexible');
});

test('a dependent move cannot be applied alone while its new slot is still occupied',async()=>{
  const f=setup({planner:()=>[{taskId:'a',to:{date:'2026-10-13',startTime:'16:00',endTime:'17:00'}},{taskId:'b',to:{date:'2026-10-13',startTime:'17:00',endTime:'18:00'}}]});
  f.tasks.push({id:'b',title:'Reading',date:'2026-10-13',startTime:'16:00',endTime:'17:00'});
  assert.equal((await f.preview(['a','b'])).ok,true);
  await vm.runInContext('applyOne(0)',f.context);assert.equal(f.saves(),0);assert.equal(f.tasks[0].startTime,'15:00');
  await f.apply();assert.equal(f.saves(),1);assert.equal(f.tasks[0].startTime,'16:00');assert.equal(f.tasks[2].startTime,'17:00');
});
test('editing a proposal keeps its original schedule for stale checks and remains a draft',async()=>{
  const f=setup();await f.preview();
  const draft=vm.runInContext("validateProposalDrafts([{...proposals[0],to:{date:'2026-10-13',startTime:'16:30',endTime:'17:30'}}])",f.context);
  assert.equal(draft[0].from.startTime,'15:00');assert.equal(f.tasks[0].startTime,'15:00');assert.equal(f.saves(),0);
  f.context.drafts=draft;vm.runInContext('proposals=drafts',f.context);await f.apply();assert.equal(f.tasks[0].startTime,'16:30');
});
