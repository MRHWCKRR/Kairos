import {validPlanningDate,shiftPlanningDate} from './planning-model.js?v=1';
import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=4';

export function taskOverdueState(task,clock,duration=taskDurationMinutes(task)){
 if(!task||task.completed||task.archived)return null;
 if(validPlanningDate(task.dueDate)&&task.dueDate<clock.date)return 'deadline';
 if(!validPlanningDate(task.date))return null;
 const start=parseTime(task.startTime);
 if(start===null)return task.date<clock.date?'date':null;
 const end=start+duration,endDate=shiftPlanningDate(task.date,Math.floor(end/1440));
 return endDate<clock.date||endDate===clock.date&&end%1440<=parseTime(clock.time)?'schedule':null;
}

export function scheduleBacklogItems(entries,occurrences,clock){
 const items=[];
 for(const entry of entries){
  const {task}=entry;if(task.recurrence?.enabled||task.completed||task.archived)continue;
  const overdueReason=taskOverdueState(task,clock);
  if(overdueReason||!validPlanningDate(task.date)||parseTime(task.startTime)===null)items.push({kind:'task',...entry,overdueReason});
 }
 for(const occurrence of occurrences){
  if(occurrence.status!=='pending')continue;
  const task={...occurrence.task,date:occurrence.displayDate},overdueReason=taskOverdueState(task,clock,occurrence.durationMinutes);
  if(overdueReason||occurrence.mode==='flexible'&&parseTime(occurrence.startTime??task.startTime)===null)items.push({kind:'occurrence',task,board:occurrence.board,section:occurrence.section,occurrence,overdueReason});
 }
 return items.sort((a,b)=>Number(!!b.overdueReason)-Number(!!a.overdueReason)||(a.overdueReason?String(a.overdueReason==='deadline'?a.task.dueDate:a.task.date).localeCompare(String(b.overdueReason==='deadline'?b.task.dueDate:b.task.date)):0));
}
