import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createTaskArchiveHandlers} from '../app-task-archive-handlers.js';
import {createPlannerPersistence} from '../app-planner-persistence.js';
import {createPlannerWrites} from '../app-planner-writes.js';
import {planState,mergePendingPlanEdits} from '../plan-merge.js';
import {memoryStorage} from './helpers/memory-storage.mjs';

const initial=()=>planState({boards:[{id:'b',title:'Board',sections:[{id:'s',title:'Section',tasks:[{id:'t',title:'Task',archived:false},{id:'u',title:'Other',archived:false}]}]}]});
function fixture({storage=memoryStorage(),remote={state:initial()}}={}) {
 let owner='one',plan='plan',state=initial(),writesCount=0,renders=0,fail=false,dialog=async()=>true;
 const restored=[],writes=createPlannerWrites(owner);writes.snapshot=initial();
 const persistence=createPlannerPersistence({storage,writes,getOwnerId:()=>owner,getPlanId:()=>plan,getState:()=>state,setState:value=>{state=value},setIdentity:(_owner,id)=>{plan=id},readPlans:async()=>[{docId:'plan',...structuredClone(remote.state)}],migrate:p=>p.boards,normalizeBoards:b=>b,
  saveEdits:async(_id,_owner,base,local,options)=>{if(fail)throw Error('offline');remote.state=mergePendingPlanEdits(base,local,remote.state,options.recoveryAttempt);return structuredClone(remote.state)}});
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const {confirmAction}=runInNewContext(source.slice(source.indexOf('    async function confirmAction('),source.indexOf('    // Block the web workspace'))+';({confirmAction})',{
  get auth(){return {currentUser:{uid:owner}}},get currentPlanDocId(){return plan},confirmDialog:(...args)=>dialog(...args)});
 const click=createTaskArchiveHandlers({findSection:id=>{for(const board of state.boards){const section=board.sections.find(s=>s.id===id);if(section)return {board,section}}},restoreArchived:async target=>restored.push(target),confirmAction,updatePlanInFirestore:()=>{writesCount++;return persistence.save()},renderApp:()=>renders++});
 function event(selector,sectionId='s',taskId='t'){const target={getAttribute:name=>name.includes('section')?sectionId:taskId};return {target:{closest:match=>match===selector?target:null}}}
 return {click:(selector,sectionId,taskId)=>click(event(selector,sectionId,taskId)),persistence,writes,storage,remote,restored,get state(){return state},get writesCount(){return writesCount},get renders(){return renders},setDialog:value=>{dialog=value},setOwner:value=>{owner=value;writes.setOwner(value)},setPlan:value=>{plan=value},setFail:value=>{fail=value}};
}

test('Archive restore delegates the exact task to the existing restore command',async()=>{
 const f=fixture();assert.equal(await f.click('.archive-restore-task-btn'),true);assert.deepEqual(f.restored,[{kind:'task',taskId:'t',sectionId:'s'}]);
 assert.equal(await f.click('.archive-restore-task-btn','missing'),true);assert.equal(f.restored.length,1);assert.equal(f.writesCount,0);
 assert.equal(await f.click('.unrelated'),false);
});
test('permanent deletion keeps siblings and submits one ordinary save',async()=>{
 const f=fixture();assert.equal(await f.click('.archive-delete-task-btn'),true);await f.writes.idle();
 assert.deepEqual(f.state.boards[0].sections[0].tasks.map(t=>t.id),['u']);assert.deepEqual(f.remote.state.boards[0].sections[0].tasks.map(t=>t.id),['u']);
 assert.equal(f.writesCount,1);assert.equal(f.renders,1);assert.equal(f.persistence.state().status,'saved');
});
test('cancelled or stale deletion cannot mutate another account or planner',async()=>{
 for(const [change,accepted] of [[()=>{},false],[f=>f.setOwner('two'),true],[f=>f.setPlan('other'),true]]){
  const f=fixture();let release;f.setDialog(()=>new Promise(resolve=>release=resolve));const work=f.click('.archive-delete-task-btn');change(f);release(accepted);await work;
  assert.deepEqual(f.state,initial());assert.equal(f.writesCount,0);
 }
});
test('legacy archive uses the shared queue and retains failed edits for explicit retry after reopening',async()=>{
 const f=fixture();let release;const earlier=f.writes.enqueue(()=>new Promise(resolve=>release=resolve));await new Promise(setImmediate);
 assert.equal(await f.click('.task-delete-btn'),true);assert.equal(f.state.boards[0].sections[0].tasks[0].archived,true);assert.equal(f.remote.state.boards[0].sections[0].tasks[0].archived,false);
 release();await earlier;await f.writes.idle();assert.equal(f.remote.state.boards[0].sections[0].tasks[0].archived,true);assert.equal(f.writesCount,1);assert.equal(f.renders,1);
 const failed=fixture();failed.setFail(true);await failed.click('.task-delete-btn');await failed.writes.idle();assert.equal(failed.persistence.state().retained,true);
 failed.remote.state.dayInsights={remote:'Unrelated'};const reopened=fixture({storage:failed.storage,remote:failed.remote});await reopened.persistence.load({uid:'one'});
 assert.equal(reopened.state.boards[0].sections[0].tasks[0].archived,true);assert.equal(reopened.state.dayInsights.remote,'Unrelated');
 assert.equal(await reopened.persistence.retry(),true);assert.equal(failed.remote.state.boards[0].sections[0].tasks[0].archived,true);assert.equal(reopened.persistence.state().pending,false);
});
