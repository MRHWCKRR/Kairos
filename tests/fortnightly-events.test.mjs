import test from 'node:test';
import assert from 'node:assert/strict';
import {isEventOccurrenceDate,eventOccurrence} from '../event-occurrences.js';
import {eventSegmentsForDate,eventCommitmentsForRange} from '../schedule-events.js';
import {buildNativeEventChange,applyNativeEventChange,buildNativeEventUndo,applyNativeEventUndo} from '../native-event-commands.js';
import {planningSignature} from '../planning-commands.js';
import {dueBedtimeReminders} from '../task-reminders.js';
import {buildCalendarExport} from '../calendar-export.js';
import ICAL from '../calendar-ical.js';
const event=()=>({id:'e',title:'Alternating class',category:'class',day:5,start:'23:00',end:'01:00',allDay:false,transparent:false,intervalWeeks:2,anchorDate:'2026-10-30'});
const state=e=>({boards:[],scheduleEvents:[e]}),now=Date.parse('2026-10-28T08:00Z'),build=(s,e)=>buildNativeEventChange(s,{eventId:'e',event:e},'UTC',now);

test('fortnightly calendar dates alternate both sides of anchor across years without timezone arithmetic',()=>{
 const e=event();for(const date of ['2026-10-16','2026-10-30','2026-11-13','2027-01-08'])assert.equal(isEventOccurrenceDate(e,date),true,date);
 for(const date of ['2026-10-23','2026-11-06','2027-01-01','2026-10-31'])assert.equal(isEventOccurrenceDate(e,date),false,date);
 assert.equal(eventSegmentsForDate([e],'2026-11-06').length,0);assert.equal(eventSegmentsForDate([e],'2026-11-14')[0].continued,true);
 const weekly={...e};delete weekly.intervalWeeks;delete weekly.anchorDate;assert.equal(isEventOccurrenceDate(weekly,'2026-11-06'),true);
});
test('bounds never flip alternating weeks; moved exceptions retain identity outside bounds',()=>{
 const e={...event(),startDate:'2026-11-01',endDate:'2026-11-13',exceptions:{'2026-11-13':{override:{id:'e',title:'Moved',date:'2026-11-06',start:'23:00',end:'01:00'}}}};
 assert.equal(eventSegmentsForDate([e],'2026-11-06')[0].event.occurrenceDate,'2026-11-13');assert.equal(eventSegmentsForDate([e],'2026-11-07')[0].continued,true);
 assert.equal(eventOccurrence(e,'2026-11-06'),null);assert.equal(eventOccurrence(e,'2026-11-13').intervalWeeks,undefined);assert.equal(eventOccurrence(e,'2026-11-13').anchorDate,undefined);
 const skipped={...event(),exceptions:{'2026-10-30':{skipped:true}}};assert.equal(eventSegmentsForDate([skipped],'2026-10-30').length,0);
});
test('commands validate cadence fields and merged state and remove cadence on one-off conversion',()=>{
 const s=state(event()),p=build(s,{...event(),title:'Renamed'});assert.equal(p.command.event.intervalWeeks,2);
 for(const v of [{intervalWeeks:0},{intervalWeeks:3},{intervalWeeks:'2'},{intervalWeeks:null},{anchorDate:null},{anchorDate:'2026-02-30'},{anchorDate:'2026-10-29'}])assert.throws(()=>build(s,{...event(),...v}));
 const missing=event();delete missing.anchorDate;assert.throws(()=>build(state({...event(),intervalWeeks:1,anchorDate:undefined}),missing));
 assert.throws(()=>build(s,{...event(),date:'2026-10-30',day:undefined}));
 const once={id:'e',title:'Once',category:'other',date:'2026-11-01',start:'09:00',end:'10:00',allDay:false,transparent:false};
 const q=build(s,once),out=applyNativeEventChange(s,q.command,q.expected,{now});assert.equal(out.next.scheduleEvents[0].intervalWeeks,undefined);assert.equal(out.next.scheduleEvents[0].anchorDate,undefined);
});
test('saved exceptions block cadence changes but allow bounds and restoring a dormant exception',()=>{
 const e={...event(),exceptions:{'2026-10-30':{skipped:true}}},s=state(e);for(const change of [{intervalWeeks:1},{anchorDate:'2026-11-13'},{day:4,anchorDate:'2026-10-29'}])assert.throws(()=>build(s,{...event(),...change}),/restore|exception/i);
 const p=build(s,{...event(),startDate:'2026-11-01'});assert.equal(p.inactiveExceptions.length,1);
 const saved=applyNativeEventChange(s,p.command,p.expected,{now}).next;assert.ok(buildNativeEventChange(saved,{eventId:'e',event:null,occurrenceDate:'2026-10-30',occurrenceOperation:'restore'},'UTC',now));
 assert.throws(()=>buildNativeEventChange(s,{eventId:'e',event:null,occurrenceDate:'2026-11-06',occurrenceOperation:'skip'},'UTC',now));
});
test('cadence invalidates planning reviews and native Undo restores exact anchor',()=>{
 const s=state(event());assert.notEqual(planningSignature(s),planningSignature(state({...event(),anchorDate:'2026-11-06'})));
 assert.notEqual(planningSignature(s),planningSignature(state({...event(),intervalWeeks:1})));
 const p=build(s,{...event(),anchorDate:'2026-11-06'}),a=applyNativeEventChange(s,p.command,p.expected,{now}),u=buildNativeEventUndo(a.next,'op',a.result.nativeEventUndo,'UTC',now);
 const restored=applyNativeEventUndo(a.next,a.result.nativeEventUndo,u.command,u.expected,{now}).next;assert.equal(restored.scheduleEvents[0].anchorDate,'2026-10-30');
 assert.throws(()=>applyNativeEventChange(state({...event(),anchorDate:'2026-11-06'}),p.command,p.expected,{now}),/changed|review/i);
});
test('planning, conflicts and sleep reminders share off-week exclusion including overnight tails',()=>{
 const e={...event(),category:'sleep',start:'22:00',end:'06:00'},s=state(e);s.boards=[{id:'b',sections:[{id:'s',tasks:[{id:'off',title:'Off week',date:'2026-11-06',startTime:'22:00',endTime:'23:00'},{id:'on',title:'On week',date:'2026-11-13',startTime:'22:00',endTime:'23:00'}]}]}];
 const p=build(s,e);assert.deepEqual(p.conflicts.map(c=>c.title),['On week']);
 assert.equal(eventCommitmentsForRange([e],'2026-11-06','2026-11-07').length,0);
 assert.equal(eventCommitmentsForRange([e],'2026-11-13','2026-11-14').length,2);
 assert.equal(dueBedtimeReminders([e],Date.parse('2026-11-06T21:50Z'),'UTC').length,0);
 assert.equal(dueBedtimeReminders([e],Date.parse('2026-11-13T21:50Z'),'UTC').length,1);
});
test('calendar export includes only actual alternating occurrences with complete overnight intervals',async()=>{
 const r=await buildCalendarExport(state(event()),{ownerId:'one',planId:'plan',from:'2026-10-30',to:'2026-11-14',timezone:'UTC',now});
 const rows=new ICAL.Component(ICAL.parse(r.content)).getAllSubcomponents('vevent');assert.equal(rows.length,2);
 assert.deepEqual(rows.map(r=>r.getFirstPropertyValue('dtstart').toString()),['2026-10-30T23:00:00Z','2026-11-13T23:00:00Z']);
 assert.equal(rows[1].getFirstPropertyValue('dtend').toString(),'2026-11-14T01:00:00Z');
});
