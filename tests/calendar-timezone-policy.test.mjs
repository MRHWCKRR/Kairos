import test from 'node:test';import assert from 'node:assert/strict';
import {plannerFixture} from './helpers/planner-fixture.mjs';
import {buildCalendarSync} from '../calendar-commands.js';
const source={id:'cal',name:'School',kind:'file',timezone:'UTC',from:'2026-10-01',to:'2026-12-31',updatedAt:1000};
const seed=()=>({userID:'one',calendarSources:[source],boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',notes:'Old',date:'2026-10-27',startTime:'09:00',endTime:'10:00'}]}]}],scheduleEvents:[]});
test('calendar import rechecks the saved profile timezone before committing',async()=>{
 const state=seed();state.calendarSources=[];const f=await plannerFixture(state,{userData:{settings:{profile:{timezone:'Australia/Brisbane'}}}}),p=buildCalendarSync(state,source,[]);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'zone-import',Date.now()),/timezone/i);assert.equal(f.writes.length,0);
});
test('stale imported timezone blocks task placement but permits unrelated notes and source removal',async()=>{
 const f=await plannerFixture(seed(),{userData:{settings:{profile:{timezone:'Australia/Brisbane'}}}}),now=Date.now();
 await assert.rejects(f.context.persistTaskListCommand('plan','one',{type:'edit_task',target:{taskId:'t'},changes:{startTime:'11:00'}},{boardId:'b',sectionId:'s',fields:{startTime:'09:00'}},'zone-place',now),/refresh.*calendar|calendar.*timezone/i);
 await f.context.persistTaskListCommand('plan','one',{type:'edit_task',target:{taskId:'t'},changes:{notes:'Keep notes'}},{boardId:'b',sectionId:'s',fields:{notes:'Old'}},'zone-notes',now+1);assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Keep notes');
});

test('stale calendar timezone does not block recurring completion without a placement change',async()=>{
 const {normalizeRecurrence}=await import('../recurrence-utils.js'),{buildRecurringInspectorCommand}=await import('../task-list-model.js');const state=seed(),task=state.boards[0].sections[0].tasks[0];task.recurrence=normalizeRecurrence({enabled:true,frequency:'daily',mode:'fixed',startDate:'2026-10-27',endType:'count',count:3});
 const f=await plannerFixture(state,{userData:{settings:{profile:{timezone:'Australia/Brisbane'}}}}),p=buildRecurringInspectorCommand(state,{taskId:'t',occurrenceDate:'2026-10-27'},{action:'status',status:'completed',timestamp:'2026-10-27T00:00:00Z'});
 await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'zone-complete',Date.now());assert.equal(f.data().boards[0].sections[0].tasks[0].recurrence.exceptions['2026-10-27'].status,'completed');
});
