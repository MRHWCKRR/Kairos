import test from 'node:test';import assert from 'node:assert/strict';import {plannerFixture} from './helpers/planner-fixture.mjs';import {buildNativeEventChange,buildNativeEventUndo} from '../native-event-commands.js';import {applyTaskListCommand} from '../task-list-model.js';
import {normalizeTaskMetadata} from '../schedule-utils.js';
const data=()=>({userID:'one',boards:[],scheduleEvents:[],calendarSources:[]}),event={id:'native',title:'Appointment',category:'other',date:'2026-10-28',start:'09:00',end:'10:00',allDay:false,transparent:false},userData={settings:{profile:{timezone:'UTC'}}};
test('shared route saves native events and lost acknowledgement reconciles one receipt',async()=>{const s=data(),p=buildNativeEventChange(s,{eventId:event.id,event},'UTC');assert.equal(applyTaskListCommand(s,p.command,p.expected).next.scheduleEvents.length,1);const f=await plannerFixture(s,{userData,failAfterCommit:true}),created=Date.now();await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'native-save',created),/lost/i);const result=await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'native-save',created);assert.equal(f.writes.length,1);assert.equal(f.data().scheduleEvents.length,1);assert.ok(result.nativeEventUndo);const u=buildNativeEventUndo(f.data(),'native-save',result.nativeEventUndo,'UTC');await f.context.persistTaskListCommand('plan','one',u.command,u.expected,'native-undo',Date.now());assert.equal(f.data().scheduleEvents.length,0);await assert.rejects(f.context.persistTaskListCommand('plan','one',u.command,u.expected,'native-undo-again',Date.now()),/used|unavailable/i);});
test('transaction rejects a changed profile timezone before saving an event',async()=>{const s=data(),p=buildNativeEventChange(s,{eventId:event.id,event},'UTC'),f=await plannerFixture(s,{userData:{settings:{profile:{timezone:'Australia/Brisbane'}}}});await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'tz',Date.now()),/timezone|changed/i);assert.equal(f.writes.length,0);});

test('Schedule metadata defaults do not stale event creation or its reviewed Undo against a legacy stored task',async()=>{
 const stored=data();stored.boards=[{id:'b',sections:[{id:'s',tasks:[{id:'old',title:'Legacy task',date:'2026-10-28',startTime:'08:00',endTime:'08:30'}]}]}];
 const displayed=structuredClone(stored);normalizeTaskMetadata(displayed.boards[0].sections[0].tasks[0]);
 const preview=buildNativeEventChange(displayed,{eventId:event.id,event},'UTC'),f=await plannerFixture(stored,{userData});
 const result=await f.context.persistTaskListCommand('plan','one',preview.command,preview.expected,'legacy-create',Date.now());
 assert.equal(f.data().scheduleEvents[0].title,'Appointment');
 assert.deepEqual(f.data().boards[0].sections[0].tasks[0],{...stored.boards[0].sections[0].tasks[0],archived:false});
 const shown=structuredClone(f.data());normalizeTaskMetadata(shown.boards[0].sections[0].tasks[0]);
 const undo=buildNativeEventUndo(shown,'legacy-create',result.nativeEventUndo,'UTC');
 await f.context.persistTaskListCommand('plan','one',undo.command,undo.expected,'legacy-undo',Date.now());
 assert.equal(f.data().scheduleEvents.length,0);assert.equal(f.writes.length,2);
});

test('a real task lock change still rejects an event reviewed against legacy defaults',async()=>{
 const stored=data();stored.boards=[{id:'b',sections:[{id:'s',tasks:[{id:'old',title:'Legacy task'}]}]}];
 const displayed=structuredClone(stored);normalizeTaskMetadata(displayed.boards[0].sections[0].tasks[0]);
 const preview=buildNativeEventChange(displayed,{eventId:event.id,event},'UTC');
 for(const lock of [true,'legacy-lock']){
  stored.boards[0].sections[0].tasks[0].scheduleLocked=lock;
  const f=await plannerFixture(stored,{userData});
  await assert.rejects(f.context.persistTaskListCommand('plan','one',preview.command,preview.expected,'locked',Date.now()),/schedule or event changed/);
  assert.equal(f.writes.length,0);
 }
});
