import test from 'node:test';
import assert from 'node:assert/strict';
let model={};try{model=await import('../schedule-overdue.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const clock={date:'2026-12-01',time:'10:30'};
test('overdue classification uses deadlines, scheduled ends and dated unfinished work',()=>{
 assert.equal(typeof model.taskOverdueState,'function');
 assert.equal(model.taskOverdueState({dueDate:'2026-11-30'},clock),'deadline');
 assert.equal(model.taskOverdueState({date:clock.date,startTime:'09:00',endTime:'10:00'},clock),'schedule');
 assert.equal(model.taskOverdueState({date:clock.date,startTime:'10:00',endTime:'11:00'},clock),null);
 assert.equal(model.taskOverdueState({date:'2026-11-30'},clock),'date');
 assert.equal(model.taskOverdueState({},clock),null);
 assert.equal(model.taskOverdueState({completed:true,dueDate:'2026-11-30'},clock),null);
});
test('overnight work remains current until its end on the following day',()=>{
 assert.equal(typeof model.taskOverdueState,'function');
 const task={date:'2026-11-30',startTime:'23:00',endTime:'01:00'};
 assert.equal(model.taskOverdueState(task,{date:clock.date,time:'00:30'}),null);
 assert.equal(model.taskOverdueState(task,{date:clock.date,time:'01:00'}),'schedule');
});
test('backlog groups overdue schedules once and uses moved occurrence dates',()=>{
 assert.equal(typeof model.scheduleBacklogItems,'function');
 const entries=[{task:{id:'old',date:'2026-11-30',startTime:'09:00',endTime:'10:00'}},{task:{id:'new'}},{task:{id:'done',completed:true,dueDate:'2026-11-30'}}];
 const occurrences=[{status:'pending',mode:'fixed',displayDate:'2026-11-30',task:{id:'series',date:'2026-11-30',startTime:'09:00',endTime:'10:00'},durationMinutes:60},{status:'pending',mode:'flexible',displayDate:'2026-12-03',occurrenceDate:'2026-11-29',task:{id:'moved',date:'2026-12-03'}},{status:'skipped',mode:'flexible',task:{date:'2026-11-30'}}];
 const items=model.scheduleBacklogItems(entries,occurrences,clock);
 assert.deepEqual(items.filter(x=>x.overdueReason).map(x=>x.task.id),['old','series']);
 assert.deepEqual(items.filter(x=>!x.overdueReason).map(x=>x.task.id),['new','moved']);
});

import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
import {planningClock} from '../planning-model.js';
const source=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
function fixture(timezone='UTC'){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review"></div></section></body></html>');
 let time='2026-12-01T10:30:00Z';class Clock extends Date{constructor(...args){super(...(args.length?args:[time]))}}
 const tasks=[{id:'old',title:'Missed task',date:'2026-11-30',startTime:'09:00',endTime:'10:00'},{id:'new',title:'Other task'},{id:'current',title:'Current task',date:clock.date,startTime:'10:00',endTime:'11:00'},{id:'locked',title:'Locked task',date:'2026-11-30',scheduleLocked:true}];
 const context=vm.createContext({...utils,...recurrence,...model,planningClock,document,window,Date:Clock,CSS:{escape:String},requestAnimationFrame:()=>1,setInterval:()=>1,clearInterval(){}});vm.runInContext(source,context);
 const workspace=context.initScheduleWorkspace({getBoards:()=>[{id:'b',sections:[{id:'s',tasks}]}],getScheduleEvents:()=>[],getTimezone:()=>timezone});
 return {document,workspace,tasks,setTime:value=>time=value};
}
test('workspace separates overdue schedules and refreshes the list when a scheduled end passes',async()=>{
 const f=fixture(),root=f.document.getElementById('schedule-backlog');
 assert.equal(root.querySelector('[aria-label="Overdue"] [data-task-id="old"]')?.textContent.includes('Missed task'),true);
 assert.ok(root.querySelector('[aria-label="Unscheduled"] [data-task-id="new"]'));
 assert.equal(root.querySelector('[data-recover-task="locked"]').disabled,true);
 assert.equal(root.querySelector('[data-task-id="current"]'),null);
 const original=root.innerHTML;f.workspace.activate();assert.equal(root.innerHTML,original);
 f.setTime('2026-12-01T11:01:00Z');f.workspace.activate();assert.ok(root.querySelector('[aria-label="Overdue"] [data-task-id="current"]'));
 await f.workspace.setDate(clock.date);await f.workspace.selectItem('task','old',{keepDate:true});assert.equal(f.workspace.state.focusDate,clock.date);
 assert.equal(root.querySelector('button button'),null);
});
test('profile midnight refreshes recurring overdue work while viewing a past date',async()=>{
 const f=fixture('Asia/Tokyo');
 f.tasks.push({id:'series',title:'Daily task',startTime:'00:00',endTime:'00:01',recurrence:recurrence.normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-12-01',mode:'fixed'})});
 f.setTime('2026-12-01T14:59:00Z');await f.workspace.setDate('2026-11-30');
 assert.equal(f.document.querySelector('[data-recover-occurrence="2026-12-02"]'),null);
 f.setTime('2026-12-01T15:02:00Z');f.workspace.activate();assert.ok(f.document.querySelector('[data-recover-occurrence="2026-12-02"]'));
});
