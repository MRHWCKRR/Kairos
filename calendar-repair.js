import {calendarConflicts} from './calendar-conflicts.js?v=1';
import {planningClock,planningTasks,shiftPlanningDate,validPlanningDate} from './planning-model.js?v=1';
import {findPlanningSlot,planningPlacementOccupancy,planningDailyWork,planningOccupancy,intervalsOverlap,planningBlockValid} from './planning-slots.js?v=6';
import {planningSignature} from './planning-commands.js?v=11';
import {buildScheduleChange,applyScheduleChange,applyScheduleUndo} from './schedule-change-model.js?v=7';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=3';
import {projectStoredOccurrence} from './recurrence-utils.js?v=14';
import {stableStringify} from './plan-merge.js?v=1';
import {validateAssignmentOrderChanges,orderedSessionGroup,orderedPlacementClock} from './assignment-order.js?v=2';

// Completed work remains occupied even when its display is hidden.
function occupied(state){return {...state,boards:(state.boards||[]).map(b=>({...b,sections:(b.sections||[]).map(s=>({...s,tasks:(s.tasks||[]).map(t=>({...t,completed:false,...(t.recurrence?.enabled?{recurrence:{...t.recurrence,exceptions:Object.fromEntries(Object.entries(t.recurrence.exceptions||{}).map(([date,e])=>{const o=e.status==='completed'?projectStoredOccurrence(t,date):null;return [date,o?{...e,status:'pending',override:{...e.override,date:o.displayDate,startTime:o.startTime,endTime:o.endTime,durationMinutes:o.durationMinutes}}:e]}))}}:{})}))}))}))}}
function without(state,target){const copy=structuredClone(state),entry=planningTasks(copy).find(e=>e.task.id===target.taskId);if(!entry)throw Error('This task is unavailable.');if(target.occurrenceDate)entry.task.recurrence.exceptions={...entry.task.recurrence.exceptions,[target.occurrenceDate]:{status:'skipped'}};else entry.section.tasks=entry.section.tasks.filter(t=>t.id!==target.taskId);return copy;}
export function calendarRepairSignature(state){return stableStringify({schedule:planningSignature(state),sources:(state.calendarSources||[]).map(s=>({id:s.id,timezone:s.timezone}))});}
const same=(a,b)=>stableStringify(a)===stableStringify(b);
export function previewCalendarRepair(state,sourceId,keys,settings,now=Date.now()){
 if(!Array.isArray(keys)||!keys.length||keys.length>40||new Set(keys).size!==keys.length)throw Error('Choose 1 to 40 distinct conflicting tasks.');
 const clock={...planningClock(now,settings.timezone),timezone:settings.timezone},report=calendarConflicts(state,sourceId,clock),selected=keys.map(key=>report.find(row=>row.key===key));if(selected.some(row=>!row?.movable))throw Error('A selected conflict is no longer available to move. Review conflicts again.');
 const options={from:clock.date,to:shiftPlanningDate(clock.date,7),dayStart:'07:00',dayEnd:'22:00',timezone:settings.timezone,weeklyAvailability:settings.weeklyAvailability??null,gapMinutes:settings.gapMinutes??0,dailyLimitMinutes:settings.dailyLimitMinutes??0},rows=[],operations=[];let working=structuredClone(state);
 const remainingRows=selected.sort((a,b)=>String(a.task.dueDate||'9999').localeCompare(String(b.task.dueDate||'9999'))||a.key.localeCompare(b.key));
 while(remainingRows.length){
  const ready=remainingRows.findIndex(row=>{const group=row.task.assignmentId?orderedSessionGroup(working,row.task.assignmentId):null;return !group||!group.sessions.some(prior=>!prior.completed&&prior.sessionIndex<row.task.sessionIndex&&remainingRows.some(other=>other.target.taskId===prior.id));});
  if(ready<0)throw Error('Review the assignment prerequisite order.');const row=remainingRows.splice(ready,1)[0];
  const remaining=without(working,row.target),busy=planningPlacementOccupancy(occupied(remaining),options),parent=row.task.assignmentId?planningTasks(working).find(e=>e.task.id===row.task.assignmentId)?.task:null,dueDate=[row.task.dueDate,parent?.dueDate].filter(Boolean).sort()[0]||null;
  if([row.task.dueDate,parent?.dueDate].filter(Boolean).some(date=>!validPlanningDate(date)))throw Error('Review the task or assignment deadline.');
  const placement=findPlanningSlot(row.minutes,{...options,from:row.date,...(row.target.occurrenceDate?{to:row.date}:{}),dueDate,preference:row.task.schedulingPreference,assignmentWork:!!row.task.assignmentId,dailyWork:planningDailyWork(remaining,options)},busy,orderedPlacementClock(working,row.task,clock));
  if(!placement)throw Error('No safe time fits for "'+row.title+'". Nothing was moved. Review its deadline or saved hours.');
  const changes={...placement,...(row.target.occurrenceDate?{durationMinutes:row.minutes}:{lastScheduledMinutes:row.minutes})},operation=buildScheduleChange(working,row.target,changes),next=applyScheduleChange(working,operation.command,operation.expected).next;
  working=next;operations.push(operation);rows.push({key:row.key,target:row.target,title:row.title,from:{date:row.date,startTime:row.startTime,endTime:row.endTime},to:placement,minutes:row.minutes});
 }
 validateAssignmentOrderChanges(state,working);
 return {command:{type:'calendar_repair',sourceId,keys:[...keys],options,rows},expected:{signature:calendarRepairSignature(state)},rows,operations};
}
export function applyCalendarRepair(state,command,expected,{now=Date.now()}={}){
 if(command?.type!=='calendar_repair'||Object.keys(command).some(k=>!['type','sourceId','keys','options','rows'].includes(k))||expected?.signature!==calendarRepairSignature(state))throw Error('Your tasks or calendar changed. Review a new preview.');
 const fresh=previewCalendarRepair(state,command.sourceId,command.keys,command.options,now);if(!same(command,fresh.command))throw Error('Available time changed. Review a new preview.');
 let next=structuredClone(state);const records=[];for(const op of fresh.operations){const out=applyScheduleChange(next,op.command,op.expected);records.push(out.result.scheduleUndo);next=out.next;}
 return {next,result:{type:'calendar_repair',taskIds:fresh.rows.map(r=>r.target.taskId),affectedCount:fresh.rows.length,calendarRepairUndo:{version:1,timezone:command.options.timezone,records}}};
}
export function applyCalendarRepairUndo(state,record){
 if(record?.version!==1||!Array.isArray(record.records)||!record.records.length||record.records.length>40)throw Error('This repair Undo is unavailable.');
 let next=structuredClone(state);for(const entry of [...record.records].reverse())next=applyScheduleUndo(next,entry).next;
 for(const entry of record.records){
  const task=planningTasks(next).find(e=>e.task.id===entry.target.taskId)?.task;if(!task)throw Error('This task changed.');const o=entry.target.occurrenceDate?projectStoredOccurrence(task,entry.target.occurrenceDate):null,effective=o?{...o.task,date:o.displayDate,startTime:o.startTime}:task,start=parseTime(effective.startTime),minutes=o?.durationMinutes??taskDurationMinutes(effective);if(start===null||!effective.date)continue;
  const parent=task.assignmentId?planningTasks(next).find(e=>e.task.id===task.assignmentId)?.task:null;
  if([task.dueDate,parent?.dueDate].filter(Boolean).some(date=>!validPlanningDate(date)||effective.date>date))throw Error('Undo would miss a current deadline. Review the task manually.');
  if(!planningBlockValid(effective.date,start,minutes,record.timezone))throw Error('The previous placement is not safe in this timezone.');
  const other=occupied(without(next,entry.target)),parts=[{date:effective.date,startMin:start,endMin:Math.min(1440,start+minutes)}];if(start+minutes>1440)parts.push({date:shiftPlanningDate(effective.date,1),startMin:0,endMin:start+minutes-1440});
  if(parts.some(part=>planningOccupancy(other,part.date,part.date).some(item=>intervalsOverlap(item,part))))throw Error('Undo would restore a conflict with a current commitment. Review it manually.');
 }
 validateAssignmentOrderChanges(state,next);return {next,result:{type:'calendar_repair_undo',affectedCount:record.records.length}};
}
