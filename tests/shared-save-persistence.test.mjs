import test from 'node:test';
import assert from 'node:assert/strict';
import {createMutationSession} from '../mutation-session.js';
import {buildRecurringInspectorCommand} from '../task-list-model.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../recurrence-utils.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {runSharedSaveJourney} from './browser/shared-save-journey.mjs';

test('production-module browser recovery journey preserves finite recurrence and account scope',async()=>{
 assert.deepEqual(await runSharedSaveJourney((value,message)=>assert.ok(value,message)),{writes:2,receipts:2});
});

test('retained recurring split reload reconciles the real receipt and remote progress',async()=>{
 const date='2026-10-02',seed={userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'series',title:'Read',date:'2026-10-01',startTime:'10:00',endTime:'11:00',recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-01',mode:'fixed',endType:'count',count:4,exceptions:{'2026-10-03':{status:'completed',completedAt:'keep',focusLoggedSeconds:60}}})}]}]}]};
 const f=await plannerFixture(seed,{failAfterCommit:true,retryTransaction:true}),memory=new Map(),actor={ownerId:'one',planId:'plan'};
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const make=()=>createMutationSession({getIdentity:()=>actor,storage,commit:(c,e,i)=>f.context.persistTaskListCommand(i.planId,i.ownerId,c,e,i.operationId,i.createdAt)});
 const p=buildRecurringInspectorCommand(seed,{taskId:'series',occurrenceDate:date},{action:'edit',scope:'future',changes:{title:'Future reading'},newTaskId:'split'}),session=make();
 await assert.rejects(session.submit(p.command,p.expected,{...actor,operationId:'split-reload',createdAt:Date.now()}),/lost/);
 const live=f.data();live.boards[0].sections[0].tasks[0].notes='Remote note';live.boards[0].sections[0].tasks[0].recurrence.exceptions['2026-10-03'].focusLoggedSeconds=120;f.setData(live);
 session.dispose();const reloaded=make();assert.equal(reloaded.state().pending,true);await reloaded.retry();
 const tasks=f.data().boards[0].sections[0].tasks;
 assert.equal(f.writes.length,1);assert.equal(tasks.length,2);assert.equal(tasks[0].notes,'Remote note');assert.equal(tasks[0].recurrence.exceptions['2026-10-03'].focusLoggedSeconds,120);
 assert.equal(generateTaskOccurrences(tasks[1],date,'2026-10-10').filter(o=>o.status!=='deleted').length,2);assert.equal(f.data().aiActionReceipts.length,1);assert.equal(memory.size,0);reloaded.dispose();
});

test('reviewed AI Undo uses real receipts, survives a lost response and preserves unrelated edits',async()=>{
 const f=await plannerFixture({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',date:'2026-10-02',startTime:'10:00',endTime:'11:00',notes:'Original'}]}]}]});
 const now=Date.now();await f.execute({type:'update_task',args:{taskId:'t',startTime:'12:00'}},{ownerId:'one',planId:'plan',operationId:'ai-source',createdAt:now});
 const live=f.data();live.boards[0].sections[0].tasks[0].notes='Remote note';f.setData(live);
 const command={type:'action_undo',sourceOperationId:'ai-source'},expected={sourceOperationId:'ai-source'},memory=new Map();
 const session=createMutationSession({getIdentity:()=>({ownerId:'one',planId:'plan'}),storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},commit:(c,e,i)=>f.context.persistTaskListCommand(i.planId,i.ownerId,c,e,i.operationId,i.createdAt)});
 f.setFail(true);await assert.rejects(session.submit(command,expected,{ownerId:'one',planId:'plan',operationId:'undo-once',createdAt:now+1}),/lost/);await session.retry();
 assert.equal(f.writes.length,2);assert.equal(f.data().boards[0].sections[0].tasks[0].startTime,'10:00');assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Remote note');
 assert.equal(f.data().aiActionReceipts.find(r=>r.id==='ai-source').plannerUndoUsedBy,'undo-once');
 await assert.rejects(f.context.persistTaskListCommand('plan','one',command,expected,'second-undo',now+2),/already used|unavailable/);session.dispose();
});

test('reviewed AI Undo rejects a later schedule edit without consuming its source receipt',async()=>{
 const f=await plannerFixture({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',date:'2026-10-02',startTime:'10:00',endTime:'11:00'}]}]}]}),now=Date.now();
 await f.execute({type:'update_task',args:{taskId:'t',startTime:'12:00'}},{ownerId:'one',planId:'plan',operationId:'ai-schedule',createdAt:now});
 const live=f.data();Object.assign(live.boards[0].sections[0].tasks[0],{startTime:'14:00',endTime:'15:00'});f.setData(live);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',{type:'action_undo',sourceOperationId:'ai-schedule'},{sourceOperationId:'ai-schedule'},'stale-undo',now+1),/changed|review/i);
 assert.equal(f.writes.length,1);assert.equal(f.data().boards[0].sections[0].tasks[0].startTime,'14:00');assert.equal(f.data().aiActionReceipts[0].plannerUndoUsedBy,undefined);
});
