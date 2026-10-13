import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture} from './helpers/ai-workspace-fixture.mjs';


test('partial failure reports the saved task and retry executes only the unfinished action',async()=>{
  const f=await fixture();
  const original=f.context.runTransaction;let calls=0;
  f.context.runTransaction=async(...args)=>{if(++calls===2)throw new Error('Temporary save failure');return original(...args)};
  await f.context.send();
  assert.match(f.chat().messages.at(-1).content,/First/);
  assert.match(f.chat().messages.at(-1).content,/could not|failed/i);
  f.input.value='retry';await f.context.send();
  assert.equal(f.asks(),1);
  assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.title),['First','Second']);
  assert.equal(f.chat().lastActionTarget.title,'Second');
});
test('uncertain save retry uses the original action even after chat normalisation',async()=>{
  const f=await fixture({failAfterCommit:true});
  f.context.ask=async()=>{return {reply:'I will create it.',actions:[{type:'create_task',args:{title:'First'}}]}};
  await f.context.send();
  vm.runInContext('chats=chats.map(norm);',f.context);
  f.input.value='retry';await f.context.send();
  assert.equal(f.data().boards[0].sections[0].tasks.length,1);
  assert.equal(f.chat().pendingActionBatch,null);
});
test('a clarification reply is displayed without claiming a planner change',async()=>{
  const f=await fixture();
  f.context.ask=async()=>({reply:'Which board should I use?',actions:[]});
  await f.context.send();
  assert.equal(f.chat().messages.at(-1).content,'Which board should I use?');
  assert.equal(f.writes.length,0);
});

test('an account switch during an action cannot save the old workspace into the new account',async()=>{
  const f=await fixture();
  const original=f.context.runTransaction;
  f.context.runTransaction=async(...args)=>{
    const result=await original(...args);
    f.context.auth.currentUser={uid:'two'};
    vm.runInContext('user={uid:"two"};',f.context);
    return result;
  };
  await f.context.send();
  assert.equal(f.workspaces.some(saved=>saved.ref.includes('two')),false);
});

test('using an existing board produces honest feedback',async()=>{
  const f=await fixture();
  f.context.ask=async()=>({reply:'I will create Study.',actions:[{type:'create_board',args:{title:'Study'}}]});
  await f.context.send();
  assert.doesNotMatch(f.chat().messages.at(-1).content,/Created/);
  assert.equal(f.data().boards.length,1);
});

test('retry cannot mutate the planner when operation identities cannot be saved',async()=>{
  const f=await fixture();
  f.context.setDoc=async()=>{throw new Error('Workspace save failed')};
  await f.context.send();
  f.input.value='retry';await f.context.send();
  assert.equal(f.writes.length,0);
});

test('switching chats preserves each pending request and its confirmed target',async()=>{
  const f=await fixture();
  let release,entered;
  const ready=new Promise(resolve=>entered=resolve);
  f.context.ask=async messages=>{
    const title=messages.at(-1).content.includes('Alpha')?'Alpha':'Beta';
    if(title==='Alpha'){entered();await new Promise(resolve=>release=resolve)}
    return {reply:'I will create it.',actions:[{type:'create_task',args:{title}}]};
  };
  f.input.value='Create Alpha';
  const first=f.context.send();await ready;
  vm.runInContext('chats.push(norm({id:"chat-two",messages:[]}));activeId="chat-two";',f.context);
  f.input.value='Create Beta';await f.context.send();
  release();await first;
  assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.title).sort(),['Alpha','Beta']);
  assert.equal(vm.runInContext('chats.find(c=>c.id==="chat-one").lastActionTarget.title',f.context),'Alpha');
  assert.equal(vm.runInContext('chats.find(c=>c.id==="chat-two").lastActionTarget.title',f.context),'Beta');
});

test('closing a confirmation dialog resolves cancellation without executing',async()=>{
  const f=await fixture();
  f.context.document.body={classList:{remove(){}}};
  f.context.document.createElement=()=>({set textContent(value){this.innerHTML=value}});
  let shown;
  const ready=new Promise(resolve=>shown=resolve);
  f.context.dialogBox=()=>{shown();return {querySelector:()=>({addEventListener(){}})}};
  const pending=f.context.requestActionConfirmation('chat-one',{type:'delete_board',args:{boardId:'b'}},{ownerId:'one',planId:'plan',operationId:'close-dialog',createdAt:Date.now()});
  await ready;
  f.context.closeDialog();
  assert.equal(await pending,false);
  assert.equal(f.writes.length,0);
});
