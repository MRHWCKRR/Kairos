import {applyAiTaskMutation} from '../../ai-task-commands.js';
import {mountTodayView} from '../../today-view.js';
import {mountTaskCapture} from '../../task-capture.js';
import {createMutationSession} from '../../mutation-session.js';
import {applyTaskListCommand} from '../../task-list-model.js';
import {archiveMarkup,buildRestoreCommand} from '../../planner-archive.js';
import {plannerChanges,undoPlannerChanges,plannerChangeRows} from '../../planner-changes.js';
import {createPlannerBackup} from '../../planner-backup.js';
import {mountAiUndo} from '../../ai-undo-view.js';
import {runSharedSaveJourney} from './shared-save-journey.mjs';

const identity={ownerId:'browser-test',planId:'fixture'},today='2026-10-25';
const seed=()=>({boards:[{id:'b',title:'School',archived:false,sections:[{id:'s',title:'This week',archived:false,tasks:[
 {id:'essay',title:'Finish the English draft',date:null,dueDate:'2026-10-24',completed:false,archived:false},
 {id:'science',title:'Science revision',date:today,startTime:'13:00',endTime:'13:45',completed:false,archived:false},
 {id:'maths',title:'Check the garden calculations',date:null,completed:false,archived:false}
]}]}],dayInsights:{},scheduleEvents:[{id:'ride',title:'Afternoon ride',day:0,start:'16:30',end:'17:45'}]});
let data=seed(),lost=false,undoRecord=null,operations=new Map(),serial=0,view,capture;
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const commit=async(command,expected,id)=>{
 let result=operations.get(id.operationId);
 if(!result){
  if(command.type==='action_undo'){data=undoPlannerChanges(data,undoRecord.changes);result={type:'action_undo'};undoRecord=null;}
  else {const applied=applyTaskListCommand(data,command,expected);data=applied.next;result={...applied.result,...(command.type==='create_task'?{createdTask:structuredClone(applied.result.task)}:{})};}
  operations.set(id.operationId,result);
 }
 if(lost){lost=false;throw Error('Simulated lost acknowledgement');}
 view?.sync();document.querySelector('#archive').innerHTML=archiveMarkup(data).html;return result;
};
const session=createMutationSession({getIdentity:()=>identity,storage,uuid:()=>String(++serial),commit});
capture=mountTaskCapture({getIdentity:()=>identity,getState:()=>data,getDefaults:()=>({boardId:'b',sectionId:'s',date:today}),storage,commit,confirmClear:async()=>true});
view=mountTodayView({root:document.querySelector('#today'),getState:()=>data,getIdentity:()=>identity,getToday:()=>today,session,onCapture:context=>capture.open(context),onOpen:row=>{document.querySelector('#opened').textContent='Opened '+row.title;}});
mountAiUndo({root:document.querySelector('#ai-undo'),getIdentity:()=>identity,session,loadPreview:async()=>{
 if(!undoRecord)throw Error('There is no AI change to undo.');
 const after=undoPlannerChanges(data,undoRecord.changes);
 return {command:{type:'action_undo',sourceOperationId:undoRecord.id},expected:{sourceOperationId:undoRecord.id},rows:plannerChangeRows(data,after)};
}});
const check=(condition,message)=>{if(!condition)throw Error(message);};
const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for UI save.');};
const field=(name,value)=>{const el=document.querySelector('dialog [name="'+name+'"]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
async function run(){
 const status=document.querySelector('#browser-test-result');status.dataset.result='running';status.textContent='Checking planner workflows…';
 try{
  check(document.querySelectorAll('[data-today-row]').length===4,'Today must show overdue, scheduled, weekly event and unscheduled work.');
  document.querySelector('[data-today-capture]').click();check(document.querySelector('dialog[open]'),'Quick Add should open a native dialog.');
  field('title','Browser capture task');document.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>data.boards[0].sections[0].tasks.some(t=>t.title==='Browser capture task'));
  await wait(()=>document.querySelector('[data-capture-status]').textContent==='Task created.');
  document.querySelector('[data-capture-close]').click();
  const created=data.boards[0].sections[0].tasks.find(t=>t.title==='Browser capture task');check(created.date===today,'Contextual capture must default to today.');
  lost=true;
  const complete=[...document.querySelectorAll('[data-today-action="complete"]')].find(b=>b.closest('li').textContent.includes('Browser capture task'));complete.click();
  await wait(()=>session.state().pending&&!session.state().busy);check(session.state().message.includes('Retry'),'Interrupted saves must offer a retry.');
  document.querySelector('[data-mutation-retry]').click();await wait(()=>!session.state().pending);check(data.boards[0].sections[0].tasks.filter(t=>t.id===created.id).length===1,'Retry must not duplicate tasks.');
  check(data.boards[0].sections[0].tasks.find(t=>t.id===created.id).completed,'Completion must survive retry.');
  await session.run({type:'archive_task',target:{taskId:'maths'},value:true},{boardId:'b',sectionId:'s',value:false});
  check(archiveMarkup(data).count===1,'Archive must retain deleted work.');
  const restore=buildRestoreCommand(data,{kind:'task',taskId:'maths'});await session.run(restore.command,restore.expected);
  check(!data.boards[0].sections[0].tasks.find(t=>t.id==='maths').archived,'Restore must recover the same task.');
  data=applyAiTaskMutation(data,{type:'update_task',args:{newTitle:'Reviewed science revision',startTime:'14:00'},target:{taskId:'science'}}).next;
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='science').endTime==='14:45','An AI move must preserve duration.');
  data=applyAiTaskMutation(data,{type:'resize_task',args:{durationMinutes:60},target:{taskId:'science'}},{allowDurationChange:true}).next;
  data.boards[0].sections[0].tasks.find(t=>t.id==='science').estimatedMinutes=20;
  data=applyAiTaskMutation(data,{type:'update_task',args:{date:null,startTime:null,endTime:null},target:{taskId:'science'}}).next;
  data=applyAiTaskMutation(data,{type:'update_task',args:{date:today,startTime:'14:00'},target:{taskId:'science'}}).next;
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='science').endTime==='15:00','Unscheduling and placing again must retain duration over an old estimate.');
  data=applyAiTaskMutation(data,{type:'set_task_reminder',args:{minutesBefore:15},target:{taskId:'science'}}).next;
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='science').endTime==='15:00','Explicit resize must update the end time.');
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='science').reminderMinutes===15,'AI reminder edits must use the shared field.');
  const before=structuredClone(data);data=applyAiTaskMutation(data,{type:'update_task',args:{date:today},target:{taskId:'maths'}}).next;undoRecord={id:'ai-change',changes:plannerChanges(before,data)};
  document.querySelector('[data-ai-undo-open]').click();await wait(()=>document.querySelector('.ai-undo-dialog').hasAttribute('open'));
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='maths').date===today,'Undo must wait for review.');
  document.querySelector('[data-ai-undo-apply]').click();await wait(()=>!document.querySelector('.ai-undo-dialog').hasAttribute('open'));
  check(data.boards[0].sections[0].tasks.find(t=>t.id==='maths').date===null,'Reviewed Undo must restore the date.');
  const backup=createPlannerBackup({...identity,plan:data});check(backup.schemaVersion===1&&backup.planner.boards.length===1,'Backup must include versioned planner data.');
  await runSharedSaveJourney(check);
  data=seed();view.sync();status.dataset.result='passed';status.textContent='Passed: Quick Add → Today → interrupted save → retry → Archive → restore → reviewed Undo → backup.';
 }catch(error){status.dataset.result='failed';status.textContent='Failed: '+error.message;console.error(error);}
}
document.querySelector('[data-run-browser-test]').addEventListener('click',()=>void run());
document.querySelector('#archive').innerHTML=archiveMarkup(data).html;
if(new URL(location.href).searchParams.has('autorun'))void run();

