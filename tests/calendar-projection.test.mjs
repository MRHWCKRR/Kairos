import test from 'node:test';
import assert from 'node:assert/strict';
import {planningOccupancy} from '../planning-slots.js';
import {planningSignature} from '../planning-commands.js';
import {validateScheduleProposals} from '../schedule-utils.js';
import {buildToday} from '../today-model.js';
import * as month from '../schedule-month.js';
const projection=await import('../schedule-events.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error});
const date='2026-10-26';
const imported=(changes={})=>({id:'cal',title:'Class',date,start:'10:00',end:'11:00',readOnly:true,calendarSourceId:'school',externalId:'a'.repeat(64),...changes});
const segments=(events,on=date,options)=>{assert.equal(typeof projection.eventSegmentsForDate,'function');return projection.eventSegmentsForDate(events,on,options)};

test('dated commitments appear only on their date even with a stale weekly day',()=>{
 const events=[imported({day:1})];assert.deepEqual(segments(events).map(x=>[x.startMin,x.endMin]),[[600,660]]);assert.equal(segments(events,'2026-11-02').length,0);
});

test('weekly and dated overnight commitments include only their correct tails',()=>{
 const weekly={id:'sleep',day:0,start:'22:00',end:'06:00'},dated=imported({start:'23:00',end:'01:00'});
 assert.deepEqual(segments([weekly]).map(x=>[x.startMin,x.endMin,x.continued]),[[0,360,true]]);
 assert.deepEqual(segments([dated],'2026-10-27').map(x=>[x.startMin,x.endMin,x.continued]),[[0,60,true]]);
 assert.equal(segments([dated],'2026-11-03').length,0);
});

test('all-day events occupy a full date; transparent rows remain visible but never block planning',()=>{
 const events=[imported({allDay:true,start:'00:00',end:'00:00'}),imported({id:'free',transparent:true}),imported({id:'archived',archived:true})];
 assert.equal(segments(events).length,2);assert.deepEqual(segments(events,date,{busyOnly:true}).map(x=>[x.startMin,x.endMin]),[[0,1440]]);
 assert.deepEqual(planningOccupancy({scheduleEvents:events},date,date).map(x=>[x.startMin,x.endMin]),[[0,1440]]);
});

test('planning and reviewed proposals honour imported dates and transparent status',()=>{
 const events=[imported()],map=new Map([['task',{id:'task',estimatedMinutes:30}]]),proposal=on=>[{taskId:'task',to:{date:on,startTime:'10:15',endTime:'10:45'}}];
 assert.equal(planningOccupancy({scheduleEvents:events},date,date).length,1);assert.equal(planningOccupancy({scheduleEvents:events},'2026-11-02','2026-11-02').length,0);
 assert.equal(validateScheduleProposals(proposal(date),map,events).length,0);assert.equal(validateScheduleProposals(proposal('2026-11-02'),map,events).length,1);assert.equal(validateScheduleProposals(proposal(date),map,[imported({transparent:true})]).length,1);
});

test('planning signatures detect imported date and free-busy changes',()=>{
 const initial=planningSignature({scheduleEvents:[imported()]});assert.notEqual(initial,planningSignature({scheduleEvents:[imported({date:'2026-10-27'})]}));assert.notEqual(initial,planningSignature({scheduleEvents:[imported({transparent:true})]}));
});

test('Today and monthly entries share dated and overnight visibility without exposing source links',()=>{
 const events=[imported({title:'<img src=x>',url:'https://secret.invalid/token'}),{id:'sleep',title:'Sleep',day:0,start:'22:00',end:'06:00'}];
 assert.equal(buildToday({scheduleEvents:events},date).today.length,2);assert.equal(buildToday({scheduleEvents:events},'2026-11-02').today.length,1);
 assert.equal(typeof month.monthEventEntries,'function');const rows=month.monthEventEntries(events,date,'2026-10-27');assert.equal(rows.length,2);assert.equal(rows[0].url,undefined);
 const markup=month.calendarMonthMarkup(date,rows,{today:date});assert.match(markup,/data-calendar-event="cal"/);assert.doesNotMatch(markup,/<img|secret\.invalid/);
});

import {plannerFixture} from './helpers/planner-fixture.mjs';
import {buildReviewedSchedule} from '../task-list-model.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
import * as overdue from '../schedule-overdue.js';
import {planningClock} from '../planning-model.js';

test('reviewed scheduling transaction rechecks a newly imported busy commitment',async()=>{
 const now=Date.now(),today=new Date(now).toISOString().slice(0,10),tomorrow=new Date(now+86400000).toISOString().slice(0,10);
 const state={userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'task',title:'Read',estimatedMinutes:60,date:null,startTime:null,endTime:null}]}]}],scheduleEvents:[]};
 const p=buildReviewedSchedule(state,[{taskId:'task',from:{date:null,startTime:null,endTime:null},to:{date:tomorrow,startTime:'10:00',endTime:'11:00'}}],{currentDate:today,availability:{timezone:'UTC',weeklyAvailability:null},dayChange:null});
 const f=await plannerFixture({...state,scheduleEvents:[imported({date:tomorrow})]},{userData:{settings:{profile:{timezone:'UTC'}}}});
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'busy-import',now),/conflict|available|review|changed/i);assert.equal(f.writes.length,0);
 const live=f.data();live.scheduleEvents[0].transparent=true;f.setData(live);await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'free-import',now);assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks[0].startTime,'10:00');
});

test('Schedule renders an imported date once and opens a read-only escaped inspector',async()=>{
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review"></div></section></body></html>');
 let edits=0;const event=imported({title:'<img src=x onerror=alert(1)>'}),source=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({...overdue,planningClock,...utils,...recurrence,document,window,Date,CSS:{escape:String},requestAnimationFrame:()=>1,setInterval:()=>1,clearInterval(){}});vm.runInContext(source,context);
 const ws=context.initScheduleWorkspace({getBoards:()=>[],getScheduleEvents:()=>[event],getScheduleDate:()=>date,openRecurringEventEditor:()=>edits++});
 await ws.setDate(date);await ws.setView('week');assert.equal(document.querySelectorAll('[data-event-id="cal"]').length,1);
 await ws.selectItem('event','cal');assert.match(document.getElementById('schedule-inspector').textContent,/Read-only/);assert.equal(document.querySelector('[data-edit-event]'),null);assert.equal(document.querySelector('img'),null);assert.equal(edits,0);
 await ws.setDate('2026-11-02');assert.equal(document.querySelectorAll('[data-event-id="cal"]').length,0);ws.dispose?.();
});
