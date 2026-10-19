import {stableStringify} from './plan-merge.js';
import {planningTasks,validPlanningDate,shiftPlanningDate} from './planning-model.js?v=1';
import {planningOccupancy,intervalsOverlap} from './planning-slots.js?v=4';
import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {zonedTaskStart} from './task-reminders.js?v=3';
import {validateAssignmentOrderChanges} from './assignment-order.js?v=1';

const FIELDS=['date','startTime','endTime','lastScheduledMinutes','estimatedMinutes','remainingMinutes','archived','sessionOrder'];
const GUARDS=[...FIELDS,'dueDate','assignmentId','sessionIndex','scheduleLocked','schedulingPreference'];
const all=state=>(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).map(task=>({board,section,task}))));
const guard=task=>stableStringify({...Object.fromEntries(GUARDS.filter(key=>task[key]!==undefined).map(key=>[key,task[key]])),archived:task.archived===true,recurring:task.recurrence?.enabled===true});
function locate(state,id){const found=all(state).filter(entry=>entry.task.id===id);if(found.length!==1||found[0].board.archived||found[0].section.archived)throw Error('An Undo target is missing, moved, archived or ambiguous.');return found[0]}
const location=entry=>({boardId:entry.board.id,sectionId:entry.section.id});
const members=(state,id)=>planningTasks(state).filter(entry=>entry.task.assignmentId===id).map(entry=>entry.task.id).sort();
const values=task=>({date:task.date||null,startTime:task.startTime||null,endTime:task.endTime||null,minutes:taskDurationMinutes(task),archived:task.archived===true,sessionOrder:task.sessionOrder||null});

// Store only the fields the planner changed. Content/completion never enters
// the inverse, and absence is retained separately from an explicit null.
export function capturePlanningUndo(before,after,command){
 try{
  const entries=[],parents=new Set(command.parentId?[command.parentId]:[]),ids=new Set([...command.rows.map(row=>row.taskId),...(command.archiveIds||[])]);
  if(command.parentId)ids.add(command.parentId);
  for(const id of ids){
   const current=locate(after,id),previous=all(before).find(entry=>entry.task.id===id),keys=previous?FIELDS.filter(key=>stableStringify(previous.task[key])!==stableStringify(current.task[key])):[];
   if(current.task.assignmentId)parents.add(current.task.assignmentId);
   if(!previous||keys.length)entries.push({id,...location(current),created:!previous,keys,before:previous?Object.fromEntries(keys.filter(key=>previous.task[key]!==undefined).map(key=>[key,structuredClone(previous.task[key])])):{},guard:guard(current.task)});
  }
  if(!entries.length)return null;
  const families=[...parents].filter(id=>all(after).some(entry=>entry.task.id===id)).map(id=>{const parent=locate(after,id);return {id,...location(parent),guard:guard(parent.task),members:members(after,id)}});
  const record={version:1,timezone:command.options.timezone||'UTC',entries,families};
  return entries.length<=81&&JSON.stringify(record).length<=48000?record:null;
 }catch{return null}
}
function checkEntry(state,entry){
 if(!entry||typeof entry.id!=='string'||typeof entry.guard!=='string')throw Error('Invalid saved planning Undo record.');
 const found=locate(state,entry.id);if(found.board.id!==entry.boardId||found.section.id!==entry.sectionId||guard(found.task)!==entry.guard)throw Error('Scheduling, locks, deadlines or task identity changed after this plan. Undo needs manual review.');return found;
}
function validateRestored(state,task,timezone){
 if(task.archived)return;
 if(!task.date){if(task.startTime)throw Error('The previous task time has no valid date. Review it manually.');return}
 if(!validPlanningDate(task.date))throw Error('The previous date needs manual review.');
 const parent=task.assignmentId?planningTasks(state).find(entry=>entry.task.id===task.assignmentId)?.task:null;
 for(const deadline of [task.dueDate,parent?.dueDate].filter(Boolean))if(!validPlanningDate(deadline)||task.date>deadline)throw Error('The previous placement would miss its current deadline.');
 if(!task.startTime)return;
 const start=parseTime(task.startTime),minutes=taskDurationMinutes(task);if(start===null||minutes>1440)throw Error('The previous time or duration needs manual review.');
 const end=start+minutes,endDate=shiftPlanningDate(task.date,Math.floor(end/1440)),first=zonedTaskStart(task.date,formatTime(start,false),timezone),last=zonedTaskStart(endDate,formatTime(end%1440,false),timezone);
 if(first===null||last===null||last-first!==minutes*60000)throw Error('The previous placement crosses an invalid timezone transition.');
 const parts=[{date:task.date,startMin:start,endMin:Math.min(1440,end)}];if(end>1440)parts.push({date:shiftPlanningDate(task.date,1),startMin:0,endMin:end-1440});
 for(const part of parts)if(planningOccupancy(state,part.date,part.date).some(item=>!(item.kind==='task'&&item.taskId===task.id)&&intervalsOverlap(item,part)))throw Error('The previous time conflicts with a current commitment. Review it manually.');
}
export function applyPlanningUndo(state,record){
 if(record?.version!==1||typeof record.timezone!=='string'||!Array.isArray(record.entries)||!record.entries.length||record.entries.length>81||!Array.isArray(record.families)||record.families.length>41||new Set(record.entries.map(entry=>entry?.id)).size!==record.entries.length)throw Error('This saved planning Undo record is unavailable or invalid.');
 new Intl.DateTimeFormat('en',{timeZone:record.timezone});
 for(const family of record.families){checkEntry(state,family);if(stableStringify(members(state,family.id))!==stableStringify(family.members))throw Error('Assignment session membership changed after this plan. Review it manually.');}
 for(const entry of record.entries){const found=checkEntry(state,entry);if(typeof entry.created!=='boolean'||!Array.isArray(entry.keys)||entry.keys.length>FIELDS.length||new Set(entry.keys).size!==entry.keys.length||entry.keys.some(key=>!FIELDS.includes(key))||!entry.before||typeof entry.before!=='object'||Array.isArray(entry.before)||Object.keys(entry.before).some(key=>!entry.keys.includes(key)))throw Error('Invalid scheduling fields in the saved Undo record.');if(entry.created&&found.task.completed)throw Error('A newly created session has since been completed. Review it manually instead of archiving it with Undo.');}
 const next=structuredClone(state),rows=[];
 for(const entry of record.entries){
  const task=locate(next,entry.id).task,from=values(task);
  if(entry.created)task.archived=true;
  else for(const key of entry.keys){if(Object.hasOwn(entry.before,key))task[key]=structuredClone(entry.before[key]);else delete task[key]}
  rows.push({taskId:entry.id,title:String(task.title||'Task'),action:entry.created?'Archive created session':entry.keys.every(key=>key==='sessionOrder')?'Restore assignment ordering':'Restore previous scheduling fields',from,to:values(task)});
 }
 for(const entry of record.entries)if(!entry.created)validateRestored(next,locate(next,entry.id).task,record.timezone);
 validateAssignmentOrderChanges(state,next);
 return {next,result:{type:'planning_undo',taskIds:record.entries.map(entry=>entry.id),completedTaskIds:[],affectedCount:record.entries.length},rows};
}
export function planningUndoSource(data,sourceOperationId=null){
 const receipts=Array.isArray(data.aiActionReceipts)?data.aiActionReceipts:[],latest=[...receipts].reverse().find(receipt=>receipt.result?.type==='planning_batch');
 if(!latest||sourceOperationId&&!receipts.some(receipt=>receipt.id===sourceOperationId))throw Error('Planning Undo history is no longer available. Older saved changes cannot be reconstructed safely.');
 if(sourceOperationId&&latest.id!==sourceOperationId)throw Error('A newer planning change exists. Review Undo for the latest change.');
 if(latest.planningUndoUsedBy)throw Error('The last planning change was already undone.');
 if(!latest.result.planningUndo)throw Error('Undo is not available for this saved planning change.');return latest;
}
export function planningUndoPreview(data,sourceOperationId=null,timezone){
 const source=planningUndoSource(data,sourceOperationId),record=source.result.planningUndo;
 if(timezone&&record.timezone!==timezone)throw Error('Your timezone changed after this plan. Review the previous placements manually.');
 const checked=applyPlanningUndo(data,record);
 return {command:{type:'planning_undo',sourceOperationId:source.id,options:{timezone:record.timezone}},expected:{sourceOperationId:source.id},rows:checked.rows,notice:'Undo restores only this plan\'s scheduling changes. Newly created sessions go to Archive. Notes, checklists, reminders and completion changes are preserved. Original dates, including past dates, are restored only when the current schedule is safe.'};
}
