import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {mountTodayView} from '../today-view.js';import {createMutationSession} from '../mutation-session.js';import {applyTaskListCommand} from '../task-list-model.js';
const tick=()=>new Promise(setImmediate);
test('Today journey: plan unscheduled work, complete it, reload and recover an unconfirmed action',async()=>{
 const {document,window}=parseHTML('<html><body><section id="today"></section></body></html>');const memory=new Map();
 let data={boards:[{id:'b',title:'School',sections:[{id:'s',title:'Work',tasks:[{id:'t',title:'<img src=x onerror=alert(1)>',date:null,archived:false,completed:false}]}]}]},fail=true,operations=new Map(),calls=[];
 const session=createMutationSession({getIdentity:()=>({ownerId:'one',planId:'p'}),storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},commit:async(c,e,id)=>{calls.push(id.operationId);let result=operations.get(id.operationId);if(!result){const next=applyTaskListCommand(data,c,e);data=next.next;result=next.result;operations.set(id.operationId,result);}if(fail){fail=false;throw Error('Lost acknowledgement');}return result;}});
 const options={root:document.querySelector('#today'),document,window,getState:()=>data,getIdentity:()=>({ownerId:'one',planId:'p'}),getToday:()=> '2026-10-25',session,onOpen:()=>true,onCapture:()=>true};
 let view=mountTodayView(options);assert.equal(document.querySelectorAll('img').length,0);document.querySelector('[data-today-action="plan"]').click();await tick();assert.equal(memory.size,1);assert.match(document.querySelector('[data-mutation-message]').textContent,/Retry/);
 view.dispose();view=mountTodayView(options);document.querySelector('[data-mutation-retry]').click();await tick();assert.equal(calls[0],calls[1]);assert.equal(memory.size,0);
 document.querySelector('[data-today-action="complete"]').click();await tick();assert.equal(data.boards[0].sections[0].tasks[0].completed,true);assert.equal(document.querySelectorAll('[data-today-row]').length,0);view.dispose();
});

