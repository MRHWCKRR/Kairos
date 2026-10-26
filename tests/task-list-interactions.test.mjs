import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {applyTaskListCommand} from '../task-list-model.js';
import * as workspaceModule from '../task-list-workspace.js';
const {renderTaskListRow}=workspaceModule;
import {plannerFixture} from './helpers/planner-fixture.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('task dragging cancels on lost pointer capture and window focus loss without saving',async()=>{
 for(const signal of ['blur','lostpointercapture']){const f=await fixture();try{f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:80});assert.equal(f.interactions.isDragging(),true);if(signal==='blur')f.window.dispatchEvent(new f.window.Event('blur'));else f.pointer(signal,f.root);assert.equal(f.interactions.isDragging(),false);assert.equal(f.root.querySelectorAll('.task-dragging,.task-drop-before,.task-drop-after').length,0);assert.equal(f.calls.length,0)}finally{f.interactions.dispose()}}
});
test('an invalid drag release keeps the selected group and the next genuine outside click still clears it',async()=>{
 let selection;const f=await fixture({getSelectedTaskIds:()=>selection?.ids()||[]}),{mountTaskSelection}=await import('../task-selection.js'),{taskListLocation}=await import('../task-list-model.js');
 selection=mountTaskSelection({root:f.root,document:f.document,window:f.window,getIdentity:()=>({ownerId:'one',planId:'plan'}),getViewKey:()=> 'overview',resolveTarget:t=>taskListLocation(f.data(),t.taskId)});
 try{selection.toggle('a');selection.toggle('c');f.document.elementFromPoint=()=>null;f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:80});f.pointer('pointerup',f.root,{clientY:80});
  const click=new f.window.Event('click',{bubbles:true,cancelable:true});Object.assign(click,{button:0,pointerId:1,detail:1});f.root.dispatchEvent(click);assert.deepEqual(selection.ids(),['a','c']);assert.equal(f.calls.length,0);
  f.pointer('pointerdown',f.document.body);const outside=new f.window.Event('click',{bubbles:true,cancelable:true});Object.assign(outside,{button:0,pointerId:1,detail:1});f.document.body.dispatchEvent(outside);assert.deepEqual(selection.ids(),[]);
 }finally{selection.dispose();f.interactions.dispose()}
});

test('menu adapter reuses existing completion, movement, archive and retry paths',async()=>{
 const f=await fixture();assert.equal(typeof f.interactions.runTaskAction,'function');assert.equal(typeof f.interactions.getActionState,'function');
 assert.equal(f.interactions.getActionState({taskId:'a'}).canMoveUp,false);assert.equal(f.interactions.getActionState({taskId:'c'}).canMoveUp,true);
 assert.equal(await f.interactions.runTaskAction('up',{taskId:'c'}),true);assert.equal(f.calls[0].command.type,'reorder_tasks');assert.equal(f.calls[0].command.target.taskId,'c');
 assert.equal(await f.interactions.runTaskAction('complete',{taskId:'a'}),true);assert.equal(f.calls[1].command.type,'complete_task');
 f.setFail(true);assert.equal(await f.interactions.runTaskAction('down',{taskId:'c'}),false);assert.equal(f.interactions.getActionState({taskId:'c'}).pending,true);assert.equal(await f.interactions.runTaskAction('archive',{taskId:'a'}),false);
 f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[2],f.calls[3]);assert.equal(await f.interactions.runTaskAction('archive',{taskId:'a'}),true);assert.equal(f.calls.at(-1).command.type,'archive_task');f.interactions.dispose();
});
test('menu adapter opens the destination chooser and enforces sorted and recurring constraints',async()=>{
 const f=await fixture();assert.equal(typeof f.interactions.runTaskAction,'function');assert.equal(await f.interactions.runTaskAction('move',{taskId:'a'}),true);assert.ok(f.document.querySelector('[data-task-move-dialog]'));f.interactions.sync();f.setSorted(true);assert.equal(await f.interactions.runTaskAction('up',{taskId:'c'}),false);f.setSorted(false);f.data().boards[0].sections[0].tasks[0].recurrence={enabled:true};assert.equal(await f.interactions.runTaskAction('complete',{taskId:'a'}),false);assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('real shared menu dispatches one canonical action and preserves invoker through overview refresh',async()=>{
 const f=await fixture({preserveOverview:true});const {createTaskActions}=await import('../task-actions.js'),{mountTaskActionMenu}=await import('../task-action-menu.js'),{taskListLocation}=await import('../task-list-model.js');
 const actions=createTaskActions({getIdentity:()=>({ownerId:'one',planId:'plan'}),resolveTarget:target=>taskListLocation(f.data(),target.taskId),getInteractionState:target=>f.interactions.getActionState(target),runTaskAction:(...args)=>f.interactions.runTaskAction(...args)});
 const menu=mountTaskActionMenu({root:f.root,document:f.document,window:f.window,actions,getIdentity:()=>({ownerId:'one',planId:'plan'}),resolveRow:el=>{const row=el.closest?.('[data-detail-row]');return row?{row,taskId:row.dataset.detailRow}:null}});
 const invoker=f.root.querySelector('[data-task-menu="a"]');invoker.click();f.refresh();menu.sync();assert.equal(invoker.getAttribute('aria-expanded'),'true');
 f.document.querySelector('[data-task-menu-action="complete"] span').click();await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].command.target.taskId,'a');assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);assert.equal(f.document.querySelector('[data-task-action-menu]'),null);menu.dispose();f.interactions.dispose();
});
const initial=()=>({userID:'one',boards:[{id:'b',title:'School',sections:[{id:'s',title:'Same',tasks:[{id:'a',title:'Same',completed:false},{id:'hidden',title:'Done',completed:true},{id:'c',title:'Same',completed:false}]},{id:'empty',title:'Same',tasks:[]}]}]});
test('menu movement ignores retained rows in a hidden section after returning to overview',async()=>{
 const f=await fixture(),retained=f.document.createElement('section');retained.hidden=true;retained.innerHTML=f.document.getElementById('overview').innerHTML;f.root.prepend(retained);
 f.data().boards[0].sections[0].tasks.reverse();f.refresh();
 const state=f.interactions.getActionState({taskId:'a'});assert.equal(state.canMoveUp,true);assert.equal(state.canMoveDown,false);
 assert.equal(await f.interactions.runTaskAction('up',{taskId:'a'}),true);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['a','c','hidden']);f.interactions.dispose();
});
async function fixture({persist,savedStorage=new Map(),preserveOverview=false,confirmArchive=async()=>true,getSelectedTaskIds=()=>[]}={}){
  const module=await import('../task-list-interactions.js').catch(()=>({}));assert.equal(typeof module.mountTaskListInteractions,'function','task interactions must be implemented');
  const {document,window}=parseHTML('<html><body><main><section id="tasks" class="active"><div id="overview"></div></section><input id="chat"></main></body></html>');
  const root=document.getElementById('tasks'),overview=document.getElementById('overview'),scroll=document.querySelector('main');let data=initial(),owner='one',plan='plan',now=Date.now(),calls=[],confirmations=[],fail=false,wait=null,focused=null,frames=[],timer=null,sorted=false,view='overview',allowClose=true,closeWait=null,ensureHook=null;
  window.HTMLElement.prototype.focus=function(){focused=this};const storage=savedStorage;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused?.isConnected?focused:document.body});window.HTMLInputElement.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end};
  let interactions;const refresh=()=>{let html='';for(const section of (interactions?.getDisplayState?.()||data).boards[0].sections){const block=document.createElement('div');block.className='board-section-block';block.dataset.boardId='b';block.dataset.sectionId=section.id;block.innerHTML='<ul class="task-list">'+section.tasks.filter(t=>!t.archived).map(t=>renderTaskListRow(t,section.id)).join('')+'</ul>';for(const row of block.querySelectorAll('[data-detail-row="hidden"]'))row.hidden=true;html+=block.outerHTML;}if(preserveOverview&&workspaceModule.replaceTaskOverview)workspaceModule.replaceTaskOverview(overview,html,{document,scrollElement:scroll});else overview.innerHTML=html;interactions?.decorate()};
  refresh();
  interactions=module.mountTaskListInteractions({root,scrollElement:scroll,document,window,getState:()=>data,getOwnerId:()=>owner,getPlanId:()=>plan,getViewKey:()=>view,getSelectedTaskIds,isSorted:()=>sorted,ensurePlan:async()=>ensureHook?ensureHook():true,requestCloseDetails:async()=>closeWait??allowClose,refresh,clock:()=>now,storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},confirmArchive,confirmDiscard:async()=>true,onConfirmed:(c,r)=>confirmations.push({c,r}),setTimer:fn=>{timer=fn;return 1},clearTimer:()=>timer=null,requestFrame:fn=>{frames.push(fn);return frames.length},cancelFrame:()=>{},commit:async(command,expected,identity)=>{
    calls.push(structuredClone({command,expected,identity}));if(wait)await wait;if(fail)throw new Error('Network failure');
    if(persist){const result=await persist(command,expected,identity);data=persist.data();refresh();return result}
    const out=applyTaskListCommand(data,command,expected,{now});data=out.next;refresh();return out.result;
  }});interactions.decorate();
  const control=(id,action)=>[...root.querySelectorAll('[data-detail-row]')].find(el=>el.dataset.detailRow===id)?.querySelector('[data-task-action="'+action+'"]');
  const pointer=(type,target,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:10,clientY:20,...props});target.dispatchEvent(event);return event};
  return {interactions,root,document,window,scroll,control,pointer,calls,confirmations,storage,focused:()=>focused,data:()=>data,setFail:v=>fail=v,setOwner:v=>owner=v,setPlan:v=>plan=v,setSorted:v=>sorted=v,setView:v=>view=v,allowClose:v=>allowClose=v,waitForClose:p=>closeWait=p,setEnsurePlan:fn=>ensureHook=fn,block:p=>wait=p,advance:ms=>{now+=ms;timer?.()},frame:()=>frames.shift()?.(),refresh};
}
test('bulk completion previews once, rolls back on failure and retries the original receipt',async()=>{
 const f=await fixture();assert.equal(typeof f.interactions.runTaskBatch,'function');let release;f.block(new Promise(resolve=>release=resolve));const saving=f.interactions.runTaskBatch('complete',{taskIds:['a','c']});await tick();assert.equal(f.data().boards[0].sections[0].tasks[0].completed,false);assert.equal(f.interactions.getDisplayState().boards[0].sections[0].tasks[0].completed,true);assert.equal(f.confirmations.length,0);assert.equal(f.root.querySelector('[data-task-undo]').hidden,true);
 f.setFail(true);release();assert.equal(await saving,false);assert.equal(f.interactions.getDisplayState().boards[0].sections[0].tasks[0].completed,false);assert.equal(await f.interactions.runTaskBatch('archive',{taskIds:['a','c']}),false);f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.confirmations.length,1);assert.equal(await f.interactions.undo(),true);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,false);f.interactions.dispose();
});
test('a remounted batch reconciles the same lost-response receipt and one confirmed Undo',async()=>{
 const store=await plannerFixture(initial(),{failAfterCommit:true});store.context.applyTaskListCommand=applyTaskListCommand;const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;
 const first=await fixture({persist});assert.equal(typeof first.interactions.runTaskBatch,'function');assert.equal(await first.interactions.runTaskBatch('complete',{taskIds:['a','c']}),false);const original=first.calls[0];first.interactions.dispose();const second=await fixture({persist,savedStorage:first.storage});assert.equal(await second.interactions.retry(),true);assert.deepEqual(second.calls[0],original);assert.equal(store.writes.length,1);assert.equal(second.root.querySelector('[data-task-undo]').hidden,false);second.interactions.dispose();
});
test('bulk Archive names its count and rejects stale identities/views or dirty details',async()=>{
 for(const mode of ['owner','plan','view','dirty']){let release,warning;const f=await fixture({confirmArchive:text=>{warning=text;return new Promise(resolve=>release=resolve)}});assert.equal(typeof f.interactions.runTaskBatch,'function');const saving=f.interactions.runTaskBatch('archive',{taskIds:['a','c']});await tick();assert.match(warning,/2/);if(mode==='owner')f.setOwner('other');if(mode==='plan')f.setPlan('other');if(mode==='view')f.setView('focused');if(mode==='dirty')f.allowClose(false);release(true);assert.equal(await saving,false);assert.equal(f.calls.length,0);f.interactions.dispose();}
 const f=await fixture();assert.equal(await f.interactions.runTaskBatch('archive',{taskIds:['a','c']}),true);assert.equal(f.calls.length,1);assert.equal(await f.interactions.undo(),true);assert.ok(f.data().boards[0].sections[0].tasks.every(task=>!task.archived));f.interactions.dispose();
});
test('bulk Move uses captured section orders and appends the visible selected order atomically',async()=>{
 for(const mode of ['source','destination']){const f=await fixture();assert.equal(typeof f.interactions.runTaskBatch,'function');assert.equal(await f.interactions.runTaskBatch('move',{taskIds:['c','a']}),true);const dialog=f.document.querySelector('[data-task-move-dialog]'),select=dialog.querySelector('select');select.querySelector('option:last-child').selected=true;if(mode==='source')f.data().boards[0].sections[0].tasks.reverse();else f.data().boards[0].sections[1].tasks.push({id:'remote',title:'Remote'});dialog.querySelector('[data-move-confirm]').click();await tick();assert.equal(f.calls.length,0);f.interactions.dispose();}
 const f=await fixture();await f.interactions.runTaskBatch('move',{taskIds:['c','a']});const dialog=f.document.querySelector('[data-task-move-dialog]');dialog.querySelector('option:last-child').selected=true;dialog.querySelector('[data-move-confirm]').click();await tick();assert.equal(f.calls.length,1);assert.deepEqual(f.data().boards[0].sections[1].tasks.map(t=>t.id),['a','c']);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['hidden']);assert.equal(await f.interactions.undo(),true);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['a','hidden','c']);f.interactions.dispose();
});
test('bulk mutation cannot outlive its view while dirty-details confirmation is awaiting',async()=>{
 const f=await fixture();let release;f.waitForClose(new Promise(resolve=>release=resolve));const saving=f.interactions.runTaskBatch('archive',{taskIds:['a','c']});await tick();f.setView('other-section');release(true);assert.equal(await saving,false);assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('bulk Move previews roll back as one operation before exact Retry and Undo',async()=>{
 const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));await f.interactions.runTaskBatch('move',{taskIds:['a','c']});const dialog=f.document.querySelector('[data-task-move-dialog]');dialog.querySelector('option:last-child').selected=true;dialog.querySelector('[data-move-confirm]').click();await tick();assert.deepEqual(f.interactions.getDisplayState().boards[0].sections[1].tasks.map(t=>t.id),['a','c']);assert.equal(f.data().boards[0].sections[1].tasks.length,0);f.setFail(true);release();await tick();assert.deepEqual(f.interactions.getDisplayState().boards[0].sections[0].tasks.map(t=>t.id),['a','hidden','c']);f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(await f.interactions.undo(),true);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['a','hidden','c']);f.interactions.dispose();
});
test('real selection toolbar and menu dispatch one batch and keep selection controls usable during recovery',async()=>{
 const f=await fixture({preserveOverview:true}),{mountTaskSelection}=await import('../task-selection.js'),{createTaskActions}=await import('../task-actions.js'),{mountTaskActionMenu}=await import('../task-action-menu.js'),{taskListLocation}=await import('../task-list-model.js');
 const getIdentity=()=>({ownerId:'one',planId:'plan'}),resolveTarget=target=>taskListLocation(f.data(),target.taskId),selection=mountTaskSelection({root:f.root,document:f.document,window:f.window,getIdentity,getViewKey:()=> 'overview',resolveTarget});
 const actions=createTaskActions({selection,getIdentity,resolveTarget,getInteractionState:f.interactions.getActionState,runTaskBatch:f.interactions.runTaskBatch});const menu=mountTaskActionMenu({root:f.root,document:f.document,window:f.window,actions,getIdentity,getContext:(found,options)=>selection.contextFor(found.taskId,options),resolveRow:el=>{const row=el.closest?.('[data-detail-row]');return row?{row,taskId:row.dataset.detailRow}:null}});selection.setActions(actions,menu.open);selection.toggle('a');selection.toggle('c');f.setFail(true);f.root.querySelector('[data-selection-action="bulk-complete"]').click();await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].command.type,'task_batch');assert.deepEqual(f.calls[0].command.taskIds,['a','c']);
 selection.sync();assert.equal(f.root.querySelector('[data-selection-action="bulk-complete"]').disabled,true);f.root.querySelector('[data-selection-action="more"]').click();assert.equal(f.document.querySelector('[data-task-menu-action="bulk-archive"]').getAttribute('aria-disabled'),'true');menu.close();f.root.querySelector('[data-selection-action="clear"]').click();assert.deepEqual(selection.ids(),[]);f.setFail(false);assert.equal(await f.interactions.retry(),true);menu.dispose();selection.dispose();f.interactions.dispose();
});
test('moved preview editors wait for confirmation and uncertain Move recovery before accepting inline edits',async()=>{
 for(const failed of [false,true]){
  const f=await fixture({preserveOverview:true});let release;f.block(new Promise(resolve=>release=resolve));await f.interactions.runTaskBatch('move',{taskIds:['a','c']});const dialog=f.document.querySelector('[data-task-move-dialog]');dialog.querySelector('option:last-child').selected=true;dialog.querySelector('[data-move-confirm]').click();await tick();
  const editor=id=>f.root.querySelector('[data-detail-row="'+id+'"] .task-text'),date=id=>f.root.querySelector('[data-detail-row="'+id+'"] .task-date-input');assert.equal(editor('a').dataset.section,'empty');assert.equal(editor('a').disabled,true);assert.equal(date('a').disabled,true);assert.equal(editor('hidden').disabled,false);assert.equal(f.data().boards[0].sections[0].tasks[0].title,'Same');
  f.setFail(failed);release();await tick();if(failed){assert.equal(editor('a').dataset.section,'s');assert.equal(editor('a').disabled,true);f.setFail(false);assert.equal(await f.interactions.retry(),true)}assert.equal(editor('a').disabled,false);assert.equal(date('a').disabled,false);f.interactions.dispose();
 }
});
test('task tools duplicate once and field dialogs keep captured values across edits and identity changes',async()=>{
 const f=await fixture();assert.equal(typeof f.interactions.runTaskTool,'function');assert.equal(await f.interactions.runTaskTool('duplicate',{taskIds:['a','c']}),true);assert.equal(f.data().boards[0].sections[0].tasks.length,5);assert.equal(f.calls.length,1);
 assert.equal(await f.interactions.runTaskTool('set-priority',{taskIds:['a','c']}),true);let dialog=f.document.querySelector('[data-task-field-dialog]');dialog.querySelector('option[value="high"]').selected=true;dialog.querySelector('form').dispatchEvent(new f.window.Event('submit',{cancelable:true}));await tick();assert.equal(f.calls.length,2);assert.equal(f.data().boards[0].sections[0].tasks[0].priority,'high');assert.equal(await f.interactions.undo(),true);assert.equal(f.data().boards[0].sections[0].tasks[0].priority,null);
 await f.interactions.runTaskTool('set-dueDate',{taskIds:['a','c']});dialog=f.document.querySelector('[data-task-field-dialog]');f.setPlan('other');f.interactions.sync();assert.ok(!f.document.querySelector('[data-task-field-dialog]'));assert.equal(f.calls.length,3);f.interactions.dispose();
});
test('field tools dismiss when the task view changes before submission',async()=>{
 const f=await fixture();await f.interactions.runTaskTool('set-priority',{taskIds:['a','c']});assert.ok(f.document.querySelector('[data-task-field-dialog]'));f.setView('other');f.interactions.sync();assert.ok(!f.document.querySelector('[data-task-field-dialog]'));assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('selected grip drags one ordered group with count, Retry and one Undo',async()=>{
 const f=await fixture({getSelectedTaskIds:()=>['c','a']}),destination=f.root.querySelector('[data-section-id="empty"]');f.document.elementFromPoint=()=>destination;f.scroll.getBoundingClientRect=()=>({top:0,bottom:400});f.setFail(true);f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:80});assert.match(f.document.querySelector('[data-task-drag-count]')?.textContent||'',/2/);f.pointer('pointerup',f.root,{clientY:80});await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].command.type,'task_batch');assert.deepEqual(f.calls[0].command.taskIds,['a','c']);assert.ok(!f.document.querySelector('[data-task-drag-count]'));f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(await f.interactions.undo(),true);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['a','hidden','c']);f.interactions.dispose();
});
test('group drag cancels on selected anchors, Escape, outside and sorted changes',async()=>{
 for(const mode of ['selected','escape','outside','sorted']){const f=await fixture({getSelectedTaskIds:()=>['a','c']}),target=mode==='selected'?f.control('c','drag').closest('[data-detail-row]'):f.root.querySelector('[data-section-id="empty"]');f.document.elementFromPoint=()=>target;f.scroll.getBoundingClientRect=()=>({top:0,bottom:400});f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:80});if(mode==='escape'){const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Escape';f.control('a','drag').dispatchEvent(event)}if(mode==='outside')f.document.elementFromPoint=()=>f.document.getElementById('chat');if(mode==='sorted')f.setSorted(true);f.pointer('pointerup',f.root,{clientY:80});await tick();assert.equal(f.calls.length,0);assert.ok(!f.document.querySelector('[data-task-drag-count]'));f.interactions.dispose();}
});
test('keyboard reorder follows visible anchors in full model order and Undo restores it',async()=>{
  const f=await fixture();assert.ok(f.interactions.getActionState({taskId:'c'}).canMoveUp);f.scroll.scrollTop=180;void f.interactions.runTaskAction('up',{taskId:'c'});await tick();assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['c','a','hidden']);assert.equal(f.scroll.scrollTop,180);assert.equal(f.focused()?.closest('[data-detail-row]').dataset.detailRow,'c');
  assert.equal(f.root.querySelector('[data-task-undo]').hidden,false);assert.equal(await f.interactions.undo(),true);assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['a','hidden','c']);f.interactions.dispose();
});
test('Tasks completion/archive execute once and offer Undo only after confirmed persistence',async()=>{
  const f=await fixture();let legacy=0;f.document.body.addEventListener('change',()=>legacy++);f.document.body.addEventListener('click',e=>{if(e.target.closest('.task-delete-btn'))legacy++});
  const check=f.root.querySelector('[data-detail-row="a"] [data-task-list-complete]');assert.ok(check);check.checked=true;check.dispatchEvent(new f.window.Event('change',{bubbles:true}));await tick();assert.equal(legacy,0);assert.equal(f.calls.length,1);assert.equal(f.confirmations.length,1);assert.equal(await f.interactions.undo(),true);
  f.setFail(true);void f.interactions.runTaskAction('archive',{taskId:'a'});await tick();assert.equal(f.root.querySelector('[data-task-undo]').hidden,true);assert.equal(legacy,0);f.interactions.dispose();
});
test('expired Undo and a newer affected-field edit never overwrite state',async()=>{
  const f=await fixture();await f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});f.advance(10001);assert.equal(await f.interactions.undo(),false);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);assert.doesNotMatch(f.root.querySelector('[data-task-order-status] [role="status"]').textContent,/Undo is available/);
  await f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:false},{boardId:'b',sectionId:'s',value:true});f.data().boards[0].sections[0].tasks[0].completed=true;assert.equal(await f.interactions.undo(),false);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);f.interactions.dispose();
});
test('uncertain reorder retries the same receipt without applying twice',async()=>{
  const store=await plannerFixture(initial(),{failAfterCommit:true});store.context.applyTaskListCommand=applyTaskListCommand;
  const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;
  const f=await fixture({persist});const command={type:'reorder_tasks',target:{boardId:'b',sectionId:'s'},taskIds:['c','a','hidden']},expected={boardId:'b',sectionId:'s',order:['a','hidden','c']};
  assert.equal(await f.interactions.execute(command,expected),false);assert.equal(f.root.querySelector('[data-task-undo]').hidden,true);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(store.writes.length,1);f.interactions.dispose();
});
test('pointer drag uses grip and full-order insertion line; Escape cancels without saving',async()=>{
  const f=await fixture(),row=f.control('a','drag')?.closest('[data-detail-row]');assert.ok(row);const c=f.control('c','drag').closest('[data-detail-row]');c.getBoundingClientRect=()=>({top:100,bottom:140,height:40});f.document.elementFromPoint=()=>c;f.scroll.getBoundingClientRect=()=>({top:0,bottom:500});
  f.pointer('pointerdown',row.querySelector('.task-text'));f.pointer('pointermove',f.root,{clientY:139});f.pointer('pointerup',f.root,{clientY:139});await tick();assert.equal(f.calls.length,0);
  f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:139});assert.ok(c.classList.contains('task-drop-after'));const escape=new f.window.Event('keydown',{bubbles:true});escape.key='Escape';f.root.dispatchEvent(escape);f.pointer('pointerup',f.root,{clientY:139});await tick();assert.equal(f.calls.length,0);assert.equal(c.classList.contains('task-drop-after'),false);
  f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:139});f.pointer('pointerup',f.root,{clientY:139});await tick();assert.deepEqual(f.data().boards[0].sections[0].tasks.map(t=>t.id),['hidden','c','a']);f.interactions.dispose();
});
test('drag into an empty section and edge auto-scroll preserve explicit destination',async()=>{
  const f=await fixture(),empty=f.root.querySelector('[data-section-id="empty"]');f.document.elementFromPoint=()=>empty;f.scroll.scrollTop=0;f.scroll.getBoundingClientRect=()=>({top:0,bottom:300});
  f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:295});f.frame();assert.ok(f.scroll.scrollTop>0);f.pointer('pointerup',f.root,{clientY:295});await tick();assert.equal(f.data().boards[0].sections[1].tasks[0].id,'a');assert.equal(f.calls[0].command.destination.sectionId,'empty');f.interactions.dispose();
});
test('Move dialog distinguishes duplicate section labels and escapes user text',async()=>{
  const f=await fixture();f.data().boards[0].title='<img src=x>';void f.interactions.runTaskAction('move',{taskId:'a'});await tick();const dialog=f.document.querySelector('[data-task-move-dialog]');assert.ok(dialog);assert.equal(dialog.querySelector('img'),null);const select=dialog.querySelector('select');select.querySelector('option').selected=true;dialog.querySelector('[data-move-confirm]').click();await tick();assert.equal(f.data().boards[0].sections[1].tasks[0].id,'a');f.interactions.dispose();
});
test('account/navigation changes and sorted views cancel drag without stealing focus or saving',async()=>{
  const f=await fixture();f.setSorted(true);f.interactions.decorate();assert.equal(f.control('a','drag').disabled,true);assert.equal(f.interactions.getActionState({taskId:'c'}).sorted,true);f.setSorted(false);f.interactions.decorate();
  f.pointer('pointerdown',f.control('a','drag'));f.setOwner('two');f.interactions.sync();f.pointer('pointerup',f.root,{clientY:100});assert.equal(f.calls.length,0);
  const chat=f.document.getElementById('chat'),event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='ArrowUp';event.altKey=true;chat.dispatchEvent(event);assert.equal(event.defaultPrevented,false);f.interactions.dispose();
});
test('uncertain commands survive reload and explicit discard unlocks controls safely',async()=>{
  const f=await fixture();f.setFail(true);void f.interactions.runTaskAction('up',{taskId:'c'});await tick();assert.ok([...f.storage.values()].some(value=>value.includes('reorder_tasks')));assert.equal(f.control('a','drag').disabled,true);assert.equal(await f.interactions.discard(),true);assert.equal(f.control('a','drag').disabled,false);assert.equal(f.data().boards[0].sections[0].tasks[0].id,'a');f.interactions.dispose();
});
test('release outside the list cancels a formerly valid drop',async()=>{
  const f=await fixture(),c=f.control('c','drag').closest('[data-detail-row]');c.getBoundingClientRect=()=>({top:100,height:40});f.scroll.getBoundingClientRect=()=>({top:0,bottom:400});f.document.elementFromPoint=()=>c;
  f.pointer('pointerdown',f.control('a','drag'));f.pointer('pointermove',f.root,{clientY:130});f.document.elementFromPoint=()=>f.document.getElementById('chat');f.pointer('pointerup',f.root,{clientY:450});await tick();assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('a remounted pending action reconciles the original receipt and inverse',async()=>{
  const store=await plannerFixture(initial(),{failAfterCommit:true});store.context.applyTaskListCommand=applyTaskListCommand;
  const persist=async(c,e,id)=>store.context.persistTaskListCommand('plan','one',c,e,id.operationId,id.createdAt);persist.data=store.data;
  const first=await fixture({persist});void first.interactions.runTaskAction('up',{taskId:'c'});await tick();const original=first.calls[0];first.interactions.dispose();
  const second=await fixture({persist,savedStorage:first.storage});assert.equal(await second.interactions.retry(),true);assert.deepEqual(second.calls[0],original);assert.equal(store.writes.length,1);assert.equal(second.root.querySelector('[data-task-undo]').hidden,false);second.interactions.dispose();
});
test('archive and cross-section moves respect an unsaved detail draft',async()=>{
  const f=await fixture();f.allowClose(false);void f.interactions.runTaskAction('archive',{taskId:'a'});await tick();assert.equal(f.calls.length,0);
  assert.equal(await f.interactions.execute({type:'move_task',target:{taskId:'a'},destination:{boardId:'b',sectionId:'empty',index:0}},{boardId:'b',sectionId:'s',sourceOrder:['a','hidden','c'],destinationOrder:[]}),false);assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('recurring series keep occurrence completion and date edits in Schedule',async()=>{
  const f=await fixture();f.data().boards[0].sections[0].tasks[0].recurrence={enabled:true};f.refresh();const row=f.control('a','drag').closest('[data-detail-row]');assert.equal(row.querySelector('[data-task-list-complete]').disabled,true);assert.equal(row.querySelector('.task-date-input').disabled,true);assert.equal(f.control('a','drag').disabled,false);f.interactions.dispose();
});
test('Retry respects a newly opened dirty detail draft and keeps its original identity',async()=>{
  const f=await fixture();f.setFail(true);await f.interactions.execute({type:'archive_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});f.setFail(false);f.allowClose(false);assert.equal(await f.interactions.retry(),false);assert.equal(f.calls.length,1);assert.equal(f.data().boards[0].sections[0].tasks[0].archived,undefined);f.allowClose(true);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);f.interactions.dispose();
});
test('a planner switch while awaiting draft confirmation cannot receive the old action',async()=>{
  const f=await fixture();let release;f.waitForClose(new Promise(resolve=>release=resolve));const saving=f.interactions.execute({type:'archive_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();f.setPlan('replacement');release(true);assert.equal(await saving,false);assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('slow save preserves another overview title draft, caret and subsequent focus/scroll',async()=>{
  const f=await fixture({preserveOverview:true});f.control('a','drag').focus();f.scroll.scrollTop=180;let release;f.block(new Promise(resolve=>release=resolve));const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();
  const title=f.control('c','drag').closest('[data-detail-row]').querySelector('.task-text');title.focus();title.value='New unsaved title';title.setSelectionRange(3,6);f.scroll.scrollTop=420;release();await saving;
  const fresh=f.control('c','drag').closest('[data-detail-row]').querySelector('.task-text');assert.equal(fresh.value,'New unsaved title');assert.ok(f.document.activeElement===fresh);assert.equal(fresh.selectionStart,3);assert.equal(fresh.selectionEnd,6);assert.equal(f.scroll.scrollTop,420);f.interactions.dispose();
});
test('grip establishes Tasks focus so Escape cancels even after outside focus',async()=>{
  const f=await fixture();f.document.getElementById('chat').focus();const c=f.control('c','drag').closest('[data-detail-row]');c.getBoundingClientRect=()=>({top:100,height:40});f.scroll.getBoundingClientRect=()=>({top:0,bottom:400});f.document.elementFromPoint=()=>c;
  const grip=f.control('a','drag');f.pointer('pointerdown',grip);assert.ok(f.document.activeElement===grip);f.pointer('pointermove',f.root,{clientY:130});const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';f.document.activeElement.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);f.pointer('pointerup',f.root,{clientY:130});await tick();assert.equal(f.calls.length,0);f.interactions.dispose();
});
test('a rejected old planner action cannot unlock a new planner save in flight',async()=>{
  const f=await fixture();let oldRelease;f.waitForClose(new Promise(resolve=>oldRelease=resolve));const old=f.interactions.execute({type:'archive_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();f.setPlan('replacement');f.interactions.sync();f.waitForClose(null);let newRelease;f.block(new Promise(resolve=>newRelease=resolve));const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();oldRelease(true);assert.equal(await old,false);
  try{assert.equal(f.root.querySelector('[data-task-retry]').disabled,true)}finally{newRelease();await saving;f.interactions.dispose()}
});
test('initial planner creation is explicit while switches during ensure are rejected',async()=>{
  const f=await fixture();f.setPlan(null);f.interactions.sync();f.setEnsurePlan(async()=>{f.setPlan('plan-one');return 'plan-one'});assert.equal(await f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false}),true);assert.equal(f.calls[0].identity.planId,'plan-one');
  let release;f.setEnsurePlan(()=>new Promise(resolve=>release=resolve));const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:false},{boardId:'b',sectionId:'s',value:true});await tick();f.setPlan('replacement');release(true);assert.equal(await saving,false);assert.equal(f.calls.length,1);f.interactions.dispose();
});
test('duplicate Move destination labels show visible board and section positions',async()=>{
  const f=await fixture();f.data().boards[0].sections.push({id:'empty2',title:'Same',tasks:[]});f.refresh();void f.interactions.runTaskAction('move',{taskId:'a'});await tick();const dialog=f.document.querySelector('[data-task-move-dialog]'),options=[...dialog.querySelectorAll('option')];assert.equal(options.length,2);assert.notEqual(options[0].textContent,options[1].textContent);assert.match(options[0].textContent,/Board 1.*Section 2/);assert.match(options[1].textContent,/Board 1.*Section 3/);options[1].selected=true;dialog.querySelector('[data-move-confirm]').click();await tick();assert.equal(f.data().boards[0].sections[2].tasks[0].id,'a');f.interactions.dispose();
});

test('slow completion previews immediately without changing canonical data or awarding early',async()=>{
  const f=await fixture({preserveOverview:true});let release;f.block(new Promise(resolve=>release=resolve));
  const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();
  assert.equal(f.data().boards[0].sections[0].tasks[0].completed,false);
  assert.equal(f.root.querySelector('[data-detail-row="a"]').classList.contains('completed'),true);
  assert.equal(f.confirmations.length,0);assert.equal(f.root.querySelector('[data-task-undo]').hidden,true);
  f.data().boards[0].sections[0].tasks[0].title='Edited while saving';f.refresh();
  assert.equal(f.root.querySelector('[data-detail-row="a"] .task-text').value,'Edited while saving');
  release();assert.equal(await saving,true);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,true);assert.equal(f.confirmations.length,1);f.interactions.dispose();
});
test('slow reorder previews, rolls back on failure and retries the original operation',async()=>{
  const f=await fixture({preserveOverview:true});let release;f.block(new Promise(resolve=>release=resolve));f.setFail(true);
  const command={type:'reorder_tasks',target:{boardId:'b',sectionId:'s',taskId:'c'},taskIds:['c','a','hidden']},expected={boardId:'b',sectionId:'s',order:['a','hidden','c']};
  const saving=f.interactions.execute(command,expected);await tick();
  assert.equal(f.root.querySelector('[data-detail-row]').dataset.detailRow,'c');assert.equal(f.data().boards[0].sections[0].tasks[0].id,'a');
  assert.equal(await f.interactions.execute(command,expected),false);assert.equal(f.calls.length,1);
  release();assert.equal(await saving,false);assert.equal(f.root.querySelector('[data-detail-row]').dataset.detailRow,'a');assert.equal(f.root.querySelector('[data-task-undo]').hidden,true);
  f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.root.querySelector('[data-detail-row]').dataset.detailRow,'c');f.interactions.dispose();
});
test('failed completion clears the preview without overwriting unrelated edits',async()=>{
  const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));f.setFail(true);
  const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();
  assert.equal(f.root.querySelector('[data-detail-row="a"]').classList.contains('completed'),true);
  f.data().boards[0].sections[0].tasks[0].title='New title';release();assert.equal(await saving,false);
  assert.equal(f.root.querySelector('[data-detail-row="a"]').classList.contains('completed'),false);assert.equal(f.data().boards[0].sections[0].tasks[0].title,'New title');assert.equal(f.confirmations.length,0);f.interactions.dispose();
});
test('a preview never crosses account or planner boundaries',async()=>{
  const f=await fixture();let release;f.block(new Promise(resolve=>release=resolve));
  const saving=f.interactions.execute({type:'complete_task',target:{taskId:'a'},value:true},{boardId:'b',sectionId:'s',value:false});await tick();
  f.setPlan('replacement');assert.equal(f.interactions.getDisplayState().boards[0].sections[0].tasks[0].completed,false);f.setPlan('plan');f.setOwner('other');assert.equal(f.interactions.getDisplayState().boards[0].sections[0].tasks[0].completed,false);f.interactions.sync();f.setFail(true);release();await saving;assert.equal(f.confirmations.length,0);f.interactions.dispose();
});

test('global recovery clear releases matching task interactions without replaying',async()=>{
 const f=await fixture();f.setFail(true);await f.interactions.runTaskAction('complete',{taskId:'a'});const identity=f.calls[0].identity;
 f.interactions.resolveRecovery({...identity,planId:'other'},'discarded');assert.equal(f.interactions.getActionState({taskId:'a'}).pending,true);
 f.interactions.resolveRecovery(identity,'discarded');assert.equal(f.interactions.getActionState({taskId:'a'}).pending,false);assert.equal(f.data().boards[0].sections[0].tasks[0].completed,false);assert.equal(f.calls.length,1);f.interactions.dispose();
});
