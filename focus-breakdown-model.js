import {validFocusDate} from './occurrence-focus.js?v=2';
import {generateTaskOccurrences} from './recurrence-utils.js?v=14';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=6';
const seconds=task=>Number.isSafeInteger(task?.focusLoggedSeconds)&&task.focusLoggedSeconds>0?task.focusLoggedSeconds:0;
const sum=rows=>rows.reduce((total,row)=>total+row.loggedSeconds,0);
const sumMinutes=(rows,key)=>rows.some(row=>row[key]===null)?null:rows.reduce((total,row)=>total+row[key],0);
function estimate(task){
 if(Number.isFinite(task.estimatedMinutes)&&task.estimatedMinutes>0)return Math.round(task.estimatedMinutes);
 if(parseTime(task.startTime)!==null&&parseTime(task.endTime)!==null||Number.isFinite(task.lastScheduledMinutes)&&task.lastScheduledMinutes>0)return taskDurationMinutes(task);
 return null;
}
function effort(task,archived){
 const estimatedMinutes=archived?null:estimate(task);
 const remainingMinutes=archived?null:task.completed?0:Number.isInteger(task.remainingMinutes)&&task.remainingMinutes>=1&&task.remainingMinutes<=1440?task.remainingMinutes:estimatedMinutes;
 return {estimatedMinutes,remainingMinutes};
}
function comparison(row){return {...row,overEstimateSeconds:row.estimatedMinutes===null?null:Math.max(0,row.loggedSeconds-row.estimatedMinutes*60)}}

// Sum each stored ledger once. Assignment rollups are a separate view, never
// additional contributions to board/planner totals. History retention is irrelevant.
export function focusBreakdown(state={}){
 const all=(state.boards||[]).flatMap((board,boardIndex)=>(board.sections||[]).flatMap(section=>(section.tasks||[]).map(task=>({board,boardIndex,section,task}))));
 const counts=new Map();for(const {task}of all)counts.set(task.id,(counts.get(task.id)||0)+1);
 const unique=new Map(all.filter(e=>typeof e.task.id==='string'&&e.task.id&&counts.get(e.task.id)===1).map(e=>[e.task.id,e]));
 const children=new Map();
 for(const e of all){const parent=unique.get(e.task.assignmentId)?.task;if(unique.has(e.task.id)&&parent&&!parent.assignmentId&&!parent.recurrence?.enabled&&!e.task.recurrence?.enabled){if(!children.has(parent.id))children.set(parent.id,[]);children.get(parent.id).push(e.task.id)}}
 const tasks=all.map(({board,boardIndex,section,task},index)=>{
  const archived=!!(board.archived||section.archived||task.archived),openable=unique.has(task.id)&&!archived;
  const base={key:'task-'+index,taskId:task.id,boardKey:String(boardIndex),boardTitle:String(board.title||'Board'),sectionTitle:String(section.title||'Section'),title:String(task.title||'Task'),archived,openable,loggedSeconds:seconds(task),...effort(task,archived),kind:children.has(task.id)?'assignment-direct':children.has(task.assignmentId)?'session':'task'};
  if(children.has(task.id)){base.estimatedMinutes=null;base.remainingMinutes=null}
  if(!task.recurrence?.enabled)return comparison(base);
  const ledger=Object.entries(task.recurrence.exceptions||{}).filter(([date,value])=>validFocusDate(date)&&seconds(value)>0).sort(([a],[b])=>a.localeCompare(b));
  // Expand once per series rather than cloning/regenerating the rule per ledger date.
  const generated=new Map((ledger.length?generateTaskOccurrences(task,ledger[0][0],ledger.at(-1)[0],{today:ledger.at(-1)[0]}):[]).filter(item=>!['skipped','deleted'].includes(item.status)).map(item=>[item.occurrenceDate,item]));
  const occurrences=ledger.map(([date,value])=>{
   const occurrence=generated.get(date),duration=value?.override?.durationMinutes;
   const hasEstimate=occurrence&&(estimate(occurrence.task)!==null||Number.isFinite(duration)&&duration>0);
   const effective=occurrence?{...occurrence.task,estimatedMinutes:hasEstimate?occurrence.durationMinutes:null,completed:occurrence.status==='completed'}:null;
   return comparison({...base,key:base.key+'::'+date,kind:'occurrence',occurrenceDate:date,displayDate:occurrence?.displayDate||date,loggedSeconds:seconds(value),openable:openable&&!!occurrence,...(effective?effort(effective,archived):{estimatedMinutes:null,remainingMinutes:null})});
  });
  return {...base,kind:'series',estimatedMinutes:null,remainingMinutes:null,overEstimateSeconds:null,loggedSeconds:base.loggedSeconds+sum(occurrences),occurrences};
 });
 const byId=new Map(tasks.filter(row=>unique.has(row.taskId)).map(row=>[row.taskId,row]));
 const assignments=[...children].map(([parentId,ids])=>{const parent=byId.get(parentId),rows=ids.map(id=>byId.get(id)),active=rows.filter(row=>!row.archived);return comparison({...parent,key:'assignment-'+parent.key,kind:'assignment',loggedSeconds:parent.loggedSeconds+sum(rows),estimatedMinutes:parent.archived?null:sumMinutes(active,'estimatedMinutes'),remainingMinutes:parent.archived?null:sumMinutes(active,'remainingMinutes'),sessionCount:rows.length})});
 const boards=(state.boards||[]).map((board,index)=>{const rows=tasks.filter(row=>row.boardKey===String(index)),finite=rows.filter(row=>!row.archived&&!['series','assignment-direct'].includes(row.kind));return {key:String(index),title:String(board.title||'Board'),archived:!!board.archived,loggedSeconds:sum(rows),taskCount:rows.length,estimatedMinutes:sumMinutes(finite,'estimatedMinutes'),remainingMinutes:sumMinutes(finite,'remainingMinutes')}});
 return {tasks,assignments,boards,totalSeconds:sum(tasks)};
}
