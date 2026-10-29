import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerWrites} from '../app-planner-writes.js';
import {planState,mergePlanEdits} from '../plan-merge.js';
let factory;try{({createPlannerPersistence:factory}=await import('../app-planner-persistence.js'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
function fixture(){
 assert.equal(typeof factory,'function','ordinary persistence must have a real injected controller export');
 let owner='one',planId='plan',state=planState({boards:[{id:'private',sections:[]}]}),done=0,renders=0,errors=0,read=async()=>[];
 const writes=createPlannerWrites('one');
 const controller=factory({writes,getOwnerId:()=>owner,getPlanId:()=>planId,getState:()=>state,setState:value=>{state=value},setIdentity:(_owner,id)=>{planId=id},readPlans:(...args)=>read(...args),initialize:async()=>{},saveEdits:async(_id,_owner,_before,local)=>local,migrate:plan=>plan.boards,normalizeBoards:value=>value,onRender:()=>renders++,onLoadComplete:()=>done++,onError:()=>errors++});
 return {controller,writes,get state(){return state},get done(){return done},get renders(){return renders},get errors(){return errors},setOwner:value=>{owner=value;writes.setOwner(value)},setRead:value=>{read=value}};
}
test('stale account read rejection cannot render or settle another account',async()=>{
 const f=fixture();let reject;f.setRead(()=>new Promise((_yes,no)=>reject=no));const work=f.controller.load({uid:'one'});await new Promise(setImmediate);f.setOwner('two');reject(Error('offline'));await work;assert.equal(f.done,0);assert.equal(f.renders,0);assert.equal(f.errors,0);
});
test('loaded live collections cannot mutate the confirmed baseline or discard subsequent edits',async()=>{
 let stored=planState({boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Before'}]}]}],scheduleEvents:[{id:'e',title:'Before event'}]}),live=planState({});
 const writes=createPlannerWrites('one');
 const controller=factory({writes,getOwnerId:()=> 'one',getPlanId:()=> 'plan',getState:()=>live,setState:value=>{live=value},setIdentity(){},readPlans:async()=>[{docId:'plan',...structuredClone(stored)}],migrate:plan=>plan.boards,normalizeBoards:value=>value,saveEdits:async(_plan,_owner,base,local)=>{stored=mergePlanEdits(base,local,stored);return structuredClone(stored);}});
 await controller.load({uid:'one'});live.boards[0].sections[0].tasks[0].title='Edited task';live.scheduleEvents[0].title='Edited event';
 assert.equal(writes.snapshot.boards[0].sections[0].tasks[0].title,'Before');assert.equal(writes.snapshot.scheduleEvents[0].title,'Before event');
 assert.equal(await controller.save(),true);assert.equal(stored.boards[0].sections[0].tasks[0].title,'Edited task');assert.equal(stored.scheduleEvents[0].title,'Edited event');
});
test('empty planner clears every live collection and cloud baseline',async()=>{const f=fixture();f.writes.snapshot=f.state;await f.controller.load({uid:'one'});assert.deepEqual(f.state,planState({}));assert.equal(f.writes.snapshot,null);assert.equal(f.done,1);assert.equal(f.renders,1)});
test('ordinary persistence waits behind task and focus work in the injected queue',async()=>{const f=fixture();let release;const earlier=f.writes.enqueue(()=>new Promise(resolve=>release=resolve));let settled=false;const save=f.controller.save().then(value=>{settled=true;return value});await new Promise(setImmediate);assert.equal(settled,false);release();await earlier;assert.equal(await save,true)});
test('a same-owner reload retains the prior baseline for confirmed changes',async()=>{
 const f=fixture(),before=f.state;f.writes.snapshot=before;assert.equal(f.writes.setOwner('one'),false);
 f.setRead(async()=>[{docId:'plan',boards:[{id:'updated',sections:[]}],scheduleEvents:[{id:'event'}],calendarSources:[{id:'source'}],dayInsights:{today:'Updated'}}]);
 await f.controller.load({uid:'one'});assert.equal(f.state.boards[0].id,'updated');assert.equal(f.state.scheduleEvents[0].id,'event');assert.equal(f.state.calendarSources[0].id,'source');assert.notEqual(f.writes.snapshot,f.state);assert.deepEqual(f.writes.snapshot,f.state);assert.equal(f.done,1);
});
test('edits made while a read is pending invalidate that load without settling startup',async()=>{
 const f=fixture();let release;f.setRead(()=>new Promise(resolve=>release=resolve));const work=f.controller.load({uid:'one'});await new Promise(setImmediate);f.writes.markEdit();release([]);await work;assert.equal(f.state.boards[0].id,'private');assert.equal(f.renders,0);assert.equal(f.done,0);
});
test('save rebases remote changes onto edits made while the write was pending',async()=>{
 let state=planState({boards:[{id:'b',title:'Before',sections:[]}]}),savedAtStart,release;const writes=createPlannerWrites('one');writes.snapshot=structuredClone(state);
 const controller=factory({writes,getOwnerId:()=> 'one',getPlanId:()=> 'plan',getState:()=>state,setState:value=>{state=value},setIdentity(){},saveEdits:async(_id,_owner,_before,local)=>{savedAtStart=local;await new Promise(resolve=>release=resolve);return {...local,dayInsights:{remote:'New'}}}});
 const work=controller.save();await new Promise(setImmediate);state.boards[0].title='Typed during save';release();assert.equal(await work,true);assert.equal(state.boards[0].title,'Typed during save');assert.equal(state.dayInsights.remote,'New');assert.equal(savedAtStart.boards[0].title,'Before');assert.equal(writes.snapshot.boards[0].title,'Before');
});
