import {parseTime,formatTime,taskDurationMinutes} from './schedule-utils.js';
import {projectStoredOccurrence,generateTaskOccurrences} from './recurrence-utils.js?v=14';
import {buildScheduleChange} from './schedule-change-model.js?v=4';
import {validPlanningDate} from './planning-model.js?v=1';

export function keyboardScheduleStep(value,key,resizing=false){
 if(!['ArrowUp','ArrowDown'].includes(key))throw Error('Use Up or Down to adjust a schedule.');
 if(!Number.isInteger(value.startMin)||!Number.isInteger(value.duration)||value.startMin<0||value.duration<1||value.startMin+value.duration>1440)throw Error('Review this task duration in its editor.');
 const delta=key==='ArrowUp'?-5:5;
 return resizing?{...value,duration:Math.max(1,Math.min(1440-value.startMin,value.duration+delta))}:{...value,startMin:Math.max(0,Math.min(1440-value.duration,value.startMin+delta))};
}
export function keyboardScheduleFields(value,target){
 return {date:value.date,startTime:formatTime(value.startMin,false),endTime:formatTime((value.startMin+value.duration)%1440,false),...(target.occurrenceDate?{durationMinutes:value.duration}:{lastScheduledMinutes:value.duration})};
}
export function readKeyboardSchedule(state,target,allowCompleted=false){
 const entries=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).filter(task=>String(task.id)===String(target.taskId)).map(task=>({board,section,task}))));
 if(entries.length!==1)throw Error('This task is missing or ambiguous.');
 const entry=entries[0];let task=entry.task,occurrenceDuration=null;
 if(entry.board.archived||entry.section.archived||task.archived)throw Error('This task is archived.');
 if(target.occurrenceDate){
  const occurrence=task.recurrence?.exceptions?.[target.occurrenceDate]?.status==='completed'?projectStoredOccurrence(task,target.occurrenceDate):generateTaskOccurrences(task,target.occurrenceDate,target.occurrenceDate)[0];
  if(!occurrence||!['pending',...(allowCompleted?['completed']:[])].includes(occurrence.status))throw Error('This occurrence changed or is completed.');
  task=occurrence.task;occurrenceDuration=occurrence.durationMinutes;
 }else if(task.recurrence?.enabled||task.completed&&!allowCompleted)throw Error('Completed task schedules are locked in settings.');
 const startMin=parseTime(task.startTime),duration=occurrenceDuration??taskDurationMinutes(task),value={date:task.date,startMin,duration};
 if(!validPlanningDate(value.date)||startMin===null||startMin+duration>1440)throw Error('Use task details to edit an unscheduled or overnight task.');
 const expected=buildScheduleChange(state,target,keyboardScheduleFields(value,target),{allowCompleted}).expected;
 return {value,expected,title:String(task.title||'Task')};
}
