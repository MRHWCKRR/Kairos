import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {parseHTML} from 'linkedom';
import {buildScheduleChange,applyScheduleUndo} from '../task-list-model.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const sourceUrl=new URL('../schedule-change-controller.js',import.meta.url);
const initial=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Read',date:'2026-10-21',startTime:'10:00',endTime:'11:00'}]}]}]});
const changes={date:'2026-10-21',startTime:'11:05',endTime:'12:05'};
async function fixture({planId='plan',ensure,failEnsureOnce=false,responseDelay=0}={}){
 let source;try{source=await readFile(sourceUrl,'utf8')}catch{}assert.ok(source,'Schedule feedback controller exists');
 const {document}=parseHTML('<html><body></body></html>'),data=initial(),store=await plannerFixture(data);let state=data,scope={ownerId:'one',planId},calls=[],timers=[],now=Date.now();
 const context=vm.createContext({document,buildScheduleChange,structuredClone,Date,console,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}});
 vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,''),context);
 const controller=context.createScheduleChangeController({document,getScope:()=>scope,getState:()=>state,now:()=>now,idFactory:()=> 'op-'+calls.length,
  ensurePlan:async()=>{if(ensure)await ensure(state);scope={...scope,planId:'plan-one'};if(failEnsureOnce){failEnsureOnce=false;throw Error('Initialization response lost')}return scope.planId},commit:async(command,expected,identity)=>{calls.push({command,expected,identity});const result=await store.context.persistTaskListCommand(identity.planId,identity.ownerId,command,expected,identity.operationId,identity.createdAt);state=store.data();now+=responseDelay;return result;}});
 return {controller,document,store,calls,timers,getState:()=>state,setScope:v=>scope=v,advance:ms=>now+=ms};
}
test('save feedback offers Undo only after confirmation and undo restores the saved task',async()=>{
 const f=await fixture();assert.equal(await f.controller.save({taskId:'t'},changes),true);assert.match(f.document.body.textContent,/saved/i);const button=f.document.querySelector('[data-schedule-undo]');assert.ok(button);button.click();await new Promise(r=>setTimeout(r,10));assert.equal(f.store.data().boards[0].sections[0].tasks[0].startTime,'10:00');
});
test('Retry uses the original identity after a lost save response',async()=>{
 const f=await fixture();f.store.setFail(true);assert.equal(await f.controller.save({taskId:'t'},changes),false);assert.equal(f.controller.isBlocked(),true);assert.equal(f.document.querySelector('[data-schedule-undo]'),null);f.document.querySelector('[data-schedule-retry]').click();await new Promise(r=>setTimeout(r,10));assert.equal(f.calls[0].identity.operationId,f.calls[1].identity.operationId);assert.equal(f.store.writes.length,1);assert.ok(f.document.querySelector('[data-schedule-undo]'));
});
test('initial plan creation rechecks the original task before sending a drag',async()=>{
 const f=await fixture({planId:null,ensure:async state=>{state.boards[0].sections[0].tasks[0].startTime='13:00'}});assert.equal(await f.controller.save({taskId:'t'},changes),false);assert.equal(f.calls.length,0);assert.match(f.document.body.textContent,/changed|review/i);
});
test('account switches clear feedback and prevent Undo',async()=>{
 const f=await fixture();await f.controller.save({taskId:'t'},changes);f.setScope({ownerId:'two',planId:'other'});f.controller.sync();assert.equal(f.document.querySelector('.ks-schedule-feedback'),null);assert.equal(f.controller.isBlocked(),false);assert.equal(await f.controller.undo(),false);assert.equal(f.calls.length,1);
});
test('expired Undo does not issue a new command',async()=>{
 const f=await fixture();await f.controller.save({taskId:'t'},changes);f.advance(10001);assert.equal(await f.controller.undo(),false);assert.equal(f.calls.length,1);
});
test('failed Undo retries its exact original identity',async()=>{
 const f=await fixture();await f.controller.save({taskId:'t'},changes);f.store.setFail(true);assert.equal(await f.controller.undo(),false);f.document.querySelector('[data-schedule-retry]').click();await new Promise(r=>setTimeout(r,10));assert.equal(f.calls[1].identity.operationId,f.calls[2].identity.operationId);assert.equal(f.store.writes.length,2);
});
test('initialization failure after assigning the plan remains retryable and rechecks the task',async()=>{
 const f=await fixture({planId:null,failEnsureOnce:true});assert.equal(await f.controller.save({taskId:'t'},changes),false);const retry=f.document.querySelector('[data-schedule-retry]');assert.ok(retry);f.getState().boards[0].sections[0].tasks[0].endTime='12:30';retry.click();await new Promise(r=>setTimeout(r,10));assert.equal(f.calls.length,0);assert.match(f.document.body.textContent,/changed|review/i);assert.equal(f.controller.isBlocked(),false);
});
test('a response delayed beyond ten seconds still offers Undo after confirmation',async()=>{
 const f=await fixture({responseDelay:15000});assert.equal(await f.controller.save({taskId:'t'},changes),true);assert.ok(f.document.querySelector('[data-schedule-undo]'));assert.equal(await f.controller.undo(),true);
});
