import test from 'node:test';
import assert from 'node:assert/strict';
import * as commands from '../calendar-commands.js';
import {applyTaskListCommand} from '../task-list-model.js';
import {planState} from '../plan-merge.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const source=(patch={})=>({id:'calendar-one',name:'School',kind:'file',timezone:'Australia/Brisbane',from:'2026-10-01',to:'2026-12-31',updatedAt:Date.now(),...patch});
const event=(patch={})=>({externalId:'a'.repeat(64),title:'Science',date:'2026-10-26',start:'09:00',end:'10:00',allDay:false,transparent:false,...patch});
const seed=()=>({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Essay'}]}]}],scheduleEvents:[{id:'weekly',title:'Ride',day:1,start:'16:30',end:'17:30'}],calendarSources:[],dayInsights:{}});
const sync=(state,s=source(),events=[event()])=>commands.buildCalendarSync(state,s,events);
const apply=(state,p)=>applyTaskListCommand(state,p.command,p.expected);

test('calendar import is pure, deterministic and preserves weekly events and tasks',()=>{
 const state=seed(),before=structuredClone(state),p=sync(state),out=apply(state,p);
 assert.deepEqual(state,before);assert.equal(out.next.calendarSources.length,1);assert.equal(out.next.scheduleEvents.length,2);assert.equal(out.next.scheduleEvents[1].id,'calendar-one-'+'a'.repeat(64));assert.equal(out.next.scheduleEvents[1].readOnly,true);assert.equal(out.next.scheduleEvents[1].calendarSourceId,'calendar-one');assert.equal(out.next.scheduleEvents[1].day,undefined);assert.deepEqual(out.next.boards,state.boards);assert.deepEqual(p.summary,{added:1,updated:0,removed:0,unchanged:0});
});

test('refresh reports exact changes, replaces only its source and preserves remote unrelated changes',()=>{
 let state=apply(seed(),sync(seed())).next;
 state=apply(state,sync(state,source({id:'other',name:'Personal'}),[event({externalId:'b'.repeat(64),title:'Lunch'})])).next;
 const p=sync(state,source({name:'School new'}),[event({title:'Chemistry'}),event({externalId:'c'.repeat(64),title:'English'})]);
 state.boards[0].sections[0].tasks[0].title='Remote essay';state.scheduleEvents.find(e=>e.calendarSourceId==='other').title='Remote lunch';
 const out=apply(state,p);assert.deepEqual(p.summary,{added:1,updated:1,removed:0,unchanged:0});assert.equal(out.next.boards[0].sections[0].tasks[0].title,'Remote essay');assert.equal(out.next.scheduleEvents.find(e=>e.calendarSourceId==='other').title,'Remote lunch');assert.equal(out.next.scheduleEvents.filter(e=>e.calendarSourceId==='calendar-one').length,2);
 const empty=sync(out.next,source(),[]);assert.equal(empty.summary.removed,2);assert.equal(apply(out.next,empty).next.scheduleEvents.filter(e=>e.calendarSourceId==='other').length,1);
});

test('stale source or owned events block an import atomically',()=>{
 for(const mutate of [s=>s.calendarSources[0].name='Changed',s=>s.scheduleEvents.find(e=>e.calendarSourceId).title='Changed',s=>s.scheduleEvents.push({...s.scheduleEvents[1],id:'new-remote',externalId:'b'.repeat(64)})]){
  const state=apply(seed(),sync(seed())).next,p=sync(state);mutate(state);const before=structuredClone(state);assert.throws(()=>apply(state,p),/changed|review|conflict/i);assert.deepEqual(state,before);
 }
 const state=seed(),p=sync(state);state.calendarSources.push(source());assert.throws(()=>apply(state,p),/changed|review|conflict/i);
});

test('remove is source-scoped, guarded and preserves all other planner data',()=>{
 const state=apply(seed(),sync(seed())).next,p=commands.buildCalendarRemove(state,'calendar-one'),out=apply(state,p);assert.deepEqual(out.next,seed());assert.equal(p.summary.removed,1);
 state.scheduleEvents[1].start='08:00';assert.throws(()=>apply(state,p),/changed|review/i);assert.throws(()=>commands.buildCalendarRemove(seed(),'missing'),/missing|unavailable/i);
});

test('invalid sources and unknown fields cannot become arbitrary planner replacements',()=>{
 for(const patch of [{id:'../bad'},{name:''},{timezone:'Mars/Olympus'},{from:'2026-02-30'},{to:'2028-01-01'},{kind:'other'},{url:'https://example.com/private.ics'},{updatedAt:0},{boards:[]}])assert.throws(()=>sync(seed(),source(patch)));
 const p=sync(seed());p.command.boards=[];assert.throws(()=>apply(seed(),p));p.command={type:'calendar_remove',sourceId:'calendar-one',events:[]};assert.throws(()=>apply(seed(),p));
});

test('invalid event segments, duplicate identities and foreign fields are rejected',()=>{
 for(const patch of [{externalId:'bad'},{title:''},{date:'2026-02-30'},{date:'2027-01-01'},{start:'9:00'},{end:'25:00'},{start:'12:00',end:'11:00'},{start:'10:00',end:'10:00'},{allDay:true},{transparent:'yes'},{readOnly:false},{calendarSourceId:'foreign'},{day:1}])assert.throws(()=>sync(seed(),source(),[event(patch)]));
 assert.throws(()=>sync(seed(),source(),[event(),event()]),/duplicate/i);assert.doesNotThrow(()=>sync(seed(),source(),[event({start:'23:00',end:'00:00'})]));assert.doesNotThrow(()=>sync(seed(),source(),[event({start:'00:00',end:'00:00',allDay:true})]));
});

test('import limits bound source count, segment count and full planner bytes',()=>{
 let state=seed();for(let i=0;i<10;i++)state=apply(state,sync(state,source({id:'cal'+i}),[])).next;assert.throws(()=>sync(state,source(),[]),/limit|10|many/i);
 const events=Array.from({length:1001},(_,i)=>event({externalId:i.toString(16).padStart(64,'0')}));assert.throws(()=>sync(seed(),source(),events),/limit|1000|many/i);
 const huge=seed();huge.boards[0].sections[0].tasks[0].notes='x'.repeat(720000);assert.throws(()=>sync(huge),/large|size|limit/i);
});

test('planState defaults calendar metadata and retains it through unrelated commands',()=>{
 assert.deepEqual(planState({}).calendarSources,[]);const state=apply(seed(),sync(seed())).next;assert.deepEqual(planState(state).calendarSources,state.calendarSources);
 const out=applyTaskListCommand(state,{type:'complete_task',target:{taskId:'t'},value:true},{boardId:'b',sectionId:'s',value:false});assert.deepEqual(out.next.calendarSources,state.calendarSources);assert.equal(out.next.scheduleEvents[1].readOnly,true);
});

test('real persistence retries a lost import acknowledgement once despite a later refreshed baseline',async()=>{
 const initial={userID:'one',...seed()},p=sync(initial),f=await plannerFixture(initial,{failAfterCommit:true,retryTransaction:true}),now=Date.now();
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'calendar-lost',now),/lost/);const live=f.data();live.calendarSources[0].updatedAt+=1;live.scheduleEvents[1].title='Newer remote calendar';f.setData(live);
 await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'calendar-lost',now);assert.equal(f.writes.length,1);assert.equal(f.data().scheduleEvents.length,2);assert.equal(f.data().scheduleEvents[1].title,'Newer remote calendar');assert.equal(f.data().calendarSources[0].updatedAt,p.command.source.updatedAt+1);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',{...p.command,events:[]},p.expected,'calendar-lost',now),/different action/i);
});

test('real persistence rejects a competing import and keeps calendar metadata in an unrelated AI save',async()=>{
 const f=await plannerFixture({userID:'one',...seed()}),p=sync(f.data()),now=Date.now();await f.context.persistTaskListCommand('plan','one',p.command,p.expected,'first-calendar',now);
 await assert.rejects(f.context.persistTaskListCommand('plan','one',p.command,p.expected,'stale-calendar',now+1),/changed|review/i);await f.execute({type:'update_task',args:{taskId:'t',newTitle:'Updated'}},{ownerId:'one',planId:'plan',operationId:'other-ai',createdAt:now+2});assert.equal(f.data().calendarSources.length,1);assert.equal(f.data().scheduleEvents[1].readOnly,true);
});

test('AI cannot update or delete imported read-only events by title or ID',async()=>{
 const imported=apply(seed(),sync(seed())).next;
 for(const type of ['update_schedule_event','delete_schedule_event'])for(const args of [{title:'Science'},{eventId:imported.scheduleEvents[1].id}]){const f=await plannerFixture({userID:'one',...imported});await assert.rejects(f.execute({type,args:{...args,...(type==='update_schedule_event'?{newTitle:'Changed'}:{})}}),/read.only|imported/i);assert.equal(f.writes.length,0);assert.deepEqual(f.data().scheduleEvents,imported.scheduleEvents);}
});

test('calendar removal remains available when unrelated planner data exceeds import quota',()=>{
 const imported=apply(seed(),sync(seed(),source(),[])).next;imported.boards[0].sections[0].tasks[0].notes='x'.repeat(720000);
 const remove=commands.buildCalendarRemove(imported,source().id),out=commands.applyCalendarCommand(imported,remove.command,remove.expected);
 assert.equal(out.next.calendarSources.length,0);assert.equal(out.next.boards[0].sections[0].tasks[0].notes.length,720000);
});
