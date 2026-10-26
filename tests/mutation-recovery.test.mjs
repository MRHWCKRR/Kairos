import test from 'node:test';
import assert from 'node:assert/strict';
import {createMutationSession} from '../mutation-session.js';
import {plannerFixture} from './helpers/planner-fixture.mjs';
const data=()=>({userID:'one',boards:[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Science',notes:'Old'}]}]}]});
const command={type:'edit_task',target:{taskId:'t'},changes:{notes:'New'}};
const expected={boardId:'b',sectionId:'s',fields:{notes:'Old'}};
const id=(operationId='task-detail-first')=>({ownerId:'one',planId:'plan',operationId,createdAt:Date.now()});
async function setup(options={}){
 const f=await plannerFixture(data(),options),memory=new Map();let actor={ownerId:'one',planId:'plan'};
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const create=()=>createMutationSession({getIdentity:()=>actor,storage,commit:(c,e,i)=>f.context.persistTaskListCommand(i.planId,i.ownerId,c,e,i.operationId,i.createdAt)});
 return {f,memory,storage,create,session:create(),switch(next){actor=next}};
}
test('throwing submit retains caller identity and reload retries the real receipt once',async()=>{
 const x=await setup({failAfterCommit:true}),identity=id();
 await assert.rejects(x.session.submit(command,expected,identity),/response lost/);
 assert.equal(x.session.state().status,'unconfirmed');assert.equal(x.f.writes.length,1);
 x.session.dispose();const next=x.create();assert.equal(next.state().pending,true);
 await next.retry();assert.equal(x.f.writes.length,1);assert.equal(x.memory.size,0);
 assert.equal(x.f.data().aiActionReceipts[0].id,identity.operationId);
});
test('pending submit refuses payload collisions and competing operations without losing recovery',async()=>{
 const x=await setup({failAfterCommit:true}),identity=id();await assert.rejects(x.session.submit(command,expected,identity));
 await assert.rejects(x.session.submit({...command,changes:{notes:'Different'}},expected,identity),/different|changed|payload/i);
 await assert.rejects(x.session.submit(command,expected,id('schedule-next')),/previous|pending|resolve/i);
 await x.session.submit(command,expected,identity);assert.equal(x.f.writes.length,1);
});
test('real conflicts retain edits for review while unrelated concurrent fields survive',async()=>{
 const x=await setup();let changed=x.f.data();changed.boards[0].sections[0].tasks[0].title='Remote title';x.f.setData(changed);
 await x.session.submit(command,expected,id());assert.equal(x.f.data().boards[0].sections[0].tasks[0].title,'Remote title');
 await assert.rejects(x.session.submit({...command,changes:{notes:'Again'}},expected,id('task-detail-stale')),/changed/i);
 assert.equal(x.session.state().status,'conflict');assert.equal(x.session.state().pending,true);
 assert.equal(x.session.discard(),true);assert.equal(x.session.state().pending,false);
 assert.equal(x.f.data().boards[0].sections[0].tasks[0].notes,'New');
});
test('same-scope actions reconcile external recovery and never remove a newer record',async()=>{
 const x=await setup({failAfterCommit:true}),first=id();await assert.rejects(x.session.submit(command,expected,first));
 const key=[...x.memory.keys()][0],second={...JSON.parse(x.memory.get(key)),identity:id('schedule-other')};
 x.memory.set(key,JSON.stringify(second));
 await assert.rejects(x.session.submit(command,expected,first),/previous|pending|resolve/i);
 assert.equal(JSON.parse(x.memory.get(key)).identity.operationId,'schedule-other');
 assert.equal(x.session.discard(first),false);assert.equal(x.memory.has(key),true);
});
test('account and plan changes reject retained work',async()=>{
 for(const actor of [{ownerId:'two',planId:'plan'},{ownerId:'one',planId:'other'}]){
  const x=await setup({failAfterCommit:true}),identity=id();await assert.rejects(x.session.submit(command,expected,identity));x.switch(actor);
  await assert.rejects(x.session.submit(command,expected,identity),/account|planner|identity/i);assert.equal(x.session.state().pending,false);assert.equal(x.f.writes.length,1);
 }
});
test('denied recovery storage never submits and throwing callers receive a failure',async()=>{
 const x=await setup();x.storage.setItem=()=>{throw Error('Denied')};
 await assert.rejects(x.session.submit(command,expected,id()),/recovery/i);assert.equal(x.f.writes.length,0);
 x.storage.getItem=()=>{throw Error('Denied')};assert.equal(await x.session.run(command,expected),false);assert.equal(x.f.writes.length,0);
});

import {parseHTML} from 'linkedom';
import {mountMutationFeedback} from '../today-view.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('global clear confirmation cannot discard a replacement operation and storage events never replay',async()=>{
 const x=await setup({failAfterCommit:true}),first=id();await assert.rejects(x.session.submit(command,expected,first));
 const {document,window}=parseHTML('<html><body><div id="feedback"></div></body></html>');let confirm;
 const view=mountMutationFeedback({root:document.querySelector('#feedback'),window,session:x.session,confirmClear:()=>new Promise(resolve=>confirm=resolve)});
 document.querySelector('[data-mutation-clear]').click();
 const key=[...x.memory.keys()][0],next={...JSON.parse(x.memory.get(key)),identity:id('schedule-replacement')};x.memory.set(key,JSON.stringify(next));
 const event=new window.Event('storage');event.key=key;window.dispatchEvent(event);assert.equal(x.f.writes.length,1);
 confirm(true);await new Promise(setImmediate);assert.equal(JSON.parse(x.memory.get(key)).identity.operationId,'schedule-replacement');view.dispose();
});

test('the app gateway retains failed caller saves and retries through low-level persistence without recursion',async()=>{
 const x=await setup({failAfterCommit:true}),context=x.f.context;
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('    async function commitTaskDetails('),end=source.indexOf('    async function openTaskDetailsInSchedule(',start);
 Object.assign(context,{currentPlanDocId:'plan',boardsData:x.f.data().boards,dayInsights:{},scheduleData:[],planEditRevision:0,planLoadRevision:0,planSaveQueue:Promise.resolve(),planSnapshot:x.f.data(),renderApp(){}});
 vm.runInContext(source.slice(start,end),context);
 context.plannerMutations=createMutationSession({getIdentity:()=>({ownerId:'one',planId:'plan'}),storage:x.storage,commit:(...args)=>context.persistTaskDetails(...args)});
 const identity=id();await assert.rejects(context.commitTaskDetails(command,expected,identity),/response lost/);assert.equal(context.plannerMutations.state().pending,true);
 await context.plannerMutations.retry();assert.equal(x.f.writes.length,1);assert.equal(context.boardsData[0].sections[0].tasks[0].notes,'New');assert.equal(context.plannerMutations.state().pending,false);
});

test('late real persistence acknowledgements cannot publish old scope success or clear another scope',async()=>{
 for(const next of [{ownerId:'two',planId:'plan'},{ownerId:'one',planId:'other'}]){
  const x=await setup(),identity=id();let actor={ownerId:'one',planId:'plan'},release,committed;const applied=new Promise(resolve=>committed=resolve),gate=new Promise(resolve=>release=resolve),outcomes=[];
  const session=createMutationSession({getIdentity:()=>actor,storage:x.storage,onResolve:(...args)=>outcomes.push(args),commit:async(c,e,i)=>{const result=await x.f.context.persistTaskListCommand(i.planId,i.ownerId,c,e,i.operationId,i.createdAt);committed();await gate;return result;}});
  const saving=session.submit(command,expected,identity);await applied;actor=next;session.sync();release();await assert.rejects(saving,/account|planner/i);
  assert.equal(outcomes.length,0);assert.equal(session.state().message,'');assert.equal(session.state().pending,false);assert.equal(x.f.writes.length,1);assert.equal(x.memory.size,1);
 }
});

test('late successful persistence never clears a replacement pending payload',async()=>{
 const x=await setup(),identity=id();let release,committed;const applied=new Promise(resolve=>committed=resolve),gate=new Promise(resolve=>release=resolve);
 const session=createMutationSession({getIdentity:()=>({ownerId:'one',planId:'plan'}),storage:x.storage,commit:async(c,e,i)=>{const result=await x.f.context.persistTaskListCommand(i.planId,i.ownerId,c,e,i.operationId,i.createdAt);committed();await gate;return result;}});
 const saving=session.submit(command,expected,identity);await applied;const key=[...x.memory.keys()][0],replacement={...JSON.parse(x.memory.get(key)),identity:id('task-other')};x.memory.set(key,JSON.stringify(replacement));release();await saving;
 assert.equal(JSON.parse(x.memory.get(key)).identity.operationId,'task-other');assert.equal(session.state().pendingIdentity.operationId,'task-other');assert.equal(x.f.writes.length,1);
});
