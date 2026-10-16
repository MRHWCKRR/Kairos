import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTaskListInteractions} from '../task-list-interactions.js';
import {applyTaskListCommand} from '../task-list-model.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('section Organise button opens shared menu and dispatches reorder once',async()=>{
 const f=await fixture();const {createTaskSectionActions}=await import('../task-section-actions.js'),{mountTaskActionMenu}=await import('../task-action-menu.js');
 const identity=()=>({ownerId:'one',planId:'plan'});
 const actions=createTaskSectionActions({getIdentity:identity,resolveSection:()=>true,getSectionState:f.interactions.getSectionState,runSectionAction:f.interactions.runSectionAction});
 const menu=mountTaskActionMenu({root:f.root,document:f.document,window:f.window,getIdentity:identity,actions:{items:()=>[]},sectionActions:actions,resolveRow:()=>null,resolveSection:el=>{const block=el.closest('.board-section-block');return block?{element:block,section:{boardId:block.dataset.boardId,sectionId:block.dataset.sectionId}}:null}});
 try{f.root.querySelector('[data-section-menu]').click();assert.ok(f.document.querySelector('[data-task-menu-action="section-down"]'));f.document.querySelector('[data-task-menu-action="section-down"]').click();await tick();assert.equal(f.calls.length,1);assert.deepEqual(f.data().boards[0].sections.map(s=>s.id),['q','s'])}finally{menu.dispose();f.interactions.dispose()}
});
async function fixture(){
 const {document,window}=parseHTML('<html><body><main><section class="active" id="tasks"><div id="overview"></div></section></main></body></html>');
 let data={boards:[{id:'b',title:'Board',sections:[{id:'s',title:'One',tasks:[]},{id:'q',title:'Two',tasks:[]}]},{id:'c',title:'Other <script>',sections:[]}]},fail=false,owner='one',view='overview',focused=null,closeWait=null,capturePending=false;
 const root=document.getElementById('tasks'),overview=document.getElementById('overview'),scroll=document.querySelector('main'),calls=[];scroll.scrollTop=130;
 window.HTMLElement.prototype.focus=function(){focused=this};Object.defineProperty(document,'activeElement',{get:()=>focused?.isConnected?focused:document.body});
 let interactions;const refresh=()=>{overview.innerHTML=data.boards.map(b=>`<div class="board-card" data-board-id="${b.id}">${b.sections.map(s=>`<div class="board-section-block" data-board-id="${b.id}" data-section-id="${s.id}"><div class="section-title-row"><h4>${s.title}</h4></div></div>`).join('')}</div>`).join('');interactions?.decorate()};refresh();
 interactions=mountTaskListInteractions({root,scrollElement:scroll,document,window,getState:()=>data,getOwnerId:()=>owner,getPlanId:()=> 'plan',getViewKey:()=>view,sectionBlocked:()=>capturePending,requestCloseDetails:async()=>closeWait??true,refresh,requestFrame:()=>1,cancelFrame:()=>{},storage:{getItem:()=>null,setItem(){},removeItem(){}},commit:async(command,expected,identity)=>{calls.push(structuredClone({command,expected,identity}));if(fail)throw Error('Offline');const out=applyTaskListCommand(data,command,expected);data=out.next;refresh();return out.result}});
 return {interactions,root,document,window,scroll,calls,data:()=>data,setCapturePending:v=>capturePending=v,focused:()=>focused,setFail:v=>fail=v,setOwner:v=>owner=v,setView:v=>view=v,waitForClose:p=>closeWait=p,refresh};
}
test('section controls reorder by keyboard and reuse save, exact Retry and Undo',async()=>{
 const f=await fixture();try{
 const grip=f.root.querySelector('[data-section-drag]');assert.ok(grip,'section grip exists');grip.focus();
 const key=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(key,{key:'ArrowDown',altKey:true});grip.dispatchEvent(key);await tick();
 assert.deepEqual(f.data().boards[0].sections.map(s=>s.id),['q','s']);assert.equal(f.scroll.scrollTop,130);assert.equal(f.focused()?.closest('.board-section-block')?.dataset.sectionId,'s');assert.equal(f.focused()?.hasAttribute('data-section-drag'),true);
 assert.equal(await f.interactions.undo(),true);assert.deepEqual(f.data().boards[0].sections.map(s=>s.id),['s','q']);
 f.setFail(true);assert.equal(await f.interactions.runSectionAction('section-down',{boardId:'b',sectionId:'s'}),false);
 assert.equal(f.root.querySelector('[data-section-drag]').disabled,true);f.setFail(false);assert.equal(await f.interactions.retry(),true);assert.deepEqual(f.calls.at(-1),f.calls.at(-2));
 }finally{f.interactions.dispose()}
});
test('move chooser uses safe labels and moves section to empty board',async()=>{
 const f=await fixture();try{
 assert.equal(typeof f.interactions.runSectionAction,'function');assert.equal(await f.interactions.runSectionAction('section-move',{boardId:'b',sectionId:'s'}),true);
 const dialog=f.document.querySelector('[data-section-move-dialog]');assert.ok(dialog);assert.equal(dialog.querySelector('script'),null);
 dialog.querySelector('[data-section-destination="c"]').click();await tick();assert.equal(f.data().boards[1].sections[0].id,'s');
 await f.interactions.undo();assert.equal(f.data().boards[0].sections[0].id,'s');
 }finally{f.interactions.dispose()}
});
test('section dialog closes on account or view change',async()=>{
 const f=await fixture();try{assert.equal(typeof f.interactions.runSectionAction,'function');await f.interactions.runSectionAction('section-move',{boardId:'b',sectionId:'s'});f.setView('different');f.interactions.decorate();assert.equal(f.document.querySelector('[data-section-move-dialog]'),null)}finally{f.interactions.dispose()}
});

test('section mutation cannot outlive its view while details confirmation is awaiting',async()=>{
 const f=await fixture();try{let release;f.waitForClose(new Promise(resolve=>release=resolve));const saving=f.interactions.runSectionAction('section-down',{boardId:'b',sectionId:'s'});await tick();f.setView('different');release(true);assert.equal(await saving,false);assert.equal(f.calls.length,0)}finally{f.interactions.dispose()}
});
test('pointer reorder, threshold, Escape and outside release never leak writes',async()=>{
 const f=await fixture();try{
 const pointer=(type,target,props={})=>{const event=new f.window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:7,button:0,clientX:10,clientY:10,...props});target.dispatchEvent(event)};
 const grip=()=>f.root.querySelector('[data-section-drag]'),destination=()=>f.root.querySelector('[data-section-id="q"]');
 destination().getBoundingClientRect=()=>({top:50,height:100});f.document.elementFromPoint=()=>destination();
 pointer('pointerdown',grip());pointer('pointermove',f.root,{clientY:12});pointer('pointerup',f.root,{clientY:12});assert.equal(f.calls.length,0);
 pointer('pointerdown',grip());pointer('pointermove',f.root,{clientY:140});const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(escape,{key:'Escape'});f.root.dispatchEvent(escape);pointer('pointerup',f.root,{clientY:140});assert.equal(f.calls.length,0);
 pointer('pointerdown',grip());pointer('pointermove',f.root,{clientY:140});pointer('pointerup',f.root,{clientY:140});await tick();assert.deepEqual(f.data().boards[0].sections.map(s=>s.id),['q','s']);assert.equal(f.calls.length,1);
 f.document.elementFromPoint=()=>null;pointer('pointerdown',grip());pointer('pointermove',f.root,{clientY:140});pointer('pointerup',f.root,{clientY:140});assert.equal(f.calls.length,1);
 }finally{f.interactions.dispose()}
});

test('section Undo and Retry wait for unresolved quick capture',async()=>{
 const f=await fixture();try{
 await f.interactions.runSectionAction('section-down',{boardId:'b',sectionId:'s'});const count=f.calls.length;f.setCapturePending(true);f.interactions.decorate();assert.equal(f.root.querySelector('[data-task-undo]').disabled,true);assert.equal(await f.interactions.undo(),false);assert.equal(f.calls.length,count);f.setCapturePending(false);await f.interactions.undo();
 f.setFail(true);await f.interactions.runSectionAction('section-down',{boardId:'b',sectionId:'s'});f.setCapturePending(true);f.setFail(false);const retries=f.calls.length;assert.equal(await f.interactions.retry(),false);assert.equal(f.calls.length,retries);
 }finally{f.interactions.dispose()}
});
