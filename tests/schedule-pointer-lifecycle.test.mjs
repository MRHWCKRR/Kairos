import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
const source=(await readFile(new URL('../schedule-interactions.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture({occurrence=false}={}){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div class="ks-day-column" data-date="2026-10-16"><div class="ks-day-grid"><button class="ks-task-block" data-task-id="t">Task</button></div></div></section></body></html>');Object.defineProperty(document,'readyState',{value:'loading'});
 let owner='one',plan='plan',top=0,saves=0;const task={id:'t',title:'Revision',date:'2026-10-16',startTime:'10:00',endTime:'11:00'},boards=[{id:'b',sections:[{id:'s',tasks:[task]}]}];
 const root=document.querySelector('section'),grid=document.querySelector('.ks-day-grid'),block=document.querySelector('button');grid.getBoundingClientRect=()=>({top,height:1440});document.elementFromPoint=()=>grid;
 if(occurrence){task.recurrence=recurrence.normalizeRecurrence({enabled:true,frequency:'daily',interval:1,startDate:'2026-10-16',mode:'fixed'});delete block.dataset.taskId;block.dataset.occurrenceId='t::2026-10-16';block.dataset.seriesId='t';block.dataset.occurrenceDate='2026-10-16'}
 window.__kairosScheduleInteractionsBooted=false;window.__kairosScheduleBridge={getBoards:()=>boards,getOwnerId:()=>owner,getPlanId:()=>plan,getTimeFormat:()=> '24',persistPlan:async()=>{saves++}};window.__kairosScheduleWorkspace={render(){}};
 const context=vm.createContext({document,window,MutationObserver:window.MutationObserver,...utils,...recurrence,console,structuredClone,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});vm.runInContext(source,context);context.boot();
 const pointer=(type,target,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:20,clientY:660,...props});target.dispatchEvent(event);return event};
 return {document,window,context,root,grid,block,task,pointer,boards,grip:block.querySelector('[data-resize-handle]'),saves:()=>saves,setOwner:v=>owner=v,setPlan:v=>plan=v,scroll:v=>top=v,dragging:()=>vm.runInContext('!!interaction',context)};
}
test('resize uses the final release position even when the last move was delayed',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:665});f.pointer('pointerup',f.document,{clientY:675});await tick();assert.equal(f.task.endTime,'11:15');assert.equal(f.saves(),1);
});
test('resizing follows the grid when the calendar is scrolled during the gesture',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.scroll(-30);f.pointer('pointermove',f.document,{clientY:665});f.pointer('pointerup',f.document,{clientY:665});await tick();assert.equal(f.task.endTime,'11:35');
});
test('horizontal grip movement does not create a redundant schedule save',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientX:50});f.pointer('pointerup',f.document,{clientX:50});await tick();assert.equal(f.saves(),0);assert.equal(f.task.endTime,'11:00');
});
test('an intervening schedule edit cancels the old resize rather than overwriting the new time',async()=>{
 const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:675});f.task.endTime='12:00';f.pointer('pointerup',f.document,{clientY:675});await tick();assert.equal(f.task.endTime,'12:00');assert.equal(f.saves(),0);
});
test('scope changes, focus loss and lost capture cancel schedule gestures without writing',async()=>{
 for(const change of [f=>f.setOwner('other'),f=>f.setPlan('new'),f=>f.root.classList.remove('active'),f=>f.window.dispatchEvent(new f.window.Event('blur')),f=>f.pointer('lostpointercapture',f.block)]){
  const f=fixture();f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:680});change(f);f.pointer('pointerup',f.document,{clientY:680});await tick();assert.equal(f.saves(),0);assert.equal(f.task.endTime,'11:00');assert.equal(f.dragging(),false);
 }
});

test('recurring resize uses five-minute steps and updates only the selected occurrence',async()=>{
 const f=fixture({occurrence:true});f.task.endTime='10:30';f.pointer('pointerdown',f.grip);f.pointer('pointermove',f.document,{clientY:667});f.pointer('pointerup',f.document,{clientY:673});await tick();
 const series=f.boards[0].sections[0].tasks[0],today=recurrence.generateTaskOccurrences(series,'2026-10-16','2026-10-17',{today:'2026-10-16'});assert.equal(today[0].endTime,'10:45');assert.equal(today[0].durationMinutes,45);assert.equal(today[1].endTime,'10:30');assert.equal(f.saves(),1);
});
