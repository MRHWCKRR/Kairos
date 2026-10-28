import test from 'node:test';import assert from 'node:assert/strict';
import {previewAiEventChange,applyAiEventChange,aiEventPreviewMarkup} from '../ai-event-actions.js';
import {validateActionShape,ACTION_INSTRUCTIONS} from '../ai-action-schema.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {eventSegmentsForDate} from '../schedule-events.js';
const e={id:'e',title:'Class',category:'class',day:5,start:'09:00',end:'10:00',allDay:false,transparent:false},state=()=>({userID:'one',boards:[],scheduleEvents:[{...e}]}),action={type:'update_schedule_event',args:{eventId:'e',intervalWeeks:2,anchorDate:'2026-10-30'}},now=Date.parse('2026-10-28T08:00Z');
test('AI converts a weekly series with explicit cadence, preserves it on updates and discloses reference in review',()=>{
 validateActionShape(action);const p=previewAiEventChange(state(),action,'UTC',{now});assert.match(aiEventPreviewMarkup(p.summary),/Every 2 weeks/i);assert.match(aiEventPreviewMarkup(p.summary),/2026-10-30/);
 const out=applyAiEventChange(state(),p.action,p.approval,{now});assert.equal(out.next.scheduleEvents[0].intervalWeeks,2);
 const q=previewAiEventChange(out.next,{type:'update_schedule_event',args:{eventId:'e',newTitle:'Renamed'}},'UTC',{now});assert.equal(q.approval.command.event.anchorDate,'2026-10-30');assert.equal(q.approval.command.event.intervalWeeks,2);
 const move=previewAiEventChange(out.next,{type:'update_schedule_event',args:{eventId:'e',occurrenceDate:'2026-10-30',date:'2026-11-06'}},'UTC',{now});assert.equal(move.approval.command.event.intervalWeeks,undefined);assert.equal(eventSegmentsForDate(applyAiEventChange(out.next,move.action,move.approval,{now}).next.scheduleEvents,'2026-11-06').length,1);
});
test('AI requires reference for fortnightly creation and conversion, rejects invalid and occurrence cadence fields',()=>{
 const create={type:'create_schedule_event',args:{title:'Shift',day:5,intervalWeeks:2,anchorDate:'2026-10-30',start:'09:00',end:'10:00'}};
 assert.equal(previewAiEventChange(state(),create,'UTC',{eventIdFactory:()=> 'shift',now}).summary.event.anchorDate,'2026-10-30');
 for(const args of [{eventId:'e',intervalWeeks:2},{eventId:'e',intervalWeeks:3},{eventId:'e',intervalWeeks:'2'},{eventId:'e',intervalWeeks:2,anchorDate:'2026-02-30'},{eventId:'e',intervalWeeks:2,anchorDate:'2026-10-29'},{eventId:'e',date:'2026-10-30',intervalWeeks:2,anchorDate:'2026-10-30'},{eventId:'e',occurrenceDate:'2026-10-30',intervalWeeks:1},{eventId:'e',occurrenceDate:'2026-10-30',restoreOccurrence:true,anchorDate:'2026-10-30'}])assert.throws(()=>previewAiEventChange(state(),{type:'update_schedule_event',args},'UTC',{now}));
 assert.match(ACTION_INSTRUCTIONS,/intervalWeeks/);assert.match(ACTION_INSTRUCTIONS,/anchorDate/);
});
test('AI one-off conversion clears cadence and stale cadence invalidates approvals',()=>{
 const s=state();Object.assign(s.scheduleEvents[0],{intervalWeeks:2,anchorDate:'2026-10-30'});
 const p=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',date:'2026-11-02'}},'UTC',{now}),out=applyAiEventChange(s,p.action,p.approval,{now});assert.equal(out.next.scheduleEvents[0].anchorDate,undefined);
 s.scheduleEvents[0].anchorDate='2026-11-06';assert.throws(()=>applyAiEventChange(s,p.action,p.approval,{now}),/changed|preview/i);
});
test('AI weekly conversion clears irrelevant anchor for simultaneous and subsequent weekday changes',()=>{
 const s=state();Object.assign(s.scheduleEvents[0],{intervalWeeks:2,anchorDate:'2026-10-30'});
 const p=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',intervalWeeks:1}},'UTC',{now}),weekly=applyAiEventChange(s,p.action,p.approval,{now}).next;
 assert.equal(weekly.scheduleEvents[0].anchorDate,null);
 const q=previewAiEventChange(weekly,{type:'update_schedule_event',args:{eventId:'e',day:4}},'UTC',{now});assert.equal(applyAiEventChange(weekly,q.action,q.approval,{now}).next.scheduleEvents[0].day,4);
 const r=previewAiEventChange(s,{type:'update_schedule_event',args:{eventId:'e',intervalWeeks:1,day:4}},'UTC',{now});assert.equal(r.summary.event.day,4);assert.equal(r.summary.event.anchorDate,null);
});
test('AI fortnightly receipt replay is idempotent and native Undo restores weekly cadence',async()=>{
 const f=await plannerFixture(state(),{userData:{settings:{profile:{timezone:'UTC'}}},failAfterCommit:true}),p=await f.context.previewKairosAction(action,{ownerId:'one',planId:'plan'}),opts={ownerId:'one',planId:'plan',operationId:'fortnightly',createdAt:Date.now(),confirmation:p.approval};
 await assert.rejects(f.execute(p.action,opts),/lost/i);const replay=await f.execute(p.action,opts);assert.equal(replay.event.intervalWeeks,2);assert.equal(replay.event.anchorDate,'2026-10-30');assert.equal(f.writes.length,1);
 const u=await f.context.loadActionUndoPreview('plan','one');await f.context.persistTaskListCommand('plan','one',u.command,u.expected,'undo-fortnightly',Date.now());assert.equal(f.data().scheduleEvents[0].intervalWeeks,undefined);
});
