import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import * as utils from '../../schedule-utils.js';
import * as recurrence from '../../recurrence-utils.js';
import {buildScheduleChange,applyTaskListCommand} from '../../task-list-model.js';
const controllerSource=(await readFile(new URL('../../schedule-change-controller.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
const source=(await readFile(new URL('../../schedule-interactions.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
export function fixture({occurrence=false,allowCompleted=false}={}){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div class="ks-day-column" data-date="2026-10-16"><div class="ks-day-grid"><button class="ks-task-block" data-task-id="t">Task</button></div></div></section></body></html>');Object.defineProperty(document,'readyState',{value:'loading'});
 let owner='one',plan='plan',top=0,saves=0;const task={id:'t',title:'Revision',date:'2026-10-16',startTime:'10:00',endTime:'11:00'},boards=[{id:'b',sections:[{id:'s',tasks:[task]}]}];
 const root=document.querySelector('section'),grid=document.querySelector('.ks-day-grid'),block=document.querySelector('button');grid.getBoundingClientRect=()=>({top,height:1440});document.elementFromPoint=()=>grid;
 if(occurrence){task.recurrence=recurrence.normalizeRecurrence({enabled:true,frequency:'daily',interval:1,startDate:'2026-10-16',mode:'fixed'});delete block.dataset.taskId;block.dataset.occurrenceId='t::2026-10-16';block.dataset.seriesId='t';block.dataset.occurrenceDate='2026-10-16'}
 window.__kairosScheduleInteractionsBooted=false;window.__kairosScheduleBridge={getAllowCompletedReschedule:()=>allowCompleted,getBoards:()=>boards,getOwnerId:()=>owner,getPlanId:()=>plan,getTimeFormat:()=> '24',persistPlan:async()=>{saves++},commitScheduleCommand:async(command,expected)=>{const applied=applyTaskListCommand({boards},command,expected,{allowCompleted});saves++;if(occurrence)boards.splice(0,boards.length,...applied.next.boards);else Object.assign(task,applied.next.boards[0].sections[0].tasks[0]);return {...applied.result,scheduleUndo:{...applied.result.scheduleUndo,expiresAt:Date.now()+10000}}}};window.__kairosScheduleWorkspace={render(){}};
 const context=vm.createContext({document,window,MutationObserver:window.MutationObserver,...utils,...recurrence,buildScheduleChange,console,structuredClone,crypto:globalThis.crypto,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});vm.runInContext(controllerSource+'\n'+source,context);context.boot();
 const pointer=(type,target,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:20,clientY:660,...props});target.dispatchEvent(event);return event};
 return {document,window,context,root,grid,block,task,pointer,boards,grip:block.querySelector('[data-resize-handle]'),saves:()=>saves,setOwner:v=>owner=v,setPlan:v=>plan=v,scroll:v=>top=v,dragging:()=>vm.runInContext('!!interaction',context)};
}
