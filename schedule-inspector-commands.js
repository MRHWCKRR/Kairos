import {stableStringify} from './plan-merge.js?v=1';
import {normalizeRecurrence,validateRecurrence,generateTaskOccurrences,projectStoredOccurrence,setOccurrenceStatus,splitRecurringSeries} from './recurrence-utils.js?v=14';
import {applyRecurringEdit} from './recurrence-edit.js?v=5';
import {assertCompletedScheduleChanges} from './schedule-policy.js?v=4';
import {taskDurationMinutes} from './schedule-utils.js?v=5';
const metadata=['title','notes','dueDate','estimatedMinutes','priority','color'];
const schedule=['date','startTime','endTime','durationMinutes'];
const ruleKeys=['enabled','frequency','interval','weekdays','monthlyMode','monthDay','weekdayPosition','weekday','month','startDate','endType','endDate','count','mode','exceptions'];
const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const idValid=value=>typeof value==='string'&&value.trim()&&value.length<=160;
function occurrence(task,date){
 if(!dateValid(date)||!task.recurrence?.enabled)throw Error('Invalid recurring occurrence date.');
 const status=task.recurrence.exceptions?.[date]?.status;
 const item=['completed','skipped'].includes(status)?projectStoredOccurrence(task,date):generateTaskOccurrences(task,date,date,{today:date})[0];
 if(!item||item.status==='deleted')throw Error('This recurring occurrence is missing or changed.');return item;
}
function validate(command,entry,{values,apply}){
 if(!command||Object.keys(command).some(key=>!['type','target','action','status','timestamp','scope','changes','recurrence','newTaskId'].includes(key))||command.type!=='recurring_inspector'||Object.keys(command.target||{}).some(key=>!['taskId','occurrenceDate'].includes(key)))throw Error('Invalid recurring command.');
 const item=occurrence(entry.task,command.target.occurrenceDate);
 if(command.action==='status'){
  if(!['completed','skipped','pending'].includes(command.status)||typeof command.timestamp!=='string'||!Number.isFinite(Date.parse(command.timestamp))||(command.status==='pending'?!['completed','skipped'].includes(item.status):item.status!=='pending'))throw Error('The occurrence status changed or the timestamp is invalid.');
  if(['scope','changes','recurrence','newTaskId'].some(key=>Object.hasOwn(command,key)))throw Error('Invalid status fields.');return item;
 }
 if(!['edit','delete'].includes(command.action)||!['occurrence','future','series'].includes(command.scope))throw Error('Choose a valid recurrence action and scope.');
 if(command.action==='delete'){
  if(['changes','recurrence','newTaskId','status'].some(key=>Object.hasOwn(command,key))||typeof command.timestamp!=='string'||!Number.isFinite(Date.parse(command.timestamp)))throw Error('Invalid recurring deletion.');return item;
 }
 if(item.status!=='pending'&&command.scope!=='occurrence')throw Error('A completed or skipped occurrence can only be edited individually.');
 if(!command.changes||typeof command.changes!=='object'||Array.isArray(command.changes)||Object.keys(command.changes).some(key=>![...metadata,...schedule].includes(key)))throw Error('Unsupported recurring detail field.');
 if(command.scope==='future'&&(!idValid(command.newTaskId)||command.newTaskId===entry.task.id))throw Error('Choose a unique split task ID.');
 const changes=command.changes;
 for(const key of ['date','dueDate'])if(Object.hasOwn(changes,key)&&changes[key]!==null&&!dateValid(changes[key]))throw Error('Invalid date.');
 if(Object.hasOwn(changes,'estimatedMinutes')&&changes.estimatedMinutes!==null&&(!Number.isInteger(changes.estimatedMinutes)||changes.estimatedMinutes<1||changes.estimatedMinutes>=1440))throw Error('Invalid estimate.');
 // Reuse the normal detail validator for text, color, priority and time values.
 const ordinary={...structuredClone(item.task),recurrence:null,completed:false,id:'validation',date:item.displayDate,startTime:item.startTime,endTime:item.endTime};
 const fields=values(ordinary),detail=Object.fromEntries(Object.entries(changes).filter(([key])=>key!=='endTime'&&key!=='estimatedMinutes'));
 const checked=apply({boards:[{id:'b',sections:[{id:'s',tasks:[ordinary]}]}]},{type:'edit_task',target:{taskId:'validation'},changes:detail},{boardId:'b',sectionId:'s',fields}).next.boards[0].sections[0].tasks[0];
 if(Object.hasOwn(changes,'endTime')&&changes.endTime!==checked.endTime)throw Error('The recurring end time must match its duration.');
 const rule=command.recurrence;
 if(rule!==undefined&&(rule===null||typeof rule!=='object'||Array.isArray(rule)||Object.keys(rule).some(key=>!ruleKeys.includes(key))||rule.enabled!==true||!validateRecurrence(rule)))throw Error('Invalid repeat rule.');
 const effective=rule||entry.task.recurrence;if(effective.mode==='fixed'&&!checked.startTime)throw Error('Fixed recurring tasks need a start time.');
 return item;
}
function guard(entry,command){
 const task=entry.task,date=command.target.occurrenceDate,item=occurrence(task,date),rule=normalizeRecurrence(task);delete rule.exceptions;
 if(command.action==='delete')return stableStringify({task});
 if(command.action==='status')return stableStringify({rule,status:item.status});
 const keys=Object.keys(command.changes),values=Object.fromEntries(keys.map(key=>[key,key==='date'?item.displayDate:key==='startTime'?item.startTime:key==='endTime'?item.endTime:key==='durationMinutes'?item.durationMinutes:item.task[key]??null]));
 // A time change depends on the complete interval even when only one input changed.
 if(keys.some(key=>schedule.includes(key)))values.schedule={date:item.displayDate,startTime:item.startTime,endTime:item.endTime,durationMinutes:item.durationMinutes};
 if(command.scope!=='occurrence'){
  values.template=Object.fromEntries(keys.map(key=>[key,key==='durationMinutes'?taskDurationMinutes(task):task[key]??null]));
  values.exceptions=task.recurrence.exceptions||{};
  // Focus/progress is independent of a template edit and must survive transactions.
  values.exceptions=Object.fromEntries(Object.entries(values.exceptions).map(([date,value])=>[date,Object.fromEntries(Object.entries(value).filter(([key])=>!['focusLoggedSeconds','remainingMinutes'].includes(key)))]).filter(([,value])=>Object.keys(value).length));
 }
 return stableStringify({rule,status:item.status,values});
}
export function buildRecurringInspectorCommand(state,target,intent,helpers){
 const entry=helpers.resolve(state,target.taskId),command={type:'recurring_inspector',target:structuredClone(target),...structuredClone(intent)};
 validate(command,entry,helpers);if(command.newTaskId&&(state.boards||[]).some(b=>(b.sections||[]).some(s=>(s.tasks||[]).some(t=>t.id===command.newTaskId))))throw Error('This split task ID already exists.');
 return {command,expected:{boardId:entry.board.id,sectionId:entry.section.id,guard:guard(entry,command)}};
}
export function applyRecurringInspectorCommand(state,command,expected,{allowCompleted=false,...helpers}={}){
 const entry=helpers.resolve(state,command.target?.taskId);validate(command,entry,helpers);
 if(entry.board.id!==expected?.boardId||entry.section.id!==expected?.sectionId||guard(entry,command)!==expected?.guard)throw Error('This recurring task moved or its affected fields changed. Review the current occurrence.');
 if(command.newTaskId&&(state.boards||[]).some(b=>(b.sections||[]).some(s=>(s.tasks||[]).some(t=>t.id===command.newTaskId))))throw Error('This split task ID already exists.');
 const next=structuredClone(state),found=helpers.resolve(next,command.target.taskId),date=command.target.occurrenceDate;
 let updated;
 if(command.action==='status')updated=[setOccurrenceStatus(found.task,date,command.status,command.timestamp)];
 else if(command.action==='edit')updated=applyRecurringEdit(found.task,date,command);
 else if(command.scope==='occurrence')updated=[setOccurrenceStatus(found.task,date,'deleted',command.timestamp)];
 else if(command.scope==='future')updated=[splitRecurringSeries(found.task,date,{},'unused').originalTask];
 else updated=[];
 found.section.tasks.splice(found.section.tasks.indexOf(found.task),1,...updated);
 assertCompletedScheduleChanges(state,next,allowCompleted);
 return {next,result:{type:'recurring_inspector',action:command.action,taskId:command.target.taskId,...(command.newTaskId?{splitTaskId:command.newTaskId}:{})}};
}
export function buildInspectorDelete(state,taskId,{resolve}){const entry=resolve(state,taskId);return {command:{type:'delete_task',target:{taskId}},expected:{boardId:entry.board.id,sectionId:entry.section.id,task:structuredClone(entry.task)}}}
export function applyInspectorDelete(state,command,expected,{resolve}){
 if(Object.keys(command).some(key=>!['type','target'].includes(key))||Object.keys(command.target||{}).some(key=>key!=='taskId'))throw Error('Invalid task deletion.');
 const next=structuredClone(state),entry=resolve(next,command.target?.taskId);
 if(entry.board.id!==expected?.boardId||entry.section.id!==expected?.sectionId||stableStringify(entry.task)!==stableStringify(expected?.task))throw Error('This task moved or changed. Review it before deleting.');
 entry.section.tasks.splice(entry.section.tasks.indexOf(entry.task),1);return {next,result:{type:'delete_task',taskId:command.target.taskId}};
}

