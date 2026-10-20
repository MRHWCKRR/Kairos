import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand,resolveTaskDetail} from '../task-list-model.js';

test('save feedback follows actual changes including reverting edits and pending step entry',async()=>{
 const f=await fixture();await f.open();const panel=()=>f.root.querySelector('[data-task-detail-pane]'),save=()=>f.root.querySelector('[type="submit"]');
 assert.equal(panel().dataset.saveState,'saved');assert.equal(save().disabled,true);
 f.input('notes','Draft');assert.equal(panel().dataset.saveState,'unsaved');assert.equal(save().disabled,false);
 f.input('notes','Old');assert.equal(panel().dataset.saveState,'saved');assert.match(f.root.querySelector('[role="status"]').textContent,/Saved/);assert.equal(save().disabled,true);
 const entry=f.root.querySelector('[data-checklist-new]');entry.value='Read chapter';entry.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.equal(panel().dataset.saveState,'unsaved');assert.equal(save().disabled,false);
 await f.pane.save();assert.equal(panel().dataset.saveState,'saved');assert.equal(f.data().boards[0].sections[0].tasks[0].checklist[0].title,'Read chapter');f.pane.dispose();
});

test('saving and retry expose clear states while keeping the exact operation',async()=>{
 const f=await fixture();await f.open();f.input('notes','Draft');let finish;f.setGate(new Promise(resolve=>finish=resolve));f.setFail(true);const saving=f.pane.save();
 const panel=f.root.querySelector('[data-task-detail-pane]');assert.equal(panel.dataset.saveState,'saving');assert.equal(panel.getAttribute('aria-busy'),'true');assert.match(panel.querySelector('[type="submit"]').textContent,/Saving/);assert.equal(panel.querySelector('[type="submit"]').disabled,true);
 finish();assert.equal(await saving,false);assert.equal(panel.dataset.saveState,'retry');assert.equal(panel.getAttribute('aria-busy'),'false');assert.equal(panel.querySelector('[type="submit"]').disabled,false);assert.match(panel.querySelector('[type="submit"]').textContent,/Retry/);
 f.setGate(null);f.setFail(false);assert.equal(await f.pane.save(),true);assert.deepEqual(f.calls[1],f.calls[0]);f.pane.dispose();
});

test('leaving the browser warns only for the current unsaved task and removes the guard on close',async()=>{
 const f=await fixture();await f.open();const leave=()=>{const event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);return event.defaultPrevented};
 assert.equal(leave(),false);f.input('notes','Draft');assert.equal(leave(),true);f.input('notes','Old');assert.equal(leave(),false);
 const entry=f.root.querySelector('[data-checklist-new]');entry.value='Pending step';entry.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.equal(leave(),true);
 f.pane.dispose();assert.equal(leave(),false);
});

test('saving from the footer retains keyboard focus on an enabled footer action',async()=>{
 const f=await fixture();await f.open();f.input('notes','Draft');f.root.querySelector('[type="submit"]').focus();assert.equal(await f.pane.save(),true);
 assert.equal(f.document.activeElement.disabled,false);assert.equal(f.root.querySelector('.task-detail-footer').contains(f.document.activeElement),true);f.pane.dispose();
});

test('Rename opening focuses title without changing normal detail opening',async()=>{
 const f=await fixture();let focused=null;f.window.HTMLElement.prototype.focus=function(){focused=this};await f.open();focused=null;
 await f.pane.open({taskId:'t'},f.document.getElementById('opener'),{focusField:'title'});assert.equal(focused?.name,'title');assert.equal(f.calls.length,0);
});
test('assignment links respect dirty drafts and progress refresh preserves unsaved title edits',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks.push({id:'session',title:'Research',assignmentId:'t',sessionIndex:1,estimatedMinutes:30});
 await f.open();assert.match(f.root.querySelector('[data-assignment-detail]').textContent,/0 of 1/);f.input('title','Unsaved assignment');
 f.root.querySelector('[data-assignment-open="session"]').click();await new Promise(resolve=>setImmediate(resolve));assert.ok(f.document.querySelector('[data-draft-choice="stay"]'));f.document.querySelector('[data-draft-choice="stay"]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.root.querySelector('[name="title"]').value,'Unsaved assignment');
 f.data().boards[0].sections[0].tasks[1].completed=true;f.pane.sync();assert.match(f.root.querySelector('[data-assignment-detail]').textContent,/1 of 1/);assert.equal(f.root.querySelector('[name="title"]').value,'Unsaved assignment');assert.equal(f.calls.length,0);f.pane.dispose();
});
test('sync keeps linked sessions expanded and retains focus when progress changes',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks.push({id:'session',title:'Research',assignmentId:'t',sessionIndex:1,estimatedMinutes:30});await f.open();
 const group=f.root.querySelector('[data-assignment-detail] details'),button=f.root.querySelector('[data-assignment-open="session"]');group.open=true;button.focus();f.pane.sync();assert.ok(f.root.querySelector('[data-assignment-open="session"]')===button,'keep the existing link node');assert.equal(group.open,true);
 f.data().boards[0].sections[0].tasks[1].completed=true;f.pane.sync();assert.equal(f.root.querySelector('[data-assignment-detail] details').open,true);assert.equal(f.document.activeElement?.dataset.assignmentOpen,'session');f.pane.dispose();
});
test('account change during dirty-detail confirmation cannot open a same-ID task in the new account',async()=>{
 const f=await fixture();await f.open();f.input('title','Unsaved');const opening=f.pane.open({taskId:'t'},f.document.getElementById('opener'));
 f.setOwner('two');f.document.querySelector('[data-draft-choice="discard"]').click();assert.equal(await opening,false);assert.equal(f.root.querySelector('.task-detail-pane'),null);
});

async function fixture({storage=new Map()}={}){
  const {mountTaskDetailPane}=await import('../task-detail-pane.js');
  const {document,window}=parseHTML('<html><body><section id="tasks-page"><button id="opener">Details</button></section></body></html>');
  let scheduled=[],focusStarts=[],focusTargets=[];let data={boards:[{id:'b',title:'Study',sections:[{id:'s',title:'General',tasks:[{id:'t',title:'<img src=x onerror=x>',notes:'Old',date:null,startTime:null,endTime:null}]}]}]},owner='one',plan='plan',calls=[],fail=false,gate=null,active=document.body;
  const root=document.getElementById('tasks-page');
  const selectValue=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');if(!selectValue.set)Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:selectValue.get,set(value){for(const option of this.querySelectorAll('option'))option.selected=option.value===String(value)}});
  window.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  Object.defineProperty(document,'activeElement',{get:()=>active?.isConnected?active:document.body});window.HTMLElement.prototype.focus=function(){active=this};window.HTMLInputElement.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end};window.innerWidth=1440;
  const pane=mountTaskDetailPane({root,document,window,getState:()=>data,getToday:()=> '2026-10-18',getOwnerId:()=>owner,getPlanId:()=>plan,resolveTarget:target=>resolveTaskDetail(data,target),onStartFocus:(id,occurrenceDate)=>{focusStarts.push(id);focusTargets.push({id,occurrenceDate})},openSchedule:target=>scheduled.push(target),commit:async(command,expected,identity)=>{calls.push(structuredClone({command,expected,identity}));if(gate)await gate;if(fail)throw new Error('Network failure');const result=applyTaskListCommand(data,command,expected);data=result.next;return result.result;}});
  const open=()=>pane.open({taskId:'t'},document.getElementById('opener'));
  const input=(name,value)=>{const el=root.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
  return {pane,document,window,root,open,input,calls,scheduled,focusStarts,focusTargets,data:()=>data,setFail:value=>fail=value,setOwner:value=>owner=value,setPlan:value=>plan=value,setGate:value=>gate=value};
}

test('pending composer participates in Save Discard Stay without losing an unadded step',async()=>{
 for(const choice of ['stay','discard','save']){const f=await fixture();await f.open();const composer=f.root.querySelector('[data-checklist-new]');composer.value='Review';const closing=f.pane.requestClose();const button=f.document.querySelector('[data-draft-choice="'+choice+'"]');assert.ok(button,'Composer alone must create a dirty draft');button.click();assert.equal(await closing,choice!=='stay');if(choice==='stay'){assert.equal(composer.value,'Review');assert.equal(f.calls.length,0)}else if(choice==='save'){assert.equal(f.data().boards[0].sections[0].tasks[0].checklist[0].title,'Review');assert.equal(f.calls.length,1)}else assert.equal(f.calls.length,0);f.pane.dispose();}
});
test('composer saves exactly once across an uncertain retry',async()=>{
 const f=await fixture();await f.open();f.root.querySelector('[data-checklist-new]').value='Review';f.setFail(true);assert.equal(await f.pane.save(),false);assert.equal(f.calls.length,1);f.setFail(false);assert.equal(await f.pane.save(),true);assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(f.data().boards[0].sections[0].tasks[0].checklist.filter(step=>step.title==='Review').length,1);f.pane.dispose();
});
test('Ctrl and Cmd Enter from composer save pending text and composition cannot trigger Save',async()=>{
 for(const modifier of ['ctrlKey','metaKey']){const f=await fixture();await f.open();const composer=f.root.querySelector('[data-checklist-new]');composer.value='Review';const composition=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(composition,{key:'Enter',isComposing:true,[modifier]:true});composer.dispatchEvent(composition);assert.equal(f.calls.length,0);const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key:'Enter',[modifier]:true});composer.dispatchEvent(event);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);assert.equal(f.data().boards[0].sections[0].tasks[0].checklist[0].title,'Review');f.pane.dispose();}
});
test('an invalid pending composer never creates a save receipt or disables the draft',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks[0].checklist=Array.from({length:100},(_,i)=>({id:'step-'+i,title:'Existing',completed:false}));await f.open();const composer=f.root.querySelector('[data-checklist-new]');composer.value='Review';assert.equal(await f.pane.save(),false);assert.equal(f.calls.length,0);assert.equal(composer.disabled,false);assert.equal(composer.value,'Review');assert.ok(f.document.activeElement===composer);f.pane.dispose();
});
test('Save restores checklist logical focus, caret and pane scroll after disabling controls',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Read notes',completed:false}];await f.open();const input=f.root.querySelector('[data-step-title]');input.value='Read revised notes';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));input.focus();input.setSelectionRange(2,6);f.root.querySelector('[data-task-detail-pane]').scrollTop=120;assert.equal(await f.pane.save(),true);const fresh=f.root.querySelector('[data-step-title]');assert.ok(f.document.activeElement===fresh);assert.equal(fresh.selectionStart,2);assert.equal(fresh.selectionEnd,6);assert.equal(f.root.querySelector('[data-task-detail-pane]').scrollTop,120);f.pane.dispose();
});
test('expanding and shrinking retain editor identity, pending text, caret and notes',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Read notes',completed:false}];await f.open();f.input('notes','Draft notes');const composer=f.root.querySelector('[data-checklist-new]');composer.value='Pending';composer.focus();composer.setSelectionRange(1,4);f.pane.maximise();assert.equal(f.document.querySelector('[data-checklist-new]'),composer);assert.ok(f.document.activeElement===composer);assert.equal(composer.selectionEnd,4);assert.equal(f.document.querySelector('[name="notes"]').value,'Draft notes');f.pane.maximise();assert.ok(f.document.activeElement===composer);assert.equal(composer.value,'Pending');f.pane.dispose();
});
test('late saves cannot restore old checklist focus after account, planner, task disposal or page navigation',async()=>{
 for(const kind of ['owner','plan','dispose','page']){const f=await fixture();await f.open();f.root.querySelector('[data-checklist-new]').value='Review';let finish;f.setGate(new Promise(resolve=>finish=resolve));f.root.classList.add('page-view','active');const saving=f.pane.save();assert.equal(f.calls.length,1);const outside=f.document.createElement('button');f.document.body.appendChild(outside);if(kind==='owner')f.setOwner('other');else if(kind==='plan')f.setPlan('other');else if(kind==='dispose')f.pane.dispose();else f.root.classList.remove('active');if(kind!=='page')f.pane.sync();outside.focus();finish();await saving;assert.ok(f.document.activeElement===outside);if(kind!=='page')assert.equal(f.root.querySelector('[data-task-detail-pane]'),null);f.pane.dispose();}
});
test('reordered checklist is saved explicitly with exact retry IDs and occurrence scope',async()=>{
 for(const occurrence of [false,true]){const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];task.checklist=[{id:'a',title:'Read',completed:false},{id:'b',title:'Write',completed:false}];if(occurrence){task.date='2026-10-15';task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}}}await f.pane.open({taskId:'t',...(occurrence?{occurrenceDate:'2026-10-15'}:{})});const input=f.root.querySelector('[data-step-title]'),key=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(key,{key:'ArrowDown',altKey:true});input.dispatchEvent(key);assert.equal(f.calls.length,0);f.setFail(true);assert.equal(await f.pane.save(),false);assert.ok(f.root.querySelector('[data-step-grip]').disabled);f.setFail(false);assert.equal(await f.pane.save(),true);assert.deepEqual(f.calls[1],f.calls[0]);assert.deepEqual(f.calls[0].command.changes.checklist.map(x=>x.id),['b','a']);const saved=f.data().boards[0].sections[0].tasks[0];if(occurrence){assert.deepEqual(saved.checklist.map(x=>x.id),['a','b']);assert.deepEqual(saved.recurrence.exceptions['2026-10-15'].override.checklist.map(x=>x.id),['b','a'])}f.pane.dispose();}
});
test('pane page and owner changes cancel checklist drag without committing or closing on Escape',async()=>{
 for(const kind of ['page','owner','escape']){const f=await fixture();f.window.requestAnimationFrame=()=>1;f.window.cancelAnimationFrame=()=>{};f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Read',completed:false},{id:'b',title:'Write',completed:false}];await f.open();f.root.classList.add('page-view','active');const rows=[...f.root.querySelectorAll('[data-step-row]')],grip=rows[0].querySelector('[data-step-grip]');for(const [i,row] of rows.entries())row.getBoundingClientRect=()=>({top:i*50,bottom:i*50+50,height:50,left:0,right:300});f.document.elementFromPoint=()=>rows[1];const event=(target,type,props={})=>{const e=new f.window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientX:10,clientY:10},props);target.dispatchEvent(e)};event(grip,'pointerdown');event(f.document,'pointermove',{clientY:90});assert.ok(f.document.querySelector('[data-checklist-drag-preview]'));if(kind==='page'){f.root.classList.remove('active');f.pane.sync()}else if(kind==='owner'){f.setOwner('other');f.pane.sync()}else event(grip,'keydown',{key:'Escape'});assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null);assert.equal(f.calls.length,0);if(kind==='escape'){assert.ok(f.root.querySelector('[data-task-detail-pane]'));assert.equal(f.document.querySelector('[data-draft-choice]'),null)}f.pane.dispose();}
});
test('expanded navigation cancels drag without relying on host sync',async()=>{
 const f=await fixture();const frames=new Map();let next=0;f.window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next};f.window.cancelAnimationFrame=id=>frames.delete(id);f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Read',completed:false},{id:'b',title:'Write',completed:false}];f.root.classList.add('page-view','active');await f.open();f.pane.maximise();const rows=[...f.document.querySelectorAll('[data-step-row]')],grip=rows[0].querySelector('[data-step-grip]');for(const [i,row] of rows.entries())row.getBoundingClientRect=()=>({top:i*50,bottom:i*50+50,height:50,left:0,right:300});f.document.elementFromPoint=()=>rows[1];const event=(target,type,y)=>{const e=new f.window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientX:10,clientY:y});target.dispatchEvent(e)};event(grip,'pointerdown',10);event(f.document,'pointermove',90);assert.ok(f.document.querySelector('[data-checklist-drag-preview]'));f.root.classList.remove('active');const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();assert.ok(!f.document.querySelector('[data-checklist-drag-preview]'),'Expanded page navigation must remove drag preview');assert.equal(frames.size,0);event(f.document,'pointerup',90);assert.deepEqual([...f.document.querySelectorAll('[data-step-row]')].map(row=>row.dataset.stepRow),['a','b']);assert.equal(await f.pane.save(),true);assert.equal(f.calls.length,0);f.pane.dispose();
});
test('task working layout reads title context notes checklist then properties with one action footer',async()=>{
 const f=await fixture();await f.open();const order=[...f.root.querySelectorAll('[name="title"],.task-detail-location,[name="notes"],.task-checklist,.task-detail-properties')].map(el=>el.name||el.className);assert.deepEqual(order,['title','task-detail-location','notes','task-checklist','task-detail-properties task-detail-metadata']);const footer=f.root.querySelector('.task-detail-footer');assert.ok(footer);assert.ok(footer.querySelector('[role="status"]'));assert.ok(footer.querySelector('[type="submit"]'));assert.equal(f.root.querySelectorAll('form').length,1);assert.ok(f.root.querySelector('.task-detail-work .task-checklist'));assert.equal(f.root.querySelectorAll('details[data-detail-group]').length,3);f.pane.dispose();
});
test('property summaries expose non-default draft values while groups remain collapsed',async()=>{
 const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];Object.assign(task,{date:'2026-10-15',reminderMinutes:15,schedulingPreference:'morning',scheduleLocked:true,color:'#123456',recurrence:{enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}}});await f.open();const summary=name=>f.root.querySelector('[data-detail-summary="'+name+'"]');assert.ok(summary('reminder'));assert.match(summary('reminder').textContent,/15/);assert.match(summary('repeat').textContent,/daily/i);assert.match(summary('planning').textContent,/morning/i);assert.match(summary('planning').textContent,/#123456/);assert.equal(f.root.querySelector('details[data-detail-group="reminder"]').open===true,false);f.input('reminderMinutes','30');assert.match(summary('reminder').textContent,/30/);f.input('schedulingPreference','evening');assert.match(summary('planning').textContent,/evening/i);f.input('color','<img src=x>');assert.match(summary('planning').textContent,/<img src=x>/);assert.equal(summary('planning').querySelector('img'),null);f.pane.dispose();
});
test('visibility alone does not dirty a task and save retains hidden checklist and open groups',async()=>{
 const f=await fixture();f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Done',completed:true},{id:'b',title:'Next',completed:false}];await f.open();f.root.querySelector('[data-checklist-completed-toggle]').click();assert.equal(await f.pane.requestClose(),true);assert.equal(f.calls.length,0);await f.open();const toggle=f.root.querySelector('[data-checklist-completed-toggle]');assert.match(toggle.textContent,/Hide completed/);toggle.click();const group=f.root.querySelector('[data-detail-group="planning"]');assert.ok(group);group.open=true;f.input('color','#123456');const color=f.root.querySelector('[name="color"]');color.focus();color.setSelectionRange(1,3);assert.equal(await f.pane.save(),true);assert.equal(f.root.querySelector('[data-step-row="a"]').hidden,true);assert.equal(f.root.querySelector('[data-detail-group="planning"]').open,true);assert.ok(f.document.activeElement===f.root.querySelector('[name="color"]'));assert.equal(f.data().boards[0].sections[0].tasks[0].checklist.length,2);f.pane.maximise();assert.equal(f.document.querySelector('[data-step-row="a"]').hidden,true);f.pane.maximise();assert.equal(f.root.querySelector('[data-detail-group="planning"]').open,true);f.pane.dispose();
});
test('Retry preserves property groups and summary focus changed during an uncertain save',async()=>{
 const f=await fixture();await f.open();f.input('notes','Draft');f.setFail(true);assert.equal(await f.pane.save(),false);const group=f.root.querySelector('[data-detail-group="reminder"]');group.open=true;group.querySelector('summary').focus();f.root.querySelector('[data-task-detail-pane]').scrollTop=90;f.setFail(false);assert.equal(await f.pane.save(),true);const fresh=f.root.querySelector('[data-detail-group="reminder"]');assert.equal(fresh.open,true);assert.ok(f.document.activeElement===fresh.querySelector('summary'));assert.equal(f.root.querySelector('[data-task-detail-pane]').scrollTop,90);assert.deepEqual(f.calls[1],f.calls[0]);f.pane.dispose();
});
test('background Save restores presentation without restoring task focus',async()=>{
 const f=await fixture();f.root.classList.add('page-view','active');f.data().boards[0].sections[0].tasks[0].checklist=[{id:'a',title:'Done',completed:true},{id:'b',title:'Next',completed:false}];await f.open();f.root.querySelector('[data-checklist-completed-toggle]').click();f.root.querySelector('[data-detail-group="planning"]').open=true;f.input('notes','Draft');let finish;f.setGate(new Promise(resolve=>finish=resolve));const saving=f.pane.save();f.root.classList.remove('active');const outside=f.document.createElement('button');f.document.body.appendChild(outside);outside.focus();finish();assert.equal(await saving,true);assert.equal(f.root.querySelector('[data-step-row="a"]').hidden,true);assert.equal(f.root.querySelector('[data-detail-group="planning"]').open,true);assert.ok(f.document.activeElement===outside);f.pane.dispose();
});
test('pointer Retry uses the newer summary focus captured before the button gains focus',async()=>{
 const f=await fixture();await f.open();f.input('notes','Draft');f.root.querySelector('[name="notes"]').focus();f.setFail(true);assert.equal(await f.pane.save(),false);const group=f.root.querySelector('[data-detail-group="planning"]');group.open=true;group.querySelector('summary').focus();const retry=f.root.querySelector('[type="submit"]');retry.dispatchEvent(new f.window.Event('pointerdown',{bubbles:true}));retry.focus();f.setFail(false);f.root.querySelector('form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));const fresh=f.root.querySelector('[data-detail-group="planning"]');assert.equal(fresh.open,true);assert.ok(f.document.activeElement===fresh.querySelector('summary'));assert.deepEqual(f.calls[1],f.calls[0]);f.pane.dispose();
});
test('occurrence working layout keeps all metadata readonly while scope changes stay presentation only',async()=>{
 const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];task.date='2026-10-15';task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}};await f.pane.open({taskId:'t',occurrenceDate:'2026-10-15'});assert.equal(f.root.querySelectorAll('fieldset.task-detail-metadata[disabled]').length,3);assert.equal(f.root.querySelector('[data-checklist-new]').disabled,false);const date=f.root.querySelector('[data-checklist-occurrence]');date.value='2026-10-16';date.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.match(f.root.querySelector('[role="status"]').textContent,/Saved/);assert.equal(await f.pane.requestClose(),true);assert.equal(f.calls.length,0);f.pane.dispose();
});
test('restored pending values appear in collapsed property summaries and retry preserves payload',async()=>{
 const storage=new Map(),first=await fixture({storage});await first.open();first.input('reminderMinutes','25');first.input('schedulingPreference','evening');first.setFail(true);assert.equal(await first.pane.save(),false);const original=first.calls[0];first.pane.dispose();const f=await fixture({storage});await f.open();const reminder=f.root.querySelector('[data-detail-summary="reminder"]'),planning=f.root.querySelector('[data-detail-summary="planning"]');assert.ok(reminder&&planning);assert.match(reminder.textContent,/25/);assert.match(planning.textContent,/evening/i);assert.equal(await f.pane.save(),true);assert.deepEqual(f.calls[0],original);f.pane.dispose();
});
test('dated occurrence pending composer saves only checklist changes with metadata read-only',async()=>{
 const f=await fixture(),task=f.data().boards[0].sections[0].tasks[0];task.date='2026-10-15';task.checklist=[];task.recurrence={enabled:true,frequency:'daily',interval:1,startDate:'2026-10-15',mode:'flexible',exceptions:{}};await f.pane.open({taskId:'t',occurrenceDate:'2026-10-15'});assert.ok(f.root.querySelector('fieldset[disabled]'));f.root.querySelector('[data-checklist-new]').value='Occurrence step';assert.equal(await f.pane.save(),true);assert.deepEqual(Object.keys(f.calls[0].command.changes),['checklist']);assert.equal(f.data().boards[0].sections[0].tasks[0].checklist.length,0);assert.equal(f.data().boards[0].sections[0].tasks[0].recurrence.exceptions['2026-10-15'].override.checklist[0].title,'Occurrence step');f.pane.dispose();
});
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

test('deadline editor gives draft feedback, waits for save and protects unsaved notes before review',async()=>{const f=await fixture();f.data().boards[0].sections[0].tasks[0].dueDate='2099-01-05';f.data().boards[0].sections[0].tasks.push({id:'a',title:'Draft',assignmentId:'t',date:'2099-01-04',startTime:'09:00',endTime:'10:00'});await f.open();f.input('dueDate','2099-01-03');assert.match(f.root.querySelector('[data-deadline-impact]').textContent,/1 unfinished session/);assert.equal(f.root.querySelector('[data-deadline-review]'),null);assert.equal(f.calls.length,0);f.setFail(true);assert.equal(await f.pane.save(),false);assert.equal(f.root.querySelector('[data-deadline-review]'),null);f.setFail(false);await f.pane.save();assert.ok(f.root.querySelector('[data-deadline-review]'));f.input('notes','Keep draft');f.root.querySelector('[data-deadline-review]').click();await new Promise(r=>setImmediate(r));assert.ok(f.document.querySelector('[data-draft-choice="stay"]'));f.document.querySelector('[data-draft-choice="stay"]').click();await new Promise(r=>setImmediate(r));assert.equal(f.scheduled.length,0);assert.equal(f.root.querySelector('[name="notes"]').value,'Keep draft');f.root.querySelector('[data-deadline-review]').click();await new Promise(r=>setImmediate(r));f.document.querySelector('[data-draft-choice="save"]').click();await new Promise(r=>setImmediate(r));assert.deepEqual(f.scheduled,[{taskId:'t',reviewDeadline:true}]);assert.equal(f.data().boards[0].sections[0].tasks[0].notes,'Keep draft');f.pane.dispose()});

test('Start focus keeps unsaved task notes and does not mark the task complete',async()=>{const f=await fixture();await f.open();f.input('notes','Keep unsaved notes');const button=f.root.querySelector('[data-task-focus-start]');assert.ok(button);button.click();assert.deepEqual(f.focusStarts,['t']);assert.equal(f.root.querySelector('[name="notes"]').value,'Keep unsaved notes');assert.equal(f.calls.length,0);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,undefined);f.pane.dispose()});

test('dated recurring details start focus for exactly that occurrence',async()=>{const f=await fixture(),date='2026-10-19';f.data().boards[0].sections[0].tasks[0].recurrence={enabled:true,frequency:'daily',startDate:date,interval:1,mode:'flexible'};await f.pane.open({taskId:'t',occurrenceDate:date});const button=f.root.querySelector('[data-task-focus-start]');assert.ok(button);button.click();assert.deepEqual(f.focusTargets,[{id:'t',occurrenceDate:date}]);assert.equal(f.calls.length,0);f.pane.dispose()});
