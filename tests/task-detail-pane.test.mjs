import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand,resolveTaskDetail} from '../task-list-model.js';

async function fixture(){
  const {mountTaskDetailPane}=await import('../task-detail-pane.js');
  const {document,window}=parseHTML('<html><body><section id="tasks-page"><button id="opener">Details</button></section></body></html>');
  let data={boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'<img src=x onerror=x>',notes:'Old',date:null,startTime:null,endTime:null}]}]}]},owner='one',calls=[],fail=false;
  const root=document.getElementById('tasks-page');
  const pane=mountTaskDetailPane({root,document,window,getOwnerId:()=>owner,getPlanId:()=> 'plan',resolveTarget:target=>resolveTaskDetail(data,target),commit:async(command,expected,identity)=>{calls.push(structuredClone({command,expected,identity}));if(fail)throw new Error('Network failure');const result=applyTaskListCommand(data,command,expected);data=result.next;return result.result;}});
  const open=()=>pane.open({taskId:'t'},document.getElementById('opener'));
  const input=(name,value)=>{const el=root.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
  return {pane,document,window,root,open,input,calls,data:()=>data,setFail:value=>fail=value,setOwner:value=>owner=value};
}
test('task detail values are escaped and successful edits preserve unknown metadata',async()=>{
  const f=await fixture();await f.open();
  assert.equal(f.root.querySelector('[name="title"]').value,'<img src=x onerror=x>');
  assert.equal(f.root.querySelector('img'),null);
  f.input('notes','New');assert.equal(await f.pane.save(),true,f.root.querySelector('[role="status"]').textContent);
  assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'New');
  assert.match(f.root.querySelector('[role="status"]').textContent,/Saved/);
});
test('failed saves retain the draft and retry uses the same command identity',async()=>{
  const f=await fixture();await f.open();f.input('notes','Draft');f.setFail(true);
  assert.equal(await f.pane.save(),false);
  assert.equal(f.root.querySelector('[name="notes"]').value,'Draft');
  f.setFail(false);assert.equal(await f.pane.save(),true);
  assert.equal(f.calls[0].identity.operationId,f.calls[1].identity.operationId);
});
test('dirty close offers Save, Discard and Stay; maximising keeps the same draft',async()=>{
  const f=await fixture();await f.open();f.input('notes','Draft');
  const closing=f.pane.requestClose();
  assert.equal(f.document.querySelectorAll('[data-draft-choice]').length,3);
  f.document.querySelector('[data-draft-choice="stay"]').click();
  assert.equal(await closing,false);
  f.pane.maximise();
  assert.equal(f.document.querySelector('dialog [name="notes"]').value,'Draft');
  const discarded=f.pane.requestClose();f.document.querySelector('[data-draft-choice="discard"]').click();
  assert.equal(await discarded,true);
  assert.equal(f.document.querySelector('[data-task-detail-pane]'),null);
});
test('account changes close the pane and prevent the old draft from saving',async()=>{
  const f=await fixture();await f.open();f.input('notes','Draft');f.setOwner('two');
  assert.equal(await f.pane.save(),false);assert.equal(f.calls.length,0);
  assert.equal(f.document.querySelector('[data-task-detail-pane]'),null);
});
test('opening and saving an unchanged task does not invent a repeat rule or commit',async()=>{
  const f=await fixture();await f.open();assert.equal(await f.pane.save(),true);assert.equal(f.calls.length,0);
  assert.equal(await f.pane.requestClose(),true);
});
test('a same-field conflict retains the exact draft for review',async()=>{
  const f=await fixture();await f.open();f.input('notes','My draft');f.data().boards[0].sections[0].tasks[0].notes='Another window';
  assert.equal(await f.pane.save(),false);
  assert.equal(f.root.querySelector('[name="notes"]').value,'My draft');
  assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Another window');
});
test('invalid details remain editable without entering uncertain retry state',async()=>{
  const f=await fixture();await f.open();f.input('title','');
  assert.equal(await f.pane.save(),false);
  assert.equal(f.root.querySelector('[name="title"]').disabled,false);
  f.input('title','Corrected');assert.equal(await f.pane.save(),true);
});
test('saved title normalization becomes the next edits baseline',async()=>{
  const f=await fixture();await f.open();f.input('title','  New title  ');assert.equal(await f.pane.save(),true);
  f.input('title','Second title');assert.equal(await f.pane.save(),true);
  assert.equal(f.data().boards[0].sections[0].tasks[0].title,'Second title');
});
test('confirmed saves refresh unrelated metadata displayed by the editor',async()=>{
  const f=await fixture();await f.open();f.data().boards[0].sections[0].tasks[0].reminderMinutes=15;
  f.input('notes','New');assert.equal(await f.pane.save(),true);
  assert.equal(f.root.querySelector('[name="reminderMinutes"]').value,'15');
});
