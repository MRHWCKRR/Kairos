import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand,resolveTaskDetail} from '../task-list-model.js';

async function fixture({storage=new Map()}={}){
  const {mountTaskDetailPane}=await import('../task-detail-pane.js');
  const {document,window}=parseHTML('<html><body><section id="tasks-page"><button id="opener">Details</button></section></body></html>');
  let data={boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'<img src=x onerror=x>',notes:'Old',date:null,startTime:null,endTime:null}]}]}]},owner='one',calls=[],fail=false;
  const root=document.getElementById('tasks-page');
  window.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const pane=mountTaskDetailPane({root,document,window,getOwnerId:()=>owner,getPlanId:()=> 'plan',resolveTarget:target=>resolveTaskDetail(data,target),commit:async(command,expected,identity)=>{calls.push(structuredClone({command,expected,identity}));if(fail)throw new Error('Network failure');const result=applyTaskListCommand(data,command,expected);data=result.next;return result.result;}});
  const open=()=>pane.open({taskId:'t'},document.getElementById('opener'));
  const input=(name,value)=>{const el=root.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
  return {pane,document,window,root,open,input,calls,data:()=>data,setFail:value=>fail=value,setOwner:value=>owner=value};
}
test('checklist entry, completion, reordering and removal save without completing the parent',async()=>{
  const f=await fixture();await f.open();
  const add=title=>{const el=f.root.querySelector('[data-checklist-new]');assert.ok(el,'checklist quick entry exists');el.value=title;f.root.querySelector('[data-checklist-add]').click()};
  add('Read');add('Write');
  const checks=f.root.querySelectorAll('[data-step-check]');checks[0].checked=true;checks[0].dispatchEvent(new f.window.Event('change',{bubbles:true}));
  f.root.querySelector('[data-step-action="down"]').click();
  assert.match(f.root.querySelector('[data-checklist-progress]').textContent,/1.*2/);
  assert.equal(await f.pane.save(),true);
  const task=f.data().boards[0].sections[0].tasks[0];assert.equal(task.checklist[0].title,'Write');assert.equal(task.checklist[1].completed,true);assert.equal(task.completed,undefined);
  f.root.querySelector('[data-step-action="remove"]').click();assert.equal(await f.pane.save(),true);assert.equal(f.data().boards[0].sections[0].tasks[0].checklist.length,1);
});
test('checklist draft survives failed persistence with exact step identities on retry',async()=>{
  const f=await fixture();await f.open();const input=f.root.querySelector('[data-checklist-new]');assert.ok(input);input.value='Read';f.root.querySelector('[data-checklist-add]').click();f.setFail(true);
  assert.equal(await f.pane.save(),false);f.setFail(false);assert.equal(await f.pane.save(),true);
  assert.deepEqual(f.calls[0].command.changes.checklist,f.calls[1].command.changes.checklist);
  assert.equal(f.calls[0].identity.operationId,f.calls[1].identity.operationId);
});
test('recurring progress edits one occurrence and starts unchecked on the next',async()=>{
  const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];
  task.date='2026-10-15';task.checklist=[{id:'a',title:'Read',completed:false}];task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{'2026-10-15':{override:{date:'2026-10-17',reminderMinutes:10}}}};
  assert.equal(await f.pane.open({taskId:'t',occurrenceDate:'2026-10-15'}),true);
  assert.ok(f.root.querySelector('fieldset[disabled]'));
  const check=f.root.querySelector('[data-step-check]');check.checked=true;check.dispatchEvent(new f.window.Event('change',{bubbles:true}));
  assert.equal(await f.pane.save(),true);
  const saved=f.data().boards[0].sections[0].tasks[0];assert.equal(saved.checklist[0].completed,false);assert.equal(saved.recurrence.exceptions['2026-10-15'].override.checklist[0].completed,true);
  assert.equal(saved.recurrence.exceptions['2026-10-15'].override.reminderMinutes,10);
  assert.equal(await f.pane.open({taskId:'t',occurrenceDate:'2026-10-16'}),true);assert.notEqual(f.root.querySelector('[data-step-check]').checked,true);
});
test('series completion is disabled and invalid occurrence selection preserves the open editor',async()=>{
  const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];task.date='2026-10-15';task.checklist=[{id:'a',title:'Read',completed:false}];task.recurrence={enabled:true,frequency:'weekly',interval:1,weekdays:[4],startDate:'2026-10-15',mode:'flexible',exceptions:{}};
  await f.open();assert.equal(f.root.querySelector('[data-step-check]').disabled,true);
  assert.equal(await f.pane.open({taskId:'t',occurrenceDate:'2026-10-16'}),false);
  assert.ok(f.root.querySelector('[data-task-detail-pane]'));
});
test('a recurring task converted in Schedule opens an editable unchecked template',async()=>{
  const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];task.date='2026-10-15';task.checklist=[{id:'a',title:'Read',completed:true}];task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}};
  await f.open();const check=f.root.querySelector('[data-step-check]');assert.equal(check.disabled,true);assert.notEqual(check.checked,true);
  const title=f.root.querySelector('[data-step-title]');title.value='Read again';title.dispatchEvent(new f.window.Event('input',{bubbles:true}));
  assert.equal(await f.pane.save(),true);
  const saved=f.data().boards[0].sections[0].tasks[0];assert.equal(saved.checklist[0].title,'Read again');assert.equal(saved.checklist[0].completed,false);
});
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
test('restored pending repeat changes display the draft rule and retry the exact original command',async()=>{
  const storage=new Map(),first=await fixture({storage}),task=first.data().boards[0].sections[0].tasks[0];task.date='2026-10-15';task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}};
  await first.open();const preset=first.root.querySelector('[data-recurrence-preset]');preset.querySelector('[value="weekly"]').selected=true;preset.dispatchEvent(new first.window.Event('change',{bubbles:true}));first.setFail(true);assert.equal(await first.pane.save(),false);assert.equal(first.calls.length,1);const original=first.calls[0];first.pane.dispose();
  const restored=await fixture({storage});Object.assign(restored.data().boards[0].sections[0].tasks[0],task);await restored.open();assert.equal(restored.root.querySelector('[data-recurrence-preset]').value,'weekly');assert.equal(await restored.pane.save(),true);assert.deepEqual(restored.calls[0],original);assert.equal(restored.data().boards[0].sections[0].tasks[0].recurrence.frequency,'weekly');restored.pane.dispose();
});
