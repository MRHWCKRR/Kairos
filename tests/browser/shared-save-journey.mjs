import {createMutationSession} from '../../mutation-session.js';
import {applyTaskListCommand,buildRecurringInspectorCommand,taskDetailValues} from '../../task-list-model.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../../recurrence-utils.js';

// Isolated browser adapter; real receipt enforcement has separate persistence tests.
export async function runSharedSaveJourney(check){
 const date='2026-10-02',memory=new Map(),receipts=new Map(),outcomes=[];
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 let actor={ownerId:'one',planId:'plan'},lost=true,writes=0,release,arrived;
 let data={boards:[{id:'b',sections:[{id:'s',tasks:[{id:'series',title:'Read',date:'2026-10-01',startTime:'10:00',endTime:'11:00',recurrence:normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-10-01',mode:'fixed',endType:'count',count:4,exceptions:{'2026-10-03':{status:'completed',completedAt:'keep',focusLoggedSeconds:60}}})}]}]}]};
 const commit=async(command,expected,identity)=>{
  let result=receipts.get(identity.operationId);
  if(!result){const applied=applyTaskListCommand(data,command,expected);data=applied.next;result=applied.result;receipts.set(identity.operationId,result);writes++;}
  if(lost){lost=false;throw Error('Simulated lost acknowledgement');}
  if(arrived){arrived();await new Promise(resolve=>release=resolve);}
  return result;
 };
 const make=()=>createMutationSession({getIdentity:()=>actor,storage,commit,onResolve:(...args)=>outcomes.push(args)});
 let session=make();
 const split=buildRecurringInspectorCommand(data,{taskId:'series',occurrenceDate:date},{action:'edit',scope:'future',changes:{title:'New reading'},newTaskId:'split'});
 const identity={...actor,operationId:'browser-split',createdAt:Date.now()};
 try{await session.submit(split.command,split.expected,identity);throw Error('Lost response must reject');}catch(error){check(error.message.includes('lost acknowledgement'),'Split must retain uncertainty');}
 check(session.state().pending&&writes===1,'Committed recurring split must remain recoverable');
 data.boards[0].sections[0].tasks[0].notes='Remote notes';session.dispose();session=make();await session.retry();
 const tasks=data.boards[0].sections[0].tasks;
 check(writes===1&&tasks.length===2&&!session.state().pending,'Reload retry must not split a series twice');
 check(tasks[0].notes==='Remote notes'&&tasks[0].recurrence.exceptions['2026-10-03'].focusLoggedSeconds===60,'Retry must retain remote content and completed progress');
 check(generateTaskOccurrences(tasks[1],date,'2026-10-10').filter(o=>o.status!=='deleted').length===2,'Split must preserve finite remaining occurrences');
 const command={type:'edit_task',target:{taskId:'split'},changes:{notes:'Inspector note'}},expected={boardId:'b',sectionId:'s',fields:{notes:taskDetailValues(tasks[1]).notes}};
 const applied=new Promise(resolve=>arrived=resolve),saving=session.submit(command,expected,{...actor,operationId:'browser-delayed',createdAt:Date.now()});
 await applied;const resolvedBefore=outcomes.length;actor={ownerId:'two',planId:'other'};session.sync();release();
 try{await saving;throw Error('Old account acknowledgement must reject');}catch(error){check(/account|planner/.test(error.message),'Old acknowledgement must be scoped');}
 check(!session.state().pending&&outcomes.length===resolvedBefore,'Late success must not publish into the new account');
 actor={ownerId:'one',planId:'plan'};arrived=null;session.sync();await session.retry();
 check(writes===2&&!session.state().pending,'Returning to original account must reconcile its receipt once');
 session.dispose();return {writes,receipts:receipts.size};
}
