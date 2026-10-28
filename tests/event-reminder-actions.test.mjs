import test from 'node:test';import assert from 'node:assert/strict';
import {buildNativeEventChange,applyNativeEventChange,buildNativeEventUndo,applyNativeEventUndo} from '../native-event-commands.js';
import {previewAiEventChange,applyAiEventChange,aiEventPreviewMarkup} from '../ai-event-actions.js';
import {validateActionShape,ACTION_INSTRUCTIONS} from '../ai-action-schema.js';
import {eventOccurrence} from '../event-occurrences.js';import {dueEventReminders} from '../event-reminders.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const event=()=>({id:'e',title:'Class',category:'class',day:5,start:'09:00',end:'10:00',allDay:false,transparent:false}),state=()=>({userID:'one',boards:[],scheduleEvents:[event()]}),now=Date.parse('2026-10-28T08:00Z'),build=(s,e)=>buildNativeEventChange(s,{eventId:'e',event:e},'UTC',now);
test('native event commands accept only supported reminder states and retain/removal Undo',()=>{
 for(const reminderMinutes of [5,15,30,60,null,'default']){const s=state(),p=build(s,{...event(),reminderMinutes}),out=applyNativeEventChange(s,p.command,p.expected,{now});assert.equal(out.next.scheduleEvents[0].reminderMinutes,reminderMinutes);const u=buildNativeEventUndo(out.next,'op',out.result.nativeEventUndo,'UTC',now);assert.equal(applyNativeEventUndo(out.next,out.result.nativeEventUndo,u.command,u.expected,{now}).next.scheduleEvents[0].reminderMinutes,undefined);}
 for(const reminderMinutes of [0,10,1440,'15',true,{},'off'])assert.throws(()=>build(state(),{...event(),reminderMinutes}));
 const s=state();s.scheduleEvents[0].reminderMinutes=30;assert.equal(applyNativeEventChange(s,build(s,{...event(),title:'Renamed'}).command,build(s,{...event(),title:'Renamed'}).expected,{now}).next.scheduleEvents[0].reminderMinutes,30);
});
test('all-day conversion clears custom reminders; explicitly setting custom on all-day rejects',()=>{
 const s=state();s.scheduleEvents[0].reminderMinutes=30;const p=build(s,{...event(),allDay:true,start:'00:00',end:'00:00'});assert.equal(applyNativeEventChange(s,p.command,p.expected,{now}).next.scheduleEvents[0].reminderMinutes,null);assert.throws(()=>build(s,{...event(),allDay:true,start:'00:00',end:'00:00',reminderMinutes:15}),/timed|all.day/i);
});
test('individual reminder overrides inherit old series settings but can explicitly reset default or Off',()=>{
 const s=state();s.scheduleEvents[0].reminderMinutes=30;
 for(const reminderMinutes of [5,null,'default']){const p=buildNativeEventChange(s,{eventId:'e',event:{id:'e',title:'One class',category:'class',date:'2026-10-30',start:'09:00',end:'10:00',allDay:false,transparent:false,reminderMinutes},occurrenceDate:'2026-10-30',occurrenceOperation:'update'},'UTC',now),out=applyNativeEventChange(s,p.command,p.expected,{now});assert.equal(out.next.scheduleEvents[0].reminderMinutes,30);assert.equal(eventOccurrence(out.next.scheduleEvents[0],'2026-10-30').reminderMinutes,reminderMinutes);assert.equal(eventOccurrence(out.next.scheduleEvents[0],'2026-11-06').reminderMinutes,30);}
});
test('AI sets and removes event reminders with accurate review while ordinary updates preserve custom state',()=>{
 const p=previewAiEventChange(state(),{type:'update_schedule_event',args:{eventId:'e',reminderMinutes:30}},'UTC',{now});assert.match(aiEventPreviewMarkup(p.summary),/30 minutes before/);assert.match(aiEventPreviewMarkup(p.summary),/Kairos is open/i);const s=applyAiEventChange(state(),p.action,p.approval,{now}).next;
 const q=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',newTitle:'New class'}},'UTC',{now});assert.equal(q.summary.event.reminderMinutes,30);
 const off=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',reminderMinutes:null}},'UTC',{now});assert.match(aiEventPreviewMarkup(off.summary),/Reminder: Off/i);assert.equal(applyAiEventChange(s,off.action,off.approval,{now}).next.scheduleEvents[0].reminderMinutes,null);
 const def=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',reminderMinutes:'default'}},'UTC',{now});assert.equal(def.summary.event.reminderMinutes,'default');
 for(const reminderMinutes of [0,10,'30',false])assert.throws(()=>validateActionShape({type:'update_schedule_event',args:{eventId:'e',reminderMinutes}}));assert.throws(()=>validateActionShape({type:'update_schedule_event',args:{eventId:'e',occurrenceDate:'2026-10-30',restoreOccurrence:true,reminderMinutes:15}}));assert.match(ACTION_INSTRUCTIONS,/reminderMinutes/);
 const allDay=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',allDay:true}},'UTC',{now});assert.equal(allDay.summary.event.reminderMinutes,null);
});
test('AI occurrence reminder changes, receipt replay and native Undo preserve reviewed settings',async()=>{
 const s=state();s.scheduleEvents[0].reminderMinutes=30;const f=await plannerFixture(s,{userData:{settings:{profile:{timezone:'UTC'}}},failAfterCommit:true}),a={type:'update_schedule_event',args:{eventId:'e',occurrenceDate:'2026-10-30',reminderMinutes:5}},p=await f.context.previewKairosAction(a,{ownerId:'one',planId:'plan'}),opts={ownerId:'one',planId:'plan',operationId:'event-reminder',createdAt:Date.now(),confirmation:p.approval};await assert.rejects(f.execute(p.action,opts),/lost/i);const retry=await f.execute(p.action,opts);assert.equal(retry.event.reminderMinutes,5);assert.equal(f.writes.length,1);assert.equal(dueEventReminders(f.data().scheduleEvents,Date.parse('2026-10-30T08:50Z'),'UTC').length,0);const u=await f.context.loadActionUndoPreview('plan','one');await f.context.persistTaskListCommand('plan','one',u.command,u.expected,'undo-reminder',Date.now());assert.equal(f.data().scheduleEvents[0].exceptions,undefined);
});
