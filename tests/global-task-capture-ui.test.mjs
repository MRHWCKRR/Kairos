import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {mountTaskCapture} from '../task-capture.js';
import {enhanceSelects} from '../ui-selects.js';
const tick=()=>new Promise(setImmediate);
function fixture({memory=new Map(),commit=async()=>({}),failStorage=false}={}){
 const {document,window}=parseHTML('<html><body><button data-task-capture-open>New task</button><textarea id="other-draft">Keep my notes</textarea></body></html>');
 let identity={ownerId:'one',planId:'p'},data={boards:[{id:'b',title:'Board',sections:[{id:'s',title:'Section',tasks:[]}]}]},calls=[];
 const storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>{if(failStorage)throw Error('Storage denied');memory.set(key,value)},removeItem:key=>memory.delete(key)};
 const controller=mountTaskCapture({document,window,getIdentity:()=>identity,getState:()=>data,storage,uuid:(()=>{let n=0;return()=>String(++n)})(),now:()=>1000,commit:async(...args)=>{calls.push(structuredClone(args));return commit(...args)},confirmClear:async()=>true});
 const input=(name,value)=>{const el=document.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}))};
 return {controller,document,window,memory,calls,input,data,setIdentity:value=>{identity=value;controller.sync()}};
}
test('capture stays on the current page, saves one operation and preserves unrelated drafts',async()=>{
 const f=fixture();f.controller.open();f.input('title','  Science  ');f.input('estimatedMinutes','45');await f.controller.submit();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0].task.title,'Science');assert.equal(f.calls[0][0].task.estimatedMinutes,45);assert.equal(f.document.querySelector('#other-draft').textContent,'Keep my notes');assert.equal(f.memory.size,0);
});
test('lost response survives reload and retries the exact operation despite a changed destination',async()=>{
 const f=fixture({commit:async()=>{throw Error('Lost response')}});f.controller.open();f.input('title','Read');await f.controller.submit();const original=f.calls[0];f.controller.dispose();
 const next=fixture({memory:f.memory});next.data.boards=[];next.controller.open();await next.controller.submit();assert.deepEqual(next.calls[0],original);assert.equal(next.memory.size,0);
});
test('repeated submit is blocked and late completion cannot clear a different account',async()=>{
 let release;const f=fixture({commit:()=>new Promise(resolve=>release=resolve)});f.controller.open();f.input('title','Read');const saving=f.controller.submit();await tick();await f.controller.submit();assert.equal(f.calls.length,1);
 f.setIdentity({ownerId:'two',planId:null});release({});await saving;assert.equal(f.memory.size,1);assert.equal(f.document.querySelector('dialog').hasAttribute('open'),false);f.controller.open();assert.equal(f.document.querySelector('[name="boardId"] option').value,'');
});
test('storage failure prevents a write and unavailable or invalid fields cannot submit',async()=>{
 const f=fixture({failStorage:true});f.controller.open();f.input('title','Read');await f.controller.submit();assert.equal(f.calls.length,0);assert.match(f.document.querySelector('[role="status"]').textContent,/recovery/i);
 const other=fixture();other.controller.open();other.input('title','Read');other.input('date','2026-10-25');other.input('dueDate','2026-10-24');await other.controller.submit();assert.equal(other.calls.length,0);
});
test('late success preserves a newer recovery record from another tab',async()=>{
 let release;const f=fixture({commit:()=>new Promise(resolve=>release=resolve)});f.controller.open();f.input('title','First');const saving=f.controller.submit();await tick();
 const [key,value]=[...f.memory][0],newer=JSON.parse(value);newer.identity.operationId='capture-other-tab';newer.command.task.id='other-task';newer.command.task.title='Second';f.memory.set(key,JSON.stringify(newer));
 release({});await saving;assert.equal(JSON.parse(f.memory.get(key)).command.task.title,'Second');f.controller.open();assert.equal(f.document.querySelector('[name="title"]').value,'Second');
});
test('shared select controls follow board changes and lock the failed-save destination',async()=>{
 const f=fixture({commit:async()=>{throw Error('Offline')}});f.data.boards.push({id:'other',title:'Other',sections:[{id:'next',title:'Next',tasks:[]}]});
 f.controller.open();const controls=enhanceSelects({document:f.document,window:f.window}),board=f.document.querySelector('[name="boardId"]');
 for(const option of board.querySelectorAll('option'))option.selected=option.value==='other';board.dispatchEvent(new f.window.Event('change',{bubbles:true}));controls.refresh();
 assert.equal(f.document.querySelector('[name="sectionId"]').value,'next');f.input('title','Read');await f.controller.submit();controls.refresh();assert.equal(controls.controls.get(board).trigger.disabled,true);controls.destroy();f.controller.dispose();
});
test('New task opens centred rather than inheriting the global zero margin reset',()=>{
 const f=fixture(),dialog=f.document.querySelector('dialog');f.window.innerWidth=1200;f.window.innerHeight=800;dialog.getBoundingClientRect=()=>({width:580,height:400,left:0,top:0});
 f.controller.open();assert.equal(dialog.style.left,'310px');assert.equal(dialog.style.top,'200px');assert.equal(dialog.style.margin,'0');f.controller.dispose();
});
