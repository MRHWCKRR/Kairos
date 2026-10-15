import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const initialRows=()=>['a','b','c','d','e'].map((taskId,i)=>({taskId,boardId:i===4?'other':'board',sectionId:i>2?'second':'first'}));
async function stateFixture(){
 const module=await import('../task-selection.js').catch(()=>({}));assert.equal(typeof module.createTaskSelection,'function');const state=module.createTaskSelection();
 const scope={rows:initialRows(),identity:{ownerId:'u',planId:'p'},viewKey:'overview'};state.sync(scope);return {state,scope};
}
test('plain and modifier selection are distinct, ordered and support cross-board toggles',async()=>{
 const {state:s}=await stateFixture();s.select('c');assert.deepEqual(s.ids(),['c']);s.select('a',{toggle:true});s.select('e',{toggle:true});assert.deepEqual(s.ids(),['a','c','e']);s.select('c',{toggle:true});assert.deepEqual(s.ids(),['a','e']);s.select('b');assert.deepEqual(s.ids(),['b']);
});
test('forward, reverse and additive ranges use a stable same-section anchor',async()=>{
 const {state:s}=await stateFixture();s.select('a');s.select('c',{range:true});assert.deepEqual(s.ids(),['a','b','c']);s.select('b',{range:true});assert.deepEqual(s.ids(),['a','b']);s.select('c');s.select('a',{range:true});assert.deepEqual(s.ids(),['a','b','c']);s.select('e',{toggle:true});s.select('b',{toggle:true});s.select('c',{range:true,add:true});assert.deepEqual(s.ids(),['a','b','c','e']);
});
test('ranges never cross sections or use a removed anchor',async()=>{
 const {state:s,scope}=await stateFixture();s.select('a');s.select('d',{range:true,add:true});assert.deepEqual(s.ids(),['d']);s.select('a');scope.rows=scope.rows.filter(x=>x.taskId!=='a');s.sync(scope);s.select('c',{range:true});assert.deepEqual(s.ids(),['c']);
});
test('refresh prunes unavailable tasks and retains IDs in current traversal order',async()=>{
 const {state:s,scope}=await stateFixture();s.selectAll();scope.rows=[scope.rows[2],scope.rows[0],scope.rows[4]];s.sync(scope);assert.deepEqual(s.ids(),['c','a','e']);s.clear();assert.deepEqual(s.ids(),[]);
});
test('workspace, account, planner changes clear selection and anchor',async()=>{
 for(const field of ['viewKey','ownerId','planId']){const {state:s,scope}=await stateFixture();s.selectAll();if(field==='viewKey')scope.viewKey='focused';else scope.identity={...scope.identity,[field]:'changed'};s.sync(scope);assert.deepEqual(s.ids(),[]);s.select('c',{range:true});assert.deepEqual(s.ids(),['c']);}
});
async function domFixture(){
 const module=await import('../task-selection.js');assert.equal(typeof module.mountTaskSelection,'function');
 const {document,window}=parseHTML('<html><body><section id="tasks" class="active"><div id="rows"><div data-board-id="board" data-section-id="first"><ul>'+['a','b','c'].map(id=>`<li tabindex="0" data-detail-row="${id}"><input class="task-text"><label><input type="checkbox"><span>Complete</span></label><button data-task-action="drag"><svg/></button><button data-task-menu="${id}">Menu</button><span class="space">Space</span></li>`).join('')+'</ul></div><div data-board-id="other" data-section-id="second"><ul><li tabindex="0" data-detail-row="d"><span>Other</span></li></ul></div></div></section><input id="outside"></body></html>');
 let active=document.body,owner='u',plan='p',view='overview',blocked=false;const missing=new Set(),root=document.getElementById('tasks');Object.defineProperty(document,'activeElement',{get:()=>active});window.HTMLElement.prototype.focus=function(){active=this};
 const selection=module.mountTaskSelection({root,document,window,getIdentity:()=>({ownerId:owner,planId:plan}),getViewKey:()=>view,isBlocked:()=>blocked,resolveTarget:({taskId})=>missing.has(taskId)?null:{board:{id:taskId==='d'?'other':'board'},section:{id:taskId==='d'?'second':'first'},task:{id:taskId,title:taskId}}});
 const event=(target,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e},row=id=>root.querySelector(`[data-detail-row="${id}"]`);
 return {root,selection,document,window,event,row,missing,getIdentity:()=>({ownerId:owner,planId:plan}),setBlocked:v=>blocked=v,setOwner:v=>owner=v,setView:v=>view=v};
}
test('mounted gestures implement modifiers while preserving editors, labels, controls and grips',async()=>{
 const f=await domFixture();f.event(f.row('a').querySelector('.space'),'click');f.event(f.row('c'),'click',{shiftKey:true});assert.deepEqual(f.selection.ids(),['a','b','c']);f.event(f.row('d'),'click',{metaKey:true});assert.deepEqual(f.selection.ids(),['a','b','c','d']);
 for(const selector of ['input','label span','button','svg'])f.event(f.row('a').querySelector(selector),'click',{ctrlKey:true});assert.deepEqual(f.selection.ids(),['a','b','c','d']);assert.ok(f.row('a').classList.contains('is-selected'));assert.match(f.root.querySelector('[data-task-selection-count]').textContent,/4/);assert.ok(!f.root.querySelector('[data-task-selection-toolbar]').hidden);f.selection.dispose();
});
test('workspace select-all and Escape respect editor focus and higher-priority surfaces',async()=>{
 const f=await domFixture();const input=f.row('a').querySelector('input');assert.equal(f.event(input,'keydown',{key:'a',ctrlKey:true}).defaultPrevented,false);assert.equal(f.event(f.document.getElementById('outside'),'keydown',{key:'a',ctrlKey:true}).defaultPrevented,false);
 assert.equal(f.event(f.row('a'),'keydown',{key:'a',ctrlKey:true}).defaultPrevented,true);assert.deepEqual(f.selection.ids(),['a','b','c','d']);f.setBlocked(true);f.event(f.row('a'),'keydown',{key:'Escape'});assert.equal(f.selection.ids().length,4);f.setBlocked(false);f.event(f.row('a'),'keydown',{key:'Escape'});assert.deepEqual(f.selection.ids(),[]);f.selection.dispose();
});
test('DOM reconciliation prunes hidden ancestors, unavailable canonical tasks and changed scopes',async()=>{
 const f=await domFixture();f.event(f.row('a'),'keydown',{key:'a',metaKey:true});f.row('b').hidden=true;f.row('d').parentElement.hidden=true;f.missing.add('c');f.selection.sync();assert.deepEqual(f.selection.ids(),['a']);
 const clone=f.row('a').cloneNode(true);f.row('a').replaceWith(clone);f.selection.sync();assert.ok(clone.classList.contains('is-selected'));f.setView('focused');f.selection.sync();assert.deepEqual(f.selection.ids(),[]);f.event(clone,'click');f.setOwner('other');f.selection.sync();assert.deepEqual(f.selection.ids(),[]);f.selection.dispose();assert.ok(!f.root.querySelector('[data-task-selection-toolbar]'));f.event(clone,'click');assert.deepEqual(f.selection.ids(),[]);
});
test('keyboard select-all works from row menu buttons and Escape clears from toolbar controls',async()=>{
 const f=await domFixture();f.event(f.row('a').querySelector('[data-task-menu]'),'keydown',{key:'a',ctrlKey:true});assert.equal(f.selection.ids().length,4);f.event(f.root.querySelector('[data-selection-action="clear"]'),'keydown',{key:'Escape'});assert.deepEqual(f.selection.ids(),[]);f.selection.dispose();
});
test('completion-checkbox focus supports task selection shortcuts without changing completion',async()=>{
 const f=await domFixture(),check=f.row('a').querySelector('[type="checkbox"]');check.focus();check.checked=false;
 assert.equal(f.event(check,'keydown',{key:'a',ctrlKey:true}).defaultPrevented,true);assert.deepEqual(f.selection.ids(),['a','b','c','d']);assert.equal(check.checked,false);
 f.setBlocked(true);f.event(check,'keydown',{key:'Escape'});assert.equal(f.selection.ids().length,4);f.setBlocked(false);assert.equal(f.event(check,'keydown',{key:'Escape'}).defaultPrevented,true);assert.deepEqual(f.selection.ids(),[]);assert.equal(check.checked,false);
 assert.equal(f.event(check,'keydown',{key:'a',metaKey:true}).defaultPrevented,true);assert.equal(f.selection.ids().length,4);f.selection.dispose();
});
async function menusFixture(){
 const f=await domFixture(),{createTaskActions}=await import('../task-actions.js'),{mountTaskActionMenu}=await import('../task-action-menu.js');const copies=[],mutations=[];
 const actions=createTaskActions({selection:f.selection,getIdentity:f.getIdentity,resolveTarget:({taskId})=>f.missing.has(taskId)?null:{task:{id:taskId,title:'Title '+taskId},board:{id:'board'},section:{id:'first'}},getInteractionState:()=>({canMoveUp:true,canMoveDown:true}),runTaskAction:async(...args)=>mutations.push(args),copyText:async text=>copies.push(text),openDetails:async()=>true});
 const menu=mountTaskActionMenu({root:f.root,document:f.document,window:f.window,actions,getIdentity:f.getIdentity,getContext:(found,options)=>f.selection.contextFor(found.taskId,options),getLabel:context=>context.taskIds.length+' tasks selected',resolveRow:element=>{const row=element.closest?.('[data-detail-row]');return row?{row,taskId:row.dataset.detailRow}:null}});f.selection.setActions(actions,menu.open);
 return {...f,actions,menu,copies,mutations};
}
test('selected right-click retains the set and copies titles in traversal order without bulk mutations',async()=>{
 const f=await menusFixture();f.event(f.row('c'),'click');f.event(f.row('a'),'click',{ctrlKey:true});f.event(f.row('c'),'contextmenu',{clientX:10,clientY:10});assert.deepEqual(f.selection.ids(),['a','c']);const popup=f.document.querySelector('[data-task-action-menu]');assert.ok(popup);assert.equal(popup.getAttribute('aria-label'),'2 tasks selected');assert.match(popup.textContent,/2 tasks selected/);
 const context=f.selection.contextFor('c');assert.equal(await f.actions.invoke('complete',context),false);assert.equal(f.mutations.length,0);f.event(popup.querySelector('[data-task-menu-action="copy-titles"]'),'click');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(f.copies,['Title a\nTitle c']);f.menu.dispose();f.selection.dispose();
});
test('unselected right-click replaces selection; native editors retain it; menu supports Select/Deselect',async()=>{
 const f=await menusFixture();f.event(f.row('a'),'click');f.event(f.row('c'),'click',{ctrlKey:true});f.event(f.row('b').querySelector('input'),'contextmenu');assert.deepEqual(f.selection.ids(),['a','c']);f.event(f.row('b'),'contextmenu');assert.deepEqual(f.selection.ids(),['b']);
 const item=f.document.querySelector('[data-task-menu-action="select"]');assert.ok(item);assert.match(item.textContent,/Deselect/);assert.equal(item.getAttribute('aria-checked'),'true');f.event(item,'click');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(f.selection.ids(),[]);
 f.event(f.row('a').querySelector('[data-task-menu]'),'click');const select=f.document.querySelector('[data-task-menu-action="select"]');assert.match(select.textContent,/Select/);f.event(select,'click');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(f.selection.ids(),['a']);f.menu.dispose();f.selection.dispose();
});
test('toolbar More opens the selected count and stale copy contexts cannot cross account or removed targets',async()=>{
 const f=await menusFixture();f.event(f.row('a'),'keydown',{key:'a',ctrlKey:true});f.event(f.root.querySelector('[data-selection-action="more"]'),'click');assert.equal(f.document.querySelector('[data-task-action-menu]').getAttribute('aria-label'),'4 tasks selected');
 const old=f.selection.contextFor('a');f.missing.add('c');assert.equal(await f.actions.invoke('copy-titles',old),false);assert.equal(f.copies.length,0);f.missing.clear();f.setOwner('changed');f.selection.sync();assert.equal(await f.actions.invoke('copy-titles',old),false);f.menu.dispose();f.selection.dispose();
});
test('real section navigation, completed filtering and overview collapse reconcile one selection owner',async()=>{
 const {mountTaskListWorkspace,renderTaskListRow}=await import('../task-list-workspace.js'),{mountTaskSelection}=await import('../task-selection.js'),{taskListLocation}=await import('../task-list-model.js');
 const {document,window}=parseHTML('<html><body><main><section id="tasks" class="active"><div id="overview"></div></section></main></body></html>');window.HTMLElement.prototype.focus=function(){};
 const root=document.getElementById('tasks'),overview=document.getElementById('overview'),data={boards:[{id:'board',title:'Board',sections:[{id:'first',title:'Section',tasks:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C',completed:true}]}]}]};let selection;
 const renderOverview=()=>{workspace.replaceOverview('<div class="board-section-block" data-board-id="board" data-section-id="first"><div class="section-title-row"></div><ul class="task-list">'+data.boards[0].sections[0].tasks.map(task=>renderTaskListRow(task,'first')).join('')+'</ul></div>');workspace.decorateOverview()};
 const workspace=mountTaskListWorkspace({root,overview,document,window,getState:()=>data,getOwnerId:()=> 'u',getPlanId:()=> 'p',renderOverview,onRender:()=>selection?.sync()});renderOverview();
 selection=mountTaskSelection({root,document,window,getIdentity:()=>({ownerId:'u',planId:'p'}),getViewKey:workspace.getViewKey,resolveTarget:target=>taskListLocation(data,target.taskId)});
 selection.toggle('a');selection.toggle('c');await workspace.openSection({boardId:'board',sectionId:'first'});assert.deepEqual(selection.ids(),[]);selection.toggle('a');selection.toggle('c');root.querySelector('[data-show-completed]').click();assert.deepEqual(selection.ids(),['a']);
 await workspace.back();assert.deepEqual(selection.ids(),[]);selection.toggle('b');overview.querySelector('[data-section-collapse]').click();assert.deepEqual(selection.ids(),[]);
 overview.querySelector('[data-section-collapse]').click();assert.equal(typeof selection.selectSection,'function');selection.selectSection({boardId:'board',sectionId:'first'});assert.deepEqual(selection.ids(),['a','b','c']);assert.equal(typeof workspace.collapseSection,'function');await workspace.collapseSection({boardId:'board',sectionId:'first'});assert.deepEqual(selection.ids(),[]);assert.equal(typeof workspace.addTask,'function');await workspace.addTask({boardId:'board',sectionId:'first'});assert.equal(workspace.isFocused(),true);selection.dispose();workspace.dispose();
});
